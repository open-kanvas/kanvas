
import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import { fact } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import type { ViewSpec } from '../../src/shared/types.js';
import { toolFailure } from '../../src/server/mcp/results.js';
import { toolSuccess } from '../../src/server/mcp/results.js';
import { canonicalToolDefinitions } from '../../src/server/mcp/canonical.js';
import { operationEntries } from '../../src/server/mcp/operations.js';
import { AppError } from '../../src/server/store.js';
import { ACCESS_LIMITS } from '../../src/server/access-flows.js';
import { vi } from 'vitest';
import { randomUUID } from 'node:crypto';
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
import { createApp } from '../../src/server/app';
import { hash } from '../../src/server/auth';
import { safePushEndpoint } from '../../src/server/push';
import { diagnosticBatchSchema } from '../../src/shared/frontend-diagnostics';
import { diagnosticRoute } from '../../src/shared/frontend-diagnostics';
import { chatDataSchema } from '../../src/shared/work-views';
import { flashcardDataSchema } from '../../src/shared/flashcards';
import { advanceFlashcards } from '../../src/shared/flashcards';
import { flashcardControlSchema } from '../../src/shared/flashcards';
import type { Request } from 'express';
import type { Response } from 'express';
import { inToolContext } from '../../src/server/mcp/call-context.js';
import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { chartDataSchema } from '../../src/shared/chart-contract';
import { stackChart } from '../../src/shared/chart-stacks';
import { feedbackSubmitSchema } from '../../src/shared/reports';
import { visualHelp } from '../../src/server/visual-help';
import { HELP_TOPICS } from '../../src/shared/help';
import { Checklists } from '../../src/server/checklists.js';
import { resolveToolCall } from '../../src/server/mcp/catalog.js';
describe("account coverage 1", () => {
    describe("account contracts", () => {
        let h!: Harness, owner: Browser, sessionId: string, displayId: string, p: AuthPrincipal;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const call = async (name: string, args: unknown) => (await h.runtime.service.execute(name, args, p)) as any;
        const path = (id = displayId) => `/api/sessions/${sessionId}/displays/${id}`;
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); sessionId = (await owner.session()).id; displayId = (await owner.display(sessionId)).id; p = { userId: owner.user!.id }; });
        afterEach(async () => { await h?.close(); });
        it('names the current view on each topology display node', async () => {
            await owner.submit(sessionId, [displayId], fact('Plain fact'));
            const node = async () => (await call("kanvas.topology.read", { sessionId })).displays.find((d: {
                id: string;
            }) => d.id === displayId);
            expect((await node()).view).toMatchObject({ template: 'fact', label: 'Quick Fact' });
            await owner.submit(sessionId, [displayId], { ...fact('Titled'), title: 'Morning briefing' });
            expect((await node()).view).toMatchObject({ template: 'fact', title: 'Morning briefing', label: 'Morning briefing' });
        });
        it('lists ended sessions too, so the account can still find them (fixes sessions.list dropping ended sessions)', async () => {
            const gone = await owner.session('Gone');
            await h.runtime.service.execute("kanvas.session.end", { sessionId: gone.id }, p);
            const listed = (await h.runtime.service.sessions(p));
            expect(listed.find(session => session.id === gone.id)).toMatchObject({ role: 'owner', endedAt: expect.any(String) });
            expect(listed.find(session => session.id === sessionId)).toMatchObject({ role: 'owner' });
            expect(listed.find(session => session.id === sessionId)?.endedAt).toBeUndefined();
        });
    });
});
describe("account coverage 2", () => {
    const context = { principal: { userId: 'catalog-reader' } };
    const search = (kind: 'tool' | 'template' | 'help', query: string, limit = 3) => (discoveryCatalog.query(kind, 'search', { query, limit }, context).results as {
        id: string;
        description: string;
        example?: unknown;
    }[]);
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
        it('43bcc861: the automatically created Home session does not use a slot (the "limit at 9" report)', async () => {
            const before = await h.runtime.service.sessionUsage(p.userId);
            const entries = await h.runtime.store.list<{
                sessionId?: string;
            }>('account-entry');
            const visible = (await h.runtime.service.sessions(p)).filter(session => session.ownerId === p.userId).length;
            expect(before.active).toBe(visible - entries.filter(e => e.sessionId).length);
        });
        it('684bd79e: a person is shown by name or the part before the @, never by email, and a profile change shows at once', async () => {
            expect(personLabel({ displayName: 'oystein.sandvik@example.org', username: 'oystein.sandvik@example.org' })).toBe('oystein.sandvik');
            expect(personLabel({ displayName: 'Øystein', username: 'o@example.org' })).toBe('Øystein');
            expect(safeLabel('someone@example.org')).toBe('someone');
            expect(displayNameUnset({ displayName: 'a@b.no', username: 'a@b.no' })).toBe(true);
            expect(displayNameUnset({ displayName: 'Anna', username: 'a@b.no' })).toBe(false);
            await h.runtime.store.db.prepare('UPDATE users SET username=?,display_name=? WHERE id=?').run('new.person@example.org', 'new.person@example.org', o.user!.id);
            expect(await h.runtime.auth.user(o.user!.id)).toMatchObject({ displayName: 'new.person' });
            expect(await h.runtime.auth.displayNameSet(o.user!.id)).toBe(false);
            expect((await h.runtime.service.responseContext(p, {}, 'c')).displayNameHint).toMatch(/no display name yet/);
            const controller = new AbortController();
            await o.raw(`/api/sessions/${s}/events?displayId=${d}&tabId=tv`, {}, { signal: controller.signal });
            const names = async () => success(await o.request<ViewerPresence[]>('GET', `/api/sessions/${s}/viewers`)).map(v => v.name);
            expect(await names()).toEqual(['new.person']);
            const notices = success(await o.request<ToastRecord[]>('GET', '/api/account/notices'));
            expect(JSON.stringify(notices)).not.toContain('@example.org');
            expect(notices.some(n => n.text.startsWith('new.person connected'))).toBe(true);
            await call("kanvas.profile.update", { displayName: 'Øystein' });
            // Same connection, no reconnect: the name is resolved at read time.
            expect(await names()).toEqual(['Øystein']);
            expect((await h.runtime.service.responseContext(p, {}, 'c')).displayNameHint).toBeUndefined();
            controller.abort();
        });
        it('d630abcc: agents are recognised from connection data, scoped to the account, and can be revoked by another agent', async () => {
            expect(agentType('Anthropic/ClaudeAI', 'Claude-User')).toBe('Claude.ai');
            expect(agentType('openai-mcp', 'openai-mcp/1.0.0')).toBe('ChatGPT');
            expect(agentType('openai-mcp (Codex)', '')).toBe('Codex');
            expect(agentType('connectors-manager', 'grok-connectors-manager/0.1.0')).toBe('Grok');
            expect(agentType('claude-code', 'claude-cli/2.1.319')).toBe('Claude Code');
            expect(agentType('my-tool', 'curl/8')).toBe('Custom agent');
            await h.runtime.auth.issueToken(p.userId, 'Phone agent', ['read', 'publish']);
            const stored = (await h.runtime.store.list<{
                id: string;
                agentId: string;
                userId: string;
                name: string;
            }>('token')).find(token => token.userId === p.userId && token.name === 'Phone agent')!;
            const claude = await agentPrincipal('Claude agent'), codex = { userId: p.userId, agentId: stored.agentId, tokenId: stored.id };
            const invoke = (principal: typeof claude, canonical: string, clientName: string, userAgent: string, sessionId?: string, createdSession?: boolean) => h.runtime.service.recordToolCall(principal, { id: randomUUID(), tool: 'kanvas_call', operation: canonical, canonical, sessionId, ...(createdSession ? { createdSession } : {}), timestamp: new Date().toISOString(), status: 'completed', durationMs: 5, clientContext: { clientName, clientVersion: '1.0.0', userAgent } });
            await invoke(claude, "kanvas.session.create", 'Anthropic/ClaudeAI', 'Claude-User', s);
            await invoke(claude, "kanvas.submit", 'Anthropic/ClaudeAI', 'Claude-User', s);
            await invoke(codex, "kanvas.submit", 'openai-mcp (Codex)', 'openai-mcp/1.0.0', s);
            const list = await call("kanvas.agents.read", {}, claude);
            expect(list.agents.map((a: {
                name: string;
            }) => a.name).sort()).toEqual(['Claude.ai', 'Codex']);
            const mine = list.agents.find((a: {
                thisConnection?: boolean;
            }) => a.thisConnection);
            expect(mine).toMatchObject({ name: 'Claude.ai', connectedNow: true, sessionCount: 1, lastSession: 'Acceptance session' });
            expect(validateView(list.view).template).toBe('agents');
            const detail = await call("kanvas.agents.read", { agentId: mine.agentId }, claude);
            expect(detail.agent.sessions[0]).toMatchObject({ sessionId: s, created: true });
            expect(detail.agent.log.map((l: {
                kind: string;
            }) => l.kind)).toEqual(['published a view', 'created a session']);
            // Session overview names the creating agent from the connection. Another agent that merely publishes into the
            // session moments later did not create it; a first publish whose result says it made the session did.
            const { accountOverview } = await import('../../src/server/account-overview.js');
            const overview = async (id: string) => (await accountOverview(h.runtime.service, p)).sessions.find((x: {
                id: string;
            }) => x.id === id) as {
                createdBy?: string;
            };
            expect(await overview(s)).toMatchObject({ createdBy: 'Claude.ai' });
            const byHand = (await o.session()).id;
            await invoke(codex, "kanvas.submit", 'openai-mcp (Codex)', 'openai-mcp/1.0.0', byHand);
            expect((await overview(byHand)).createdBy).toBeUndefined();
            const implicit = (await o.session()).id;
            await invoke(codex, "kanvas.submit", 'openai-mcp (Codex)', 'openai-mcp/1.0.0', implicit, true);
            expect(await overview(implicit)).toMatchObject({ createdBy: 'Codex' });
            // Another account sees none of this.
            const other = await h.account();
            expect((await call("kanvas.agents.read", {}, { userId: other.user!.id })).agents).toEqual([]);
            await expect(call("kanvas.agents.read", { agentId: mine.agentId }, { userId: other.user!.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
            await expect(call("kanvas.agents.revoke", { agentId: mine.agentId, confirm: true }, claude)).rejects.toMatchObject({ status: 409 });
            const target = list.agents.find((a: {
                name: string;
            }) => a.name === 'Codex');
            await expect(call("kanvas.agents.revoke", { agentId: target.agentId, confirm: true }, { userId: other.user!.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
            expect(await call("kanvas.agents.revoke", { agentId: target.agentId, confirm: true }, claude)).toMatchObject({ revoked: true });
            expect((await h.runtime.store.get<{
                revoked?: boolean;
            }>('token', stored.id))?.revoked).toBe(true);
            expect((await call("kanvas.agents.read", {}, claude)).agents.find((a: {
                name: string;
            }) => a.name === 'Codex')).toMatchObject({ access: 'revoked-or-expired', connectedNow: false });
        });
    });
});
describe("account coverage 3", () => {
    describe('multi-target rendering failure accountability', () => {
        it('retains every previous view, preserves actionable failure fields and accounts for all target attempts', async () => {
            const h = await startHarness({ interpreter: { async interpret(input) {
                        if (input.display.width < 1000) {
                            const error = new RenderingError('INVALID_SOURCE_CONTENT', 'Private ignored', false, [{ path: 'view.data.items', code: 'invalid_type', rule: 'Expected an array.' }]);
                            error.metrics = { validationMs: 2 };
                            throw error;
                        }
                        return { action: 'replace', view: fact('Would succeed'), metrics: { validationMs: 1 } };
                    } } });
            try {
                const owner = await h.account(), session = await owner.session(), a = await owner.display(session.id, 'A', 800), b = await owner.display(session.id, 'B', 1200);
                await owner.submit(session.id, [a.id, b.id], fact('Prior good view'));
                const requestId = randomUUID();
                success(await owner.request('POST', `/api/sessions/${session.id}/submit`, { displayIds: [a.id, b.id], requestId, intent: 'Render' }));
                const settled = await owner.settle(session.id, requestId);
                expect(settled.update.status).toBe('failed');
                expect(settled.update.errorCode).toBe('INVALID_SOURCE_CONTENT');
                expect(settled.update.validationIssues).toEqual([{ path: 'view.data.items', problem: 'Expected an array.' }]);
                expect(settled.update.metrics).toMatchObject({ validationMs: 3 });
                expect(settled.detail.displays.every(display => display.view?.data.text === 'Prior good view')).toBe(true);
                expect(JSON.stringify(settled.update)).not.toContain('Private ignored');
            }
            finally {
                await h.close();
            }
        });
    });
});
describe("account coverage 4", () => {
    describe("account contracts", () => {
        let h!: Harness, owner: Browser, s: string, d: string, p: AuthPrincipal;
        const send = vi.fn(async (_subscription: unknown, _payload: string) => ({ statusCode: 201 }));
        beforeEach(async () => { send.mockClear(); h = await startHarness({ pushOptions: { publicKey: 'test-public-key', privateKey: 'test-private-key', subject: 'mailto:test@example.invalid', send } }); owner = await h.account(); s = (await owner.session()).id; d = (await owner.display(s)).id; p = { userId: owner.user!.id }; });
        afterEach(async () => { await h?.close(); });
        async function deck() { const result = await owner.submit(s, [d], { version: 1, template: 'flashcards', data: { mode: 'test', cards: [{ id: 'hola', prompt: 'hola', answer: 'hello', acceptedAnswers: ['hi'] }, { id: 'adios', prompt: 'adiós', answer: 'goodbye' }] } }); expect(result.update.status).toBe('prepared'); return result.detail.displays.find(x => x.id === d)!; }
        it('retains progress across replacement and restores on a different display without cross-account access', async () => {
            const display = await deck(), deckId = String(display.view!.data.deckId);
            await owner.submit(s, [d], { version: 1, template: 'fact', data: { text: 'Other content' } });
            const other = await owner.display(s);
            await h.runtime.service.flashcards.show(p, { sessionId: s, deckId, displayId: other.id, expectedRevision: 0, requestId: 'restore' });
            expect((await owner.detail(s)).displays.find(x => x.id === other.id)!.view!.data.deckId).toBe(deckId);
            const stranger = await h.account();
            await expect(h.runtime.service.flashcards.read({ userId: stranger.user!.id }, { sessionId: s, deckId })).rejects.toThrow();
        });
        const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/inert', keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } };
    });
});
describe("account coverage 5", () => {
    let h!: Harness;
    afterEach(async () => { await h?.close(); });
    it('keeps optional context per connection, distinguishes inferred hints, and confines it to its account', async () => {
        h = await startHarness();
        const owner = await h.account(), other = await h.account(), s = await owner.session('Client history'), service = h.runtime.service, p = { userId: owner.user!.id, agentId: 'agent-one' };
        const context = { tool: 'kanvas_call' as const, operation: 'kanvas.client.context.update', canonicalName: "kanvas.client.context.update", connectionId: 'connection-one', inferred: { clientName: 'MCP runtime', clientVersion: '1', userAgent: 'Test agent' } };
        const first: any = await inToolContext(context, () => service.execute("kanvas.client.context.update", { sessionId: s.id, clientDetails: { agent: 'Voice agent', model: 'Example', interaction_mode: 'voice' } }, p));
        expect(first).toMatchObject({ selfReported: { agent: 'Voice agent' }, inferred: { clientName: 'MCP runtime' }, verified: false });
        expect(first.conflicts).toHaveLength(1);
        await inToolContext({ ...context, connectionId: 'connection-two' }, () => service.execute("kanvas.client.context.update", { sessionId: s.id, clientDetails: { agent: 'Another agent' } }, p));
        const detail = await service.detail(p, s.id);
        expect(detail.session.agentConnections).toHaveLength(2);
        expect((await service.sessions(p)).find(x => x.id === s.id)?.agentConnections).toHaveLength(2);
        const report: any = await inToolContext(context, () => service.execute("kanvas.feedback.submit", { sessionId: s.id, requestId: 'feedback-context', title: 'Explicit test', description: 'Test context', clientDetails: { effort_or_mode: 'high' } }, p));
        expect(report.clientContext).toMatchObject({ selfReported: { agent: 'Voice agent', effort_or_mode: 'high' }, inferred: { clientName: 'MCP runtime' } });
        await expect(service.execute("kanvas.client.context.update", { sessionId: s.id, clientDetails: {} }, { userId: other.user!.id })).rejects.toThrow();
        expect((await service.sessions({ userId: other.user!.id })).find(x => x.id === s.id)).toBeUndefined();
    });
});
describe("account coverage 6", () => {
    let h!: Harness;
    afterEach(async () => { await h?.close(); });
    it('accepts scope-free feedback context, preserves account provenance, and refuses foreign context', async () => {
        h = await startHarness();
        const owner = await h.account(), other = await h.account(), session = await owner.session(), s = h.runtime.service;
        const input = feedbackSubmitSchema.parse({ requestId: 'general', title: 'Feedback', description: 'A general report' });
        expect(feedbackSubmitSchema.safeParse({ ...input, scope: 'service' }).success).toBe(false);
        const record = await s.reports.submit({ userId: owner.user!.id }, 'feedback', input);
        expect(record.accountId).toBe(owner.user!.id);
        expect(record).not.toHaveProperty('scope');
        expect(record).not.toHaveProperty('sessionId');
        expect((await s.reports.read({ userId: other.user!.id }, { allAccounts: false, kind: 'all', status: 'all', limit: 10 })).reports).toEqual([]);
        await expect(s.reports.submit({ userId: other.user!.id }, 'feedback', { ...input, requestId: 'foreign', sessionId: session.id })).rejects.toThrow();
    });
});
describe("account coverage 7", () => {
    let h!: Harness;
    afterEach(async () => { delete process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT; await h?.close(); });
    describe('idle receiver registration', () => {
        it('an authenticated account with zero sessions is visible as an idle connected receiver', async () => {
            h = await startHarness();
            const user = await h.runtime.auth.register({ username: 'empty_' + randomUUID().slice(0, 8), password: randomUUID() });
            const browser = await h.runtime.auth.issueBrowser(user.id, { cookie: () => { } } as unknown as Response), p = { userId: user.id, browserId: browser.id };
            expect(await h.runtime.service.sessions(p)).toHaveLength(0);
            const device = await h.runtime.service.devices.register(p, { installationId: 'fresh-root', provisionHome: false }, 'Mozilla/5.0');
            const window = await h.runtime.service.devices.windows.register(p, device.id, 'fresh-root-tab'), stream = await h.runtime.service.devices.windows.stream(p, device.id, window.id, () => { });
            await stream.push();
            try {
                expect((await h.runtime.service.devices.list(p)).devices).toContainEqual(expect.objectContaining({ id: device.id, connected: true }));
                expect(await h.runtime.service.sessions(p)).toHaveLength(0);
            }
            finally {
                stream.close();
            }
        });
        it('the HTTP opt-out is accepted and explicit entry opening lazily creates one reusable Home', async () => {
            h = await startHarness();
            const a = await h.account(), initialSessions = (await h.runtime.store.list('session')).length;
            const device: any = success(await a.request('POST', '/api/devices/register', { installationId: 'idle-http', windowId: 'console-tab', provisionHome: false }));
            expect(device.home).toBeUndefined();
            expect((await h.runtime.store.list('session'))).toHaveLength(initialSessions);
            const opened: any = success(await a.request('POST', '/api/entry/open', { deviceId: device.id }));
            expect(opened.sessionId).toBeTruthy();
            expect((await h.runtime.store.list('session'))).toHaveLength(initialSessions);
            const again: any = success(await a.request('POST', '/api/entry/open', { deviceId: device.id }));
            expect(again).toEqual(opened);
            expect((await h.runtime.store.list('session'))).toHaveLength(initialSessions);
            const registered: any = success(await a.request('POST', '/api/devices/register', { installationId: 'idle-http', windowId: 'console-tab', provisionHome: false }));
            expect(registered.home).toEqual(opened);
        });
    });
});
describe("account coverage 8", () => {
    let h!: Harness;
    afterEach(async () => { await h?.close(); });
    async function principal(a: Browser) { const session = await h.runtime.auth.issueBrowser(a.user!.id, { cookie: () => { } } as unknown as Response); return { userId: a.user!.id, browserId: session.id }; }
    const view = { version: 1 as const, template: 'checklist' as const, title: 'Release tasks', data: { items: [{ id: 'a', text: 'Review', checked: false }, { id: 'b', text: 'Test', checked: false }] } };
    describe("account contracts", () => {
        it('own account identity and quota tier are bounded to account-wide authority', async () => {
            h = await startHarness();
            const a = await h.account(), p = await principal(a);
            await h.runtime.store.put('verified-email', { id: p.userId, email: 'owner@example.test', verifiedAt: new Date().toISOString() });
            await h.runtime.store.put('account-tier', { id: p.userId, tier: 'admin' });
            const result: any = await h.runtime.service.execute("kanvas.account.details", {}, p);
            expect(result).toMatchObject({ id: p.userId, email: 'owner@example.test', emailVerified: true, tier: 'admin', quotaExempt: true, limits: { sessions: null, retainedViewsPerSession: 1000 } });
            expect(await h.runtime.service.accounts.isServiceAdmin(p)).toBe(false);
            expect(await h.runtime.service.verifyView(p, (await a.session()).id, result.publishRecipe.view)).toMatchObject({ template: 'table' });
            const grant = await h.runtime.auth.issueToken(p.userId, 'Selected', ['read'], ['some-session']);
            await expect(h.runtime.service.execute("kanvas.account.details", {}, { userId: p.userId, tokenId: grant.token.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
            const q = await principal(await h.account());
            expect((await h.runtime.service.accountDetails(q)).email).toBeNull();
        });
    });
});
