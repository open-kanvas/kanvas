import { browserContext, type RequestContext } from '../shared/recognition.js';
import type { ViewerPresence } from '../shared/viewer-experience.js';
import { hash, type AuthPrincipal } from './auth.js';
import type { PairingRecord } from './access-flows.js';
import type { KanvasService } from './domain.js';
import { AppError, now } from './store.js';
import { lifecycleNotice } from './lifecycle-notices.js';

interface Connection {id:string;sessionId:string;displayId:string;principal:AuthPrincipal;count:number;joinedAt:string;lastActiveAt:string;name:string;method:'account'|'paired';context:RequestContext;timer?:ReturnType<typeof setTimeout>}
/** Socket evidence is process-local. Persisted observations cannot resurrect a
 * disconnected browser after restart. Browser labels are not verified identity. */
export class ReceivingPresence {
  private connections=new Map<string,Connection>();
  private pending = new Set<Promise<void>>();
  private closed = false;
  constructor(readonly service:KanvasService){}
  async connect(p:AuthPrincipal,sessionId:string,displayId:string,tabId:string|undefined,userAgent:string,language?:string,request?:RequestContext){
    return this.service.store.atomic(async () => {
    if (this.closed) throw new AppError('SERVICE_UNAVAILABLE', 'The server is shutting down.', 503);
    (await this.service.display(p,sessionId,displayId));
    if(p.captureOnly)throw new AppError('FORBIDDEN','Server captures are not audience viewers.',403);
    if(tabId!==undefined&&!/^[A-Za-z0-9_-]{1,128}$/.test(tabId))throw new AppError('INVALID_REQUEST','Invalid browser tab identity.');
    const id=hash(`${p.browserId}:${tabId??`stream-${displayId}`}`).slice(0,32),prior=this.connections.get(id),stamp=now();
    const sameTarget=prior?.sessionId===sessionId&&prior?.displayId===displayId;
    if(!sameTarget&&[...this.connections.values()].filter(x=>x.sessionId===sessionId).length>=128)throw new AppError('LIMIT_REACHED','Too many connected browsers.',429);
    const pair=p.pairingId?(await this.service.store.get<PairingRecord>('pairing',p.pairingId)):undefined;
    const context=request??pair?.requestContext??browserContext(userAgent,language),name=pair?.selfName||pair?.deviceName||(await this.service.auth.user(p.userId))?.displayName||'Account browser';
    const record:Connection=prior&&sameTarget?prior:{id,sessionId,displayId,principal:p,count:0,joinedAt:stamp,lastActiveAt:stamp,name,method:pair?'paired':'account',context};
    if(prior?.timer)clearTimeout(prior.timer);record.timer=undefined;record.count++;record.lastActiveAt=stamp;record.context=context;this.connections.set(id,record);
    if(prior&&!sameTarget)(await this.service.topology.disconnected(prior.sessionId,id));
    (await this.service.topology.connected(p,{id,sessionId,displayId,joinedAt:record.joinedAt,name,context},!sameTarget));
    if(prior&&!sameTarget)(await lifecycleNotice(this.service.store,prior.sessionId,prior.displayId,`viewer:${id}:${prior.joinedAt}:disconnected`,`${prior.name} left this display.`));
    if(!sameTarget)(await lifecycleNotice(this.service.store,sessionId,displayId,`viewer:${id}:${record.joinedAt}:connected`,`${name} connected · ${context.device}, ${context.browser}.`,'success'));
    let closed=false;
    return {touch:()=>{if(!closed)record.lastActiveAt=now();},disconnect:()=>{if(closed||this.closed)return;closed=true;record.count=Math.max(0,record.count-1);record.lastActiveAt=now();if(record.count)return;
      record.timer = setTimeout(() => {
        if (this.closed || record.count || this.connections.get(id) !== record) return;
        this.connections.delete(id);
        const task = (async () => {
          await this.service.topology.disconnected(sessionId, id);
          await lifecycleNotice(this.service.store, sessionId, displayId, `viewer:${id}:${record.joinedAt}:disconnected`, `${name} disconnected from the display.`);
          const observation = await this.service.store.get<ViewerPresence>('viewer', id);
          if (observation) await this.service.store.put('viewer', { ...observation, connected: false, disconnectedAt: now(), expiresAt: Date.now() });
        })();
        this.pending.add(task);
        // There is no open response to reject after disconnect. Handle errors
        // locally, and retain the work so shutdown drains it before pool.end().
        void task.catch(() => { console.error('KANVAS viewer disconnect cleanup failed.'); }).finally(() => this.pending.delete(task));
      }, 1500);
      record.timer.unref();
    }};

    });
  }
  async metadata(viewerId:string){const c=this.connections.get(viewerId),device=c?(await this.service.devices.forBrowser(c.principal)):undefined;return c?{...(device?{deviceId:device.id,deviceName:device.name}:{}),connected:c.count>0,connectionMethod:c.method,joinedAt:c.joinedAt,lastActiveAt:c.lastActiveAt,name:c.name,requestContext:c.context}:{};}
  async viewers(sessionId:string,displayId?:string):Promise<Awaited<ViewerPresence[]>>{
    const output:ViewerPresence[]=[];
    for(const c of this.connections.values()){
      if(!c.count||c.sessionId!==sessionId||displayId&&c.displayId!==displayId)continue;
      try{const d=(await this.service.display(c.principal,sessionId,c.displayId)),observation=(await this.service.store.get<ViewerPresence>('viewer',c.id));
        output.push({...((observation&&observation.sessionId===sessionId&&observation.displayId===c.displayId)?observation:{id:c.id,sessionId,displayId:c.displayId,tabId:'',revision:d.revision,renderedRevision:null,status:'loading',visible:false,text:'',elements:[],width:d.width,height:d.height,context:null,observedAt:c.joinedAt,participantId:c.principal.participantId??c.principal.userId,expiresAt:Date.now()+30_000}),...(await this.metadata(c.id)),connected:true});
      }catch{/* Revoked/ended account or browser is not active, even before socket close. */}
    }
    return output;
  }
  async close() {
    this.closed = true;
    for (const connection of this.connections.values()) if (connection.timer) clearTimeout(connection.timer);
    this.connections.clear();
    await Promise.allSettled([...this.pending]);
  }
}
