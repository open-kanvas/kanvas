import {retargetReceiver} from './screen-enrollment.js';
import { asyncFilter, asyncMap } from './async-collections.js';
import { EventEmitter } from 'node:events';
import { WindowReceivers } from './window-receivers.js';
import type { Express, Request } from 'express';
import { z } from 'zod';
import type { DisplayRecord } from '../shared/types.js';
import { browserContext } from '../shared/recognition.js';
import { hash, type AuthPrincipal } from './auth.js';
import type { KanvasService } from './domain.js';
import { AppError, id, now } from './store.js';

const identifier=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const devicePresentSchema=z.object({deviceId:identifier.optional(),match:z.object({name:z.string().max(100).optional(),location:z.string().max(160).optional(),tag:z.string().max(80).optional()}).strict().optional(),sessionId:identifier,displayId:identifier,expectedVersion:z.number().int().nonnegative().optional(),requestId:identifier}).strict();
export const deviceRenameSchema=z.object({deviceId:identifier,name:z.string().trim().min(1).max(100).optional(),location:z.string().trim().max(160).nullable().optional(),role:z.string().trim().max(160).nullable().optional(),tags:z.array(z.string().trim().min(1).max(80)).max(24).optional(),defaultSessionId:identifier.nullable().optional(),expectedVersion:z.number().int().nonnegative().optional()}).strict();
interface Entry {id:string;sessionId:string;displayId:string}
export interface DeviceCommand {id:string;sessionId:string;displayId:string;issuedAt:string;expiresAt:number;status:'pending'|'applied';appliedAt?:string;renderedRevision?:number;windowIds?:string[]}
export interface Device {id:string;ownerId:string;installation:string;browserId:string;name:string;location?:string;role?:string;tags?:string[];defaultSessionId?:string;context:ReturnType<typeof browserContext>;homeSessionId?:string;homeDisplayId?:string;version:number;createdAt:string;lastSeenAt:string;sessionId?:string;displayId?:string;renderedRevision?:number;command?:DeviceCommand}
interface Connected {principal:AuthPrincipal;count:number;lastSeenAt:string}

/** A device ID is an address, never authority. Browser sessions bind receivers;
 * account grants authorize targeting. Only live streams establish online state. */
export class EntryDevices {
  private readonly events=new EventEmitter();
  private readonly connected=new Map<string,Connected>();
  readonly windows:WindowReceivers;
  constructor(readonly service:KanvasService){this.events.setMaxListeners(1024);this.windows=new WindowReceivers(this);}
  private async account(p:AuthPrincipal,write=false){
    (await this.service.fullAccount(p,write?'publish':'read'));
    if(p.captureOnly||p.tokenId&&(await this.service.store.get<{sessionIds?:string[]}>('token',p.tokenId))?.sessionIds)throw new AppError('FORBIDDEN','An account-wide grant is required for registered devices.',403);
  }
  async isEntrySession(sessionId:string){return (await this.service.store.list<Entry>('account-entry')).some(e=>e.sessionId===sessionId);}
  async existing(p:AuthPrincipal){(await this.account(p));const e=(await this.service.store.get<Entry>('account-entry',p.userId));if(!e)return null;try{(await this.service.display(p,e.sessionId,e.displayId));return this.target(e.sessionId,e.displayId);}catch{return null;}}
  private target(sessionId:string,displayId:string){return {sessionId,displayId,viewerUrl:`${this.service.publicUrl}/view/${sessionId}/${displayId}`};}
  async provision(p:AuthPrincipal):Promise<Awaited<Entry>>{
    return this.service.store.atomic(async () => {
    (await this.account(p,true));const prior=(await this.service.store.get<Entry>('account-entry',p.userId));
    if(prior){try{(await this.service.display(p,prior.sessionId,prior.displayId,'editor'));return prior;}catch{/* Ended/deleted home can be explicitly recreated. */}}
    return (await this.service.store.transaction(async ()=>{
      const session=(await this.service.createSession(p,'Home')),display=(await this.service.createDisplay(p,session.id,{name:'Home',width:1280,height:800}));
      const entry={id:p.userId,sessionId:session.id,displayId:display.id};(await this.service.store.put('account-entry',entry));
      (await this.service.publishHome(p,session.id,display.id));return entry;
    }));

    });
  }
  private async device(p:AuthPrincipal,deviceId:string,write=false){(await this.account(p,write));const d=(await this.service.store.get<Device>('registered-device',deviceId));if(!d||d.ownerId!==p.userId)throw new AppError('NOT_FOUND','This registered device is unavailable.',404);return d;}
  private async receiver(p:AuthPrincipal,deviceId:string){if(p.receiverDeviceId){const current=await this.service.store.get<{scopedSessionId?:string}>('browser',p.browserId!);await this.service.auth.assertCurrent(p,'read',current?.scopedSessionId);const d=await this.service.store.get<Device>('registered-device',deviceId);if(!d||p.receiverDeviceId!==deviceId||d.browserId!==p.browserId||d.ownerId!==p.userId)throw new AppError('FORBIDDEN','This receiver cannot access another device.',403);return d;}const d=(await this.device(p,deviceId));if(!p.browserId||d.browserId!==p.browserId)throw new AppError('FORBIDDEN','Only this device’s signed-in browser can receive or acknowledge its commands.',403);return d;}
  async ownedDevice(p:AuthPrincipal,deviceId:string,write=false){return (await this.device(p,deviceId,write));}
  async receiverDevice(p:AuthPrincipal,deviceId:string){return (await this.receiver(p,deviceId));}
  private async online(d:Device){if((await this.windows.hasOnline(d)))return true;const c=this.connected.get(d.id);if(!c?.count||c.principal.browserId!==d.browserId)return false;try{(await this.receiver(c.principal,d.id));return true;}catch{return false;}}
  private async public(d:Device){const command=d.command?{...d.command,status:(await this.windows.commandSuperseded(d.command))?'superseded':d.command.status==='pending'&&d.command.expiresAt<=Date.now()?'expired':d.command.status}:undefined;
    const windows=(await this.windows.listForDevice(d));
    return {id:d.id,name:d.name,location:d.location,role:d.role,tags:d.tags,defaultSessionId:d.defaultSessionId,version:d.version,context:d.context,windows,connected:(await this.online(d)),lastSeenAt:d.lastSeenAt,...(!windows.some(w=>!w.current||w.current.sessionId!==d.sessionId||w.current.displayId!==d.displayId)&&d.sessionId&&d.displayId?{current:this.target(d.sessionId,d.displayId),renderedRevision:d.renderedRevision}:{}),...(d.homeSessionId&&d.homeDisplayId?{home:this.target(d.homeSessionId,d.homeDisplayId)}:{}),command};}
  async register(p:AuthPrincipal,raw:unknown,userAgent:string){
    return this.service.store.atomic(async () => {
    (await this.account(p,true));if(!p.browserId)throw new AppError('FORBIDDEN','Register from a signed-in browser.',403);
    const a=z.object({installationId:identifier,name:z.string().trim().min(1).max(100).optional(),provisionHome:z.boolean().default(true)}).strict().parse(raw),installation=hash(`${p.userId}:${a.installationId}`),prior=(await this.service.store.list<Device>('registered-device')).find(d=>d.ownerId===p.userId&&d.installation===installation);
    if(prior){const rebound=prior.browserId!==p.browserId;if(rebound){prior.browserId=p.browserId;prior.command=undefined;prior.version++;}prior.lastSeenAt=now();(await this.service.store.put('registered-device',prior));if(rebound)this.events.emit(prior.id);return (await this.public(prior));}
    const owned=(await this.service.store.list<Device>('registered-device')).filter(d=>d.ownerId===p.userId);if(owned.length>=48)throw new AppError('LIMIT_REACHED','This account has reached its 48-device limit.',429);
    return (await this.service.store.transaction(async ()=>{
      const context=browserContext(userAgent),stamp=now();
      const d:Device={id:id(),ownerId:p.userId,installation,browserId:p.browserId!,name:a.name??`${context.device} · ${context.browser}`,context,version:0,createdAt:stamp,lastSeenAt:stamp};
      // Idle account windows must be connectable even at the session quota.
      // /start still provisions its existing Home workflow; root/console do not.
      if(a.provisionHome)await this.ensureHome(p,d,a.name);
      await this.service.store.put('registered-device',d);return await this.public(d);
    }));

    });
  }
  private async ensureHome(p:AuthPrincipal,d:Device,homeName?:string){
    if(d.homeSessionId&&d.homeDisplayId)return this.target(d.homeSessionId,d.homeDisplayId);
    const entry=await this.provision(p),owned=(await this.service.store.list<Device>('registered-device')).filter(item=>item.ownerId===p.userId);
    const display=owned.some(item=>item.id!==d.id&&item.homeDisplayId===entry.displayId)?await this.service.createDisplay(p,entry.sessionId,{name:homeName??`${d.context.device} home`,width:1280,height:800}):await this.service.publicDisplay(await this.service.display(p,entry.sessionId,entry.displayId));
    d.homeSessionId=entry.sessionId;d.homeDisplayId=display.id;
    await this.service.publishHome(p,entry.sessionId,display.id);
    return this.target(entry.sessionId,display.id);
  }
  async open(p:AuthPrincipal,deviceId:string){
    return this.service.store.atomic(async()=>this.service.store.transaction(async()=>{
      const d=await this.receiver(p,deviceId);if(d.defaultSessionId){/* Only an account owner can set this persisted default; receiver proof was revalidated above. Recheck owner access before consuming that selection. */const owner=p.receiverDeviceId?{userId:d.ownerId}:p;await this.service.access(owner,d.defaultSessionId);const displays=await this.service.store.list<DisplayRecord>('display',d.defaultSessionId);if(displays.length){if(p.receiverDeviceId)await retargetReceiver(this.service,d,d.defaultSessionId,displays[0].id);return this.target(d.defaultSessionId,displays[0].id);}}const hadHome=Boolean(d.homeSessionId&&d.homeDisplayId),target=await this.ensureHome(p,d);
      if(hadHome)await this.service.publishHome(p,target.sessionId,target.displayId);
      await this.service.store.put('registered-device',d);return target;
    }));
  }
  async list(p:AuthPrincipal){(await this.account(p));return {devices:(await asyncMap((await this.service.store.list<Device>('registered-device')).filter(d=>d.ownerId===p.userId), async d=>(await this.public(d)))),note:'Connected means an authenticated receiver stream is open. Pending targeting is not a painted-display acknowledgement.'};}
  async rename(p:AuthPrincipal,raw:unknown){
    return this.service.store.atomic(async () => {const a=deviceRenameSchema.parse(raw),d=(await this.device(p,a.deviceId,true));this.service.assertRevision(a.expectedVersion,d.version);if(a.name!==undefined)d.name=a.name;for(const key of ['location','role','defaultSessionId'] as const)if(a[key]!==undefined){if(key==='defaultSessionId'&&a[key])await this.service.access(p,a[key]!);if(a[key])d[key]=a[key]!;else delete d[key];}if(a.tags!==undefined)d.tags=[...new Set(a.tags)];d.version++;(await this.service.store.put('registered-device',d));return (await this.public(d));
    });
  }
  async present(p:AuthPrincipal,raw:unknown){
    return this.service.store.atomic(async () => {const a=devicePresentSchema.parse(raw);await this.account(p,true);if(Boolean(a.deviceId)===Boolean(a.match))throw new AppError('INVALID_INPUT','Supply exactly one deviceId or match.',400);let deviceId=a.deviceId;if(a.match){const m=a.match;if(!m.name&&!m.location&&!m.tag)throw new AppError('INVALID_INPUT','Supply a name, location or tag.',400);const same=(a:string|undefined,b:string)=>a?.toLocaleLowerCase()===b.toLocaleLowerCase();const candidates=(await this.service.store.list<Device>('registered-device')).filter(d=>d.ownerId===p.userId&&(!m.name||same(d.name,m.name))&&(!m.location||same(d.location,m.location))&&(!m.tag||d.tags?.some(t=>same(t,m.tag!))));if(candidates.length!==1)throw new AppError('INVALID_INPUT','Device match must identify exactly one device. Read devices.read and target each intended device by ID and version.',409);deviceId=candidates[0].id;}const d=(await this.device(p,deviceId!,true));(await this.service.display(p,a.sessionId,a.displayId));
    const requestKey=hash(`${p.userId}:${a.requestId}`),digest=hash(JSON.stringify(a)),prior=(await this.service.store.get<{id:string;digest:string;deviceId:string;commandId:string}>('device-request',requestKey));
    if(prior){if(prior.digest!==digest)throw new AppError('REQUEST_ID_CONFLICT','This request ID was used for a different device command.',409);return {device:(await this.public(d)),commandId:prior.commandId,superseded:d.command?.id!==prior.commandId};}
    this.service.assertRevision(a.expectedVersion,d.version);if(!(await this.online(d)))throw new AppError('DEVICE_OFFLINE','Open KANVAS on that device before targeting it.',409);
    const command:DeviceCommand={id:id(),sessionId:a.sessionId,displayId:a.displayId,issuedAt:now(),expiresAt:Date.now()+180000,status:'pending'};d.command=command;d.version++;
    (await this.service.store.transaction(async ()=>{await retargetReceiver(this.service,d,a.sessionId,a.displayId);command.windowIds=(await this.windows.broadcast(p,d.id,command));(await this.service.store.put('registered-device',d));(await this.service.store.put('device-request',{id:requestKey,digest,deviceId:d.id,commandId:command.id}));}));(await this.windows.changed(d.id));this.events.emit(d.id);return {device:(await this.public(d)),commandId:command.id};

    });
  }
  async recordWindowPaint(p:AuthPrincipal,deviceId:string,a:{sessionId:string;displayId:string;renderedRevision:number;commandId?:string}){
    return this.service.store.atomic(async () => {
    const d=(await this.receiver(p,deviceId));d.sessionId=a.sessionId;d.displayId=a.displayId;d.renderedRevision=a.renderedRevision;d.lastSeenAt=now();
    if(a.commandId&&d.command?.id===a.commandId&&(await this.windows.commandComplete(d.command))){d.command.status='applied';d.command.appliedAt=now();d.command.renderedRevision=a.renderedRevision;}
    (await this.service.store.put('registered-device',d));

    });
  }
  async report(p:AuthPrincipal,deviceId:string,raw:unknown){
    return this.service.store.atomic(async () => {const a=z.object({sessionId:identifier,displayId:identifier,renderedRevision:z.number().int().nonnegative(),commandId:identifier.optional()}).strict().parse(raw),d=(await this.receiver(p,deviceId)),display=(await this.service.display(p,a.sessionId,a.displayId));
    if(display.revision!==a.renderedRevision)throw new AppError('STALE_OBSERVATION','The display changed before this paint report.',409);
    if(a.commandId){const c=d.command;if(!c||c.id!==a.commandId||c.expiresAt<=Date.now()||c.sessionId!==a.sessionId||c.displayId!==a.displayId)throw new AppError('STALE_COMMAND','This device command is no longer current.',409);if(!c.windowIds?.length||(await this.windows.commandComplete(c))){c.status='applied';c.appliedAt=now();c.renderedRevision=a.renderedRevision;}}
    d.sessionId=a.sessionId;d.displayId=a.displayId;d.renderedRevision=a.renderedRevision;d.lastSeenAt=now();(await this.service.store.put('registered-device',d));return {recorded:true,command:d.command?{id:d.command.id,status:d.command.status}:undefined};

    });
  }
  async stream(p:AuthPrincipal,deviceId:string,send:(data:unknown)=>void){(await this.receiver(p,deviceId));let done=false;const c=this.connected.get(deviceId);const state=c&&c.principal.browserId===p.browserId?c:{principal:p,count:0,lastSeenAt:now()};state.count++;this.connected.set(deviceId,state);
    const push=async ()=>{const d=(await this.receiver(p,deviceId));d.lastSeenAt=now();(await this.service.store.put('registered-device',d));let command=d.command;if(command?.status!=='pending'||command.expiresAt<=Date.now())command=undefined;if(command)(await this.service.display(p,command.sessionId,command.displayId));send({deviceId,command,connected:true});};
    const changed=async ()=>{try{(await push());}catch{send({unavailable:true});}};this.events.on(deviceId,changed);
    return {push,close:()=>{if(done)return;done=true;this.events.off(deviceId,changed);state.count--;if(!state.count&&this.connected.get(deviceId)===state)this.connected.delete(deviceId);}};
  }
  async forBrowser(p:AuthPrincipal){if(!p.browserId||p.scopedSessionId)return undefined;return (await this.service.store.list<Device>('registered-device')).find(d=>d.ownerId===p.userId&&d.browserId===p.browserId);}
  async participants(p:AuthPrincipal,sessionId:string){(await this.service.fullAccount(p));(await this.service.access(p,sessionId));const viewers=(await this.service.experience.viewers(p,sessionId));
    const devices=(await asyncFilter((await this.service.store.list<Device>('registered-device')), async d=>(d.sessionId===sessionId||(await this.windows.listForDevice(d)).some(w=>w.current?.sessionId===sessionId))&&Boolean((await this.service.accounts.effectiveRole(d.ownerId,sessionId)))));
    return {sessionId,participants:viewers.map(v=>({...v,kind:v.connectionMethod==='paired'?'guest':'registered-account'})),registeredDevices:(await asyncMap(devices, async d=>({id:d.id,name:d.name,connected:(await this.online(d)),lastSeenAt:d.lastSeenAt,...(d.sessionId===sessionId?{displayId:d.displayId,renderedRevision:d.renderedRevision}:{}),windows:(await this.windows.listForDevice(d)).filter(w=>w.current?.sessionId===sessionId).map(w=>({id:w.id,name:w.name,connected:w.connected,lastSeenAt:w.lastSeenAt,displayId:w.current?.displayId,renderedRevision:w.renderedRevision}))}))),note:'Guests and registered account browsers are shown together. Approvals alone do not establish presence; last-seen device records can be offline.'};
  }
  close(){this.events.removeAllListeners();this.connected.clear();this.windows.close();}
}

export function mountEntryDevices(app:Express,devices:EntryDevices,browser:(req:Request)=>Promise<Awaited<AuthPrincipal>>){
  app.post('/api/devices/register',async (req,res)=>{
    const {windowId,...raw}=z.object({installationId:identifier,name:z.string().optional(),windowId:identifier.optional(),provisionHome:z.boolean().optional()}).strict().parse(req.body),p=(await browser(req));
    const device=(await devices.register(p,raw,req.get('user-agent')??''));
    res.json({data:{...device,...(windowId?{window:(await devices.windows.register(p,device.id,windowId))}:{})}});
  });
  app.get('/api/devices',async (req,res)=>res.json({data:(await devices.list((await browser(req))))}));
  app.post('/api/entry/open',async (req,res)=>{const a=z.object({deviceId:identifier}).strict().parse(req.body);res.json({data:(await devices.open((await browser(req)),a.deviceId))});});
  app.post('/api/devices/:deviceId/report',async (req,res)=>{
    try{res.json({data:(await devices.report((await browser(req)),String(req.params.deviceId),req.body))});}
    catch(error){
      // Paint telemetry can legitimately arrive after a newer publication or
      // device command. Discard it explicitly; never acknowledge the new view.
      // Authentication, ownership and validation failures remain HTTP errors.
      if(error instanceof AppError&&['STALE_OBSERVATION','STALE_COMMAND'].includes(error.code))res.json({data:{recorded:false,reason:error.code}});
      else throw error;
    }
  });
  app.post('/api/devices/:deviceId/windows/:windowId/report',async (req,res)=>{
    try{res.json({data:(await devices.windows.report((await browser(req)),String(req.params.deviceId),String(req.params.windowId),req.body))});}
    catch(error){if(error instanceof AppError&&['STALE_OBSERVATION','STALE_COMMAND'].includes(error.code))res.json({data:{recorded:false,reason:error.code}});else throw error;}
  });
  app.post('/api/devices/:deviceId/windows/:windowId/overview',async (req,res)=>res.json({data:await devices.windows.overview(await browser(req),{...req.body,deviceId:req.params.deviceId,windowId:req.params.windowId})}));
  app.post('/api/devices/:deviceId/windows/:windowId/present',async (req,res)=>res.json({data:(await devices.windows.present((await browser(req)),{...req.body,deviceId:req.params.deviceId,windowId:req.params.windowId}))}));
  app.post('/api/devices/present',async (req,res)=>res.json({data:(await devices.present((await browser(req)),req.body))}));
  app.patch('/api/devices/:deviceId',async (req,res)=>res.json({data:(await devices.rename((await browser(req)),{...req.body,deviceId:req.params.deviceId}))}));
  app.get('/api/sessions/:id/participants',async (req,res)=>res.json({data:(await devices.participants((await browser(req)),String(req.params.id)))}));
  const closes=new Set<()=>void>();
  app.get('/api/devices/:deviceId/events',async (req,res)=>{
    const p=(await browser(req)),stream=(await devices.stream(p,String(req.params.deviceId),data=>res.write(`data: ${JSON.stringify(data)}\n\n`)));
    // A disconnect during asynchronous receiver registration must not leave
    // an unreachable live-device/window count behind.
    if(req.destroyed||res.destroyed){stream.close();return;}
    res.set({'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
    const close=()=>{clearInterval(timer);unsubscribeRevocation();stream.close();closes.delete(close);res.end();};
    const tick=async ()=>{try{(await stream.push());}catch{res.write('data: {"unavailable":true}\n\n');close();}};
    const unsubscribeRevocation=devices.service.auth.onBrowserRevoked(p.browserId!,close);
    const timer=setInterval(tick,15000);timer.unref();closes.add(close);req.on('close',close);(await tick());
  });
  app.get('/api/devices/:deviceId/windows/:windowId/events',async (req,res)=>{
    const p=(await browser(req)),stream=(await devices.windows.stream(p,String(req.params.deviceId),String(req.params.windowId),data=>res.write(`data: ${JSON.stringify(data)}\n\n`)));
    // A disconnect during asynchronous receiver registration must not leave
    // an unreachable live-device/window count behind.
    if(req.destroyed||res.destroyed){stream.close();return;}
    res.set({'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
    const close=()=>{clearInterval(timer);unsubscribeRevocation();stream.close();closes.delete(close);res.end();};
    const tick=async ()=>{try{(await stream.push());}catch{res.write('data: {"unavailable":true}\n\n');close();}};
    const unsubscribeRevocation=devices.service.auth.onBrowserRevoked(p.browserId!,close);
    const timer=setInterval(tick,15000);timer.unref();closes.add(close);req.on('close',close);(await tick());
  });
  return ()=>{for(const close of closes)close();devices.close();};
}
