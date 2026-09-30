import { hash } from './auth.js';
import { now, type Store } from './store.js';
import type { ToastRecord } from '../shared/viewer-experience.js';
import type { SessionRecord } from '../shared/types.js';

/** Actual backend lifecycle events only; no source revision or history writes. */
export async function lifecycleNotice(store:Store,sessionId:string,displayId:string,key:string,text:string,severity:ToastRecord['severity']='info'){
  const session=(await store.get<SessionRecord>('session',sessionId));if(!session||session.endedAt)return;
  const notificationId=hash(`lifecycle:${sessionId}:${key}`),prior=(await store.get<ToastRecord>('toast',notificationId));if(prior)return;
  const all=(await store.list<ToastRecord>('toast',sessionId));
  for(const old of all)if(Date.parse(old.expiresAt)<=Date.now())(await store.delete('toast',old.id));
  const current=all.filter(x=>Date.parse(x.expiresAt)>Date.now());for(const old of current.slice(0,Math.max(0,current.length-99)))(await store.delete('toast',old.id));
  (await store.put('toast',{id:notificationId,sessionId,displayId,ownerId:session.ownerId,text:text.slice(0,700),severity,createdAt:now(),expiresAt:new Date(Date.now()+60_000).toISOString(),sticky:false}));
}
