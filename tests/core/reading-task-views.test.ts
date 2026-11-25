import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {startHarness,success,denied,type Harness,type Browser} from './harness.js';
import type {NavigationSnapshot} from '../../src/shared/navigation.js';
import type {InteractionRecord,UpdateRecord,ViewSpec} from '../../src/shared/types.js';

describe('exact task views and personal reading state', () => {
    let h: Harness, owner: Browser, s: string, d: string;
    beforeEach(async () => { h = await startHarness(); owner = await h.account(); s = (await owner.session()).id; d = (await owner.display(s)).id; });
    afterEach(async () => { await h?.close(); });
    const path = () => `/api/sessions/${s}/displays/${d}`;
    const call = async (name: string, args: unknown) => (await h.runtime.service.execute(name, args, { userId: owner.user!.id }));
    const move = (navigation: unknown, expectedRevision = 1, browser = owner) => browser.request<NavigationSnapshot>('POST', `${path()}/navigation`, { tabId: 'reading-test', requestId: randomUUID(), expectedRevision, navigation });
    it('appends one event without lost/duplicate history and rejects stale competing appends and viewers', async () => {
        await owner.submit(s, [d], { version: 1, template: 'progress', data: { task: 'Deployment', events: [{ id: 'source', title: 'Exact input', timestamp: '2026-09-16T14:00:00Z', description: '9007199254740993.001' }] } });
        const base = { sessionId: s, displayId: d, expectedRevision: 1, requestId: randomUUID(), event: { id: 'check', title: 'Browser checked', status: 'completed' } };
        const result = await call("kanvas.progress.append", base) as UpdateRecord;
        expect((await call("kanvas.progress.append", base) as UpdateRecord).id).toBe(result.id);
        await expect(call("kanvas.progress.append", { ...base, event: { ...base.event, title: 'Changed retry' } })).rejects.toMatchObject({ code: 'REQUEST_ID_CONFLICT' });
        await expect(call("kanvas.progress.append", { ...base, requestId: randomUUID(), event: { id: 'other', title: 'Old revision' } })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
        await call("kanvas.progress.append", { ...base, requestId: randomUUID(), expectedRevision: 2, status: 'completed', event: { id: 'done', title: 'Complete', status: 'completed' } });
        const display = (await owner.detail(s)).displays[0];
        expect(display.revision).toBe(3);
        expect(display.view?.data.events).toHaveLength(3);
        expect((display.view?.data.events as {
            description?: string;
        }[])[0].description).toBe('9007199254740993.001');
        const stranger = await h.account();
        await expect(h.runtime.service.execute("kanvas.progress.append", { ...base, expectedRevision: 3, requestId: randomUUID() }, { userId: stranger.user!.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
        const history = await call("kanvas.display.history", { sessionId: s, displayId: d }) as {
            entries: {
                revision: number;
            }[];
        };
        expect(history.entries.map(x => x.revision)).toEqual([0, 1, 2, 3]);
    });
    it('preserves raw log whitespace and surrounding lines, and sends exact revision-bound line context only once', async () => {
        const raw = '  before\r\n\tERROR 9007199254740993.001\r\nafter\n';
        await owner.submit(s, [d], { version: 1, template: 'log', data: { raw, startLine: 101, pageSize: 3 } });
        const response = { revision: 1, requestId: randomUUID(), value: { kind: 'log.inspect', line: 102 } };
        const first = success(await owner.request<InteractionRecord>('POST', `${path()}/respond`, response)), retry = success(await owner.request<InteractionRecord>('POST', `${path()}/respond`, response));
        expect(retry.id).toBe(first.id);
        expect(first.value).toMatchObject({ line: 102, message: '\tERROR 9007199254740993.001\r' });
        const searched = success(await move({ action: 'search', query: 'ERROR' }));
        expect(searched.capabilities.pageCount).toBe(2);
        expect((await owner.detail(s)).displays[0]).toMatchObject({ revision: 1, view: { data: { raw } } });
        denied(await owner.request('POST', `${path()}/respond`, { ...response, requestId: randomUUID(), value: { kind: 'log.inspect', line: 999 } }), [404]);
        await owner.submit(s, [d], { version: 1, template: 'log', data: { raw: 'New exact log' } });
        denied(await owner.request('POST', `${path()}/respond`, { ...response, requestId: randomUUID() }), [409]);
    });
    it('merges independent reading defaults, starts paused on new documents, preserves position on pause, and leaves content/history untouched', async () => {
        const view: ViewSpec = { version: 1, template: 'document', data: { text: 'Exact words. '.repeat(150), layout: 'reading' } };
        await owner.submit(s, [d], view);
        const before = (await owner.detail(s)).displays[0], history = await call("kanvas.display.history", { sessionId: s, displayId: d });
        const initial = success(await owner.request<NavigationSnapshot>('GET', `${path()}/navigation?tabId=reading-test`));
        expect(initial.state.reading).toEqual({ fontSize: 30, wpm: 220, zoom: 1, playing: false });
        expect(success(await move({ action: 'reading', fontSize: 28, saveDefaults: true })).state.reading?.wpm).toBe(220);
        const configured = success(await move({ action: 'reading', wpm: 160, saveDefaults: true }));
        expect(configured.state.reading).toEqual({ fontSize: 28, wpm: 160, zoom: 1, playing: false });
        expect(success(await move({ action: 'reading', command: 'start' })).state.reading?.playing).toBe(true);
        const paused = success(await move({ action: 'reading', command: 'pause', position: .4 }));
        expect(paused.state.scroll.y).toBe(.4);
        expect(paused.state.reading?.playing).toBe(false);
        expect((await owner.detail(s)).displays[0].view).toEqual(before.view);
        expect(await call("kanvas.display.history", { sessionId: s, displayId: d })).toEqual(history);
        const preferences = await call("kanvas.preferences.read", {}) as {
            config: Record<string, unknown>;
        };
        expect(preferences.config).toMatchObject({ readingFontSize: 28, readingWpm: 160 });
        await owner.submit(s, [d], { ...view, title: 'Another document' });
        const next = success(await owner.request<NavigationSnapshot>('GET', `${path()}/navigation?tabId=reading-test`));
        expect(next.state.reading).toEqual({ fontSize: 28, wpm: 160, zoom: 1, playing: false });
        expect(next.state.scroll.y).toBe(0);
        const newSession = await owner.session();
        expect(newSession.config).toMatchObject({ readingFontSize: 28, readingWpm: 160 });
    });
    it('does not let a paired reader save the owner’s personal defaults, even with otherwise-valid reading controls', async () => {
        await owner.submit(s, [d], { version: 1, template: 'document', data: { text: 'Readable text. '.repeat(100), layout: 'reading' } });
        const guest = h.browser(), pair = success(await guest.request<{
            id: string;
        }>('POST', '/api/pairings', { sessionId: s, displayId: d }));
        success(await owner.request('POST', `/api/pairings/${pair.id}/decision`, { approve: true }));
        success(await guest.request('GET', `/api/pairings/${pair.id}/status`));
        guest.csrf = success(await guest.request<{
            csrfToken: string;
        }>('GET', '/api/auth/me')).csrfToken;
        const before = await call("kanvas.preferences.read", {});
        denied(await move({ action: 'reading', fontSize: 32, saveDefaults: true }, 1, guest));
        expect(await call("kanvas.preferences.read", {})).toEqual(before);
        expect(success(await move({ action: 'reading', command: 'start', wpm: 190 }, 1, guest)).state.reading?.wpm).toBe(190);
        denied(await move({ action: 'reading', wpm: 800 }, 1, guest), [400]);
    });
});
