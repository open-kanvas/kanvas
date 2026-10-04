import {afterEach,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {Response} from 'express';
import {startHarness,fact,type Harness,type Browser,success} from './harness.js';
import {Checklists} from '../../src/server/checklists.js';
import {resolveToolCall} from '../../src/server/mcp/catalog.js';
let h:Harness;
afterEach(async()=>{await h?.close();});
async function principal(a:Browser){const session=await h.runtime.auth.issueBrowser(a.user!.id,{cookie:()=>{}} as unknown as Response);return {userId:a.user!.id,browserId:session.id};}
const view={version:1 as const,template:'checklist' as const,title:'Release tasks',data:{items:[{id:'a',text:'Review',checked:false},{id:'b',text:'Test',checked:false}]}};
describe('October4 persistent account and session feedback',()=>{
 it('discovers account details and checklist operations in all profiles',()=>{
  for(const [canonical,domain,op,twelve,args] of [
   ['kanvas_account_details','kanvas_account','details','account.details',{}],
   ['kanvas_checklist_read','kanvas_checklist','read','checklist.read',{sessionId:'s'}],
   ['kanvas_checklist_update','kanvas_checklist','update','checklist.update',{sessionId:'s',checklistId:'c',expectedRevision:0,requestId:'r',items:[]}],
   ['kanvas_checklist_show','kanvas_checklist','show','checklist.show',{sessionId:'s',checklistId:'c',displayId:'d',expectedRevision:0,requestId:'r'}],
  ] as const){expect(resolveToolCall('legacy',canonical,args).error).toBeUndefined();expect(resolveToolCall('domains',domain,{operation:op,...args}).error).toBeUndefined();expect(resolveToolCall('twelve',op==='details'||op==='read'?'kanvas_inspect':'kanvas_publish',{operation:twelve,...args}).error).toBeUndefined();}
 });
 it('explicit session creation is immediately joinable, supports deliberate opt-out, never grants access',async()=>{
  h=await startHarness();const a=await h.account(),other=await h.account();
  const result:any=success(await a.request('POST','/api/sessions',{name:'Ready'}));expect(result.displays).toHaveLength(1);expect(result.viewerUrl).toContain(result.displays[0].id);expect(result.displays[0].view).toBeNull();
  expect((await other.request('GET',`/api/sessions/${result.id}`)).status).toBe(404);
  const blank:any=success(await a.request('POST','/api/sessions',{name:'Headless',initialDisplay:false}));expect(blank.displays).toEqual([]);
 });
 it('own account identity and quota tier are bounded to account-wide authority',async()=>{
  h=await startHarness();const a=await h.account(),p=await principal(a);
  await h.runtime.store.put('verified-email',{id:p.userId,email:'owner@example.test',verifiedAt:new Date().toISOString()});
  await h.runtime.store.put('account-tier',{id:p.userId,tier:'admin'});
  const result:any=await h.runtime.service.execute('kanvas_account_details',{},p);
  expect(result).toMatchObject({id:p.userId,email:'owner@example.test',emailVerified:true,tier:'admin',quotaExempt:true,limits:{sessions:null,retainedViewsPerSession:null}});
  expect(await h.runtime.service.accounts.isServiceAdmin(p)).toBe(false);
  expect(await h.runtime.service.verifyView(p,(await a.session()).id,result.publishRecipe.view)).toMatchObject({template:'table'});
  const grant=await h.runtime.auth.issueToken(p.userId,'Selected',['read'],['some-session']);
  await expect(h.runtime.service.execute('kanvas_account_details',{}, {userId:p.userId,tokenId:grant.token.id})).rejects.toMatchObject({code:'FORBIDDEN'});
  const q=await principal(await h.account());expect((await h.runtime.service.accountDetails(q)).email).toBeNull();
 });
 it('root receiver appears without joining a session and remains owner-scoped',async()=>{
  h=await startHarness();const a=await h.account(),p=await principal(a),q=await principal(await h.account());
  const device=await h.runtime.service.devices.register(p,{installationId:'test-install'},'Mozilla/5.0');const window=await h.runtime.service.devices.windows.register(p,device.id,'idle-tab');
  const stream=await h.runtime.service.devices.windows.stream(p,device.id,window.id,()=>{});await stream.push();
  try{const topology:any=await h.runtime.service.topology.acrossSessions(p,{});expect(topology.availableWindows).toContainEqual(expect.objectContaining({windowId:window.id,current:null,connected:true}));expect((await h.runtime.service.topology.acrossSessions(q,{})).availableWindows).toEqual([]);
   const started:any=await h.runtime.service.beginSession(p,{requestId:'begin-idle',name:'Work'});expect(started.status).toBe('started');expect(started.windowId).toBe(window.id);
  }finally{stream.close();}
 });
 it('settings publication returns live change guidance immediately',async()=>{
  h=await startHarness();const a=await h.account(),p=await principal(a),s=await a.session(),d=await a.display(s.id);
  const result:any=await h.runtime.service.execute('kanvas_submit',{sessionId:s.id,displayIds:[d.id],requestId:randomUUID(),view:{version:1,template:'settings',data:{}}},p);
  expect(result.settingsGuidance.tool).toBe('kanvas_config_update');expect(result.settingsGuidance.nextAction).toContain('settings.update');
 });
 it('saved checklist survives display replacement, fresh module instance and show on another screen',async()=>{
  h=await startHarness();const a=await h.account(),p=await principal(a),s=await a.session(),d=await a.display(s.id),second=await a.display(s.id);
  await a.submit(s.id,[d.id],view);let current=await h.runtime.service.display(p,s.id,d.id);const key=String(current.view!.data.checklistId);expect(key).toBeTruthy();
  await h.runtime.service.edit(p,s.id,d.id,current.revision,{...current.view!.data,items:[{id:'a',text:'Review',checked:true},{id:'b',text:'Test',checked:false}]});
  await a.submit(s.id,[d.id],fact('Unrelated map/topic'));
  const reader=new Checklists(h.runtime.service),saved:any=await reader.read(p,{sessionId:s.id,checklistId:key});expect(saved.revision).toBe(1);expect(saved.view.data.items[0].checked).toBe(true);
  const args={sessionId:s.id,checklistId:key,displayId:second.id,expectedRevision:0,requestId:'bring-back'};const shown:any=await reader.show(p,args);expect((await h.runtime.service.display(p,s.id,second.id)).view!.data).toMatchObject({checklistId:key,checklistRevision:1});expect((await reader.show(p,args)).id).toBe(shown.id);expect((await h.runtime.service.display(p,s.id,d.id)).view!.template).toBe('fact');
 });
 it('document update is revisioned/idempotent, does not overwrite screens and rejects stale mirrors',async()=>{
  h=await startHarness();const a=await h.account(),p=await principal(a),s=await a.session(),d=await a.display(s.id);await a.submit(s.id,[d.id],view);const current=await h.runtime.service.display(p,s.id,d.id),key=String(current.view!.data.checklistId);
  const args={sessionId:s.id,checklistId:key,expectedRevision:0,requestId:'edit-items',items:[{id:'a',text:'Review',checked:true}]};const saved:any=await h.runtime.service.checklists.update(p,args);expect(saved.revision).toBe(1);expect((await h.runtime.service.checklists.update(p,args)).revision).toBe(1);
  await expect(h.runtime.service.checklists.update(p,{...args,items:[]})).rejects.toMatchObject({code:'REQUEST_ID_CONFLICT'});
  await expect(h.runtime.service.checklists.update(p,{...args,requestId:'stale'})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
  expect((await h.runtime.service.display(p,s.id,d.id)).revision).toBe(current.revision);
  await expect(h.runtime.service.edit(p,s.id,d.id,current.revision,{...current.view!.data,items:[{id:'a',text:'Stale overwrite',checked:false}]})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
  expect((await h.runtime.service.checklists.read(p,{sessionId:s.id,checklistId:key}) as any).view.data.items[0].text).toBe('Review');
 });
 it('checklist IDs grant no cross-account/session access and held screens stay intact',async()=>{
  h=await startHarness();const a=await h.account(),p=await principal(a),q=await principal(await h.account()),s=await a.session(),d=await a.display(s.id);await a.submit(s.id,[d.id],view);const current=await h.runtime.service.display(p,s.id,d.id),key=String(current.view!.data.checklistId);
  await expect(h.runtime.service.checklists.read(q,{sessionId:s.id,checklistId:key})).rejects.toBeDefined();
  const another=await a.session();await expect(h.runtime.service.checklists.read(p,{sessionId:another.id,checklistId:key})).rejects.toMatchObject({code:'NOT_FOUND'});
  await h.runtime.service.updateDisplay(p,s.id,d.id,{held:true,expectedRevision:current.revision});const held=await h.runtime.service.display(p,s.id,d.id);
  await expect(h.runtime.service.checklists.show(p,{sessionId:s.id,checklistId:key,displayId:d.id,expectedRevision:held.revision,requestId:'held'})).rejects.toMatchObject({code:'DISPLAY_HELD'});
 });
});
