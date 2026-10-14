import { afterEach, describe, expect, it } from 'vitest';
import { startHarness, success, denied, type Harness } from './harness.js';
import { configPatchSchema } from '../../src/shared/preferences.js';
import { WebsitePreview } from '../../src/server/website-preview.js';
let h:Harness;
afterEach(async()=>{await h?.close();});
describe('cross-device sign-in approval',()=>{
  async function setup(){const links:string[]=[];h=await startHarness({signinMailer:async(_email,link)=>{links.push(link);}});const origin=h.browser(),phone=h.browser();const pending=success(await origin.request<{code:string}>('POST','/api/auth/email/request',{email:'cross-device@example.com'}));const token=new URL(links.at(-1)!).hash.split('=')[1];return {origin,phone,pending,token,links};}
  it('opening/inspecting does not authorize either browser; explicit match approves only cookie-bound origin, once',async()=>{
    const {origin,phone,pending,token}=await setup();
    const detail=success(await phone.request<{originatingDevice:{code:string;device:string;createdAt:string}}> ('POST','/api/auth/email/inspect',{token}));
    expect(detail.originatingDevice.code===pending.code).toBe(true);expect(detail.originatingDevice.device).toBeTruthy();expect(Date.parse(detail.originatingDevice.createdAt)).toBeGreaterThan(0);
    denied(await origin.request('GET','/api/auth/me'),[401]);denied(await phone.request('GET','/api/auth/me'),[401]);denied(await origin.request('POST','/api/auth/email/complete',{}),[410]);
    denied(await phone.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14',target:'origin'}),[400]);
    success(await phone.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14',target:'origin',matchesCode:true}));
    denied(await phone.request('GET','/api/auth/me'),[401]);denied(await phone.request('POST','/api/auth/email/complete',{}),[410]);
    expect(success(await origin.request('GET','/api/auth/email/status'))).toEqual({status:'approved'});
    const signed=success(await origin.request<{user:{username:string}}>('POST','/api/auth/email/complete',{}));expect(signed.user.username).toBe('cross-device@example.com');
    denied(await origin.request('POST','/api/auth/email/complete',{}),[410]);denied(await phone.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14'}),[410]);
  });
  it('denial consumes the link and cannot issue either session',async()=>{
    const {origin,phone,token}=await setup();success(await phone.request('POST','/api/auth/email/deny',{token}));
    expect(success(await origin.request('GET','/api/auth/email/status'))).toEqual({status:'denied'});
    denied(await phone.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14',target:'origin',matchesCode:true}),[410]);denied(await origin.request('POST','/api/auth/email/complete',{}),[410]);denied(await phone.request('POST','/api/auth/email/deny',{token}),[410]);
    expect(await h.runtime.store.list('browser')).toHaveLength(0);
  });
  it('expires before approval and after approval, and refuses stale completion',async()=>{
    const {origin,phone,token}=await setup();for(const c of await h.runtime.store.list<any>('email-challenge'))await h.runtime.store.put('email-challenge',{...c,expiresAt:Date.now()-1});
    denied(await phone.request('POST','/api/auth/email/inspect',{token}),[410]);denied(await phone.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14'}),[410]);
    for(const p of await h.runtime.store.list<any>('email-pending'))await h.runtime.store.put('email-pending',{...p,status:'approved',userId:'not-a-real-user',expiresAt:Date.now()-1});
    denied(await origin.request('POST','/api/auth/email/complete',{}),[410]);expect(success(await origin.request('GET','/api/auth/email/status'))).toEqual({status:'expired'});
  });
  it('retains explicit current-device sign-in and never approves other concurrent requests for the email',async()=>{
    const {origin,phone,token,links}=await setup(),second=h.browser();
    success(await second.request('POST','/api/auth/email/request',{email:'cross-device@example.com'}));const secondToken=new URL(links.at(-1)!).hash.split('=')[1];
    success(await phone.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14',target:'current'}));
    success(await phone.request('GET','/api/auth/me'));denied(await origin.request('POST','/api/auth/email/complete',{}),[410]);
    expect(success(await second.request('GET','/api/auth/email/status'))).toEqual({status:'pending'});
    success(await phone.request('POST','/api/auth/email/deny',{token:secondToken}));
  });
  it('serializes duplicate approvals and rejects cross-origin approval or completion',async()=>{
    const {origin,phone,token}=await setup();
    denied(await phone.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14',target:'origin',matchesCode:true},{origin:'https://attacker.invalid'}));
    const results=await Promise.all([1,2].map(()=>phone.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14',target:'origin',matchesCode:true})));expect(results.map(r=>r.status).sort()).toEqual([200,410]);
    denied(await origin.request('POST','/api/auth/email/complete',{}, {origin:'https://attacker.invalid'}));success(await origin.request('POST','/api/auth/email/complete',{}));
  });
});
it('round-trips time format through session and personal config; new templates publish through normal service',async()=>{
  h=await startHarness();const owner=await h.account(),s=(await owner.session()).id,d=(await owner.display(s)).id;
  expect(configPatchSchema.parse({timeFormat:'12h'})).toEqual({timeFormat:'12h'});
  success(await owner.request('PATCH',`/api/sessions/${s}/config`,{expectedRevision:0,config:{timeFormat:'12h'}}));expect((await owner.detail(s)).session.config.timeFormat).toBe('12h');

  const principal={userId:owner.user!.id};const pref=await h.runtime.service.execute('kanvas_preferences_get',{},principal) as any;
  await h.runtime.service.execute('kanvas_preferences_update',{expectedRevision:pref.revision,config:{timeFormat:'24h'}},principal);
  expect((await owner.session()).config.timeFormat).toBe('24h');expect((await owner.detail(s)).session.config.timeFormat).toBe('12h');
  await owner.submit(s,[d],{version:1,template:'inbox',format:{timeFormat:'12h',dateFormat:'dmy'},data:{items:[{id:'m',from:'Sender',subject:'Subject',timestamp:'2026-09-27T14:26:04Z'}]}});expect((await owner.detail(s)).displays[0].view?.format?.timeFormat).toBe('12h');
  const {samples}=await import('../../src/shared/template-examples.js');for(const key of ['sports-lineup','org-chart','flowchart','network'] as const){await owner.submit(s,[d],samples[key]);expect((await owner.detail(s)).displays[0].view?.template).toBe(key);}
});
it('returns useful metadata when a refused site cannot be captured',async()=>{
  h=await startHarness();const owner=await h.account(),s=(await owner.session()).id,d=(await owner.display(s)).id;
  await owner.submit(s,[d],{version:1,template:'website',data:{pages:[{url:'https://example.com/'}]}});
  const preview=new WebsitePreview(h.runtime.service,{request:async(_url,headersOnly)=>({statusCode:200,headers:{'content-type':'text/html','x-frame-options':'DENY'},body:Buffer.from(headersOnly?'':'<title>Useful source</title><meta name="description" content="A public page summary"><meta property="og:image" content="https://example.com/cover.png">')}),screenshot:async()=>{throw new Error('Site blocks bots');}});
  const result=await preview.preview({userId:owner.user!.id},s,d,{expectedRevision:1,page:0});expect(result).toMatchObject({status:'unavailable',title:'Useful source',description:'A public page summary',previewImage:'https://example.com/cover.png',remoteContentVerified:false});
});
