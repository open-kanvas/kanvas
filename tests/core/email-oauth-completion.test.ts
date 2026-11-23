import {afterEach,describe,expect,it} from 'vitest';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {startHarness,success,type Harness} from './harness';

describe('independent email OAuth completion',()=>{
 let h:Harness;afterEach(async()=>{await h?.close();});
 async function setup(){
  let link='';h=await startHarness({signinMailer:async(_email,url)=>{link=url;}});
  const origin=h.browser(),email=h.browser(),callback='https://client.example/callback?preserved=yes',verifier=randomBytes(32).toString('base64url'),state='opaque-ø &?'+randomUUID();
  const registration=await origin.raw('/oauth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'Email client',redirect_uris:[callback],grant_types:['authorization_code'],response_types:['code'],token_endpoint_auth_method:'none'})});
  expect(registration.status).toBe(201);const client=await registration.json();
  const params=new URLSearchParams({client_id:client.client_id,redirect_uri:callback,response_type:'code',scope:'read publish',resource:'http://127.0.0.1/mcp',state,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')});
  const pending=await origin.raw('/oauth/authorize?'+params);expect(pending.status).toBe(303);const requestId=new URL(pending.headers.get('location')!).searchParams.get('authorize')!;
  success(await origin.request('POST','/api/auth/email/request',{email:'independent@example.invalid',authorizationRequestId:requestId,acceptedLegalVersion:'2026-10-14'}));
  const token=new URL(link).hash.slice('#email-signin='.length),body={token,confirm:true,acceptedLegalVersion:'2026-10-14',target:'current'};
  const exchange=(code:string,overrides:Record<string,string>={})=>email.raw('/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client.client_id,redirect_uri:callback,resource:'http://127.0.0.1/mcp',code,code_verifier:verifier,...overrides}).toString()});
  return {origin,email,body,requestId,state,params,client,exchange};
 }
 it('requires deliberate legal consent and rejects injected callback, state, client and PKCE fields',async()=>{
  const f=await setup();success(await f.email.request('POST','/api/auth/email/inspect',{token:f.body.token}));expect(await h.runtime.store.list('oauth-code')).toHaveLength(0);
  for(const extra of [{confirm:false},{acceptedLegalVersion:'old'},{redirectUri:'https://evil.example'},{state:'swapped'},{client_id:'swapped'},{code_challenge:'swapped'},{requestId:'swapped'}])expect((await f.email.request('POST','/api/auth/email/consume',{...f.body,...extra})).status).toBe(400);
  expect((await f.email.request('POST','/api/auth/email/consume',f.body,{origin:'https://evil.example'})).status).toBe(403);
  expect(await h.runtime.store.list('oauth-code')).toHaveLength(0);expect(Number((await h.runtime.store.db.prepare('SELECT COUNT(*) n FROM users').get())!.n)).toBe(0);
  const result=success(await f.email.request<{redirectUri:string}>('POST','/api/auth/email/consume',f.body)),url=new URL(result.redirectUri);expect(url.searchParams.get('state')).toBe(f.state);expect(url.searchParams.get('preserved')).toBe('yes');expect(url.searchParams.get('iss')).toBe('http://127.0.0.1');
  for(const override of [{code_verifier:randomBytes(32).toString('base64url')},{client_id:randomUUID()},{redirect_uri:'https://evil.example'},{resource:'https://evil.example/mcp'}])expect((await f.exchange(url.searchParams.get('code')!,override)).status).toBe(400);
  const code=url.searchParams.get('code')!;expect((await f.exchange(code)).status).toBe(200);expect((await f.exchange(code)).status).toBe(400);
  expect((await f.origin.request('GET','/api/auth/me')).status).toBe(401);expect((await f.email.request('GET','/api/auth/me')).status).toBe(401);
 });
 it('rejects invalid authorization state and PKCE before an email request can be issued',async()=>{
  const f=await setup(),before=(await h.runtime.store.list('oauth-consent')).length;
  for(const change of [{state:''},{state:'bad\nstate'},{state:'x'.repeat(8193)},{client_id:randomUUID()},{code_challenge:'bad'},{code_challenge_method:'plain'}]){const query=new URLSearchParams(f.params);for(const [key,value] of Object.entries(change))query.set(key,value);const r=await f.origin.raw('/oauth/authorize?'+query);expect([400,303]).toContain(r.status);if(r.status===303)expect(new URL(r.headers.get('location')!).searchParams.has('error')).toBe(true);}
  expect(await h.runtime.store.list('oauth-consent')).toHaveLength(before);
 });
 it('issues exactly one callback when two email tabs and the original completion race',async()=>{
  const f=await setup(),other=h.browser();const results=await Promise.all([f.email.request<{redirectUri:string}>('POST','/api/auth/email/consume',f.body),other.request<{redirectUri:string}>('POST','/api/auth/email/consume',f.body),f.origin.request('POST','/api/auth/email/complete',{})]);
  expect(results.map(r=>r.status).sort()).toEqual([200,410,410]);expect(await h.runtime.store.list('oauth-code')).toHaveLength(1);expect(await h.runtime.store.list('browser')).toHaveLength(0);
  expect((await f.origin.request('POST','/api/auth/email/complete',{})).status).toBe(410);expect((await f.email.request('POST','/api/auth/email/inspect',{token:f.body.token})).status).toBe(410);
 });
 it('allows only one email identity to approve the same consent',async()=>{
  const f=await setup();
  // Two outstanding email links can refer to the same client consent.
  const token=randomBytes(32).toString('base64url'),original=(await h.runtime.store.list<any>('email-challenge'))[0];
  await h.runtime.store.put('email-challenge',{...original,id:createHash('sha256').update(token).digest('hex'),email:'second@example.invalid'});
  const results=await Promise.all([f.email.request('POST','/api/auth/email/consume',f.body),h.browser().request('POST','/api/auth/email/consume',{...f.body,token})]);
  expect(results.map(r=>r.status).sort()).toEqual([200,410]);expect(await h.runtime.store.list('oauth-code')).toHaveLength(1);expect(Number((await h.runtime.store.db.prepare('SELECT COUNT(*) n FROM users').get())!.n)).toBe(1);
 });
 it('serializes denial against confirmation without a partial grant',async()=>{
  const f=await setup();const [consume,deny]=await Promise.all([f.email.request('POST','/api/auth/email/consume',f.body),h.browser().request('POST','/api/auth/email/deny',{token:f.body.token})]);expect([consume.status,deny.status].sort()).toEqual([200,410]);expect(await h.runtime.store.list('oauth-code')).toHaveLength(consume.status===200?1:0);
 });
 it.each(['expired','denied','client-removed'] as const)('rolls back consumption for %s consent',async(mode)=>{
  const f=await setup(),consent=await h.runtime.store.get<any>('oauth-consent',f.requestId);
  if(mode==='client-removed')await h.runtime.store.delete('oauth-client',f.client.client_id);else await h.runtime.store.put('oauth-consent',{...consent,...(mode==='expired'?{expiresAt:new Date(0).toISOString()}:{status:'denied'})});
  expect((await f.email.request('POST','/api/auth/email/consume',f.body)).status).toBe(410);expect(await h.runtime.store.list('oauth-code')).toHaveLength(0);expect(await h.runtime.store.list('email-challenge')).toHaveLength(1);expect(Number((await h.runtime.store.db.prepare('SELECT COUNT(*) n FROM users').get())!.n)).toBe(0);
 });
});
