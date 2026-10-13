import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {startHarness,success,type Harness,type Browser} from './harness';
import {createApp} from '../../src/server/app';
import {hash,type AuthPrincipal} from '../../src/server/auth';
import {safePushEndpoint} from '../../src/server/push';
import {diagnosticBatchSchema,diagnosticRoute} from '../../src/shared/frontend-diagnostics';
import {chatDataSchema} from '../../src/shared/work-views';
import {flashcardDataSchema,advanceFlashcards,flashcardControlSchema} from '../../src/shared/flashcards';
describe('October 13 feedback security and durable state',()=>{
 let h:Harness,owner:Browser,s:string,d:string,p:AuthPrincipal;
 const send=vi.fn(async(_subscription:unknown,_payload:string)=>({statusCode:201}));
 beforeEach(async()=>{send.mockClear();h=await startHarness({pushOptions:{publicKey:'test-public-key',privateKey:'test-private-key',subject:'mailto:test@example.invalid',send}});owner=await h.account();s=(await owner.session()).id;d=(await owner.display(s)).id;p={userId:owner.user!.id};});
 afterEach(async()=>{await h?.close();});
 async function deck(){const result=await owner.submit(s,[d],{version:1,template:'flashcards',data:{mode:'test',cards:[{id:'hola',prompt:'hola',answer:'hello',acceptedAnswers:['hi']},{id:'adios',prompt:'adiós',answer:'goodbye'}]}});expect(result.update.status).toBe('prepared');return result.detail.displays.find(x=>x.id===d)!;}
 it('saves a deck and grades voice answers with idempotency, revision and card guards',async()=>{
  const display=await deck(),args={sessionId:s,displayId:d,deckId:display.view!.data.deckId,expectedRevision:display.revision,expectedDeckRevision:0,requestId:'answer-once',cardId:'hola',action:'answer',response:' HI ',grading:'exact'};
  const first:any=await h.runtime.service.flashcards.control(p,args);expect(first.deck.view.data.responses[0]).toMatchObject({result:'correct',grading:'exact'});expect(first.deck.view.data.index).toBe(0);
  expect(await h.runtime.service.flashcards.control(p,args)).toEqual(first);
  await expect(h.runtime.service.flashcards.control(p,{...args,response:'changed'})).rejects.toMatchObject({code:'REQUEST_ID_CONFLICT'});
  await expect(h.runtime.service.flashcards.control(p,{...args,requestId:'stale'})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
  await expect(h.runtime.service.flashcards.control(p,{...args,requestId:'wrong-card',expectedRevision:2,expectedDeckRevision:1,cardId:'adios'})).rejects.toMatchObject({code:'CONFLICT'});
 });
 it('retains progress across replacement and restores on a different display without cross-account access',async()=>{
  const display=await deck(),deckId=String(display.view!.data.deckId);await owner.submit(s,[d],{version:1,template:'fact',data:{text:'Other content'}});
  const other=await owner.display(s);await h.runtime.service.flashcards.show(p,{sessionId:s,deckId,displayId:other.id,expectedRevision:0,requestId:'restore'});
  expect((await owner.detail(s)).displays.find(x=>x.id===other.id)!.view!.data.deckId).toBe(deckId);
  const stranger=await h.account();await expect(h.runtime.service.flashcards.read({userId:stranger.user!.id},{sessionId:s,deckId})).rejects.toThrow();
 });
 it('rejects stale concurrent document edits on two screens',async()=>{
  const first=await deck(),deckId=String(first.view!.data.deckId),other=await owner.display(s);
  await h.runtime.service.flashcards.show(p,{sessionId:s,deckId,displayId:other.id,expectedRevision:0,requestId:'show'});
  const a={sessionId:s,deckId,displayId:d,expectedRevision:1,expectedDeckRevision:0,requestId:'next',cardId:'hola',action:'next'};
  await h.runtime.service.flashcards.control(p,a);
  await expect(h.runtime.service.flashcards.control(p,{...a,displayId:other.id,requestId:'concurrent'})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 });
 it('keeps exact grading distinct from self-assessment and ungraded responses',()=>{
  const data=flashcardDataSchema.parse({cards:[{id:'c',prompt:'Question',answer:'yes'}]});
  const base={sessionId:s,displayId:d,deckId:'deck',expectedRevision:0,expectedDeckRevision:0,requestId:'answer',cardId:'c',action:'answer',response:'a semantic paraphrase'};
  expect(advanceFlashcards(data,flashcardControlSchema.parse(base)).responses[0].result).toBe('incorrect');
  expect(advanceFlashcards(data,flashcardControlSchema.parse({...base,grading:'none'})).responses[0].result).toBe('ungraded');
  expect(advanceFlashcards(data,flashcardControlSchema.parse({...base,grading:'self',correct:true})).responses[0]).toMatchObject({result:'correct',grading:'self'});
 });
 it('keeps chat line default and supports explicit bubble direction without altering text',()=>{
  const message={id:'1',sender:'Alex',text:'exact\nmessage'};
  expect(chatDataSchema.parse({messages:[message]}).style).toBe('lines');
  expect(chatDataSchema.parse({style:'bubbles',selfSender:'Alex',messages:[message]}).messages).toEqual([message]);
 });
 it('stores only strict diagnostic metadata, scopes timelines and requires CSRF',async()=>{
  const supportRef=randomUUID(),body={supportRef,windowId:randomUUID(),events:[{event:'render-applied',sessionId:s,displayId:d,revision:1}]};
  expect(success(await owner.request('POST','/api/diagnostics',body))).toMatchObject({accepted:1});
  const read:any=success(await owner.request('GET','/api/diagnostics?supportRef='+supportRef));expect(read.timeline).toHaveLength(1);
  const stranger=await h.account();const hidden:any=success(await stranger.request('GET','/api/diagnostics?supportRef='+supportRef));expect(hidden.timeline).toEqual([]);
  expect((await stranger.request('GET','/api/diagnostics?supportRef='+supportRef+'&accountId='+owner.user!.id)).status).toBe(403);
  expect((await owner.request('POST','/api/diagnostics',body,{csrf:null})).status).toBe(403);
  expect((await owner.request('POST','/api/diagnostics',{...body,events:[{event:'js-error',message:'secret',url:'https://example.com/?token=secret'}]})).status).toBeGreaterThanOrEqual(400);
  h.runtime.service.accounts.serviceAdmins.add(stranger.user!.id);
  expect((success(await stranger.request<any>('GET','/api/diagnostics?supportRef='+supportRef+'&accountId='+owner.user!.id))).timeline).toHaveLength(1);
 });
 it('bounds diagnostic size/rate and prunes retained detail',async()=>{
  const body={supportRef:randomUUID(),windowId:randomUUID(),events:Array.from({length:20},()=>({event:'startup'}))};
  expect(diagnosticBatchSchema.safeParse({...body,events:[...body.events,...body.events]}).success).toBe(false);
  for(let i=0;i<6;i++)success(await owner.request('POST','/api/diagnostics',body));
  expect((await owner.request('POST','/api/diagnostics',body)).status).toBe(429);
  await h.runtime.store.put('frontend-diagnostic',{id:'expired',accountId:p.userId,at:new Date(Date.now()-15*86400000).toISOString()});
  await h.runtime.service.diagnostics.prune();expect(await h.runtime.store.get('frontend-diagnostic','expired')).toBeUndefined();
  expect(diagnosticRoute('/view/id/display?token=secret#body')).toBe('view');
 });
 it('rejects private/unknown push destinations, credentials, ports and fragments',()=>{
  for(const url of ['http://fcm.googleapis.com/x','https://127.0.0.1/x','https://localhost/x','https://fcm.googleapis.com.evil.test/x','https://user@fcm.googleapis.com/x','https://fcm.googleapis.com:8443/x','https://fcm.googleapis.com/x#secret','https://evil.test/x'])expect(safePushEndpoint(url),url).toBe(false);
  expect(safePushEndpoint('https://fcm.googleapis.com/fcm/send/inert')).toBe(true);
 });
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/inert',keys:{p256dh:'B'.repeat(87),auth:'A'.repeat(22)}};
 it('binds subscriptions to browser/account; unsubscribes and logout revoke them',async()=>{
  success(await owner.request('POST','/api/push',subscription));
  const stranger=await h.account();expect((await stranger.request('POST','/api/push',subscription)).status).toBe(409);
  expect((await stranger.request('DELETE','/api/push')).status).toBe(200);expect(await h.runtime.store.get('push-subscription',hash(subscription.endpoint))).toBeDefined();
  success(await owner.request('DELETE','/api/push'));expect(await h.runtime.store.get('push-subscription',hash(subscription.endpoint))).toBeUndefined();
  success(await owner.request('POST','/api/push',subscription));success(await owner.request('POST','/api/auth/logout'));expect(await h.runtime.store.get('push-subscription',hash(subscription.endpoint))).toBeUndefined();
 });
 it('sends one preview-free notification for a new agent session, no real egress, then deduplicates',async()=>{
  success(await owner.request('POST','/api/push',subscription));
  const token=await h.runtime.auth.issueToken(p.userId,'Test agent'),agent={...p,tokenId:token.token.id,scopes:['read','publish']};
  const session=await h.runtime.service.createSession(agent,'Private topic'),display=await h.runtime.service.createDisplay(agent,session.id,{name:'Private display',width:1000,height:800});
  await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(1));const payload=String(send.mock.calls[0]?.[1]);expect(payload).not.toContain('Private');expect(payload).toContain('/view/'+session.id+'/'+display.id);
  h.runtime.service.push.enqueue(agent,session.id,display.id);await h.runtime.service.push.close();expect(send).toHaveBeenCalledTimes(1);
 });
 it('persists deck answers across an application restart and rejects held controls',async()=>{
  const display=await deck(),deckId=String(display.view!.data.deckId);
  const args={sessionId:s,displayId:d,deckId,expectedRevision:1,expectedDeckRevision:0,requestId:'answer',cardId:'hola',action:'answer',response:'hello'};
  const stored=await h.runtime.store.get<any>('display',d);await h.runtime.store.put('display',{...stored,held:true});
  await expect(h.runtime.service.flashcards.control(p,args)).rejects.toMatchObject({code:'DISPLAY_HELD'});
  await h.runtime.store.put('display',stored);await h.runtime.service.flashcards.control(p,args);
  await h.shutdown();const restarted=await createApp({database:h.database,publicUrl:'http://127.0.0.1'});
  try{const read:any=await restarted.service.flashcards.read(p,{sessionId:s,deckId});expect(read.view.data.responses[0].result).toBe('correct');expect(read.revision).toBe(1);}finally{await restarted.close();}
 });
 it('rejects selected-session diagnostic reads and oversized diagnostic batches',async()=>{
  const token=await h.runtime.auth.issueToken(p.userId,'Selected',['read'],[s]);
  await expect(h.runtime.service.diagnostics.read({...p,tokenId:token.token.id},{supportRef:randomUUID()})).rejects.toMatchObject({code:'FORBIDDEN'});
  expect((await owner.request('POST','/api/diagnostics',{padding:'x'.repeat(20000)})).status).toBe(413);
 });
 it('cleans invalid push subscriptions and never sends for expired browser bindings',async()=>{
  success(await owner.request('POST','/api/push',subscription));
  const token=await h.runtime.auth.issueToken(p.userId,'Agent'),agent={...p,tokenId:token.token.id};
  send.mockRejectedValueOnce(Object.assign(new Error('Gone'),{statusCode:410}));
  const first=await h.runtime.service.createSession(agent,'First');await h.runtime.service.createDisplay(agent,first.id,{name:'Main',width:800,height:600});await h.runtime.service.push.close();
  expect(send).toHaveBeenCalledTimes(1);expect(await h.runtime.store.get('push-subscription',hash(subscription.endpoint))).toBeUndefined();
  success(await owner.request('POST','/api/push',subscription));
  const record=await h.runtime.store.get<any>('push-subscription',hash(subscription.endpoint));const browser=await h.runtime.store.get<any>('browser',record.browserId);await h.runtime.store.put('browser',{...browser,expiresAt:0});
  const second=await h.runtime.service.createSession(agent,'Second');await h.runtime.service.createDisplay(agent,second.id,{name:'Main',width:800,height:600});await h.runtime.service.push.close();
  expect(send).toHaveBeenCalledTimes(1);expect(await h.runtime.store.get('push-subscription',hash(subscription.endpoint))).toBeUndefined();
 });
 it('offline begin creates exactly one ready session only for explicitly opted-in returning users',async()=>{
  const token=await h.runtime.auth.issueToken(p.userId,'Agent'),agent={...p,tokenId:token.token.id};
  expect(await h.runtime.service.beginSession(agent,{name:'No opt-in',requestId:'no-opt-in'})).toMatchObject({status:'needs_display'});
  success(await owner.request('POST','/api/push',subscription));
  const args={name:'Ready by push',requestId:'start'},first=await h.runtime.service.beginSession(agent,args);expect(first).toMatchObject({status:'started',notification:true});
  const retry=await h.runtime.service.beginSession(agent,args);expect(retry).toMatchObject({sessionId:'sessionId' in first?first.sessionId:undefined});
  await h.runtime.service.push.close();expect(send).toHaveBeenCalledTimes(1);
 });

 it('bounds encoded card/answer bytes and pages large decks without truncating current-card data',async()=>{
  expect(flashcardDataSchema.safeParse({cards:[{id:'large',prompt:'字'.repeat(4000),answer:'字'.repeat(4000)}]}).success).toBe(false);
  const cards=Array.from({length:40},(_,i)=>({id:'card-'+i,prompt:'p'.repeat(1500),answer:'a'.repeat(1500)}));
  const result=await owner.submit(s,[d],{version:1,template:'flashcards',data:{cards}});
  const deckId=String(result.detail.displays.find(x=>x.id===d)!.view!.data.deckId);
  const read:any=await h.runtime.service.flashcards.read(p,{sessionId:s,deckId});expect(read.nextOffset).toBeGreaterThan(0);expect(read.currentCard).toEqual(cards[0]);expect(Buffer.byteLength(JSON.stringify(read))).toBeLessThan(44000);
  expect(flashcardControlSchema.safeParse({sessionId:s,displayId:d,deckId,expectedRevision:1,expectedDeckRevision:0,requestId:'large-response',cardId:'card-0',action:'answer',response:'\u0000'.repeat(4000)}).success).toBe(false);
 });

});
