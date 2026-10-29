import {afterEach,it,expect,vi} from 'vitest';
import type {Response} from 'express';
import {startHarness,type Harness} from './harness.js';
let h:Harness;afterEach(async()=>{vi.restoreAllMocks();await h?.close();});
it.each(['window','device'] as const)('%s heartbeat cannot overwrite a concurrently issued device command',async kind=>{
 h=await startHarness();const a=await h.account(),s=h.runtime.service,session=await a.session(),display=await a.display(session.id),browser=await s.auth.issueBrowser(a.user!.id,{cookie:()=>{}} as unknown as Response),p={userId:a.user!.id,browserId:browser.id};
 const device=await s.devices.register(p,{installationId:'command-race-'+kind},'Chrome/140');const window=kind==='window'?await s.devices.windows.register(p,device.id,'race-window'):undefined;
 const stream=window?await s.devices.windows.stream(p,device.id,window.id,()=>{}):await s.devices.stream(p,device.id,()=>{});
 let release!:()=>void,blocked!:()=>void;const gate=new Promise<void>(r=>{release=r;}),ready=new Promise<void>(r=>{blocked=r;});const put=s.store.put.bind(s.store);let once=true;
 vi.spyOn(s.store,'put').mockImplementation(async (type,value)=>{if(once&&type===(window?'registered-window':'registered-device')){once=false;blocked();await gate;}return put(type,value);});
 const heartbeat=stream.push();await ready;
 const delivery=s.devices.present(p,{deviceId:device.id,sessionId:session.id,displayId:display.id,requestId:'concurrent-delivery'});
 // The unfixed stream writes a stale pre-command row after this concurrent
 // delivery commits. A serialized stream makes delivery wait until release.
 await Promise.race([delivery,new Promise(r=>setTimeout(r,250))]);release();
 try{await heartbeat;const sent=await delivery;const row=await s.store.get<any>(window?'registered-window':'registered-device',window?.id??device.id);expect(row.command?.id).toBe(sent.commandId);expect(row.version).toBe(1);await stream.push();const current=(await s.devices.list(p)).devices.find(x=>x.id===device.id)!;expect(current.command?.status).toBe('pending');}finally{release();stream.close();}
});
