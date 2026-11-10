import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const paused=vi.hoisted(()=>({count:0}));
vi.mock('../../src/client/frontend-diagnostics',()=>({diagnostic:()=>{},diagnosticsAuthenticated:()=>{},pauseDiagnostics:()=>{paused.count++;}}));
const response=(status:number,data?:unknown,code='UNAUTHORIZED')=>new Response(JSON.stringify(status<300?{data}:{error:{code,message:'test failure'}}),{status,headers:{'content-type':'application/json'}});
const state={user:{id:'user',username:'test',displayName:'Test'},csrfToken:'fresh-csrf',browserSessionId:'public-session'};
let client:typeof import('../../src/client/api');let fetchMock:ReturnType<typeof vi.fn>;let events:Event[];
beforeEach(async()=>{vi.resetModules();const target=new EventTarget();events=[];target.addEventListener('kanvas:auth-confirmed',e=>events.push(e));vi.stubGlobal('window',target);vi.stubGlobal('BroadcastChannel',undefined);fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);client=await import('../../src/client/api');});
afterEach(()=>{vi.unstubAllGlobals();});
describe('Client authentication recovery',()=>{
 it('coalesces concurrent non-auth 401s, refreshes CSRF and retries only safe reads once',async()=>{
  let confirmations=0,reads=0;fetchMock.mockImplementation(async(path:string)=>{if(path==='/api/auth/me'){confirmations++;await new Promise(r=>setTimeout(r,10));return response(200,state);}return ++reads<=2?response(401):response(200,{ok:true});});
  expect(await Promise.all([client.api('/api/one'),client.api('/api/two')])).toEqual([{ok:true},{ok:true}]);expect(confirmations).toBe(1);expect(events).toHaveLength(1);
  fetchMock.mockResolvedValue(response(200,{}));await client.api('/api/write',{method:'POST',body:{}});expect(fetchMock.mock.calls.at(-1)![1].headers['X-Kanvas-CSRF']).toBe('fresh-csrf');
 });
 it('never blindly replays a mutation after 401 or CSRF rotation',async()=>{
  for(const status of [401,403]){
   client.advanceAuthGeneration();fetchMock.mockReset().mockImplementation(async(path:string)=>path==='/api/auth/me'?response(200,state):response(status,undefined,status===403?'CSRF_REQUIRED':'UNAUTHORIZED'));
   await expect(client.api('/api/write',{method:'POST',body:{requestId:'stable'}})).rejects.toMatchObject({code:'AUTH_REVALIDATED'});expect(fetchMock.mock.calls.filter(c=>c[0]==='/api/write')).toHaveLength(1);
  }
 });
 it('does not sign out on unavailable or offline confirmation',async()=>{
  fetchMock.mockImplementation(async(path:string)=>path==='/api/auth/me'?response(503):response(401));await expect(client.api('/api/data')).rejects.toMatchObject({code:'AUTH_UNAVAILABLE'});expect(events).toHaveLength(0);
  client.advanceAuthGeneration();fetchMock.mockImplementation(async(path:string)=>{if(path==='/api/auth/me')throw new TypeError('offline');return response(401);});await expect(client.api('/api/data')).rejects.toMatchObject({code:'AUTH_UNAVAILABLE'});expect(events).toHaveLength(0);
 });
 it('clears only after confirmed auth 401 and does not recursively revalidate auth endpoints',async()=>{
  fetchMock.mockResolvedValue(response(401));await expect(client.api('/api/data')).rejects.toMatchObject({status:401});expect(events).toHaveLength(1);expect((events[0] as CustomEvent).detail.state).toBeNull();expect(fetchMock).toHaveBeenCalledTimes(2);
  await expect(client.api('/api/auth/options')).rejects.toMatchObject({status:401});expect(fetchMock).toHaveBeenCalledTimes(3);
 });
 it('telemetry waits only when the sign-in is in doubt: after signing out or revoking browsers, and after any refusal',async()=>{
  // 2026-11-10: a complete browser run caught the five-second telemetry post going out with a cookie the server had
  // just revoked (POST /api/diagnostics 401 after "sign out this browser"). Ordinary requests, signing in and the
  // frequent activity ping must not hold telemetry back (a first version of this fix did, and a browser test caught it).
  fetchMock.mockImplementation(async(path:string)=>path==='/api/auth/me'?response(200,state):response(200,{ok:true}));
  paused.count=0;
  for(const [path,method] of [['/api/sessions','GET'],['/api/sessions/s/displays','POST'],['/api/auth/sessions','GET'],['/api/auth/activity','POST'],['/api/auth/register','POST'],['/api/auth/login','POST'],['/api/auth/email/request','POST']] as const)await client.api(path,method==='GET'?{}:{method,body:{}});
  expect(paused.count).toBe(0);
  await client.api('/api/auth/sessions/revoke',{method:'POST',body:{}});expect(paused.count).toBe(1);
  await client.api('/api/auth/logout',{method:'POST'});expect(paused.count).toBe(2);
  fetchMock.mockImplementation(async(path:string)=>path==='/api/auth/me'?response(200,state):response(401));
  await expect(client.api('/api/account/notices')).rejects.toBeTruthy();expect(paused.count).toBeGreaterThanOrEqual(3);
 });
 it('ignores an old in-flight auth 401 after a new login generation',async()=>{
  let finish!:(value:Response)=>void;fetchMock.mockImplementation(()=>new Promise< Response>(resolve=>{finish=resolve;}));const pending=client.confirmAuth();client.advanceAuthGeneration();finish(response(401));expect(await pending).toBeUndefined();expect(events).toHaveLength(0);
 });
 it('rejects stale API success and stale API 401 without invalidating a newer login',async()=>{
  for(const status of [200,401]){let finish!:(value:Response)=>void;fetchMock.mockImplementation(()=>new Promise<Response>(resolve=>{finish=resolve;}));const pending=client.api('/api/data');client.advanceAuthGeneration();finish(response(status,{old:true}));await expect(pending).rejects.toMatchObject({code:'STALE_AUTH_RESPONSE'});expect(events).toHaveLength(0);}
 });
 it('detects another tab switching identity during a confirmation',async()=>{
  fetchMock.mockResolvedValue(response(200,state));await client.confirmAuth();const generation=client.authGeneration();client.advanceAuthGeneration();fetchMock.mockResolvedValue(response(200,{...state,user:{...state.user,id:'other'},browserSessionId:'other-session'}));const changed=await client.confirmAuth();expect(changed!.state!.user.id).toBe('other');expect(client.authGeneration()).toBeGreaterThan(generation+1);
 });
});
