import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
/** The telemetry queue itself: a paused queue posts nothing, keeps its events, and posts them after the wait;
 * a page that learns it is signed out drops them. */
let diagnostics:typeof import('../../src/client/frontend-diagnostics');let fetchMock:ReturnType<typeof vi.fn>;
const settle=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
beforeEach(async()=>{
 vi.resetModules();vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
 const store=new Map<string,string>();vi.stubGlobal('sessionStorage',{getItem:(key:string)=>store.get(key)??null,setItem:(key:string,value:string)=>{store.set(key,value);},removeItem:(key:string)=>{store.delete(key);}});
 fetchMock=vi.fn(async()=>new Response(JSON.stringify({data:{accepted:1}}),{status:200,headers:{'content-type':'application/json'}}));vi.stubGlobal('fetch',fetchMock);
 diagnostics=await import('../../src/client/frontend-diagnostics');
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('frontend telemetry waits while the sign-in is in doubt',()=>{
 it('posts nothing during the wait, keeps the queued event and posts it afterwards',async()=>{
  diagnostics.diagnostic({event:'js-error'});diagnostics.pauseDiagnostics();
  diagnostics.diagnosticsAuthenticated('csrf');await settle();expect(fetchMock).not.toHaveBeenCalled();
  vi.setSystemTime(Date.now()+14_000);diagnostics.diagnosticsAuthenticated('csrf');await settle();expect(fetchMock).not.toHaveBeenCalled();
  vi.setSystemTime(Date.now()+1_500);diagnostics.diagnosticsAuthenticated('csrf');await settle();
  expect(fetchMock).toHaveBeenCalledTimes(1);expect(fetchMock.mock.calls[0][0]).toBe('/api/diagnostics');expect(JSON.parse(fetchMock.mock.calls[0][1].body).events).toEqual([expect.objectContaining({event:'js-error'})]);
 });
 it('a page that learns it is signed out during the wait posts nothing at all',async()=>{
  diagnostics.diagnosticsAuthenticated('csrf');await settle();diagnostics.diagnostic({event:'js-error'});diagnostics.pauseDiagnostics();
  diagnostics.diagnosticsAuthenticated('');vi.setSystemTime(Date.now()+60_000);diagnostics.diagnosticsAuthenticated('fresh');await settle();
  expect(fetchMock).not.toHaveBeenCalled();
 });
 it('without a wait the queue posts as before',async()=>{
  diagnostics.diagnostic({event:'js-error'});diagnostics.diagnosticsAuthenticated('csrf');await settle();expect(fetchMock).toHaveBeenCalledTimes(1);
 });
});
