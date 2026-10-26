import {requestContext} from './request-context.js';
import {randomInt} from 'node:crypto';
import QRCode from 'qrcode';
import {z} from 'zod';
import type {Express,Request} from 'express';
import type {KanvasService} from './domain.js';
import {hash,opaque,type AuthPrincipal,type BrowserSession} from './auth.js';
import {AppError,id,now} from './store.js';
import {NATO_WORDS,browserContext} from '../shared/recognition.js';
import type {Device} from './entry-devices.js';
const codeSchema=z.string().trim().toUpperCase().regex(/^[A-Z2-9]{8}$/);
export const screenReadSchema=z.object({code:codeSchema}).strict();
export const screenDecideSchema=z.object({code:codeSchema,label:z.string().max(80),approve:z.boolean(),confirm:z.literal(true),name:z.string().trim().min(1).max(100).optional()}).strict();
interface Enrollment {id:string;code:string;label:string;proof:string;status:'pending'|'approved'|'denied'|'claimed'|'cancelled';expiresAt:number;createdAt:string;context:ReturnType<typeof browserContext>;ownerId?:string;sessionId?:string;displayId?:string;name?:string;deviceId?:string;}
const cookie='kanvas-screen-proof';
const rates=new Map<string,{count:number;until:number}>();
function rate(key:string,max=30){const time=Date.now();for(const [k,v] of rates)if(v.until<time)rates.delete(k);const row=rates.get(key)??{count:0,until:time+60000};if(++row.count>max)throw new AppError('RATE_LIMITED','Wait before trying another screen code.',429);rates.set(key,row);}
function publicRequest(e:Enrollment){return {code:e.code,label:e.label,status:e.expiresAt<=Date.now()?'expired':e.status,expiresAt:new Date(e.expiresAt).toISOString(),context:e.context,permissions:['Receive owner-selected displays only'],name:e.name};}
async function find(service:KanvasService,code:string){const e=(await service.store.list<Enrollment>('screen-enrollment')).find(x=>x.code===code&&x.expiresAt>Date.now()&&['pending','approved'].includes(x.status));if(!e)throw new AppError('NOT_FOUND','This screen request is unavailable or expired.',404);return e;}
async function owner(service:KanvasService,p:AuthPrincipal){await service.fullAccount(p,'publish');if(p.tokenId&&(await service.store.get<{sessionIds?:string[]}>('token',p.tokenId))?.sessionIds)throw new AppError('FORBIDDEN','An account-wide grant is required.',403);}
export async function screenRead(service:KanvasService,p:AuthPrincipal,raw:unknown){await owner(service,p);rate('lookup:'+p.userId,20);return publicRequest(await find(service,screenReadSchema.parse(raw).code));}
export async function screenDecide(service:KanvasService,p:AuthPrincipal,raw:unknown){await owner(service,p);await service.auth.requireFresh(p);const a=screenDecideSchema.parse(raw);rate('decide:'+p.userId,20);return service.store.atomic(async()=>service.store.transaction(async()=>{
 const e=await find(service,a.code);if(e.status!=='pending')throw new AppError('CONFLICT','This screen has already been decided.',409);if(e.label!==a.label)throw new AppError('INVALID_ARGUMENT','Confirm the exact label displayed on the intended screen.');
 e.status=a.approve?'approved':'denied';if(a.approve){const home=await service.devices.provision(p);e.ownerId=p.userId;e.sessionId=home.sessionId;e.name=a.name??`${e.context.device} screen`;const display=await service.createDisplay(p,home.sessionId,{name:e.name,width:1920,height:1080});e.displayId=display.id;}
 await service.store.put('screen-enrollment',e);return publicRequest(e);
}));}
export function mountScreenEnrollment(app:Express,service:KanvasService,browser:(req:Request)=>Promise<AuthPrincipal>){
 app.post('/api/screens/request',async(req,res)=>{rate('create:'+req.ip,10);const proof=opaque();const result=await service.store.atomic(async()=>{
  for(const old of await service.store.list<Enrollment>('screen-enrollment'))if(old.expiresAt<Date.now()-86400000)await service.store.delete('screen-enrollment',old.id);
  const pending=(await service.store.list<Enrollment>('screen-enrollment')).filter(e=>e.expiresAt>Date.now());if(pending.length>=2048)throw new AppError('LIMIT_REACHED','Please try again later.',429);
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',code=Array.from({length:8},()=>alphabet[randomInt(alphabet.length)]).join(''),label=NATO_WORDS[randomInt(NATO_WORDS.length)]+' '+NATO_WORDS[randomInt(NATO_WORDS.length)];
  const e:Enrollment={id:id(),code,label,proof:hash(proof),status:'pending',expiresAt:Date.now()+10*60000,createdAt:now(),context:await requestContext(req)};
  for(const other of pending)if(['pending','approved'].includes(other.status)&&(other.code===code||other.label===label)){other.status='cancelled';await service.store.put('screen-enrollment',other);e.status='cancelled';}
  await service.store.put('screen-enrollment',e);return e;
 });res.cookie(cookie,proof,{httpOnly:true,secure:service.auth.secure,sameSite:'strict',path:'/api/screens',maxAge:10*60000});const url=`${service.publicUrl}/connect?screen_code=${result.code}`;res.json({data:{...publicRequest(result),approvalUrl:url,qr:await QRCode.toDataURL(url,{margin:2,width:256})}});});
 app.get('/api/screens/status',async(req,res)=>{rate('status:'+req.ip,120);const proof=req.cookies?.[cookie];if(typeof proof!=='string')throw new AppError('UNAUTHORIZED','Start a new screen request.',401);const e=(await service.store.list<Enrollment>('screen-enrollment')).find(x=>x.proof===hash(proof));if(!e)throw new AppError('UNAUTHORIZED','Start a new screen request.',401);res.json({data:publicRequest(e)});});
 app.post('/api/screens/claim',async(req,res)=>{rate('claim:'+req.ip,30);const proof=req.cookies?.[cookie];if(typeof proof!=='string')throw new AppError('UNAUTHORIZED','Start a new screen request.',401);const result=await service.store.atomic(async()=>service.store.transaction(async()=>{
  const e=(await service.store.list<Enrollment>('screen-enrollment')).find(x=>x.proof===hash(proof));if(!e||e.status!=='approved'||e.expiresAt<=Date.now()||!e.ownerId||!e.sessionId||!e.displayId)throw new AppError('FORBIDDEN','This screen is not approved.',403);
  const owned=(await service.store.list<Device>('registered-device')).filter(d=>d.ownerId===e.ownerId);if(owned.length>=48)throw new AppError('LIMIT_REACHED','The account device limit was reached.',429);
  const pairingId=id(),deviceId=id();const session=await service.auth.issueBrowser(e.ownerId,res,{scopedSessionId:e.sessionId,scopedDisplayId:e.displayId,pairingId,receiverDeviceId:deviceId},req);
  await service.store.put('pairing',{id:pairingId,sessionId:e.sessionId,displayId:e.displayId,status:'approved',ownerId:e.ownerId,browserSessionId:session.id,grantExpiresAt:session.expiresAt,createdAt:now(),expiresAt:new Date(session.expiresAt).toISOString(),label:e.label,deviceName:e.name,receiverDeviceId:deviceId});
  const d:Device={id:deviceId,ownerId:e.ownerId,installation:hash(proof),browserId:session.id,name:e.name!,context:e.context,version:0,createdAt:now(),lastSeenAt:now(),homeSessionId:e.sessionId,homeDisplayId:e.displayId,sessionId:e.sessionId,displayId:e.displayId};await service.store.put('registered-device',d);e.status='claimed';e.deviceId=deviceId;await service.store.put('screen-enrollment',e);return {viewerUrl:`${service.publicUrl}/view/${e.sessionId}/${e.displayId}`};
 }));res.clearCookie(cookie,{path:'/api/screens'});res.json({data:result});});
 app.post('/api/screens/lookup',async(req,res)=>res.json({data:await screenRead(service,await browser(req),req.body)}));
 app.post('/api/screens/decide',async(req,res)=>res.json({data:await screenDecide(service,await browser(req),req.body)}));
 app.get('/api/screens/receiver',async(req,res)=>{const p=await browser(req);if(!p.receiverDeviceId)throw new AppError('FORBIDDEN','This is not a screen receiver.',403);const d=await service.devices.receiverDevice(p,p.receiverDeviceId);res.json({data:{id:d.id,name:d.name,context:d.context}});});
}
/** Owner-selected destinations update the same revocable narrow grant atomically. */
export async function retargetReceiver(service:KanvasService,d:Device,sessionId:string,displayId:string){const b=await service.store.get<BrowserSession>('browser',d.browserId);if(!b?.receiverDeviceId)return;const pair=await service.store.get<Record<string,unknown>&{id:string}>('pairing',b.pairingId!);if(!pair||pair.status!=='approved')throw new AppError('FORBIDDEN','This screen was revoked.',403);b.scopedSessionId=sessionId;b.scopedDisplayId=displayId;pair.sessionId=sessionId;pair.displayId=displayId;await service.store.put('browser',b);await service.store.put('pairing',pair);}
