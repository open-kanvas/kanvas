import {afterEach,describe,expect,it,vi} from 'vitest';
import {startHarness,success,denied,type Harness,type Browser} from './harness.js';
import type {PairingRecord} from '../../src/server/access-flows.js';
import type {ToastRecord,ViewerPresence} from '../../src/shared/viewer-experience.js';
import type {ShortAddress} from '../../src/server/short-addresses.js';
import {NATO_WORDS} from '../../src/shared/recognition.js';

describe('NATO recognition, owner notices and actual receiving browsers',()=>{
  let h:Harness;afterEach(async()=>{await h?.close();});
  const setup=async(options:Parameters<typeof startHarness>[0]={})=>{h=await startHarness(options);const owner=await h.account(),session=await owner.session(),display=await owner.display(session.id);return {owner,s:session.id,d:display.id};};
  const request=(b:Browser,s:string,d:string)=>b.request<PairingRecord>('POST','/api/pairings',{sessionId:s,displayId:d},{headers:{'user-agent':'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1','accept-language':'nb-NO,en;q=0.9'}});
  it('allows unnamed devices, reports coarse metadata honestly, protects updates and invalidates both colliding labels',async()=>{
    const {owner,s,d}=await setup({pairingLabel:()=> 'alpha alpha'}),a=h.browser(),b=h.browser();
    const first=success(await request(a,s,d));expect(first.label.split(' ').every(x=>NATO_WORDS.includes(x as typeof NATO_WORDS[number]))).toBe(true);
    expect(first.selfName).toBeUndefined();expect(first.requestContext).toMatchObject({device:'iPhone',browser:'Safari',language:'nb-NO'});expect(first.requestContext?.location).toBeUndefined();
    const named=success(await a.request<PairingRecord>('POST',`/api/pairings/${first.id}/details`,{selfName:'  Visitor  '}));expect(named.selfName).toBe('Visitor');
    denied(await a.request('POST',`/api/pairings/${first.id}/details`,{selfName:'Changed'},{origin:'https://elsewhere.invalid'}),[403]);
    const second=success(await request(b,s,d));expect(second).toMatchObject({status:'cancelled',closeReason:'label-collision'});
    expect(success(await a.request('GET',`/api/pairings/${first.id}/status`))).toMatchObject({status:'cancelled',closeReason:'label-collision'});
    denied(await owner.request('POST',`/api/pairings/${first.id}/decision`,{approve:true}),[409,410]);
    denied(await a.request('GET','/api/auth/me'),[401]);denied(await b.request('GET','/api/auth/me'),[401]);
    const notices=success(await owner.request<ToastRecord[]>('GET','/api/account/notices'));expect(notices.some(x=>/collision|same label|duplicat|ambiguous/i.test(x.text))).toBe(true);
    expect(JSON.stringify(notices)).not.toMatch(/proofHash|browserSessionId/);
  });
  it('bounds invalid proof attempts, emits timeout independently of requester polling, and never grants access',async()=>{
    const {owner,s,d}=await setup(),waiting=h.browser(),pair=success(await request(waiting,s,d)),other=h.browser();
    for(let i=0;i<50;i++)denied(await other.request('GET',`/api/pairings/${pair.id}/status`),[401]);
    expect((await h.runtime.store.get<PairingRecord>('pairing',pair.id))).toMatchObject({status:'cancelled',failedAttempts:50,closeReason:'too-many-attempts'});
    const retry=success(await request(waiting,s,d));const stored=(await h.runtime.store.get<PairingRecord>('pairing',retry.id))!;stored.expiresAt=new Date(Date.now()-1).toISOString();(await h.runtime.store.put('pairing',stored));
    await vi.waitFor(async ()=>expect((await h.runtime.store.get<PairingRecord>('pairing',retry.id))?.status).toBe('expired'),{timeout:6500,interval:100});
    const notices=success(await owner.request<ToastRecord[]>('GET','/api/account/notices'));expect(notices.some(x=>/expir|timed out/i.test(x.text))).toBe(true);
    denied(await waiting.request('GET','/api/auth/me'),[401]);
  },12000);
  it('counts signed-in and paired SSE viewers separately from approval history, deduplicates reconnects, and excludes revoked streams',async()=>{
    const {owner,s,d}=await setup(),viewer=await h.account();success(await owner.request('POST',`/api/sessions/${s}/members`,{username:viewer.user!.username,role:'viewer'}));
    const paired=h.browser(),pair=success(await request(paired,s,d));success(await owner.request('POST',`/api/pairings/${pair.id}/decision`,{approve:true}));success(await paired.request('GET',`/api/pairings/${pair.id}/status`));paired.csrf=success(await paired.request<{csrfToken:string}>('GET','/api/auth/me')).csrfToken;
    const list=async()=>success(await owner.request<ViewerPresence[]>('GET',`/api/sessions/${s}/viewers`));expect((await list()).filter(x=>x.connected)).toHaveLength(0);
    const a=new AbortController(),b=new AbortController(),c=new AbortController();
    const first=await viewer.raw(`/api/sessions/${s}/events?displayId=${d}&tabId=one`,{}, {signal:a.signal});expect(first.status).toBe(200);
    const repeat=await viewer.raw(`/api/sessions/${s}/events?displayId=${d}&tabId=one`,{}, {signal:b.signal});expect(repeat.status).toBe(200);
    const second=await paired.raw(`/api/sessions/${s}/events?displayId=${d}&tabId=two`,{}, {signal:c.signal});expect(second.status).toBe(200);
    expect((await list()).filter(x=>x.connected).map(x=>x.connectionMethod).sort()).toEqual(['account','paired']);
    const nonOwner=success(await viewer.request<ViewerPresence[]>('GET',`/api/sessions/${s}/viewers`));expect(nonOwner.every(x=>!x.requestContext)).toBe(true);denied(await paired.request('GET','/api/account/notices'));
    a.abort();expect((await list()).filter(x=>x.connected)).toHaveLength(2);
    success(await owner.request('DELETE',`/api/pairings/${pair.id}`));await vi.waitFor(async()=>expect((await list()).filter(x=>x.connected)).toHaveLength(1));
    b.abort();c.abort();await vi.waitFor(async()=>expect((await list()).filter(x=>x.connected)).toHaveLength(0));
    await vi.waitFor(async()=>expect(success(await owner.request<ToastRecord[]>('GET','/api/account/notices')).some(x=>/disconnected/.test(x.text))).toBe(true),{timeout:3000});
  });
  it('drains a disconnect already in progress before closing its store', async () => {
    const { owner, s, d } = await setup();
    const presence = h.runtime.service.experience.receiving;
    const connection = await presence.connect({ userId: owner.user!.id }, s, d, 'shutdown-tab', 'Synthetic browser');
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const original = h.runtime.service.topology.disconnected.bind(h.runtime.service.topology);
    const disconnect = vi.spyOn(h.runtime.service.topology, 'disconnected').mockImplementation(async (...args) => {
      entered(); await held; return original(...args);
    });
    connection.disconnect();
    await started;
    let closed = false;
    const closing = Promise.resolve(presence.close()).then(() => { closed = true; });
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(closed, 'shutdown must wait for the in-flight disconnect write').toBe(false);
    } finally {
      release();
      await closing;
      await vi.waitFor(async () => expect((await h.runtime.store.list<ToastRecord>('toast', s)).some(notice => /disconnected from/.test(notice.text))).toBe(true));
      disconnect.mockRestore();
    }
    expect(closed).toBe(true);
  });
  it('uses four-character locators, keeps canonical access checks, and enforces custom entitlement and recycling policy',async()=>{
    const {owner,s,d}=await setup(),addresses=h.runtime.service.experience.addresses,p={userId:owner.user!.id};
    const short=(await addresses.reserve(s,d));expect(short.id).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{4}$/);expect((await addresses.resolve(short.id))).toBe(`/view/${s}/${d}`);
    denied(await h.browser().request('GET',`/api/sessions/${s}?displayId=${d}`),[401]);
    (await expect((async ()=>(await addresses.customize(p,{sessionId:s,displayId:d,alias:'myworkshop'})))()).rejects.toThrow());
    (await h.runtime.store.put('address-entitlement',{id:p.userId,customAddresses:true,expiresAt:Date.now()+86400000}));
    expect((await addresses.customize(p,{sessionId:s,displayId:d,alias:'myworkshop'}))).toMatchObject({alias:'myworkshop',access:'locator-only'});
    expect((await addresses.customize(p,{sessionId:s,displayId:d,alias:null})).alias).toBe(short.id);
    const old={...short,id:'legacy-issued',kind:undefined} as ShortAddress;(await h.runtime.store.put('alias',old));
    const session=(await h.runtime.store.get<{id:string;endedAt:string}>('session',s))!;session.endedAt=new Date(Date.now()-8*86400000).toISOString();(await h.runtime.store.put('session',session));(await addresses.candidate());
    expect((await h.runtime.store.get('alias',short.id))).toBeUndefined();expect((await h.runtime.store.get('alias','legacy-issued'))).toBeDefined();expect((await h.runtime.store.get('display',d))).toBeDefined();
  });
  it('unifies a registered account screen and a paired guest across two displays without treating approval as presence',async()=>{
    const {owner,s,d}=await setup(),otherDisplay=await owner.display(s),paired=h.browser();
    const device=success(await owner.request<{id:string}>('POST','/api/devices/register',{installationId:'registered-session-receiver',name:'Meeting PC'}));
    const pair=success(await request(paired,s,otherDisplay.id));success(await owner.request('POST',`/api/pairings/${pair.id}/decision`,{approve:true}));success(await paired.request('GET',`/api/pairings/${pair.id}/status`));
    const list=async()=>success(await owner.request<any>('GET',`/api/sessions/${s}/participants`));
    expect((await list()).participants.filter((v:any)=>v.connected)).toHaveLength(0);
    const a=new AbortController(),b=new AbortController();
    try{
      expect((await owner.raw(`/api/sessions/${s}/events?displayId=${d}&tabId=registered`,{},{signal:a.signal})).status).toBe(200);
      expect((await paired.raw(`/api/sessions/${s}/events?displayId=${otherDisplay.id}&tabId=guest`,{},{signal:b.signal})).status).toBe(200);
      const viewers=(await list()).participants.filter((v:any)=>v.connected);
      expect(viewers.map((v:any)=>v.kind).sort()).toEqual(['guest','registered-account']);
      expect(viewers.find((v:any)=>v.kind==='registered-account')).toMatchObject({displayId:d,deviceId:device.id,deviceName:'Meeting PC'});
      expect(viewers.find((v:any)=>v.kind==='guest')).toMatchObject({displayId:otherDisplay.id});
      expect(viewers.every((v:any)=>v.lastActiveAt&&v.joinedAt)).toBe(true);
      denied(await paired.request('GET',`/api/sessions/${s}/participants`),[403]);
      success(await owner.request('DELETE',`/api/pairings/${pair.id}`));await vi.waitFor(async()=>expect((await list()).participants.filter((v:any)=>v.connected)).toHaveLength(1));
    }finally{a.abort();b.abort();}
  });
});
