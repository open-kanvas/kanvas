import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import { fact } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { validationIssues } from '../../src/server/input-errors.js';
import { z } from 'zod';
import { gameDataSchema } from '../../src/shared/game.js';
import { createApp } from '../../src/server/app.js';
import { rawEvent } from '../../src/server/raw-events.js';
import { eventContext } from '../../src/server/raw-events.js';
import { KANVAS_VERSION } from '../../src/shared/version.js';
import { feedbackSubmitSchema } from '../../src/shared/reports.js';
import { experienceTools } from '../../src/server/mcp/experience-tools.js';
import { pairedDisplayAllowsAsset } from '../../src/server/access-flows.js';
import { parseDataset } from '../../src/server/rendering/datasets.js';
import { recordHttpOperation } from '../../src/server/raw-events.js';
import { denied } from './harness.js';
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
import { AGENT_CONDUCT } from '../../src/shared/philosophy.js';
import { MISSION } from '../../src/shared/philosophy.js';
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
import type { DisplayRecord } from '../../src/shared/types.js';
import type { InteractionRecord } from '../../src/shared/types.js';
import type { UpdateRecord } from '../../src/shared/types.js';
import type { ViewSpec } from '../../src/shared/types.js';
import { Store } from '../../src/server/store.js';
import { DisplayHistory } from '../../src/server/display-history.js';
import type { VideoCommandRecord } from '../../src/server/video-controls.js';
import { RenderingError } from '../../src/server/rendering/errors.js';
import { DEFAULT_AGENT_GUIDANCE } from '../../src/server/agent-guidance';
import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { chartDataSchema } from '../../src/shared/chart-contract';
import { stackChart } from '../../src/shared/chart-stacks';
import { visualHelp } from '../../src/server/visual-help';
import { HELP_TOPICS } from '../../src/shared/help';
import { PNG } from './harness.js';
import type { AuthPrincipal } from '../../src/server/auth.js';

describe("template contracts coverage 1", () => {


describe("template contracts contracts",()=>{

 it('suggests valid unknown-template alternatives without echoing arbitrary source',()=>{
  const value={version:1,template:'quick-fact',data:{text:'Secret source'}};
  try{validateView(value);throw Error('Expected invalid template');}catch(e){expect(e).toBeInstanceOf(z.ZodError);const issues=validationIssues(e as z.ZodError,'view',value);expect(JSON.stringify(issues)).toContain('Unknown template');expect(JSON.stringify(issues)).toContain('fact');expect(JSON.stringify(issues)).not.toContain('Secret source');}
 });
 it('accepts arbitrary QR text, keeps controls opt-in, rejects excessive UTF8',()=>{
  const view=validateView({template:'qr',data:{content:'WIFI:T:WPA;S:Example;P:secret;;',title:'Connect',text:'Scan here'}});expect(view.showControls).not.toBe(true);
  expect(()=>validateView({template:'qr',data:{content:'😀'.repeat(1000)}})).toThrow();
 });});
});

describe("template contracts coverage 2", () => {
    const toastSchema = experienceTools.find(t => t.name === "kanvas.toast")!.schema;
    it('accepts generic rich notices and legacy text, rejecting unsafe icons/oversized fields', () => {
        expect(toastSchema.safeParse({ sessionId: 's', displayIds: ['d'], text: 'Original' }).success).toBe(true);
        const base = { sessionId: 's', displayIds: ['d'], title: 'Sender', description: 'Notice', icon: 'https://example.com/icon.png', time: '2026-11-06T14:38:00Z' };
        expect(toastSchema.safeParse(base).success).toBe(true);
        for (const extra of [{ icon: 'javascript:alert(1)' }, { icon: 'http://127.0.0.1/a' }, { title: 'x'.repeat(161) }, { time: 'not-time' }, { type: 'gmail' }, { action: 'https://example.com' }])
            expect(toastSchema.safeParse({ ...base, ...extra }).success).toBe(false);
        expect(toastSchema.safeParse({ sessionId: 's', displayIds: ['d'] }).success).toBe(false);
    });
});

describe("template contracts coverage 3", () => {
    const context = { principal: { userId: 'catalog-reader' } };
    const search = (kind: 'tool' | 'template' | 'help', query: string, limit = 3) => (discoveryCatalog.query(kind, 'search', { query, limit }, context).results as {
        id: string;
        description: string;
        example?: unknown;
    }[]);
    describe('6d119fd6 / aa19719e / ffc47785 / f7374ccd: the catalog exposes the shape and the right entry', () => {
        it('every template says when a colleague would reach for it and carries everyday concepts', () => {
            for (const template of TEMPLATE_IDS) {
                const concept = TEMPLATE_CONCEPTS[template];
                expect(concept, template).toBeTruthy();
                expect(concept.when.length, template).toBeGreaterThan(40);
                expect(concept.also.split(' ').length, template).toBeGreaterThanOrEqual(3);
            }
            expect(TEMPLATE_CONCEPTS.math.when).toMatch(/splitting a bill/);
            expect(TEMPLATE_CONCEPTS.math.when).toMatch(/Kanvas only displays/);
            expect(TEMPLATE_CONCEPTS['seat-map'].when).toMatch(/Who sits where/);
        });
        it('probe set: the right template is within the top three for everyday phrasings (no embeddings)', () => {
            const engine = new LocalSearch(templateCatalog()), misses: string[] = [];
            for (const [query, expected] of SEARCH_PROBES) {
                const top = engine.search(query).slice(0, 3).map(row => row.document.id.slice('kanvas.template.'.length));
                if (!expected.some(template => top.includes(template)))
                    misses.push(`${query} -> ${top.join(', ')}`);
            }
            // Decision rule from the report: more than 3 misses of 20 would justify a local embedding model.
            expect(SEARCH_PROBES).toHaveLength(20);
            expect(misses, misses.join(' | ')).toHaveLength(0);
        });
        it('get returns a template\'s own shape; nested view slots are a reference unless expand is full', { timeout: 120000 }, () => {
            const own = discoveryCatalog.query('template', 'get', { id: 'kanvas.template.split-screen' }, context).entry as Record<string, unknown>;
            const full = discoveryCatalog.query('template', 'get', { id: 'kanvas.template.split-screen', expand: 'full' }, context).entry as Record<string, unknown>;
            const ownBytes = JSON.stringify(own).length, fullBytes = JSON.stringify(full).length;
            expect(ownBytes).toBeLessThan(16000);
            expect(fullBytes).toBeGreaterThan(ownBytes * 4);
            expect(JSON.stringify(own.schema)).toContain(VIEW_SLOT.properties.template.description);
            expect(own.nestedViews).toBeTruthy();
            expect(Object.keys(own).indexOf('example')).toBeLessThan(Object.keys(own).indexOf('schema'));
            expect(JSON.stringify(discoveryCatalog.query('template', 'get', { id: 'kanvas.template.presentation' }, context).entry).length).toBeLessThan(20000);
            // A template without nested views is unchanged by collapsing.
            const fact = discoveryCatalog.query('template', 'get', { id: 'kanvas.template.fact' }, context).entry as {
                schema: unknown;
                nestedViews?: unknown;
            };
            expect(fact.nestedViews).toBeUndefined();
            expect(collapseViewSlots({ type: 'object', properties: { a: { type: 'string' } } })).toEqual({ type: 'object', properties: { a: { type: 'string' } } });
        });
        it('error text names the expected format or the allowed values, and collapses repeats', async () => {
            let planner: unknown;
            try {
                validateView({ template: 'planner', data: { view: 'day', date: '2026-11-10', timeZone: 'Europe/Oslo', items: Array.from({ length: 9 }, (_, i) => ({ id: `i${i}`, title: `Item ${i}`, start: '09:00', end: '10:00' })) } });
            }
            catch (error) {
                planner = error;
            }
            const issues = safeError(planner).issues ?? [];
            expect(issues.length).toBeLessThan(9);
            const first = issues.find(issue => /ISO date-time with offset/.test(issue.problem));
            expect(first, JSON.stringify(issues).slice(0, 600)).toBeTruthy();
            expect(first!.problem).toMatch(/fields share this problem; first: /);
            expect(first!.count).toBeGreaterThanOrEqual(9);
            expect(collapseRepeatedIssues([{ path: 'a', problem: 'P' }, { path: 'b', problem: 'P' }])).toHaveLength(2);
            expect(collapseRepeatedIssues(Array.from({ length: 27 }, (_, i) => ({ path: `items[${i}].start`, problem: 'Expected ISO.' })))).toEqual([expect.objectContaining({ path: 'items[0].start', count: 27 })]);
        });
    });
    describe('server behaviour behind the exposure reports', () => {
        let h!: Harness, o: Browser, s: string, d: string, p: {
            userId: string;
            agentId?: string;
            tokenId?: string;
        };
        beforeEach(async () => { delete process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT; h = await startHarness(); o = await h.account(); s = (await o.session()).id; d = (await o.display(s)).id; p = { userId: o.user!.id }; });
        afterEach(async () => { delete process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT; await h?.close(); });
        const call = (name: string, args: Record<string, unknown> = {}, principal = p) => h.runtime.service.execute(name, args, principal) as Promise<any>;
        /** A real connection: its token exists, so account checks pass exactly as for an MCP client. */
        const agentPrincipal = async (name: string) => { const { token } = await h.runtime.auth.issueToken(p.userId, name, ['read', 'publish']); return { userId: p.userId, agentId: token.agentId, tokenId: token.id }; };
        it('6d119fd6: long prose without a template returns needs_template and publishes nothing; a short sentence is still a fact', async () => {
            const prose = 'Show the four phases of how an agent uses Kanvas as a flow, left to right. First the agent discovers the templates. Then it publishes a view. Then the person reacts. Finally the agent patches the view in place.';
            expect(prose.length).toBeGreaterThan(FACT_CONTEXT_MAX);
            expect(needsTemplate({ context: prose })).toBe(true);
            expect(needsTemplate({ context: prose, templateHint: 'fact' })).toBe(false);
            expect(needsTemplate({ context: 'Short sentence.' })).toBe(false);
            const before = (await o.detail(s)).displays[0].revision;
            const result = await call("kanvas.submit", { requestId: randomUUID(), sessionId: s, displayIds: [d], intent: 'four phases as a left to right flow diagram', context: prose });
            expect(result).toMatchObject({ status: 'needs_template', published: false });
            expect(result.candidates).toHaveLength(3);
            expect(result.candidates.map((c: {
                template: string;
            }) => c.template)).toContain('flowchart');
            for (const candidate of result.candidates)
                expect(templateViewSchema(candidate.template).safeParse(candidate.example).success, candidate.template).toBe(true);
            const after = (await o.detail(s)).displays[0];
            expect(after.revision).toBe(before);
            expect(after.view).toBeNull();
            const short = await call("kanvas.submit", { requestId: randomUUID(), sessionId: s, displayIds: [d], context: 'Kanvas is your agent\'s screen.' });
            expect(short.status).not.toBe('needs_template');
        });
    });
});

describe("template contracts coverage 4", () => {
    describe("template contracts contracts", () => {
        let h!: Harness, owner: Browser, sessionId: string, displayId: string;
        const path = () => `/api/sessions/${sessionId}/displays/${displayId}`;
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); sessionId = (await owner.session()).id; displayId = (await owner.display(sessionId)).id; });
        afterEach(async () => { await h?.close(); });
        const current = async () => (await owner.detail(sessionId)).displays.find(display => display.id === displayId)!;
        const publish = async (view: ViewSpec) => { await owner.submit(sessionId, [displayId], view); return current(); };
        const respond = async (browser: Browser, value: Record<string, unknown>, revision: number, requestId = randomUUID()) => browser.request<InteractionRecord>('POST', `${path()}/respond`, { value, revision, requestId });
        const addViewer = async () => { const viewer = await h.account(); success(await owner.request('POST', `/api/sessions/${sessionId}/members`, { username: viewer.user!.username, role: 'viewer' })); return viewer; };
        const navigate = async (direction: 'back' | 'forward', displays: DisplayRecord[]) => owner.request<UpdateRecord>('POST', `/api/sessions/${sessionId}/navigate`, { direction, displayIds: displays.map(d => d.id), expectedRevisions: Object.fromEntries(displays.map(d => [d.id, d.revision])), requestId: randomUUID() });
        it('restores exact retained views without content regeneration, persists the timeline and cuts a forward branch', async () => {
            await publish(fact('Original 1.00000000000000000001'));
            await publish(fact('Second view'));
            const before = await current();
            expect(success(await navigate('back', [before])).status).toBe('prepared');
            const restored = await current();
            expect(restored.view?.data.text).toBe('Original 1.00000000000000000001');
            expect(restored.revision).toBeGreaterThan(before.revision);
            success(await navigate('forward', [restored]));
            expect((await current()).view?.data.text).toBe('Second view');
            success(await navigate('back', [await current()]));
            await publish(fact('New branch'));
            const history = success(await owner.request<{
                canGoForward: boolean;
                entries: {
                    title?: string;
                }[];
            }>('GET', `${path()}/history`));
            expect(history.canGoForward).toBe(false);
            expect((await navigate('forward', [await current()])).status).toBe(409);
            const stored = new Store(h.database);
            try {
                expect((await new DisplayHistory(stored).list((await current()))).canGoForward).toBe(false);
            }
            finally {
                (await stored.close());
            }
        });
        it('returns precise schema limits/enums through real MCP and losslessly imports JSON text', async () => {
            const issued = success(await owner.request<{
                token: string;
            }>('POST', '/api/tokens', { name: 'Feedback gate', scopes: ['read', 'publish'], sessionIds: [sessionId] }));
            const client = new Client({ name: 'feedback-gate', version: '1' });
            await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', h.baseUrl), { requestInit: { headers: { Authorization: `Bearer ${issued.token}` } } }));
            try {
                const tools = await client.listTools();
                expect(tools.tools.map(tool => tool.name)).toEqual(DISCOVERY_TOOL_NAMES);
                for (const name of ["kanvas.feedback.submit", "kanvas.error.report", "kanvas.display.snapshot", "kanvas.video.control", "kanvas.display.history"]) {
                    const result = await client.callTool({ name: 'kanvas_discover', arguments: { catalog: 'operations', action: 'get', id: operationId(name) } });
                    expect((result.structuredContent as any).data.entry.operationId).toBe(operationId(name));
                }
                const category = await client.callTool(operationRequest({
                    name: "kanvas_call",
                    arguments: {
                        operationId: "kanvas.feedback.submit",
                        arguments: {
                            sessionId, requestId: randomUUID(), title: 'Wrong category', description: 'Minimal report', category: 'bug'
                        }
                    }
                }));
                expect(category.isError).toBe(true);
                expect(JSON.stringify(category.structuredContent)).toContain('usability');
                const long = await client.callTool(operationRequest({
                    name: "kanvas_call",
                    arguments: {
                        operationId: "kanvas.submit",
                        arguments: {
                            sessionId, displayIds: [displayId], requestId: randomUUID(), intent: 'x'.repeat(1001)
                        }
                    }
                }));
                expect(long.isError).toBe(true);
                expect(JSON.stringify(long.structuredContent)).toContain('1000');
                const imported = await client.callTool(operationRequest({
                    name: "kanvas_call",
                    arguments: {
                        operationId: "kanvas.dataset.import",
                        arguments: {
                            sessionId, name: 'Exact', json: '[{"value":9007199254740993.123456789}]'
                        }
                    }
                }));
                expect(imported.isError).not.toBe(true);
                expect((imported.structuredContent as {
                    data: {
                        rows: unknown[];
                    };
                }).data.rows).toEqual([{ value: '9007199254740993.123456789' }]);
            }
            finally {
                await client.close();
            }
        });
    });
});

describe("template contracts coverage 5", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});
it('exposes distinct authorized organization/team/user/session only for explicit context',async()=>{
 h=await startHarness();const owner=await h.account(),other=await h.account(),p={userId:owner.user!.id},q={userId:other.user!.id},s=await owner.session(),g=h.runtime.service.guidance;
 const group=async(kind:string)=>success(await owner.request<any>('POST','/api/groups',{kind,name:kind,requestId:randomUUID()}));const org=await group('organization'),team=await group('team');
 success(await owner.request('POST',`/api/sessions/${s.id}/context`,{expectedRevision:0,organizationId:org.id,teamId:team.id}));
 for(const a of [{scope:'organization',groupId:org.id},{scope:'team',groupId:team.id},{scope:'session',sessionId:s.id}])await g.mutate(p,{...a,text:`${a.scope} guidance`,expectedRevision:0,requestId:randomUUID()},'set');
 const exposed=await g.exposure(p,{sessionId:s.id});expect(exposed?.levels.map(x=>x.scope)).toEqual(['organization','team','user','session']);
 expect((await g.exposure(p))?.levels.map(x=>x.scope)).toEqual(['user']);
 expect((await g.exposure(q,{groupId:org.id}))?.levels.map(x=>x.scope)).toEqual(['user']);
 await expect(g.read(q,{scope:'organization',groupId:org.id})).rejects.toThrow();
 await expect(g.mutate(q,{scope:'team',groupId:team.id,text:'malicious',expectedRevision:1,requestId:randomUUID()},'set')).rejects.toThrow();
});
});

describe("template contracts coverage 6", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});
it('native menu commands are own-screen only and signout needs a named confirmed viewer',async()=>{
 h=await startHarness();const owner=await h.account(),other=await h.account(),session=await owner.session(),display=await owner.display(session.id),p={userId:owner.user!.id},q={userId:other.user!.id},e=h.runtime.service.experience;
 const args={sessionId:session.id,displayId:display.id,requestId:'native-menu',action:'menu'};
 expect(await e.screenControl(p,args)).toMatchObject({action:'menu',status:'queued'});await expect(e.screenControl(q,{...args,requestId:'foreign'})).rejects.toThrow();
 await expect(e.screenControl(p,{...args,requestId:'logout',action:'signout'})).rejects.toThrow();
});
});

describe("template contracts coverage 7", () => {
    describe("template contracts contracts", () => {
        let h!: Harness, owner: Browser, sessionId: string, displayId: string, p: AuthPrincipal;
        const path = () => `/api/sessions/${sessionId}/displays/${displayId}`;
        const call = async (name: string, args: unknown) => (await h.runtime.service.execute(name, args, p));
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); sessionId = (await owner.session()).id; displayId = (await owner.display(sessionId)).id; p = { userId: owner.user!.id }; });
        afterEach(async () => { await h?.close(); });
        it('records per-tab observations and context withdrawal; rejects capture, cross-session and stale observations', async () => {
            await owner.submit(sessionId, [displayId], fact('Actual source'));
            const observation = { tabId: 'first-tab', revision: 1, renderedRevision: 1, status: 'ready', visible: true, text: 'Text read from browser', width: 800, height: 600, context: { consent: true, timeZone: 'Europe/Oslo', locationStatus: 'denied' } };
            const first = success(await owner.request<{
                viewerId: string;
            }>('POST', `${path()}/observe`, observation));
            success(await owner.request('POST', `${path()}/observe`, { ...observation, tabId: 'second-tab', context: null }));
            const records = await call("kanvas.viewers.read", { sessionId }) as ViewerPresence[];
            expect(records).toHaveLength(2);
            expect(records.filter(x => x.context)).toHaveLength(1);
            const inspect = await call("kanvas.display.inspect", { sessionId, displayId, fresh: false }) as {
                observations: {
                    description: string;
                }[];
            };
            expect(inspect.observations[0].description).toContain('Text read from browser');
            success(await owner.request('POST', `${path()}/observe`, { ...observation, context: null }));
            expect((await call("kanvas.viewers.read", { sessionId }) as ViewerPresence[]).every(x => x.context === null)).toBe(true);
            expect(success(await owner.request<{
                ignored: boolean;
            }>('POST', `${path()}/observe`, { ...observation, revision: 0 })).ignored).toBe(true);
            success(await owner.request('POST', `${path()}/observe`, { ...observation, sequence: 3, context: null }));
            expect(success(await owner.request<{
                ignored: boolean;
            }>('POST', `${path()}/observe`, { ...observation, sequence: 2 })).ignored).toBe(true);
            expect((await call("kanvas.viewers.read", { sessionId }) as ViewerPresence[]).every(x => x.context === null)).toBe(true);
            const foreign = await h.account();
            denied(await foreign.request('POST', `${path()}/observe`, observation));
            (await expect((async () => (await h.runtime.service.experience.observe({ ...p, browserId: 'capture', captureOnly: true }, sessionId, displayId, observation)))()).rejects.toThrow());
            const saved = (await h.runtime.store.get<ViewerPresence>('viewer', first.viewerId))!;
            saved.expiresAt = 0;
            (await h.runtime.store.put('viewer', saved));
            expect((await call("kanvas.viewers.read", { sessionId }) as ViewerPresence[])).toHaveLength(1);
        });
    });
});
