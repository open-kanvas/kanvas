import {afterEach,it,expect} from 'vitest';
import type {Request,Response} from 'express';
import {startHarness,success,type Harness} from './harness.js';
import {inToolContext} from '../../src/server/mcp/call-context.js';
import {operationCatalog,templateCatalog} from '../../src/server/mcp/discovery.js';
let h:Harness;afterEach(async()=>{await h?.close();});
it('keeps optional context per connection, distinguishes inferred hints, and confines it to its account',async()=>{
 h=await startHarness();const owner=await h.account(),other=await h.account(),s=await owner.session('Client history'),service=h.runtime.service,p={userId:owner.user!.id,agentId:'agent-one'};
 const context={tool:'kanvas_session' as const,operation:'client.context.update',canonicalName:'kanvas_client_context_update',connectionId:'connection-one',inferred:{clientName:'MCP runtime',clientVersion:'1',userAgent:'Test agent'}};
 const first:any=await inToolContext(context,()=>service.execute('kanvas_client_context_update',{sessionId:s.id,clientDetails:{agent:'Voice agent',model:'Example',interaction_mode:'voice'}},p));
 expect(first).toMatchObject({selfReported:{agent:'Voice agent'},inferred:{clientName:'MCP runtime'},verified:false});expect(first.conflicts).toHaveLength(1);
 await inToolContext({...context,connectionId:'connection-two'},()=>service.execute('kanvas_client_context_update',{sessionId:s.id,clientDetails:{agent:'Another agent'}},p));
 const detail=await service.detail(p,s.id);expect(detail.session.agentConnections).toHaveLength(2);expect((await service.sessions(p)).find(x=>x.id===s.id)?.agentConnections).toHaveLength(2);
 const report:any=await inToolContext(context,()=>service.execute('kanvas_feedback_submit',{sessionId:s.id,requestId:'feedback-context',title:'Explicit test',description:'Test context',clientDetails:{effort_or_mode:'high'}},p));expect(report.clientContext).toMatchObject({selfReported:{agent:'Voice agent',effort_or_mode:'high'},inferred:{clientName:'MCP runtime'}});
 await expect(service.execute('kanvas_client_context_update',{sessionId:s.id,clientDetails:{}},{userId:other.user!.id})).rejects.toThrow();
 expect((await service.sessions({userId:other.user!.id})).find(x=>x.id===s.id)).toBeUndefined();
});
it('publishes exact registry catalogs with only the calling account private templates',async()=>{
 h=await startHarness();const a=await h.account(),s=await a.session('Catalog'),d=await a.display(s.id),service=h.runtime.service,p={userId:a.user!.id};
 const update:any=await service.execute('kanvas_catalog_show',{sessionId:s.id,displayIds:[d.id],requestId:'catalog-ops',catalog:'operations'},p);
 await a.settle(s.id,'catalog-ops');const current=await service.display(p,s.id,d.id);expect(current.view?.template).toBe('catalog-list');expect(current.view?.data.items).toEqual(operationCatalog().slice().sort((a,b)=>a.id.localeCompare(b.id,'en')).map(x=>x.id.replace(/^kanvas\.(template\.)?/,'')));
 const definition={name:'Owner catalog template',schema:{type:'object',properties:{}},html:'<p>Template</p>',css:''};const own:any=await service.execute('kanvas_account_templates_create',definition,p);const other=await h.account();await service.execute('kanvas_account_templates_create',{...definition,name:'Foreign private template'},{userId:other.user!.id});
 await service.execute('kanvas_catalog_show',{sessionId:s.id,displayIds:[d.id],requestId:'catalog-templates',catalog:'templates'},p);await a.settle(s.id,'catalog-templates');expect((await service.display(p,s.id,d.id)).view?.data.items).toHaveLength(templateCatalog().length+1);expect(JSON.stringify((await service.display(p,s.id,d.id)).view)).toContain('Owner catalog template (account)');expect(JSON.stringify((await service.display(p,s.id,d.id)).view)).not.toContain('Foreign private template');
 expect(update).toBeTruthy();
});
it('edits optional device metadata with CAS, returns it in the recipe, and refuses ambiguous targeting',async()=>{
 h=await startHarness();const a=await h.account(),other=await h.account(),service=h.runtime.service;
 const browser=await h.runtime.auth.issueBrowser(a.user!.id,{cookie:()=>{}} as unknown as Response),p={userId:a.user!.id,browserId:browser.id};
 const d=await service.devices.register(p,{installationId:'metadata-one',provisionHome:false},'Chrome'),d2=await service.devices.register(p,{installationId:'metadata-two',provisionHome:false},'Chrome');const s=await a.session('Default'),display=await a.display(s.id);
 const changed=await service.devices.rename(p,{deviceId:d.id,expectedVersion:d.version,name:'Office laptop Chrome',location:'Office',role:'Dashboard',tags:['work'],defaultSessionId:s.id});expect(changed).toMatchObject({location:'Office',role:'Dashboard',tags:['work'],defaultSessionId:s.id});
 await expect(service.devices.rename(p,{deviceId:d.id,expectedVersion:0,role:'stale'})).rejects.toThrow();await expect(service.devices.rename({userId:other.user!.id},{deviceId:d.id,location:'Other'})).rejects.toThrow();
 const listing:any=await service.execute('kanvas_devices_read',{},p);expect(listing.publishRecipe.view.data.devices.find((x:any)=>x.id===d.id)).toMatchObject({location:'Office',role:'Dashboard'});
 expect((await service.devices.open(p,d.id)).sessionId).toBe(s.id);
 await service.devices.rename(p,{deviceId:d2.id,location:'Office'});await expect(service.devices.present(p,{match:{location:'Office'},sessionId:s.id,displayId:display.id,requestId:'ambiguous'})).rejects.toThrow(/exactly one/);
 const stream=await service.devices.stream(p,d.id,()=>{});try{expect(await service.devices.present(p,{match:{tag:'work'},sessionId:s.id,displayId:display.id,expectedVersion:changed.version,requestId:'unique'})).toHaveProperty('commandId');}finally{stream.close();}
 const cleared=await service.devices.rename(p,{deviceId:d.id,location:null,role:null,tags:[],defaultSessionId:null});expect(cleared.location).toBeUndefined();expect(cleared.tags).toEqual([]);
});

it('consumes only owner-configured defaults on a proof-bound receiver and denies revoked receivers',async()=>{
 h=await startHarness();const a=await h.account(),foreign=await h.account(),screen=h.browser(),service=h.runtime.service,p={userId:a.user!.id};
 const req=success(await screen.request<any>('POST','/api/screens/request',{}));success(await a.request('POST','/api/screens/decide',{code:req.code,label:req.label,approve:true,confirm:true}));success(await screen.request('POST','/api/screens/claim',{}));
 const auth=(await h.runtime.auth.browser({cookies:Object.fromEntries(screen.cookies),get:()=>undefined} as unknown as Request)).principal,deviceId=auth.receiverDeviceId!;
 const session=await a.session('Chosen default'),display=await a.display(session.id),other=await foreign.session('Forbidden default');
 await expect(service.devices.rename(p,{deviceId,defaultSessionId:other.id})).rejects.toThrow();await service.devices.rename(p,{deviceId,defaultSessionId:session.id});
 await expect(service.devices.rename(auth,{deviceId,defaultSessionId:session.id})).rejects.toThrow();
 expect(await service.devices.open(auth,deviceId)).toMatchObject({sessionId:session.id});
 const renewed=(await h.runtime.auth.browser({cookies:Object.fromEntries(screen.cookies),get:()=>undefined} as unknown as Request)).principal;expect(renewed.scopedSessionId).toBe(session.id);expect(renewed.scopedDisplayId).toBeTruthy();await expect(service.display(renewed,other.id,display.id)).rejects.toThrow();
 await h.runtime.auth.revokeBrowser(renewed.browserId!);await expect(service.devices.open(renewed,deviceId)).rejects.toThrow();
});
