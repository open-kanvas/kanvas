import { CANONICAL_TOOLS as MCP_TOOLS } from '../../src/server/mcp/canonical.js';
import { beforeAll, afterAll } from 'vitest';
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
import { KANVAS_VERSION } from '../../src/shared/version.js';
import { feedbackSubmitSchema } from '../../src/shared/reports.js';
import { experienceTools } from '../../src/server/mcp/experience-tools.js';
import { pairedDisplayAllowsAsset } from '../../src/server/access-flows.js';
import { parseDataset } from '../../src/server/rendering/datasets.js';
import { rawEvent } from '../../src/server/raw-events.js';
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
import { validateMedia } from '../../src/server/rendering/media';
import { PNG } from './harness';
import { materializeSeats } from '../../src/shared/venue';
import { signSchema } from '../../src/shared/venue';
import { navigate } from '../../src/shared/navigation';
import { initialNavigation } from '../../src/shared/navigation';
import { navigationCapabilities } from '../../src/shared/navigation';
import { navigationActionSchema } from '../../src/shared/navigation';
import { guidanceTools } from '../../src/server/agent-guidance';
import { DEFAULT_AGENT_GUIDANCE } from '../../src/server/agent-guidance';
import { safeUrl } from '../../src/client/api';
import { bindTemplate } from '../../src/shared/custom-templates';
import type { Response } from 'express';
import { accountTier } from '../../src/server/usage-limits.js';
import { accountUsageLimits } from '../../src/server/usage-limits.js';
import { VisualCaptureResult } from '../../src/server/visual-capture.js';
import { resolveToolCall } from '../../src/server/mcp/catalog.js';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { REPORT_CREATE_BYTES } from '../../src/shared/reports.js';
import { REPORT_DESCRIPTION_MAX } from '../../src/shared/reports.js';
import type { ReportPage } from '../../src/shared/reports.js';
import type { ReportRecord } from '../../src/shared/reports.js';
import type { SessionRecord } from '../../src/shared/types.js';
import { GUIDE_TOPICS } from '../../src/server/mcp/guide.js';
import { normalizedScroll } from '../../src/client/renderers/Navigation.js';
describe("reports coverage 1", () => {
    const toastSchema = experienceTools.find(t => t.name === "kanvas.toast")!.schema;
    it('feedback no longer publishes or requires a category', () => {
        const base = { requestId: 'r', title: 'Finding', description: 'Description' };
        expect(feedbackSubmitSchema.parse(base)).toEqual(base);
        expect(feedbackSubmitSchema.safeParse({ ...base, category: 'improvement' }).success).toBe(false);
    });
    describe("reports contracts", () => {
        let h!: Harness, owner: Browser, s: string, d: string;
        const p = () => ({ userId: owner.user!.id });
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); s = (await owner.session()).id; d = (await owner.display(s)).id; await vi.waitFor(async () => expect((await h.runtime.store.query("SELECT count(*)::int n FROM events WHERE event_type='browser.operation' AND operation='kanvas_display_register'")).rows[0].n).toBe(1)); });
        afterEach(async () => { await h?.close(); });
        it('reports public pages one-based without changing internal browser indices or history', async () => {
            await owner.submit(s, [d], { version: 1, template: 'table', data: { columns: ['N'], rows: Array.from({ length: 30 }, (_, i) => ({ N: i })), pageSize: 10 } });
            const count = (await h.runtime.store.list('display-history', s)).length;
            for (const page of [1, 2, 3]) {
                const result = await h.runtime.service.navigation.control(p(), { sessionId: s, displayId: d, requestId: randomUUID(), navigation: { action: 'page', page } });
                expect(result.state.page).toBe(page);
                expect(result.state.pageIndex).toBe(page - 1);
                expect((await h.runtime.service.navigation.read(p(), { sessionId: s, displayId: d })).state.page).toBe(page);
            }
            expect((await h.runtime.store.list('display-history', s)).length).toBe(count);
        });
    });
});
describe("reports coverage 2", () => {
    const context = { principal: { userId: 'catalog-reader' } };
    const search = (kind: 'tool' | 'template' | 'help', query: string, limit = 3) => (discoveryCatalog.query(kind, 'search', { query, limit }, context).results as {
        id: string;
        description: string;
        example?: unknown;
    }[]);
    describe('6d119fd6 / aa19719e / ffc47785 / f7374ccd: the catalog exposes the shape and the right entry', () => {
        it('7dcd018f: no description or help text offers a feedback category', () => {
            const feedback = CANONICAL_TOOLS.find(tool => tool.name === "kanvas.feedback.submit")!;
            expect(feedback.description).not.toMatch(/Category:/);
            expect(feedback.description).not.toMatch(/usability, feature, quality/);
            expect(feedback.description).toMatch(/Bugs are filed with/);
            const everything = [...operationCatalog(), ...helpCatalog()].map(item => `${item.summary} ${item.text ?? ''}`).join(' ');
            expect(everything).not.toMatch(/Category: usability/);
        });
    });
});
describe("reports coverage 3", () => {
    describe("reports contracts", () => {
        let h!: Harness, owner: Browser, sessionId: string, displayId: string;
        const path = () => `/api/sessions/${sessionId}/displays/${displayId}`;
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); sessionId = (await owner.session()).id; displayId = (await owner.display(sessionId)).id; });
        afterEach(async () => { await h?.close(); });
        const current = async () => (await owner.detail(sessionId)).displays.find(display => display.id === displayId)!;
        const publish = async (view: ViewSpec) => { await owner.submit(sessionId, [displayId], view); return current(); };
        const respond = async (browser: Browser, value: Record<string, unknown>, revision: number, requestId = randomUUID()) => browser.request<InteractionRecord>('POST', `${path()}/respond`, { value, revision, requestId });
        const addViewer = async () => { const viewer = await h.account(); success(await owner.request('POST', `/api/sessions/${sessionId}/members`, { username: viewer.user!.username, role: 'viewer' })); return viewer; };
        const navigate = async (direction: 'back' | 'forward', displays: DisplayRecord[]) => owner.request<UpdateRecord>('POST', `/api/sessions/${sessionId}/navigate`, { direction, displayIds: displays.map(d => d.id), expectedRevisions: Object.fromEntries(displays.map(d => [d.id, d.revision])), requestId: randomUUID() });
        it('reports a prepared-but-unpainted frame as offline or timed out, never applied, and accepts explicit failure/recovery', async () => {
            const { update } = await owner.submit(sessionId, [displayId], fact('Needs paint'));
            expect((await owner.detail(sessionId)).updates[0].delivery?.[displayId].status).toBe('offline');
            const principal = (await h.runtime.auth.browser({ cookies: Object.fromEntries(owner.cookies) } as never)).principal;
            const disconnect = (await h.runtime.service.connectDisplay(principal, sessionId, displayId));
            (await h.runtime.store.put('update', { ...update, completedAt: new Date(Date.now() - 31000).toISOString() }));
            let status = (await owner.detail(sessionId)).updates[0];
            expect(status.status).toBe('prepared');
            expect(status.delivery?.[displayId].status).toBe('timed_out');
            const display = await current();
            success(await owner.request('POST', `${path()}/delivery`, { revision: display.revision, status: 'failed', lastGoodRevision: 0 }));
            status = (await owner.detail(sessionId)).updates[0];
            expect(status.delivery?.[displayId].status).toBe('failed');
            expect(status.status).toBe('prepared');
            success(await owner.request('POST', `${path()}/applied`, { revision: display.revision }));
            status = (await owner.detail(sessionId)).updates[0];
            expect(status.status).toBe('applied');
            expect(status.delivery?.[displayId].status).toBe('applied');
            (await disconnect());
        });
    });
});
describe("reports coverage 4", () => {
    describe("reports contracts", () => {
        let h!: Harness, owner: Browser, s: string, d: string, p: AuthPrincipal;
        const send = vi.fn(async (_subscription: unknown, _payload: string) => ({ statusCode: 201 }));
        beforeEach(async () => { send.mockClear(); h = await startHarness({ pushOptions: { publicKey: 'test-public-key', privateKey: 'test-private-key', subject: 'mailto:test@example.invalid', send } }); owner = await h.account(); s = (await owner.session()).id; d = (await owner.display(s)).id; p = { userId: owner.user!.id }; });
        afterEach(async () => { await h?.close(); });
        async function deck() { const result = await owner.submit(s, [d], { version: 1, template: 'flashcards', data: { mode: 'test', cards: [{ id: 'hola', prompt: 'hola', answer: 'hello', acceptedAnswers: ['hi'] }, { id: 'adios', prompt: 'adiós', answer: 'goodbye' }] } }); expect(result.update.status).toBe('prepared'); return result.detail.displays.find(x => x.id === d)!; }
        it('stores only strict diagnostic metadata, scopes timelines and requires CSRF', async () => {
            const supportRef = randomUUID(), body = { supportRef, windowId: randomUUID(), events: [{ event: 'render-applied', sessionId: s, displayId: d, revision: 1 }] };
            expect(success(await owner.request('POST', '/api/diagnostics', body))).toMatchObject({ accepted: 1 });
            const read: any = success(await owner.request('GET', '/api/diagnostics?supportRef=' + supportRef));
            expect(read.timeline).toHaveLength(1);
            const stranger = await h.account();
            const hidden: any = success(await stranger.request('GET', '/api/diagnostics?supportRef=' + supportRef));
            expect(hidden.timeline).toEqual([]);
            expect((await stranger.request('GET', '/api/diagnostics?supportRef=' + supportRef + '&accountId=' + owner.user!.id)).status).toBe(403);
            expect((await owner.request('POST', '/api/diagnostics', body, { csrf: null })).status).toBe(403);
            expect((await owner.request('POST', '/api/diagnostics', { ...body, events: [{ event: 'js-error', message: 'secret', url: 'https://example.com/?token=secret' }] })).status).toBeGreaterThanOrEqual(400);
            h.runtime.service.accounts.serviceAdmins.add(stranger.user!.id);
            expect((success(await stranger.request<any>('GET', '/api/diagnostics?supportRef=' + supportRef + '&accountId=' + owner.user!.id))).timeline).toHaveLength(1);
        });
        it('bounds diagnostic ingestion size/rate while retaining accepted historical detail indefinitely', async () => {
            const body = { supportRef: randomUUID(), windowId: randomUUID(), events: Array.from({ length: 20 }, () => ({ event: 'startup' })) };
            expect(diagnosticBatchSchema.safeParse({ ...body, events: [...body.events, ...body.events] }).success).toBe(false);
            for (let i = 0; i < 6; i++)
                success(await owner.request('POST', '/api/diagnostics', body));
            const limited = success(await owner.request<any>('POST', '/api/diagnostics', body));
            expect(limited).toMatchObject({ accepted: 0, rateLimited: true, supportRef: body.supportRef });
            expect(limited.retryAfterMs).toBeGreaterThan(0);
            expect(limited.retryAfterMs).toBeLessThanOrEqual(60000);
            const timeline = success(await owner.request<any>('GET', '/api/diagnostics?supportRef=' + body.supportRef)).timeline;
            expect(timeline.reduce((n: number, b: {
                events: unknown[];
            }) => n + b.events.length, 0)).toBe(120);
            await h.runtime.store.put('frontend-diagnostic', { id: 'expired', accountId: p.userId, at: new Date(Date.now() - 15 * 86400000).toISOString() });
            await h.runtime.service.diagnostics.prune();
            expect(await h.runtime.store.get('frontend-diagnostic', 'expired')).toMatchObject({ id: 'expired', accountId: p.userId });
            expect(diagnosticRoute('/view/id/display?token=secret#body')).toBe('view');
        });
        const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/inert', keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } };
        it('rejects selected-session diagnostic reads and oversized diagnostic batches', async () => {
            const token = await h.runtime.auth.issueToken(p.userId, 'Selected', ['read'], [s]);
            await expect(h.runtime.service.diagnostics.read({ ...p, tokenId: token.token.id }, { supportRef: randomUUID() })).rejects.toMatchObject({ code: 'FORBIDDEN' });
            expect((await owner.request('POST', '/api/diagnostics', { padding: 'x'.repeat(20000) })).status).toBe(413);
        });
    });
});
describe("reports coverage 5", () => {
    describe('account media reuse and image diagnostics', () => {
        let h!: Harness, o: Browser, s: string, d: string;
        beforeEach(async () => { h = await startHarness(); o = await h.account(); s = (await o.session()).id; d = (await o.display(s)).id; });
        afterEach(async () => { await h?.close(); });
        it('client diagnostic only records current referenced URLs; no arbitrary source or stale poisoning', async () => {
            const asset = success(await o.request<any>('POST', `/api/sessions/${s}/assets`, { name: 'test.png', mimeType: 'image/png', base64: PNG }));
            await o.submit(s, [d], { version: 1, template: 'image', data: { images: [{ url: asset.url }] } });
            const display = (await o.detail(s)).displays.find(x => x.id === d)!;
            const path = `/api/sessions/${s}/displays/${d}/image-diagnostic`, body = { expectedRevision: display.revision, url: asset.url, reason: 'HTTP_404' };
            expect((await o.request('POST', path, body)).status).toBe(200);
            expect((await o.detail(s)).displays.find(x => x.id === d)!.imageDiagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ reason: 'HTTP_404', host: 'protected-media' })]));
            expect((await o.request('POST', path, { ...body, url: '/api/assets/not-referenced' })).status).toBe(404);
            expect((await o.request('POST', path, { ...body, expectedRevision: 0 })).status).toBe(409);
            expect((await o.request('POST', path, { ...body, reason: 'cookies secret' })).status).toBe(400);
        });
    });
});
describe("reports coverage 6", () => {
    let h!: Harness;
    afterEach(async () => { vi.restoreAllMocks(); delete process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT; delete process.env.KANVAS_MAX_VIEWS_PER_SESSION; await h?.close(); });
    async function principal(a: Browser) { const session = await h.runtime.auth.issueBrowser(a.user!.id, { cookie: () => { } } as unknown as Response); return { userId: a.user!.id, browserId: session.id }; }
    const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=';
    describe("reports contracts", () => {
        it('author patches by report ID across conversation context with revision and access checks', async () => {
            h = await startHarness();
            const owner = await h.account(), other = await h.account(), p = await principal(owner), q = await principal(other), s = await owner.session();
            const report = await h.runtime.service.reports.submit(p, 'feedback', { sessionId: s.id, requestId: 'report', title: 'Synthetic finding', description: 'Initial description' });
            const patched: any = await h.runtime.service.execute("kanvas.report.patch", { reportId: report.id, expectedRevision: 0, note: 'Follow-up observation', title: 'Updated finding' }, p);
            expect(patched).toMatchObject({ revision: 1, title: 'Updated finding', status: 'open', history: [{ note: 'Follow-up observation' }] });
            await expect(h.runtime.service.execute("kanvas.report.patch", { reportId: report.id, expectedRevision: 0, note: 'Stale' }, p)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
            await expect(h.runtime.service.execute("kanvas.report.patch", { reportId: report.id, expectedRevision: 1, note: 'Cross-account' }, q)).rejects.toMatchObject({ code: 'NOT_FOUND' });
            const grant = await h.runtime.auth.issueToken(p.userId, 'Selected', ['read', 'publish'], ['different']);
            await expect(h.runtime.service.execute("kanvas.report.patch", { reportId: report.id, expectedRevision: 1, note: 'Wrong grant' }, { userId: p.userId, tokenId: grant.token.id })).rejects.toBeDefined();
        });
    });
});
describe("reports coverage 7", () => {
    // 2026-11-10 (0875e953): guidance and orientation blocks are conditional by default. These tests verify the
    // content and isolation of the full blocks, which are sent on every response under the declared 'full' preference.
    const priorGuidanceDefault = process.env.KANVAS_GUIDANCE_DEFAULT;
    beforeAll(() => { process.env.KANVAS_GUIDANCE_DEFAULT = 'full'; });
    afterAll(() => {
        if (priorGuidanceDefault === undefined)
            delete process.env.KANVAS_GUIDANCE_DEFAULT;
        else
            process.env.KANVAS_GUIDANCE_DEFAULT = priorGuidanceDefault;
    });
    interface Result {
        isError?: boolean;
        structuredContent?: {
            data?: unknown;
            truncated?: boolean;
            orientation?: Record<string, unknown>;
            error?: {
                code: string;
                message: string;
                schemaTool?: string;
                topic?: string;
                issues?: {
                    path: string;
                    maximum?: number;
                    actual?: number;
                    unit?: string;
                }[];
            };
        };
    }
    function value<T>(r: Result): T { expect(r.isError).not.toBe(true); expect(r.structuredContent?.truncated).not.toBe(true); return r.structuredContent!.data as T; }
    function invalid(r: Result) { expect(r.isError).toBe(true); expect(r.structuredContent?.error?.code).toBe('INVALID_ARGUMENT'); return r.structuredContent!.error!; }
    describe.each(['modern', 'legacy'] as const)("reports contracts", protocol => {
        let h!: Harness;
        const clients: (Client | LegacyClient)[] = [];
        beforeEach(async () => { h = await startHarness(); });
        afterEach(async () => { await Promise.all(clients.splice(0).map(x => x.close().catch(() => { }))); await h?.close(); });
        async function connect(owner: Browser, sessions: string[]) {
            const credential = (await h.runtime.auth.issueToken(owner.user!.id, 'Disposable September 13 acceptance', ['read', 'publish'], sessions));
            const requestInit = { headers: { Authorization: `Bearer ${credential.value}` } };
            const client = protocol === 'modern' ? new Client({ name: 'guide-acceptance', version: '1' }, { versionNegotiation: { mode: 'auto' } }) : new LegacyClient({ name: 'guide-acceptance', version: '1' });
            clients.push(client);
            if (client instanceof Client)
                await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', h.baseUrl), { requestInit }));
            else
                await client.connect(new LegacyTransport(new URL('/mcp', h.baseUrl), { requestInit }));
            return { client, call: async (name: string, args: Record<string, unknown> = {}): Promise<Result> => await client.callTool(operationRequest({ name, arguments: args })) as Result };
        }
        it('retains long Unicode reports, replay identity, paginated full text and review notes', async () => {
            const owner = await h.account(), session = await owner.session(), p = await connect(owner, [session.id]);
            const reports: ReportRecord[] = [];
            for (let i = 0; i < 3; i++) {
                const description = `Case ${i}\n` + '漢'.repeat(REPORT_DESCRIPTION_MAX - 8);
                const input = { sessionId: session.id, requestId: `long-${i}`, title: `Detailed finding ${i}`, description };
                const r = value<ReportRecord>(await p.call("kanvas.feedback.submit", input));
                expect(r.description).toBe(description);
                reports.push(r);
                expect(value<ReportRecord>(await p.call("kanvas.feedback.submit", input)).id).toBe(r.id);
            }
            let afterId: string | undefined;
            const read: ReportRecord[] = [];
            do {
                const r = await p.call("kanvas.reports.read", { sessionId: session.id, limit: 20, ...(afterId ? { afterId } : {}) });
                const page = value<ReportPage>(r);
                expect(Buffer.byteLength(JSON.stringify(r.structuredContent))).toBeLessThan(64 * 1024);
                read.push(...page.reports);
                afterId = page.nextCursor;
            } while (afterId);
            expect(read.map(x => x.id).sort()).toEqual(reports.map(x => x.id).sort());
            for (const r of read)
                expect(r.description).toBe(reports.find(x => x.id === r.id)!.description);
            let current = reports[0];
            for (let i = 0; i < 8; i++)
                current = value<ReportRecord>(await p.call("kanvas.report.update", { sessionId: session.id, reportId: current.id, expectedRevision: current.revision, status: 'investigating', note: `Review ${i}: ` + '漢'.repeat(1900) }));
            expect(current.description).toBe(reports[0].description);
            expect(current.history.at(-1)?.note).toContain('Review 7:');
            expect(Buffer.byteLength(JSON.stringify(current))).toBeLessThanOrEqual(60 * 1024);
        });
    });
});
describe("reports coverage 8", () => {
    let h!: Harness;
    afterEach(async () => { await h?.close(); });
    const id = () => randomUUID();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><defs><linearGradient id="g"><stop offset="0" stop-color="#123456"/><stop offset="1" stop-color="#abcdef"/></linearGradient></defs><rect width="100" height="60" fill="url(#g)"/><text x="4" y="30">Team &amp; Friends</text></svg>';
    it('supports context-free reports with private ownership, unified administration, scoped-token rejection and restart recovery', async () => {
        h = await startHarness();
        const a = await h.account(), b = await h.account(), admin = await h.account(), s = await a.session(), svc = h.runtime.service;
        svc.accounts.serviceAdmins.add(admin.user!.id);
        const input = { requestId: id(), title: 'General UI', description: 'No particular session' }, one = success(await a.request<any>('POST', '/api/feedback', input));
        expect(one.sessionId).toBeUndefined();
        expect(one.accountId).toBe(a.user!.id);
        expect(one.scope).toBeUndefined();
        expect(success(await a.request<any>('POST', '/api/feedback', input)).id).toBe(one.id);
        const privateReport = success(await a.request<any>('POST', '/api/feedback', { ...input, requestId: id() }));
        const sessionReport = success(await a.request<any>('POST', `/api/sessions/${s.id}/feedback`, { requestId: id(), title: 'Session', description: 'Private session' }));
        expect(success(await b.request<any>('GET', '/api/reports')).reports).toHaveLength(0);
        denied(await b.request('GET', '/api/reports?allAccounts=true'));
        expect(success(await a.request<any>('GET', '/api/reports')).reports.map((r: any) => r.id)).toEqual([sessionReport.id, privateReport.id, one.id]);
        const all = success(await admin.request<any>('GET', '/api/reports?allAccounts=true&limit=2'));
        expect(all.reports).toHaveLength(2);
        const rest = success(await admin.request<any>('GET', `/api/reports?allAccounts=true&afterId=${all.nextCursor}`));
        expect([...all.reports, ...rest.reports].map(r => r.id)).toEqual([sessionReport.id, privateReport.id, one.id]);
        for (const report of [privateReport, one])
            denied(await b.request('PATCH', `/api/reports/${report.id}`, { expectedRevision: 0, status: 'resolved', note: 'Cannot review another account' }));
        success(await admin.request('PATCH', `/api/reports/${one.id}`, { expectedRevision: 0, status: 'resolved', note: 'Confirmed service fix' }));
        expect((await a.request('POST', '/api/feedback', { ...input, requestId: id(), scope: 'service' })).status).toBe(400);
        const token = (await h.runtime.auth.issueToken(a.user!.id, 'selected', ['read', 'publish'], [s.id]));
        const p = { userId: a.user!.id, tokenId: token.token.id, scopes: ['read', 'publish'] };
        await expect(svc.execute("kanvas.feedback.submit", { ...input, requestId: id() }, p)).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await h.shutdown();
        const restored = await createApp({ database: h.database });
        try {
            expect((await restored.service.reports.read({ userId: a.user!.id }, { allAccounts: false, status: 'all', kind: 'all', limit: 10 })).reports.map(r => r.id)).toEqual([sessionReport.id, privateReport.id, one.id]);
        }
        finally {
            await restored.close();
        }
    });
});
