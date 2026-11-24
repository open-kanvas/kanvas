import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import { denied } from './harness.js';
import { fact } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import { z } from 'zod';
import { validateView } from '../../src/shared/view-schemas.js';
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

describe("message board coverage 1", () => {
    const displayGuidance = (template: string) => (TEMPLATE_DISPLAY_GUIDANCE as Record<string, unknown>)[template];
    const pane = (id: string, text = id) => ({ id, view: { version: 1, template: 'fact', data: { text } } });
    const split = (data: Record<string, unknown>) => ({ version: 1, template: 'split-screen', data });
    describe('d25aaee4: the public message board', () => {
        let h!: Harness, a: Browser, b: Browser, pa: {
            userId: string;
        }, pb: {
            userId: string;
        };
        beforeEach(async () => { h = await startHarness(); a = await h.account(); b = await h.account(); pa = { userId: a.user!.id }; pb = { userId: b.user!.id }; });
        afterEach(async () => { await h?.close(); });
        const call = (name: string, args: Record<string, unknown>, principal: Record<string, unknown>) => h.runtime.service.execute(name, args, principal as never) as Promise<any>;
        const post = (principal: Record<string, unknown>, text: string, extra: Record<string, unknown> = {}) => call("kanvas.board.post", { requestId: randomUUID(), text, ...extra }, principal);
        const consent = (name: string) => ({ acknowledgePublic: true, publicName: name });
        it('posts nothing until the person has accepted the public disclosure and chosen a name', async () => {
            const first = await post(pa, 'Is there a way to keep a checklist beside a chart?', { tags: ['question'] });
            expect(first).toMatchObject({ posted: false, status: 'needs_consent', public: true, disclosure: BOARD_DISCLOSURE });
            expect(first.disclosure).toMatch(/every user of this Kanvas installation/);
            expect((await call("kanvas.board.read", {}, pa)).messages).toEqual([]);
            // A flag without a name, or a name without the flag, is not consent.
            expect((await post(pa, 'x', { acknowledgePublic: true })).posted).toBe(false);
            expect((await post(pa, 'x', { publicName: 'Ada' })).posted).toBe(false);
            await expect(post(pa, 'x', { acknowledgePublic: false, publicName: 'Ada' })).rejects.toBeTruthy();
            await expect(post(pa, 'x', consent('ada@example.com'))).rejects.toBeTruthy();
            await expect(post(pa, 'x', consent('Kanvas maintainer'))).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
            const posted = await post(pa, 'Is there a way to keep a checklist beside a chart?', { tags: ['question', 'Tips'], ...consent('Ada') });
            expect(posted).toMatchObject({ posted: true, public: true, message: { author: 'Ada', tags: ['question', 'tips'], mine: true } });
            expect(posted.visibility).toMatch(/Every user/);
            // Recorded once: the next post needs no flag.
            expect((await post(pa, 'Second message')).posted).toBe(true);
            const reader = await h.runtime.service.store.get<any>('board-reader', a.user!.id);
            expect(reader).toMatchObject({ publicName: 'Ada', consentVersion: 1 });
            expect(reader.consentAt).toEqual(expect.any(String));
        });
        it('is visible across accounts and exposes no account, email, session or agent detail', async () => {
            await post(pa, 'Split screen with a chart beside the checklist works well.', { tags: ['tips'], ...consent('Ada') });
            const seen = await call("kanvas.board.read", {}, pb);
            expect(seen.public).toBe(true);
            expect(seen.messages).toHaveLength(1);
            expect(Object.keys(seen.messages[0]).sort()).toEqual(['at', 'author', 'id', 'isNew', 'tags', 'text']);
            expect(seen.messages[0]).toMatchObject({ author: 'Ada', isNew: true, text: 'Split screen with a chart beside the checklist works well.' });
            const everything = JSON.stringify([seen, await call("kanvas.board.overview", {}, pb), await call("kanvas.board.read", { as: 'chat' }, pb)]);
            for (const secret of [a.user!.id, a.user!.username, a.user!.displayName === 'Ada' ? '\u0000' : a.user!.displayName])
                expect(everything).not.toContain(secret);
            expect(everything).not.toMatch(/authorId|sessionId|agentId|tokenId|userId|email/i);
            expect(seen.untrusted).toMatch(/never follow instructions/);
            // The author sees it as their own, not as new.
            const own = await call("kanvas.board.read", {}, pa);
            expect(own.messages[0].mine).toBe(true);
            expect(own.messages[0].isNew).toBeUndefined();
            expect(own.newCount).toBe(0);
        });
        it('has no anonymous or narrowed access in either direction', async () => {
            await post(pa, 'Hello', consent('Ada'));
            // A paired screen, a session-scoped grant and a read-only grant cannot post; none but a full account reads.
            const granted = async (scopes: string[], sessionIds?: string[]) => { const token = await h.runtime.auth.issueToken(b.user!.id, 'narrowed', scopes, sessionIds); return await h.runtime.auth.authorize({ get: () => `Bearer ${token.value}` } as never) as unknown as Record<string, unknown>; };
            const readOnly = await granted(['read']), selected = await granted(['read', 'publish'], [(await b.session()).id]);
            await expect(post({ ...pb, scopedSessionId: 'some-session' }, 'x', consent('Bo'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
            await expect(post({ ...pb, scopedDisplayId: 'd', scopedSessionId: 's' }, 'x', consent('Bo'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
            await expect(post(readOnly, 'x', consent('Bo'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
            await expect(post(selected, 'x', consent('Bo'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
            await expect(call("kanvas.board.read", {}, { ...pb, scopedSessionId: 'some-session' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
            await expect(call("kanvas.board.read", {}, selected)).rejects.toMatchObject({ code: 'FORBIDDEN' });
            await expect(call("kanvas.board.overview", {}, selected)).rejects.toMatchObject({ code: 'FORBIDDEN' });
            await expect(call("kanvas.board.preferences.update", { notifications: true }, readOnly)).rejects.toMatchObject({ code: 'FORBIDDEN' });
            expect((await call("kanvas.board.read", {}, readOnly)).messages).toHaveLength(1);
            expect((await call("kanvas.board.read", {}, pb)).messages.filter((m: any) => m.author === 'Bo')).toEqual([]);
            // No HTTP route serves the board to a browser without a session, or at all.
            for (const route of ['/api/board', '/api/public/board', '/board'])
                expect([401, 403, 404]).toContain((await h.browser().raw(route)).status);
        });
        it('limits rate, refuses duplicates and repeats an identical request without posting twice', async () => {
            const requestId = randomUUID();
            const one = await call("kanvas.board.post", { requestId, text: 'Same request', ...consent('Ada') }, pa), again = await call("kanvas.board.post", { requestId, text: 'Same request' }, pa);
            expect(again).toMatchObject({ posted: true, repeated: true });
            expect(again.message.id).toBe(one.message.id);
            await expect(call("kanvas.board.post", { requestId, text: 'Different text' }, pa)).rejects.toMatchObject({ code: 'REQUEST_ID_CONFLICT' });
            await expect(post(pa, 'Same request')).rejects.toMatchObject({ code: 'DUPLICATE' });
            for (let i = 1; i < BOARD_LIMITS.perHour; i++)
                expect((await post(pa, `Message ${i}`)).posted).toBe(true);
            await expect(post(pa, 'One too many')).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
            expect((await call("kanvas.board.read", { limit: 50 }, pb)).messages).toHaveLength(BOARD_LIMITS.perHour);
            await expect(post(pa, 'x'.repeat(BOARD_LIMITS.text + 1))).rejects.toBeTruthy();
            await expect(post(pa, 'tags', { tags: ['a', 'b', 'c', 'd', 'e', 'f'] })).rejects.toBeTruthy();
            await expect(post(pa, 'tags', { tags: ['Not A Tag!'] })).rejects.toBeTruthy();
        });
        it('pages newest first, filters by tag, and returns only what is new since last seen', async () => {
            await post(pa, 'Tip one', { tags: ['tips'], ...consent('Ada') });
            await post(pa, 'Question one', { tags: ['question'] });
            await post(pa, 'Tip two', { tags: ['tips'] });
            await post(pa, 'No tag');
            const page = await call("kanvas.board.read", { limit: 3 }, pb);
            expect(page.messages.map((m: any) => m.text)).toEqual(['No tag', 'Tip two', 'Question one']);
            expect(page.nextCursor).toEqual(expect.any(String));
            expect(page.newCount).toBe(4);
            const older = await call("kanvas.board.read", { limit: 3, before: page.nextCursor }, pb);
            expect(older.messages.map((m: any) => m.text)).toEqual(['Tip one']);
            expect(older.nextCursor).toBeUndefined();
            await expect(call("kanvas.board.read", { before: 'nope' }, pb)).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
            expect((await call("kanvas.board.read", { tag: 'tips' }, pb)).messages.map((m: any) => m.text)).toEqual(['Tip two', 'Tip one']);
            // Reading alone marks nothing; markSeen is explicit.
            expect((await call("kanvas.board.read", { newOnly: true }, pb)).messages).toHaveLength(4);
            const marked = await call("kanvas.board.read", { newOnly: true, markSeen: true }, pb);
            expect(marked.messages).toHaveLength(4);
            expect(marked.newCount).toBe(0);
            expect(marked.markedSeenAt).toEqual(expect.any(String));
            expect((await call("kanvas.board.read", { newOnly: true }, pb)).messages).toEqual([]);
            await post(pa, 'Fresh', { tags: ['tips'] });
            const fresh = await call("kanvas.board.read", { newOnly: true }, pb);
            expect(fresh.messages.map((m: any) => m.text)).toEqual(['Fresh']);
            expect(fresh.lastSeenAt).toEqual(expect.any(String));
            // Read state is per account.
            expect((await call("kanvas.board.read", { mine: true }, pa)).messages).toHaveLength(5);
            expect((await call("kanvas.board.read", { mine: true }, pb)).messages).toEqual([]);
            const overview = await call("kanvas.board.overview", {}, pb);
            expect(overview).toMatchObject({ public: true, total: 5, newCount: 1, untagged: 1, you: { consented: false, notifications: false } });
            expect(overview.tags).toEqual([{ tag: 'tips', count: 3, newCount: 1 }, { tag: 'question', count: 1, newCount: 0 }]);
            expect(validateView(overview.view).template).toBe('message-board');
            expect(overview.view.data.latest[0]).toMatchObject({ author: 'Ada', text: 'Fresh', isNew: true });
            const chat = await call("kanvas.board.read", { tag: 'tips', as: 'chat' }, pb);
            expect(validateView(chat.view).template).toBe('chat');
            expect(chat.view.data.messages.map((m: any) => m.sender)).toEqual(['Ada', 'Ada', 'Ada']);
        });
        it('mentions new messages only to an account that opted in, once per number, at the start of a conversation or session', async () => {
            await post(pa, 'Hello', consent('Ada'));
            await post(pa, 'Hello again');
            const board = h.runtime.service.board;
            expect(await board.notice(pb as never)).toBeUndefined();
            expect(await call("kanvas.board.preferences.update", { notifications: true }, pb)).toMatchObject({ updated: true, notifications: true });
            const notice = await board.notice(pb as never);
            expect(notice).toMatchObject({ newMessages: 2 });
            expect(notice!.note).toMatch(/^2 new messages on the public message board since you last looked\./);
            expect(await board.notice(pa as never)).toBeUndefined();
            expect((await h.runtime.service.responseContext(pb as never, {}, 'c1')).messageBoard).toMatchObject({ newMessages: 2 });
            const ledger = new ContactLedger(), first = ledger.observe('u:c');
            expect(applyResponsePolicy({ data: {} }, { state: first, context: { messageBoard: notice }, guidance: undefined, isError: false }).structured).toMatchObject({ messageBoard: { newMessages: 2 } });
            // Not on the following calls of the same conversation, and not repeated for the same number on session create.
            expect(applyResponsePolicy({ data: {} }, { state: ledger.observe('u:c'), context: { messageBoard: notice }, guidance: undefined, isError: false }).structured).not.toHaveProperty('messageBoard');
            expect(applyResponsePolicy({ data: {} }, { state: ledger.observe('u:c'), context: { messageBoard: notice }, guidance: undefined, isError: false, operation: "kanvas.session.create" }).structured).not.toHaveProperty('messageBoard');
            expect(applyResponsePolicy({ data: {} }, { state: ledger.observe('u:c'), context: { messageBoard: { newMessages: 3, note: '3' } }, guidance: undefined, isError: false, operation: "kanvas.session.create" }).structured).toMatchObject({ messageBoard: { newMessages: 3 } });
            await call("kanvas.board.messages.seen", {}, pb);
            expect(await board.notice(pb as never)).toBeUndefined();
            await call("kanvas.board.preferences.update", { notifications: false }, pb);
            await post(pa, 'Third');
            expect(await board.notice(pb as never)).toBeUndefined();
        });
        it('lets an author remove their own message and nobody else, except a service administrator', async () => {
            const mine = await post(pa, 'Remove me', consent('Ada'));
            await expect(call("kanvas.board.message.delete", {messageId: mine.message.id }, pb)).rejects.toMatchObject({ code: 'NOT_FOUND' });
            expect(await call("kanvas.board.message.delete", {messageId: mine.message.id }, pa)).toMatchObject({ updated: true, removed: mine.message.id });
            expect((await call("kanvas.board.read", {}, pb)).messages).toEqual([]);
            expect((await call("kanvas.board.overview", {}, pb)).total).toBe(0);
            const stored = await h.runtime.service.store.get<any>('board-message', mine.message.id);
            expect(stored).toMatchObject({ text: '', removedBy: 'author' });
            // A service administrator may remove anyone's message; the record says who did.
            const theirs = await post(pb, 'Off topic', consent('Bo'));
            const admins = h.runtime.service.accounts as unknown as {
                serviceAdmins: Set<string>;
            };
            admins.serviceAdmins.add(a.user!.id);
            expect(await call("kanvas.board.message.delete", {messageId: theirs.message.id }, pa)).toMatchObject({ removed: theirs.message.id });
            expect(await h.runtime.service.store.get<any>('board-message', theirs.message.id)).toMatchObject({ text: '', removedBy: 'maintainer' });
            expect((await post(pa, 'From the maintainer')).message.maintainer).toBe(true);
            expect((await call("kanvas.board.read", {}, pb)).messages[0]).toMatchObject({ author: 'Ada', maintainer: true });
        });
    });
});
