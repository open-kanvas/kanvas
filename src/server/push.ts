import webpush from 'web-push';
import {z} from 'zod';
import type {Express,Request} from 'express';
import type {KanvasService} from './domain.js';
import {type AuthPrincipal,type BrowserSession,hash} from './auth.js';
import {AppError,now} from './store.js';
import type {SessionRecord} from '../shared/types.js';
const hosts=new Set(['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com']);
export function safePushEndpoint(input:string){try{const u=new URL(input);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&hosts.has(u.hostname)&&u.pathname.length>1&&u.href===input;}catch{return false;}}
export const pushSubscriptionSchema=z.strictObject({endpoint:z.string().max(2048).refine(safePushEndpoint,'Unsupported push service.'),keys:z.strictObject({p256dh:z.string().regex(/^[A-Za-z0-9_-]{87}$/),auth:z.string().regex(/^[A-Za-z0-9_-]{22}$/)})});
type Subscription=z.infer<typeof pushSubscriptionSchema>;
interface Saved{id:string;ownerId:string;browserId:string;subscription:Subscription;createdAt:string}
export interface PushOptions{publicKey:string;privateKey:string;subject:string;send?:(subscription:Subscription,payload:string)=>Promise<unknown>}
export class SessionPush{
 private active=new Set<Promise<void>>();
 constructor(private service:KanvasService,private options?:PushOptions){}
 get publicKey(){return this.options?.publicKey;}
 async canNotify(ownerId:string){
  if(!this.options)return false;
  for(const s of await this.service.store.list<Saved>('push-subscription'))if(s.ownerId===ownerId){const b=await this.service.store.get<BrowserSession>('browser',s.browserId);if(b&&b.userId===ownerId&&b.expiresAt>Date.now()&&!b.scopedSessionId)return true;}
  return false;
 }
 async subscribe(p:AuthPrincipal,raw:unknown){
  await this.service.fullAccount(p,'publish');if(!p.browserId||!this.options)throw new AppError('UNAVAILABLE','Notifications are not configured on this installation.',409);
  const subscription=pushSubscriptionSchema.parse(raw),key=hash(subscription.endpoint);
  return this.service.store.atomic(async()=>{
   const old=await this.service.store.get<Saved>('push-subscription',key);
   if(old&&(old.ownerId!==p.userId||old.browserId!==p.browserId)){
    const browser=await this.service.store.get<BrowserSession>('browser',old.browserId);
    if(browser&&browser.expiresAt>Date.now())throw new AppError('CONFLICT','This subscription belongs to another sign-in. Disable it in that browser first.',409);
   }
   const records=(await this.service.store.list<Saved>('push-subscription')).filter(s=>s.ownerId===p.userId);
   if(!old&&records.length>=10)throw new AppError('LIMIT_REACHED','At most ten notification devices per account.',429);
   await this.service.store.put('push-subscription',{id:key,ownerId:p.userId,browserId:p.browserId,subscription,createdAt:now()});return {enabled:true};
  });
 }
 async unsubscribe(p:AuthPrincipal){await this.service.fullAccount(p,'publish');await this.service.store.atomic(async()=>{for(const r of await this.service.store.list<Saved>('push-subscription'))if(r.ownerId===p.userId&&r.browserId===p.browserId)await this.service.store.delete('push-subscription',r.id);});return {enabled:false};}
 async status(p:AuthPrincipal){await this.service.fullAccount(p);return {configured:Boolean(this.options),publicKey:this.publicKey,enabled:(await this.service.store.list<Saved>('push-subscription')).some(r=>r.ownerId===p.userId&&r.browserId===p.browserId)};}
 enqueue(p:AuthPrincipal,sessionId:string,displayId:string){if(!this.options||!p.tokenId||this.active.size>=4)return;const job=this.send(p,sessionId,displayId).catch(()=>{}).finally(()=>this.active.delete(job));this.active.add(job);}
 private async send(p:AuthPrincipal,sessionId:string,displayId:string){
  const options=this.options;if(!options)return;
  // Only the owner, first display and a newly-created session; never shared-session notifications.
  const targets=await this.service.store.atomic(async()=>{
   await this.service.auth.assertCurrent(p,'publish',sessionId);
   const session=await this.service.store.get<SessionRecord>('session',sessionId);
   if(!session||session.ownerId!==p.userId||session.endedAt||Date.now()-Date.parse(session.createdAt)>60000)return [];
   if((await this.service.store.list('display',sessionId)).length!==1)return [];
   if((await this.service.devices.list(p)).devices.some(d=>d.connected))return [];
   if(await this.service.store.get('push-notice',sessionId))return [];
   const notices=(await this.service.store.list<{id:string;ownerId:string;at:string}>('push-notice')).filter(n=>n.ownerId===p.userId);
   if(notices.filter(n=>Date.parse(n.at)>Date.now()-3600000).length>=10)return [];
   for(const n of notices)if(Date.parse(n.at)<Date.now()-86400000)await this.service.store.delete('push-notice',n.id);
   await this.service.store.put('push-notice',{id:sessionId,sessionId,ownerId:p.userId,at:now()});
   return (await this.service.store.list<Saved>('push-subscription')).filter(s=>s.ownerId===p.userId).slice(0,10);
  });
  for(const target of targets){
   // Recheck immediately before egress; logout/revocation and account switching invalidate the binding.
   const current=await this.service.store.get<Saved>('push-subscription',target.id),browser=await this.service.store.get<BrowserSession>('browser',target.browserId);
   if(!current||current.ownerId!==p.userId||current.browserId!==target.browserId)continue;
   if(!browser||browser.userId!==p.userId||browser.expiresAt<=Date.now()||browser.scopedSessionId){await this.service.store.atomic(()=>this.service.store.delete('push-subscription',target.id));continue;}
   await this.service.display(p,sessionId,displayId,'editor');
   if(!safePushEndpoint(target.subscription.endpoint))continue;
   const payload=JSON.stringify({title:'Kanvas is ready',body:'Open your new session.',url:'/view/'+encodeURIComponent(sessionId)+'/'+encodeURIComponent(displayId),tag:'kanvas-session-'+sessionId});
   try{if(options.send)await options.send(target.subscription,payload);else await webpush.sendNotification(target.subscription,payload,{TTL:300,timeout:5000,urgency:'normal',vapidDetails:{subject:options.subject,publicKey:options.publicKey,privateKey:options.privateKey}});}
   catch(e){const status=(e as {statusCode?:number}).statusCode;if(status===404||status===410)await this.service.store.atomic(()=>this.service.store.delete('push-subscription',target.id));}
  }
 }
 async close(){await Promise.allSettled(this.active);}
}
export function mountPush(app:Express,push:SessionPush,browser:(req:Request)=>Promise<AuthPrincipal>){
 app.get('/api/push',async(req,res)=>res.json({data:await push.status(await browser(req))}));
 app.post('/api/push',async(req,res)=>res.json({data:await push.subscribe(await browser(req),req.body)}));
 app.delete('/api/push',async(req,res)=>res.json({data:await push.unsubscribe(await browser(req))}));
}
