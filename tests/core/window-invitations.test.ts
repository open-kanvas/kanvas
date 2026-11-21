import { asyncMap } from '../../src/server/async-collections.js';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { listToolDefinitions, resolveToolCall } from '../../src/server/mcp/catalog.js';
import { startHarness, success, denied, fact, type Harness, type Browser } from './harness.js';
let h:Harness;
afterEach(async()=>{await h?.close();});
const receiver=async (a:Browser)=>{const b=(await h.runtime.auth.issueBrowser(a.user!.id,{cookie:()=>{}} as unknown as Response));return {userId:a.user!.id,browserId:b.id};};
const group=async(a:Browser)=>success(await a.request<any>('POST','/api/groups',{kind:'team',name:'Invitation team',requestId:randomUUID()}));
const invite=async(a:Browser,groupId:string)=>success(await a.request<any>('POST','/api/invitations',{groupId,requestId:randomUUID()}));

describe('independent browser-window delivery',()=>{
  it('targets only an owned overview viewport with online, revision, replay and paint boundaries',async()=>{
    h=await startHarness();const a=await h.account(),b=await h.account(),p=await receiver(a),outsider=await receiver(b),svc=h.runtime.service;
    const device=await svc.devices.register(p,{installationId:'viewport'},'Chrome/140'),w=await svc.devices.windows.register(p,device.id,'one'),other=await svc.devices.windows.register(p,device.id,'two');
    const input={deviceId:device.id,windowId:w.id,expectedVersion:0,requestId:randomUUID(),navigation:{action:'zoom',scale:2}};
    await expect(svc.devices.windows.viewport(p,input)).rejects.toMatchObject({code:'WINDOW_OFFLINE'});
    const stream=await svc.devices.windows.stream(p,device.id,w.id,()=>{});
    try{
      await expect(svc.devices.windows.viewport(outsider,input)).rejects.toMatchObject({code:'NOT_FOUND'});
      await expect(svc.devices.windows.viewport(p,input)).rejects.toMatchObject({code:'VIEWPORT_UNAVAILABLE'});
      await svc.devices.windows.report(p,device.id,w.id,{destination:'overview'});
      const result=await svc.devices.windows.viewport(p,input);expect(result.window.overviewScale).toBe(2);expect(result.window.command?.status).toBe('pending');
      expect((await svc.devices.windows.viewport(p,input)).commandId).toBe(result.commandId);
      await expect(svc.devices.windows.viewport(p,{...input,navigation:{action:'zoom',scale:1}})).rejects.toMatchObject({code:'REQUEST_ID_CONFLICT'});
      await expect(svc.devices.windows.report(p,device.id,other.id,{destination:'viewport',commandId:result.commandId})).rejects.toMatchObject({code:'STALE_COMMAND'});
      await svc.devices.windows.report(p,device.id,w.id,{destination:'viewport',commandId:result.commandId});
      const windows=(await svc.devices.list(p)).devices[0].windows;expect(windows.find(x=>x.id===other.id)?.overviewScale).toBe(1);expect(windows.find(x=>x.id===w.id)?.command?.status).toBe('applied');
      await expect(svc.devices.windows.viewport(p,{...input,requestId:randomUUID()})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
    }finally{stream.close();}
  });
  it('does not leak a sibling window or pending private target through another session participant list',async()=>{
    h=await startHarness();const owner=await h.account(),member=await h.account(),shared=await owner.session('Shared'),privateSession=await owner.session('Private'),publicDisplay=await owner.display(shared.id),privateDisplay=await owner.display(privateSession.id);
    success(await owner.request('POST',`/api/sessions/${shared.id}/members`,{username:member.user!.username,role:'viewer'}));
    const p=(await receiver(owner)),svc=h.runtime.service,device=(await svc.devices.register(p,{installationId:'scoped-participants'},'Chrome/140')),first=(await svc.devices.windows.register(p,device.id,'shared-window')),second=(await svc.devices.windows.register(p,device.id,'private-window'));
    const streams=(await asyncMap([first,second], async w=>(await svc.devices.windows.stream(p,device.id,w.id,()=>{}))));
    try{
      (await svc.devices.windows.report(p,device.id,first.id,{sessionId:shared.id,displayId:publicDisplay.id,renderedRevision:0}));
      (await svc.devices.windows.report(p,device.id,second.id,{sessionId:privateSession.id,displayId:privateDisplay.id,renderedRevision:0}));
      (await svc.devices.windows.present(p,{deviceId:device.id,windowId:first.id,sessionId:privateSession.id,displayId:privateDisplay.id,expectedVersion:0,requestId:randomUUID()}));
      const participants=success(await member.request<any>('GET',`/api/sessions/${shared.id}/participants`)),windows=participants.registeredDevices[0].windows;
      expect(windows.map((w:any)=>w.id)).toEqual([first.id]);expect(windows[0]).not.toHaveProperty('command');expect(JSON.stringify(participants)).not.toContain(privateDisplay.id);expect(JSON.stringify(participants)).not.toContain(privateSession.id);
    }finally{streams.forEach(s=>s.close());}
  });
  it('routes only one tab, retains individual paint evidence, rejects stale/replayed commands, and restores offline',async()=>{
    h=await startHarness();const a=await h.account(),s=await a.session(),d1=await a.display(s.id,'One'),d2=await a.display(s.id,'Two'),p=(await receiver(a)),svc=h.runtime.service;
    await a.submit(s.id,[d1.id],fact('One exact 1.2300'));await a.submit(s.id,[d2.id],fact('Two'));
    const device=(await svc.devices.register(p,{installationId:'same-installation'},'Chrome/140'));
    const w1=(await svc.devices.windows.register(p,device.id,'tab-one')),w2=(await svc.devices.windows.register(p,device.id,'tab-two'));expect(w1.id).not.toBe(w2.id);
    const input={deviceId:device.id,windowId:w1.id,sessionId:s.id,displayId:d1.id,expectedVersion:w1.version,requestId:randomUUID()};
    (await expect((async ()=>(await svc.devices.windows.present(p,input)))()).rejects.toThrow(/Open this browser window/));
    const one:any[]=[],two:any[]=[],stream1=(await svc.devices.windows.stream(p,device.id,w1.id,x=>one.push(x))),stream2=(await svc.devices.windows.stream(p,device.id,w2.id,x=>two.push(x)));(await stream1.push());(await stream2.push());
    const sent=(await svc.devices.windows.present(p,input));await vi.waitFor(()=>expect(one.at(-1)?.command?.id).toBe(sent.commandId));expect(two.at(-1).command).toBeUndefined();expect(sent.window.command?.status).toBe('pending');
    expect((await svc.devices.windows.present(p,input)).commandId).toBe(sent.commandId);
    (await expect((async ()=>(await svc.devices.windows.present(p,{...input,displayId:d2.id})))()).rejects.toThrow(/different window command/));
    (await expect((async ()=>(await svc.devices.windows.present(p,{...input,requestId:randomUUID()})))()).rejects.toThrow(/changed|revision|version/i));
    const paint={sessionId:s.id,displayId:d1.id,renderedRevision:(await svc.display(p,s.id,d1.id)).revision,commandId:sent.commandId};
    (await expect((async ()=>(await svc.devices.windows.report(p,device.id,w2.id,paint)))()).rejects.toThrow(/no longer current/));
    (await expect((async ()=>(await svc.devices.windows.report(p,device.id,w1.id,{...paint,renderedRevision:paint.renderedRevision-1})))()).rejects.toThrow(/changed/));
    (await svc.devices.windows.report(p,device.id,w1.id,paint));expect((await svc.devices.list(p)).devices[0].windows.find(w=>w.id===w1.id)?.command?.status).toBe('applied');
    expect((await svc.devices.list(p)).devices[0].windows.find(w=>w.id===w2.id)?.current).toBeUndefined();
    expect((await svc.devices.windows.register(p,device.id,'tab-one')).id).toBe(w1.id);
    stream1.close();stream2.close();await h.shutdown();const reopened=await createApp({database:h.database});try{const windows=(await reopened.service.devices.list(p)).devices[0].windows;expect(windows.every(w=>!w.connected)).toBe(true);expect(windows.find(w=>w.id===w1.id)?.command?.status).toBe('applied');expect(JSON.stringify(windows).includes(p.browserId)).toBe(false);}finally{await reopened.close();}
  });
  it('requires every addressed window to paint a device-wide command; a legacy or sibling report cannot finish it',async()=>{
    h=await startHarness();const a=await h.account(),s=await a.session(),d=await a.display(s.id),p=(await receiver(a)),svc=h.runtime.service;await a.submit(s.id,[d.id],fact('All windows'));
    const device=(await svc.devices.register(p,{installationId:'broadcast'},'Chrome/140')),windows=(await asyncMap(['a','b'], async tab=>(await svc.devices.windows.register(p,device.id,tab)))),streams=(await asyncMap(windows, async w=>(await svc.devices.windows.stream(p,device.id,w.id,()=>{}))));
    const sent=(await svc.devices.present(p,{deviceId:device.id,sessionId:s.id,displayId:d.id,expectedVersion:0,requestId:randomUUID()})),paint={sessionId:s.id,displayId:d.id,renderedRevision:1,commandId:sent.commandId};
    (await svc.devices.report(p,device.id,paint));expect((await svc.devices.list(p)).devices[0].command?.status).toBe('pending');
    (await svc.devices.windows.report(p,device.id,windows[0].id,paint));expect((await svc.devices.list(p)).devices[0].command?.status).toBe('pending');
    (await svc.devices.windows.report(p,device.id,windows[1].id,paint));expect((await svc.devices.list(p)).devices[0].command?.status).toBe('applied');
    const one=(await svc.devices.list(p)).devices[0].windows[0];(await svc.devices.windows.present(p,{deviceId:device.id,windowId:one.id,sessionId:s.id,displayId:d.id,expectedVersion:one.version,requestId:randomUUID()}));
    expect((await svc.devices.list(p)).devices[0].command?.status).toBe('superseded');streams.forEach(s=>s.close());
  });
  it('enforces owner, browser, selected-session and revoked-auth boundaries for windows',async()=>{
    h=await startHarness();const a=await h.account(),b=await h.account(),p=(await receiver(a)),otherBrowser=(await receiver(a)),outsider=(await receiver(b)),svc=h.runtime.service;
    const d=(await svc.devices.register(p,{installationId:'protected'},'Chrome/140')),w=(await svc.devices.windows.register(p,d.id,'protected-tab')),stream=(await svc.devices.windows.stream(p,d.id,w.id,()=>{}));
    const input={deviceId:d.id,windowId:w.id,sessionId:d.home!.sessionId,displayId:d.home!.displayId,expectedVersion:0,requestId:randomUUID()};
    (await expect((async ()=>(await svc.devices.windows.present(outsider,input)))()).rejects.toThrow(/unavailable/));(await expect((async ()=>(await svc.devices.windows.stream(otherBrowser,d.id,w.id,()=>{})))()).rejects.toThrow(/Only this device/));
    const token=(await h.runtime.auth.issueToken(a.user!.id,'Selected only',['read','publish'],[d.home!.sessionId])),limited=(await h.runtime.auth.authorize({get:()=>`Bearer ${token.value}`} as unknown as Request));
    (await expect((async ()=>(await svc.devices.windows.present(limited,input)))()).rejects.toThrow(/account-wide/));
    (await h.runtime.store.delete('browser',p.browserId));(await expect((async ()=>(await stream.push()))()).rejects.toThrow(/Sign in/));expect((await svc.devices.list(otherBrowser)).devices[0].windows[0].connected).toBe(false);stream.close();
  });
});

describe('display names and scoped group invitations',()=>{
  it('renames only as owner with CAS, preserving content, source, history and address',async()=>{
    h=await startHarness();const a=await h.account(),b=await h.account(),s=await a.session(),d=await a.display(s.id);await a.submit(s.id,[d.id],fact('Preserved 9007199254740993.001'));
    success(await a.request('POST','/api/sessions/'+s.id+'/members',{username:b.user!.username,role:'editor'}));
    const before=(await h.runtime.store.get<any>('display',d.id)),history=(await h.runtime.store.list('display-timeline')),members=(await h.runtime.store.db.prepare('SELECT * FROM members').all());
    denied(await b.request('PATCH',`/api/sessions/${s.id}/displays/${d.id}/name`,{name:'Not owner',expectedRevision:before.revision}));
    const changed=success(await a.request<any>('PATCH',`/api/sessions/${s.id}/displays/${d.id}/name`,{name:'  Meeting room  ',expectedRevision:before.revision}));expect(changed.name).toBe('Meeting room');expect(changed.id).toBe(d.id);expect(changed.revision).toBe(before.revision+1);
    const after=(await h.runtime.store.get<any>('display',d.id));for(const k of ['view','source','sourceView','sourceData','held','history','datasetId'])expect(after[k]).toEqual(before[k]);expect((await h.runtime.store.list('display-timeline'))).toEqual(history);expect((await h.runtime.store.db.prepare('SELECT * FROM members').all())).toEqual(members);
    expect((await a.request('PATCH',`/api/sessions/${s.id}/displays/${d.id}/name`,{name:'Stale',expectedRevision:before.revision})).status).toBe(409);
    expect((await a.request('PATCH',`/api/sessions/${s.id}/displays/${d.id}/name`,{name:' ',expectedRevision:changed.revision})).status).toBe(400);
  });
  it('lets a newly registered person explicitly accept once, inherits group access and records an audit trail',async()=>{
    h=await startHarness();const owner=await h.account(),g=await group(owner),s=await owner.session();await owner.display(s.id);
    success(await owner.request('POST',`/api/sessions/${s.id}/group-access`,{groupId:g.id,expectedRevision:0,role:'viewer'}));
    const invitation=await invite(owner,g.id);expect(invitation.url).toContain('/welcome/'+invitation.id);expect((await h.runtime.store.list<any>('alias')).some(a=>a.inviteId===invitation.id)).toBe(false);
    const newcomer=await h.account();denied(await newcomer.request('GET','/api/sessions/'+s.id));
    expect((await newcomer.request('POST',`/api/invitations/${invitation.id}/accept`,{confirm:false})).status).toBe(400);
    const accepted=success(await newcomer.request<any>('POST',`/api/invitations/${invitation.id}/accept`,{confirm:true}));expect(accepted.role).toBe('member');expect((await newcomer.detail(s.id)).session.role).toBe('viewer');
    expect(success(await newcomer.request<any>('POST',`/api/invitations/${invitation.id}/accept`,{confirm:true})).alreadyAccepted).toBe(true);
    const other=await h.account();expect((await other.request('POST',`/api/invitations/${invitation.id}/accept`,{confirm:true})).status).toBe(409);
    expect((await h.runtime.store.list<any>('audit-event')).filter(e=>e.groupId===g.id).map(e=>e.type)).toEqual(expect.arrayContaining(['group.invitation.created','group.invitation.accepted','group.member.changed']));
    const current=success(await owner.request<any>('GET','/api/groups/'+g.id));success(await owner.request('POST','/api/groups/'+g.id+'/members',{expectedRevision:current.revision,username:newcomer.user!.username,role:null}));
    denied(await newcomer.request('POST',`/api/invitations/${invitation.id}/accept`,{confirm:true}));
  });
  it('rechecks inviter authority, revocation and expiry and never downgrades an existing owner',async()=>{
    h=await startHarness();const owner=await h.account(),admin=await h.account(),person=await h.account();let g=await group(owner);
    denied(await person.request('POST','/api/invitations',{groupId:g.id,requestId:randomUUID()}));
    g=success(await owner.request<any>('POST','/api/groups/'+g.id+'/members',{username:admin.user!.username,role:'admin',expectedRevision:g.revision}));
    const demoted=await invite(admin,g.id);g=success(await owner.request<any>('POST','/api/groups/'+g.id+'/members',{username:admin.user!.username,role:'member',expectedRevision:g.revision}));
    denied(await person.request('POST',`/api/invitations/${demoted.id}/accept`,{confirm:true}));
    const revoked=await invite(owner,g.id);denied(await person.request('POST',`/api/invitations/${revoked.id}/revoke`,{}));success(await owner.request('POST',`/api/invitations/${revoked.id}/revoke`,{}));expect((await person.request('POST',`/api/invitations/${revoked.id}/accept`,{confirm:true})).status).toBe(410);
    const expired=await invite(owner,g.id),record=(await h.runtime.store.get<any>('invitation',expired.id));record.expiresAt=new Date(Date.now()-1000).toISOString();(await h.runtime.store.put('invitation',record));expect((await person.request('POST',`/api/invitations/${expired.id}/accept`,{confirm:true})).status).toBe(410);
    const existing=await invite(owner,g.id);expect(success(await owner.request<any>('POST',`/api/invitations/${existing.id}/accept`,{confirm:true})).role).toBe('owner');
    const token=(await h.runtime.auth.issueToken(person.user!.id,'One session',['read','publish'],[(await person.session()).id])),limited=(await h.runtime.auth.authorize({get:()=>`Bearer ${token.value}`} as unknown as Request));
    (await expect((async ()=>(await h.runtime.service.invitations.accept(limited,{invitationId:existing.id,confirm:true})))()).rejects.toThrow(/account-wide/));
  });
  it('exposes window and invitation operations through the two-tool catalog',()=>{
    const definitions=listToolDefinitions('discovery');expect(definitions).toHaveLength(2);
    for(const [operationId,arguments_] of [['kanvas.display.rename',{sessionId:'s',displayId:'d',expectedRevision:1,name:'New'}],['kanvas.window.present',{deviceId:'device',windowId:'window',sessionId:'s',displayId:'d',expectedVersion:0,requestId:'request'}],['kanvas.invite.accept',{invitationId:'invite',confirm:true}],['kanvas.invite.revoke',{invitationId:'invite'}]] as const)expect(resolveToolCall('discovery','kanvas_call',{operationId,arguments:arguments_})).not.toHaveProperty('error');
  });
});
