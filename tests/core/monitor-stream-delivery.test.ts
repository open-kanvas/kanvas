import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {startHarness,success,denied,fact,type ApiResult,type Harness,type Browser} from './harness.js';
import type {ViewSpec} from '../../src/shared/types.js';

/** A display bound to a monitor stream holds its request open until an event arrives (up to 20 s).
 * The request was admitted when it started. These cases change what the caller may see while the
 * request is held, then post a distinct sentinel event to wake it. The answer must be the one a
 * new request would get: the sentinel is delivered only to a caller who may still read it.
 *
 * No case sleeps. A request counts as held once the server reports a waiting place taken, and every
 * change is awaited before the sentinel is posted. */
describe('monitor stream: a held request is admitted again when it is answered',()=>{
 let h:Harness,o:Browser,s:string,d:string,p:{userId:string};
 beforeEach(async()=>{h=await startHarness();o=await h.account();s=(await o.session()).id;d=(await o.display(s)).id;p={userId:o.user!.id};});
 afterEach(async()=>{await h?.close();});
 const call=(name:string,args:Record<string,unknown>={})=>h.runtime.service.execute(name,args,p) as Promise<any>;
 const created=async(name='Build agents')=>{const stream=await call('kanvas_monitor_stream_create',{sessionId:s,name,requestId:randomUUID()});return {id:stream.streamId as string,url:`${h.baseUrl}${new URL(stream.postUrl).pathname}`};};
 const view=(streamId:string):ViewSpec=>({version:1,template:'monitor-stream',data:{streamId}} as ViewSpec);
 const bind=(streamId:string)=>o.submit(s,[d],view(streamId));
 const path=(kind:'private'|'public')=>`/api/${kind==='public'?'public/':''}sessions/${s}/displays/${d}/monitor-stream`;
 /** The number of requests the server is holding right now. */
 const heldNow=()=>(h.runtime.service.monitorStreams as unknown as {waiting:number}).waiting;
 /** Starts a held request and returns once the server is holding it. The answer stays pending. */
 const hold=async(who:Browser,kind:'private'|'public',streamId:string|undefined,afterSeq=0)=>{
  const before=heldNow(),answer=who.request<any>('GET',`${path(kind)}?${streamId?`streamId=${streamId}&`:''}afterSeq=${afterSeq}&wait=1`);
  await vi.waitFor(()=>expect(heldNow()).toBe(before+1),{timeout:4000,interval:5});
  return {answer};
 };
 /** A distinct event that wakes whoever is waiting on the stream. Returns the text that must not leak. */
 const sentinel=async(url:string)=>{
  const text=`SENTINEL-${randomUUID()}`,response=await fetch(url,{method:'POST',headers:{host:'127.0.0.1','content-type':'application/json'},body:JSON.stringify({source:'sentinel',event:text})});
  expect(response.status).toBe(202);
  return text;
 };
 const refused=(answer:ApiResult<unknown>,secret:string,statuses:number[])=>{denied(answer,statuses);expect(answer.text).not.toContain(secret);expect(answer.text).not.toContain('sentinel');expect(heldNow()).toBe(0);};
 const member=async(role='viewer')=>{const m=await h.account();success(await o.request('POST',`/api/sessions/${s}/members`,{username:m.user!.username,role}));return m;};
 const makePublic=async(enabled:boolean,expectedRevision:number)=>success(await o.request('POST',`/api/sessions/${s}/public-access`,{enabled,confirm:true,expectedRevision}));
 /** The owner can still read the stream, so the sentinel really was accepted and buffered. */
 const buffered=async(streamId:string,secret:string)=>expect(JSON.stringify(await call('kanvas_monitor_stream_read',{sessionId:s,streamId}))).toContain(secret);

 it('delivers the event to a member and to a public reader who are still admitted',async()=>{
  const stream=await created();await bind(stream.id);await makePublic(true,0);
  const m=await member(),anonymous=h.browser();
  const {answer:signedIn}=await hold(m,'private',stream.id),{answer:open}=await hold(anonymous,'public',stream.id);
  expect(heldNow()).toBe(2);
  const secret=await sentinel(stream.url);
  for(const answer of [success(await signedIn),success(await open)]){
   expect(answer.status).toMatchObject({streamId:stream.id,state:'active',received:1,buffered:1});
   expect(answer.events).toHaveLength(1);expect(answer.events[0]).toMatchObject({seq:1,source:'sentinel',data:{event:secret}});
  }
  expect(heldNow()).toBe(0);
 });

 it('does not deliver to a member who was removed from the session while waiting',async()=>{
  const stream=await created();await bind(stream.id);
  const m=await member(),{answer:waiting}=await hold(m,'private',stream.id);
  success(await o.request('DELETE',`/api/sessions/${s}/members/${m.user!.id}`));
  const secret=await sentinel(stream.url);
  refused(await waiting,secret,[403,404]);
  await buffered(stream.id,secret);
  // What a new request by the same person gets is the same refusal.
  denied(await m.request('GET',`${path('private')}?streamId=${stream.id}`),[403,404]);
 });

 it('does not deliver to a browser whose sign-in ended while waiting',async()=>{
  const stream=await created();await bind(stream.id);
  const m=await member(),cookie=new Map(m.cookies),{answer:waiting}=await hold(m,'private',stream.id);
  success(await m.request('POST','/api/auth/logout',{}));
  const secret=await sentinel(stream.url);
  refused(await waiting,secret,[401]);
  await buffered(stream.id,secret);
  // The old cookie is refused the same way on a new request.
  for(const [name,value] of cookie)m.cookies.set(name,value);
  denied(await m.request('GET',`${path('private')}?streamId=${stream.id}`),[401]);
 });

 it('does not deliver to a public reader after public access was turned off',async()=>{
  const stream=await created();await bind(stream.id);await makePublic(true,0);
  const anonymous=h.browser(),{answer:waiting}=await hold(anonymous,'public',stream.id);
  await makePublic(false,1);
  const secret=await sentinel(stream.url);
  refused(await waiting,secret,[404]);
  await buffered(stream.id,secret);
  // The owner is unaffected by the public switch.
  expect(JSON.stringify(success(await o.request('GET',`${path('private')}?streamId=${stream.id}`)))).toContain(secret);
 });

 it('does not deliver once the display shows something else, on either endpoint',async()=>{
  const stream=await created();await bind(stream.id);await makePublic(true,0);
  const m=await member(),anonymous=h.browser();
  const {answer:signedIn}=await hold(m,'private',stream.id),{answer:open}=await hold(anonymous,'public',stream.id);
  await o.submit(s,[d],fact('Something else'));
  const secret=await sentinel(stream.url);
  for(const answer of [await signedIn,await open]){expect(answer.status).toBe(409);expect(answer.error?.code).toBe('INVALID_VIEW');expect(answer.data).toBeUndefined();expect(answer.text).not.toContain(secret);}
  expect(heldNow()).toBe(0);
  await buffered(stream.id,secret);
 });

 it('does not deliver the old stream once the display shows a different stream of the session',async()=>{
  const first=await created('First'),second=await created('Second');await bind(first.id);await makePublic(true,0);
  const m=await member(),anonymous=h.browser();
  const {answer:signedIn}=await hold(m,'private',first.id),{answer:open}=await hold(anonymous,'public',first.id);
  await bind(second.id);
  const secret=await sentinel(first.url);
  for(const answer of [await signedIn,await open]){expect(answer.status).toBe(409);expect(answer.data).toBeUndefined();expect(answer.text).not.toContain(secret);}
  // The stream now on screen is served, and carries nothing of the other one.
  const current=success(await m.request<any>('GET',`${path('private')}?streamId=${second.id}`));
  expect(current.status).toMatchObject({streamId:second.id,state:'active',received:0});expect(current.events).toEqual([]);
  await buffered(first.id,secret);
 });

 it('does not deliver the old stream to a request that named no stream when the display moved on',async()=>{
  const first=await created('First'),second=await created('Second');await bind(first.id);
  const {answer:waiting}=await hold(o,'private',undefined);
  await bind(second.id);
  const secret=await sentinel(first.url),answer=await waiting;
  expect(answer.text).not.toContain(secret);
  // Either a refusal, or the stream now on screen: never the one that was waited on.
  if(answer.status===200){expect(answer.data.status.streamId).toBe(second.id);expect(answer.data.events).toEqual([]);}else expect(answer.status).toBe(409);
 });

 it('does not deliver after the session ended',async()=>{
  const stream=await created();await bind(stream.id);await makePublic(true,0);
  const m=await member(),anonymous=h.browser();
  const {answer:signedIn}=await hold(m,'private',stream.id),{answer:open}=await hold(anonymous,'public',stream.id);
  success(await o.request('POST',`/api/sessions/${s}/end`,{}));
  const secret=await sentinel(stream.url);
  refused(await signedIn,secret,[404,410]);refused(await open,secret,[404]);
 });

 it('admits again as the last step: a removal that lands while the answer is being prepared is honoured',async()=>{
  const stream=await created();await bind(stream.id);
  const m=await member(),{answer:waiting}=await hold(m,'private',stream.id);
  // Deterministic gate: the member is removed inside the first stream-row read that follows the wake,
  // that is, after the request has woken and before its answer is assembled.
  const store=h.runtime.service.store,original=store.get.bind(store);let armed=false,fired=0;
  const spy=vi.spyOn(store,'get').mockImplementation((async(kind:string,key:string,...rest:unknown[])=>{
   if(armed&&kind==='monitor-stream'&&key===stream.id){armed=false;fired++;success(await o.request('DELETE',`/api/sessions/${s}/members/${m.user!.id}`));}
   return (original as (...args:unknown[])=>Promise<unknown>)(kind,key,...rest);
  }) as typeof store.get);
  try{
   armed=true;
   const text=`SENTINEL-${randomUUID()}`;
   // Posted through the service so that the armed read is the held request's, not the reporter's.
   const outcome=await h.runtime.service.monitorStreams.ingest(new URL(stream.url).pathname.split('/').pop()!,'application/json',Buffer.from(JSON.stringify({source:'sentinel',event:text})));
   expect(outcome.status).toBe(202);
   const answer=await waiting;
   expect(fired).toBe(1);
   refused(answer,text,[403,404]);
  }finally{spy.mockRestore();}
 });

 it('still reports a stream revoked while waiting, to members and public readers, with no events',async()=>{
  const stream=await created();await bind(stream.id);await makePublic(true,0);
  const first=await sentinel(stream.url);
  const m=await member(),anonymous=h.browser();
  const {answer:signedIn}=await hold(m,'private',stream.id,1),{answer:open}=await hold(anonymous,'public',stream.id,1);
  await call('kanvas_monitor_stream_revoke',{sessionId:s,streamId:stream.id});
  for(const answer of [success(await signedIn),success(await open)]){
   expect(answer.status).toMatchObject({streamId:stream.id,state:'revoked',received:1,buffered:0});expect(answer.status.endedAt).toEqual(expect.any(String));
   expect(answer.events).toEqual([]);expect(JSON.stringify(answer)).not.toContain(first);
  }
  expect(heldNow()).toBe(0);
  expect((await fetch(stream.url,{method:'POST',headers:{host:'127.0.0.1'},body:'late'})).status).toBe(410);
 });

 it('still reports a stream that expired while waiting, without an event to wake it',async()=>{
  const stream=await created();await bind(stream.id);
  const first=await sentinel(stream.url);
  const m=await member();
  // The stored deadline is moved close; the held request ends itself at that deadline.
  const stored=await h.runtime.service.store.get<any>('monitor-stream',stream.id);
  await h.runtime.service.store.put('monitor-stream',{...stored,expiresAt:Date.now()+1500});
  const started=Date.now(),answer=success(await (await hold(m,'private',stream.id,1)).answer);
  expect(answer.status).toMatchObject({streamId:stream.id,state:'expired',received:1,buffered:0});expect(answer.events).toEqual([]);expect(JSON.stringify(answer)).not.toContain(first);
  expect(Date.now()-started).toBeLessThan(4000);expect(heldNow()).toBe(0);
 });
});
