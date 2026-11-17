import { beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import { denied } from './harness.js';
import { fact } from './harness.js';
import { PNG } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import type { DisplayRecord } from '../../src/shared/types.js';
import type { InteractionRecord } from '../../src/shared/types.js';
import type { UpdateRecord } from '../../src/shared/types.js';
import type { ViewSpec } from '../../src/shared/types.js';
import { configPatchSchema } from '../../src/shared/preferences.js';
import { WebsitePreview } from '../../src/server/website-preview.js';
import { vi } from 'vitest';
import { validateView } from '../../src/shared/view-schemas.js';
import { KANVAS_VERSION } from '../../src/shared/version.js';
import { feedbackSubmitSchema } from '../../src/shared/reports.js';
import { experienceTools } from '../../src/server/mcp/experience-tools.js';
import { pairedDisplayAllowsAsset } from '../../src/server/access-flows.js';
import { parseDataset } from '../../src/server/rendering/datasets.js';
import { rawEvent } from '../../src/server/raw-events.js';
import { recordHttpOperation } from '../../src/server/raw-events.js';
import { samples } from '../../src/shared/template-examples.js';
import { projectTasks } from '../../src/shared/task-list.js';
import { STREAM_BURST } from '../../src/server/monitor-streams.js';
import { STREAM_EVENT_BYTES } from '../../src/server/monitor-streams.js';
import { STREAM_MAX_EVENTS } from '../../src/server/monitor-streams.js';
import { sanitizeSvg } from '../../src/server/pickers.js';
import { iconifyBase } from '../../src/server/pickers.js';
import { readCapped } from '../../src/server/pickers.js';
import { PICKER_CACHE_BYTES } from '../../src/server/pickers.js';
import { PICKER_ICON_BYTES } from '../../src/server/pickers.js';
import { PICKER_FONT_BYTES } from '../../src/server/pickers.js';
import { precachePickers } from '../../scripts/picker-precache.js';
import { mkdtemp } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FONT_FAMILIES } from '../../src/shared/pickers.js';
import { ICON_SETS } from '../../src/shared/pickers.js';
import { iconUrl } from '../../src/shared/pickers.js';
import { iconId } from '../../src/shared/pickers.js';
import { fontUrl } from '../../src/shared/pickers.js';
import { colourTokens } from '../../src/shared/colour.js';
import { contrastGrade } from '../../src/shared/colour.js';
import { contrastRatio } from '../../src/shared/colour.js';
import { harmonies } from '../../src/shared/colour.js';
import { hexToOklch } from '../../src/shared/colour.js';
import { namedColours } from '../../src/shared/colour.js';
import { NAMED_GROUPS } from '../../src/shared/colour.js';
import { oklchToHex } from '../../src/shared/colour.js';
import { resolveColour } from '../../src/shared/colour.js';
import { roleSteps } from '../../src/shared/colour.js';
import { seedTheme } from '../../src/shared/colour.js';
import { shadeGrid } from '../../src/shared/colour.js';
import { variations } from '../../src/shared/colour.js';
import { CSS_NAMED } from '../../src/shared/colour-palettes.js';
import { OPEN_COLOR } from '../../src/shared/colour-palettes.js';
import { RADIX_DARK } from '../../src/shared/colour-palettes.js';
import { RADIX_LIGHT } from '../../src/shared/colour-palettes.js';
import { TAILWIND } from '../../src/shared/colour-palettes.js';
import { jsonPathLine } from '../../src/shared/connection-views.js';
import { prettyJson } from '../../src/shared/connection-views.js';
import { jsonDataSchema } from '../../src/shared/connection-views.js';
import { HUMAN_INVITATION } from '../../src/shared/philosophy.js';
import { safeError } from '../../src/server/mcp/results.js';
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
import { applyResponsePolicy } from '../../src/server/mcp/response-policy.js';
import { ContactLedger } from '../../src/server/mcp/response-policy.js';
import { CONTACT_IDLE_MS } from '../../src/server/mcp/response-policy.js';
import { deriveMode } from '../../src/server/session-mode.js';
import { AGENT_IDLE_MS } from '../../src/server/session-mode.js';
import { AGENT_CONDUCT } from '../../src/shared/philosophy.js';
import { MISSION } from '../../src/shared/philosophy.js';
import { MODE_GUIDANCE } from '../../src/shared/philosophy.js';
import { RHYTHM_NUDGE } from '../../src/shared/philosophy.js';
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
import { fieldShape } from '../../src/server/friction.js';
import { problemClass } from '../../src/server/friction.js';
import { agentType } from '../../src/server/agents.js';
import type { ToastRecord } from '../../src/shared/viewer-experience.js';
import type { ViewerPresence } from '../../src/shared/viewer-experience.js';
import { operationRequest } from '../mcp/requests.js';
import { operationId } from '../../src/server/mcp/operations.js';
import { DISCOVERY_TOOL_NAMES } from '../../src/server/mcp/operations.js';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Store } from '../../src/server/store.js';
import { DisplayHistory } from '../../src/server/display-history.js';
import type { VideoCommandRecord } from '../../src/server/video-controls.js';
import { RenderingError } from '../../src/server/rendering/errors.js';
import { createApp } from '../../src/server/app';
import { hash } from '../../src/server/auth';
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
import { navigationCapabilities } from '../../src/shared/navigation.js';
import { navigate } from '../../src/shared/navigation.js';
import { initialNavigation } from '../../src/shared/navigation.js';
import { validationIssues } from '../../src/server/input-errors.js';
import { redactDeliveryRequest } from '../../src/server/delivery-telemetry.js';
import { deliveryIngress } from '../../src/server/delivery-telemetry.js';
import { recordDeliveryRequest } from '../../src/server/delivery-telemetry.js';
import { readingDefaults } from '../../src/shared/reading.js';
import { liveSurfaceLayout } from '../../src/shared/live-surface.js';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { REPORT_CREATE_BYTES } from '../../src/shared/reports.js';
import { REPORT_DESCRIPTION_MAX } from '../../src/shared/reports.js';
import type { ReportPage } from '../../src/shared/reports.js';
import type { ReportRecord } from '../../src/shared/reports.js';
import type { SessionRecord } from '../../src/shared/types.js';
import { GUIDE_TOPICS } from '../../src/server/mcp/guide.js';
import { MCP_TOOLS } from '../../src/server/mcp/catalog.js';
import { readFileSync } from 'node:fs';
import { validateMedia } from '../../src/server/rendering/media.js';

describe("application contracts coverage 1", () => {


describe("application contracts contracts",()=>{
  let h!:Harness,owner:Browser,s:string,d:string,p:AuthPrincipal;
  const path=()=>`/api/sessions/${s}/displays/${d}`;
  const call=async <T=Record<string,unknown>>(name:string,args:unknown)=>(await h.runtime.service.execute(name,args,p)) as Promise<T>;
  const current=async()=> (await owner.detail(s)).displays.find(x=>x.id===d)!;
  const settle=async(update:UpdateRecord)=>owner.settle(s,update.requestId);
  beforeEach(async()=>{h=await startHarness();owner=await h.account();s=(await owner.session()).id;d=(await owner.display(s)).id;p={userId:owner.user!.id};});
  afterEach(async()=>{await h?.close();});
  async function guest(interactive:boolean){
    const share=await call<{id:string}>('kanvas_share_create',{sessionId:s,displayId:d,allowInteraction:interactive});const g=h.browser();
    const pair=success(await g.request<{id:string}>('POST','/api/pairings',{shareId:share.id,deviceName:'Evening test screen',requestedInteractive:interactive}));
    await call('kanvas_pairing_decide',{sessionId:s,pairingId:pair.id,approve:true,confirm:true,interactive});success(await g.request('GET',`/api/pairings/${pair.id}/status`));g.csrf=success(await g.request<{csrfToken:string}>('GET','/api/auth/me')).csrfToken;return g;
  }
  it('creates an on-screen QR exactly once for concurrent and later identical retries',async()=>{
    const args={sessionId:s,displayId:d,requestId:randomUUID(),expectedRevision:0,showOnDisplay:true,label:'Join the room'};
    const [first,again]=await Promise.all([call<{id:string;url:string;qrAssetId:string;update:UpdateRecord}>('kanvas_share_create',args),call<{id:string}>('kanvas_share_create',args)]);expect(first.id).toBe(again.id);await settle(first.update);
    expect((await current()).view).toMatchObject({template:'join',data:{url:new URL(first.url).pathname,label:'Join the room'}});expect((await h.runtime.store.list('share',s))).toHaveLength(1);expect((await h.runtime.store.list('asset',s))).toHaveLength(1);
    expect(await call('kanvas_share_create',args)).toEqual(first);await expect(call('kanvas_share_create',{...args,label:'Different'})).rejects.toMatchObject({code:'REQUEST_ID_CONFLICT'});
    const g=await guest(false);expect((await g.raw(`/api/assets/${first.qrAssetId}`)).status).toBe(200);
  });});
});

describe("application contracts coverage 2", () => {

let h!:Harness;
afterEach(async()=>{await h?.close();});
describe('cross-device sign-in approval',()=>{
  async function setup(){const links:string[]=[];h=await startHarness({signinMailer:async(_email,link)=>{links.push(link);}});const origin=h.browser(),phone=h.browser();const pending=success(await origin.request<{code:string}>('POST','/api/auth/email/request',{email:'cross-device@example.com'}));const token=new URL(links.at(-1)!).hash.split('=')[1];return {origin,phone,pending,token,links};}
  it('opening/inspecting does not authorize either browser; explicit match approves only cookie-bound origin, once',async()=>{
    const {origin,phone,pending,token}=await setup();
    const detail=success(await phone.request<{originatingDevice:{code:string;device:string;createdAt:string}}> ('POST','/api/auth/email/inspect',{token}));
    expect(detail.originatingDevice.code===pending.code).toBe(true);expect(detail.originatingDevice.device).toBeTruthy();expect(Date.parse(detail.originatingDevice.createdAt)).toBeGreaterThan(0);
    denied(await origin.request('GET','/api/auth/me'),[401]);denied(await phone.request('GET','/api/auth/me'),[401]);denied(await origin.request('POST','/api/auth/email/complete',{}),[410]);
    denied(await phone.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14',target:'origin'}),[400]);
    success(await phone.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14',target:'origin',matchesCode:true}));
    denied(await phone.request('GET','/api/auth/me'),[401]);denied(await phone.request('POST','/api/auth/email/complete',{}),[410]);
    expect(success(await origin.request('GET','/api/auth/email/status'))).toEqual({status:'approved'});
    const signed=success(await origin.request<{user:{username:string}}>('POST','/api/auth/email/complete',{}));expect(signed.user.username).toBe('cross-device@example.com');
    denied(await origin.request('POST','/api/auth/email/complete',{}),[410]);denied(await phone.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14'}),[410]);
  });
  it('denial consumes the link and cannot issue either session',async()=>{
    const {origin,phone,token}=await setup();success(await phone.request('POST','/api/auth/email/deny',{token}));
    expect(success(await origin.request('GET','/api/auth/email/status'))).toEqual({status:'denied'});
    denied(await phone.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14',target:'origin',matchesCode:true}),[410]);denied(await origin.request('POST','/api/auth/email/complete',{}),[410]);denied(await phone.request('POST','/api/auth/email/deny',{token}),[410]);
    expect(await h.runtime.store.list('browser')).toHaveLength(0);
  });
  it('expires before approval and after approval, and refuses stale completion',async()=>{
    const {origin,phone,token}=await setup();for(const c of await h.runtime.store.list<any>('email-challenge'))await h.runtime.store.put('email-challenge',{...c,expiresAt:Date.now()-1});
    denied(await phone.request('POST','/api/auth/email/inspect',{token}),[410]);denied(await phone.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14'}),[410]);
    for(const p of await h.runtime.store.list<any>('email-pending'))await h.runtime.store.put('email-pending',{...p,status:'approved',userId:'not-a-real-user',expiresAt:Date.now()-1});
    denied(await origin.request('POST','/api/auth/email/complete',{}),[410]);expect(success(await origin.request('GET','/api/auth/email/status'))).toEqual({status:'expired'});
  });
  it('serializes duplicate approvals and rejects cross-origin approval or completion',async()=>{
    const {origin,phone,token}=await setup();
    denied(await phone.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14',target:'origin',matchesCode:true},{origin:'https://attacker.invalid'}));
    const results=await Promise.all([1,2].map(()=>phone.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14',target:'origin',matchesCode:true})));expect(results.map(r=>r.status).sort()).toEqual([200,410]);
    denied(await origin.request('POST','/api/auth/email/complete',{}, {origin:'https://attacker.invalid'}));success(await origin.request('POST','/api/auth/email/complete',{}));
  });});
});

describe("application contracts coverage 3", () => {

const toastSchema=experienceTools.find(t=>t.name==='kanvas_toast')!.schema;
it('retains real API mutations and failures but suppresses read/observation/auth polling completions',()=>{
 for(const operation of ['POST /api/sessions/:id/assets','POST /api/sessions/:id/datasets','PATCH /api/preferences','POST /api/sessions/:id/displays/:displayId/toasts/dismiss','POST /api/devices/register'])expect(recordHttpOperation('api',200,operation),operation).toBe(true);
 for(const operation of ['GET /api/sessions/:id','POST /api/diagnostics','POST /api/sessions/:id/displays/:displayId/observe','POST /api/sessions/:id/displays/:displayId/navigation/viewport','POST /api/devices/:deviceId/windows/:windowId/report']){expect(recordHttpOperation('api',200,operation),operation).toBe(false);expect(recordHttpOperation('api',500,operation),operation).toBe(true);}
 for(const operation of ['GET /api/auth/me','POST /api/auth/activity','GET /api/auth/email/status','POST /api/auth/email/connection-status']){expect(recordHttpOperation('account',200,operation)).toBe(false);expect(recordHttpOperation('account',401,operation)).toBe(true);}
 expect(recordHttpOperation('account',200,'POST /api/auth/email/consume')).toBe(true);expect(recordHttpOperation('agent',200,'POST /mcp')).toBe(true);
});
});

describe("application contracts coverage 4", () => {


describe('06ee64d1 JSON raw view and tool call details; other new templates',()=>{
 it('raw is the default; pretty printing changes only whitespace and keeps exact tokens',()=>{
  expect(jsonDataSchema.parse({json:'{}'}).view).toBe('raw');expect(jsonDataSchema.parse({json:'{}',view:'tree'}).view).toBe('tree');
  const source='{"exact":9007199254740993,"price":1.10,"text":"a, b: {c} [d] \\" e","list":[1,{"k":null},[]],"empty":{},"t":true}';
  const pretty=prettyJson(source);
  expect(pretty.replace(/\s+/g,'')).toBe(source.replace(/\s+/g,''));expect(pretty).toContain('9007199254740993');expect(pretty).toContain('1.10');
  expect(pretty.split('\n')).toEqual(['{','  "exact": 9007199254740993,','  "price": 1.10,','  "text": "a, b: {c} [d] \\" e",','  "list": [','    1,','    {','      "k": null','    },','    []','  ],','  "empty": {},','  "t": true','}']);
  expect(jsonPathLine(pretty,'$')).toBe(1);expect(jsonPathLine(pretty,'$.price')).toBe(3);expect(jsonPathLine(pretty,'$.list')).toBe(5);expect(jsonPathLine(pretty,'$.list[0]')).toBe(6);expect(jsonPathLine(pretty,'$.list[1].k')).toBe(8);expect(jsonPathLine(pretty,'$.list[2]')).toBe(10);expect(jsonPathLine(pretty,'$.t')).toBe(13);expect(jsonPathLine(pretty,'$.missing')).toBeUndefined();
  expect(jsonPathLine(prettyJson('[{"a":1},{"a":2}]'),'$[1].a')).toBe(6);
 });
 it('welcome carries the founder\'s invitation by default; every new sample validates',()=>{
  expect(validateView({template:'welcome',data:{}} as never).data).toEqual({line:HUMAN_INVITATION.line,examples:[...HUMAN_INVITATION.examples]});
  expect(HUMAN_INVITATION.line).toBe('Your agent can show things here while you talk.');expect(HUMAN_INVITATION.examples).toHaveLength(3);
  for(const template of ['task-list','colour','icon-picker','font-picker','tool-call-details','agents','welcome'] as const)expect(validateView(samples[template]).template).toBe(template);
  expect(()=>validateView({template:'icon-picker',data:{icons:[{set:'lucide',name:'https://evil.example/x.svg'}]}} as never)).toThrow();
  expect(()=>validateView({template:'font-picker',data:{mode:'samples',fonts:[{family:'https://evil.example',weight:400}]}} as never)).toThrow();
  expect(()=>validateView({template:'font-picker',data:{mode:'pairings',fonts:[{family:'inter'}]}} as never)).toThrow();expect(()=>validateView({template:'font-picker',data:{mode:'samples'}} as never)).toThrow();
 });});
});

describe("application contracts coverage 5", () => {


const context={principal:{userId:'catalog-reader'}};
const search=(kind:'tool'|'template'|'help',query:string,limit=3)=>(discoveryCatalog.query(kind,'search',{query,limit},context).results as {id:string;description:string;example?:unknown}[]);

describe('6d119fd6 / aa19719e / ffc47785 / f7374ccd: the catalog exposes the shape and the right entry',()=>{
 it('search hits carry a minimal example that validates on the first try',()=>{
  const hits=search('template','ordered list of things to buy',5);expect(hits.length).toBeGreaterThan(0);
  for(const hit of hits){expect(hit.example,hit.id).toBeTruthy();expect(templateViewSchema(hit.id.slice('kanvas.template.'.length) as TemplateId).safeParse(hit.example).success,hit.id).toBe(true);}
  for(const template of TEMPLATE_IDS){const example=minimalExample(template);expect(templateViewSchema(template).safeParse(example).success,template).toBe(true);}
  const list=minimalExample('list') as {data:{items:unknown[]}};expect(JSON.stringify(list).length).toBeLessThan(500);
  const tool=search('tool','tick one checklist item',5).find(hit=>hit.id==='kanvas.checklist.update');expect(tool?.example).toMatchObject({operationId:'kanvas.checklist.update'});
 });
 it('register is findable as create, add, new and second screen; list filters by prefix',()=>{
  for(const query of ['display create','add a second display to the session','new display','another screen','put this on a second screen'])expect(search('tool',query,3).map(hit=>hit.id),query).toContain('kanvas.display.register');
  const listed=discoveryCatalog.query('tool','list',{prefix:'kanvas.display.'},context).results as {id:string}[];
  expect(listed.map(x=>x.id)).toContain('kanvas.display.register');expect(listed.every(x=>x.id.startsWith('kanvas.display.'))).toBe(true);
  expect(search('help','multiple displays',3)[0].id).toBe('kanvas.help.displays');expect(search('help','two screens',3).map(hit=>hit.id)).toContain('kanvas.help.displays');
  expect(manageMap().displays.change).toContain('kanvas.display.register');
 });
 it('what is kanvas / how do I use this / philosophy / design land on the philosophy entries',()=>{
  for(const query of ['what is kanvas','how do I use this','what can you show','philosophy'])expect(search('help',query,2)[0].id,query).toBe('kanvas.help.philosophy');
  for(const query of ['design principles for custom html','style look theme css'])expect(search('help',query,3).map(hit=>hit.id),query).toContain('kanvas.help.design-philosophy');
  expect(HELP_PAGES.philosophy.steps[0]).toBe(MISSION[0]);expect(MISSION[0].startsWith('Kanvas is your agent\'s screen.')).toBe(true);expect(MISSION[2]).toContain('with the shortest time to clarity.');
  expect(HELP_PAGES['design-philosophy'].steps.join(' ')).toMatch(/never navigation chrome/);expect(HELP_PAGES['design-philosophy'].steps.join(' ')).toMatch(/never override an explicit request/);
  expect(profileInstructions('discovery').startsWith(AGENT_CONDUCT)).toBe(true);
  expect(helpCatalog().some(item=>item.id==='kanvas.help.manage')).toBe(true);
 });});
});

describe("application contracts coverage 6", () => {


describe("application contracts contracts", () => {
  let h!:Harness, owner: Browser, sessionId: string, displayId: string;
  const path = () => `/api/sessions/${sessionId}/displays/${displayId}`;
  beforeEach(async () => { h = await startHarness(); owner = await h.account(); sessionId = (await owner.session()).id; displayId = (await owner.display(sessionId)).id; });
  afterEach(async () => { await h?.close(); });
  const current = async () => (await owner.detail(sessionId)).displays.find(display => display.id === displayId)!;
  const publish = async (view: ViewSpec) => { await owner.submit(sessionId, [displayId], view); return current(); };
  const respond = async (browser: Browser, value: Record<string, unknown>, revision: number, requestId = randomUUID()) => browser.request<InteractionRecord>('POST', `${path()}/respond`, { value, revision, requestId });
  const addViewer = async () => { const viewer = await h.account(); success(await owner.request('POST', `/api/sessions/${sessionId}/members`, { username: viewer.user!.username, role: 'viewer' })); return viewer; };
  const navigate = async (direction: 'back'|'forward', displays: DisplayRecord[]) => owner.request<UpdateRecord>('POST', `/api/sessions/${sessionId}/navigate`, { direction, displayIds: displays.map(d => d.id), expectedRevisions: Object.fromEntries(displays.map(d => [d.id, d.revision])), requestId: randomUUID() });

  it('sends checkbox changes through the durable inbox, with a stable replay and stale-edit protection', async () => {
    const display = await publish({version: 1, template: 'checklist', data: {items: [{id: 'a', text: 'A real checkbox', checked: false}]}});
    const viewer = await addViewer(), requestId = randomUUID(), value = {kind: 'checklist.toggle', itemId: 'a', checked: true};
    const first = success(await respond(viewer, value, display.revision, requestId));
    const replay = success(await respond(viewer, value, display.revision, requestId));
    expect(replay.id).toBe(first.id); expect(first.actionId).toBe('checklist.toggle');
    expect(first.status).toBe('pending');
    expect((await current()).view?.data.items).toMatchObject([{id: 'a', checked: true}]);
    expect((await respond(viewer, {...value, checked: false}, display.revision)).status).toBe(409);
    expect((await owner.detail(sessionId)).interactions).toHaveLength(1);
  });

  it('validates form values against actual fields, preserves exact strings, and keeps responses private', async () => {
    const display = await publish({version: 1, template: 'form', data: {fields: [{id: 'name', type: 'text', label: 'Name', required: true, maxLength: 40}, {id: 'score', type: 'range', label: 'Score', min: 0, max: 10, step: 2}, {id: 'agree', type: 'checkbox', label: 'Agree', required: true}]}});
    const viewer = await addViewer(), other = await addViewer();
    expect((await respond(viewer, {kind: 'form.submit', values: {name: '  ', agree: true}}, display.revision)).status).toBe(400);
    expect((await respond(viewer, {kind: 'form.submit', values: {name: 'Exact', score: 3, agree: true}}, display.revision)).status).toBe(400);
    expect((await respond(viewer, {kind: 'form.submit', values: {name: 'Exact', agree: false}}, display.revision)).status).toBe(400);
    expect((await respond(viewer, {kind: 'form.submit', values: {name: 'Exact', agree: true, hidden: 'No'}}, display.revision)).status).toBe(400);
    const response = success(await respond(viewer, {kind: 'form.submit', values: {name: '  Preserve spaces  ', score: 4, agree: true}}, display.revision));
    expect(response.value).toEqual({name: '  Preserve spaces  ', score: 4, agree: true});
    const mine = success(await viewer.request<{displays: DisplayRecord[]}>('GET', `/api/sessions/${sessionId}?displayId=${displayId}`));
    expect(mine.displays[0].responseState?.form?.submitted).toBe(true);
    const theirs = await other.detail(sessionId);
    expect(theirs.interactions).toHaveLength(0); expect(theirs.displays[0].responseState?.form?.submitted).toBe(false);
    expect(JSON.stringify(theirs)).not.toContain('Preserve spaces');
  });

  it('derives poll counts from actual identities, hides aggregates before reveal, and rejects invented totals', async () => {
    const display = await publish({version: 1, template: 'poll', data: {question: 'Choose', options: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}]}});
    const viewer = await addViewer(), other = await addViewer();
    const first = success(await respond(viewer, {kind: 'poll.vote', optionIds: ['a']}, display.revision)); expect(first.actionId).toBe('poll.vote');
    success(await respond(viewer, {kind: 'poll.vote', optionIds: ['b']}, display.revision));
    success(await respond(other, {kind: 'poll.vote', optionIds: ['a']}, display.revision));
    const hidden = (await viewer.detail(sessionId)).displays[0].responseState!.poll!;
    expect(hidden).toEqual({revealed: false, selectedOptionIds: ['b']});
    expect((await viewer.detail(sessionId)).interactions.every(item => item.userId === viewer.user!.id)).toBe(true);
    const reveal = success(await owner.request<DisplayRecord>('PATCH', `${path()}/view`, {expectedRevision: display.revision, data: {...display.view!.data, revealResults: true}}));
    expect(reveal.responseState!.poll).toMatchObject({revealed: true, totalVotes: 2, counts: {a: 1, b: 1}});
    expect((await owner.request('PATCH', `${path()}/view`, {expectedRevision: reveal.revision, data: {...reveal.view!.data, counts: {a: 2000}}})).status).toBe(400);
    expect((await respond(viewer, {kind: 'poll.vote', optionIds: ['absent']}, reveal.revision)).status).toBe(400);
    success(await owner.request('PATCH', `${path()}/view`, {expectedRevision: reveal.revision, data: {...reveal.view!.data, closed: true}}));
    expect((await respond(viewer, {kind: 'poll.vote', optionIds: ['a']}, (await current()).revision)).status).toBe(409);
  });

  it('bounds poll resubmission rate even though one identity owns only one active ballot', async () => {
    const display = await publish({version: 1, template: 'poll', data: {question: 'Choose', options: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}]}});
    for (let index = 0; index < 10; index++) success(await respond(owner, {kind: 'poll.vote', optionIds: [index % 2 ? 'a' : 'b']}, display.revision));
    expect((await respond(owner, {kind: 'poll.vote', optionIds: ['a']}, display.revision)).status).toBe(429);
  });});
});

describe("application contracts coverage 7", () => {

describe("application contracts contracts",()=>{
 let h!:Harness,owner:Browser,s:string,d:string,p:AuthPrincipal;
 const send=vi.fn(async(_subscription:unknown,_payload:string)=>({statusCode:201}));
 beforeEach(async()=>{send.mockClear();h=await startHarness({pushOptions:{publicKey:'test-public-key',privateKey:'test-private-key',subject:'mailto:test@example.invalid',send}});owner=await h.account();s=(await owner.session()).id;d=(await owner.display(s)).id;p={userId:owner.user!.id};});
 afterEach(async()=>{await h?.close();});
 async function deck(){const result=await owner.submit(s,[d],{version:1,template:'flashcards',data:{mode:'test',cards:[{id:'hola',prompt:'hola',answer:'hello',acceptedAnswers:['hi']},{id:'adios',prompt:'adiós',answer:'goodbye'}]}});expect(result.update.status).toBe('prepared');return result.detail.displays.find(x=>x.id===d)!;}
 it('keeps exact grading distinct from self-assessment and ungraded responses',()=>{
  const data=flashcardDataSchema.parse({cards:[{id:'c',prompt:'Question',answer:'yes'}]});
  const base={sessionId:s,displayId:d,deckId:'deck',expectedRevision:0,expectedDeckRevision:0,requestId:'answer',cardId:'c',action:'answer',response:'a semantic paraphrase'};
  expect(advanceFlashcards(data,flashcardControlSchema.parse(base)).responses[0].result).toBe('incorrect');
  expect(advanceFlashcards(data,flashcardControlSchema.parse({...base,grading:'none'})).responses[0].result).toBe('ungraded');
  expect(advanceFlashcards(data,flashcardControlSchema.parse({...base,grading:'self',correct:true})).responses[0]).toMatchObject({result:'correct',grading:'self'});
 });
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/inert',keys:{p256dh:'B'.repeat(87),auth:'A'.repeat(22)}};});
});

describe("application contracts coverage 8", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});

describe('composable charts',()=>{
 const source={kind:'bar',series:[{name:'A',points:[{x:'Mon',y:20},{x:'Tue',y:-5}]},{name:'B',points:[{x:'Mon',y:30},{x:'Tue',y:-10}]}]};
 it('stacks signed values on independent positive/negative baselines and preserves raw totals',()=>{const model=stackChart(chartDataSchema.parse({...source,stacking:'stacked',showTotals:true}));expect(model.series[1][0]).toMatchObject({start:20,end:50,total:50});expect(model.series[1][1]).toMatchObject({start:-5,end:-15,total:-15});expect(source.series[1].points[0].y).toBe(30);});});
});

describe("application contracts coverage 9", () => {

let h!:Harness;
afterEach(async()=>{delete process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT;await h?.close();});
describe('idle receiver registration',()=>{
 it('registers an idle root at quota without creating Home, while a new session still fails honestly',async()=>{
  process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT='1';h=await startHarness();
  // Existing pre-entry account: auth record without signup Home provisioning.
  const user=await h.runtime.auth.register({username:'idle_'+randomUUID().slice(0,8),password:randomUUID()});
  const browser=await h.runtime.auth.issueBrowser(user.id,{cookie:()=>{}} as unknown as Response),p={userId:user.id,browserId:browser.id};
  await h.runtime.service.createSession(p,'Existing work');
  const device=await h.runtime.service.devices.register(p,{installationId:'quota-root',provisionHome:false},'Mozilla/5.0');expect(device.home).toBeUndefined();
  expect((await h.runtime.service.sessions(p))).toHaveLength(1);expect(await h.runtime.store.get('account-entry',p.userId)).toBeUndefined();
  const window=await h.runtime.service.devices.windows.register(p,device.id,'root-tab'),stream=await h.runtime.service.devices.windows.stream(p,device.id,window.id,()=>{});await stream.push();
  try{const topology=await h.runtime.service.topology.acrossSessions(p,{});if(!('availableWindows' in topology))throw new Error('Expected account-wide topology');expect(topology.availableWindows).toContainEqual(expect.objectContaining({windowId:window.id,connected:true,current:null}));await expect(h.runtime.service.beginSession(p,{name:'No remaining quota',requestId:'quota-begin'})).rejects.toMatchObject({code:'SESSION_LIMIT_REACHED'});}finally{stream.close();}
  // Navigating an existing idle receiver to a viewer must not force Home later.
  expect((await h.runtime.service.devices.register(p,{installationId:'quota-root'},'Mozilla/5.0')).home).toBeUndefined();
  expect((await h.runtime.service.sessions(p))).toHaveLength(1);
 });});
});

describe("application contracts coverage 10", () => {


describe("application contracts contracts",()=>{
  let h!:Harness,owner:Browser,sessionId:string,displayId:string,p:AuthPrincipal;
  const path=()=>`/api/sessions/${sessionId}/displays/${displayId}`;
  const call=async (name:string,args:unknown)=>(await h.runtime.service.execute(name,args,p));
  beforeEach(async()=>{h=await startHarness();owner=await h.account();sessionId=(await owner.session()).id;displayId=(await owner.display(sessionId)).id;p={userId:owner.user!.id};});
  afterEach(async()=>{await h?.close();});
  it('owner-agent approval remains browser-bound and contribution stays explicit',async()=>{
    const share=await call('kanvas_share_create',{sessionId,displayId,allowInteraction:true}) as {id:string;qrAssetId:string;url:string};expect(share.qrAssetId).toBeTruthy();
    const guest=h.browser();const pair=success(await guest.request<{id:string}>('POST','/api/pairings',{shareId:share.id,deviceName:'Test screen',requestedInteractive:true}));
    const stranger=await h.account();await expect(h.runtime.service.execute('kanvas_pairing_decide',{sessionId,pairingId:pair.id,approve:true,confirm:true},{userId:stranger.user!.id})).rejects.toBeTruthy();
    await call('kanvas_pairing_decide',{sessionId,pairingId:pair.id,approve:true,interactive:true,confirm:true});
    denied(await h.browser().request('GET',`/api/pairings/${pair.id}/status`),[401]);
    success(await guest.request('GET',`/api/pairings/${pair.id}/status`));const me=success(await guest.request<{csrfToken:string;interactive:boolean}>('GET','/api/auth/me'));guest.csrf=me.csrfToken;expect(me.interactive).toBe(true);
    denied(await guest.request('PATCH','/api/preferences',{expectedRevision:0,config:{style:'iris'}}));
    denied(await guest.request('PATCH',`${path()}/view`,{expectedRevision:0,data:{text:'No full edit grant'}}));
  });});

describe('email-confirmed sign-in',()=>{
  let h!:Harness;afterEach(async()=>{await h?.close();});
  it('uses a one-time hashed challenge, confirms email, rotates login, and blocks replay and cross-origin use',async()=>{
    let delivered='';h=await startHarness({signinMailer:async(_email,link)=>{delivered=link;}});const guest=h.browser();
    success(await guest.request('POST','/api/auth/email/request',{email:'verified@example.com',returnTo:'//outside.example'}));
    const token=new URL(delivered).hash.split('=')[1];expect(Boolean(token)).toBe(true);expect(JSON.stringify((await h.runtime.store.list('email-challenge'))).includes(token)).toBe(false);
    denied(await guest.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14'},{origin:'https://attacker.example'}));
    const result=success(await guest.request<{returnTo:string;user:{id:string;username:string};csrfToken:string}>('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14'}));
    expect(result.returnTo).toBe('/');expect(result.user.username).toBe('verified@example.com');expect((await h.runtime.store.get('verified-email',result.user.id))).toBeTruthy();
    expect((await guest.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14'})).status).toBe(410);
    expect((await guest.request('POST','/api/auth/register',{username:'bypass',password:'not-a-real-credential'})).status).toBe(403);
  });
  it('keeps hosted registration closed and gives an ineligible address a generic response without mail',async()=>{
    let deliveries=0;h=await startHarness({allowRegistration:false,signinMailer:async()=>{deliveries++;}});const guest=h.browser();
    const result=success(await guest.request<{requested:boolean}>('POST','/api/auth/email/request',{email:'unknown@example.com'}));expect(result.requested).toBe(true);expect(deliveries).toBe(0);expect((await h.runtime.store.list('email-challenge'))).toHaveLength(0);
  });});
});

describe("application contracts coverage 11", () => {

// 2026-11-10 (0875e953): guidance and orientation blocks are conditional by default. These tests verify the
// content and isolation of the full blocks, which are sent on every response under the declared 'full' preference.
const priorGuidanceDefault=process.env.KANVAS_GUIDANCE_DEFAULT;
beforeAll(()=>{process.env.KANVAS_GUIDANCE_DEFAULT='full';});
afterAll(()=>{if(priorGuidanceDefault===undefined)delete process.env.KANVAS_GUIDANCE_DEFAULT;else process.env.KANVAS_GUIDANCE_DEFAULT=priorGuidanceDefault;});

interface Result { isError?:boolean; structuredContent?:{ data?:unknown; truncated?:boolean; orientation?:Record<string,unknown>; error?:{code:string;message:string;schemaTool?:string;topic?:string;issues?:{path:string;maximum?:number;actual?:number;unit?:string}[]} } }
function value<T>(r:Result):T {expect(r.isError).not.toBe(true);expect(r.structuredContent?.truncated).not.toBe(true);return r.structuredContent!.data as T;}
function invalid(r:Result) {expect(r.isError).toBe(true);expect(r.structuredContent?.error?.code).toBe('INVALID_ARGUMENT');return r.structuredContent!.error!;}

describe.each(['modern','legacy'] as const)("application contracts contracts",protocol=>{
  let h!:Harness;
  const clients:(Client|LegacyClient)[]=[];
  beforeEach(async()=>{h=await startHarness();});
  afterEach(async()=>{await Promise.all(clients.splice(0).map(x=>x.close().catch(()=>{})));await h?.close();});
  async function connect(owner:Browser, sessions:string[]) {
    const credential=(await h.runtime.auth.issueToken(owner.user!.id,'Disposable September 13 acceptance',['read','publish'],sessions));
    const requestInit={headers:{Authorization:`Bearer ${credential.value}`}};
    const client=protocol==='modern'?new Client({name:'guide-acceptance',version:'1'},{versionNegotiation:{mode:'auto'}}):new LegacyClient({name:'guide-acceptance',version:'1'});
    clients.push(client);
    if(client instanceof Client)await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',h.baseUrl),{requestInit}));
    else await client.connect(new LegacyTransport(new URL('/mcp',h.baseUrl),{requestInit}));
    return {client,call:async(name:string,args:Record<string,unknown>={}):Promise<Result>=>await client.callTool(operationRequest({name,arguments:args})) as Result};
  }

  it('puts over-limit field, maximum and actual length in the error headline without reflecting input',async()=>{
    const owner=await h.account(),session=await owner.session(),p=await connect(owner,[session.id]);
    const marker=randomUUID(),description=marker+'x'.repeat(12001-marker.length);
    const e=invalid(await p.call('kanvas_error_report',{sessionId:session.id,requestId:'large',title:'Oversized',description}));
    expect(e.message).toContain('description');expect(e.message).toContain('12000');expect(e.message).toContain('12001');
    expect(e).toMatchObject({schemaTool:'kanvas_discover',topic:'feedback',issues:[{path:'description',maximum:12000,actual:12001,unit:'characters'}]});
    expect(JSON.stringify(e)).not.toContain(marker);
    const repaired=value<ReportRecord>(await p.call('kanvas_error_report',{sessionId:session.id,requestId:'large',title:'Oversized',description:'x'.repeat(12000)}));
    expect(repaired.description.length).toBe(12000);
    const byteError=invalid(await p.call('kanvas_feedback_submit',{sessionId:session.id,requestId:'bytes',title:'Control characters',description:'prefix'+'\u0001'.repeat(11000)}));
    expect(byteError.message).toContain('UTF-8');expect(byteError.message).toContain(String(REPORT_CREATE_BYTES));
    expect(byteError.issues?.[0].unit).toBe('bytes');expect(byteError.issues?.[0].actual).toBeGreaterThan(REPORT_CREATE_BYTES);
    expect(value<ReportPage>(await p.call('kanvas_reports_read',{sessionId:session.id})).reports).toHaveLength(1);
  });

  it('exposes the same richer limits and precise validation through the workspace HTTP API',async()=>{
    const owner=await h.account(),session=await owner.session();
    const r=await owner.request('POST',`/api/sessions/${session.id}/feedback`,{requestId:'http-over',title:'Description limit',description:'x'.repeat(12001)});
    expect(r.status).toBe(400);expect(r.error?.message).toMatch(/description.*12000.*12001/);
    const saved=success(await owner.request<ReportRecord>('POST',`/api/sessions/${session.id}/feedback`,{requestId:'http-over',title:'Description limit',description:'x'.repeat(12000)}));
    expect(saved.description.length).toBe(12000);
  });});
});

describe("application contracts coverage 12", () => {

let h!:Harness;const id=()=>randomUUID();afterEach(async()=>{await h?.close();});

it('existing public JSON polling really updates gauge samples without content regeneration and keeps the last valid value on failure',async()=>{
 let value=12,time=Date.now();h=await startHarness({monitoringOptions:{automatic:false,now:()=>time,fetcher:async()=>({statusCode:200,latencyMs:3,mimeType:'application/json',body:Buffer.from(JSON.stringify({value})),finalUrl:'https://example.com/sensor'})}});
 const a=await h.account(),s=await a.session(),d=await a.display(s.id),p={userId:a.user!.id},svc=h.runtime.service;
 const job=(await svc.monitoring.start(p,{sessionId:s.id,displayId:d.id,requestId:id(),expectedRevision:0,config:{mode:'json',url:'https://example.com/sensor',intervalSeconds:30,template:'chart',mapping:{kind:'gauge',gauge:{min:0,max:100},series:[{name:'Sensor',points:[{x:'Now',y:{$path:'/value'}}]}]}}}));
 await svc.monitoring.runDue();await expect.poll(async ()=>(((await svc.display(p,s.id,d.id)).view?.data.series as any)?.[0].points[0].y)).toBe(12);
 value=23;time+=31000;await svc.monitoring.runDue();await expect.poll(async ()=>(((await svc.display(p,s.id,d.id)).view?.data.series as any)?.[0].points[0].y)).toBe(23);
 value=101;time+=31000;await svc.monitoring.runDue();await expect.poll(async ()=>((await svc.monitoring.read(p,{sessionId:s.id,jobId:job.id})) as any).health.consecutiveFailures).toBe(1);expect(((await svc.display(p,s.id,d.id)).view!.data.series as any)[0].points[0].y).toBe(23);
});
});
