import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
/** The telemetry queue itself. While the sign-in is in doubt it posts nothing and keeps its events; it posts them when
 * the wait is over or the sign-in is confirmed, and drops them when the page learns it is signed out. */
let diagnostics:typeof import('../../src/client/frontend-diagnostics');let fetchMock:ReturnType<typeof vi.fn>;
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const tick=async(ms:number)=>{await vi.advanceTimersByTimeAsync(ms);await settle();};
const posted=()=>fetchMock.mock.calls.filter(call=>call[0]==='/api/diagnostics').map(call=>JSON.parse(call[1].body).events.map((event:{event:string})=>event.event));
beforeEach(async()=>{
 vi.resetModules();vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
 const store=new Map<string,string>();vi.stubGlobal('sessionStorage',{getItem:(key:string)=>store.get(key)??null,setItem:(key:string,value:string)=>{store.set(key,value);},removeItem:(key:string)=>{store.delete(key);}});
 vi.stubGlobal('window',new EventTarget());vi.stubGlobal('location',{pathname:'/console'});
 fetchMock=vi.fn(async()=>new Response(JSON.stringify({data:{accepted:1}}),{status:200,headers:{'content-type':'application/json'}}));vi.stubGlobal('fetch',fetchMock);
 diagnostics=await import('../../src/client/frontend-diagnostics');
 // As in the application: the five-second post is running and the page is signed in.
 diagnostics.initializeDiagnostics();diagnostics.diagnosticsAuthenticated('csrf');await settle();
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('frontend telemetry waits while the sign-in is in doubt',()=>{
 it('without a wait the queue posts on its five-second beat, as before',async()=>{
  expect(posted()).toEqual([['startup']]);
  diagnostics.diagnostic({event:'js-error'});await tick(5000);expect(posted()).toEqual([['startup'],['js-error']]);
 });
 it('posts nothing during the wait, keeps the queued event and posts it afterwards',async()=>{
  diagnostics.diagnostic({event:'js-error'});diagnostics.pauseDiagnostics();
  await tick(5000);await tick(5000);expect(posted()).toEqual([['startup']]);
  await tick(5000);await tick(1000);expect(posted()).toEqual([['startup'],['js-error']]);
 });
 it('a confirmed sign-in ends the wait at once',async()=>{
  diagnostics.diagnostic({event:'js-error'});diagnostics.pauseDiagnostics();await tick(5000);expect(posted()).toHaveLength(1);
  diagnostics.diagnosticsAuthenticated('fresh');await settle();expect(posted()).toEqual([['startup'],['js-error']]);
 });
 it('a page that learns it is signed out during the wait posts nothing more, ever',async()=>{
  diagnostics.diagnostic({event:'js-error'});diagnostics.pauseDiagnostics();
  await tick(5000);diagnostics.diagnosticsAuthenticated('');await tick(60_000);
  diagnostics.diagnosticsAuthenticated('next-sign-in');await settle();await tick(5000);
  expect(posted()).toEqual([['startup']]);
 });
});
