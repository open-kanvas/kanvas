import {browserContext} from '../shared/recognition.js';
import {AsyncLocalStorage} from 'node:async_hooks';
import type {Request,RequestHandler,Express} from 'express';
import {z} from 'zod';
import type {KanvasService} from './domain.js';
import type {AuthPrincipal} from './auth.js';
import type {UpdateRecord} from '../shared/types.js';
import {hash} from './auth.js';
const ingress=new AsyncLocalStorage<{request:Request;receivedAt:string;monotonic:number}>();
export const deliveryIngress:RequestHandler=(request,_response,next)=>ingress.run({request,receivedAt:new Date().toISOString(),monotonic:performance.now()},next);
/** Request content is deliberately retained internally. Transport headers/cookies are never captured.
 * Explicit credentials and secret-bearing URL parameters are the sole redactions. */
export function redactDeliveryRequest(value:unknown):unknown{
 if(Array.isArray(value))return value.map(redactDeliveryRequest);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,/^(?:authorization|cookie|set-cookie|password|secret|client_secret|access_token|refresh_token|csrfToken|proof|apiKey|api_key)$/i.test(key)?'[credential redacted]':redactDeliveryRequest(item)]));
 if(typeof value==='string')return value.replace(/(Bearer\s+)[A-Za-z0-9._~-]+/gi,'$1[redacted]').replace(/([?&#](?:token|key|secret|code|signature|access_token|refresh_token|client_secret)=)[^&#\s]+/gi,'$1[redacted]');
 return value;
}
interface RequestRecord {id:string;sessionId:string;requestId:string;operation:string;request:unknown;receivedAt:string;validatedAt:string;processingMs:number;payloadBytes:number;pushedAt?:string;revisions:Record<string,number>}
export async function recordDeliveryRequest(service:KanvasService,update:UpdateRecord,fallback:unknown,operation:string){const context=ingress.getStore(),request=redactDeliveryRequest(context?.request.body??fallback),stamp=new Date().toISOString();const record:RequestRecord={id:update.id,sessionId:update.sessionId,requestId:update.requestId,operation,request,receivedAt:context?.receivedAt??update.createdAt,validatedAt:stamp,processingMs:context?performance.now()-context.monotonic:Date.now()-Date.parse(update.createdAt),payloadBytes:Buffer.byteLength(JSON.stringify(request)),revisions:update.revisions,...(update.status==='prepared'?{pushedAt:stamp}:{})};await service.store.put('delivery-request',record);}
export async function markDeliveryPush(service:KanvasService,update:UpdateRecord){const record=await service.store.get<RequestRecord>('delivery-request',update.id);if(record){record.pushedAt=new Date().toISOString();record.revisions=update.revisions;await service.store.put('delivery-request',record);}}
const stamp=z.number().finite().nonnegative(),input=z.object({revision:z.number().int().nonnegative(),tabId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),received:stamp,rendered:stamp,painted:stamp,clientPaintedAt:z.string().datetime(),visible:z.boolean(),width:z.number().positive().max(32768),height:z.number().positive().max(32768),pixelRatio:z.number().positive().max(20),connection:z.enum(['live','offline','connecting','closed'])}).strict().refine(v=>v.rendered>=v.received&&v.painted>=v.rendered&&v.painted-v.received<=86400000);
export function mountDeliveryTelemetry(app:Express,service:KanvasService,browser:(req:Request)=>Promise<AuthPrincipal>){app.post('/api/sessions/:id/displays/:displayId/paint-timing',async(req,res)=>{
 const p=await browser(req),a=input.parse(req.body),sessionId=String(req.params.id),displayId=String(req.params.displayId),d=await service.display(p,sessionId,displayId);
 if(p.captureOnly||d.revision!==a.revision){res.json({data:{recorded:false}});return;}
 const update=(await service.store.list<UpdateRecord>('update',sessionId)).find(u=>u.revisions[displayId]===a.revision),request=update?await service.store.get<RequestRecord>('delivery-request',update.id):undefined;
 if(!request){res.json({data:{recorded:false,reason:'no-instrumented-request'}});return;}
 const viewerId=service.experience.viewerId(p,a.tabId),id=hash(`${request.id}:${displayId}:${viewerId}`),acknowledgedAt=new Date().toISOString();
 await service.store.atomic(async()=>{if(await service.store.get('delivery-paint',id))return;await service.store.put('delivery-paint',{...request,id,updateId:request.id,displayId,revision:a.revision,viewerId,template:d.view?.template??null,viewer:{...a,tabId:undefined,...browserContext(req.get('user-agent')??''),userAgent:(req.get('user-agent')??'').slice(0,500)},acknowledgedAt,requestToAckUpperBoundMs:Date.parse(acknowledgedAt)-Date.parse(request.receivedAt),receiveToRenderMs:a.rendered-a.received,renderToPaintMs:a.painted-a.rendered,receiveToPaintMs:a.painted-a.received,paintConfirmed:a.visible,clockBasis:'Server ingress/push/ack share server clock; viewer receive/render/paint use one performance clock. Request-to-ack is an upper bound including return network; client wall time is descriptive, never subtracted from server time.'});});res.json({data:{recorded:true}});
 });}
