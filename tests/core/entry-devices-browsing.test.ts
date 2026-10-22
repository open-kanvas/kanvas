import {randomUUID} from 'node:crypto';
import type {Request,Response} from 'express';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createApp} from '../../src/server/app.js';
import {listToolDefinitions,resolveToolCall} from '../../src/server/mcp/catalog.js';
import {validateView} from '../../src/shared/view-schemas.js';
import {navigationCapabilities} from '../../src/shared/navigation.js';
import {DEFAULT_CONFIG} from '../../src/shared/preferences.js';
import {browsingFrames} from '../../src/server/session-browsing.js';
import {startHarness,success,denied,fact,type Harness} from './harness.js';

let h:Harness;
afterEach(async()=>{await h?.close();});
async function receiver(userId:string){const session=(await h.runtime.auth.issueBrowser(userId,{cookie:()=>{}} as unknown as Response));return {userId,browserId:session.id};}

describe('live entry and registered-device authority',()=>{
  it('provisions one real home target on signup, leaves recent-session selection deliberate and retires public signup MCP',async()=>{
    h=await startHarness({mcpProfile:'twelve'});const a=await h.account(),start=success(await a.request<any>('GET','/api/start'));
    expect(start.entry.sessionId).toEqual(expect.any(String));expect(start.sessions).toEqual([]);
    const detail=await a.detail(start.entry.sessionId);expect(detail.displays[0].view).toMatchObject({template:'overview',data:{scope:'account'}});
    const session=await a.session('An explicitly chosen topic');await a.display(session.id);const after=success(await a.request<any>('GET','/api/start'));
    expect(after.sessions[0].name).toBe('An explicitly chosen topic');expect(after.entry).toEqual(start.entry);
    expect((await a.request('POST','/mcp/signup',{})).status).toBe(410);
    const catalog=listToolDefinitions('twelve');expect(catalog).toHaveLength(12);expect(JSON.stringify(catalog)).not.toContain('signup.begin');
    expect(resolveToolCall('twelve','kanvas_access',{operation:'signup.begin',email:'not-sent@example.com'})).toHaveProperty('error');
    const snapshot=(await h.runtime.store.list('display'));success(await a.request('GET','/api/start'));expect((await h.runtime.store.list('display'))).toEqual(snapshot);
  });

  it('keeps console paths, email links and deep links on the canonical origin',async()=>{
    const mail:{link:string}[]=[];h=await startHarness({signinMailer:async(_email,link)=>{mail.push({link});}});
    const browser=h.browser(),redirect=await browser.raw('/admin?session=retained');expect(redirect.status).toBe(302);expect(redirect.headers.get('location')).toBe('/console?session=retained');
    expect((await browser.raw('/console?session=retained')).status).toBe(200);
    success(await browser.request('POST','/api/auth/email/request',{email:'admin-fixture@example.com',returnTo:'/console?account=sessions'}));expect(mail).toHaveLength(1);expect(new URL(mail[0].link).origin).toBe('http://127.0.0.1');
    const token=new URL(mail[0].link).hash.slice('#email-signin='.length),result=await browser.request<any>('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14'});expect(success(result).returnTo).toBe('/console?account=sessions');
    expect(result.headers.getSetCookie().every(cookie=>!/(?:^|;)\s*domain=/i.test(cookie))).toBe(true);expect((await h.runtime.store.list('oauth-grant'))).toHaveLength(0);
  });
  it('binds independent receivers to their account, distinguishes pending from paint, rejects spoofing/replays and persists offline after restart',async()=>{
    h=await startHarness();const a=await h.account(),b=await h.account(),p=(await receiver(a.user!.id)),p2=(await receiver(a.user!.id)),outsider=(await receiver(b.user!.id)),s=await a.session('Device content'),display=await a.display(s.id);
    await a.submit(s.id,[display.id],fact('Retained 1.2300'));
    const service=h.runtime.service,first=(await service.devices.register(p,{installationId:'computer',name:'Office PC'},'Mozilla/5.0 Chrome/140')),second=(await service.devices.register(p2,{installationId:'television',name:'TV'},'Mozilla/5.0 Safari/604'));
    expect(first.home!.displayId).not.toBe(second.home!.displayId);
    expect((await service.devices.list(p)).devices).toHaveLength(2);expect((await service.devices.list(outsider)).devices).toHaveLength(0);
    const input={deviceId:first.id,sessionId:s.id,displayId:display.id,expectedVersion:first.version,requestId:randomUUID()};
    (await expect((async ()=>(await service.devices.present(p,input)))()).rejects.toThrow(/Open KANVAS/));
    const received:any[]=[];const stream=(await service.devices.stream(p,first.id,v=>received.push(v)));(await stream.push());
    const sent=(await service.devices.present(p,input));expect(sent.device.command?.status).toBe('pending');await vi.waitFor(()=>expect(received.at(-1)?.command?.id).toBe(sent.commandId));
    expect((await service.devices.present(p,input)).commandId).toBe(sent.commandId);
    (await expect((async ()=>(await service.devices.present(p,{...input,displayId:second.home!.displayId,sessionId:second.home!.sessionId})))()).rejects.toThrow(/different device command/));
    (await expect((async ()=>(await service.devices.present(outsider,input)))()).rejects.toThrow(/unavailable/));
    const current=(await service.display(p,s.id,display.id)),ack={sessionId:s.id,displayId:display.id,renderedRevision:current.revision,commandId:sent.commandId};
    (await expect((async ()=>(await service.devices.report(p2,first.id,ack)))()).rejects.toThrow(/Only this device/));
    (await expect((async ()=>(await service.devices.report(p,first.id,{...ack,renderedRevision:current.revision-1})))()).rejects.toThrow(/changed/));
    (await service.devices.report(p,first.id,ack));expect((await service.devices.list(p)).devices.find(d=>d.id===first.id)?.command?.status).toBe('applied');
    expect((await service.devices.list(p)).devices.find(d=>d.id===second.id)?.current).toBeUndefined();
    stream.close();await h.shutdown();const reopened=await createApp({database:h.database});try{const devices=(await reopened.service.devices.list(p)).devices;expect(devices.every(d=>!d.connected)).toBe(true);expect(devices.find(d=>d.id===first.id)?.command?.status).toBe('applied');expect(JSON.stringify(devices)).not.toContain(p.browserId);}finally{await reopened.close();}
  });
  it('removes revoked browser authority and never exposes registered devices to session-limited grants',async()=>{
    h=await startHarness();const a=await h.account(),p=(await receiver(a.user!.id)),service=h.runtime.service,d=(await service.devices.register(p,{installationId:'revocable'},'Mozilla/5.0'));
    const stream=(await service.devices.stream(p,d.id,()=>{}));expect((await service.devices.list(p)).devices[0].connected).toBe(true);
    (await h.runtime.store.delete('browser',p.browserId));(await expect((async ()=>(await service.devices.report(p,d.id,{sessionId:d.home!.sessionId,displayId:d.home!.displayId,renderedRevision:1})))()).rejects.toThrow(/Sign in/));
    const other=(await receiver(a.user!.id));expect((await service.devices.list(other)).devices[0].connected).toBe(false);stream.close();
    const limited=(await h.runtime.auth.issueToken(a.user!.id,'Selected session only',['read','publish'],[d.home!.sessionId]));
    const principal=(await h.runtime.auth.authorize({get:()=>`Bearer ${limited.value}`} as unknown as Request));
    (await expect((async ()=>(await service.devices.list(principal)))()).rejects.toThrow(/account-wide/));
    (await expect((async ()=>(await service.devices.rename(principal,{deviceId:d.id,name:'Not authorized',expectedVersion:d.version})))()).rejects.toThrow(/account-wide/));
    (await expect((async ()=>(await service.devices.present(principal,{deviceId:d.id,sessionId:d.home!.sessionId,displayId:d.home!.displayId,expectedVersion:d.version,requestId:randomUUID()})))()).rejects.toThrow(/account-wide/));
    denied(await (await h.account()).request('POST',`/api/devices/${d.id}/report`,{sessionId:d.home!.sessionId,displayId:d.home!.displayId,renderedRevision:1}));
  });
  it('discards obsolete paint telemetry without an HTTP error or a false receipt, retaining ownership enforcement',async()=>{
    h=await startHarness();const a=await h.account(),s=await a.session('Rapid publication'),display=await a.display(s.id);
    const d=success(await a.request<any>('POST','/api/devices/register',{installationId:'late-paint'}));
    await a.submit(s.id,[display.id],fact('Earlier frame'));await a.submit(s.id,[display.id],fact('Newer frame'));
    const record=structuredClone((await h.runtime.store.get('registered-device',d.id))),source=structuredClone((await h.runtime.store.get('display',display.id)));
    const late=success(await a.request<any>('POST',`/api/devices/${d.id}/report`,{sessionId:s.id,displayId:display.id,renderedRevision:1}));
    expect(late).toEqual({recorded:false,reason:'STALE_OBSERVATION'});expect((await h.runtime.store.get('registered-device',d.id))).toEqual(record);expect((await h.runtime.store.get('display',display.id))).toEqual(source);
    const expired=success(await a.request<any>('POST',`/api/devices/${d.id}/report`,{sessionId:s.id,displayId:display.id,renderedRevision:2,commandId:'superseded-command'}));expect(expired).toEqual({recorded:false,reason:'STALE_COMMAND'});expect((await h.runtime.store.get('registered-device',d.id))).toEqual(record);
    denied(await (await h.account()).request('POST',`/api/devices/${d.id}/report`,{sessionId:s.id,displayId:display.id,renderedRevision:1}));
    expect(success(await a.request<any>('POST',`/api/devices/${d.id}/report`,{sessionId:s.id,displayId:display.id,renderedRevision:2})).recorded).toBe(true);
    expect((await h.runtime.store.get<any>('registered-device',d.id))).toMatchObject({displayId:display.id,renderedRevision:2});
  });
});

describe('source-preserving positional browsing and read views',()=>{
  it('returns chronological retained frames without changing shared history, source, cursor or revision; refuses other accounts',async()=>{
    h=await startHarness();const a=await h.account(),b=await h.account(),s=await a.session(),d=await a.display(s.id),p=(await receiver(a.user!.id));
    await a.submit(s.id,[d.id],fact('First exact value 1.2300'));await a.submit(s.id,[d.id],{version:1,template:'table',data:{columns:['Value'],rows:[['9007199254740993.001'],['1.2300']],pageSize:1}});await a.submit(s.id,[d.id],fact('Last content'));
    const before=structuredClone((await h.runtime.store.list('display'))),history=(await h.runtime.store.list('display-timeline')),frames=(await browsingFrames(h.runtime.service,p,s.id,d.id));
    expect(frames.map(f=>f.view?.template)).toEqual(['fact','table','fact']);
    for(const f of frames){const result=success(await a.request<any>('GET',`/api/sessions/${s.id}/displays/${d.id}/filmstrip/${f.id}`));expect(result.view).toEqual(f.view);}
    expect((await h.runtime.store.list('display'))).toEqual(before);expect((await h.runtime.store.list('display-timeline'))).toEqual(history);
    denied(await b.request('GET',`/api/sessions/${s.id}/displays/${d.id}/filmstrip/${frames[0].id}`));
    expect(navigationCapabilities(frames[1].view)).toMatchObject({paging:true,pageCount:2});
  });
  it('makes overview discoverable with a publish recipe and rejects singular target mistakes precisely',async()=>{
    h=await startHarness({mcpProfile:'twelve'});const a=await h.account(),s=await a.session(),p=(await receiver(a.user!.id));const d=await a.display(s.id);await a.submit(s.id,[d.id],fact('Overview source'));
    const result:any=await h.runtime.service.execute('kanvas_session_overview',{sessionId:s.id},p);expect(result.publishRecipe.view).toMatchObject({template:'overview',data:{order:'oldest'}});expect(result.publishRecipe.displayIds).toHaveLength(1);
    const failure=resolveToolCall('twelve','kanvas_publish',{operation:'show',sessionId:s.id,displayId:d.id,requestId:'bad-target',view:fact('Exact text')});expect(JSON.stringify(failure)).toContain('displayIds');expect(JSON.stringify(failure)).toContain('displayId');
    expect(validateView({version:1,template:'overview',data:{}}).data.order).toBe('oldest');
  });
  it('keeps inbox/chat read-only, preserves platform labels and allows a system account default',async()=>{
    for(const template of ['email','inbox','chat'] as const){const data=template==='email'?{messages:[{id:'one',from:'Source',subject:'Subject',body:'1.2300'}]}:template==='inbox'?{items:[{id:'one',from:'Source',subject:'Subject'}]}:{messages:[{id:'one',sender:'Source',text:'1.2300'}]};expect(()=>validateView({version:1,template,data,actions:[{id:'reply',label:'Reply',kind:'input'}]})).toThrow();}
    expect(()=>validateView({version:1,template:'inbox',data:{items:[{id:'one',from:'Source',subject:'Subject',message:{body:'hidden'}}]}})).toThrow();
    const chat=validateView({version:1,template:'chat',data:{contextLabel:'Workspace',conversationLabel:'#review',participants:['Ada','Bo'],messages:[{id:'one',sender:'Ada',text:'Original 1.2300'}]}});expect(chat.data).toMatchObject({contextLabel:'Workspace',conversationLabel:'#review',participants:['Ada','Bo']});
    h=await startHarness();const a=await h.account();success(await a.request('PATCH','/api/preferences',{expectedRevision:0,config:{theme:'system'}}));const s=await a.session();expect(s.config.theme).toBe('system');expect(s.config).toMatchObject({...DEFAULT_CONFIG,theme:'system'});
  });
});
