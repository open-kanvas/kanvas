import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startHarness, success, denied, fact, PNG, type Harness, type Browser } from './harness.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import { validateView } from '../../src/shared/view-schemas.js';
import type { ViewerPresence } from '../../src/shared/viewer-experience.js';

describe('September 12 receiving-screen and account boundaries',()=>{
  let h:Harness,owner:Browser,sessionId:string,displayId:string,p:AuthPrincipal;
  const path=()=>`/api/sessions/${sessionId}/displays/${displayId}`;
  const call=async (name:string,args:unknown)=>(await h.runtime.service.execute(name,args,p));
  beforeEach(async()=>{h=await startHarness();owner=await h.account();sessionId=(await owner.session()).id;displayId=(await owner.display(sessionId)).id;p={userId:owner.user!.id};});
  afterEach(async()=>{await h?.close();});

  it('copies the default Ocean style and account defaults into new sessions without modifying old sessions, checks revisions and token scope',async()=>{
    const before=await owner.detail(sessionId);expect(before.session.config).toMatchObject({style:'ocean',accent:'#38bdf8'});
    await call('kanvas_preferences_update',{expectedRevision:0,config:{style:'iris',theme:'light',}});
    const next=await owner.session();expect(next.config).toMatchObject({style:'iris',accent:'#a78bfa',theme:'light'});expect((await owner.detail(sessionId)).session.config).toEqual(before.session.config);
    await expect(call('kanvas_preferences_update',{expectedRevision:0,config:{style:'lime'}})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
    const scoped=(await h.runtime.auth.issueToken(p.userId,'Selected',['read','publish'],[sessionId]));
    await expect(h.runtime.service.execute('kanvas_preferences_update',{expectedRevision:1,config:{style:'lime'}},{userId:p.userId,tokenId:scoped.token.id})).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  it('validates row arrays losslessly without publishing or saving a source, and rejects mismatched widths',async()=>{
    const before=(await h.runtime.store.db.prepare('SELECT count(*) n FROM documents').get())!.n;
    const result=await call('kanvas_view_validate',{sessionId,view:{version:1,template:'table',data:{columns:['Item','Value'],rows:[['A','12345678901234567890.001'],['B',null]]}}}) as {valid:boolean;view:{data:{rows:unknown[]}}};
    expect(result.view.data.rows).toEqual([{Item:'A',Value:'12345678901234567890.001'},{Item:'B',Value:null}]);expect((await h.runtime.store.db.prepare('SELECT count(*) n FROM documents').get())!.n).toBe(before);
    expect(()=>validateView({version:1,template:'table',data:{columns:['A','B'],rows:[[1]]}})).toThrow();
    await expect(call('kanvas_view_validate',{sessionId,view:{version:1,template:'image',data:{images:[{url:'/api/assets/missing',alt:'Missing'}]}}})).rejects.toBeTruthy();
  });
  it('short addresses never grant content access and are stable service-wide locators',async()=>{
    const first=await call('kanvas_address_get',{sessionId,displayId}) as {alias:string;url:string};const again=await call('kanvas_address_get',{sessionId,displayId});expect(again).toEqual(first);
    const response=await h.browser().raw(`/s/${first.alias}`);expect(response.status).toBe(302);expect(response.headers.get('location')).toBe(`/view/${sessionId}/${displayId}`);
    denied(await h.browser().request('GET',`/api/sessions/${sessionId}`),[401]);
    const another=await owner.display(sessionId);expect((await call('kanvas_address_get',{sessionId,displayId:another.id}) as {alias:string}).alias===first.alias).toBe(false);
  });
  it('owner-agent approval remains browser-bound and contribution stays explicit',async()=>{
    const share=await call('kanvas_share_create',{sessionId,displayId,allowInteraction:true}) as {id:string;qrAssetId:string;url:string};expect(share.qrAssetId).toBeTruthy();
    const guest=h.browser();const pair=success(await guest.request<{id:string}>('POST','/api/pairings',{shareId:share.id,deviceName:'Test screen',requestedInteractive:true}));
    const stranger=await h.account();await expect(h.runtime.service.execute('kanvas_pairing_decide',{sessionId,pairingId:pair.id,approve:true,confirm:true},{userId:stranger.user!.id})).rejects.toBeTruthy();
    await call('kanvas_pairing_decide',{sessionId,pairingId:pair.id,approve:true,interactive:true,confirm:true});
    denied(await h.browser().request('GET',`/api/pairings/${pair.id}/status`),[401]);
    success(await guest.request('GET',`/api/pairings/${pair.id}/status`));const me=success(await guest.request<{csrfToken:string;interactive:boolean}>('GET','/api/auth/me'));guest.csrf=me.csrfToken;expect(me.interactive).toBe(true);
    denied(await guest.request('PATCH','/api/preferences',{expectedRevision:0,config:{style:'iris'}}));
    denied(await guest.request('PATCH',`${path()}/view`,{expectedRevision:0,data:{text:'No full edit grant'}}));
  });
  it('records per-tab observations and context withdrawal; rejects capture, cross-session and stale observations',async()=>{
    await owner.submit(sessionId,[displayId],fact('Actual source'));
    const observation={tabId:'first-tab',revision:1,renderedRevision:1,status:'ready',visible:true,text:'Text read from browser',width:800,height:600,context:{consent:true,timeZone:'Europe/Oslo',locationStatus:'denied'}};
    const first=success(await owner.request<{viewerId:string}>('POST',`${path()}/observe`,observation));
    success(await owner.request('POST',`${path()}/observe`,{...observation,tabId:'second-tab',context:null}));
    const records=await call('kanvas_viewers_read',{sessionId}) as ViewerPresence[];expect(records).toHaveLength(2);expect(records.filter(x=>x.context)).toHaveLength(1);
    const inspect=await call('kanvas_display_inspect',{sessionId,displayId,fresh:false}) as {observations:{description:string}[]};expect(inspect.observations[0].description).toContain('Text read from browser');
    success(await owner.request('POST',`${path()}/observe`,{...observation,context:null}));expect((await call('kanvas_viewers_read',{sessionId}) as ViewerPresence[]).every(x=>x.context===null)).toBe(true);
    expect(success(await owner.request<{ignored:boolean}>('POST',`${path()}/observe`,{...observation,revision:0})).ignored).toBe(true);
    success(await owner.request('POST',`${path()}/observe`,{...observation,sequence:3,context:null}));
    expect(success(await owner.request<{ignored:boolean}>('POST',`${path()}/observe`,{...observation,sequence:2})).ignored).toBe(true);
    expect((await call('kanvas_viewers_read',{sessionId}) as ViewerPresence[]).every(x=>x.context===null)).toBe(true);
    const foreign=await h.account();denied(await foreign.request('POST',`${path()}/observe`,observation));
    (await expect((async ()=>(await h.runtime.service.experience.observe({...p,browserId:'capture',captureOnly:true},sessionId,displayId,observation)))()).rejects.toThrow());
    const saved=(await h.runtime.store.get<ViewerPresence>('viewer',first.viewerId))!;saved.expiresAt=0;(await h.runtime.store.put('viewer',saved));expect((await call('kanvas_viewers_read',{sessionId}) as ViewerPresence[])).toHaveLength(1);
  });
  it('toasts and revision-bound annotations do not alter the view history, and annotation retries stay exactly once',async()=>{
    await owner.submit(sessionId,[displayId],fact('Keep this view'));const history=(await h.runtime.service.displayHistory(p,sessionId,displayId));
    await call('kanvas_toast',{sessionId,displayIds:[displayId],text:'A toast',sticky:true});
    const body={requestId:randomUUID(),tabId:'a-tab',revision:1,kind:'note',points:[{x:.25,y:.5}],note:'Review this point'};
    const annotation=success(await owner.request<{id:string}>('POST',`${path()}/annotations`,body));
    expect(success(await owner.request<{id:string}>('POST',`${path()}/annotations`,body)).id).toBe(annotation.id);
    expect((await owner.detail(sessionId)).interactions.filter(x=>x.actionId==='viewer.annotation')).toHaveLength(1);
    expect((await h.runtime.service.displayHistory(p,sessionId,displayId))).toEqual(history);
    expect((await owner.detail(sessionId)).displays[0].revision).toBe(1);
    await owner.submit(sessionId,[displayId],fact('Next view'));expect((await owner.request('POST',`${path()}/annotations`,{...body,requestId:randomUUID()})).status).toBe(409);
  });
  it('logs receipt, preparation, push and actual acknowledgement with pagination and scoped access',async()=>{
    const requestId=randomUUID();await owner.submit(sessionId,[displayId],fact('Logged source'),requestId);
    let log=await call('kanvas_session_log',{sessionId,requestId}) as {entries:{stage:string}[]};expect(log.entries.map(x=>x.stage)).toEqual(expect.arrayContaining(['submission.received','render.started','render.prepared','view.pushed']));expect(log.entries.some(x=>x.stage==='viewer.acknowledged')).toBe(false);
    success(await owner.request('POST',`${path()}/applied`,{revision:1}));log=await call('kanvas_session_log',{sessionId}) as typeof log;expect(log.entries.some(x=>x.stage==='viewer.acknowledged')).toBe(true);
    const first=await call('kanvas_session_log',{sessionId,limit:2}) as {entries:{id:string}[];nextCursor:string};const next=await call('kanvas_session_log',{sessionId,afterId:first.nextCursor,limit:2}) as typeof first;expect(next.entries.some(x=>x.id===first.entries[0].id)).toBe(false);
    const stranger=await h.account();await expect(h.runtime.service.execute('kanvas_session_log',{sessionId},{userId:stranger.user!.id})).rejects.toBeTruthy();
  });
  it('keeps map geometry exact when changing only the camera, checks source revision',async()=>{
    await owner.submit(sessionId,[displayId],{version:1,template:'map',data:{markers:[{lat:58,lng:8,label:'Source'}]}});
    const requestId=randomUUID();await call('kanvas_map_camera',{sessionId,displayId,requestId,expectedRevision:1,center:{lat:59,lng:9},zoom:10});const result=await owner.settle(sessionId,requestId);expect(result.detail.displays[0].view?.data.markers).toEqual([{lat:58,lng:8,label:'Source'}]);
    await expect(call('kanvas_map_camera',{sessionId,displayId,requestId:randomUUID(),expectedRevision:1,center:{lat:58,lng:8},zoom:10})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
  });
  it('allows reusable asset reads through scoped bearer authorization without granting a browser login or another session',async()=>{
    const asset=(await h.runtime.service.importAsset(p,sessionId,{name:'Scoped pixels.png',mimeType:'image/png',base64:PNG}));
    const other=(await owner.session()).id;
    const allowed=(await h.runtime.auth.issueToken(p.userId,'Read this session',['read'],[sessionId]));
    const wrongSession=(await h.runtime.auth.issueToken(p.userId,'Read another session',['read'],[other]));
    const writeOnly=(await h.runtime.auth.issueToken(p.userId,'Publish only',['publish'],[sessionId]));
    const get=(value:string)=>h.browser().raw(asset.url,{headers:{Authorization:`Bearer ${value}`}});
    const ok=await get(allowed.value);expect(ok.status).toBe(200);expect(Buffer.from(await ok.arrayBuffer())).toEqual(Buffer.from(PNG,'base64'));expect(ok.headers.getSetCookie()).toEqual([]);
    expect((await get(wrongSession.value)).status).toBe(403);expect((await get(writeOnly.value)).status).toBe(403);
    expect((await h.browser().raw(asset.url)).status).toBe(401);
    (await h.runtime.auth.revokeToken(p.userId,allowed.token.id));expect((await get(allowed.value)).status).toBe(401);
  });
});

describe('email-confirmed sign-in',()=>{
  let h:Harness;afterEach(async()=>{await h?.close();});
  it('uses a one-time hashed challenge, confirms email, rotates login, and blocks replay and cross-origin use',async()=>{
    let delivered='';h=await startHarness({signinMailer:async(_email,link)=>{delivered=link;}});const guest=h.browser();
    success(await guest.request('POST','/api/auth/email/request',{email:'verified@example.com',returnTo:'//outside.example'}));
    const token=new URL(delivered).hash.split('=')[1];expect(Boolean(token)).toBe(true);expect(JSON.stringify((await h.runtime.store.list('email-challenge'))).includes(token)).toBe(false);
    denied(await guest.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14'},{origin:'https://attacker.example'}));
    const result=success(await guest.request<{returnTo:string;user:{id:string;username:string};csrfToken:string}>('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14'}));
    expect(result.returnTo).toBe('/');expect(result.user.username).toBe('verified@example.com');expect((await h.runtime.store.get('verified-email',result.user.id))).toBeTruthy();
    expect((await guest.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14'})).status).toBe(410);
    expect((await guest.request('POST','/api/auth/register',{username:'bypass',password:'not-a-real-credential'})).status).toBe(403);
  });
  it('keeps hosted registration closed and gives an ineligible address a generic response without mail',async()=>{
    let deliveries=0;h=await startHarness({allowRegistration:false,signinMailer:async()=>{deliveries++;}});const guest=h.browser();
    const result=success(await guest.request<{requested:boolean}>('POST','/api/auth/email/request',{email:'unknown@example.com'}));expect(result.requested).toBe(true);expect(deliveries).toBe(0);expect((await h.runtime.store.list('email-challenge'))).toHaveLength(0);
  });
});
