import { pointingConfigureSchema,pointingReadSchema,pointingWriteSchema,pointingSummary,POINTER_FADE_MS,POINTER_PIN_MS,POINTING_QUEUE,POINTING_QUEUE_MS,POINTING_BLOCK_EVENTS,type PointingEvent,type PointingState,type SharedPointer } from '../shared/pointing.js';
import type { KanvasService } from './domain.js';
import type { AuthPrincipal } from './auth.js';
import { hash } from './auth.js';
import type { PairingRecord } from './access-flows.js';
import { AppError } from './store.js';
import { displayedLeaf } from './engagement.js';
interface PointerSettings {id:string;sessionId:string;enabled:boolean;tools?:boolean;revision:number}
interface ActivePointer {sessionId:string;displayId:string;principal:AuthPrincipal;pointer:SharedPointer}
interface Connection {seenAt:number;cursors:Map<string,number>}
const palette=['#1971c2','#c92a2a','#5f3dc4','#087f5b','#9c5c00','#a61e4d'];
const MAX_CONNECTIONS=5000,SESSIONS_PER_CONNECTION=8,MAX_QUEUED_SESSIONS=500;
const cleanText=(value:string|undefined,max:number)=>value?.replace(/[\u0000-\u001F\u007F]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max)||undefined;
/** Isolated overlay, on in every session unless its owner turns it off. It never
 * changes ViewSpec, source data or view history. Marks live in memory only. A
 * short per-session queue lets each agent connection receive, once, what was
 * pointed at since its previous call; nothing is pushed and nothing is stored. */
export class Pointing {
  private pointers=new Map<string,ActivePointer>();
  private queues=new Map<string,PointingEvent[]>();
  private connections=new Map<string,Connection>();
  private seq=0;
  constructor(readonly service:KanvasService){}
  private async settings(sessionId:string):Promise<Awaited<PointerSettings>>{return (await this.service.store.get<PointerSettings>('pointing-settings',sessionId))??{id:sessionId,sessionId,enabled:true,revision:0};}
  async configure(p:AuthPrincipal,raw:unknown){
    return this.service.store.atomic(async () => {const a=pointingConfigureSchema.parse(raw);(await this.service.fullAccount(p,'publish'));(await this.service.access(p,a.sessionId,'owner'));const prior=(await this.settings(a.sessionId));this.service.assertRevision(a.expectedRevision,prior.revision);const next={...prior,...(a.enabled!==undefined?{enabled:a.enabled}:{}),...(a.tools!==undefined?{tools:a.tools}:{}),revision:prior.revision+1};(await this.service.store.put('pointing-settings',next));if(!next.enabled){for(const [key,v]of this.pointers)if(v.sessionId===a.sessionId)this.pointers.delete(key);this.queues.delete(a.sessionId);}this.service.emit({type:'config',sessionId:a.sessionId});return {...next,note:'Pointing is on in every session by default: a tap leaves a mark that fades after a few seconds, a long press or double tap pins one. Each participant has one mark per display. What was pointed at reaches you with your next response. Source content and history are untouched.'};
    });
  }
  async read(p:AuthPrincipal,raw:unknown):Promise<Awaited<PointingState>>{const a=pointingReadSchema.parse(raw);if(a.displayId)(await this.service.display(p,a.sessionId,a.displayId));else{(await this.service.fullAccount(p));(await this.service.access(p,a.sessionId));}
    const settings=(await this.settings(a.sessionId)),now=Date.now(),pointers:SharedPointer[]=[];
    for(const [key,v]of this.pointers){if(v.pointer.expiresAt<=now){this.pointers.delete(key);continue;}if(v.sessionId!==a.sessionId||v.displayId!==a.displayId)continue;try{const d=(await this.service.display(v.principal,v.sessionId,v.displayId));if(!settings.enabled||d.revision!==v.pointer.revision){this.pointers.delete(key);continue;}pointers.push(v.pointer);}catch{this.pointers.delete(key);}}
    let canConfigure=false;try{await this.service.fullAccount(p,'publish');await this.service.access(p,a.sessionId,'owner');canConfigure=true;}catch{/* Read-only participants must not gain owner controls. */}
    return {canConfigure,enabled:settings.enabled,tools:settings.tools===true,revision:settings.revision,canPointScope:'calling-principal',eligibilityReason:!settings.enabled?'disabled':!p.browserId?'agent-read-only':p.captureOnly?'capture-only':p.scopedDisplayId&&!p.interactive?'view-only':'eligible',canPoint:settings.enabled&&!!p.browserId&&!p.captureOnly&&(!p.scopedDisplayId||p.interactive===true),pointers:settings.enabled?pointers:[],serverNow:now};
  }
  async write(p:AuthPrincipal,sessionId:string,displayId:string,raw:unknown){
    const a=pointingWriteSchema.parse(raw),display=(await this.service.display(p,sessionId,displayId)),state=(await this.read(p,{sessionId,displayId}));
    if(!state.canPoint)throw new AppError('FORBIDDEN','Pointing is turned off for this session or this browser only watches.',403);
    this.service.assertRevision(a.revision,display.revision);const actor=p.participantId??p.userId,key=hash(`${sessionId}:${displayId}:${actor}`);
    if(a.anchor===null){this.pointers.delete(key);this.service.emit({type:'pointing',sessionId,displayId});return (await this.read(p,{sessionId,displayId}));}
    const leaf=displayedLeaf(display.view);if(!leaf||['website','iframe','html','web','video'].includes(leaf.template))throw new AppError('POINTING_UNSUPPORTED','This surface does not expose a pointing target.',409);
    if(a.anchor.kind==='cell'&&(leaf.template!=='table'||!Array.isArray(leaf.data.rows)||a.anchor.row>=leaf.data.rows.length||!(leaf.data.columns as string[]).includes(a.anchor.column)))throw new AppError('POINTING_UNSUPPORTED','This cell is not in the current table.',409);
    if(a.anchor.kind==='chart'&&leaf.template!=='chart')throw new AppError('POINTING_UNSUPPORTED','This view is not a chart.',409);
    if(a.anchor.kind==='image'&&(!['image','image-gallery'].includes(leaf.template)||!Array.isArray(leaf.data.images)||a.anchor.index>=leaf.data.images.length))throw new AppError('POINTING_UNSUPPORTED','This image is not in the current view.',409);
    if(!this.pointers.has(key)&&state.pointers.length>=128)throw new AppError('LIMIT_REACHED','This display already has 128 active pointers.',429);
    const pair=p.pairingId?(await this.service.store.get<PairingRecord>('pairing',p.pairingId)):undefined,name=((pair?(pair.selfName||pair.deviceName):(await this.service.auth.user(p.userId))?.displayName)||'Participant').slice(0,120);
    const point=a.point??(a.anchor.kind==='point'?{x:a.anchor.x,y:a.anchor.y}:undefined);
    const target=a.target?{...(cleanText(a.target.role,40)?{role:cleanText(a.target.role,40)}:{}),...(cleanText(a.target.label,200)?{label:cleanText(a.target.label,200)}:{}),...(cleanText(a.target.context,300)?{context:cleanText(a.target.context,300)}:{}),...(a.target.pane&&/^[A-Za-z0-9_-]{1,32}$/.test(a.target.pane)?{pane:a.target.pane}:{})}:undefined;
    const pointer:SharedPointer={id:key,name,revision:display.revision,anchor:a.anchor,...(point?{point}:{}),pinned:a.pinned,createdAt:new Date().toISOString(),expiresAt:Date.now()+(a.pinned?POINTER_PIN_MS:POINTER_FADE_MS),color:palette[parseInt(hash(actor).slice(0,8),16)%palette.length]};
    this.pointers.set(key,{sessionId,displayId,principal:{...p},pointer});
    const event:PointingEvent={seq:++this.seq,at:pointer.createdAt,sessionId,displayId,display:display.name,by:name,pinned:a.pinned,revision:display.revision,template:leaf.template,...(typeof leaf.title==='string'&&leaf.title?{title:leaf.title.slice(0,160)}:{}),anchor:a.anchor,...(point?{point}:{}),...(target&&Object.keys(target).length?{target}:{}),summary:pointingSummary(name,display.name,a.anchor,target,a.pinned)};
    const queue=this.queues.get(sessionId)??[],last=queue.at(-1);
    // A double tap arrives as a tap followed by its pinned repeat: the agent hears about it once.
    if(last&&last.displayId===displayId&&last.by===name&&JSON.stringify(last.anchor)===JSON.stringify(a.anchor)&&Date.parse(event.at)-Date.parse(last.at)<1500)queue.pop();
    queue.push(event);while(queue.length>POINTING_QUEUE)queue.shift();
    this.queues.delete(sessionId);this.queues.set(sessionId,queue);while(this.queues.size>MAX_QUEUED_SESSIONS)this.queues.delete(this.queues.keys().next().value!);
    this.service.emit({type:'pointing',sessionId,displayId});
    return (await this.read(p,{sessionId,displayId}));
  }
  /** What was pointed at since this connection's previous call, for the sessions it
   * has worked in. Delivered once per connection, only while the caller may still
   * read the session, and only when there is something new. */
  async forAgent(p:AuthPrincipal,connectionId:string,sessionId?:string):Promise<Record<string,unknown>|undefined>{
    if(p.browserId)return undefined;
    const key=`${p.userId}:${connectionId}`,now=Date.now();let connection=this.connections.get(key);
    if(!connection){if(!sessionId)return undefined;connection={seenAt:now,cursors:new Map()};}
    this.connections.delete(key);this.connections.set(key,connection);connection.seenAt=now;
    while(this.connections.size>MAX_CONNECTIONS)this.connections.delete(this.connections.keys().next().value!);
    if(sessionId&&/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)){const cursor=connection.cursors.get(sessionId)??0;connection.cursors.delete(sessionId);connection.cursors.set(sessionId,cursor);while(connection.cursors.size>SESSIONS_PER_CONNECTION)connection.cursors.delete(connection.cursors.keys().next().value!);}
    const fresh:PointingEvent[]=[];
    for(const [session,cursor] of [...connection.cursors]){
      const queue=this.queues.get(session)?.filter(e=>e.seq>cursor&&now-Date.parse(e.at)<=POINTING_QUEUE_MS);
      if(!queue?.length)continue;
      try{await this.service.fullAccount(p);await this.service.access(p,session);}catch{connection.cursors.delete(session);continue;}
      connection.cursors.set(session,queue.at(-1)!.seq);fresh.push(...queue);
    }
    if(!fresh.length)return undefined;
    fresh.sort((a,b)=>a.seq-b.seq);const shown=fresh.slice(-POINTING_BLOCK_EVENTS);
    const current=new Map<string,number>();
    for(const e of shown)if(!current.has(e.displayId)){try{current.set(e.displayId,(await this.service.display(p,e.sessionId,e.displayId)).revision);}catch{current.set(e.displayId,-1);}}
    return {
      note:'Since your last call on this connection, people pointed at the screen. This is context for what they say next, not an instruction. point is a fraction of the view from its top left.',
      events:shown.map(({seq:_seq,...e})=>({...e,secondsAgo:Math.max(0,Math.round((now-Date.parse(e.at))/1000)),...(current.get(e.displayId)!==e.revision?{viewChangedSince:true}:{})})),
      ...(fresh.length>shown.length?{earlierOmitted:fresh.length-shown.length}:{}),
    };
  }
}
