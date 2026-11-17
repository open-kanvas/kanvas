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
import { sharingLevel } from '../../src/server/account-overview.js';
import { HELP_PAGES as HELP } from '../../src/shared/help.js';
import { HELP_TOPICS } from '../../src/shared/help.js';
import { TEMPLATE_DISPLAY_GUIDANCE } from '../../src/shared/display-guidance.js';
import { SEAT_LAYOUTS } from '../../src/shared/venue';
import { materializeSeats } from '../../src/shared/venue';
import { VOCABULARY } from '../../src/shared/venue';
import { venueSchemas } from '../../src/shared/venue';
import { validateStatic } from '../../src/server/custom-templates';
import { validateCustomSchema } from '../../src/server/custom-templates';
import { bindTemplate } from '../../src/shared/custom-templates';
import { DiscoveryCatalog } from '../../src/server/mcp/discovery';
import { asyncMap } from '../../src/server/async-collections.js';
import { ControlledInterpreter } from './harness.js';
import type { MonitoringFetchResult } from '../../src/server/monitoring.js';
import type { MonitoringFetcher } from '../../src/server/monitoring.js';
import type { MonitoringSummary } from '../../src/shared/monitoring.js';
import type { Token } from '../../src/server/auth.js';

describe("settings coverage 1", () => {
    describe("settings contracts", () => {
        let h!: Harness, owner: Browser, s: string, d: string, p: AuthPrincipal;
        const path = () => `/api/sessions/${s}/displays/${d}`;
        const call = async <T = Record<string, unknown>>(name: string, args: unknown) => (await h.runtime.service.execute(name, args, p)) as Promise<T>;
        const current = async () => (await owner.detail(s)).displays.find(x => x.id === d)!;
        const settle = async (update: UpdateRecord) => owner.settle(s, update.requestId);
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); s = (await owner.session()).id; d = (await owner.display(s)).id; p = { userId: owner.user!.id }; });
        afterEach(async () => { await h?.close(); });
        async function guest(interactive: boolean) {
            const share = await call<{
                id: string;
            }>("kanvas.share.create", { sessionId: s, displayId: d, allowInteraction: interactive });
            const g = h.browser();
            const pair = success(await g.request<{
                id: string;
            }>('POST', '/api/pairings', { shareId: share.id, deviceName: 'Evening test screen', requestedInteractive: interactive }));
            await call("kanvas.pairing.decide", { sessionId: s, pairingId: pair.id, approve: true, confirm: true, interactive });
            success(await g.request('GET', `/api/pairings/${pair.id}/status`));
            g.csrf = success(await g.request<{
                csrfToken: string;
            }>('GET', '/api/auth/me')).csrfToken;
            return g;
        }
        it('applies owner settings and records a linked feedback event; rejects stale drafts without partial changes', async () => {
            await owner.submit(s, [d], { version: 1, template: 'settings', data: {} });
            success(await owner.request('POST', `${path()}/settings`, { expectedRevision: 0, config: { style: 'iris', theme: 'light' } }));
            const detail = await owner.detail(s);
            expect(detail.session.config).toMatchObject({ style: 'iris', theme: 'light' });
            expect(detail.interactions.filter(x => x.actionId === 'settings.changed')).toHaveLength(1);
            expect(detail.interactions.at(-1)?.value).toMatchObject({ applied: true, configRevision: 1 });
            denied(await owner.request('POST', `${path()}/settings`, { expectedRevision: 0, config: { theme: 'dark' } }), [409]);
            expect((await owner.detail(s)).session.config.theme).toBe('light');
        });
        it('lets contributing guests propose settings without granting editing; view-only guests cannot propose', async () => {
            await owner.submit(s, [d], { version: 1, template: 'settings', data: {} });
            const g = await guest(true), body = { revision: 1, requestId: randomUUID(), value: { kind: 'settings.request', config: { theme: 'light' }, expectedConfigRevision: 0 } };
            success(await g.request('POST', `${path()}/respond`, body));
            success(await g.request('POST', `${path()}/respond`, body));
            const detail = await owner.detail(s);
            expect(detail.session.config.theme).toBe('dark');
            expect(detail.interactions.filter(x => x.actionId === 'settings.request')).toHaveLength(1);
            expect(detail.interactions.at(-1)?.value).toMatchObject({ applied: false, config: { theme: 'light' } });
            denied(await g.request('POST', `${path()}/settings`, { expectedRevision: 0, config: { theme: 'light' } }));
            const readonly = await guest(false);
            denied(await readonly.request('POST', `${path()}/respond`, { ...body, requestId: randomUUID() }));
        });
    });
});

describe("settings coverage 2", () => {
    let h!: Harness;
    afterEach(async () => { await h?.close(); });
    it('round-trips time format through session and personal config; new templates publish through normal service', async () => {
        h = await startHarness();
        const owner = await h.account(), s = (await owner.session()).id, d = (await owner.display(s)).id;
        expect(configPatchSchema.parse({ timeFormat: '12h' })).toEqual({ timeFormat: '12h' });
        success(await owner.request('PATCH', `/api/sessions/${s}/config`, { expectedRevision: 0, config: { timeFormat: '12h' } }));
        expect((await owner.detail(s)).session.config.timeFormat).toBe('12h');
        const principal = { userId: owner.user!.id };
        const pref = await h.runtime.service.execute("kanvas.preferences.get", {}, principal) as any;
        await h.runtime.service.execute("kanvas.preferences.update", { expectedRevision: pref.revision, config: { timeFormat: '24h' } }, principal);
        expect((await owner.session()).config.timeFormat).toBe('24h');
        expect((await owner.detail(s)).session.config.timeFormat).toBe('12h');
        await owner.submit(s, [d], { version: 1, template: 'inbox', format: { timeFormat: '12h', dateFormat: 'dmy' }, data: { items: [{ id: 'm', from: 'Sender', subject: 'Subject', timestamp: '2026-09-27T14:26:04Z' }] } });
        expect((await owner.detail(s)).displays[0].view?.format?.timeFormat).toBe('12h');
        const { samples } = await import('../../src/shared/template-examples.js');
        for (const key of ['sports-lineup', 'org-chart', 'flowchart', 'network'] as const) {
            await owner.submit(s, [d], samples[key]);
            expect((await owner.detail(s)).displays[0].view?.template).toBe(key);
        }
    });
});

describe("settings coverage 3", () => {
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
        it('a declared full preference keeps every block; a long silence is a new contact; the ledger is bounded', () => {
            const ledger = new ContactLedger();
            run(ledger, { context: { mode, displayConnected: true, preference: 'full' } });
            const again = run(ledger, { context: { mode, displayConnected: true, preference: 'full' } });
            expect(again.orientation).toEqual(orientation);
            expect((again.agentGuidance as {
                levels: unknown[];
            }).levels).toHaveLength(1);
            const start = Date.now(), idle = new ContactLedger();
            run(idle, {}, undefined, 'k', start);
            expect(run(idle, {}, undefined, 'k', start + CONTACT_IDLE_MS + 1).firstContact).toBeTruthy();
            for (let i = 0; i < 5200; i++)
                idle.observe(`k${i}`);
            expect(idle.observe('k0').first).toBe(true);
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
        it('8f4962dc / e2573eca / aef9fccb: connector identity and sender address come from configuration', () => {
            const icons = serverIcons('https://kanvas.example');
            expect(icons.map(icon => icon.sizes[0])).toEqual(['48x48', '192x192', '512x512', 'any']);
            expect(icons.every(icon => icon.src.startsWith('https://kanvas.example/') && icon.src.endsWith(`?v=${KANVAS_VERSION}`))).toBe(true);
            expect(icons.filter(icon => icon.mimeType === 'image/png')).toHaveLength(3);
            expect(serverWebsiteUrl(undefined)).toBe(DEFAULT_WEBSITE_URL);
            expect(serverWebsiteUrl('https://example.org/')).toBe('https://example.org');
            expect(serverWebsiteUrl('')).toBeUndefined();
            expect(serverWebsiteUrl(false)).toBeUndefined();
            expect(serverWebsiteUrl('http://insecure.example')).toBeUndefined();
            expect(serverWebsiteUrl('javascript:alert(1)')).toBeUndefined();
            expect(KANVAS_VERSION).toBe('0.39.0');
            expect(mailSenderAddress('KANVAS <noreply@example.com>')).toBe('noreply@example.com');
            expect(mailSenderAddress('kanvas@open-kanvas.ai')).toBe('kanvas@open-kanvas.ai');
            expect(mailSenderAddress('not an address')).toBeUndefined();
            expect(mailSenderAddress(undefined)).toBeUndefined();
        });
    });
});

describe("settings coverage 4", () => {

const displayGuidance=(template:string)=>(TEMPLATE_DISPLAY_GUIDANCE as Record<string,unknown>)[template];

const pane=(id:string,text=id)=>({id,view:{version:1,template:'fact',data:{text}}});
const split=(data:Record<string,unknown>)=>({version:1,template:'split-screen',data});

describe("settings contracts",()=>{
 it('0448f65b: text size is a session setting for every template; the font picker takes a sample size',()=>{
  expect(configPatchSchema.parse({textSize:150}).textSize).toBe(150);expect(configPatchSchema.safeParse({textSize:20}).success).toBe(false);expect(configPatchSchema.safeParse({textSize:300}).success).toBe(false);
  expect(textScale({textSize:150})).toBe(1.5);expect(textScale({})).toBe(1);expect(textScale(undefined)).toBe(1);expect(textScale({textSize:9999})).toBe(2.5);
  expect(fontPickerDataSchema.parse({fonts:[{family:'inter',weight:400}],sampleSize:18}).sampleSize).toBe(18);
  expect(fontPickerDataSchema.safeParse({fonts:[{family:'inter',weight:400}],sampleSize:4}).success).toBe(false);
 });});
});

describe("settings coverage 5", () => {
    describe("settings contracts", () => {
        let h!: Harness, o: Browser, s: string, d: string, p: {
            userId: string;
        };
        beforeEach(async () => { h = await startHarness(); o = await h.account(); s = (await o.session()).id; d = (await o.display(s)).id; p = { userId: o.user!.id }; });
        afterEach(async () => { await h?.close(); });
        const call = (name: string, args: Record<string, unknown> = {}) => h.runtime.service.execute(name, args, p) as Promise<any>;
        const update = (name: string, args: Record<string, unknown>) => call(name, { sessionId: s, displayId: d, ...args });
        const publish = async (template: any, data: any) => { const result = await o.submit(s, [d], { version: 1, template, data }); expect(result.update.status).toBe('prepared'); return result.detail.displays.find(x => x.id === d)!; };
        const current = async () => (await o.detail(s)).displays.find(x => x.id === d)!;
        const definition = { name: 'Team list', schema: { type: 'object', properties: { title: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } } }, required: ['title', 'items'] }, html: '<article><h1>{{title}}</h1><ul>{{#each items}}<li>{{name}}</li>{{/each}}</ul></article>', css: 'article {padding: 24px; color: white;} h1 {font-size: 48px;}' };
        it('autoplay and settings apply without preflight revision reads, while explicit guards still reject stale writes', async () => {
            await publish('presentation', { slides: [{ version: 1, template: 'fact', data: { text: 'One' } }, { version: 1, template: 'fact', data: { text: 'Two' } }] });
            const started = await update("kanvas.autoplay.control", { action: 'start', intervalSeconds: 60 });
            expect(started.status).toBe('running');
            const paused = await update("kanvas.autoplay.control", { action: 'pause' });
            expect(paused.status).toBe('paused');
            await expect(update("kanvas.autoplay.control", { action: 'resume', expectedVersion: started.version })).rejects.toMatchObject({ code: 'REVISION_CONFLICT', currentRevision: paused.version });
            await update("kanvas.autoplay.control", { action: 'stop' });
            await call("kanvas.config.update", { sessionId: s, config: { theme: 'light' } });
            expect((await o.detail(s)).session.config.theme).toBe('light');
        });
    });
});

describe("settings coverage 6", () => {


const running: Harness[] = [];
afterEach(async () => { await Promise.all((await asyncMap(running.splice(0), async h => (await h.close())))); });
async function setup(fetcher?: MonitoringFetcher) {
  let time = Date.now();
  const interpret = vi.fn(async () => { throw new Error('These source operations must not invoke the source renderer.'); });
  const fetch = vi.fn(fetcher ?? (async () => ({ statusCode: 200, latencyMs: 5, mimeType: 'application/json', body: Buffer.from('{"text":"Exact source result"}'), finalUrl: 'https://example.com/status' })));
  const h = await startHarness({ interpreter: { interpret }, monitoringOptions: { automatic: false, now: () => time, fetcher: fetch } }); running.push(h);
  const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
  return { h, owner, session, display, interpret, fetch, advance: (ms: number) => { time += ms; } };
}
const jsonConfig = { mode: 'json', url: 'https://example.com/status', template: 'fact', mapping: { text: { $path: '/text' } }, intervalSeconds: 30, durationSeconds: 3600 };

describe("settings contracts", () => {

  it('rechecks revised source configuration without portraying old content as fresh', async () => {
    const { h, owner, session, display } = await setup();
    const path = `/api/sessions/${session.id}/monitoring`;
    const job = success(await owner.request<MonitoringSummary>('POST', path, { requestId: randomUUID(), displayId: display.id, expectedRevision: 0, config: jsonConfig }));
    await h.runtime.service.monitoring.runDue();
    const latest = success(await owner.request<MonitoringSummary>('GET', `${path}/${job.id}`));
    success(await owner.request('PATCH', `${path}/${job.id}`, { requestId: randomUUID(), expectedVersion: latest.version, config: { ...jsonConfig, url: 'https://example.com/second-source' } }));
    const current = (await owner.detail(session.id)).displays[0];
    expect(current.view?.data.text).toBe('Exact source result');
    expect(current.monitoring?.status).toBe('starting'); expect(current.monitoring?.lastSuccessAt).toBeUndefined();
  });});
});
