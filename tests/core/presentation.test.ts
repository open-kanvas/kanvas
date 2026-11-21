import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import { guideFor } from '../../src/server/mcp/guide.js';
import { templateViewSchema } from '../../src/shared/view-schemas.js';
import { randomUUID } from 'node:crypto';
import { denied } from './harness.js';
import { fact } from './harness.js';
import { z } from 'zod';
import { validateView } from '../../src/shared/view-schemas.js';
import { viewSchema } from '../../src/shared/view-schemas.js';
import { NOT_A_SLIDE } from '../../src/shared/view-schemas.js';
import { compactSchemaReferences } from '../../src/shared/json-schema.js';
import { MAX_TOOL_RESULT_BYTES } from '../../src/server/mcp/results.js';
import { publishInputSchema } from '../../src/shared/publish-input.js';
import { samples } from '../../src/shared/template-examples.js';
import { splitGrid } from '../../src/shared/split-screen.js';
import { splitLeaves } from '../../src/shared/split-screen.js';
import { splitDivider } from '../../src/shared/split-screen.js';
import { SPLIT_LIMITS } from '../../src/shared/split-screen.js';
import { redactStreamAddress } from '../../src/shared/monitor-stream-view.js';
import { streamRows } from '../../src/shared/monitor-stream-view.js';
import { formatDuration } from '../../src/shared/monitor-stream-view.js';
import type { StreamViewEvent } from '../../src/shared/monitor-stream-view.js';
import { boundStreamIds } from '../../src/server/monitor-streams.js';
import { STREAM_WAIT_MS } from '../../src/server/monitor-streams.js';
import { pointingSummary } from '../../src/shared/pointing.js';
import { POINTER_FADE_MS } from '../../src/shared/pointing.js';
import { POINTER_PIN_MS } from '../../src/shared/pointing.js';
import { POINTING_QUEUE } from '../../src/shared/pointing.js';
import { POINTING_BLOCK_EVENTS } from '../../src/shared/pointing.js';
import { applyResponsePolicy } from '../../src/server/mcp/response-policy.js';
import { ContactLedger } from '../../src/server/mcp/response-policy.js';
import { BOARD_DISCLOSURE } from '../../src/shared/message-board.js';
import { BOARD_LIMITS } from '../../src/shared/message-board.js';
import { parseIconId } from '../../src/shared/pickers.js';
import { isPickerIconUrl } from '../../src/shared/pickers.js';
import { iconUrl } from '../../src/shared/pickers.js';
import { iconPickerDataSchema } from '../../src/shared/pickers.js';
import { fontPickerDataSchema } from '../../src/shared/pickers.js';
import { projectTasks } from '../../src/shared/task-list.js';
import { taskCustomColumns } from '../../src/shared/task-list.js';
import { isBuiltinTaskColumn } from '../../src/shared/task-list.js';
import { navigate } from '../../src/shared/navigation.js';
import { initialNavigation } from '../../src/shared/navigation.js';
import { textScale } from '../../src/shared/reading.js';
import { configPatchSchema } from '../../src/shared/preferences.js';
import { sharingLevel } from '../../src/server/account-overview.js';
import { HELP_PAGES as HELP } from '../../src/shared/help.js';
import { HELP_TOPICS } from '../../src/shared/help.js';
import { TEMPLATE_DISPLAY_GUIDANCE } from '../../src/shared/display-guidance.js';
import { TEMPLATE_IDS } from '../../src/shared/types.js';
import type { ViewSpec } from '../../src/shared/types.js';
import { operationRequest } from '../mcp/requests.js';
import { operationId } from '../../src/server/mcp/operations.js';
import { DISCOVERY_TOOL_NAMES } from '../../src/server/mcp/operations.js';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { DisplayRecord } from '../../src/shared/types.js';
import type { InteractionRecord } from '../../src/shared/types.js';
import type { UpdateRecord } from '../../src/shared/types.js';
import { Store } from '../../src/server/store.js';
import { DisplayHistory } from '../../src/server/display-history.js';
import type { VideoCommandRecord } from '../../src/server/video-controls.js';
import { RenderingError } from '../../src/server/rendering/errors.js';
import { vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { visualHelp } from '../../src/server/visual-help';
import { parseCanonicalArguments } from '../../src/server/mcp/canonical';
import { canonicalToolDefinitions } from '../../src/server/mcp/canonical';
import { KEYBOARD_SHORTCUTS } from '../../src/shared/keyboard-shortcuts';
import { createApp } from '../../src/server/app';
import { hash } from '../../src/server/auth';
import { safePushEndpoint } from '../../src/server/push';
import { diagnosticBatchSchema } from '../../src/shared/frontend-diagnostics';
import { diagnosticRoute } from '../../src/shared/frontend-diagnostics';
import { chatDataSchema } from '../../src/shared/work-views';
import { flashcardDataSchema } from '../../src/shared/flashcards';
import { advanceFlashcards } from '../../src/shared/flashcards';
import { flashcardControlSchema } from '../../src/shared/flashcards';
import type { Response } from 'express';
import { Checklists } from '../../src/server/checklists.js';
import { resolveToolCall } from '../../src/server/mcp/catalog.js';

describe("presentation coverage 1", () => {
    describe("presentation contracts", () => {
        let h!: Harness, owner: Browser, s: string, d: string, p: AuthPrincipal;
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); s = (await owner.session()).id; d = (await owner.display(s)).id; p = { userId: owner.user!.id }; });
        afterEach(async () => { await h?.close(); });
        // Tool outputs are heterogeneous envelopes; assertions below narrow the relevant fields.
        const call = async (name: string, args: unknown, actor = p): Promise<any> => h.runtime.service.execute(name, args, actor);
        const target = () => ({ sessionId: s, displayId: d });
        it('publishes calendar without planning operations, serves tour and discovers the presenter option', async () => {
            await owner.submit(s, [d], { version: 1, template: 'calendar', data: { view: 'three-day', anchorDate: '2026-09-27', timeZone: 'UTC', items: [] } });
            await expect(call("kanvas.planner.read", target())).rejects.toMatchObject({ code: 'INVALID_VIEW' });
            const before = (await owner.detail(s)).displays[0];
            expect(guideFor('tour')).toMatchObject({ topic: 'tour' });
            expect(await call("kanvas.help", { topic: 'tour', sessionId: s })).toMatchObject({ published: false, topic: 'tour' });
            expect((await owner.detail(s)).displays[0].revision).toBe(before.revision);
            expect(templateViewSchema('presentation').safeParse({ version: 1, template: 'presentation', data: { slides: [{ version: 1, template: 'fact', data: { text: 'Note' } }], presenterPreview: true } }).success).toBe(true);
        });
    });
});

describe("presentation coverage 2", () => {

const displayGuidance=(template:string)=>(TEMPLATE_DISPLAY_GUIDANCE as Record<string,unknown>)[template];

const pane=(id:string,text=id)=>({id,view:{version:1,template:'fact',data:{text}}});
const split=(data:Record<string,unknown>)=>({version:1,template:'split-screen',data});

describe("presentation contracts",()=>{
 it('contract headroom: the two display-only templates are not slides, and the full presentation contract fits one MCP result',()=>{
  const slide=(template:string,data:Record<string,unknown>)=>({version:1,template:'presentation',data:{slides:[{version:1,template,data}]}});
  expect(()=>validateView(slide('monitor-stream',{streamId:'s1'}))).toThrow();expect(()=>validateView(slide('message-board',{total:0}))).toThrow();
  expect(validateView(slide('fact',{text:'ok'})).template).toBe('presentation');
  expect(validateView(split({panes:[pane('a'),{id:'b',view:{version:1,template:'monitor-stream',data:{streamId:'s1'}}}]})).template).toBe('split-screen');
  expect([...NOT_A_SLIDE].sort()).toEqual(['message-board','monitor-stream']);
  const published=JSON.stringify(z.toJSONSchema(templateViewSchema('presentation'),{io:'input',unrepresentable:'any',reused:'ref'}));
  for(const template of NOT_A_SLIDE)expect(published).not.toContain(`"const":"${template}"`);
  const bytes=Buffer.byteLength(JSON.stringify(compactSchemaReferences(JSON.parse(published))));
  // The transport limit is not raised. At 0.38.0 the compact contract measures about 97.7 KB of 96 KiB (98304).
  expect(bytes).toBeLessThan(MAX_TOOL_RESULT_BYTES);expect(MAX_TOOL_RESULT_BYTES).toBe(98304);
 },60_000);});
});

describe("presentation coverage 3", () => {


describe("presentation contracts", () => {
  let h!:Harness, owner: Browser, sessionId: string, displayId: string;
  const path = () => `/api/sessions/${sessionId}/displays/${displayId}`;
  beforeEach(async () => { h = await startHarness(); owner = await h.account(); sessionId = (await owner.session()).id; displayId = (await owner.display(sessionId)).id; });
  afterEach(async () => { await h?.close(); });
  const current = async () => (await owner.detail(sessionId)).displays.find(display => display.id === displayId)!;
  const publish = async (view: ViewSpec) => { await owner.submit(sessionId, [displayId], view); return current(); };
  const respond = async (browser: Browser, value: Record<string, unknown>, revision: number, requestId = randomUUID()) => browser.request<InteractionRecord>('POST', `${path()}/respond`, { value, revision, requestId });
  const addViewer = async () => { const viewer = await h.account(); success(await owner.request('POST', `/api/sessions/${sessionId}/members`, { username: viewer.user!.username, role: 'viewer' })); return viewer; };
  const navigate = async (direction: 'back'|'forward', displays: DisplayRecord[]) => owner.request<UpdateRecord>('POST', `/api/sessions/${sessionId}/navigate`, { direction, displayIds: displays.map(d => d.id), expectedRevisions: Object.fromEntries(displays.map(d => [d.id, d.revision])), requestId: randomUUID() });

  it('cues a navigable saved deck and keeps intrinsic responses attached to their own slide', async () => {
    const poll: ViewSpec = {version: 1, template: 'poll', data: {question: 'Choose', options: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}], revealResults: true}};
    const deck = success(await owner.request<{id: string}>('POST', `/api/sessions/${sessionId}/presentations`, {name: 'Retained deck', slides: [poll, fact('Last slide')]}));
    const cue = async (index: number) => { const requestId = randomUUID(); success(await owner.request('POST', `/api/sessions/${sessionId}/presentations/${deck.id}/cue`, {index, displayIds: [displayId], requestId})); return owner.settle(sessionId, requestId); };
    await cue(0); let display = await current(); expect(display.view?.template).toBe('presentation');
    success(await respond(owner, {kind: 'poll.vote', optionIds: ['a']}, display.revision));
    success(await respond(owner, {kind: 'presentation.navigate', index: 1}, display.revision));
    expect((await current()).view?.data.index).toBe(1);
    await cue(0); display = await current(); expect(display.responseState?.poll?.counts).toEqual({a: 1, b: 0});
    const viewer = await addViewer(); denied(await respond(viewer, {kind: 'presentation.navigate', index: 1}, display.revision));
  });});
});

describe("presentation coverage 4", () => {
    let h!: Harness;
    afterEach(async () => { await h?.close(); });
    it('retains each mirror direction and private cues, including legacy booleans, without widening deck access', async () => {
        h = await startHarness();
        const owner = await h.account(), other = await h.account(), s = await owner.session(), d = await owner.display(s.id), service = h.runtime.service, p = { userId: owner.user!.id };
        for (const mirrored of [false, true, 'vertical', 'horizontal', 'both'] as const) {
            const args = parseCanonicalArguments("kanvas.presentation.create", { sessionId: s.id, name: 'Mirror', mirrored, instructions: 'Private deck cue', cardInstructions: ['Private card cue'], slides: [{ version: 1, template: 'fact', data: { text: 'Visible card' } }] })!;
            const deck: any = await service.execute("kanvas.presentation.create", args, p);
            expect(deck.mirrored).toBe(mirrored);
            const requestId = 'mirror-' + mirrored;
            await service.cue(p, s.id, deck.id, 0, [d.id], requestId);
            const { detail } = await owner.settle(s.id, requestId);
            const view = detail.displays.find(x => x.id === d.id)!.view!;
            expect(view.data.mirrored).toBe(mirrored || undefined);
            expect(JSON.stringify(view)).not.toContain('Private');
            await expect(service.decks({ userId: other.user!.id }, s.id)).rejects.toThrow();
        }
        expect(parseCanonicalArguments("kanvas.presentation.create", { sessionId: s.id, name: 'Invalid', mirrored: 'diagonal', slides: [{ version: 1, template: 'fact', data: { text: 'x' } }] })).toBeUndefined();
    });
    function worker(clients: any) { const events: Record<string, Function> = {}; const registration = { showNotification: vi.fn() }; runInNewContext(readFileSync('public/sw.js', 'utf8'), { URL, self: { location: { origin: 'https://kanvas.test' }, clients, registration, addEventListener: (name: string, fn: Function) => events[name] = fn } }); return { events, registration }; }
});

describe("presentation coverage 5", () => {

describe("presentation contracts",()=>{
 let h!:Harness,owner:Browser,s:string,d:string,p:AuthPrincipal;
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
 it('restarts a completed deck with current revisions and rejects genuinely stale controls',async()=>{
  let display=await deck();const deckId=String(display.view!.data.deckId);
  let latest:any;
  for(const [action,cardId] of [['answer','hola'],['next','hola'],['answer','adios'],['restart','adios']] as const){
   display=(await owner.detail(s)).displays.find(x=>x.id===d)!;
   const saved:any=await h.runtime.service.flashcards.read(p,{sessionId:s,deckId});
   const a={sessionId:s,displayId:d,deckId,expectedRevision:display.revision,expectedDeckRevision:saved.revision,requestId:randomUUID(),cardId,action,...(action==='answer'?{response:'hello'}:{})};
   latest=await h.runtime.service.flashcards.control(p,a);
   expect(await h.runtime.service.flashcards.control(p,a)).toEqual(latest);
   await expect(h.runtime.service.flashcards.control(p,{...a,requestId:randomUUID()})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
  }
  expect(latest.deck.view.data).toMatchObject({index:0,revealed:false,responses:[]});
 });
 it('restarts shared deck from a display whose card identity lags the latest saved deck, without bypassing revisions',async()=>{
  const first=await deck(),deckId=String(first.view!.data.deckId),other=await owner.display(s);
  await h.runtime.service.flashcards.show(p,{sessionId:s,deckId,displayId:other.id,expectedRevision:0,requestId:'shared'});
  await h.runtime.service.flashcards.control(p,{sessionId:s,deckId,displayId:d,expectedRevision:1,expectedDeckRevision:0,cardId:'hola',action:'next',requestId:'advance'});
  const a={sessionId:s,deckId,displayId:other.id,expectedRevision:1,expectedDeckRevision:1,cardId:'hola',action:'restart',requestId:'restart-shared'};
  const result:any=await h.runtime.service.flashcards.control(p,a);
  expect(result.deck.view.data).toMatchObject({index:0,revealed:false,responses:[]});
  await expect(h.runtime.service.flashcards.control(p,{...a,requestId:'stale-reset'})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 });
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/inert',keys:{p256dh:'B'.repeat(87),auth:'A'.repeat(22)}};
 it('persists deck answers across an application restart and rejects held controls',async()=>{
  const display=await deck(),deckId=String(display.view!.data.deckId);
  const args={sessionId:s,displayId:d,deckId,expectedRevision:1,expectedDeckRevision:0,requestId:'answer',cardId:'hola',action:'answer',response:'hello'};
  const stored=await h.runtime.store.get<any>('display',d);await h.runtime.store.put('display',{...stored,held:true});
  await expect(h.runtime.service.flashcards.control(p,args)).rejects.toMatchObject({code:'DISPLAY_HELD'});
  await h.runtime.store.put('display',stored);await h.runtime.service.flashcards.control(p,args);
  await h.shutdown();const restarted=await createApp({database:h.database,publicUrl:'http://127.0.0.1'});
  try{const read:any=await restarted.service.flashcards.read(p,{sessionId:s,deckId});expect(read.view.data.responses[0].result).toBe('correct');expect(read.revision).toBe(1);}finally{await restarted.close();}
 });

 it('bounds encoded card/answer bytes and pages large decks without truncating current-card data',async()=>{
  expect(flashcardDataSchema.safeParse({cards:[{id:'large',prompt:'字'.repeat(4000),answer:'字'.repeat(4000)}]}).success).toBe(false);
  const cards=Array.from({length:40},(_,i)=>({id:'card-'+i,prompt:'p'.repeat(1500),answer:'a'.repeat(1500)}));
  const result=await owner.submit(s,[d],{version:1,template:'flashcards',data:{cards}});
  const deckId=String(result.detail.displays.find(x=>x.id===d)!.view!.data.deckId);
  const read:any=await h.runtime.service.flashcards.read(p,{sessionId:s,deckId});expect(read.nextOffset).toBeGreaterThan(0);expect(read.currentCard).toEqual(cards[0]);expect(Buffer.byteLength(JSON.stringify(read))).toBeLessThan(44000);
  expect(flashcardControlSchema.safeParse({sessionId:s,displayId:d,deckId,expectedRevision:1,expectedDeckRevision:0,requestId:'large-response',cardId:'card-0',action:'answer',response:'\u0000'.repeat(4000)}).success).toBe(false);
 });});
});

describe("presentation coverage 6", () => {

let h!:Harness;
afterEach(async()=>{await h?.close();});
async function principal(a:Browser){const session=await h.runtime.auth.issueBrowser(a.user!.id,{cookie:()=>{}} as unknown as Response);return {userId:a.user!.id,browserId:session.id};}
const view={version:1 as const,template:'checklist' as const,title:'Release tasks',data:{items:[{id:'a',text:'Review',checked:false},{id:'b',text:'Test',checked:false}]}};
describe("presentation contracts",()=>{
 it('document update is revisioned/idempotent, refreshes matching screens and rejects stale mirrors',async()=>{
  h=await startHarness();const a=await h.account(),p=await principal(a),s=await a.session(),d=await a.display(s.id);await a.submit(s.id,[d.id],view);const current=await h.runtime.service.display(p,s.id,d.id),key=String(current.view!.data.checklistId);
  const args={sessionId:s.id,checklistId:key,expectedRevision:0,requestId:'edit-items',items:[{id:'a',text:'Review',checked:true}]};const saved:any=await h.runtime.service.checklists.update(p,args);expect(saved.revision).toBe(1);expect((await h.runtime.service.checklists.update(p,args)).revision).toBe(1);
  await expect(h.runtime.service.checklists.update(p,{...args,items:[]})).rejects.toMatchObject({code:'REQUEST_ID_CONFLICT'});
  await expect(h.runtime.service.checklists.update(p,{...args,requestId:'stale'})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
  expect((await h.runtime.service.display(p,s.id,d.id)).revision).toBe(current.revision+1);
  await expect(h.runtime.service.edit(p,s.id,d.id,current.revision,{...current.view!.data,items:[{id:'a',text:'Stale overwrite',checked:false}]})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
  expect((await h.runtime.service.checklists.read(p,{sessionId:s.id,checklistId:key}) as any).view.data.items[0].text).toBe('Review');
 });
 it('checkbox intent on a stale mirror rebases without losing newer sibling items',async()=>{
  h=await startHarness();const a=await h.account(),p=await principal(a),s=await a.session(),d=await a.display(s.id),e=await a.display(s.id);await a.submit(s.id,[d.id,e.id],view);
  let first=await h.runtime.service.display(p,s.id,d.id),second=await h.runtime.service.display(p,s.id,e.id);const key=String(first.view!.data.checklistId);
  await h.runtime.service.respond(p,s.id,d.id,{revision:first.revision,requestId:'a-click',value:{kind:'checklist.toggle',itemId:'a',checked:true}});
  await h.runtime.service.respond(p,s.id,e.id,{revision:second.revision,requestId:'b-click',value:{kind:'checklist.toggle',itemId:'b',checked:true}});
  const saved:any=await h.runtime.service.checklists.read(p,{sessionId:s.id,checklistId:key});expect(saved.view.data.items.map((i:any)=>i.checked)).toEqual([true,true]);
  second=await h.runtime.service.display(p,s.id,e.id);expect((second.view!.data.items as any[]).map(i=>i.checked)).toEqual([true,true]);
 });});
});
