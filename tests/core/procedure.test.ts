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

describe("procedure coverage 1", () => {
    describe("procedure contracts", () => {
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
        it('preserves every procedure step while advancing, retrying and returning from completion without content regeneration', async () => {
            const steps = ['First exact step.', 'Second exact step.', 'Third exact step.'];
            await owner.submit(s, [d], { version: 1, template: 'recipe', data: { name: 'A guide', materials: ['Exact material'], steps, mode: 'steps' } });
            const request = { sessionId: s, displayId: d, requestId: randomUUID(), expectedRevision: 1, action: 'next' };
            const first = await call("kanvas.procedure.control", request);
            expect(await call("kanvas.procedure.control", request)).toMatchObject({ interaction: { id: (first as {
                        interaction: InteractionRecord;
                    }).interaction.id, value: (first as {
                        interaction: InteractionRecord;
                    }).interaction.value } });
            expect((await current()).revision).toBe(2);
            for (const action of ['next', 'next', 'next', 'back']) {
                await call("kanvas.procedure.control", { ...request, requestId: randomUUID(), expectedRevision: (await current()).revision, action });
                expect((await current()).view?.data.steps).toEqual(steps);
            }
            expect((await current()).view?.data).toMatchObject({ index: 2, stage: 'step' });
            await expect(call("kanvas.procedure.control", { ...request, requestId: randomUUID() })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
            expect((await owner.detail(s)).updates).toHaveLength(1);
        });
    });
});

describe("procedure coverage 2", () => {
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
        it('1668dad7: the agent\'s own procedure control is not pending viewer input; untitled entries get a label', async () => {
            await o.submit(s, [d], { version: 1, template: 'procedure', data: { name: 'Setup', steps: ['Unpack', 'Plug in', 'Switch on'] } } as never);
            await call("kanvas.procedure.control", { sessionId: s, displayId: d, action: 'start', requestId: randomUUID() });
            await call("kanvas.procedure.control", { sessionId: s, displayId: d, action: 'next', requestId: randomUUID() });
            expect((await call("kanvas.interactions.read", { sessionId: s })).interactions).toEqual([]);
            const all = (await call("kanvas.interactions.read", { sessionId: s, status: 'all' })).interactions;
            expect(all.length).toBeGreaterThanOrEqual(2);
            expect(all.every((i: {
                source?: string;
                status: string;
            }) => i.source === 'agent' && i.status === 'acknowledged')).toBe(true);
            expect(derivedViewLabel({ template: 'poll', data: { question: 'Which tempo matters most to you this quarter?', options: [] } } as never)).toBe('poll: Which tempo matters most to you this qu…');
            expect(derivedViewLabel({ template: 'quote', data: { text: 'Make room for the idea.' } } as never)).toBe('quote: Make room for the idea.');
            expect(derivedViewLabel({ template: 'drafting', data: { text: 'Dear team,\nSecond line' } } as never)).toBe('drafting: Dear team,');
            expect(derivedViewLabel({ template: 'quote', title: 'Already titled', data: { text: 'x' } } as never)).toBeUndefined();
            await o.submit(s, [d], { version: 1, template: 'quote', data: { text: 'Make room for the idea.', attribution: 'Kanvas' } } as never);
            const history = await call("kanvas.display.history", { sessionId: s, displayId: d });
            expect(history.entries.at(-1).title).toBe('quote: Make room for the idea.');
            expect(history.entries.every((e: {
                title?: string | null;
                template: string | null;
            }) => !e.template || e.title)).toBe(true);
            const pin = await call("kanvas.pin.save", { sessionId: s, displayId: d, label: 'keep', requestId: randomUUID() });
            expect(pin.title).toBe('quote: Make room for the idea.');
            expect((await call("kanvas.pins.read", { sessionId: s, displayId: d }))[0]).toMatchObject({ title: 'quote: Make room for the idea.', template: 'quote' });
        });
    });
});
