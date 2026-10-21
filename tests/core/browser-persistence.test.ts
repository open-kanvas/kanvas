import {afterEach,describe,expect,it,vi} from 'vitest';
import type {Request,Response} from 'express';
import {setPublicAccess} from '../../src/server/public-sessions';
import {hash,Auth,type BrowserSession} from '../../src/server/auth';
import {startHarness,success,type Harness,type Browser} from './harness';
const DAY=86400000;
let h:Harness;
afterEach(async()=>{vi.restoreAllMocks();await h?.close();});
const key=(b:Browser)=>hash(b.cookies.get('kanvas')!);
const row=(b:Browser)=>h.runtime.store.get<BrowserSession>('browser',key(b));
const activity=(b:Browser)=>b.request<any>('POST','/api/auth/activity',{}, {headers:{'X-Kanvas-Activity':'foreground'}});
const at=(time:number)=>vi.spyOn(Date,'now').mockReturnValue(time);

describe('Persistent account browser sessions',()=>{
 it('issues 90-day host-only cookies with independent public IDs and a 365-day cap',async()=>{
  h=await startHarness();const b=await h.account(),s=(await row(b))!;
  expect(s.expiresAt-s.authenticatedAt!).toBe(90*DAY);expect(s.absoluteExpiresAt!-s.authenticatedAt!).toBe(365*DAY);
  expect(s.publicId).toBeTruthy();expect(s.publicId).not.toBe(s.id);
  const cookies:any[]=[];const auth=new Auth(h.runtime.store,true,true,'https://dev.example/mcp');
  await auth.issueBrowser(b.user!.id,{cookie:(...args:any[])=>cookies.push(args)} as unknown as Response,undefined,{get:()=> 'Mozilla/5.0 Android Chrome/150'} as unknown as Request);
  expect(cookies[0][0]).toBe('__Host-kanvas');expect(cookies[0][2]).toMatchObject({httpOnly:true,secure:true,sameSite:'strict',path:'/'});expect(cookies[0][2]).not.toHaveProperty('domain');expect(cookies[0][2].maxAge).toBeGreaterThan(89*DAY);
  const list=success(await b.request<any>('GET','/api/auth/sessions'));expect(list.browsers).toHaveLength(2);expect(JSON.stringify(list)).not.toContain(s.csrf);expect(JSON.stringify(list)).not.toContain(s.id);
 });
 it('renews only explicit CSRF-protected foreground use and throttles writes/cookies',async()=>{
  h=await startHarness();const b=await h.account(),initial=(await row(b))!;at(initial.authenticatedAt!+2*DAY);
  for(const path of ['/api/auth/me','/api/sessions','/api/start'])success(await b.request('GET',path));
  expect(await row(b)).toEqual(initial);
  expect((await b.request('POST','/api/auth/activity',{})).status).toBe(400);
  expect((await b.request('POST','/api/auth/activity',{}, {csrf:null,headers:{'X-Kanvas-Activity':'foreground'}})).status).toBe(403);
  const result=await activity(b);expect(success(result).renewed).toBe(true);expect(result.headers.getSetCookie()).toHaveLength(1);
  const renewed=(await row(b))!;expect(renewed.expiresAt).toBe(initial.authenticatedAt!+92*DAY);expect(renewed.absoluteExpiresAt).toBe(initial.absoluteExpiresAt);expect(renewed.authenticatedAt).toBe(initial.authenticatedAt);
  const repeat=await activity(b);expect(success(repeat).renewed).toBe(false);expect(repeat.headers.getSetCookie()).toHaveLength(0);expect(await row(b)).toEqual(renewed);
 });
 it('bounds time-travel renewal by absolute age and records one reason-coded expiry',async()=>{
  h=await startHarness();const b=await h.account(),s=(await row(b))!;
  for(const day of [80,160,240,320,364]){at(s.authenticatedAt!+day*DAY);success(await activity(b));}
  expect((await row(b))!.expiresAt).toBe(s.absoluteExpiresAt);
  at(s.absoluteExpiresAt!);expect((await activity(b)).error?.code).toBe('SESSION_ABSOLUTE_EXPIRED');
  expect(await row(b)).toBeUndefined();expect((await b.request('GET','/api/auth/me')).status).toBe(401);
  const events=(await h.runtime.store.list<any>('audit-event')).filter(x=>x.details?.reason==='absolute-expired');expect(events).toHaveLength(1);expect(events[0].details.browserSessionId).toBe(s.publicId);expect(JSON.stringify(events)).not.toContain(s.id);
 });
 it('expires inactive browsers without revival and keeps explicit logout reasons',async()=>{
  h=await startHarness();const b=await h.account(),s=(await row(b))!;at(s.expiresAt);
  expect((await activity(b)).error?.code).toBe('SESSION_IDLE_EXPIRED');expect(await row(b)).toBeUndefined();
  vi.restoreAllMocks();const c=await h.account();success(await c.request('POST','/api/auth/logout',{}));
  expect((await h.runtime.store.list<any>('audit-event')).some(x=>x.details?.reason==='logout')).toBe(true);
 });
 it('migrates valid seven-day legacy records at original age, without extending on background reads',async()=>{
  h=await startHarness();const b=await h.account(),current=(await row(b))!,created=Date.now()-3*DAY;
  const legacy:BrowserSession={id:current.id,userId:current.userId,csrf:current.csrf,createdAt:new Date(created).toISOString(),expiresAt:created+7*DAY};await h.runtime.store.put('browser',legacy);
  success(await b.request('GET','/api/auth/me'));const migrated=(await row(b))!;expect(migrated.expiresAt).toBe(legacy.expiresAt);expect(migrated.absoluteExpiresAt).toBe(created+365*DAY);expect(migrated.publicId).toBeTruthy();
  const cookie=b.cookies.get('kanvas');success(await activity(b));expect(b.cookies.get('kanvas')).toBe(cookie);expect((await row(b))!.expiresAt).toBeGreaterThan(Date.now()+89*DAY);
  expect((await row(b))!.authenticatedAt).toBe(created);
 });
 it('does not migrate expired legacy/scoped sessions into long-lived account authority',async()=>{
  h=await startHarness();const b=await h.account(),s=(await row(b))!;
  const expired:BrowserSession={id:s.id,userId:s.userId,csrf:s.csrf,expiresAt:Date.now()-1};await h.runtime.store.put('browser',expired);
  expect((await activity(b)).status).toBe(401);expect(await row(b)).toBeUndefined();
  const cookies:any[]=[];const capture=await h.runtime.auth.issueBrowser(s.userId,{cookie:(...args:any[])=>cookies.push(args)} as unknown as Response,{captureOnly:true,scopedSessionId:'s',scopedDisplayId:'d'});
  expect(capture.expiresAt-Date.now()).toBeLessThanOrEqual(7*DAY);expect(capture.publicId).toBeUndefined();
  const request={cookies:{kanvas:cookies[0][1]},get:(name:string)=>name==='X-Kanvas-CSRF'?capture.csrf:'foreground'} as unknown as Request;
  expect(await h.runtime.auth.activity(request,{cookie:()=>{throw new Error('must not renew capture');}} as unknown as Response)).toEqual({renewed:false});
  expect(await h.runtime.store.get('browser',capture.id)).toEqual(capture);
 });
 it('serializes concurrent renewal/revocation and never recreates revoked records',async()=>{
  h=await startHarness();const b=await h.account(),s=(await row(b))!;at(s.authenticatedAt!+2*DAY);
  await Promise.all([activity(b),h.runtime.auth.revokeBrowser(s.id,'device-revoked'),activity(b)]);
  expect(await row(b)).toBeUndefined();expect((await activity(b)).status).toBe(401);
  const events=(await h.runtime.store.list<any>('audit-event')).filter(x=>x.details?.reason==='device-revoked');expect(events).toHaveLength(1);
  // Forced revoke-first order while a write transaction holds the global lock.
  vi.restoreAllMocks();const c=await h.account(),other=(await row(c))!;at(other.authenticatedAt!+2*DAY);
  await h.runtime.store.atomic(async()=>{await h.runtime.auth.revokeBrowser(other.id);});expect((await activity(c)).status).toBe(401);expect(await row(c)).toBeUndefined();
 });
 it('requires fresh auth for credentials, OAuth/device approval and membership, not content/logout or agent tokens',async()=>{
  h=await startHarness();const b=await h.account(),other=await h.account(),session=await b.session(),s=(await row(b))!;
  at(s.authenticatedAt!+16*60000);
  expect((await b.request('POST','/api/tokens',{name:'blocked'})).error?.code).toBe('REAUTH_REQUIRED');
  expect((await b.request('POST','/api/oauth/approve',{requestId:'not-created',approve:true,matchesCode:true,accessMode:'account'})).error?.code).toBe('REAUTH_REQUIRED');
  await expect(h.runtime.service.addMember({userId:s.userId,browserId:s.id},session.id,other.user!.username,'viewer')).rejects.toMatchObject({code:'REAUTH_REQUIRED'});
  await expect(h.runtime.service.accounts.setMember({userId:s.userId,browserId:s.id},{})).rejects.toMatchObject({code:'REAUTH_REQUIRED'});
  await expect(h.runtime.service.accounts.grant({userId:s.userId,browserId:s.id},{})).rejects.toMatchObject({code:'REAUTH_REQUIRED'});
  await expect(setPublicAccess(h.runtime.service,{userId:s.userId,browserId:s.id},{sessionId:session.id,enabled:true,confirm:true})).rejects.toMatchObject({code:'REAUTH_REQUIRED'});
  await expect(h.runtime.service.invitations.create({userId:s.userId,browserId:s.id},{groupId:'group',requestId:'stale'})).rejects.toMatchObject({code:'REAUTH_REQUIRED'});
  const agent=await h.runtime.auth.issueToken(s.userId,'agent');await expect(h.runtime.auth.requireFresh({userId:s.userId,tokenId:agent.token.id})).resolves.toBeUndefined();
  success(await b.request('GET','/api/sessions'));success(await b.request('POST','/api/auth/logout',{}));
 });
 it('exposes own safe session list and controls one/all devices with CSRF and ownership',async()=>{
  h=await startHarness();const b=await h.account(),other=await h.account(),s=(await row(b))!,second=await h.runtime.auth.issueBrowser(s.userId,{cookie:()=>{}} as unknown as Response);
  const list=success(await b.request<any>('GET','/api/auth/sessions'));expect(list.browsers).toHaveLength(2);expect(list.browsers.find((x:any)=>x.id===s.publicId).current).toBe(true);
  expect((await other.request('POST','/api/auth/sessions/revoke',{browserSessionId:second.publicId,confirm:true,requestId:'foreign'})).status).toBe(404);
  expect((await b.request('POST','/api/auth/sessions/revoke',{all:true,confirm:true,requestId:'csrf'},{csrf:null})).status).toBe(403);
  success(await b.request('POST','/api/auth/sessions/revoke',{browserSessionId:second.publicId,confirm:true,requestId:'one'}));expect(await h.runtime.store.get('browser',second.id)).toBeUndefined();expect((await b.request('GET','/api/auth/me')).status).toBe(200);
  success(await b.request('POST','/api/auth/sessions/revoke',{all:true,confirm:true,requestId:'all'}));expect((await b.request('GET','/api/auth/me')).error?.code).toBe('SESSION_REVOKED');expect((await other.request('GET','/api/auth/me')).status).toBe(200);
 });
 it('validates configurable policies and applies shorter full-account limits',async()=>{
  h=await startHarness({browserSessionPolicy:{idleDays:10,absoluteDays:20,renewalHours:12,freshMinutes:5}});const b=await h.account(),s=(await row(b))!;expect(s.expiresAt-s.authenticatedAt!).toBe(10*DAY);expect(s.absoluteExpiresAt!-s.authenticatedAt!).toBe(20*DAY);
  expect(()=>new Auth(h.runtime.store,true,true,undefined,{idleDays:0})).toThrow();expect(()=>new Auth(h.runtime.store,true,true,undefined,{idleDays:2,absoluteDays:1})).toThrow();
 });
});
