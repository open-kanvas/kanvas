import type {KanvasService} from './domain.js';
import type {AuthPrincipal} from './auth.js';
import type {DisplayRecord} from '../shared/types.js';
import {MODE_GUIDANCE,MODE_QUIETNESS,SESSION_MODES,SIGNAGE_PACK,type SessionMode} from '../shared/philosophy.js';
import {now} from './store.js';

/** No agent call for this long, with a display still online, drops live to ambient. */
export const AGENT_IDLE_MS=30*60_000;
const TOUCH_INTERVAL_MS=60_000;
export type ModeSource='explicit'|'template'|'agent-idle'|'default';
export interface SessionModeView {current:SessionMode;source:ModeSource;guidance:string;set:string}
interface ModeRecord {id:string;sessionId:string;explicit?:SessionMode;idle?:SessionMode;agentSeenAt?:string;updatedAt:string}
const signage=new Set<string>(SIGNAGE_PACK);
/** Deterministic tempo from observable facts. Never a model, never a guess
 * about intent: an explicit choice wins; otherwise what is on the displays;
 * otherwise whether an agent has been around. Ties go to the quieter mode. */
export function deriveMode(input:{explicit?:SessionMode;idle?:SessionMode;templates:readonly (string|undefined)[]}):{current:SessionMode;source:ModeSource}{
 if(input.explicit)return {current:input.explicit,source:'explicit'};
 const candidates:{current:SessionMode;source:ModeSource}[]=[];
 if(input.templates.some(t=>t&&signage.has(t)))candidates.push({current:'signage',source:'template'});
 else if(input.templates.includes('presentation'))candidates.push({current:'presenting',source:'template'});
 if(input.idle)candidates.push({current:input.idle,source:'agent-idle'});
 if(!candidates.length)return {current:'live',source:'default'};
 return candidates.reduce((quiet,next)=>MODE_QUIETNESS[next.current]>MODE_QUIETNESS[quiet.current]?next:quiet);
}
export class SessionModes{
 constructor(private service:KanvasService){}
 private get store(){return this.service.store;}
 private async templates(sessionId:string){return (await this.store.list<DisplayRecord>('display',sessionId)).map(d=>d.view?.template==='split-screen'?undefined:d.view?.template);}
 private view(mode:{current:SessionMode;source:ModeSource}):SessionModeView{return {...mode,guidance:MODE_GUIDANCE[mode.current],set:'kanvas.session.settings.update {sessionId, mode: live|presenting|ambient|signage|auto}'};}
 /** Read without recording agent activity (browser and state reads). */
 async read(sessionId:string):Promise<SessionModeView>{
  const record=await this.store.get<ModeRecord>('session-mode',sessionId);
  return this.view(deriveMode({explicit:record?.explicit,idle:record?.idle,templates:await this.templates(sessionId)}));
 }
 /** Called for an agent's call on a session: notes a long absence first, then
  * records that an agent is here. The mode an arriving conversation reads is
  * the one the session settled into while nobody was driving it. */
 async observeAgent(p:AuthPrincipal,sessionId:string,online:boolean):Promise<SessionModeView>{
  const record=await this.store.get<ModeRecord>('session-mode',sessionId),stamp=Date.now(),seen=record?.agentSeenAt?Date.parse(record.agentSeenAt):undefined;
  const templates=await this.templates(sessionId);
  let next=record;
  if(seen!==undefined&&stamp-seen>AGENT_IDLE_MS&&online&&!record?.explicit&&!record?.idle)
   next={...record!,idle:templates.some(t=>t&&signage.has(t))?'signage':'ambient',updatedAt:now()};
  if(!next||seen===undefined||stamp-seen>TOUCH_INTERVAL_MS||next!==record){
   next={id:sessionId,sessionId,...next,agentSeenAt:new Date(stamp).toISOString(),updatedAt:next?.updatedAt??now()};
   try{await this.store.put('session-mode',next);}catch{/* Tempo bookkeeping never fails a call. */}
  }
  return this.view(deriveMode({explicit:next.explicit,idle:next.idle,templates}));
 }
 /** Explicit choice by the agent or the person. auto returns to the deterministic default. */
 async set(p:AuthPrincipal,sessionId:string,mode:SessionMode|'auto'):Promise<SessionModeView>{
  await this.service.access(p,sessionId,'editor');
  const record=await this.store.get<ModeRecord>('session-mode',sessionId);
  const next:ModeRecord={id:sessionId,sessionId,agentSeenAt:record?.agentSeenAt,...(mode==='auto'?{}:{explicit:mode}),updatedAt:now()};
  await this.store.put('session-mode',next);
  return this.read(sessionId);
 }
}
export const sessionModeInput=[...SESSION_MODES,'auto'] as const;
