
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
import { configPatchSchema } from '../../src/shared/preferences.js';
import { vi } from 'vitest';
import { randomUUID } from 'node:crypto';
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
import { applyChecklistChanges } from '../../src/server/checklists.js';
import { checklistTools } from '../../src/server/checklists.js';
import { CHECKLIST_RETAINED_REVISIONS } from '../../src/server/checklists.js';
import { toastBuiltInIcon } from '../../src/shared/viewer-experience.js';
import { TOAST_TYPES } from '../../src/shared/viewer-experience.js';
import { PRESENCE_GRACE_MS } from '../../src/server/receiving-presence.js';
import { PRESENCE_LEAVE_MS } from '../../src/server/receiving-presence.js';
import { runPrivacyCycle } from '../../src/client/device-privacy-check.js';
import { privacyBackoffMs } from '../../src/client/device-privacy-check.js';
import { PRIVACY_DEADLINE_MS } from '../../src/client/device-privacy-check.js';
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
import type { Request } from 'express';
import type { Response } from 'express';
import { inToolContext } from '../../src/server/mcp/call-context.js';
import { EventEmitter } from 'node:events';
import type { KanvasService } from '../../src/server/domain.js';
import type { UpdateRecord } from '../../src/shared/types.js';
import { stackChart } from '../../src/shared/chart-stacks.js';
import { chartDataSchema } from '../../src/shared/chart-contract.js';
import { menuBoardSchema } from '../../src/shared/venue.js';
import { redactDeliveryRequest } from '../../src/server/delivery-telemetry.js';
import { deliveryIngress } from '../../src/server/delivery-telemetry.js';
import { recordDeliveryRequest } from '../../src/server/delivery-telemetry.js';
import { readingDefaults } from '../../src/shared/reading.js';
import { liveSurfaceLayout } from '../../src/shared/live-surface.js';
import { accountTier } from '../../src/server/usage-limits.js';
import { accountUsageLimits } from '../../src/server/usage-limits.js';
import { VisualCaptureResult } from '../../src/server/visual-capture.js';
import { resolveToolCall } from '../../src/server/mcp/catalog.js';
import { Checklists } from '../../src/server/checklists.js';
describe("device coverage 1", () => {
    describe("device contracts", () => {
        let h!: Harness, owner: Browser, sessionId: string, displayId: string, p: AuthPrincipal;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const call = async (name: string, args: unknown) => (await h.runtime.service.execute(name, args, p)) as any;
        const path = (id = displayId) => `/api/sessions/${sessionId}/displays/${id}`;
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); sessionId = (await owner.session()).id; displayId = (await owner.display(sessionId)).id; p = { userId: owner.user!.id }; });
        afterEach(async () => { await h?.close(); });
        it('identifies displays with stable numbers without changing revisions', async () => {
            const second = await owner.display(sessionId, 'Second screen');
            const revisions = async () => Object.fromEntries((await owner.detail(sessionId)).displays.map(d => [d.id, d.revision]));
            const before = await revisions();
            const result = await call("kanvas.displays.identify", { sessionId });
            expect(result.identified.map((d: {
                ordinal: number;
            }) => d.ordinal)).toEqual([1, 2]);
            expect(result.identified[1]).toMatchObject({ displayId: second.id, name: 'Second screen', online: false });
            expect(await revisions()).toEqual(before);
            await expect(call("kanvas.displays.identify", { sessionId, displayIds: ['not-in-session'] })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
        });
        it('serves the live display grid only to a display that shows it', async () => {
            const wall = await owner.display(sessionId, 'Wall');
            await owner.submit(sessionId, [wall.id], fact('On the wall'));
            expect((await owner.request('GET', `${path()}/grid`)).status).toBe(409);
            await owner.submit(sessionId, [displayId], { version: 1, template: 'display-grid', data: {} } as ViewSpec);
            const grid = success(await owner.request<{
                tiles: unknown[];
                total: number;
            }>('GET', `${path()}/grid`));
            expect(grid.total).toBe(2);
            expect(grid.tiles).toEqual([expect.objectContaining({ displayId: wall.id, name: 'Wall', template: 'fact', online: false, view: expect.objectContaining({ data: expect.objectContaining({ text: 'On the wall' }) }) })]);
        });
        it('keeps devices.read truthful, live-embed checks scoped, and the static demo retired', async () => {
            const devices = await call("kanvas.devices.read", {});
            expect(devices.devices).toEqual([]);
            expect(devices.publishRecipe).toBeUndefined();
            const revision = (await owner.submit(sessionId, [displayId], fact('Not a web page'))).detail.displays[0].revision;
            expect((await owner.request('POST', `${path()}/web-embed`, { expectedRevision: revision })).status).toBe(404);
            expect(canonicalToolDefinitions().some(tool => /^kanvas[._]demo(?:[._]|$)/.test(tool.name))).toBe(false);
            expect(operationEntries().some(entry => entry.operation.startsWith('kanvas.demo.'))).toBe(false);
        });
    });
});
describe("device coverage 2", () => {
    let h!: Harness;
    afterEach(async () => { await h?.close(); });
    describe("device contracts", () => {
        it('round-trips IANA zones, seeds new sessions only, and accepts explicit device reset', async () => {
            h = await startHarness();
            const owner = await h.account(), s = (await owner.session()).id;
            expect(configPatchSchema.safeParse({ timeZone: 'Invented/Zone' }).success).toBe(false);
            success(await owner.request('PATCH', `/api/sessions/${s}/config`, { expectedRevision: 0, config: { timeZone: 'Europe/Oslo', timeFormat: '24h' } }));
            expect((await owner.detail(s)).session.config.timeZone).toBe('Europe/Oslo');
            const principal = { userId: owner.user!.id }, pref = await h.runtime.service.execute("kanvas.preferences.get", {}, principal) as any;
            await h.runtime.service.execute("kanvas.preferences.update", { expectedRevision: pref.revision, config: { timeZone: 'America/New_York' } }, principal);
            expect((await owner.session()).config.timeZone).toBe('America/New_York');
            expect((await owner.detail(s)).session.config.timeZone).toBe('Europe/Oslo');
            success(await owner.request('PATCH', `/api/sessions/${s}/config`, { expectedRevision: 1, config: { timeZone: '' } }));
            expect((await owner.detail(s)).session.config.timeZone).toBe('');
        });
    });
});
describe("device coverage 3", () => {
    describe("device contracts", () => {
        let h!: Harness, owner: Browser, sessionId: string, displayId: string;
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); sessionId = (await owner.session()).id; displayId = (await owner.display(sessionId)).id; });
        afterEach(async () => { await h?.close(); });
        it('locks all browser API routes, persists state, preserves other devices and restores content', async () => {
            await owner.submit(sessionId, [displayId], fact('Sensitive source'));
            const device = success(await owner.request<{
                id: string;
            }>('POST', '/api/devices/register', { installationId: randomUUID(), provisionHome: false }));
            const p = { userId: owner.user!.id };
            const outsider = await h.account();
            await expect(h.runtime.service.privacy.set({ userId: outsider.user!.id }, { deviceId: device.id }, true)).rejects.toMatchObject({ code: 'NOT_FOUND' });
            await h.runtime.service.execute("kanvas.device.lock", { deviceId: device.id }, p);
            for (const path of ['/api/auth/me', '/api/sessions', `/api/sessions/${sessionId}`, `/api/sessions/${sessionId}/displays/${displayId}/history`]) {
                const result = await owner.request('GET', path);
                expect(result.status).toBe(423);
                expect(result.text).not.toContain('Sensitive source');
            }
            expect(success(await owner.request<{
                locked: boolean;
            }>('GET', '/api/device-privacy/status')).locked).toBe(true);
            expect(success(await outsider.request('GET', '/api/sessions'))).toBeDefined();
            expect((await h.runtime.store.get<any>('device-privacy', device.id)).locked).toBe(true);
            await h.runtime.service.execute("kanvas.device.unlock", { deviceId: device.id }, p);
            expect((await owner.detail(sessionId)).displays[0].view?.data.text).toBe('Sensitive source');
        });
        it('serializes presence disconnect reads with concurrent owner lockdown writes', async () => {
            const p = { userId: owner.user!.id }, disconnect = await h.runtime.service.connectDisplay(p, sessionId, displayId);
            let start!: () => void;
            const signal = new Promise<void>(resolve => { start = resolve; });
            // Create outside the transaction so the callback does not inherit its ALS context.
            const pending = (async () => { await signal; await disconnect(); })();
            try {
                await h.runtime.store.atomic(async () => {
                    const display = await h.runtime.store.get<any>('display', displayId);
                    display.lockdown = true;
                    await h.runtime.store.put('display', display);
                    const read = vi.spyOn(h.runtime.store, 'get');
                    try {
                        start();
                        await new Promise<void>(resolve => setImmediate(resolve));
                        expect(read.mock.calls.filter(([kind]) => kind === 'display')).toHaveLength(0);
                    }
                    finally {
                        read.mockRestore();
                    }
                });
            }
            finally {
                start();
                await pending;
            }
            expect(await h.runtime.store.get<any>('display', displayId)).toMatchObject({ lockdown: true, online: false });
        });
    });
});
describe("device coverage 4", () => {
    const toastSchema = experienceTools.find(t => t.name === "kanvas.toast")!.schema;
    describe("device contracts", () => {
        let h!: Harness, owner: Browser, s: string, d: string;
        const p = () => ({ userId: owner.user!.id });
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); s = (await owner.session()).id; d = (await owner.display(s)).id; await vi.waitFor(async () => expect((await h.runtime.store.query("SELECT count(*)::int n FROM events WHERE event_type='browser.operation' AND operation='kanvas.display.register'")).rows[0].n).toBe(1)); });
        afterEach(async () => { await h?.close(); });
        it('stamps new sessions/window reports without inventing a historical release', async () => {
            expect((await h.runtime.service.access(p(), s)).serverVersion).toBe(KANVAS_VERSION);
            const device = success(await owner.request<any>('POST', '/api/devices/register', { installationId: randomUUID(), windowId: randomUUID(), clientVersion: '0.35.0', provisionHome: false }));
            expect(device.window.clientVersion).toBe('0.35.0');
            const legacy = { id: 'legacy', name: 'Old', ownerId: owner.user!.id, config: {}, createdAt: '2020-01-01', updatedAt: '2020-01-01' };
            await h.runtime.store.put('session', legacy);
            expect((await h.runtime.store.get<any>('session', 'legacy')).serverVersion).toBeUndefined();
        });
    });
});
describe("device coverage 5", () => {
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
        it('inactivity and legacy stored modes do not steer a returning agent', async () => {
            const agent = await agentPrincipal('Returning agent');
            expect(await h.runtime.service.responseContext(agent, {sessionId:s}, 'conn-a')).not.toHaveProperty('mode');
            expect(await h.runtime.store.get('session-mode',s)).toBeUndefined();
            const record={id:s,sessionId:s,idle:'ambient',explicit:'signage',agentSeenAt:'2000-01-01T00:00:00.000Z'};
            await h.runtime.store.put('session-mode',record);
            expect(await h.runtime.service.responseContext(agent, {sessionId:s}, 'conn-a')).not.toHaveProperty('mode');
            expect(await h.runtime.store.get('session-mode',s)).toEqual(record);
            const controller = new AbortController();
            try {
                const stream = await o.raw('/api/sessions/'+s+'/events?displayId='+d+'&tabId=wall', {}, {signal:controller.signal});
                expect(stream.status).toBe(200);
                const context=await h.runtime.service.responseContext(agent,{sessionId:s},'conn-a');
                expect(context).not.toHaveProperty('mode');
                expect(context.displayConnected).toBe(true);
                expect(context.preference).toBe('full');
                expect(await h.runtime.service.responseContext(agent,{sessionId:s},'conn-a')).not.toHaveProperty('mode');
                expect(await h.runtime.store.get('session-mode',s)).toEqual(record);
            } finally {controller.abort();}
        });
    });
});
describe("device coverage 6", () => {
    describe('7263db4a presence is debounced and the display has a size of its own', () => {
        let h!: Harness, o: Browser, s: string, d: string;
        beforeEach(async () => { h = await startHarness(); o = await h.account(); s = (await o.session()).id; d = (await o.display(s, 'Shared', 1200, 800)).id; });
        afterEach(async () => { await h?.close(); });
        const notices = async () => success(await o.request<ToastRecord[]>('GET', '/api/account/notices')).map(x => x.text);
        const viewers = async () => success(await o.request<(ViewerPresence & {
            presence: string;
        })[]>('GET', `/api/sessions/${s}/viewers`));
        const stream = async (tabId: string, signal: AbortSignal) => { const response = await o.raw(`/api/sessions/${s}/events?displayId=${d}&tabId=${tabId}`, {}, { signal }); expect(response.status).toBe(200); return response; };
        const observe = async (tabId: string, width: number, height: number, visible = true) => { const display = (await o.detail(s)).displays[0]; return success(await o.request('POST', `/api/sessions/${s}/displays/${d}/observe`, { tabId, sequence: Date.now(), revision: display.revision, renderedRevision: null, status: 'empty', visible, width, height, text: '', elements: [], context: null })); };
        it('the lease is several heartbeats long and the debounce comfortably outlasts a browser reconnect', () => {
            expect(PRESENCE_GRACE_MS).toBeGreaterThanOrEqual(30000);
            expect(PRESENCE_LEAVE_MS).toBeLessThan(PRESENCE_GRACE_MS / 10);
        });
        it('a dropped stream that returns produces no join/leave notice and stays listed as reconnecting', async () => {
            h.runtime.service.experience.receiving.graceMs = 1200;
            const a = new AbortController();
            await stream('tv', a.signal);
            await vi.waitFor(async () => expect((await notices()).filter(x => /connected ·/.test(x))).toHaveLength(1));
            a.abort();
            await vi.waitFor(async () => expect((await viewers()).find(x => x.presence === 'reconnecting')).toBeTruthy());
            const b = new AbortController();
            await stream('tv', b.signal);
            await new Promise(resolve => setTimeout(resolve, 1500));
            const all = await notices();
            expect(all.filter(x => /connected ·/.test(x))).toHaveLength(1);
            expect(all.some(x => /disconnected|left this display/.test(x))).toBe(false);
            expect((await viewers()).filter(x => x.connected)).toHaveLength(1);
            b.abort();
        }, 15000);
        it('a stream that stays away is announced once, and a window that says it is closing is announced promptly', async () => {
            h.runtime.service.experience.receiving.graceMs = 60000;
            const a = new AbortController();
            await stream('phone', a.signal);
            expect(success(await o.request<{
                left: boolean;
            }>('POST', `/api/sessions/${s}/displays/${d}/leave`, { tabId: 'phone' })).left).toBe(true);
            a.abort();
            await vi.waitFor(async () => expect((await notices()).filter(x => /disconnected from the display/.test(x))).toHaveLength(1), { timeout: 5000, interval: 100 });
            expect(success(await o.request<{
                left: boolean;
            }>('POST', `/api/sessions/${s}/displays/${d}/leave`, { tabId: 'never-connected' })).left).toBe(false);
        }, 15000);
        it('display size follows the largest connected foreground screen, not the last reporter', async () => {
            const tv = new AbortController(), phone = new AbortController();
            await stream('tv', tv.signal);
            await stream('phone', phone.signal);
            await observe('tv', 960, 540);
            await observe('phone', 443, 880);
            const size = async () => { const display = (await o.detail(s)).displays[0]; return [display.width, display.height]; };
            expect(await size()).toEqual([960, 540]);
            // The phone keeps reporting (heartbeat PATCH and observations): the display must not flip.
            for (let i = 0; i < 3; i++) {
                success(await o.request('PATCH', `/api/sessions/${s}/displays/${d}`, { width: 443, height: 880, pixelRatio: 2 }));
                await observe('phone', 443, 880);
            }
            expect(await size()).toEqual([960, 540]);
            const before = (await o.detail(s)).displays[0].viewportRevision;
            success(await o.request('PATCH', `/api/sessions/${s}/displays/${d}`, { width: 443, height: 880, pixelRatio: 2 }));
            expect((await o.detail(s)).displays[0].viewportRevision).toBe(before);
            // Per-viewer sizes stay visible separately.
            const listed = await viewers();
            expect(listed.find(x => x.width === 443)?.height).toBe(880);
            expect(listed.find(x => x.width === 960)?.height).toBe(540);
            // The TV goes to the background: the foreground phone becomes the display's size.
            await observe('tv', 960, 540, false);
            expect(await size()).toEqual([443, 880]);
            tv.abort();
            phone.abort();
        }, 15000);
        it('an agent can still set a viewport explicitly', async () => {
            const result = await h.runtime.service.execute("kanvas.display.update", { sessionId: s, displayId: d, width: 1920, height: 1080 }, { userId: o.user!.id }) as {
                width: number;
                height: number;
            };
            expect([result.width, result.height]).toEqual([1920, 1080]);
            denied(await h.browser().request('PATCH', `/api/sessions/${s}/displays/${d}`, { width: 1, height: 1 }), [401, 403]);
        });
    });
});
describe("device coverage 7", () => {
    it('group grids, meaningful labels and localizable microcopy retain explicit names', () => {
        expect(materializeSeats({ layout: 'round-tables', tableCount: 4, tableColumns: 2 }).tableColumns).toBe(2);
        expect(materializeSeats({ layout: 'theater' }).tables[0].name).toBe('Row 1');
        expect(materializeSeats({ layout: 'classroom-grid' }).tables[0].name).toBe('Section 1');
        expect(materializeSeats({ layout: 'theater', tables: [{ id: 'a', name: 'Balcony' }] }).tables[0].name).toBe('Balcony');
        expect(signSchema.parse({ openNow: false, closedLabel: 'Stengt', closedDayLabel: 'Stengt' }).closedLabel).toBe('Stengt');
    });
});
describe("device coverage 8", () => {
    let h!: Harness;
    afterEach(async () => { await h?.close(); });
    it('edits optional device metadata with CAS, returns it in the recipe, and refuses ambiguous targeting', async () => {
        h = await startHarness();
        const a = await h.account(), other = await h.account(), service = h.runtime.service;
        const browser = await h.runtime.auth.issueBrowser(a.user!.id, { cookie: () => { } } as unknown as Response), p = { userId: a.user!.id, browserId: browser.id };
        const d = await service.devices.register(p, { installationId: 'metadata-one', provisionHome: false }, 'Chrome'), d2 = await service.devices.register(p, { installationId: 'metadata-two', provisionHome: false }, 'Chrome');
        const s = await a.session('Default'), display = await a.display(s.id);
        const changed = await service.devices.rename(p, { deviceId: d.id, expectedVersion: d.version, name: 'Office laptop Chrome', location: 'Office', role: 'Dashboard', tags: ['work'], defaultSessionId: s.id });
        expect(changed).toMatchObject({ location: 'Office', role: 'Dashboard', tags: ['work'], defaultSessionId: s.id });
        await expect(service.devices.rename(p, { deviceId: d.id, expectedVersion: 0, role: 'stale' })).rejects.toThrow();
        await expect(service.devices.rename({ userId: other.user!.id }, { deviceId: d.id, location: 'Other' })).rejects.toThrow();
        const listing: any = await service.execute("kanvas.devices.read", {}, p);
        expect(listing.publishRecipe.view.data.devices.find((x: any) => x.id === d.id)).toMatchObject({ location: 'Office', role: 'Dashboard' });
        expect((await service.devices.open(p, d.id)).sessionId).toBe(s.id);
        await service.devices.rename(p, { deviceId: d2.id, location: 'Office' });
        await expect(service.devices.present(p, { match: { location: 'Office' }, sessionId: s.id, displayId: display.id, requestId: 'ambiguous' })).rejects.toThrow(/exactly one/);
        const stream = await service.devices.stream(p, d.id, () => { });
        try {
            expect(await service.devices.present(p, { match: { tag: 'work' }, sessionId: s.id, displayId: display.id, expectedVersion: changed.version, requestId: 'unique' })).toHaveProperty('commandId');
        }
        finally {
            stream.close();
        }
        const cleared = await service.devices.rename(p, { deviceId: d.id, location: null, role: null, tags: [], defaultSessionId: null });
        expect(cleared.location).toBeUndefined();
        expect(cleared.tags).toEqual([]);
    });
    it('consumes only owner-configured defaults on a proof-bound receiver and denies revoked receivers', async () => {
        h = await startHarness();
        const a = await h.account(), foreign = await h.account(), screen = h.browser(), service = h.runtime.service, p = { userId: a.user!.id };
        const req = success(await screen.request<any>('POST', '/api/screens/request', {}));
        success(await a.request('POST', '/api/screens/decide', { code: req.code, label: req.label, approve: true, confirm: true }));
        success(await screen.request('POST', '/api/screens/claim', {}));
        const auth = (await h.runtime.auth.browser({ cookies: Object.fromEntries(screen.cookies), get: () => undefined } as unknown as Request)).principal, deviceId = auth.receiverDeviceId!;
        const session = await a.session('Chosen default'), display = await a.display(session.id), other = await foreign.session('Forbidden default');
        await expect(service.devices.rename(p, { deviceId, defaultSessionId: other.id })).rejects.toThrow();
        await service.devices.rename(p, { deviceId, defaultSessionId: session.id });
        await expect(service.devices.rename(auth, { deviceId, defaultSessionId: session.id })).rejects.toThrow();
        expect(await service.devices.open(auth, deviceId)).toMatchObject({ sessionId: session.id });
        const renewed = (await h.runtime.auth.browser({ cookies: Object.fromEntries(screen.cookies), get: () => undefined } as unknown as Request)).principal;
        expect(renewed.scopedSessionId).toBe(session.id);
        expect(renewed.scopedDisplayId).toBeTruthy();
        await expect(service.display(renewed, other.id, display.id)).rejects.toThrow();
        await h.runtime.auth.revokeBrowser(renewed.browserId!);
        await expect(service.devices.open(renewed, deviceId)).rejects.toThrow();
    });
});
describe("device coverage 9", () => {
    let h!: Harness;
    afterEach(async () => { await h?.close(); });
    describe("device contracts", () => {
        it('reports precise envelope paths, numeric indices and received type for every issue', () => { const schema = z.object({ arguments: z.object({ displayIds: z.array(z.string()), source: z.string() }) }), raw = { arguments: { displayIds: [5, 6, 7, 8, 9, 10, 11], source: [] } }, parsed = schema.safeParse(raw); if (parsed.success)
            throw Error('Expected rejection'); const issues = validationIssues(parsed.error, '', raw, false, schema); expect(issues).toHaveLength(8); expect(issues[0].path).toBe('arguments.displayIds[0]'); expect(issues.at(-1)).toMatchObject({ path: 'arguments.source', problem: expect.stringContaining('received array') }); expect(JSON.stringify(issues)).not.toContain('[field]'); });
    });
});
describe("device coverage 10", () => {
    let h!: Harness;
    afterEach(async () => { vi.restoreAllMocks(); delete process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT; delete process.env.KANVAS_MAX_VIEWS_PER_SESSION; await h?.close(); });
    async function principal(a: Browser) { const session = await h.runtime.auth.issueBrowser(a.user!.id, { cookie: () => { } } as unknown as Response); return { userId: a.user!.id, browserId: session.id }; }
    const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=';
    describe("device contracts", () => {
        it('begin prompts the bare environment URL without creating sessions until a receiver is selected', async () => {
            h = await startHarness();
            const owner = await h.account(), p = await principal(owner);
            const before = (await h.runtime.service.sessions(p)).length;
            const none: any = await h.runtime.service.execute("kanvas.account.begin", { requestId: 'begin' }, p);
            expect(none.status).toBe('needs_display');
            expect(new URL(none.startUrl).pathname).toBe('/');
            expect((await h.runtime.service.sessions(p)).length).toBe(before);
            const device = { id: 'own-device', name: 'My laptop', windows: [{ id: 'one', name: 'One', connected: true, version: 0 }, { id: 'two', name: 'Two', connected: true, version: 0 }] };
            vi.spyOn(h.runtime.service.devices, 'list').mockResolvedValue({ devices: [device], note: '' } as any);
            const ambiguous: any = await h.runtime.service.execute("kanvas.account.begin", { requestId: 'begin' }, p);
            expect(ambiguous.status).toBe('needs_target');
            expect((await h.runtime.service.sessions(p)).length).toBe(before);
            const present = vi.spyOn(h.runtime.service.devices.windows, 'present').mockResolvedValue({ commandId: 'command' } as any);
            const args = { requestId: 'begin', deviceId: 'own-device', windowId: 'one' }, started: any = await h.runtime.service.execute("kanvas.account.begin", args, p);
            expect(started.status).toBe('started');
            expect((await h.runtime.service.display(p, started.sessionId, started.displayId)).view).toBeNull();
            expect((await h.runtime.service.execute("kanvas.account.begin", args, p) as any).sessionId).toBe(started.sessionId);
            expect(present).toHaveBeenCalledTimes(1);
        });
    });
});
describe("device coverage 11", () => {
    let h!: Harness;
    afterEach(async () => { await h?.close(); });
    async function principal(a: Browser) { const session = await h.runtime.auth.issueBrowser(a.user!.id, { cookie: () => { } } as unknown as Response); return { userId: a.user!.id, browserId: session.id }; }
    const view = { version: 1 as const, template: 'checklist' as const, title: 'Release tasks', data: { items: [{ id: 'a', text: 'Review', checked: false }, { id: 'b', text: 'Test', checked: false }] } };
    describe("device contracts", () => {
        it('root receiver appears without joining a session and remains owner-scoped', async () => {
            h = await startHarness();
            const a = await h.account(), p = await principal(a), q = await principal(await h.account());
            const device = await h.runtime.service.devices.register(p, { installationId: 'test-install' }, 'Mozilla/5.0');
            const window = await h.runtime.service.devices.windows.register(p, device.id, 'idle-tab');
            const stream = await h.runtime.service.devices.windows.stream(p, device.id, window.id, () => { });
            await stream.push();
            try {
                const topology: any = await h.runtime.service.topology.acrossSessions(p, {});
                expect(topology.availableWindows).toContainEqual(expect.objectContaining({ windowId: window.id, current: null, connected: true }));
                const otherTopology = await h.runtime.service.topology.acrossSessions(q, {});
                if (!('availableWindows' in otherTopology))
                    throw new Error('Expected account-wide topology');
                expect(otherTopology.availableWindows).toEqual([]);
                const started: any = await h.runtime.service.beginSession(p, { requestId: 'begin-idle', name: 'Work' });
                expect(started.status).toBe('started');
                expect(started.windowId).toBe(window.id);
            }
            finally {
                stream.close();
            }
        });
    });
});
