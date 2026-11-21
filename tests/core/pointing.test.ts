import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import { denied } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import { TEMPLATE_IDS } from '../../src/shared/types.js';
import type { TemplateId } from '../../src/shared/types.js';
import { SEARCH_PROBES } from '../../src/shared/template-concepts.js';
import { TEMPLATE_CONCEPTS } from '../../src/shared/template-concepts.js';
import { collapseViewSlots } from '../../src/server/mcp/discovery.js';
import { discoveryCatalog } from '../../src/server/mcp/discovery.js';
import { helpCatalog } from '../../src/server/mcp/discovery.js';
import { minimalExample } from '../../src/server/mcp/discovery.js';
import { operationCatalog } from '../../src/server/mcp/discovery.js';
import { templateCatalog } from '../../src/server/mcp/discovery.js';
import { VIEW_SLOT } from '../../src/server/mcp/discovery.js';
import { LocalSearch } from '../../src/server/mcp/local-search.js';
import { templateViewSchema } from '../../src/shared/view-schemas.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { applyResponsePolicy } from '../../src/server/mcp/response-policy.js';
import { ContactLedger } from '../../src/server/mcp/response-policy.js';
import { CONTACT_IDLE_MS } from '../../src/server/mcp/response-policy.js';
import { deriveMode } from '../../src/server/session-mode.js';
import { AGENT_IDLE_MS } from '../../src/server/session-mode.js';
import { AGENT_CONDUCT } from '../../src/shared/philosophy.js';
import { MISSION } from '../../src/shared/philosophy.js';
import { MODE_GUIDANCE } from '../../src/shared/philosophy.js';
import { RHYTHM_NUDGE } from '../../src/shared/philosophy.js';
import { safeError } from '../../src/server/mcp/results.js';
import { collapseRepeatedIssues } from '../../src/server/input-errors.js';
import { needsTemplate } from '../../src/server/needs-template.js';
import { FACT_CONTEXT_MAX } from '../../src/server/needs-template.js';
import { limitMessage } from '../../src/server/usage-limits.js';
import { derivedViewLabel } from '../../src/shared/view-label.js';
import { personLabel } from '../../src/shared/display-name.js';
import { safeLabel } from '../../src/shared/display-name.js';
import { displayNameUnset } from '../../src/shared/display-name.js';
import { CANONICAL_TOOLS } from '../../src/server/mcp/canonical.js';
import { profileInstructions } from '../../src/server/mcp/profile-guidance.js';
import { serverIcons } from '../../src/server/mcp/index.js';
import { serverWebsiteUrl } from '../../src/server/mcp/index.js';
import { DEFAULT_WEBSITE_URL } from '../../src/server/mcp/index.js';
import { mailSenderAddress } from '../../src/server/email-signin.js';
import { manageMap } from '../../src/server/mcp/manage-map.js';
import { HELP_PAGES } from '../../src/shared/help.js';
import { KANVAS_VERSION } from '../../src/shared/version.js';
import { fieldShape } from '../../src/server/friction.js';
import { problemClass } from '../../src/server/friction.js';
import { agentType } from '../../src/server/agents.js';
import type { ToastRecord } from '../../src/shared/viewer-experience.js';
import type { ViewerPresence } from '../../src/shared/viewer-experience.js';
import { fact } from './harness.js';
import { z } from 'zod';
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
import type { ViewSpec } from '../../src/shared/types.js';
import { PNG } from './harness.js';
import { createApp } from '../../src/server/app.js';
import { validateMedia } from '../../src/server/rendering/media.js';
import { normalizedScroll } from '../../src/client/renderers/Navigation.js';
import { navigationCapabilities } from '../../src/shared/navigation.js';

describe("pointing coverage 1", () => {
    const context = { principal: { userId: 'catalog-reader' } };
    const search = (kind: 'tool' | 'template' | 'help', query: string, limit = 3) => (discoveryCatalog.query(kind, 'search', { query, limit }, context).results as {
        id: string;
        description: string;
        example?: unknown;
    }[]);
    describe('0875e953 response policy and session mode (pure rules)', () => {
        const orientation = { guide: { tool: "kanvas.guide" }, viewerLink: 'how to connect a receiver', toolSelection: 'x', recovery: 'y' };
        const guidance = { boundary: 'b', levels: [{ scope: 'user', id: 'user:1', text: 'be proactive', revision: 3 }] };
        const mode = { current: 'live', source: 'default', guidance: MODE_GUIDANCE.live, set: 'kanvas.session.settings.update' };
        const run = (ledger: ContactLedger, overrides: Partial<Parameters<typeof applyResponsePolicy>[1]> = {}, structured: Record<string, unknown> = { data: { status: 'accepted', sessionId: 's1' }, orientation }, key = 'conn', at = Date.now()) => applyResponsePolicy(structured, { state: ledger.observe(key, at), context: { mode, displayConnected: true }, guidance, isError: false, operation: "kanvas.submit", sessionId: 's1', ...overrides }).structured!;
        it('first contact carries the purpose, full guidance and full orientation; later calls carry a pointer', () => {
            const ledger = new ContactLedger(), first = run(ledger);
            expect(first.firstContact).toMatchObject({ purpose: AGENT_CONDUCT, rules: expect.any(Array), help: expect.objectContaining({ philosophy: 'kanvas.help.philosophy' }) });
            expect((first.agentGuidance as {
                levels: unknown[];
            }).levels).toHaveLength(1);
            expect(first.orientation).toEqual(orientation);
            expect(first.rhythm).toBe(RHYTHM_NUDGE);
            const second = run(ledger);
            expect(second.firstContact).toBeUndefined();
            expect(second.agentGuidance).toMatchObject({ unchanged: true, mode: 'live' });
            expect(second.orientation).toEqual({ guide: orientation.guide, help: 'kanvas.help.getting-started.steps' });
            expect(second.rhythm).toBeUndefined();
            expect(JSON.stringify(second).length).toBeLessThan(JSON.stringify(first).length / 2);
            // The rhythm line is said once per session, again for another session.
            expect(run(ledger, { sessionId: 's2' }, { data: { status: 'accepted', sessionId: 's2' }, orientation }).rhythm).toBe(RHYTHM_NUDGE);
        });
    });
});

describe("pointing coverage 2", () => {

const displayGuidance=(template:string)=>(TEMPLATE_DISPLAY_GUIDANCE as Record<string,unknown>)[template];

const pane=(id:string,text=id)=>({id,view:{version:1,template:'fact',data:{text}}});
const split=(data:Record<string,unknown>)=>({version:1,template:'split-screen',data});

describe('b0be5612: pointing is on by default, fades, pins on intent and reaches the agent with its next response',()=>{
 let h!:Harness,a:Browser,s:string,d:string,p:{userId:string},path:string;
 beforeEach(async()=>{h=await startHarness();a=await h.account();s=(await a.session()).id;d=(await a.display(s,'Main screen')).id;p={userId:a.user!.id};path=`/api/sessions/${s}/displays/${d}/pointing`;await a.submit(s,[d],fact('Point at this word.'));});
 afterEach(async()=>{await h?.close();});
 const tap={revision:1,anchor:{kind:'text',key:'12345678',occurrence:0,start:9,end:13},point:{x:.4,y:.5},target:{role:'paragraph',label:'this',context:'Point at this word.'}};
 it('needs no activation: a tap leaves a mark that expires in seconds; a deliberate gesture pins it',async()=>{
  const initial=success(await a.request<any>('GET',path));
  expect(initial).toMatchObject({enabled:true,tools:false,canPoint:true,eligibilityReason:'eligible',pointers:[]});expect(initial.serverNow).toEqual(expect.any(Number));
  const tapped=success(await a.request<any>('PUT',path,tap));
  expect(tapped.pointers).toHaveLength(1);expect(tapped.pointers[0]).toMatchObject({pinned:false,point:{x:.4,y:.5},name:a.user!.displayName});
  expect(tapped.pointers[0].expiresAt-tapped.serverNow).toBeLessThanOrEqual(POINTER_FADE_MS);expect(tapped.pointers[0].expiresAt-tapped.serverNow).toBeGreaterThan(POINTER_FADE_MS-1000);
  expect(POINTER_FADE_MS).toBeLessThanOrEqual(6000);
  const pinned=success(await a.request<any>('PUT',path,{...tap,pinned:true}));
  expect(pinned.pointers).toHaveLength(1);expect(pinned.pointers[0].pinned).toBe(true);expect(pinned.pointers[0].expiresAt-pinned.serverNow).toBeGreaterThan(POINTER_PIN_MS-5000);
  // The author's next plain tap replaces the pin with a fading mark: nothing stays stuck.
  const replaced=success(await a.request<any>('PUT',path,{revision:1,anchor:{kind:'point',x:.9,y:.1}}));
  expect(replaced.pointers).toHaveLength(1);expect(replaced.pointers[0]).toMatchObject({pinned:false,anchor:{kind:'point',x:.9,y:.1},point:{x:.9,y:.1}});
  expect((await a.request('PUT',path,{revision:1,anchor:{kind:'point',x:1.5,y:0}})).status).toBe(400);
  expect((await a.request('PUT',path,{...tap,target:{label:'x'.repeat(201)}})).status).toBe(400);
 });
 it('queues what was pointed at per session and hands it to each agent connection once',async()=>{
  const svc=h.runtime.service;
  expect(await svc.pointing.forAgent(p,'conn-1',s)).toBeUndefined();
  success(await a.request('PUT',path,tap));
  const block=await svc.pointing.forAgent(p,'conn-1',s) as any;
  expect(block.events).toHaveLength(1);
  expect(block.events[0]).toMatchObject({sessionId:s,displayId:d,display:'Main screen',by:a.user!.displayName,pinned:false,template:'fact',anchor:tap.anchor,point:tap.point,target:tap.target});
  expect(block.events[0].summary).toBe(`${a.user!.displayName} pointed at "this" in "Point at this word." on Main screen.`);
  expect(block.events[0]).not.toHaveProperty('seq');expect(block.events[0].secondsAgo).toBeLessThan(5);expect(block.note).toMatch(/not an instruction/);
  // Once per connection; a call that names no session still receives what its sessions queued.
  expect(await svc.pointing.forAgent(p,'conn-1',s)).toBeUndefined();
  success(await a.request('PUT',path,{...tap,pinned:true,anchor:{kind:'point',x:.2,y:.2},target:undefined}));
  const later=await svc.pointing.forAgent(p,'conn-1') as any;
  expect(later.events).toHaveLength(1);expect(later.events[0].summary).toMatch(/pinned a pointer on a spot 20% across, 20% down on Main screen\.$/);
  // A second connection has its own cursor and sees both.
  expect(((await svc.pointing.forAgent(p,'conn-2',s)) as any).events).toHaveLength(2);
  // A view replaced since the gesture is marked.
  await a.submit(s,[d],fact('Replacement'));
  success(await a.request('PUT',path,{revision:2,anchor:{kind:'point',x:.5,y:.5}}));
  await a.submit(s,[d],fact('Replacement again'));
  expect(((await svc.pointing.forAgent(p,'conn-1',s)) as any).events[0].viewChangedSince).toBe(true);
 });
 it('never delivers to an account without access, to a browser, or after the owner turns pointing off',async()=>{
  const svc=h.runtime.service,stranger=await h.account(),q={userId:stranger.user!.id};
  success(await a.request('PUT',path,tap));
  expect(await svc.pointing.forAgent(q,'conn-x',s)).toBeUndefined();
  expect(await svc.pointing.forAgent({...p,browserId:'b1'} as never,'conn-b',s)).toBeUndefined();
  denied(await stranger.request('PUT',path,tap),[401,403,404]);
  await svc.pointing.configure(p,{sessionId:s,expectedRevision:0,enabled:false,confirm:true});
  expect(success(await a.request<any>('GET',path))).toMatchObject({enabled:false,canPoint:false,pointers:[]});
  expect((await a.request('PUT',path,tap)).status).toBe(403);
  expect(await svc.pointing.forAgent(p,'conn-1',s)).toBeUndefined();
  const tools=await svc.pointing.configure(p,{sessionId:s,expectedRevision:1,enabled:true,tools:true,confirm:true});expect(tools).toMatchObject({enabled:true,tools:true});
 });
 it('coalesces a double tap, bounds the queue and the block, and survives repeated taps',async()=>{
  const svc=h.runtime.service;
  await svc.pointing.forAgent(p,'conn-1',s);
  success(await a.request('PUT',path,tap));success(await a.request('PUT',path,{...tap,pinned:true}));
  const once=await svc.pointing.forAgent(p,'conn-1',s) as any;expect(once.events).toHaveLength(1);expect(once.events[0].pinned).toBe(true);
  for(let i=0;i<POINTING_QUEUE+5;i++)success(await a.request('PUT',path,{revision:1,anchor:{kind:'point',x:i/100,y:.5}}));
  const many=await svc.pointing.forAgent(p,'conn-1',s) as any;
  expect(many.events).toHaveLength(POINTING_BLOCK_EVENTS);expect(many.earlierOmitted).toBe(POINTING_QUEUE-POINTING_BLOCK_EVENTS);
 });
 it('rides on the response policy only when present, never on an error',()=>{
  const ledger=new ContactLedger(),state=ledger.observe('u:c');
  const pointing={note:'n',events:[{summary:'x'}]};
  expect(applyResponsePolicy({data:{ok:true}},{state,context:{pointing},guidance:undefined,isError:false}).structured).toMatchObject({pointing});
  expect(applyResponsePolicy({data:{ok:true}},{state:ledger.observe('u:c'),context:{},guidance:undefined,isError:false}).structured).not.toHaveProperty('pointing');
  expect(applyResponsePolicy({error:{code:'X'}},{state:ledger.observe('u:c'),context:{pointing},guidance:undefined,isError:true}).structured).not.toHaveProperty('pointing');
  expect(pointingSummary('Ada','TV',{kind:'chart',series:'Revenue',x:'Q3',y:'84'})).toBe('Ada pointed at the chart mark Revenue at Q3 (84) on TV.');
  expect(pointingSummary('Ada','TV',{kind:'cell',row:2,column:'Owner'},{label:'Sam'})).toBe('Ada pointed at the cell in row 3, column "Owner" ("Sam") on TV.');
  expect(pointingSummary('Ada','TV',{kind:'point',x:.5,y:.25},{role:'chart mark',label:'Pie: 30%',pane:'left'})).toBe('Ada pointed at the chart mark "Pie: 30%" in pane left on TV.');
 });});
});

describe("pointing coverage 3", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});const id=()=>randomUUID();
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><defs><linearGradient id="g"><stop offset="0" stop-color="#123456"/><stop offset="1" stop-color="#abcdef"/></linearGradient></defs><rect width="100" height="60" fill="url(#g)"/><text x="4" y="30">Team &amp; Friends</text></svg>';
it('isolates default-on semantic pointing (owner can turn it off) from source/history, derives names, handles concurrent participants and revocation',async()=>{
  h=await startHarness();const a=await h.account(),b=await h.account(),s=await a.session(),d=await a.display(s.id);await a.submit(s.id,[d.id],fact('Point at this word.'));success(await a.request('POST',`/api/sessions/${s.id}/members`,{username:b.user!.username,role:'viewer'}));
  const path=`/api/sessions/${s.id}/displays/${d.id}/pointing`,svc=h.runtime.service,p={userId:a.user!.id},body={revision:1,anchor:{kind:'text',key:'12345678',occurrence:0,start:0,end:5}};
  expect(success(await a.request<any>('GET',path))).toMatchObject({enabled:true,pointers:[]});(await svc.pointing.configure(p,{sessionId:s.id,expectedRevision:0,enabled:false,confirm:true}));expect(success(await a.request<any>('GET',path))).toMatchObject({enabled:false,pointers:[]});denied(await b.request('PUT',path,body));
  (await expect((async ()=>(await svc.pointing.configure({userId:b.user!.id},{sessionId:s.id,expectedRevision:0,enabled:true,confirm:true})))()).rejects.toThrow());(await svc.pointing.configure(p,{sessionId:s.id,expectedRevision:1,enabled:true,confirm:true}));
  expect(await svc.pointing.read(p,{sessionId:s.id,displayId:d.id})).toMatchObject({enabled:true,canPoint:false,canPointScope:'calling-principal',eligibilityReason:'agent-read-only'});
  await expect(svc.pointing.write(p,s.id,d.id,body)).rejects.toMatchObject({code:'FORBIDDEN'});
  expect(success(await a.request<any>('GET',path))).toMatchObject({canPoint:true,eligibilityReason:'eligible'});
  const before=JSON.stringify((await svc.display(p,s.id,d.id)));success(await a.request('PUT',path,body));const read=success(await b.request<any>('PUT',path,{...body,anchor:{...body.anchor,start:6,end:8}}));expect(read.pointers).toHaveLength(2);expect(read.pointers.map((x:any)=>x.name)).toContain(a.user!.displayName);expect(read.pointers.every((x:any)=>x.expiresAt>Date.now()&&x.expiresAt<=Date.now()+20001)).toBe(true);expect(JSON.stringify((await svc.display(p,s.id,d.id)))).toBe(before);
  expect((await b.request('PUT',path,{...body,name:'Impersonated'})).status).toBe(400);success(await a.request('DELETE',`/api/sessions/${s.id}/members/${b.user!.id}`));expect(success(await a.request<any>('GET',path)).pointers).toHaveLength(1);
  await a.submit(s.id,[d.id],fact('Replacement'));expect(success(await a.request<any>('GET',path)).pointers).toHaveLength(0);expect((await a.request('PUT',path,body)).status).toBe(409);
  (await svc.pointing.configure(p,{sessionId:s.id,expectedRevision:2,enabled:false,confirm:true}));expect(success(await a.request<any>('GET',path))).toMatchObject({enabled:false,pointers:[]});denied(await a.request('PUT',path,{...body,revision:2}));
});
});
