import { lookup } from 'node:dns/promises';
import type { Express,Request } from 'express';
import { z } from 'zod';
import type { KanvasService } from './domain.js';
import { hash,type AuthPrincipal } from './auth.js';
import { AppError,now } from './store.js';
import { isPublicMonitoringAddress,publicMonitoringUrl,pinnedMonitoringRequest,type PinnedMonitoringResponse } from './monitoring.js';
import { validateMedia } from './rendering/media.js';

type Reply=Pick<PinnedMonitoringResponse,'statusCode'|'headers'|'body'>;
export interface PublicImageOptions {request?:(url:URL,signal:AbortSignal)=>Promise<Reply>}
interface ImageRecord {id:string;sessionId:string;displayId:string;revision:number;source:string;host:string;mimeType:string;bytes:number;createdAt:string;expiresAt:number;converted:boolean}
interface ImageDiagnostic {id:string;sessionId:string;displayId:string;revision:number;host:string;reason:string;at:string}
const header=(r:Reply,k:string)=>String(r.headers[k]??'');
function contains(value:unknown,url:string):boolean {if(typeof value==='string')return value===url;if(!value||typeof value!=='object')return false;return Object.values(value).some(x=>contains(x,url));}
export class PublicImages {
  private active=0;private pending=new Map<string,Promise<unknown>>();private recent=new Map<string,number[]>();
  constructor(readonly service:KanvasService,readonly options:PublicImageOptions={}){}
  private async target(p:AuthPrincipal,sessionId:string,displayId:string,revision:number,url:string){const d=(await this.service.display(p,sessionId,displayId));this.service.assertRevision(revision,d.revision);if(!contains(d.view?.data,url))throw new AppError('NOT_FOUND','This image is not referenced by the current display.',404);return publicMonitoringUrl(url);}
  private async request(url:URL,signal:AbortSignal){if(this.options.request)return this.options.request(url,signal);const addresses=await lookup(url.hostname,{all:true,verbatim:true});if(!addresses.length)throw new Error('DNS_UNAVAILABLE');if(addresses.some(a=>!isPublicMonitoringAddress(a.address)))throw new Error('PRIVATE_ADDRESS_BLOCKED');return pinnedMonitoringRequest({url,address:{address:addresses[0].address,family:addresses[0].family as 4|6},signal,maxBytes:10*1024*1024,headersOnly:false,accept:'image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml'});}
  async recover(p:AuthPrincipal,sessionId:string,displayId:string,raw:unknown){const a=z.object({expectedRevision:z.number().int().nonnegative(),url:z.string().max(2048)}).strict().parse(raw),url=(await this.target(p,sessionId,displayId,a.expectedRevision,a.url)),key=hash(`${sessionId}:${displayId}:${a.expectedRevision}:${a.url}`),cached=(await this.service.store.get<ImageRecord>('public-image',key));
    if(cached&&cached.expiresAt>Date.now())return this.result(cached);
    if(this.pending.has(key)){await this.pending.get(key);(await this.target(p,sessionId,displayId,a.expectedRevision,a.url));const result=(await this.service.store.get<ImageRecord>('public-image',key));if(result)return this.result(result);}
    if(this.active>=4)throw new AppError('IMAGE_BUSY','Image recovery is busy. Refresh to try again.',429);
    const times=(this.recent.get(p.userId)??[]).filter(t=>Date.now()-t<60_000);if(times.length>=32)throw new AppError('RATE_LIMIT','Image recovery rate limit reached.',429);for(const [k,t] of this.recent)if(!t.some(v=>Date.now()-v<60_000))this.recent.delete(k);this.recent.set(p.userId,[...times,Date.now()]);
    const work=this.fetch(p,sessionId,displayId,a.expectedRevision,url,key,a.url);this.pending.set(key,work);try{return await work;}finally{this.pending.delete(key);}
  }
  async clientFailure(p:AuthPrincipal,sessionId:string,displayId:string,raw:unknown){
    const a=z.object({expectedRevision:z.number().int().nonnegative(),url:z.string().max(2048),reason:z.enum(['CLIENT_IMAGE_LOAD_FAILED','CLIENT_IMAGE_DECODE_FAILED','HTTP_401','HTTP_403','HTTP_404','HTTP_410','HTTP_500'])}).strict().parse(raw);
    const d=await this.service.display(p,sessionId,displayId);this.service.assertRevision(a.expectedRevision,d.revision);
    if(!contains(d.view?.data,a.url))throw new AppError('NOT_FOUND','Image is not referenced by this display.',404);
    const host=a.url.startsWith('/api/')?'protected-media':new URL(a.url).hostname;
    const key=hash(`${sessionId}:${displayId}:${a.expectedRevision}:${a.url}`);
    await this.service.store.put('image-diagnostic',{id:key,sessionId,displayId,revision:a.expectedRevision,host,reason:a.reason,at:now()} satisfies ImageDiagnostic);
    return {recorded:true};
  }
  private result(r:ImageRecord){return {status:'available',imageUrl:`/api/sessions/${r.sessionId}/displays/${r.displayId}/image-fallback/${r.id}`,host:r.host,converted:r.converted,...(r.converted?{note:'Anonymous SVG raster preview. Original source is retained.'}:{})};}
  private async fetch(p:AuthPrincipal,sessionId:string,displayId:string,revision:number,source:URL,key:string,sourceText:string){this.active++;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);let reason='NETWORK_UNAVAILABLE';
    try{let url=source,response:Reply|undefined;for(let hop=0;hop<5;hop++){response=await this.request(url,controller.signal);if(response.statusCode>=300&&response.statusCode<400){url=publicMonitoringUrl(new URL(header(response,'location'),url).href);continue;}break;}
      if(!response||response.statusCode<200||response.statusCode>=300){reason=response?`HTTP_${response.statusCode}`:'NETWORK_UNAVAILABLE';throw new Error(reason);}
      const mime=header(response,'content-type').split(';')[0].trim().toLowerCase();let bytes=response.body,type=mime,converted=false;
      if(mime==='image/svg+xml'){reason='SVG_DECODE_FAILED';bytes=await this.rasterize(bytes,controller.signal);type='image/png';converted=true;}
      else if(!['image/png','image/jpeg','image/webp','image/gif','image/avif'].includes(mime)){reason='NOT_AN_IMAGE';throw new Error(reason);}
      reason='INVALID_IMAGE_BYTES';const valid=validateMedia({name:'source-image',mimeType:type,base64:bytes.toString('base64')});(await this.target(p,sessionId,displayId,revision,sourceText));if(controller.signal.aborted)throw new Error('TIMEOUT');
      const record:ImageRecord={id:key,sessionId,displayId,revision,source:sourceText,host:source.hostname,mimeType:valid.mimeType,bytes:bytes.length,createdAt:now(),expiresAt:Date.now()+30*60_000,converted};
      (await this.service.store.transaction(async ()=>{const old=(await this.service.store.list<ImageRecord>('public-image')).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));let total=old.reduce((n,x)=>n+x.bytes,0)+bytes.length;for(const entry of old)if(entry.expiresAt<Date.now()||total>64*1024*1024){(await this.service.store.delete('public-image',entry.id));(await this.service.store.db.prepare('DELETE FROM assets WHERE id=?').run(entry.id));total-=entry.bytes;}(await this.service.store.db.prepare('INSERT INTO assets(id,bytes) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET bytes=excluded.bytes').run(key,bytes));(await this.service.store.put('public-image',record));(await this.service.store.delete('image-diagnostic',key));}));return this.result(record);
    }catch(error){const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';if(controller.signal.aborted)reason='TIMEOUT';else if(['ENOTFOUND','EAI_AGAIN'].includes(code))reason='DNS_UNAVAILABLE';else if(error instanceof Error&&error.message==='PRIVATE_ADDRESS_BLOCKED')reason='PRIVATE_ADDRESS_BLOCKED';
      // No query strings, cookies, headers, response bodies or stack traces.
      (await this.target(p,sessionId,displayId,revision,sourceText));(await this.service.store.put('image-diagnostic',{id:key,sessionId,displayId,revision,host:source.hostname,reason,at:now()} satisfies ImageDiagnostic));
      return {status:'unavailable',host:source.hostname,reason,message:`${source.hostname}: ${reason}. The original image is retained; supply a working public image or import supported image bytes.`};
    }finally{clearTimeout(timer);this.active--;}
  }
  private async rasterize(bytes:Buffer,signal:AbortSignal){if(bytes.length>2*1024*1024)throw new Error('SVG_TOO_LARGE');const {chromium}=await import('playwright'),browser=await chromium.launch({headless:true,timeout:6000});const stop=()=>void browser.close().catch(()=>{});signal.addEventListener('abort',stop,{once:true});try{const context=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block',viewport:{width:1200,height:900}});await context.route('**/*',route=>route.abort());await context.routeWebSocket('**/*',socket=>socket.close());const page=await context.newPage();await page.setContent(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>body{margin:0;background:transparent}img{display:block;max-width:2048px;max-height:2048px}</style><img alt="" src="data:image/svg+xml;base64,${bytes.toString('base64')}">`,{waitUntil:'load',timeout:6000});const dimensions=await page.locator('img').evaluate(e=>({w:(e as HTMLImageElement).naturalWidth,h:(e as HTMLImageElement).naturalHeight}));if(!dimensions.w||!dimensions.h||dimensions.w*dimensions.h>64_000_000||Math.max(dimensions.w,dimensions.h)>20_000)throw new Error('SVG_DIMENSIONS');return await page.locator('img').screenshot({type:'png',omitBackground:true,timeout:5000});}finally{signal.removeEventListener('abort',stop);await browser.close().catch(()=>{});}}
  async image(p:AuthPrincipal,sessionId:string,displayId:string,key:string){const record=(await this.service.store.get<ImageRecord>('public-image',key));if(!record||record.sessionId!==sessionId||record.displayId!==displayId||record.expiresAt<Date.now())throw new AppError('NOT_FOUND','This image preview expired.',404);(await this.target(p,sessionId,displayId,record.revision,record.source));const row=(await this.service.store.db.prepare('SELECT bytes FROM assets WHERE id=?').get(key)) as {bytes:Uint8Array}|undefined;if(!row)throw new AppError('NOT_FOUND','Image preview unavailable.',404);return {bytes:Buffer.from(row.bytes),mimeType:record.mimeType};}
}
export function mountPublicImages(app:Express,images:PublicImages,browser:(req:Request)=>Promise<Awaited<AuthPrincipal>>){const path='/api/sessions/:id/displays/:displayId/image-fallback';app.post('/api/sessions/:id/displays/:displayId/image-diagnostic',async(req,res)=>res.json({data:await images.clientFailure(await browser(req),String(req.params.id),String(req.params.displayId),req.body)}));app.post(path,async(req,res)=>res.json({data:await images.recover((await browser(req)),String(req.params.id),String(req.params.displayId),req.body)}));app.get(`${path}/:imageId`,async (req,res)=>{const result=(await images.image((await browser(req)),String(req.params.id),String(req.params.displayId),String(req.params.imageId)));res.set({'Cache-Control':'private, no-store','Content-Type':result.mimeType,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}).send(result.bytes);});}
