import {afterEach,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {Response} from 'express';
import {startHarness,type Harness,success} from './harness.js';
let h:Harness;
afterEach(async()=>{delete process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT;await h?.close();});
describe('idle receiver registration',()=>{
 it('an authenticated account with zero sessions is visible as an idle connected receiver',async()=>{
  h=await startHarness();const user=await h.runtime.auth.register({username:'empty_'+randomUUID().slice(0,8),password:randomUUID()});
  const browser=await h.runtime.auth.issueBrowser(user.id,{cookie:()=>{}} as unknown as Response),p={userId:user.id,browserId:browser.id};
  expect(await h.runtime.service.sessions(p)).toHaveLength(0);
  const device=await h.runtime.service.devices.register(p,{installationId:'fresh-root',provisionHome:false},'Mozilla/5.0');
  const window=await h.runtime.service.devices.windows.register(p,device.id,'fresh-root-tab'),stream=await h.runtime.service.devices.windows.stream(p,device.id,window.id,()=>{});await stream.push();
  try{expect((await h.runtime.service.devices.list(p)).devices).toContainEqual(expect.objectContaining({id:device.id,connected:true}));expect(await h.runtime.service.sessions(p)).toHaveLength(0);}finally{stream.close();}
 });
 it('registers an idle root at quota without creating Home, while a new session still fails honestly',async()=>{
  process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT='1';h=await startHarness();
  // Existing pre-entry account: auth record without signup Home provisioning.
  const user=await h.runtime.auth.register({username:'idle_'+randomUUID().slice(0,8),password:randomUUID()});
  const browser=await h.runtime.auth.issueBrowser(user.id,{cookie:()=>{}} as unknown as Response),p={userId:user.id,browserId:browser.id};
  await h.runtime.service.createSession(p,'Existing work');
  const device=await h.runtime.service.devices.register(p,{installationId:'quota-root',provisionHome:false},'Mozilla/5.0');expect(device.home).toBeUndefined();
  expect((await h.runtime.service.sessions(p))).toHaveLength(1);expect(await h.runtime.store.get('account-entry',p.userId)).toBeUndefined();
  const window=await h.runtime.service.devices.windows.register(p,device.id,'root-tab'),stream=await h.runtime.service.devices.windows.stream(p,device.id,window.id,()=>{});await stream.push();
  try{const topology=await h.runtime.service.topology.acrossSessions(p,{});if(!('availableWindows' in topology))throw new Error('Expected account-wide topology');expect(topology.availableWindows).toContainEqual(expect.objectContaining({windowId:window.id,connected:true,current:null}));await expect(h.runtime.service.beginSession(p,{name:'No remaining quota',requestId:'quota-begin'})).rejects.toMatchObject({code:'LIMIT_REACHED'});}finally{stream.close();}
  // Navigating an existing idle receiver to a viewer must not force Home later.
  expect((await h.runtime.service.devices.register(p,{installationId:'quota-root'},'Mozilla/5.0')).home).toBeUndefined();
  expect((await h.runtime.service.sessions(p))).toHaveLength(1);
 });
 it('the HTTP opt-out is accepted and explicit entry opening lazily creates one reusable Home',async()=>{
  h=await startHarness();const a=await h.account(),initialSessions=(await h.runtime.store.list('session')).length;
  const device:any=success(await a.request('POST','/api/devices/register',{installationId:'idle-http',windowId:'console-tab',provisionHome:false}));expect(device.home).toBeUndefined();expect((await h.runtime.store.list('session'))).toHaveLength(initialSessions);
  const opened:any=success(await a.request('POST','/api/entry/open',{deviceId:device.id}));expect(opened.sessionId).toBeTruthy();expect((await h.runtime.store.list('session'))).toHaveLength(initialSessions);
  const again:any=success(await a.request('POST','/api/entry/open',{deviceId:device.id}));expect(again).toEqual(opened);expect((await h.runtime.store.list('session'))).toHaveLength(initialSessions);
  const registered:any=success(await a.request('POST','/api/devices/register',{installationId:'idle-http',windowId:'console-tab',provisionHome:false}));expect(registered.home).toEqual(opened);
 });
});
