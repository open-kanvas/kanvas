import { randomUUID } from 'node:crypto';
import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { z } from 'zod';
import { DRAFTING_LIMITS } from '../../src/shared/drafting.js';
import { draftingDataSchema } from '../../src/shared/drafting.js';
import { draftPassages } from '../../src/shared/drafting.js';
import { isDraftTextBoundary } from '../../src/shared/drafting.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import type { InteractionRecord } from '../../src/shared/types.js';
import type { UpdateRecord } from '../../src/shared/types.js';
import type { ViewSpec } from '../../src/shared/types.js';
import { draftingSelectionFeedback } from '../../src/server/drafting.js';
import { templateViewSchema } from '../../src/shared/view-schemas.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { denied } from './harness.js';
import { fact } from './harness.js';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import type { Browser } from './harness.js';
import type { Harness } from './harness.js';
import { guideFor } from '../../src/server/mcp/guide.js';

describe("drafting coverage 1", () => {
    const text = 'Hei  Alex 👋\n\nKeep this exact passage.\nNext line & <not markup>.';
    const start = text.indexOf('exact'), end = start + 'exact'.length;
    const draft = (extra: Record<string, unknown> = {}): ViewSpec => ({ version: 1, template: 'drafting', data: { text, purpose: 'Note', status: 'reviewing', ...extra } });
    const selection = (extra: Record<string, unknown> = {}) => ({ kind: 'drafting.select', start, end, text: text.slice(start, end), via: 'selection', ...extra });
    describe('strict drafting source contracts', () => {
        it('retains exact whitespace, Unicode, inert markup and an initially empty draft', () => {
            expect(draftingDataSchema.parse({ text })).toEqual({ text, status: 'drafting', suggestions: [] });
            expect(draftingDataSchema.parse({ text: '' }).text).toBe('');
            expect(validateView(draft()).data.text).toBe(text);
            const schema = z.toJSONSchema(templateViewSchema('drafting'), { io: 'input' });
            expect(schema.type).toBe('object');
            expect(schema.additionalProperties).toBe(false);
            expect(schema.properties?.data).toMatchObject({ type: 'object', additionalProperties: false });
        });
        it('bounds text and anchors without accepting recording flags, surrogate splits or overlapping edits', () => {
            const edit = { id: 'exactness', start, end, replacement: 'original', reason: 'Keep the intended wording' };
            expect(draftingDataSchema.parse({ text, suggestions: [edit], focus: { start, end } }).suggestions[0]).toEqual(edit);
            const emoji = text.indexOf('👋');
            for (const input of [
                { text: 'a'.repeat(DRAFTING_LIMITS.text + 1) }, { text, listening: true }, { text, status: 'recording' },
                { text, suggestions: [{ ...edit, start: end, end: start }] },
                { text, suggestions: [{ ...edit, end: text.length + 1 }] },
                { text, suggestions: [{ ...edit, start: emoji + 1, end: emoji + 2 }] },
                { text, suggestions: [edit, { ...edit, id: 'overlap', start: start + 1 }] },
                { text, suggestions: [edit, { ...edit, start: 0, end: 2 }] },
                { text, focus: { start: 0, end: text.length + 1 } },
                { text, focus: { start: emoji, end: emoji + 1 } },
                { text, suggestions: [{ ...edit, replacement: 'a'.repeat(DRAFTING_LIMITS.replacement + 1) }] },
            ])
                expect(draftingDataSchema.safeParse(input).success).toBe(false);
        });
        it('creates lossless, character-safe tap targets for long and multilingual drafts', () => {
            const source = `${'a'.repeat(3999)}👋\n\n\n\nAndre avsnitt\n\n${'終'.repeat(8001)}`;
            const passages = draftPassages(source);
            expect(passages.map(span => source.slice(span.start, span.end)).join('')).toBe(source);
            for (const span of passages) {
                expect(span.end - span.start).toBeLessThanOrEqual(DRAFTING_LIMITS.span);
                expect(span.end).toBeGreaterThan(span.start);
                expect(isDraftTextBoundary(source, span.start) && isDraftTextBoundary(source, span.end)).toBe(true);
            }
            expect(draftPassages('')).toEqual([]);
        });
        it('derives suggestion details from source and rejects forged replacement metadata', () => {
            const view = draft({ suggestions: [{ id: 'edit', start, end, replacement: '<b>original</b>', reason: 'More precise' }] });
            expect(draftingSelectionFeedback(view, selection({ via: 'suggestion', suggestionId: 'edit' }))).toMatchObject({ text: 'exact', suggestion: { replacement: '<b>original</b>', reason: 'More precise' }, textPath: '/data/text' });
            expect(() => draftingSelectionFeedback(view, selection({ via: 'suggestion', suggestionId: 'edit', replacement: 'Injected' }))).toThrow();
            expect(() => draftingSelectionFeedback(view, selection({ via: 'suggestion', suggestionId: 'other' }))).toThrow();
            expect(() => draftingSelectionFeedback(view, selection({ suggestionId: 'edit' }))).toThrow();
        });
    });
    describe('revision-bound draft selection and chunked updates', () => {
        let h!: Harness, owner: Browser, sessionId: string, displayId: string, principal: AuthPrincipal;
        const path = () => `/api/sessions/${sessionId}/displays/${displayId}`;
        const respond = (value = selection(), revision = 1, requestId = randomUUID()) => owner.request<InteractionRecord>('POST', `${path()}/respond`, { value, revision, requestId });
        beforeEach(async () => {
            h = await startHarness();
            owner = await h.account();
            sessionId = (await owner.session('Draft review')).id;
            displayId = (await owner.display(sessionId)).id;
            principal = { userId: owner.user!.id, agentId: 'drafting-source-agent' };
        });
        afterEach(async () => { await h?.close(); });
        async function publish(view: ViewSpec = draft()) {
            const update = (await h.runtime.service.submit(principal, { sessionId, displayIds: [displayId], requestId: randomUUID(), view }));
            const result = await owner.settle(sessionId, update.requestId);
            expect(result.update.status).toBe('prepared');
            return result.detail.displays.find(item => item.id === displayId)!;
        }
        it('shares exact source with the owning agent without mutating the draft, and replays idempotently', async () => {
            await publish();
            const requestId = randomUUID(), first = success(await respond(selection(), 1, requestId));
            expect(first).toMatchObject({ revision: 1, actionId: 'drafting.select', targetAgentId: principal.agentId, status: 'pending', value: { template: 'drafting', textPath: '/data/text', start, end, text: 'exact', via: 'selection', purpose: 'Note', draftStatus: 'reviewing' } });
            expect(success(await respond(selection(), 1, requestId)).id).toBe(first.id);
            denied(await respond(selection({ text: 'other' }), 1, requestId), [409]);
            const detail = await owner.detail(sessionId);
            expect(detail.interactions).toHaveLength(1);
            expect(detail.displays[0]).toMatchObject({ revision: 1, view: { data: { text } } });
            expect((await h.runtime.service.interactions(principal, sessionId)).interactions[0].id).toBe(first.id);
            expect((await h.runtime.service.interactions({ ...principal, agentId: 'unrelated-agent' }, sessionId)).interactions).toHaveLength(0);
            expect((await h.runtime.service.acknowledge(principal, sessionId, first.id)).status).toBe('acknowledged');
        });
        it('rejects forged, stale, oversized and character-splitting ranges before writing feedback', async () => {
            await publish();
            const emoji = text.indexOf('👋');
            for (const value of [
                selection({ text: 'false' }), selection({ end: text.length + 1 }), selection({ start: -1 }),
                selection({ start: emoji + 1, end: emoji + 2, text: text.slice(emoji + 1, emoji + 2) }),
                selection({ start: 0, end: 4001, text: 'x'.repeat(4001) }), selection({ via: 'passage' }),
                selection({ via: 'suggestion', suggestionId: 'nonexistent' }),
            ])
                denied(await respond(value), [400, 422]);
            denied(await respond(selection(), 0), [409]);
            denied(await owner.request('POST', `${path()}/respond`, { revision: 1, requestId: randomUUID(), value: selection() }, { csrf: null }), [403]);
            expect((await owner.detail(sessionId)).interactions).toHaveLength(0);
        });
        it('appends supplied chunks atomically without reinterpreting source or duplicating text, and rejects old selections', async () => {
            await publish();
            const originalRequest = randomUUID();
            const first = success(await respond(selection(), 1, originalRequest));
            const chunk = '\n\nExact next chunk  👋 & <script>inert</script>';
            const input = { sessionId, displayId, expectedRevision: 1, requestId: randomUUID(), operations: [{ op: 'appendText', path: '/data/text', value: chunk }] };
            const patched = await h.runtime.service.execute("kanvas.view.patch", input, principal) as UpdateRecord;
            expect(patched).toMatchObject({ status: 'prepared', revisions: { [displayId]: 2 }, metrics: { path: 'direct' } });
            expect((await h.runtime.service.execute("kanvas.view.patch", input, principal) as UpdateRecord).id).toBe(patched.id);
            const display = (await owner.detail(sessionId)).displays[0];
            expect(display.view?.data.text).toBe(text + chunk);
            expect(success(await respond(selection(), 1, originalRequest)).id).toBe(first.id);
            denied(await respond(selection(), 1), [409]);
            expect(success(await respond(selection(), 2)).revision).toBe(2);
            await expect(h.runtime.service.execute("kanvas.view.patch", { ...input, requestId: randomUUID() }, principal)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
        });
        it('validates suggestions against the final patched draft without partial publication', async () => {
            await publish(draft({ suggestions: [{ id: 'source-edit', start, end, replacement: 'original' }] }));
            const input = { sessionId, displayId, expectedRevision: 1, requestId: randomUUID(), operations: [{ op: 'set', path: '/data/text', value: 'Short' }] };
            await expect(h.runtime.service.execute("kanvas.view.patch", input, principal)).rejects.toBeDefined();
            expect((await owner.detail(sessionId)).displays[0].revision).toBe(1);
            const feedback = success(await respond(selection({ via: 'suggestion', suggestionId: 'source-edit' })));
            expect(feedback.value).toMatchObject({ suggestion: { id: 'source-edit', start, end, replacement: 'original' } });
            expect((await owner.detail(sessionId)).displays[0].view?.data.text).toBe(text);
            const fixed = await h.runtime.service.execute("kanvas.view.patch", { ...input, requestId: randomUUID(), operations: [...input.operations, { op: 'set', path: '/data/suggestions', value: [] }] }, principal) as UpdateRecord;
            expect(fixed.revisions[displayId]).toBe(2);
            expect((await owner.detail(sessionId)).displays[0].view?.data.text).toBe('Short');
        });
        it('binds feedback to the visible presentation leaf, not an off-screen draft', async () => {
            await publish({ version: 1, template: 'presentation', data: { slides: [draft(), fact('Visible non-draft')], index: 1 } });
            denied(await respond(), [400]);
            await publish({ version: 1, template: 'presentation', data: { slides: [fact('Hidden'), draft()], index: 1 } });
            const interaction = success(await respond(selection(), 2));
            expect(interaction.value).toMatchObject({ textPath: '/data/slides/1/data/text', text: 'exact' });
            denied(await respond(selection(), 1), [409]);
        });
        it('allows explicitly interactive paired viewers but denies view-only screens and other displays', async () => {
            await publish();
            async function paired(interactive: boolean) {
                const share = await h.runtime.service.execute("kanvas.share.create", { sessionId, displayId, allowInteraction: interactive }, principal) as {
                    id: string;
                };
                const guest = h.browser();
                const pair = success(await guest.request<{
                    id: string;
                }>('POST', '/api/pairings', { shareId: share.id, deviceName: 'Draft review screen', requestedInteractive: interactive }));
                await h.runtime.service.execute("kanvas.pairing.decide", { sessionId, pairingId: pair.id, approve: true, confirm: true, interactive }, principal);
                success(await guest.request('GET', `/api/pairings/${pair.id}/status`));
                guest.csrf = success(await guest.request<{
                    csrfToken: string;
                }>('GET', '/api/auth/me')).csrfToken;
                return guest;
            }
            const guest = await paired(true), observer = await paired(false);
            const body = { revision: 1, requestId: randomUUID(), value: selection() };
            expect(success(await guest.request<InteractionRecord>('POST', `${path()}/respond`, body)).userId).toMatch(/^pairing:/);
            denied(await observer.request('POST', `${path()}/respond`, { ...body, requestId: randomUUID() }), [403]);
            const privateDisplay = await owner.display(sessionId, 'Private draft');
            await owner.submit(sessionId, [privateDisplay.id], draft());
            denied(await guest.request('POST', `/api/sessions/${sessionId}/displays/${privateDisplay.id}/respond`, { ...body, requestId: randomUUID() }), [403, 404]);
            denied(await guest.request('POST', `/api/sessions/${sessionId}/submit`, { requestId: randomUUID(), displayIds: [displayId], view: draft({ text: 'Unauthorized edit' }) }), [403]);
            expect((await owner.detail(sessionId)).displays.find(item => item.id === displayId)).toMatchObject({ revision: 1, view: { data: { text } } });
        });
    });
});

describe("drafting coverage 2", () => {
    describe("drafting contracts", () => {
        let h!: Harness, owner: Browser, s: string, d: string, p: AuthPrincipal;
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); s = (await owner.session()).id; d = (await owner.display(s)).id; p = { userId: owner.user!.id }; });
        afterEach(async () => { await h?.close(); });
        // Tool outputs are heterogeneous envelopes; assertions below narrow the relevant fields.
        const call = async (name: string, args: unknown, actor = p): Promise<any> => h.runtime.service.execute(name, args, actor);
        const target = () => ({ sessionId: s, displayId: d });
        it('records actual suggestion/editor/reviewer identities, preserves attribution on re-anchor and retries exactly', async () => {
            const editor = await h.account();
            success(await owner.request('POST', `/api/sessions/${s}/members`, { username: editor.user!.username, role: 'editor' }));
            await owner.submit(s, [d], { version: 1, template: 'drafting', data: { text: 'Hello team' } });
            const args = { ...target(), expectedRevision: 1, requestId: 'suggest', suggestions: [{ id: 'greeting', find: 'Hello', replacement: 'Hi' }] };
            await call("kanvas.draft.suggest", args);
            let read = await call("kanvas.draft.read", target());
            expect(read.suggestions[0].author).toEqual({ id: owner.user!.id, name: owner.user!.displayName });
            expect(read.collaborative).toBe(true);
            await call("kanvas.draft.edit", { ...target(), expectedRevision: 2, requestId: 'edit', edits: [{ op: 'append', text: '!' }] }, { userId: editor.user!.id });
            read = await call("kanvas.draft.read", target());
            expect(read.suggestions[0].author.id).toBe(owner.user!.id);
            expect(read.activity.at(-1)).toMatchObject({ action: 'edit', actor: { id: editor.user!.id } });
            await call("kanvas.draft.review", { ...target(), expectedRevision: 3, requestId: 'review', accept: ['greeting'] }, { userId: editor.user!.id });
            read = await call("kanvas.draft.read", target());
            expect(read.text).toBe('Hi team!');
            expect(read.activity.at(-1)).toMatchObject({ action: 'accept', suggestionId: 'greeting', actor: { id: editor.user!.id }, revision: 4 });
            await call("kanvas.draft.suggest", args);
            expect((await call("kanvas.draft.read", target())).activity).toEqual(read.activity);
            await expect(call("kanvas.draft.suggest", { ...target(), expectedRevision: 4, requestId: 'spoof', suggestions: [{ find: 'Hi', replacement: 'Hello', author: { id: 'other', name: 'Other' } }] })).rejects.toThrow();
        });
    });
});
