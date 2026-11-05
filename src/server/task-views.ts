import { chatAppendSchema } from './mcp/work-tools.js';
import { chatDataSchema } from '../shared/work-views.js';
import type { KanvasService } from './domain.js';
import { hash, type AuthPrincipal } from './auth.js';
import { AppError, now } from './store.js';
import { displayedLeaf } from './engagement.js';
import { progressAppendSchema, progressDataSchema } from '../shared/task-views.js';
import type { UpdateRecord } from '../shared/types.js';

export async function progressAppend(service:KanvasService,p:AuthPrincipal,raw:unknown){
  const a=progressAppendSchema.parse(raw),d=(await service.display(p,a.sessionId,a.displayId,'editor'));
  const key=hash(`${p.tokenId??p.userId}:${a.sessionId}:${a.requestId}`),digest=hash(JSON.stringify(a));
  const prior=(await service.store.get<{digest:string;result:UpdateRecord}>('progress-receipt',key));
  if(prior){if(prior.digest!==digest)throw new AppError('REQUEST_ID_CONFLICT','This progress request was already used with different content.',409);return prior.result;}
  service.assertRevision(a.expectedRevision,d.revision);
  const leaf=displayedLeaf(d.view);if(leaf?.template!=='progress')throw new AppError('INVALID_VIEW','Publish a progress view before appending events.',409);
  const data=progressDataSchema.parse(leaf.data);
  if(data.events.some(e=>e.id===a.event.id))throw new AppError('EVENT_EXISTS','This event ID already exists. Use patch for an explicit correction.',409);
  if(data.events.length>=500)throw new AppError('LIMIT_REACHED','This progress view already has 500 events.',429);
  const prefix=d.view!.template==='presentation'?`/data/slides/${Number(d.view!.data.index??0)}/data`:'/data';
  return (await service.store.transaction(async ()=>{
    const result=(await service.patches.patch(p,{sessionId:a.sessionId,displayId:d.id,requestId:a.requestId,expectedRevision:a.expectedRevision,operations:[{op:'set',path:`${prefix}/events`,value:[...data.events,{...a.event,timestamp:a.event.timestamp??now()}]},...(a.status?[{op:'set',path:`${prefix}/status`,value:a.status}]:[])]}));
    (await service.store.put('progress-receipt',{id:key,sessionId:a.sessionId,digest,result}));
    
    return result;
  }));
}

export async function chatAppend(service:KanvasService,p:AuthPrincipal,raw:unknown){
  const a=chatAppendSchema.parse(raw),d=(await service.display(p,a.sessionId,a.displayId,'editor'));
  const key=hash(`${p.tokenId??p.userId}:${a.sessionId}:${a.requestId}`),digest=hash(JSON.stringify(a)),prior=(await service.store.get<{digest:string;result:UpdateRecord}>('chat-receipt',key));
  if(prior){if(prior.digest!==digest)throw new AppError('REQUEST_ID_CONFLICT','This chat request was used with different content.',409);return prior.result;}
  service.assertRevision(a.expectedRevision,d.revision);
  if(d.held)throw new AppError('DISPLAY_HELD','Release the display hold before appending messages.',409);
  const leaf=displayedLeaf(d.view);if(leaf?.template!=='chat')throw new AppError('INVALID_VIEW','Publish a chat thread before appending messages.',409);
  const data=chatDataSchema.parse(leaf.data),ids=new Set(data.messages.map(m=>m.id));
  for(const m of a.messages){if(ids.has(m.id))throw new AppError('MESSAGE_EXISTS','This message ID already exists. Use patch for an explicit correction.',409);ids.add(m.id);}
  if(ids.size>1000)throw new AppError('LIMIT_REACHED','This thread already has the maximum retained messages. Start a new supplied excerpt.',429);
  const prefix=d.view!.template==='presentation'?`/data/slides/${Number(d.view!.data.index??0)}/data`:'/data';
  return (await service.store.transaction(async ()=>{const result=(await service.patches.patch(p,{sessionId:a.sessionId,displayId:d.id,requestId:a.requestId,expectedRevision:a.expectedRevision,operations:[{op:'set',path:`${prefix}/messages`,value:[...data.messages,...a.messages]}]}));(await service.store.put('chat-receipt',{id:key,sessionId:a.sessionId,digest,result}));return result;}));
}
