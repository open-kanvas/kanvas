import { lookup } from 'node:dns/promises';
import type { Express, Request } from 'express';
import type { Browser } from 'playwright';
import { z } from 'zod';
import { projectSelection } from '../shared/selection.js';
import type { IframeData } from '../shared/browsing-templates.js';
import { navigationLeaf } from '../shared/navigation.js';
import type { AuthPrincipal } from './auth.js';
import { hash } from './auth.js';
import type { KanvasService } from './domain.js';
import { AppError, id, now } from './store.js';
import { isPublicMonitoringAddress, publicMonitoringUrl, pinnedMonitoringRequest, type PinnedMonitoringResponse } from './monitoring.js';

type WebResponse=Pick<PinnedMonitoringResponse,'statusCode'|'headers'|'body'>;
export interface WebsitePreviewOptions {
  /** Host-owned test seams. Never read from tool or HTTP input. */
  request?:(url:URL,headersOnly:boolean,signal:AbortSignal)=>Promise<WebResponse>;
  screenshot?:(url:string,signal:AbortSignal,viewport?:'desktop'|'mobile')=>Promise<Buffer>;
}
const header=(headers:WebResponse['headers'],name:string)=>{const v=headers[name];return Array.isArray(v)?v.join(', '):v??'';};
function ancestorMatches(source:string,site:URL,parent:URL):boolean|undefined {
  if(source==="'none'")return false;
  if(source==='*')return true;
  if(source==="'self'")return site.origin===parent.origin;
  if(/^[a-z]+:$/i.test(source))return source===parent.protocol;
  try {const candidate=new URL(source.includes('://')?source:`${site.protocol}//${source}`),host=candidate.hostname;
    return candidate.protocol===parent.protocol&&(host.startsWith('*.')?parent.hostname.endsWith(host.slice(1)):host===parent.hostname)&&(candidate.port===''||candidate.port===parent.port);
  }catch{return undefined;}
}
/** Only enforced, observable framing policies trigger a static fallback. A
 * timeout, iframe load event or report-only header is not evidence of refusal. */
export function framingRefusal(headers:WebResponse['headers'],url:string,parentOrigin:string):'csp'|'x-frame-options'|undefined {
  const site=new URL(url),parent=new URL(parentOrigin),policies=header(headers,'content-security-policy').split(',');let hasAncestors=false;
  for(const policy of policies){const directive=policy.split(';').map(x=>x.trim()).find(x=>/^frame-ancestors(?:\s|$)/i.test(x));if(!directive)continue;hasAncestors=true;
    const sources=directive.split(/\s+/).slice(1),matches=sources.map(x=>ancestorMatches(x,site,parent));
    if(!matches.some(x=>x===true)&&!matches.some(x=>x===undefined))return 'csp';
  }
  // CSP frame-ancestors takes precedence over the legacy header in modern browsers.
  if(hasAncestors)return;
  const xfo=header(headers,'x-frame-options').toUpperCase().split(',').map(x=>x.trim());
  if(xfo.includes('DENY')||xfo.includes('SAMEORIGIN')&&site.origin!==parent.origin)return 'x-frame-options';
}

async function publicRequest(url:URL,headersOnly:boolean,signal:AbortSignal):Promise<WebResponse>{
  publicMonitoringUrl(url.href);
  const addresses=await lookup(url.hostname,{all:true,verbatim:true});
  if(!addresses.length||addresses.some(x=>!isPublicMonitoringAddress(x.address)))throw new Error('Address is not globally routable.');
  const chosen=addresses[0];
  return pinnedMonitoringRequest({url,address:{address:chosen.address,family:chosen.family as 4|6},signal,maxBytes:2*1024*1024,headersOnly,accept:'text/html,application/xhtml+xml,image/*,text/css,application/javascript;q=0.9,*/*;q=0.5'});
}

interface Capture {id:string;sessionId:string;displayId:string;revision:number;page:number;url:string;capturedAt:string;expiresAt:number;bytes:number}
type PreviewResult={status:'interactive'|'static'|'unavailable'|'pending';remoteContentVerified:false;reason?:string;capturedAt?:string;imageUrl?:string;title?:string;description?:string;previewImage?:string};
export class WebsitePreview {
  private active=0;
  private pending=new Map<string,Promise<PreviewResult>>();
  private recent=new Map<string,number[]>();
  private request:NonNullable<WebsitePreviewOptions['request']>;
  private probes=0;
  private framingPending=new Map<string,Promise<{result:PreviewResult;ttlMs:number}>>();
  private framingCache=new Map<string,{result:PreviewResult;expires:number}>();
  constructor(readonly service:KanvasService,readonly options:WebsitePreviewOptions={}){this.request=options.request??publicRequest;}
  private async target(p:AuthPrincipal,sessionId:string,displayId:string,revision:number,page:number){
    const d=(await this.service.display(p,sessionId,displayId));this.service.assertRevision(revision,d.revision);
    const raw=navigationLeaf(d.view),view=raw?projectSelection(raw).view:null;if(!view||!['website','iframe','bookmarks'].includes(view.template))throw new AppError('NOT_FOUND','This display is not showing a website collection.',404);
    const data=view.data as IframeData,selected=view.template==='bookmarks'?(view.data.items as Array<{url:string;viewport?:string}>)[page]:data.pages[page];
    if(!selected||data.screenshotFallback===false)throw new AppError('NOT_FOUND','Static fallback is not enabled for this page.',404);
    return selected.url;
  }
  async preview(p:AuthPrincipal,sessionId:string,displayId:string,raw:unknown):Promise<PreviewResult>{
    const a=z.object({expectedRevision:z.number().int().nonnegative(),page:z.number().int().min(0).max(499)}).strict().parse(raw);
    const url=(await this.target(p,sessionId,displayId,a.expectedRevision,a.page)),key=hash(`${sessionId}:${displayId}:${a.expectedRevision}:${a.page}:${url}`);
    const cached=(await this.service.store.list<Capture>('website-capture',sessionId)).find(x=>x.displayId===displayId&&x.revision===a.expectedRevision&&x.page===a.page&&x.url===url&&x.expiresAt>Date.now());
    if(cached)return this.result(cached);
    let pending=this.pending.get(key);
    if(!pending){
      // Bound header probes as well as captures. A large grid retries only its
      // waiting cells; it cannot launch an unbounded set of server browsers.
      if(this.active>=1)return {status:'pending',remoteContentVerified:false,reason:'Checking this website when a preview slot is available.'};
      pending=this.generate(p,sessionId,displayId,a.expectedRevision,a.page,url);this.pending.set(key,pending);void pending.finally(()=>this.pending.delete(key)).catch(()=>{});
    }
    const result=await pending;
    // Async capture is never allowed to outlive display access or its source revision.
    (await this.target(p,sessionId,displayId,a.expectedRevision,a.page));return result;
  }
  /** Web template with embed:true: may this page be shown as a genuine live
   * iframe? Headers only, public addresses only, bounded, briefly cached. */
  async framing(p:AuthPrincipal,sessionId:string,displayId:string,raw:unknown):Promise<PreviewResult>{
    const a=z.object({expectedRevision:z.number().int().nonnegative()}).strict().parse(raw);
    const url=(await this.webTarget(p,sessionId,displayId,a.expectedRevision)),key=hash(`web:${sessionId}:${displayId}:${a.expectedRevision}:${url}`);
    const cached=this.framingCache.get(key);
    if(cached&&cached.expires>Date.now())return cached.result;
    let pending=this.framingPending.get(key);
    if(!pending){
      if(this.probes>=4)return {status:'pending',remoteContentVerified:false,reason:'Checking whether this website allows live embedding.'};
      pending=this.probeFraming(p.userId,url);this.framingPending.set(key,pending);void pending.finally(()=>this.framingPending.delete(key)).catch(()=>{});
    }
    const outcome=await pending;
    // Access and the displayed revision are rechecked after the network wait.
    (await this.webTarget(p,sessionId,displayId,a.expectedRevision));
    if(outcome.ttlMs>0){
      for(const [entry,value] of this.framingCache)if(value.expires<=Date.now())this.framingCache.delete(entry);
      if(this.framingCache.size<500)this.framingCache.set(key,{result:outcome.result,expires:Date.now()+outcome.ttlMs});
    }
    return outcome.result;
  }
  private async webTarget(p:AuthPrincipal,sessionId:string,displayId:string,revision:number){
    const d=(await this.service.display(p,sessionId,displayId));this.service.assertRevision(revision,d.revision);
    const raw=navigationLeaf(d.view),view=raw?projectSelection(raw).view:null,data=view?.data as {url?:unknown;embed?:unknown}|undefined;
    if(!view||view.template!=='web'||data?.embed!==true||typeof data.url!=='string'||!/^https:\/\//i.test(data.url))throw new AppError('NOT_FOUND','This display is not showing a live web embed.',404);
    return data.url;
  }
  /** Header decisions are cached for 10 minutes; transient failures for 1 minute; a busy rate limit never. */
  private async probeFraming(userId:string,url:string):Promise<{result:PreviewResult;ttlMs:number}>{
    const recent=(this.recent.get(userId)??[]).filter(x=>Date.now()-x<60_000);
    if(recent.length>=32)return {result:{status:'pending',remoteContentVerified:false,reason:'Too many website checks right now; retrying shortly.'},ttlMs:0};
    this.recent.set(userId,[...recent,Date.now()]);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10_000);this.probes++;
    try{
      let current=publicMonitoringUrl(url),response:WebResponse|undefined;
      for(let hop=0;hop<5;hop++){
        response=await this.request(current,true,controller.signal);
        if(response.statusCode>=300&&response.statusCode<400){const location=header(response.headers,'location');if(!location)throw new Error('Redirect without location.');current=publicMonitoringUrl(new URL(location,current).href);continue;}break;
      }
      if(!response||response.statusCode<200||response.statusCode>=300)return {result:{status:'unavailable',remoteContentVerified:false,reason:'The website did not answer publicly, so it cannot be embedded live. The supplied preview is shown instead.'},ttlMs:60_000};
      const refusal=framingRefusal(response.headers,current.href,this.service.publicUrl);
      return {result:refusal?{status:'unavailable',remoteContentVerified:false,reason:refusal==='csp'?'This website’s Content-Security-Policy (frame-ancestors) does not allow embedding, so the supplied preview is shown instead.':'This website’s X-Frame-Options header does not allow embedding, so the supplied preview is shown instead.'}:{status:'interactive',remoteContentVerified:false},ttlMs:10*60_000};
    }catch{return {result:{status:'unavailable',remoteContentVerified:false,reason:'This website could not be checked for live embedding, so the supplied preview is shown instead.'},ttlMs:60_000};}
    finally{clearTimeout(timer);this.probes--;}
  }
  private async metadata(url:string):Promise<Pick<PreviewResult,'title'|'description'|'previewImage'>> {
    try {
      let current=publicMonitoringUrl(url);const signal=AbortSignal.timeout(5000);
      for(let hop=0;hop<4;hop++){
        const response=await this.request(current,false,signal);
        if(response.statusCode>=300&&response.statusCode<400){current=publicMonitoringUrl(new URL(header(response.headers,'location'),current).href);continue;}
        if(response.statusCode!==200||!header(response.headers,'content-type').includes('html'))return {};
        const html=response.body.toString('utf8').slice(0,250000),values:Record<string,string>={};
        const clean=(text:string)=>text.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim().slice(0,500);
        for(const tag of html.match(/<meta\b[^>]*>/gi)??[]){const attrs:Record<string,string>={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g))attrs[m[1].toLowerCase()]=m[2];const key=attrs.property??attrs.name;if(key&&attrs.content)values[key]=clean(attrs.content);}
        let previewImage:string|undefined;try{if(values['og:image'])previewImage=publicMonitoringUrl(new URL(values['og:image'],current).href).href;}catch{}
        return {title:values['og:title']??clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]??''),description:values['og:description']??values.description,previewImage};
      }
    }catch{}return {};
  }
  private result(c:Capture):PreviewResult{return {status:'static',remoteContentVerified:false,reason:'The website disallows embedding. This is a static anonymous server screenshot, not an interactive page.',capturedAt:c.capturedAt,imageUrl:`/api/sessions/${c.sessionId}/displays/${c.displayId}/website-preview/${c.id}`};}
  private async generate(p:AuthPrincipal,sessionId:string,displayId:string,revision:number,page:number,url:string):Promise<PreviewResult>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),35_000);
    const userId=p.userId;this.active++;
    try {
      const recent=(this.recent.get(userId)??[]).filter(x=>Date.now()-x<60_000);
      for(const [key,times] of this.recent)if(!times.some(x=>Date.now()-x<60_000))this.recent.delete(key);
      if(recent.length>=32)throw new Error('Preview rate exceeded.');
      this.recent.set(userId,[...recent,Date.now()]);
      let current=publicMonitoringUrl(url),response:WebResponse|undefined;
      for(let hop=0;hop<5;hop++){
        response=await this.request(current,true,controller.signal);
        if(response.statusCode>=300&&response.statusCode<400){const location=header(response.headers,'location');if(!location)throw new Error('Redirect without location.');current=publicMonitoringUrl(new URL(location,current).href);continue;}break;
      }
      if(!response||response.statusCode<200||response.statusCode>=300)throw new Error('Public source unavailable.');
      if(!framingRefusal(response.headers,current.href,this.service.publicUrl))return {status:'interactive',remoteContentVerified:false};
      (await this.target(p,sessionId,displayId,revision,page));
      const leaf=navigationLeaf((await this.service.display(p,sessionId,displayId)).view),viewport=(leaf?.template==='iframe'||leaf?.template==='website')&&(leaf.data as IframeData).pages[page]?.viewport==='mobile'?'mobile':'desktop';
      const bytes=await (this.options.screenshot?.(current.href,controller.signal,viewport)??this.capture(current.href,controller.signal,viewport));
      if(controller.signal.aborted||bytes.length>2*1024*1024)throw new Error('Screenshot exceeded its bounds.');
      (await this.target(p,sessionId,displayId,revision,page));
      const record:Capture={id:id(),sessionId,displayId,revision,page,url,capturedAt:now(),expiresAt:Date.now()+10*60_000,bytes:bytes.length};
      (await this.service.store.transaction(async ()=>{
        const all=(await this.service.store.list<Capture>('website-capture')).sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt));let total=all.reduce((n,x)=>n+x.bytes,0)+bytes.length,count=all.length+1;
        for(const old of all)if(old.expiresAt<=Date.now()||total>32*1024*1024||count>64){(await this.service.store.delete('website-capture',old.id));(await this.service.store.db.prepare('DELETE FROM assets WHERE id=?').run(old.id));total-=old.bytes;count--;}
        (await this.service.store.db.prepare('INSERT INTO assets(id,bytes) VALUES(?,?)').run(record.id,bytes));(await this.service.store.put('website-capture',record));
      }));return this.result(record);
    }catch{return {status:'unavailable',remoteContentVerified:false,...await this.metadata(url),reason:'Embedding or anonymous capture was refused or unavailable. Open the original website; KANVAS has not verified its content.'};}
    finally{clearTimeout(timer);this.active--;}
  }
  private async capture(url:string,signal:AbortSignal,viewport:'desktop'|'mobile'='desktop'):Promise<Buffer>{
    let browser:Browser|undefined,requests=0,total=0;
    try {
      const {chromium}=await import('playwright');browser=await chromium.launch({headless:true,timeout:10_000,args:['--disable-background-networking','--disable-quic','--force-webrtc-ip-handling-policy=disable_non_proxied_udp']});
      const close=()=>void browser?.close().catch(()=>{});signal.addEventListener('abort',close,{once:true});
      try {
        const context=await browser.newContext({viewport:viewport==='mobile'?{width:390,height:844}:{width:1280,height:900},isMobile:viewport==='mobile',hasTouch:viewport==='mobile',...(viewport==='mobile'?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'}:{}),deviceScaleFactor:1,serviceWorkers:'block',acceptDownloads:false,reducedMotion:'reduce'});
        await context.routeWebSocket('**/*',socket=>socket.close());
        await context.route('**/*',async route=>{
          const request=route.request();
          try {
            // Modern public pages may discover their styles after many script chunks.
            // Keep a finite request budget alongside the existing byte/time limits.
            if(signal.aborted||++requests>256||request.method()!=='GET'||request.resourceType()==='media')return await route.abort();
            const target=publicMonitoringUrl(request.url()),response=await this.request(target,false,signal);total+=response.body.length;
            if(total>16*1024*1024)return await route.abort();
            if(response.statusCode>=300&&response.statusCode<400)publicMonitoringUrl(new URL(header(response.headers,'location'),target).href);
            const headers:Record<string,string>={};for(const [name,value] of Object.entries(response.headers))if(value!==undefined&&!['set-cookie','transfer-encoding','connection','content-length'].includes(name))headers[name]=Array.isArray(value)?value.join(', '):value;
            headers['cache-control']='no-store';
            // Preserve CSP/XFO. Top-level anonymous capture is not a header bypass.
            await route.fulfill({status:response.statusCode,headers,body:response.body});
          }catch{await route.abort().catch(()=>{});}
        });
        const page=await context.newPage();context.on('page',other=>{if(other!==page)void other.close();});
        const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:18_000});
        if(!response||!response.ok()||!/^text\/html|^application\/xhtml\+xml/i.test(response.headers()['content-type']??''))throw new Error('Public document unavailable.');
        await page.waitForLoadState('networkidle',{timeout:2500}).catch(()=>{});
        if(await page.locator('input[type="password"]').count())throw new Error('An authentication screen is not a public content preview.');
        if(signal.aborted)throw new Error('Capture timed out.');
        return await page.screenshot({type:'jpeg',quality:75,animations:'disabled',caret:'hide',timeout:5000});
      }finally{signal.removeEventListener('abort',close);}
    }finally{await browser?.close().catch(()=>{});}
  }
  async image(p:AuthPrincipal,sessionId:string,displayId:string,captureId:string){
    const c=(await this.service.store.get<Capture>('website-capture',captureId));
    if(!c||c.sessionId!==sessionId||c.displayId!==displayId||c.expiresAt<=Date.now())throw new AppError('NOT_FOUND','This static website preview has expired.',404);
    if((await this.target(p,sessionId,displayId,c.revision,c.page))!==c.url)throw new AppError('NOT_FOUND','This page is no longer displayed.',404);
    const row=(await this.service.store.db.prepare('SELECT bytes FROM assets WHERE id=?').get(c.id)) as {bytes:Uint8Array}|undefined;
    if(!row)throw new AppError('NOT_FOUND','This preview is unavailable.',404);return Buffer.from(row.bytes);
  }
}
export function mountWebsitePreview(app:Express,preview:WebsitePreview,browser:(req:Request)=>Promise<Awaited<AuthPrincipal>>){
  const path='/api/sessions/:id/displays/:displayId/website-preview';
  app.post(path,async(req,res)=>res.json({data:await preview.preview((await browser(req)),String(req.params.id),String(req.params.displayId),req.body)}));
  app.post('/api/sessions/:id/displays/:displayId/web-embed',async(req,res)=>res.json({data:await preview.framing((await browser(req)),String(req.params.id),String(req.params.displayId),req.body)}));
  app.get(`${path}/:captureId`,async (req,res)=>{const bytes=(await preview.image((await browser(req)),String(req.params.id),String(req.params.displayId),String(req.params.captureId)));res.set({'Cache-Control':'private, no-store','Content-Type':'image/jpeg','X-Content-Type-Options':'nosniff'}).send(bytes);});
}
