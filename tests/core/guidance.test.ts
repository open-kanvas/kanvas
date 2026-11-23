import { CANONICAL_TOOLS as MCP_TOOLS } from '../../src/server/mcp/canonical.js';
import { beforeAll, afterAll } from 'vitest';
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
import { KANVAS_VERSION } from '../../src/shared/version.js';
import { fieldShape } from '../../src/server/friction.js';
import { problemClass } from '../../src/server/friction.js';
import { agentType } from '../../src/server/agents.js';
import type { ToastRecord } from '../../src/shared/viewer-experience.js';
import type { ViewerPresence } from '../../src/shared/viewer-experience.js';
import { DEFAULT_AGENT_GUIDANCE } from '../../src/server/agent-guidance';
import { PNG } from './harness';
import { SEAT_LAYOUTS } from '../../src/shared/venue';
import { materializeSeats } from '../../src/shared/venue';
import { VOCABULARY } from '../../src/shared/venue';
import { venueSchemas } from '../../src/shared/venue';
import { validateStatic } from '../../src/server/custom-templates';
import { validateCustomSchema } from '../../src/server/custom-templates';
import { bindTemplate } from '../../src/shared/custom-templates';
import { DiscoveryCatalog } from '../../src/server/mcp/discovery';
import { z } from 'zod';
import { validateMedia } from '../../src/server/rendering/media';
import { signSchema } from '../../src/shared/venue';
import { navigate } from '../../src/shared/navigation';
import { initialNavigation } from '../../src/shared/navigation';
import { navigationCapabilities } from '../../src/shared/navigation';
import { navigationActionSchema } from '../../src/shared/navigation';
import { guidanceTools } from '../../src/server/agent-guidance';
import { safeUrl } from '../../src/client/api';
import { createApp } from '../../src/server/app';
import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { chartDataSchema } from '../../src/shared/chart-contract';
import { stackChart } from '../../src/shared/chart-stacks';
import { feedbackSubmitSchema } from '../../src/shared/reports';
import { visualHelp } from '../../src/server/visual-help';
import { HELP_TOPICS } from '../../src/shared/help';
import type { Response } from 'express';
import { fact } from './harness.js';
import { Checklists } from '../../src/server/checklists.js';
import { resolveToolCall } from '../../src/server/mcp/catalog.js';
import { operationRequest } from '../mcp/requests.js';
import { DISCOVERY_TOOL_NAMES } from '../../src/server/mcp/operations.js';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { REPORT_CREATE_BYTES } from '../../src/shared/reports.js';
import { REPORT_DESCRIPTION_MAX } from '../../src/shared/reports.js';
import type { ReportPage } from '../../src/shared/reports.js';
import type { ReportRecord } from '../../src/shared/reports.js';
import type { SessionRecord } from '../../src/shared/types.js';
import type { DisplayRecord } from '../../src/shared/types.js';
import type { UpdateRecord } from '../../src/shared/types.js';
import { GUIDE_TOPICS } from '../../src/server/mcp/guide.js';
describe("guidance coverage 1", () => {
    const context = { principal: { userId: 'catalog-reader' } };
    const search = (kind: 'tool' | 'template' | 'help', query: string, limit = 3) => (discoveryCatalog.query(kind, 'search', { query, limit }, context).results as {
        id: string;
        description: string;
        example?: unknown;
    }[]);
    describe('0875e953 response policy (pure rules)', () => {
        const orientation = { guide: { tool: "kanvas.guide" }, viewerLink: 'how to connect a receiver', toolSelection: 'x', recovery: 'y' };
        const guidance = { boundary: 'b', levels: [{ scope: 'user', id: 'user:1', text: 'be proactive', revision: 3 }] };
        const run = (ledger: ContactLedger, overrides: Partial<Parameters<typeof applyResponsePolicy>[1]> = {}, structured: Record<string, unknown> = { data: { status: 'accepted', sessionId: 's1' }, orientation }, key = 'conn', at = Date.now()) => applyResponsePolicy(structured, { state: ledger.observe(key, at), context: { preference: 'concise', displayConnected: true }, guidance, isError: false, operation: "kanvas.submit", sessionId: 's1', ...overrides }).structured!;
        it('concise guidance returns in full when its revision or scope changes, and never in between', () => {
            const ledger = new ContactLedger();
            run(ledger);
            expect(run(ledger).agentGuidance).toMatchObject({ unchanged: true });
            const revised = run(ledger, { guidance: { ...guidance, levels: [{ ...guidance.levels[0], revision: 4 }] } });
            expect(revised.agentGuidance).toMatchObject({ changed: true });
            expect((revised.agentGuidance as {
                levels: unknown[];
            }).levels).toHaveLength(1);
            const scoped = run(ledger, {guidance:{...guidance,levels:[{...guidance.levels[0],scope:'session',id:'session:s1',revision:4}]} });
            expect(scoped.agentGuidance).toMatchObject({changed:true,levels:[{scope:'session'}]});
        });
        it('orientation returns on errors, a missing target and a session with no connected display', () => {
            const ledger = new ContactLedger();
            run(ledger);
            expect(run(ledger, { isError: true }, { error: { code: 'INVALID_ARGUMENT' }, orientation }).orientation).toEqual(orientation);
            expect(run(ledger, {}, { data: { status: 'needs_target' }, orientation }).orientation).toMatchObject({ viewerLink: orientation.viewerLink });
            expect(run(ledger, { context: { displayConnected: false } }).orientation).toMatchObject({ viewerLink: orientation.viewerLink });
            expect(run(ledger).orientation).not.toHaveProperty('viewerLink');
        });
    });
});
describe("guidance coverage 2", () => {
    let h!: Harness;
    afterEach(async () => { await h?.close(); });
    it('scopes active guidance, private draft revisions, explicit saves and concurrent edits', async () => {
        h = await startHarness();
        const owner = await h.account(), other = await h.account(), p = { userId: owner.user!.id }, q = { userId: other.user!.id }, s = await owner.session(), g = h.runtime.service.guidance;
        expect((await g.read(p, { scope: 'user' })).text).toBe(DEFAULT_AGENT_GUIDANCE);
        expect((await g.read(p, { scope: 'session', sessionId: s.id })).text).toBe('');
        const a = { scope: 'user', text: 'Wait for explicit visual requests.', expectedDraftRevision: 0, requestId: 'draft' };
        const draft: any = await g.mutate(p, a, 'draft_edit');
        expect(draft.draft.revision).toBe(1);
        expect(draft.text).toBe(DEFAULT_AGENT_GUIDANCE);
        expect(await g.mutate(p, a, 'draft_edit')).toEqual(draft);
        expect((await g.read(q, { scope: 'user' })).draft.revision).toBe(0);
        const save = { scope: 'user', expectedRevision: 0, expectedDraftRevision: 1, requestId: 'save' };
        expect((await g.mutate(p, save, 'draft_save') as any).text).toBe(a.text);
        await expect(g.mutate(p, { ...save, requestId: 'stale' }, 'draft_save')).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
        await expect(g.mutate(p, { scope: 'user', text: '', expectedRevision: 1, requestId: 'blank' }, 'set')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
        await expect(g.read(q, { scope: 'session', sessionId: s.id })).rejects.toThrow();
        await expect(g.mutate(q, { scope: 'session', sessionId: s.id, text: 'steal', expectedRevision: 0, requestId: 'unauthorized' }, 'set')).rejects.toThrow();
        const writes = await Promise.allSettled(['one', 'two'].map(text => g.mutate(p, { scope: 'session', sessionId: s.id, text, expectedRevision: 0, requestId: text }, 'set')));
        expect(writes.filter(x => x.status === 'fulfilled')).toHaveLength(1);
        expect((await g.exposure(q, { sessionId: s.id }))?.levels.map(x => x.scope)).toEqual(['user']);
    });
    it('selected-session clients cannot read or edit standing personal/group guidance', async () => {
        h = await startHarness();
        const owner = await h.account(), s = await owner.session(), token = await h.runtime.auth.issueToken(owner.user!.id, 'Selected', ['read', 'publish'], [s.id]), p = { userId: owner.user!.id, tokenId: token.token.id }, g = h.runtime.service.guidance;
        await expect(g.read(p, { scope: 'user' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await expect(g.mutate(p, { scope: 'user', text: 'Change whole account', expectedRevision: 0, requestId: 'denied' }, 'set')).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await g.mutate({ userId: owner.user!.id }, { scope: 'session', sessionId: s.id, text: 'This session only', expectedRevision: 0, requestId: 'session' }, 'set');
        expect((await g.exposure(p, { sessionId: s.id }))?.levels.map(x => x.scope)).toEqual(['session']);
    });
});
describe("guidance coverage 3", () => {
    describe("guidance contracts", () => {
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
        it('private guidance drafts and scoped-settings diagnostics follow the same optional guard contract', async () => {
            const edited = await call("kanvas.guidance.draft.edit", { scope: 'user', text: 'Use exact source values.', requestId: 'draft-edit' });
            expect(edited.draft.revision).toBe(1);
            const saved = await call("kanvas.guidance.draft.save", { scope: 'user', requestId: 'draft-save' });
            expect(saved.text).toBe('Use exact source values.');
            await expect(call("kanvas.guidance.draft.edit", { scope: 'user', text: 'Other', requestId: 'draft-stale', expectedDraftRevision: 0 })).rejects.toMatchObject({ code: 'REVISION_CONFLICT', currentRevision: 1 });
            await call("kanvas.preferences.update", { config: { theme: 'light' } });
            const prefs = await call("kanvas.preferences.update", { config: { theme: 'dark' } });
            await expect(call("kanvas.config.update", { sessionId: s, scope: 'account', config: { theme: 'light' }, expectedRevision: 'bad' })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT', currentRevision: prefs.revision });
        });
    });
});
describe("guidance coverage 4", () => {
    it('5000-char guidance including Unicode, and exact owner-overridable default', () => {
        const schema = guidanceTools.find(t => t.name === "kanvas.guidance.set")!.schema;
        expect(schema.safeParse({ scope: 'user', text: 'å'.repeat(5000), requestId: 'long', expectedRevision: 0 }).success).toBe(true);
        expect(schema.safeParse({ scope: 'user', text: 'x'.repeat(5001), requestId: 'long', expectedRevision: 0 }).success).toBe(false);
        expect(DEFAULT_AGENT_GUIDANCE).toContain('Show things when they are easier to see than to say');
    });
});
describe("guidance coverage 5", () => {
    let h!: Harness;
    afterEach(async () => { await h?.close(); });
    it('isolates named guidance libraries and copies activation without changing standing guidance', async () => {
        h = await startHarness();
        const owner = await h.account(), other = await h.account(), p = { userId: owner.user!.id }, q = { userId: other.user!.id }, session = await owner.session(), g = h.runtime.service.guidance;
        const input = { promptId: 'passive', name: 'Passive', text: 'Wait for my explicit request.', expectedRevision: 0, requestId: 'save' };
        const saved: any = await g.library(p, input, 'save');
        expect(saved.revision).toBe(1);
        expect(await g.library(p, input, 'save')).toEqual(saved);
        expect((await g.library(q, {}, 'list') as any).prompts).toEqual([]);
        await expect(g.library(q, { promptId: 'passive', sessionId: session.id, expectedRevision: 0, requestId: 'steal' }, 'activate')).rejects.toThrow();
        await g.library(p, { promptId: 'passive', sessionId: session.id, expectedRevision: 0, requestId: 'activate' }, 'activate');
        expect((await g.read(p, { scope: 'session', sessionId: session.id })).text).toBe(input.text);
        await g.library(p, { promptId: 'passive', expectedRevision: 1, requestId: 'delete' }, 'delete');
        expect((await g.read(p, { scope: 'session', sessionId: session.id })).text).toBe(input.text);
        expect((await g.read(p, { scope: 'user' })).text).not.toBe(input.text);
        await expect(g.library(p, { ...input, text: 'race', requestId: 'stale', expectedRevision: 1 }, 'save')).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    });
    it('retains named library text, revisions and session activation across an actual service restart', async () => {
        h = await startHarness();
        const owner = await h.account(), session = await owner.session(), p = { userId: owner.user!.id }, g = h.runtime.service.guidance;
        for (let i = 0; i < 4; i++)
            await g.library(p, { promptId: 'prompt-' + i, name: 'Prompt ' + i, text: 'Exact instructions ' + i, requestId: 'save-' + i }, 'save');
        const first: any = await g.library(p, {}, 'list'), second: any = await g.library(p, { afterId: first.nextCursor }, 'list');
        expect(first.prompts).toHaveLength(3);
        expect(second.prompts).toHaveLength(1);
        await g.library(p, { promptId: 'prompt-3', sessionId: session.id, requestId: 'activate-persist' }, 'activate');
        await h.shutdown();
        const restored = await createApp({ database: h.database });
        try {
            expect((await restored.service.guidance.read(p, { scope: 'session', sessionId: session.id })).text).toBe('Exact instructions 3');
            expect((await restored.service.guidance.library(p, { afterId: first.nextCursor }, 'list') as any).prompts[0]).toMatchObject({ name: 'Prompt 3', revision: 1, text: 'Exact instructions 3' });
        }
        finally {
            await restored.close();
        }
    });
});
describe("guidance coverage 6", () => {
    let h!: Harness;
    afterEach(async () => { await h?.close(); });
    async function principal(a: Browser) { const session = await h.runtime.auth.issueBrowser(a.user!.id, { cookie: () => { } } as unknown as Response); return { userId: a.user!.id, browserId: session.id }; }
    const view = { version: 1 as const, template: 'checklist' as const, title: 'Release tasks', data: { items: [{ id: 'a', text: 'Review', checked: false }, { id: 'b', text: 'Test', checked: false }] } };
    describe("guidance contracts", () => {
        it('settings publication returns live change guidance immediately', async () => {
            h = await startHarness();
            const a = await h.account(), p = await principal(a), s = await a.session(), d = await a.display(s.id);
            const result: any = await h.runtime.service.execute("kanvas.submit", { sessionId: s.id, displayIds: [d.id], requestId: randomUUID(), view: { version: 1, template: 'settings', data: {} } }, p);
            expect(result.settingsGuidance.tool).toBe("kanvas.config.update");
            expect(result.settingsGuidance.nextAction).toContain('settings.update');
        });
    });
});
describe("guidance coverage 7", () => {
    // Guidance repeats by default. The legacy environment value must not change
    // authorized content, scope isolation or recovery information.
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
    describe.each(['modern', 'legacy'] as const)("guidance contracts", protocol => {
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
        it('seeds orientation before a naive caller searches for a guide, without rewriting operation data', async () => {
            const owner = await h.account(), session = await owner.session(), p = await connect(owner, [session.id]);
            const index = await p.client.listTools();
            expect(index.tools.map(tool => tool.name)).toEqual(DISCOVERY_TOOL_NAMES);
            const lookup = async (query: string) => (await p.client.callTool({ name: 'kanvas_discover', arguments: { catalog: 'tools', action: 'get', id: query } })).structuredContent as any;
            const submit = (await lookup('kanvas.submit')).data.entry, viewer = (await lookup('kanvas.viewers.read')).data.entry;
            expect(JSON.stringify(submit)).toMatch(/current displays and revisions/);
            expect(JSON.stringify(submit)).toContain('kanvas_call');
            expect(viewer.description?.slice(0, 500)).toMatch(/location.*weather|weather.*location/i);
            expect(p.client.getServerVersion()?.description).toMatch(/weather|near-me/);
            expect(p.client.getInstructions()).toContain('glanceable');
            expect(p.client.getInstructions()).toContain('kanvas.session.state');
            expect(p.client.getInstructions()).toContain('never bypasses host approvals');
            const result = await p.call("kanvas.sessions.list");
            expect(value<SessionRecord[]>(result).map(x => x.id)).toEqual([session.id]);
            expect(result.structuredContent?.orientation?.guide).toEqual({ tool: 'kanvas_discover', arguments: { catalog: 'help', action: 'search', query: 'getting-started' } });
            const display = value<DisplayRecord>(await p.call("kanvas.display.register", { sessionId: session.id, name: 'Screen', width: 1280, height: 800 }));
            const accepted = await p.call("kanvas.submit", { sessionId: session.id, displayIds: [display.id], requestId: 'quiet-publish', view: fact('One useful visual') });
            expect(value<UpdateRecord>(accepted).status).toBe('accepted');
            expect(accepted.structuredContent?.orientation).toBeDefined();
            expect((await owner.settle(session.id, 'quiet-publish')).detail.displays[0].view?.data.text).toBe('One useful visual');
        });
        it('makes focused guidance read-only and keeps dynamic settings in current state', async () => {
            const owner = await h.account(), session = await owner.session(), p = await connect(owner, [session.id]);
            const original = (await owner.detail(session.id)).session;
            const inventory = await p.client.callTool({ name: 'kanvas_discover', arguments: { catalog: 'help', action: 'list' } });
            const text = (inventory.content as {
                text: string;
            }[])[0].text;
            for (const topic of GUIDE_TOPICS)
                expect(text).toContain(`kanvas.help.${topic}`);
            const feedback = value<{
                entry: {
                    content: {
                        descriptionCharacters: number;
                    };
                };
            }>(await p.client.callTool({ name: 'kanvas_discover', arguments: { catalog: 'help', action: 'get', id: 'kanvas.help.feedback.limits' } }) as Result);
            expect(feedback.entry.content.descriptionCharacters).toBe(12000);
            const templates = await p.client.callTool({ name: 'kanvas_discover', arguments: { catalog: 'templates', action: 'list' } });
            expect((templates.content as {
                text: string;
            }[])[0].text.split('\n').filter(line => line.includes(' — '))).toHaveLength(TEMPLATE_IDS.length);
            expect((await owner.detail(session.id)).session).toEqual(original);
            const previous = await p.call("kanvas.session.state", { sessionId: session.id });
            const next = value<SessionRecord>(await p.call("kanvas.config.update", { sessionId: session.id, expectedRevision: original.configRevision, config: { theme: 'light' } }));
            expect(next.config.theme).toBe('light');
            const updated = await p.call("kanvas.session.state", { sessionId: session.id });
            expect(value<{
                session: SessionRecord;
            }>(updated).session.config).toMatchObject({ theme: 'light' });
            expect(updated.structuredContent?.orientation).toEqual(previous.structuredContent?.orientation);
            expect(JSON.stringify(updated.structuredContent?.orientation)).not.toContain('"config"');
            const topic = value<{
                entry: {
                    note: string;
                };
            }>(await p.client.callTool({ name: 'kanvas_discover', arguments: { catalog: 'help', action: 'get', id: 'kanvas.help.templates.publishing' } }) as Result);
            expect(topic.entry.note).toContain('Static');
        });
    });
});
