import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {startHarness,type Harness,type Browser} from './harness.js';

/** Found by the complete browser runs of 2026-11-10 (september12.spec.ts:21 failed once in three desktop sweeps):
 * the event stream answers before it listens. Its headers go out, three setup steps are awaited (the last is a
 * write, which queues behind any write in progress), and only then is the session's event feed subscribed. A window
 * reloads once when its stream opens; a publish committed after that reload and before the subscription reached
 * nobody, and the display stayed on its old view until something else happened. */
describe('event stream: nothing published while a stream is being set up is lost',()=>{
 let h:Harness,o:Browser;
 beforeEach(async()=>{h=await startHarness();o=await h.account();});
 afterEach(async()=>{await h?.close();});
 it('a window whose stream opened just before a publish is told to read again once the stream is really listening',async()=>{
  const s=(await o.session()).id,d=(await o.display(s)).id,service=h.runtime.service;
  // Hold the last setup step open, the way a write in progress holds it in production.
  let release!:()=>void;const gate=new Promise<void>(done=>{release=done;}),original=service.connectDisplay.bind(service);
  service.connectDisplay=(async(...args:Parameters<typeof original>)=>{await gate;return original(...args);}) as typeof service.connectDisplay;
  const abort=new AbortController();
  try{
   const stream=await o.raw(`/api/sessions/${s}/events?displayId=${d}&tabId=catchup-test`,{},{signal:abort.signal});
   expect(stream.status).toBe(200);
   // The browser has its "open" now and reads the session once: nothing is published yet.
   expect((await o.detail(s)).displays.find(x=>x.id===d)!.revision).toBe(0);
   // The agent publishes while the server is still setting the stream up.
   const published=await o.submit(s,[d],{version:1,template:'fact',data:{text:'Published during stream setup'}});
   expect(published.update.status).toBe('prepared');
   release();
   // From here the stream must say something that makes the window read again; otherwise it keeps revision 0.
   const reader=stream.body!.getReader(),decoder=new TextDecoder();let text='';const until=Date.now()+3000;
   while(Date.now()<until&&!/event: change/.test(text)){
    const chunk=await Promise.race([reader.read(),new Promise<undefined>(done=>setTimeout(()=>done(undefined),Math.max(1,until-Date.now())))]);
    if(!chunk||chunk.done)break;text+=decoder.decode(chunk.value,{stream:true});
   }
   expect(text,'the stream announces a change after it starts listening').toMatch(/event: change\ndata: \{[^\n]*"sessionId"/);
   expect((await o.detail(s)).displays.find(x=>x.id===d)!.revision).toBeGreaterThan(0);
  }finally{release();abort.abort();service.connectDisplay=original;}
 });
});
