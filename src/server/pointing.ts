import { pointingConfigureSchema,pointingReadSchema,pointingWriteSchema,type PointingState,type SharedPointer } from '../shared/pointing.js';
import type { KanvasService } from './domain.js';
import type { AuthPrincipal } from './auth.js';
import { hash } from './auth.js';
import type { PairingRecord } from './access-flows.js';
import { AppError } from './store.js';
import { displayedLeaf } from './engagement.js';
interface PointerSettings {id:string;sessionId:string;enabled:boolean;revision:number}
interface ActivePointer {sessionId:string;displayId:string;principal:AuthPrincipal;pointer:SharedPointer}
const palette=['#1971c2','#c92a2a','#5f3dc4','#087f5b','#9c5c00','#a61e4d'];
/** Isolated optional overlay. It never changes ViewSpec, source data or view history. */
export class Pointing {
  private pointers=new Map<string,ActivePointer>();
  constructor(readonly service:KanvasService){}
  private async settings(sessionId:string):Promise<Awaited<PointerSettings>>{return (await this.service.store.get<PointerSettings>('pointing-settings',sessionId))??{id:sessionId,sessionId,enabled:false,revision:0};}
  async configure(p:AuthPrincipal,raw:unknown){
    return this.service.store.atomic(async () => {const a=pointingConfigureSchema.parse(raw);(await this.service.fullAccount(p,'publish'));(await this.service.access(p,a.sessionId,'owner'));const prior=(await this.settings(a.sessionId));this.service.assertRevision(a.expectedRevision,prior.revision);const next={...prior,enabled:a.enabled,revision:prior.revision+1};(await this.service.store.put('pointing-settings',next));if(!next.enabled)for(const [key,v]of this.pointers)if(v.sessionId===a.sessionId)this.pointers.delete(key);this.service.emit({type:'config',sessionId:a.sessionId});return {...next,note:'Shared pointing is optional and reversible. Each participant has one marker per display, expiring after 20 seconds. Source content and history are untouched.'};
    });
  }
  async read(p:AuthPrincipal,raw:unknown):Promise<Awaited<PointingState>>{const a=pointingReadSchema.parse(raw);if(a.displayId)(await this.service.display(p,a.sessionId,a.displayId));else{(await this.service.fullAccount(p));(await this.service.access(p,a.sessionId));}
    const settings=(await this.settings(a.sessionId)),now=Date.now(),pointers:SharedPointer[]=[];
    for(const [key,v]of this.pointers){if(v.pointer.expiresAt<=now){this.pointers.delete(key);continue;}if(v.sessionId!==a.sessionId||v.displayId!==a.displayId)continue;try{const d=(await this.service.display(v.principal,v.sessionId,v.displayId));if(!settings.enabled||d.revision!==v.pointer.revision){this.pointers.delete(key);continue;}pointers.push(v.pointer);}catch{this.pointers.delete(key);}}
    return {enabled:settings.enabled,revision:settings.revision,canPoint:settings.enabled&&!!p.browserId&&!p.captureOnly&&(!p.scopedDisplayId||p.interactive===true),pointers:settings.enabled?pointers:[]};
  }
  async write(p:AuthPrincipal,sessionId:string,displayId:string,raw:unknown){
    const a=pointingWriteSchema.parse(raw),display=(await this.service.display(p,sessionId,displayId)),state=(await this.read(p,{sessionId,displayId}));
    if(!state.canPoint)throw new AppError('FORBIDDEN','Shared pointing must be enabled by the session owner and requires a participating browser.',403);
    this.service.assertRevision(a.revision,display.revision);const actor=p.participantId??p.userId,key=hash(`${sessionId}:${displayId}:${actor}`);
    if(a.anchor===null){this.pointers.delete(key);return (await this.read(p,{sessionId,displayId}));}
    const leaf=displayedLeaf(display.view);if(!leaf||['website','iframe','html','web','video'].includes(leaf.template))throw new AppError('POINTING_UNSUPPORTED','This surface does not expose a semantic pointing target.',409);
    if(a.anchor.kind==='cell'&&(leaf.template!=='table'||!Array.isArray(leaf.data.rows)||a.anchor.row>=leaf.data.rows.length||!(leaf.data.columns as string[]).includes(a.anchor.column)))throw new AppError('POINTING_UNSUPPORTED','This cell is not in the current table.',409);
    if(a.anchor.kind==='chart'&&leaf.template!=='chart')throw new AppError('POINTING_UNSUPPORTED','This view is not a chart.',409);
    if(a.anchor.kind==='image'&&(!['image','image-gallery'].includes(leaf.template)||!Array.isArray(leaf.data.images)||a.anchor.index>=leaf.data.images.length))throw new AppError('POINTING_UNSUPPORTED','This image is not in the current view.',409);
    if(!this.pointers.has(key)&&state.pointers.length>=128)throw new AppError('LIMIT_REACHED','This display already has 128 active pointers.',429);
    const pair=p.pairingId?(await this.service.store.get<PairingRecord>('pairing',p.pairingId)):undefined,name=pair?(pair.selfName||pair.deviceName):(await this.service.auth.user(p.userId))?.displayName;
    const pointer:SharedPointer={id:key,name:(name||'Participant').slice(0,120),revision:display.revision,anchor:a.anchor,createdAt:new Date().toISOString(),expiresAt:Date.now()+20000,color:palette[parseInt(hash(actor).slice(0,8),16)%palette.length]};
    this.pointers.set(key,{sessionId,displayId,principal:{...p},pointer});return (await this.read(p,{sessionId,displayId}));
  }
}
