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
import { applyChecklistChanges } from '../../src/server/checklists.js';
import { checklistTools } from '../../src/server/checklists.js';
import { CHECKLIST_RETAINED_REVISIONS } from '../../src/server/checklists.js';
import { safeError } from '../../src/server/mcp/results.js';
import { toastBuiltInIcon } from '../../src/shared/viewer-experience.js';
import { TOAST_TYPES } from '../../src/shared/viewer-experience.js';
import type { ToastRecord } from '../../src/shared/viewer-experience.js';
import type { ViewerPresence } from '../../src/shared/viewer-experience.js';
import { PRESENCE_GRACE_MS } from '../../src/server/receiving-presence.js';
import { PRESENCE_LEAVE_MS } from '../../src/server/receiving-presence.js';
import { runPrivacyCycle } from '../../src/client/device-privacy-check.js';
import { privacyBackoffMs } from '../../src/client/device-privacy-check.js';
import { PRIVACY_DEADLINE_MS } from '../../src/client/device-privacy-check.js';
import { z } from 'zod';
import { viewSchema } from '../../src/shared/view-schemas.js';
import { templateViewSchema } from '../../src/shared/view-schemas.js';
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
import { PNG } from './harness.js';
import type { AuthPrincipal } from '../../src/server/auth.js';

describe("toasts coverage 1", () => {
    const toastSchema = experienceTools.find(t => t.name === "kanvas.toast")!.schema;
    describe("toasts contracts", () => {
        let h!: Harness, owner: Browser, s: string, d: string;
        const p = () => ({ userId: owner.user!.id });
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); s = (await owner.session()).id; d = (await owner.display(s)).id; await vi.waitFor(async () => expect((await h.runtime.store.query("SELECT count(*)::int n FROM events WHERE event_type='browser.operation' AND operation='kanvas_display_register'")).rows[0].n).toBe(1)); });
        afterEach(async () => { await h?.close(); });
        it('paired media authority includes split current slides and public live toast icons only', async () => {
            const store = h.runtime.store, browser = await h.runtime.auth.issueBrowser(owner.user!.id, { cookie: () => { } } as any), pairId = 'fixture-pair';
            await store.put('pairing', { id: pairId, status: 'approved', ownerId: owner.user!.id, sessionId: s, displayId: d, browserSessionId: browser.id, grantExpiresAt: Date.now() + 60000 });
            const principal = { ...p(), browserId: browser.id, pairingId: pairId, scopedDisplayId: d, scopedSessionId: s };
            const image = (id: string) => ({ version: 1 as const, template: 'image' as const, data: { images: [{ url: '/api/assets/' + id }] } });
            const display = await store.get<any>('display', d);
            display.view = { version: 1, template: 'split-screen', data: { panes: [{ id: 'one', view: image('shown') }, { id: 'two', view: { version: 1, template: 'presentation', data: { index: 1, slides: [image('hidden'), image('current')] } } }] } };
            await store.put('display', display);
            const allows = (id: string) => pairedDisplayAllowsAsset(store, principal, { id, sessionId: s, url: '/api/assets/' + id });
            expect(await allows('shown')).toBe(true);
            expect(await allows('current')).toBe(true);
            expect(await allows('hidden')).toBe(false);
            expect(await allows('unreferenced')).toBe(false);
            for (const [id, ownerId, expiry] of [['icon', undefined, 60000], ['private', owner.user!.id, 60000], ['expired', undefined, -1]] as const)
                await store.put('toast', { id, sessionId: s, displayId: d, icon: '/api/assets/' + id, ownerId, expiresAt: new Date(Date.now() + expiry).toISOString() });
            expect(await allows('icon')).toBe(true);
            expect(await allows('private')).toBe(false);
            expect(await allows('expired')).toBe(false);
            display.view = fact('Replacement');
            await store.put('display', display);
            expect(await allows('shown')).toBe(false);
        });
    });
});

describe("toasts coverage 2", () => {
    describe('toasts: account-wide dismissal and built-in icons', () => {
        let h!: Harness, o: Browser, s: string, d: string, p: {
            userId: string;
        };
        beforeEach(async () => { h = await startHarness(); o = await h.account(); s = (await o.session()).id; d = (await o.display(s)).id; p = { userId: o.user!.id }; });
        afterEach(async () => { await h?.close(); });
        const call = (name: string, args: Record<string, unknown> = {}) => h.runtime.service.execute(name, args, p) as Promise<any>;
        const observe = async (browser: Browser, tabId: string, displayId = d) => { const display = (await browser.detail(s)).displays.find(x => x.id === displayId)!; return success(await browser.request<{
            toasts: ToastRecord[];
        }>('POST', `/api/sessions/${s}/displays/${displayId}/observe`, { tabId, sequence: Date.now(), revision: display.revision, renderedRevision: null, status: 'empty', visible: true, width: 800, height: 600, text: '', elements: [], context: null })); };
        it('1559c2fd/b4c5d005: one dismissal removes a sticky toast for the whole account, on new windows and after restart', async () => {
            const sent = await call("kanvas.toast", { sessionId: s, displayIds: [d], text: 'Handled once', sticky: true });
            const toastId = sent.notifications[0].id;
            expect((await observe(o, 'laptop-window')).toasts.map(t => t.id)).toEqual([toastId]);
            // A second device of the same account: a separate browser session on the same user.
            const phone = h.browser();
            await h.runtime.auth.issueBrowser(o.user!.id, { cookie: (name: string, value: string) => { phone.cookies.set(name, value); } } as never);
            phone.csrf = success(await phone.request<{
                csrfToken: string;
            }>('GET', '/api/auth/me')).csrfToken;
            expect((await observe(phone, 'phone-window')).toasts.map(t => t.id)).toEqual([toastId]);
            const events: unknown[] = [];
            const stop = h.runtime.service.onEvent(event => { events.push(event); });
            expect(success(await o.request('POST', `/api/sessions/${s}/displays/${d}/toasts/dismiss`, { tabId: 'laptop-window', id: toastId }))).toMatchObject({ dismissed: true, scope: 'account' });
            stop();
            expect(events).toContainEqual(expect.objectContaining({ type: 'toast', sessionId: s, displayId: d }));
            expect((await observe(phone, 'phone-window')).toasts).toEqual([]);
            // "Restarted app": a window id the server has never seen.
            expect((await observe(phone, `restarted-${randomUUID()}`)).toasts).toEqual([]);
            expect((await observe(o, `reopened-${randomUUID()}`)).toasts).toEqual([]);
            // The notification itself still exists for other accounts until it expires.
            expect(await h.runtime.store.get('toast', toastId)).toBeTruthy();
        });
        it('a dismissal by one account does not dismiss for another member of a shared session', async () => {
            const member = await h.account();
            success(await o.request('POST', `/api/sessions/${s}/members`, { username: member.user!.username, role: 'viewer' }));
            const toastId = (await call("kanvas.toast", { sessionId: s, displayIds: [d], text: 'Shared notice', sticky: true })).notifications[0].id;
            success(await member.request('POST', `/api/sessions/${s}/displays/${d}/toasts/dismiss`, { tabId: 'member-window', id: toastId }));
            expect((await observe(member, 'member-window')).toasts).toEqual([]);
            expect((await observe(o, 'owner-window')).toasts.map(t => t.id)).toEqual([toastId]);
        });
        it('one notification sent to several displays is dismissed on all of them together', async () => {
            const second = (await o.display(s, 'Second')).id;
            const sent = await call("kanvas.toast", { sessionId: s, displayIds: [d, second], text: 'Two screens', sticky: true });
            expect(new Set(sent.notifications.map((n: ToastRecord) => n.groupId)).size).toBe(1);
            success(await o.request('POST', `/api/sessions/${s}/displays/${d}/toasts/dismiss`, { tabId: 'one', id: sent.notifications[0].id }));
            expect((await observe(o, 'two', second)).toasts).toEqual([]);
        });
        it('keeps honouring a per-window dismissal written by 0.36', async () => {
            const toastId = (await call("kanvas.toast", { sessionId: s, displayIds: [d], text: 'Legacy', sticky: true })).notifications[0].id;
            const viewerId = (await observe(o, 'old-window') as unknown as {
                viewerId: string;
            }).viewerId;
            await h.runtime.store.put('toast-dismissed', { id: viewerId, sessionId: s, ids: [toastId] });
            expect((await observe(o, 'old-window')).toasts).toEqual([]);
        });
        it('e6ae1605: built-in pictograms are optional; explicit image wins; plain toasts are unchanged', async () => {
            const schema = experienceTools.find(t => t.name === "kanvas.toast")!.schema;
            expect(TOAST_TYPES).toHaveLength(9);
            for (const type of TOAST_TYPES)
                expect(schema.safeParse({ sessionId: 's', displayIds: ['d'], text: 'x', type }).success).toBe(true);
            expect(schema.safeParse({ sessionId: 's', displayIds: ['d'], text: 'x', type: 'gmail' }).success).toBe(false);
            const plain = (await call("kanvas.toast", { sessionId: s, displayIds: [d], text: 'Plain' })).notifications[0];
            expect(plain).toMatchObject({ severity: 'info' });
            expect(plain.type).toBeUndefined();
            expect(toastBuiltInIcon(plain)).toBeUndefined();
            const warned = (await call("kanvas.toast", { sessionId: s, displayIds: [d], text: 'Careful', severity: 'warning' })).notifications[0];
            expect(toastBuiltInIcon(warned)).toBe('warning');
            const mail = (await call("kanvas.toast", { sessionId: s, displayIds: [d], text: 'New mail', type: 'email', severity: 'success' })).notifications[0];
            expect(toastBuiltInIcon(mail)).toBe('email');
            expect(toastBuiltInIcon({ icon: 'https://example.com/i.png', type: 'email', severity: 'warning', severityStated: true })).toBeUndefined();
        });
    });
});

describe("toasts coverage 3", () => {
    const displayGuidance = (template: string) => (TEMPLATE_DISPLAY_GUIDANCE as Record<string, unknown>)[template];
    const pane = (id: string, text = id) => ({ id, view: { version: 1, template: 'fact', data: { text } } });
    const split = (data: Record<string, unknown>) => ({ version: 1, template: 'split-screen', data });
    describe("toasts contracts", () => {
        it('5b62fba5: a toast takes that id and stores the address this server serves it at', async () => {
            const h = await startHarness();
            try {
                const o = await h.account(), s = (await o.session()).id, d = (await o.display(s)).id, p = { userId: o.user!.id };
                await h.runtime.service.execute("kanvas.toast", { sessionId: s, displayIds: [d], text: 'Mail', icon: 'lucide:mail-dot' }, p);
                await h.runtime.service.execute("kanvas.toast", { sessionId: s, displayIds: [d], text: 'Mail', icon: 'https://example.com/icon.png' }, p);
                const icons = (await h.runtime.service.store.list<any>('toast', s)).map(t => t.icon).sort();
                expect(icons).toEqual(['/api/picker/icons/lucide/outline/mail-dot.svg', 'https://example.com/icon.png']);
                await expect(h.runtime.service.execute("kanvas.toast", { sessionId: s, displayIds: [d], text: 'Mail', icon: 'not an icon' }, p)).rejects.toBeTruthy();
            }
            finally {
                await h.close();
            }
        });
    });
});

describe("toasts coverage 4", () => {
    describe("toasts contracts", () => {
        let h!: Harness, owner: Browser, sessionId: string, displayId: string, p: AuthPrincipal;
        const path = () => `/api/sessions/${sessionId}/displays/${displayId}`;
        const call = async (name: string, args: unknown) => (await h.runtime.service.execute(name, args, p));
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); sessionId = (await owner.session()).id; displayId = (await owner.display(sessionId)).id; p = { userId: owner.user!.id }; });
        afterEach(async () => { await h?.close(); });
        it('toasts and revision-bound annotations do not alter the view history, and annotation retries stay exactly once', async () => {
            await owner.submit(sessionId, [displayId], fact('Keep this view'));
            const history = (await h.runtime.service.displayHistory(p, sessionId, displayId));
            await call("kanvas.toast", { sessionId, displayIds: [displayId], text: 'A toast', sticky: true });
            const body = { requestId: randomUUID(), tabId: 'a-tab', revision: 1, kind: 'note', points: [{ x: .25, y: .5 }], note: 'Review this point' };
            const annotation = success(await owner.request<{
                id: string;
            }>('POST', `${path()}/annotations`, body));
            expect(success(await owner.request<{
                id: string;
            }>('POST', `${path()}/annotations`, body)).id).toBe(annotation.id);
            expect((await owner.detail(sessionId)).interactions.filter(x => x.actionId === 'viewer.annotation')).toHaveLength(1);
            expect((await h.runtime.service.displayHistory(p, sessionId, displayId))).toEqual(history);
            expect((await owner.detail(sessionId)).displays[0].revision).toBe(1);
            await owner.submit(sessionId, [displayId], fact('Next view'));
            expect((await owner.request('POST', `${path()}/annotations`, { ...body, requestId: randomUUID() })).status).toBe(409);
        });
    });
});
