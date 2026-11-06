import {rawEvent,eventProperties} from './raw-events.js';
import type {Express,Request} from 'express';
import {diagnosticBatchSchema,diagnosticReadSchema} from '../shared/frontend-diagnostics.js';
import type {AuthPrincipal} from './auth.js';
import type {KanvasService} from './domain.js';
import {AppError,id,now} from './store.js';
import {KANVAS_VERSION} from '../shared/version.js';
import type {Definition} from './mcp/canonical.js';
const RETENTION=14*86400000;
export const diagnosticTools:Definition[]=[{name:'kanvas_diagnostics_read',schema:diagnosticReadSchema,readOnly:true,description:'Read your bounded browser metadata timeline by supportRef (retained indefinitely). accountId requires service admin. No raw content/logs. Render acknowledgement is not proof a human saw it.'}];
export class FrontendDiagnostics{
 private limits=new Map<string,{until:number;count:number}>();
 constructor(private service:KanvasService){}
 close(){}
 async prune(){/* Event history is retained indefinitely. */}
 async receive(p:AuthPrincipal,raw:unknown){
  await this.service.accounts.account(p);const a=diagnosticBatchSchema.parse(raw),t=Date.now();
  for(const [k,v] of this.limits)if(v.until<t)this.limits.delete(k);
  let bucket=this.limits.get(p.userId);
  if(!bucket){if(this.limits.size>=10000)return {accepted:0,supportRef:a.supportRef,rateLimited:true,retryAfterMs:60000};bucket={until:t+60000,count:0};this.limits.set(p.userId,bucket);}
  // Sampling exhaustion is an expected telemetry outcome, not an application error.
  if(bucket.count+a.events.length>120)return {accepted:0,supportRef:a.supportRef,rateLimited:true,retryAfterMs:Math.max(1,bucket.until-t)};
  bucket.count+=a.events.length;
  return this.service.store.atomic(async()=>{
   const events=[];
   for(const e of a.events){
    if(e.clientAt!==undefined&&(e.clientAt<t-RETENTION||e.clientAt>t+300000))continue;
    if(e.displayId&&!e.sessionId)continue;
    if(e.sessionId){try{if(e.displayId)await this.service.display(p,e.sessionId,e.displayId);else await this.service.access(p,e.sessionId);}catch{continue;}}
    events.push(e);
   }
   if(events.length)await this.service.store.put('frontend-diagnostic',{id:id(),accountId:p.userId,supportRef:a.supportRef,windowId:a.windowId,release:KANVAS_VERSION,clientRelease:a.clientRelease,at:now(),events});
   for(const e of events)await rawEvent(this.service.store,'browser.event',{userId:p.userId,sessionId:e.sessionId,displayId:e.displayId,client:{clientRelease:a.clientRelease},properties:eventProperties(e)});
   return {accepted:events.length,supportRef:a.supportRef};
  });
 }
 async read(p:AuthPrincipal,raw:unknown){
  await this.service.accounts.account(p);const a=diagnosticReadSchema.parse(raw),accountId=a.accountId??p.userId;
  if(accountId!==p.userId&&!await this.service.accounts.isServiceAdmin(p))throw new AppError('FORBIDDEN','Cross-account diagnostics require service administrator access.',403);
  const rows=(await this.service.store.list<{id:string;accountId:string;supportRef:string;at:string}>('frontend-diagnostic',undefined,true)).filter(r=>r.accountId===accountId&&r.supportRef===a.supportRef).sort((a,b)=>a.at.localeCompare(b.at)).slice(-100);
  return {supportRef:a.supportRef,timeline:rows,note:'Browser reports are untrusted observations; applied does not prove a human saw content.'};
 }
}
export function mountFrontendDiagnostics(app:Express,d:FrontendDiagnostics,browser:(req:Request)=>Promise<AuthPrincipal>){
 app.post('/api/diagnostics',async(req,res)=>{res.json({data:await d.receive(await browser(req),req.body)});});
 app.get('/api/diagnostics',async(req,res)=>{res.json({data:await d.read(await browser(req),req.query)});});
}
