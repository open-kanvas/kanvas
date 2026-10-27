import { z } from 'zod';
import { readingDefaults } from '../shared/reading.js';
import type { Express, Request } from 'express';
import type { KanvasService } from './domain.js';
import { hash, type AuthPrincipal, type Token } from './auth.js';
import { AppError, id, now, required } from './store.js';
import { initialNavigation, navigate, navigationCapabilities, navigationLeaf, navigationInputSchema, navigationActionSchema, navigationReadSchema, pinSaveSchema, pinRecallSchema, pinRemoveSchema, type NavigationAction, type NavigationSnapshot, type NavigationState } from '../shared/navigation.js';
import type { ViewSpec } from '../shared/types.js';

interface Position {action?:NavigationAction['action'];id:string;sessionId:string;displayId:string;revision:number;version:number;state:NavigationState;commandId:string;target?:string;updatedAt:string}
interface Receipt {id:string;sessionId:string;digest:string;result:Position;createdAt:string}
interface Ack {id:string;sessionId:string;displayId:string;revision:number;commandId:string;viewerId:string;status:'applied'|'unsupported'|'failed';matches?:number;scroll?:{x:number;y:number;maxX:number;maxY:number};at:string}
interface Viewport {id:string;sessionId:string;displayId:string;viewerId:string;revision:number;version:number;width:number;height:number;maxX:number;maxY:number;at:string}
interface Pin {id:string;sessionId:string;displayId:string;label:string;revision:number;view:ViewSpec;createdAt:string}
const tab=z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const browserInput=z.object({tabId:tab,requestId:tab,expectedRevision:z.number().int().nonnegative(),navigation:navigationActionSchema}).strict();

/** Bounded navigation is not content editing. Each browser acknowledges its own
 * frame; a stored command never claims all screens have painted it. */
export class Navigation {
  constructor(readonly service:KanvasService){}
  private key(displayId:string,viewerId?:string){return hash(`${displayId}:${viewerId??'shared'}`);}
  private zoomKey(sessionId:string,view:ViewSpec|null,target?:string){
    const leaf=navigationLeaf(view);const checklistId=leaf?.template==='checklist'?leaf.data.checklistId:undefined;
    return typeof checklistId==='string'?hash(`${sessionId}:checklist:${checklistId}:${target??'shared'}`):undefined;
  }
  private async position(sessionId:string,displayId:string,viewerId?:string){
    const d=required((await this.service.store.get<{revision:number;navigationRoot?:number;view:ViewSpec|null}>('display',displayId)));
    const global=(await this.service.store.get<Position>('navigation',this.key(displayId)));
    const local=viewerId?(await this.service.store.get<Position>('navigation',this.key(displayId,viewerId))):undefined;
    const root=d.navigationRoot??d.revision;
    const found=local&&local.revision>=root&&(!global||global.revision<root||local.version>global.version)?local:global;
    if(found&&found.revision>=root&&found.revision<d.revision){const state=structuredClone(found.state);state.page=Math.min(state.page,Math.max(0,navigationCapabilities(d.view,state).pageCount-1));if(state.reading)state.reading.playing=false;return {...found,revision:d.revision,version:0,state,commandId:'',action:undefined};}
    const zoomId=this.zoomKey(sessionId,d.view,viewerId),globalZoomId=this.zoomKey(sessionId,d.view);
    const zoom=zoomId?await this.service.store.get<{scale:number;updatedAt:string}>('view-zoom',zoomId):undefined,globalZoom=globalZoomId?await this.service.store.get<{scale:number;updatedAt:string}>('view-zoom',globalZoomId):undefined;
    const savedZoom=zoom&&(!globalZoom||zoom.updatedAt>globalZoom.updatedAt)?zoom:globalZoom;
    return found?.revision===d.revision?found:{id:this.key(displayId,viewerId),sessionId,displayId,revision:d.revision,version:0,state:{...initialNavigation(navigationLeaf(d.view)),...(savedZoom?{scale:savedZoom.scale}:{}),...(found?.state.reading?{reading:{...found.state.reading,playing:false}}:{})},commandId:'',updatedAt:now()};
  }
  /** Anonymous publication includes broadcast position only, never a tab target. */
  async publicPosition(sessionId:string,displayId:string){
    const d=required((await this.service.store.get<{sessionId:string;revision:number;view:ViewSpec|null}>('display',displayId)));
    if(d.sessionId!==sessionId)throw new AppError('NOT_FOUND','This display is unavailable.',404);
    const p=(await this.position(sessionId,displayId));
    return {revision:d.revision,version:p.version,state:structuredClone(p.state)};
  }
  private async withReading(p:AuthPrincipal,sessionId:string,position:Position):Promise<Awaited<Position>>{
    if(position.state.reading)return position;
    const session=(await this.service.access(p,sessionId)),config=!p.scopedDisplayId&&(!p.tokenId||(await this.service.store.get<Token>('token',p.tokenId))?.sessionIds===undefined)?(await this.service.experience.defaults(p.userId)).config:session.config;
    return {...position,state:{...position.state,reading:readingDefaults(config)}};
  }
  private async liveViewer(p:AuthPrincipal,sessionId:string,displayId:string,viewerId:string){
    const viewer=(await this.service.experience.viewers(p,sessionId,displayId)).find(x=>x.id===viewerId);
    if(!viewer)throw new AppError('VIEWER_UNAVAILABLE','Select a currently connected viewer using viewers.read.',409);
  }
  async read(p:AuthPrincipal,raw:unknown){
    const a=navigationReadSchema.parse(raw),d=(await this.service.display(p,a.sessionId,a.displayId)),s=(await this.service.access(p,a.sessionId)),position=(await this.position(a.sessionId,d.id,(s.config.syncMode??'independent')==='independent'?a.viewerId:undefined));
    (await this.service.fullAccount(p));
    const acks=(await this.service.store.list<Ack>('navigation-ack',a.sessionId)).filter(x=>x.displayId===d.id&&x.revision===d.revision&&x.commandId===position.commandId);
    const measured=(await this.service.store.list<Viewport>('navigation-viewport',a.sessionId)).filter(x=>x.displayId===d.id&&x.revision===d.revision&&Date.now()-Date.parse(x.at)<15000);
    const viewers=await Promise.all((await this.service.experience.viewers(p,a.sessionId,d.id)).filter(v=>!a.viewerId||v.id===a.viewerId).map(async v=>{const current=await this.position(a.sessionId,d.id,(s.config.syncMode??'independent')==='independent'?v.id:undefined);const viewport=measured.find(x=>x.viewerId===v.id&&x.version===current.version);return {viewerId:v.id,viewport:viewport?{width:viewport.width,height:viewport.height,maxX:viewport.maxX,maxY:viewport.maxY,contentOverflowsViewport:viewport.maxX>1||viewport.maxY>1,measuredAt:viewport.at}:null,status:acks.find(x=>x.viewerId===v.id)?.status??'unconfirmed',matches:acks.find(x=>x.viewerId===v.id)?.matches,scroll:acks.find(x=>x.viewerId===v.id)?.scroll};}));
    return {...(await this.withReading(p,a.sessionId,position)),capabilities:navigationCapabilities(d.view,position.state),mode:s.config.syncMode??'independent',presenterViewerId:s.config.presenterViewerId||undefined,viewers,note:'pageCount/matchingItems are logical pagination, NOT visible rows. viewport is measured per receiving browser; null means unknown or stale. Execute explicit scroll/navigation requests even on one logical page. Per-viewer receipts only. Offline or unconfirmed viewers are not assumed to have applied this position. Source revision/history are unchanged.'};
  }
  async browserRead(p:AuthPrincipal,sessionId:string,displayId:string,tabId:string):Promise<Awaited<NavigationSnapshot>>{
    tab.parse(tabId);const d=(await this.service.display(p,sessionId,displayId)),s=(await this.service.access(p,sessionId)),viewerId=this.service.experience.viewerId(p,tabId),mode=s.config.syncMode??'independent';
    const position=(await this.withReading(p,sessionId,(await this.position(sessionId,displayId,mode==='independent'?viewerId:undefined))));
    return {canSaveReadingDefaults:!p.scopedDisplayId&&!p.tokenId,...(!p.scopedDisplayId&&!p.tokenId?{readingDefaults:readingDefaults((await this.service.experience.defaults(p.userId)).config)}:{}),action:position.action,revision:d.revision,version:position.version,commandId:position.commandId||undefined,state:position.state,mode,viewerId,canNavigate:mode!=='presenter'||s.config.presenterViewerId===viewerId,capabilities:navigationCapabilities(d.view,position.state)};
  }
  async control(p:AuthPrincipal,raw:unknown){const a=navigationInputSchema.parse(raw);(await this.service.display(p,a.sessionId,a.displayId,'editor'));if(a.viewerId){if(((await this.service.access(p,a.sessionId)).config.syncMode??'independent')!=='independent')throw new AppError('NAVIGATION_UNAVAILABLE','A single viewer target requires independent mode.',409);(await this.liveViewer(p,a.sessionId,a.displayId,a.viewerId));}return (await this.write(p,a,a.viewerId));}
  async browserControl(p:AuthPrincipal,sessionId:string,displayId:string,raw:unknown){
    const a=browserInput.parse(raw),snapshot=(await this.browserRead(p,sessionId,displayId,a.tabId));
    if(!snapshot.canNavigate)throw new AppError('PRESENTER_ONLY','This session follows its selected presenter. Ask the owner to change navigation mode.',403);
    (await this.write(p,{...a,sessionId,displayId},snapshot.mode==='independent'?snapshot.viewerId:undefined));
    return (await this.browserRead(p,sessionId,displayId,a.tabId));
  }
  private async write(p:AuthPrincipal,a:z.infer<typeof navigationInputSchema>,target?:string){
    return this.service.store.atomic(async () => {
    const s=this.service, d=(await s.display(p,a.sessionId,a.displayId)),key=hash(`${p.tokenId??p.browserId??p.userId}:${a.sessionId}:${a.requestId}`),digest=hash(JSON.stringify({a,target}));
    const prior=(await s.store.get<Receipt>('navigation-receipt',key));
    if(prior){if(prior.digest!==digest)throw new AppError('REQUEST_ID_CONFLICT','This navigation request ID was already used with different arguments.',409);return {...prior.result,replayed:true,superseded:prior.result.revision!==d.revision||(await this.position(a.sessionId,d.id,target)).commandId!==prior.result.commandId};}
    s.assertRevision(a.expectedRevision,d.revision);
    const before=(await this.withReading(p,a.sessionId,(await this.position(a.sessionId,d.id,target))));let state:NavigationState;
    try{state=navigate(d.view,before.state,a.navigation);}catch(error){throw new AppError('NAVIGATION_UNAVAILABLE',error instanceof Error?error.message:'This navigation is unavailable.',409);}
    const all=(await s.store.list<Position>('navigation',a.sessionId)).filter(x=>x.displayId===d.id);
    // Bound inactive per-browser positions without preventing a new screen from joining.
    const evict=target&&!all.some(x=>x.target===target)&&all.filter(x=>x.target).length>=128?all.filter(x=>x.target).sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt))[0]:undefined;
    const result:Position={action:a.navigation.action,id:this.key(d.id,target),sessionId:a.sessionId,displayId:d.id,revision:d.revision,version:Math.max(0,...all.map(x=>x.version))+1,state,commandId:id(),target,updatedAt:now()};
    (await s.store.transaction(async ()=>{
      if(a.navigation.action==='reading'&&a.navigation.saveDefaults){const current=(await s.experience.preferences(p)),r=state.reading!,patch:Record<string,number>={};if(a.navigation.fontSize!==undefined)patch.readingFontSize=r.fontSize;if(a.navigation.zoom!==undefined)patch.readingZoom=r.zoom;if(a.navigation.wpm!==undefined||['slower','faster'].includes(a.navigation.command))patch.readingWpm=r.wpm;if(!Object.keys(patch).length)Object.assign(patch,{readingFontSize:r.fontSize,readingWpm:r.wpm,readingZoom:r.zoom});(await s.experience.preferences(p,{expectedRevision:current.revision,config:patch}));}
      const zoomId=this.zoomKey(a.sessionId,d.view,target);if(zoomId&&['zoom','reset'].includes(a.navigation.action))await s.store.put('view-zoom',{id:zoomId,sessionId:a.sessionId,scale:state.scale??1,updatedAt:now()});
      if(evict)(await s.store.delete('navigation',evict.id));(await s.store.put('navigation',result));(await s.store.put('navigation-receipt',{id:key,sessionId:a.sessionId,digest,result,createdAt:now()}));for(const old of (await s.store.list<Receipt>('navigation-receipt',a.sessionId)).slice(0,-1000))(await s.store.delete('navigation-receipt',old.id));}));
    s.emit({type:'display',sessionId:a.sessionId,displayId:d.id,revision:d.revision});
    return {...result,note:'Accepted navigation; read navigation.read for per-viewer application. No source data or history changed.'};

    });
  }
  async measure(p:AuthPrincipal,sessionId:string,displayId:string,raw:unknown) {
    const extent=z.number().finite().nonnegative().max(100000000);
    const a=z.object({tabId:tab,revision:z.number().int().nonnegative(),version:z.number().int().nonnegative(),width:extent,height:extent,maxX:extent,maxY:extent}).strict().parse(raw);
    const snapshot=await this.browserRead(p,sessionId,displayId,a.tabId);
    if(snapshot.revision!==a.revision||snapshot.version!==a.version)return {ignored:true};
    const record:Viewport={id:hash(`${displayId}:${snapshot.viewerId}`),sessionId,displayId,viewerId:snapshot.viewerId!,revision:a.revision,version:a.version,width:a.width,height:a.height,maxX:a.maxX,maxY:a.maxY,at:now()};
    await this.service.store.put('navigation-viewport',record);
    const all=(await this.service.store.list<Viewport>('navigation-viewport',sessionId)).filter(x=>x.displayId===displayId).sort((a,b)=>a.at.localeCompare(b.at));
    for(const old of all.slice(0,-128))await this.service.store.delete('navigation-viewport',old.id);
    return {ignored:false};
  }
  async acknowledge(p:AuthPrincipal,sessionId:string,displayId:string,raw:unknown){
    return this.service.store.atomic(async () => {
    const a=z.object({tabId:tab,revision:z.number().int().nonnegative(),commandId:tab,status:z.enum(['applied','unsupported','failed']),matches:z.number().int().min(0).max(100000).optional(),scroll:z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),maxX:z.number().nonnegative().max(100000000),maxY:z.number().nonnegative().max(100000000)}).strict().optional()}).strict().parse(raw);
    const snapshot=(await this.browserRead(p,sessionId,displayId,a.tabId));
    if(snapshot.revision!==a.revision||snapshot.commandId!==a.commandId)return {ignored:true};
    const viewerId=snapshot.viewerId!,record:Ack={id:hash(`${displayId}:${viewerId}`),sessionId,displayId,revision:a.revision,commandId:a.commandId,viewerId,status:a.status,matches:a.matches,scroll:a.scroll,at:now()};
    (await this.service.store.put('navigation-ack',record));const all=(await this.service.store.list<Ack>('navigation-ack',sessionId)).filter(x=>x.displayId===displayId).sort((a,b)=>a.at.localeCompare(b.at));for(const old of all.slice(0,-128))(await this.service.store.delete('navigation-ack',old.id));return {ignored:false};

    });
  }
  async pins(p:AuthPrincipal,sessionId:string,displayId:string){(await this.service.display(p,sessionId,displayId));return (await this.service.store.list<Pin>('view-pin',sessionId)).filter(x=>x.displayId===displayId).map(({view:_view,...x})=>x);}
  async savePin(p:AuthPrincipal,raw:unknown){
    return this.service.store.atomic(async () => {
    const a=pinSaveSchema.parse(raw),s=this.service,d=(await s.display(p,a.sessionId,a.displayId,'editor')),key=hash(`${p.tokenId??p.userId}:${a.sessionId}:${a.requestId}`),digest=hash(JSON.stringify(a));
    const prior=(await s.store.get<{digest:string;result:Omit<Pin,'view'>}>('pin-receipt',key));if(prior){if(prior.digest!==digest)throw new AppError('REQUEST_ID_CONFLICT','This pin request was used for a different label or revision.',409);return prior.result;}
    const revision=a.revision??d.revision,view=revision===d.revision?d.view:(await s.history.target(d,undefined,revision)).entry.view;
    if(!view)throw new AppError('EMPTY_VIEW','Publish content before pinning it.');
    const pins=(await s.store.list<Pin>('view-pin',a.sessionId));if(pins.length>=40||pins.reduce((n,x)=>n+JSON.stringify(x.view).length,0)+JSON.stringify(view).length>6*1024*1024)throw new AppError('LIMIT_REACHED','Remove a pin before saving more (40 pins / 6 MB per session).',429);
    const record:Pin={id:id(),sessionId:a.sessionId,displayId:d.id,label:a.label,revision,view:structuredClone(view),createdAt:now()}, {view:_view,...result}=record;
    (await s.store.transaction(async ()=>{(await s.store.put('view-pin',record));(await s.store.put('pin-receipt',{id:key,sessionId:a.sessionId,digest,result}));for(const old of (await s.store.list<{id:string}>('pin-receipt',a.sessionId)).slice(0,-500))(await s.store.delete('pin-receipt',old.id));}));return result;

    });
  }
  async recallPin(p:AuthPrincipal,raw:unknown){
    const a=pinRecallSchema.parse(raw),s=this.service;
    return (await s.recallPinnedView(p,a,async ()=>{const pin=required((await s.store.get<Pin>('view-pin',a.pinId)));if(pin.sessionId!==a.sessionId||pin.displayId!==a.displayId)throw new AppError('NOT_FOUND','This pin is unavailable for this display.',404);return pin.view;}));
  }
  async removePin(p:AuthPrincipal,raw:unknown){
    return this.service.store.atomic(async () => {const a=pinRemoveSchema.parse(raw);(await this.service.display(p,a.sessionId,a.displayId,'editor'));const pin=(await this.service.store.get<Pin>('view-pin',a.pinId));if(pin&&(pin.sessionId!==a.sessionId||pin.displayId!==a.displayId))throw new AppError('NOT_FOUND','This pin is unavailable.',404);(await this.service.store.delete('view-pin',a.pinId));return {removed:true,pinId:a.pinId};
    });
  }
}
export function mountNavigation(app:Express,navigation:Navigation,browser:(req:Request)=>Promise<Awaited<AuthPrincipal>>){
  const path='/api/sessions/:id/displays/:displayId/navigation', ids=(req:Request)=>[String(req.params.id),String(req.params.displayId)] as const;
  app.get(path,async (req,res)=>res.json({data:(await navigation.browserRead((await browser(req)),...ids(req),tab.parse(req.query.tabId)))}));
  app.post(path,async (req,res)=>res.json({data:(await navigation.browserControl((await browser(req)),...ids(req),req.body))}));
  app.post(`${path}/viewport`,async (req,res)=>res.json({data:await navigation.measure(await browser(req),...ids(req),req.body)}));
  app.post(`${path}/ack`,async (req,res)=>res.json({data:(await navigation.acknowledge((await browser(req)),...ids(req),req.body))}));
}
