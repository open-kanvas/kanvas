import { afterEach } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { startHarness } from './harness';
import type { Harness } from './harness';
import { visualHelp } from '../../src/server/visual-help';
import { parseCanonicalArguments } from '../../src/server/mcp/canonical';
import { canonicalToolDefinitions } from '../../src/server/mcp/canonical';
import { KEYBOARD_SHORTCUTS } from '../../src/shared/keyboard-shortcuts';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { randomUUID } from 'node:crypto';
import { success } from './harness';
import type { Browser } from './harness';
import { createApp } from '../../src/server/app';
import { hash } from '../../src/server/auth';
import type { AuthPrincipal } from '../../src/server/auth';
import { safePushEndpoint } from '../../src/server/push';
import { diagnosticBatchSchema } from '../../src/shared/frontend-diagnostics';
import { diagnosticRoute } from '../../src/shared/frontend-diagnostics';
import { chatDataSchema } from '../../src/shared/work-views';
import { flashcardDataSchema } from '../../src/shared/flashcards';
import { advanceFlashcards } from '../../src/shared/flashcards';
import { flashcardControlSchema } from '../../src/shared/flashcards';
import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { chartDataSchema } from '../../src/shared/chart-contract';
import { stackChart } from '../../src/shared/chart-stacks';
import { feedbackSubmitSchema } from '../../src/shared/reports';
import { HELP_TOPICS } from '../../src/shared/help';

describe("notifications coverage 1", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});
function worker(clients:any){const events:Record<string,Function>={};const registration={showNotification:vi.fn()};runInNewContext(readFileSync('public/sw.js','utf8'),{URL,self:{location:{origin:'https://kanvas.test'},clients,registration,addEventListener:(name:string,fn:Function)=>events[name]=fn}});return {events,registration};}
it.each(['closed','root','exact'])('notification click opens exact target when PWA is %s',async(mode)=>{
 const url='https://kanvas.test/view/session/display',focus=vi.fn(),navigate=vi.fn(async()=>({focus})),window={url:mode==='root'?'https://kanvas.test/':url,navigate,focus};const clients={matchAll:vi.fn(async()=>mode==='exact'?[window]:[]),openWindow:vi.fn(async()=>window)};const {events}=worker(clients);let pending:Promise<void>|undefined;events.notificationclick({notification:{data:{url:'/view/session/display'},close:vi.fn()},waitUntil:(p:Promise<void>)=>pending=p});await pending;expect(focus).toHaveBeenCalledOnce();if(mode==='root')expect(navigate).toHaveBeenCalledWith(url);expect(clients.openWindow).toHaveBeenCalledWith(url);
});
it('service worker preserves payload target and rejects external/malformed click paths',async()=>{
 const clients={matchAll:vi.fn(async()=>[]),openWindow:vi.fn()},{events,registration}=worker(clients);let pending:Promise<void>|undefined;events.push({data:{json:()=>({url:'/view/session/display',title:'Private title'})},waitUntil:(p:Promise<void>)=>pending=p});await pending;expect(registration.showNotification).toHaveBeenCalledWith('Kanvas is ready',expect.objectContaining({data:{url:'/view/session/display'}}));expect(JSON.stringify(registration.showNotification.mock.calls)).not.toContain('Private title');for(const url of ['https://evil.test/view/a/b','//evil.test/view/a/b','/view/a/b?redirect=x','/'])events.notificationclick({notification:{data:{url},close:vi.fn()},waitUntil:vi.fn()});expect(clients.openWindow).not.toHaveBeenCalled();
});
});

describe("notifications coverage 2", () => {

describe("notifications contracts",()=>{
 let h!:Harness,owner:Browser,s:string,d:string,p:AuthPrincipal;
 const send=vi.fn(async(_subscription:unknown,_payload:string)=>({statusCode:201}));
 beforeEach(async()=>{send.mockClear();h=await startHarness({pushOptions:{publicKey:'test-public-key',privateKey:'test-private-key',subject:'mailto:test@example.invalid',send}});owner=await h.account();s=(await owner.session()).id;d=(await owner.display(s)).id;p={userId:owner.user!.id};});
 afterEach(async()=>{await h?.close();});
 async function deck(){const result=await owner.submit(s,[d],{version:1,template:'flashcards',data:{mode:'test',cards:[{id:'hola',prompt:'hola',answer:'hello',acceptedAnswers:['hi']},{id:'adios',prompt:'adiós',answer:'goodbye'}]}});expect(result.update.status).toBe('prepared');return result.detail.displays.find(x=>x.id===d)!;}
 it('rejects private/unknown push destinations, credentials, ports and fragments',()=>{
  for(const url of ['http://fcm.googleapis.com/x','https://127.0.0.1/x','https://localhost/x','https://fcm.googleapis.com.evil.test/x','https://user@fcm.googleapis.com/x','https://fcm.googleapis.com:8443/x','https://fcm.googleapis.com/x#secret','https://evil.test/x'])expect(safePushEndpoint(url),url).toBe(false);
  expect(safePushEndpoint('https://fcm.googleapis.com/fcm/send/inert')).toBe(true);
 });
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/inert',keys:{p256dh:'B'.repeat(87),auth:'A'.repeat(22)}};
 it('sends one preview-free notification for a new agent session, no real egress, then deduplicates',async()=>{
  success(await owner.request('POST','/api/push',subscription));
  const token=await h.runtime.auth.issueToken(p.userId,'Test agent'),agent={...p,tokenId:token.token.id,scopes:['read','publish']};
  const session=await h.runtime.service.createSession(agent,'Private topic'),display=await h.runtime.service.createDisplay(agent,session.id,{name:'Private display',width:1000,height:800});
  await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(1));const payload=String(send.mock.calls[0]?.[1]);expect(payload).not.toContain('Private');expect(payload).toContain('/view/'+session.id+'/'+display.id);
  h.runtime.service.push.enqueue(agent,session.id,display.id);await h.runtime.service.push.close();expect(send).toHaveBeenCalledTimes(1);
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
 });});
});

describe("notifications coverage 3", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});
it('targets named own-account push subscriptions, deduplicates retries and rechecks logout',async()=>{
 const sent:string[]=[];h=await startHarness({pushOptions:{publicKey:'unused-test-key',privateKey:'unused-test-key',subject:'mailto:test@example.invalid',send:async(subscription)=>{sent.push(subscription.endpoint);}}});
 const owner=await h.account(),other=await h.account(),session=await owner.session(),display=await owner.display(session.id),service=h.runtime.service;
 const one=(await h.runtime.store.list<any>('browser')).find(b=>b.userId===owner.user!.id),two=(await h.runtime.store.list<any>('browser')).find(b=>b.userId===other.user!.id),p={userId:owner.user!.id,browserId:one.id},q={userId:other.user!.id,browserId:two.id};
 const subscription=(tag:string)=>({endpoint:'https://fcm.googleapis.com/'+tag,keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}});
 await service.push.subscribe(p,subscription('one'));await service.push.subscribe(q,subscription('two'));
 const targets=await service.push.targets(p);expect(targets.targets).toHaveLength(1);expect(JSON.stringify(targets)).not.toContain('fcm.googleapis');
 await service.push.rename(p,{targetId:targets.targets[0].targetId,name:'My phone'});expect((await service.push.targets(p)).targets[0].name).toBe('My phone');
 await expect(service.push.rename(q,{targetId:targets.targets[0].targetId,name:'Foreign'})).rejects.toThrow();
 const input={sessionId:session.id,displayId:display.id,targetIds:[targets.targets[0].targetId],requestId:'push'};await service.push.notify(p,input);await service.push.notify(p,input);expect(sent).toEqual(['https://fcm.googleapis.com/one']);
 await h.runtime.store.delete('browser',one.id);await expect(service.push.notify(p,{...input,requestId:'after-logout'})).rejects.toThrow();expect(sent).toHaveLength(1);
});
});
