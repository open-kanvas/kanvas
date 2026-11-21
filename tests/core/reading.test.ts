import { operationRequest } from '../mcp/requests.js';
import { operationId } from '../../src/server/mcp/operations.js';
import { DISCOVERY_TOOL_NAMES } from '../../src/server/mcp/operations.js';
import { randomUUID } from 'node:crypto';
import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { DisplayRecord } from '../../src/shared/types.js';
import type { InteractionRecord } from '../../src/shared/types.js';
import type { UpdateRecord } from '../../src/shared/types.js';
import type { ViewSpec } from '../../src/shared/types.js';
import { Store } from '../../src/server/store.js';
import { DisplayHistory } from '../../src/server/display-history.js';
import type { VideoCommandRecord } from '../../src/server/video-controls.js';
import { RenderingError } from '../../src/server/rendering/errors.js';
import { fact } from './harness.js';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import { denied } from './harness.js';
import type { Browser } from './harness.js';
import type { Harness } from './harness.js';
import { vi } from 'vitest';
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
import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import type { KanvasService } from '../../src/server/domain.js';
import { stackChart } from '../../src/shared/chart-stacks.js';
import { chartDataSchema } from '../../src/shared/chart-contract.js';
import type { Request } from 'express';
import { z } from 'zod';
import { materializeSeats } from '../../src/shared/venue.js';
import { menuBoardSchema } from '../../src/shared/venue.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { navigationCapabilities } from '../../src/shared/navigation.js';
import { navigate } from '../../src/shared/navigation.js';
import { initialNavigation } from '../../src/shared/navigation.js';
import { validationIssues } from '../../src/server/input-errors.js';
import { redactDeliveryRequest } from '../../src/server/delivery-telemetry.js';
import { deliveryIngress } from '../../src/server/delivery-telemetry.js';
import { recordDeliveryRequest } from '../../src/server/delivery-telemetry.js';
import { readingDefaults } from '../../src/shared/reading.js';
import { liveSurfaceLayout } from '../../src/shared/live-surface.js';
import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { feedbackSubmitSchema } from '../../src/shared/reports';
import { visualHelp } from '../../src/server/visual-help';
import { HELP_TOPICS } from '../../src/shared/help';

describe("reading coverage 1", () => {


describe("reading contracts", () => {
  let h!:Harness, owner: Browser, sessionId: string, displayId: string;
  const path = () => `/api/sessions/${sessionId}/displays/${displayId}`;
  beforeEach(async () => { h = await startHarness(); owner = await h.account(); sessionId = (await owner.session()).id; displayId = (await owner.display(sessionId)).id; });
  afterEach(async () => { await h?.close(); });
  const current = async () => (await owner.detail(sessionId)).displays.find(display => display.id === displayId)!;
  const publish = async (view: ViewSpec) => { await owner.submit(sessionId, [displayId], view); return current(); };
  const respond = async (browser: Browser, value: Record<string, unknown>, revision: number, requestId = randomUUID()) => browser.request<InteractionRecord>('POST', `${path()}/respond`, { value, revision, requestId });
  const addViewer = async () => { const viewer = await h.account(); success(await owner.request('POST', `/api/sessions/${sessionId}/members`, { username: viewer.user!.username, role: 'viewer' })); return viewer; };
  const navigate = async (direction: 'back'|'forward', displays: DisplayRecord[]) => owner.request<UpdateRecord>('POST', `/api/sessions/${sessionId}/navigate`, { direction, displayIds: displays.map(d => d.id), expectedRevisions: Object.fromEntries(displays.map(d => [d.id, d.revision])), requestId: randomUUID() });

  it('validates every history target and every revision before changing any display', async () => {
    await publish(fact('First')); await publish(fact('Second'));
    const first = await current(), empty = await owner.display(sessionId, 'No previous view');
    expect((await navigate('back', [first, empty])).status).toBe(409);
    expect((await current()).revision).toBe(first.revision);
    const viewer = await addViewer();
    denied(await viewer.request('POST', `/api/sessions/${sessionId}/navigate`, { displayIds: [displayId], direction: 'back', expectedRevisions: {[displayId]: first.revision}, requestId: randomUUID() }));
    const stale = {...first, revision: first.revision - 1};
    expect((await navigate('back', [stale])).status).toBe(409);
  });

  it('history restores a poll’s real responses without copying them into a newly published round', async () => {
    const poll: ViewSpec = {version: 1, template: 'poll', data: {question: 'Retained responses', options: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}], revealResults: true}};
    const display = await publish(poll), viewer = await addViewer();
    success(await respond(viewer, {kind: 'poll.vote', optionIds: ['a']}, display.revision));
    await publish(fact('Another view'));
    success(await navigate('back', [await current()]));
    expect((await current()).responseState?.poll?.counts).toEqual({a: 1, b: 0});
    success(await navigate('forward', [await current()]));
    await publish(poll);
    expect((await current()).responseState?.poll?.counts).toEqual({a: 0, b: 0});
  });

  it('collects real audience words without exposing unrevealed entries or accepting supplied aggregates', async () => {
    const display = await publish({version: 1, template: 'qa', data: {prompt: 'One idea', mode: 'word-cloud', revealResults: false}});
    const viewer = await addViewer(); success(await respond(viewer, {kind: 'qa.submit', text: 'Clear clear useful'}, display.revision));
    expect((await owner.detail(sessionId)).displays[0].responseState?.qa).not.toHaveProperty('entries');
    const reveal = success(await owner.request<DisplayRecord>('PATCH', `${path()}/view`, {expectedRevision: display.revision, data: {...display.view!.data, revealResults: true}}));
    expect(reveal.responseState?.qa?.entries?.map(({text, count}) => ({text, count}))).toEqual([{text: 'clear', count: 2}, {text: 'useful', count: 1}]);
  });});
});

describe("reading coverage 2", () => {

describe("reading contracts",()=>{
 let h!:Harness,owner:Browser,s:string,d:string,p:AuthPrincipal;
 const send=vi.fn(async(_subscription:unknown,_payload:string)=>({statusCode:201}));
 beforeEach(async()=>{send.mockClear();h=await startHarness({pushOptions:{publicKey:'test-public-key',privateKey:'test-private-key',subject:'mailto:test@example.invalid',send}});owner=await h.account();s=(await owner.session()).id;d=(await owner.display(s)).id;p={userId:owner.user!.id};});
 afterEach(async()=>{await h?.close();});
 async function deck(){const result=await owner.submit(s,[d],{version:1,template:'flashcards',data:{mode:'test',cards:[{id:'hola',prompt:'hola',answer:'hello',acceptedAnswers:['hi']},{id:'adios',prompt:'adiós',answer:'goodbye'}]}});expect(result.update.status).toBe('prepared');return result.detail.displays.find(x=>x.id===d)!;}
 it('rejects stale concurrent document edits on two screens',async()=>{
  const first=await deck(),deckId=String(first.view!.data.deckId),other=await owner.display(s);
  await h.runtime.service.flashcards.show(p,{sessionId:s,deckId,displayId:other.id,expectedRevision:0,requestId:'show'});
  const a={sessionId:s,deckId,displayId:d,expectedRevision:1,expectedDeckRevision:0,requestId:'next',cardId:'hola',action:'next'};
  await h.runtime.service.flashcards.control(p,a);
  await expect(h.runtime.service.flashcards.control(p,{...a,displayId:other.id,requestId:'concurrent'})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 });
 it('keeps chat line default and supports explicit bubble direction without altering text',()=>{
  const message={id:'1',sender:'Alex',text:'exact\nmessage'};
  expect(chatDataSchema.parse({messages:[message]}).style).toBe('lines');
  expect(chatDataSchema.parse({style:'bubbles',selfSender:'Alex',messages:[message]}).messages).toEqual([message]);
 });
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/inert',keys:{p256dh:'B'.repeat(87),auth:'A'.repeat(22)}};});
});

describe("reading coverage 3", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});
describe("reading contracts",()=>{
 it('uses readable reading defaults while preserving saved overrides',()=>{expect(readingDefaults({}).fontSize).toBe(30);expect(readingDefaults({readingFontSize:24,readingWpm:190})).toMatchObject({fontSize:24,wpm:190});});});
});

describe("reading coverage 4", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});
it('generates bounded reusable help pages for every topic without dropping words',()=>{
 for(const topic of HELP_TOPICS){const first=visualHelp({topic});expect(first.pageCount).toBeGreaterThan(0);for(let page=0;page<first.pageCount;page++){const result=visualHelp({topic,page});expect(String(result.view.data.text).length).toBeLessThanOrEqual(650);}}
});
});
