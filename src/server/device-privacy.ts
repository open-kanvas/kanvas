import type {Express,Request,Response} from 'express';
import {z} from 'zod';
import {hash,opaque,type AuthPrincipal} from './auth.js';
import type {KanvasService} from './domain.js';
import type {Device} from './entry-devices.js';
import {AppError,now} from './store.js';
export const deviceLockSchema=z.object({deviceId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)}).strict();
interface Lock {id:string;locked:boolean;changedAt:string;ownerId:string}
interface Binding {id:string;deviceId:string}
/** Privacy boundary is a browser installation, not hardware or a session. */
export class DevicePrivacy {
 private responses=new Map<string,Set<Response>>();
 constructor(readonly service:KanvasService){}
 private get cookie(){return this.service.auth.secure?'__Host-kanvas-privacy':'kanvas-privacy';}
 async device(req:Request):Promise<string|undefined>{
  const token=req.cookies?.[this.cookie];
  if(typeof token==='string'){const binding=await this.service.store.get<Binding>('device-privacy-binding',hash(token));if(binding)return binding.deviceId;}
  // Existing sessions are covered even before receiving the new persistent cookie.
  try{const {principal:p}=await this.service.auth.browser(req);return (await this.service.store.list<Device>('registered-device')).find(d=>d.browserId===p.browserId)?.id;}catch{return;}
 }
 async locked(deviceId?:string){return deviceId?Boolean((await this.service.store.get<Lock>('device-privacy',deviceId))?.locked):false;}
 async bind(req:Request,res:Response,deviceId:string){
  if(await this.locked(deviceId))throw new AppError('DEVICE_LOCKED','Locked from your AI assistant.',423);
  const existing=await this.device(req);const token=req.cookies?.[this.cookie];
  if(existing===deviceId&&typeof token==='string'&&await this.service.store.get('device-privacy-binding',hash(token)))return;
  const value=opaque();await this.service.store.put('device-privacy-binding',{id:hash(value),deviceId});
  res.cookie(this.cookie,value,{httpOnly:true,secure:this.service.auth.secure,sameSite:'strict',path:'/',maxAge:365*86400000});
 }
 async set(p:AuthPrincipal,raw:unknown,locked:boolean){
  const {deviceId}=deviceLockSchema.parse(raw);
  return this.service.store.atomic(async()=>{
   const device=await this.service.devices.ownedDevice(p,deviceId,true);
   const state:Lock={id:deviceId,locked,ownerId:device.ownerId,changedAt:now()};await this.service.store.put('device-privacy',state);
   this.service.store.afterCommit(()=>{if(locked)for(const res of this.responses.get(deviceId)??[]){if(!res.headersSent)res.status(423).json({error:{code:'DEVICE_LOCKED',message:'Locked from your AI assistant.'}});else res.end();}});
   return {deviceId,locked,changedAt:state.changedAt};
  });
 }
 mount(app:Express){
  app.get('/api/device-privacy/status',async(req,res)=>{res.json({data:{locked:await this.locked(await this.device(req))}});});
  app.use(async(req,res,next)=>{
   // Bearer MCP control remains available to the authorized owner. Browser data
   // routes, including public-session APIs and media, all pass this boundary.
   if(!req.path.startsWith('/api/'))return next();
   const deviceId=await this.device(req);if(!deviceId)return next();
   if(await this.locked(deviceId))throw new AppError('DEVICE_LOCKED','Locked from your AI assistant.',423);
   let set=this.responses.get(deviceId);if(!set){set=new Set();this.responses.set(deviceId,set);}set.add(res);
   const done=()=>{set!.delete(res);if(!set!.size)this.responses.delete(deviceId);};res.once('finish',done);res.once('close',done);next();
  });
 }
}
