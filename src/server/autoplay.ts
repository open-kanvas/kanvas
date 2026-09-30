import { asyncMap } from './async-collections.js';
import { z } from 'zod';
import type { ViewSpec } from '../shared/types.js';
import type { KanvasService } from './domain.js';
import { hash,type AuthPrincipal } from './auth.js';
import { AppError,id,now,required } from './store.js';
const key=z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),revision=z.number().int().nonnegative();
export const autoplayControlSchema=z.object({sessionId:key,displayId:key,requestId:key,action:z.enum(['start','pause','resume','stop']),expectedRevision:revision.optional(),expectedVersion:revision.optional(),runId:key.optional(),intervalSeconds:z.number().min(0.25).max(86400).optional().describe('Seconds per frame: 0.25–86400; omitted start interval defaults to 5.'),loop:z.boolean().optional(),frames:z.array(z.object({displayId:key,revision:revision.optional()}).strict()).min(1).max(64).optional()}).strict().superRefine((a,c)=>{if(a.action==='start'&&a.expectedRevision===undefined)c.addIssue({code:'custom',path:['expectedRevision'],message:'Start requires current expectedRevision. Optional intervalSeconds is 0.25–86400; default 5.'});if(a.action!=='start'&&(a.frames||a.intervalSeconds!==undefined||a.loop!==undefined))c.addIssue({code:'custom',path:['action'],message:'Pause/resume/stop do not replace the playlist. Omit frames, intervalSeconds and loop.'});});
export const autoplayReadSchema=z.object({sessionId:key,displayId:key}).strict();
interface Run {id:string;sessionId:string;displayId:string;actorId:string;version:number;runId:string;status:'running'|'paused'|'stopped'|'completed';intervalSeconds:number;loop:boolean;index:number;total:number;ownedRevision:number;nextAt?:number;remainingMs?:number;updatedAt:string;reason?:string}
export class Autoplay {
  private timer?:ReturnType<typeof setTimeout>;private stopped=false;private active?:Promise<void>;
  constructor(readonly service:KanvasService){}
  start(){if(this.stopped||this.timer||this.active)return;this.timer=setTimeout(()=>{this.timer=undefined;if(this.stopped)return;this.active=this.tick().catch(()=>{}).finally(()=>{this.active=undefined;this.start();});},250);this.timer.unref();}
  async close(){this.stopped=true;if(this.timer)clearTimeout(this.timer);await this.active;}
  async read(p:AuthPrincipal,raw:unknown){const a=autoplayReadSchema.parse(raw);(await this.service.display(p,a.sessionId,a.displayId));const run=(await this.service.store.get<Run>('autoplay',a.displayId));if(!run)return {status:'stopped',version:0};const {actorId:_,...visible}=run;return visible;}
  async control(p:AuthPrincipal,raw:unknown){
    return this.service.store.atomic(async () => {
    const a=autoplayControlSchema.parse(raw),display=(await this.service.display(p,a.sessionId,a.displayId,'editor')),receipt=hash(`${p.tokenId??p.userId}:${a.sessionId}:${a.requestId}`),digest=hash(JSON.stringify(a)),previous=(await this.service.store.get<{digest:string;result:unknown}>('autoplay-receipt',receipt));
    if(previous){if(previous.digest!==digest)throw new AppError('REQUEST_ID_CONFLICT','This autoplay request ID was used differently.',409);return previous.result;}
    let run=(await this.service.store.get<Run>('autoplay',display.id));
    return (await this.service.store.transaction(async ()=>{
      if(a.action==='start'){
        this.service.assertRevision(a.expectedRevision,display.revision);if(display.held)throw new AppError('DISPLAY_HELD','Release the display hold before starting autoplay.',409);
        const views:ViewSpec[]=a.frames?(await asyncMap(a.frames, async f=>{const source=(await this.service.display(p,a.sessionId,f.displayId));return required(f.revision===undefined?source.view:(await this.service.history.target(source,undefined,f.revision)).entry.view,'A playlist entry is empty.');})).flatMap(v=>v.template==='presentation'?v.data.slides as ViewSpec[]:[v]):display.view?.template==='presentation'?display.view.data.slides as ViewSpec[]:[];
        if(!views.length||views.length>64)throw new AppError('INVALID_PLAYLIST','Supply 1–64 prepared frames, or show a presentation first.');
        const view:ViewSpec={version:1,template:'presentation',data:{slides:views,index:0}};
        const update=(await this.service.publishPreparedControl(p,{sessionId:a.sessionId,displayId:a.displayId,requestId:`auto-${id()}`},view));
        run={id:display.id,sessionId:a.sessionId,displayId:display.id,actorId:p.userId,version:(run?.version??0)+1,runId:id(),status:'running',intervalSeconds:a.intervalSeconds??5,loop:a.loop??false,index:0,total:views.length,ownedRevision:update.revisions[display.id],nextAt:Date.now()+(a.intervalSeconds??5)*1000,updatedAt:now()};
      }else{
        run=required(run,'No autoplay run exists on this display.');
        if(a.expectedVersion!==undefined)this.service.assertRevision(a.expectedVersion,run.version);
        if(a.runId!==undefined&&a.runId!==run.runId)throw new AppError('AUTOPLAY_CHANGED','This autoplay run has been replaced. Read autoplay.read again.',409);
        if(a.action==='pause'){if(run.status!=='running')throw new AppError('AUTOPLAY_STATE','Only a running playlist can pause.',409);run.remainingMs=Math.max(0,(run.nextAt??Date.now())-Date.now());run.status='paused';delete run.nextAt;}
        if(a.action==='resume'){if(run.status!=='paused')throw new AppError('AUTOPLAY_STATE','Only a paused playlist can resume.',409);if(display.revision!==run.ownedRevision||display.held)throw new AppError('AUTOPLAY_CHANGED','The display changed or is held. Start a new run.',409);run.status='running';run.nextAt=Date.now()+(run.remainingMs??run.intervalSeconds*1000);delete run.remainingMs;}
        if(a.action==='stop'){run.status='stopped';delete run.nextAt;delete run.remainingMs;}
        run.version++;run.updatedAt=now();
      }
      (await this.service.store.put('autoplay',run!));const result=(await this.read(p,{sessionId:a.sessionId,displayId:a.displayId}));(await this.service.store.put('autoplay-receipt',{id:receipt,sessionId:a.sessionId,digest,result}));return result;
    }));

    });
  }
  async tick(time=Date.now()){
    return this.service.store.atomic(async () => {
    for(const run of (await this.service.store.list<Run>('autoplay'))){
      if(!['running','paused'].includes(run.status))continue;
      (await this.service.store.transaction(async ()=>{try{
        // Durable, session-specific user action. Recheck membership on each tick;
        // no transient OAuth access token is renewed or elevated by the scheduler.
        if(!(await this.service.auth.user(run.actorId)))throw new AppError('UNAUTHORIZED','Autoplay owner is unavailable.');
        const p={userId:run.actorId},d=(await this.service.display(p,run.sessionId,run.displayId,'editor'));
        if(d.revision!==run.ownedRevision||d.held||d.view?.template!=='presentation')throw new AppError('AUTOPLAY_CHANGED','The display was changed or held.');
        if(run.status==='paused'||(run.nextAt??Infinity)>time)return;
        if(run.index+1>=run.total&&!run.loop){run.status='completed';delete run.nextAt;}
        else{run.index=(run.index+1)%run.total;const update=(await this.service.navigatePresentation(p,{sessionId:run.sessionId,displayId:run.displayId,requestId:`auto-${run.runId}-${run.version}`,expectedRevision:run.ownedRevision,action:'goto',index:run.index}));run.ownedRevision=update.revisions[d.id];run.nextAt=time+run.intervalSeconds*1000;}
      }catch{run.status='stopped';run.reason='Display changed, held, ended, or access revoked.';delete run.nextAt;}
      run.version++;run.updatedAt=now();(await this.service.store.put('autoplay',run));}));
    }

    });
  }
}
