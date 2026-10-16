import {randomUUID} from 'node:crypto';
import type {Request,Response} from 'express';
import {afterEach,expect,it} from 'vitest';
import {startHarness,success,fact,type Harness} from './harness.js';
let h:Harness;afterEach(async()=>{await h?.close();});
it('sorts by actual display/interaction activity, bounds passive previews and excludes other accounts',async()=>{
 h=await startHarness();const a=await h.account(),b=await h.account(),old=await a.session('Old active'),fresh=await a.session('New inactive'),secret=await b.session('Private secret'),d=await a.display(old.id);
 await b.display(secret.id);await a.submit(old.id,[d.id],fact('Current safe content'));
 const session=await h.runtime.store.get<any>('session',old.id);session.updatedAt='2000-01-01T00:00:00.000Z';await h.runtime.store.put('session',session);
 const display=await h.runtime.store.get<any>('display',d.id);display.updatedAt='2090-01-01T00:00:00.000Z';await h.runtime.store.put('display',display);
 for(let i=0;i<9;i++)await a.display(old.id,'Bounded '+i);
 const before=await h.runtime.store.list('session'),start=success(await a.request<any>('GET','/api/start'));
 expect(start.sessions.map((s:any)=>s.id)).toEqual([old.id,fresh.id]);expect(start.sessions[0].lastActivityAt).toBe(display.updatedAt);expect(start.sessions[0].displays).toHaveLength(8);expect(start.sessions[0].displayCount).toBe(10);
 expect(start.sessions[0].displays[0].preview).toMatchObject({template:'fact'});expect(JSON.stringify(start)).not.toContain('Private secret');expect(JSON.stringify(start)).not.toContain('browserId');expect(await h.runtime.store.list('session')).toEqual(before);
 await a.submit(old.id,[d.id],{version:1,template:'table',data:{columns:['Name','Value'],rows:[['Alpha','42'],['Beta','43'],['Not projected','44']]}});
 const table=(await h.runtime.service.startPage({userId:a.user!.id})).sessions.find(s=>s.id===old.id)!.displays.find(x=>x.id===d.id)!;
 expect(table.preview?.cells).toEqual([['Name','Value'],['Alpha','42'],['Beta','43']]);expect(JSON.stringify(table)).not.toContain('Not projected');
 await a.submit(old.id,[d.id],{version:1,template:'flowchart',data:{nodes:[{id:'one',label:'Begin',shape:'terminal'},{id:'two',label:'Decide',shape:'decision'}],edges:[{from:'one',to:'two'}]}});
 const diagram=(await h.runtime.service.startPage({userId:a.user!.id})).sessions.find(s=>s.id===old.id)!.displays.find(x=>x.id===d.id)!;
 expect(diagram.preview?.nodes).toEqual([{label:'Begin',shape:'terminal'},{label:'Decide',shape:'decision'}]);expect(diagram.preview).not.toHaveProperty('edges');
 const interaction={id:randomUUID(),sessionId:fresh.id,createdAt:'2091-01-01T00:00:00.000Z'};await h.runtime.store.put('interaction',interaction);expect((await h.runtime.service.startPage({userId:a.user!.id})).sessions[0].id).toBe(fresh.id);
 await h.runtime.store.put('audit-event',{id:randomUUID(),sessionId:old.id,type:'session.renamed',at:'2092-01-01T00:00:00.000Z'});expect((await h.runtime.service.startPage({userId:a.user!.id})).sessions[0].id).toBe(old.id);
});
it('returns one tab to overview with CAS, owner scope, retries, supersession and paint evidence; creates no session',async()=>{
 h=await startHarness();const a=await h.account(),b=await h.account(),svc=h.runtime.service;
 const browser=await h.runtime.auth.issueBrowser(a.user!.id,{cookie:()=>{}} as unknown as Response),p={userId:a.user!.id,browserId:browser.id};
 const d=await svc.devices.register(p,{installationId:'overview-test',provisionHome:false},'Chrome/140'),w=await svc.devices.windows.register(p,d.id,'root'),other=await svc.devices.windows.register(p,d.id,'sibling'),stream=await svc.devices.windows.stream(p,d.id,w.id,()=>{}),before=await h.runtime.store.list('session');
 try{
 const input={deviceId:d.id,windowId:w.id,expectedVersion:0,requestId:randomUUID()};const sent=await svc.devices.windows.overview(p,input);
 expect(sent.window.command).toMatchObject({destination:'overview',status:'pending'});expect(sent.window.command).not.toHaveProperty('sessionId');expect((await svc.devices.windows.overview(p,input)).commandId).toBe(sent.commandId);
 await expect(svc.devices.windows.overview(p,{...input,expectedVersion:1})).rejects.toThrow(/different window command/);
 await expect(svc.devices.windows.overview(p,{...input,requestId:randomUUID()})).rejects.toThrow(/changed/);
 await expect(svc.devices.windows.overview({userId:b.user!.id},input)).rejects.toThrow(/unavailable/);
 const token=await h.runtime.auth.issueToken(a.user!.id,'read only',['read']),limited=await h.runtime.auth.authorize({get:()=>`Bearer ${token.value}`} as unknown as Request);await expect(svc.devices.windows.overview(limited,input)).rejects.toThrow();
 await expect(svc.devices.windows.report(p,d.id,other.id,{destination:'overview',commandId:sent.commandId})).rejects.toThrow(/no longer current/);
 await svc.devices.windows.report(p,d.id,w.id,{destination:'overview',commandId:sent.commandId});const windows=(await svc.devices.list(p)).devices[0].windows;expect(windows.find(x=>x.id===w.id)?.command?.status).toBe('applied');expect(windows.find(x=>x.id===w.id)?.current).toBeUndefined();expect(windows.find(x=>x.id===other.id)?.command).toBeUndefined();expect(await h.runtime.store.list('session')).toEqual(before);
 const newer=await svc.devices.windows.overview(p,{...input,expectedVersion:1,requestId:randomUUID()});expect(newer.commandId).not.toBe(sent.commandId);expect((await svc.devices.windows.overview(p,input)).superseded).toBe(true);await expect(svc.devices.windows.report(p,d.id,w.id,{destination:'overview',commandId:sent.commandId})).rejects.toThrow(/no longer current/);
 }finally{stream.close();}
});

it('paginates 51 account sessions in windows of 50 without gaps, duplication or private sessions',async()=>{
 h=await startHarness();const a=await h.account(),b=await h.account();
 for(let i=0;i<51;i++)await a.session(`Page session ${i}`);
 await b.session('Other account secret');
 const first=success(await a.request<any>('GET','/api/start'));
 expect(first.total).toBe(51);expect(first.sessions).toHaveLength(50);expect(first.nextOffset).toBe(50);
 const last=success(await a.request<any>('GET','/api/start?offset=50'));
 expect(last.total).toBe(51);expect(last.sessions).toHaveLength(1);expect(last.nextOffset).toBeUndefined();
 expect(new Set([...first.sessions,...last.sessions].map(s=>s.id)).size).toBe(51);
 expect(JSON.stringify([first,last])).not.toContain('Other account secret');
 expect(success(await a.request<any>('GET','/api/start?offset=100')).sessions).toEqual([]);
});
