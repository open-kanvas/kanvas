import { asyncMap } from '../../src/server/async-collections.js';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthPrincipal } from '../../src/server/auth.js';
import { AppError } from '../../src/server/store.js';
import type { PublishInput } from '../../src/shared/publish-input.js';
import type { DisplayRecord, UpdateRecord, ViewSpec } from '../../src/shared/types.js';
import { ControlledInterpreter, fact, startHarness, type Browser, type Harness } from './harness.js';

const harnesses: Harness[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const h of harnesses.splice(0).reverse()) await h.close(); });
async function server(options: Parameters<typeof startHarness>[0] = {}) { const h = await startHarness(options); harnesses.push(h); return h; }
const principal = (b: Browser): AuthPrincipal => ({ userId: b.user!.id });
const input = (more: Partial<PublishInput> = {}): PublishInput => ({ requestId: randomUUID(), view: fact('Exact supplied sentence.'), ...more });
interface Receipt extends UpdateRecord { updateId: string; targetRef: string; createdSession: boolean; createdDisplays: string[]; targets: { displayId: string; viewerUrl: string; shortUrl: string }[] }
const show = async (h: Harness, p: AuthPrincipal, args: PublishInput) => (await h.runtime.service.execute("kanvas.submit", args, p)) as Promise<Receipt>;
const count = async (h: Harness, kind: string) => (await h.runtime.store.list(kind)).length;

describe('publish-first orchestration through the real service and PostgreSQL', () => {
    it('atomically creates one display/locator/update on concurrent identical first calls, then continues only via its scoped target', async () => {
        const h = await server(), b = await h.account(), p = principal(b), request = input();
        const home = (await h.runtime.store.list<DisplayRecord>('display'));
        expect(home).toHaveLength(1);
        expect(home[0].view?.template).toBe('overview');
        const receipts = await Promise.all(Array.from({ length: 4 }, async () => (await show(h, p, request))));
        const first = receipts[0];
        for (const receipt of receipts)
            expect(receipt).toMatchObject({ id: first.id, sessionId: first.sessionId, targetRef: first.targetRef, createdSession: true, status: 'accepted' });
        expect((await count(h, 'session'))).toBe(2);
        expect((await count(h, 'display'))).toBe(2);
        expect((await count(h, 'update'))).toBe(2);
        expect(first.targets[0]).toMatchObject({ displayId: first.displayIds[0], viewerUrl: expect.stringContaining(`/view/${first.sessionId}/`), shortUrl: expect.stringContaining('/s/') });
        const settled = await b.settle(first.sessionId, request.requestId);
        expect(settled.update.status).toBe('prepared');
        expect(settled.update.delivery?.[first.displayIds[0]].status).not.toBe('applied');
        expect(settled.detail.displays[0].view?.data.text).toBe('Exact supplied sentence.');
        // A locator creates no browser authority or implicit pairing approval.
        expect((await h.browser().request('GET', `/api/sessions/${first.sessionId}?displayId=${first.displayIds[0]}`)).status).toBe(401);
        expect((await count(h, 'pairing'))).toBe(0);
        const next = await show(h, p, input({ targetRef: first.targetRef, view: fact('Second exact sentence.') }));
        expect(next).toMatchObject({ sessionId: first.sessionId, displayIds: first.displayIds, createdSession: false });
        expect(first.sessionId).not.toBe(home[0].sessionId);
        expect((await h.runtime.store.get('display', home[0].id))).toEqual(home[0]);
        expect((await count(h, 'session'))).toBe(2);
        await expect(show(h, p, { ...request, view: fact('Changed retry') })).rejects.toMatchObject({ code: 'REQUEST_ID_CONFLICT' });
    });
    it('requires one expiring choice for ambiguity, scopes the choice, and isolates separately identified conversations', async () => {
        const h = await server(), b = await h.account(), p = principal(b);
        const a = await show(h, p, input({ newSession: true, sessionName: 'Topic A', contextId: 'chat-a' }));
        const c = await show(h, p, input({ newSession: true, sessionName: 'Topic B', contextId: 'chat-b' }));
        expect(a.sessionId).not.toBe(c.sessionId);
        const same = await Promise.all([show(h, p, input({ contextId: 'chat-a' })), show(h, p, input({ contextId: 'chat-a' }))]);
        expect(same.every(r => r.sessionId === a.sessionId)).toBe(true);
        expect((await count(h, 'session'))).toBe(3);
        const args = input(), before = (await count(h, 'update'));
        const choice = await show(h, p, args) as unknown as {
            status: string;
            resolutionRef: string;
            candidates: {
                sessionId: string;
            }[];
        };
        expect(choice.status).toBe('needs_target');
        expect(choice.candidates.map(x => x.sessionId).sort()).toEqual([a.sessionId, c.sessionId].sort());
        expect((await count(h, 'update'))).toBe(before);
        expect((await count(h, 'session'))).toBe(3);
        const other = await h.account();
        await expect(show(h, principal(other), { ...args, resolution: { ref: choice.resolutionRef, sessionId: a.sessionId } })).rejects.toMatchObject({ code: 'TARGET_CHOICE_EXPIRED' });
        const selected = { ...args, resolution: { ref: choice.resolutionRef, sessionId: c.sessionId, displayIds: c.displayIds } };
        const result = await show(h, p, selected);
        expect(result.sessionId).toBe(c.sessionId);
        expect((await show(h, p, selected)).id).toBe(result.id);
        await expect(show(h, p, { ...selected, resolution: { ref: choice.resolutionRef, sessionId: a.sessionId } })).rejects.toMatchObject({ code: 'REQUEST_ID_CONFLICT' });
        const expiredArgs = input();
        await show(h, p, expiredArgs);
        const record = (await h.runtime.store.list<{
            id: string;
            updateId?: string;
            expiresAt?: string;
        }>('publish-setup')).find(r => !r.updateId)!;
        (await h.runtime.store.put('publish-setup', { ...record, expiresAt: new Date(Date.now() - 1).toISOString() }));
        await expect(show(h, p, expiredArgs)).rejects.toMatchObject({ code: 'TARGET_CHOICE_EXPIRED' });
    });
    it('creates only a missing initial screen, preserves explicit multi-display/hold semantics, and respects grants and revoked references', async () => {
        const h = await server(), b = await h.account(), s = await b.session('Existing empty session'), p = principal(b);
        const selected = (await h.runtime.auth.issueToken(b.user!.id, 'Selected', ['read', 'publish'], [s.id])).token;
        const scoped = { userId: b.user!.id, tokenId: selected.id, scopes: selected.scopes };
        await expect(show(h, scoped, input({ newSession: true }))).rejects.toMatchObject({ code: 'SESSION_CREATION_FORBIDDEN' });
        const first = await show(h, scoped, input({ sessionId: s.id }));
        expect(first.createdSession).toBe(false);
        expect(first.createdDisplays).toHaveLength(1);
        expect((await count(h, 'session'))).toBe(2);
        await expect(show(h, p, input({ targetRef: first.targetRef }))).rejects.toMatchObject({ code: 'NOT_FOUND' });
        const reader = (await h.runtime.auth.issueToken(b.user!.id, 'Read', ['read'], [s.id])).token;
        await expect(show(h, { userId: b.user!.id, tokenId: reader.id, scopes: reader.scopes }, input({ sessionId: s.id }))).rejects.toMatchObject({ code: 'FORBIDDEN' });
        const second = await b.display(s.id);
        await b.settle(s.id, first.requestId);
        const d = (await h.runtime.service.display(p, s.id, first.displayIds[0]));
        (await h.runtime.service.updateDisplay(p, s.id, d.id, { held: true, expectedRevision: d.revision }));
        const held = await show(h, p, input({ sessionId: s.id, displayIds: [d.id, second.id] }));
        expect(held.status).toBe('held');
        expect((await count(h, 'display'))).toBe(3);
        (await h.runtime.store.put('token', { ...selected, revoked: true }));
        await expect(show(h, scoped, input({ targetRef: first.targetRef }))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
    it('rolls back invalid content and alias failure without external work or leaked events, including nested savepoint effects', async () => {
        const preparer = new ControlledInterpreter(), h = await server({ interpreter: preparer }), b = await h.account(), p = principal(b);
        const home = { sessions: (await h.runtime.store.list('session')), displays: (await h.runtime.store.list('display')), updates: (await h.runtime.store.list('update')) };
        const events: unknown[] = [];
        const stop = h.runtime.service.onEvent(e => events.push(e));
        await expect(show(h, p, input({ view: { version: 1, template: 'fact', data: {} } }))).rejects.toBeDefined();
        expect((await count(h, 'session'))).toBe(1);
        expect((await count(h, 'display'))).toBe(1);
        expect(events).toHaveLength(0);
        const alias = vi.spyOn(h.runtime.service.experience, 'alias').mockImplementation(() => { throw new AppError('ALIAS_CAPACITY', 'Injected capacity failure'); });
        const request = input();
        await expect(show(h, p, request)).rejects.toMatchObject({ code: 'ALIAS_CAPACITY' });
        expect((await count(h, 'publish-setup'))).toBe(0);
        expect((await count(h, 'update'))).toBe(1);
        expect((await count(h, 'session'))).toBe(1);
        expect(events).toHaveLength(0);
        expect(preparer.calls).toHaveLength(0);
        expect((await h.runtime.store.list('session'))).toEqual(home.sessions);
        expect((await h.runtime.store.list('display'))).toEqual(home.displays);
        expect((await h.runtime.store.list('update'))).toEqual(home.updates);
        alias.mockRestore();
        expect((await show(h, p, request)).status).toBe('accepted');
        stop();
        const observed: string[] = [];
        (await h.runtime.store.transaction(async () => {
            h.runtime.store.afterCommit(() => observed.push('committed'));
            try {
                (await h.runtime.store.transaction(() => { h.runtime.store.afterCommit(() => observed.push('rolled-back')); throw new Error('rollback'); }));
            }
            catch { /* expected */ }
            expect(observed).toEqual([]);
        }));
        expect(observed).toEqual(['committed']);
    });
    it('resumes committed-but-not-started setup after restart, but never repeats interrupted rendering', async () => {
        const h = await server(), b = await h.account(), p = principal(b);
        const defer = vi.spyOn(h.runtime.store, 'afterCommit').mockImplementation(() => { });
        const request = input(), first = await show(h, p, request);
        defer.mockRestore();
        expect(first.status).toBe('accepted');
        await h.shutdown();
        const restored = await server({ database: h.database });
        const replay = await show(restored, p, request);
        expect(replay.id).toBe(first.id);
        await vi.waitFor(async () => expect((await restored.runtime.store.get<UpdateRecord>('update', first.id))?.status).toBe('prepared'));
        const preparer = new ControlledInterpreter(), staged = await server({ interpreter: preparer }), owner = await staged.account();
        const live = input({ view: undefined, context: 'Translate the exact input', templateHint: undefined });
        const running = await show(staged, principal(owner), live);
        await preparer.waitFor(1);
        await staged.shutdown();
        preparer.releaseAll();
        const after = new ControlledInterpreter(), recovery = await server({ database: staged.database, interpreter: after });
        const failed = await show(recovery, principal(owner), live);
        expect(failed).toMatchObject({ id: running.id, sessionId: running.sessionId, status: 'failed', targetRef: running.targetRef });
        expect(after.calls).toHaveLength(0);
        expect((await count(recovery, 'session'))).toBe(2);
    });
    it('keeps created resources publishable through explicit targets when setup is disabled', async () => {
        const h = await server(), b = await h.account(), p = principal(b), first = await show(h, p, input());
        await b.settle(first.sessionId, first.requestId);
        await h.shutdown();
        const rollback = await server({ database: h.database, publishSetupEnabled: false });
        await expect(show(rollback, p, input())).rejects.toMatchObject({ code: 'PUBLISH_SETUP_DISABLED' });
        const explicit = await show(rollback, p, input({ sessionId: first.sessionId, displayIds: first.displayIds }));
        expect(explicit.status).toBe('accepted');
        expect((await count(rollback, 'session'))).toBe(2);
    });
    it('navigates ordinary slides without a run, retaining content and retry/revision/hold controls, and preserves appearance defaults', async () => {
        const h = await server(), b = await h.account(), p = principal(b);
        const slides = [fact('First'), fact('Second'), fact('Third')];
        const published = await show(h, p, input({ view: { version: 1, template: 'presentation', data: { slides, index: 0 } } }));
        await b.settle(published.sessionId, published.requestId);
        const display = async () => (await h.runtime.service.display(p, published.sessionId, published.displayIds[0]));
        const args = { sessionId: published.sessionId, displayId: (await display()).id, requestId: randomUUID(), expectedRevision: (await display()).revision, action: 'next' };
        const moved = await h.runtime.service.execute("kanvas.presentation.navigate", args, p) as UpdateRecord;
        expect((await display()).view?.data.index).toBe(1);
        expect((await display()).view?.data.slides).toEqual((await asyncMap(slides, async (v) => (await h.runtime.service.verifyView(p, published.sessionId, v)))));
        expect((await h.runtime.service.execute("kanvas.presentation.navigate", args, p) as UpdateRecord).id).toBe(moved.id);
        await expect(h.runtime.service.execute("kanvas.presentation.navigate", { ...args, requestId: randomUUID() }, p)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
        await h.runtime.service.execute("kanvas.presentation.navigate", { ...args, requestId: randomUUID(), expectedRevision: (await display()).revision, action: 'last' }, p);
        const lastRevision = (await display()).revision;
        const boundary = await h.runtime.service.execute("kanvas.presentation.navigate", { ...args, requestId: randomUUID(), expectedRevision: lastRevision }, p) as UpdateRecord;
        expect(boundary.status).toBe('retained');
        expect((await display()).revision).toBe(lastRevision);
        expect((await display()).view?.data.index).toBe(2);
        await expect(h.runtime.service.execute("kanvas.presentation.navigate", { ...args, requestId: randomUUID(), expectedRevision: lastRevision, action: 'goto', index: 3 }, p)).rejects.toMatchObject({ code: 'INVALID_SLIDE' });
        (await h.runtime.service.updateDisplay(p, published.sessionId, (await display()).id, { held: true, expectedRevision: (await display()).revision }));
        await expect(h.runtime.service.execute("kanvas.presentation.navigate", { ...args, requestId: randomUUID(), expectedRevision: (await display()).revision }, p)).rejects.toMatchObject({ code: 'DISPLAY_HELD' });
        (await h.runtime.service.updateDisplay(p, published.sessionId, (await display()).id, { held: false, expectedRevision: (await display()).revision }));
        const sourceText = 'So the quick brown fox jumped over the fence.', targetText = 'Den raske brune reven hoppet over gjerdet.';
        const translated = await show(h, p, input({ targetRef: published.targetRef, view: undefined, templateHint: 'translation', data: { sourceText, targetText, sourceLanguage: 'en', targetLanguage: 'nb' } }));
        await b.settle(translated.sessionId, translated.requestId);
        expect((await display()).view).toMatchObject({ template: 'translation', data: { sourceText, targetText, targetLanguage: 'nb' } });
        const explicit = await show(h, p, input({ targetRef: published.targetRef, view: fact(targetText) }));
        await b.settle(explicit.sessionId, explicit.requestId);
        expect((await display()).view?.template).toBe('fact');
        const ordinary = await show(h, p, input({ targetRef: published.targetRef }));
        expect(ordinary).not.toHaveProperty('publicationDefaults');
    });
});
