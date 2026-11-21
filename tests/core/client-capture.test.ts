import {afterEach,describe,expect,it,vi} from 'vitest';
import type {Request} from 'express';
import {startHarness,success,denied,type Harness} from './harness.js';
import {VisualCaptureResult} from '../../src/server/visual-capture.js';

describe('fixed client capture authorization and expiry', () => {
    let h: Harness;
    const controllers: AbortController[] = [], readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
    afterEach(async () => { for (const c of controllers.splice(0))
        c.abort(); await Promise.allSettled(readers.splice(0).map(reader => reader.cancel())); vi.restoreAllMocks(); await h?.close(); });
    async function setup() {
        h = await startHarness();
        const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
        const p = (await h.runtime.auth.browser({ cookies: Object.fromEntries(owner.cookies) } as unknown as Request)).principal;
        const s = session.id, d = display.id, path = `/api/sessions/${s}/displays/${d}/client-capture`;
        const connect = async (tab = 'one') => {
            const c = new AbortController();
            controllers.push(c);
            const response = await owner.raw(`/api/sessions/${s}/events?displayId=${d}&tabId=${tab}`, {}, { signal: c.signal });
            // Behave like EventSource: retain and consume the stream until explicit abort.
            // Do not rely on a discarded unread fetch response retaining the connection.
            const reader = response.body!.getReader();
            readers.push(reader);
            void (async () => { while (!(await reader.read()).done) { /* Consume SSE without recording data. */ } })().catch(() => { });
        };
        return { owner, p, s, d, path, connect, capture: h.runtime.service.clientCapture };
    }
    it('requires a connected own-account viewer, explicit disambiguation, and rejects arbitrary scripting', async () => {
        const { p, s, d, connect, capture } = await setup();
        await expect(capture.request(p, { sessionId: s, displayId: d })).rejects.toMatchObject({ code: 'CAPTURE_NO_VIEWER' });
        await connect();
        await connect('two');
        await expect(capture.request(p, { sessionId: s, displayId: d })).rejects.toMatchObject({ code: 'CAPTURE_CHOOSE_VIEWER' });
        const viewers = await h.runtime.service.experience.receiving.viewers(s, d);
        const request = await capture.request(p, { sessionId: s, displayId: d, viewerId: viewers[0].id });
        expect(request.status).toBe('awaiting-user-gesture');
        expect(JSON.stringify(request)).not.toMatch(/browserId|tokenId|requester/);
        await expect(h.runtime.service.execute("kanvas.display.request.capture", { sessionId: s, displayId: d, script: 'alert(1)' }, p)).rejects.toThrow();
        await expect(capture.request(p, { sessionId: s, displayId: d, viewerId: viewers[0].id })).rejects.toMatchObject({ code: 'CAPTURE_PENDING' });
    });
    it('binds result to browser tab/account/session and preserves CSRF and strict upload bounds', async () => {
        const { owner, p, s, d, path, connect, capture } = await setup();
        await connect();
        const q = await capture.request(p, { sessionId: s, displayId: d });
        expect(success(await owner.request('GET', `${path}?tabId=one`))).toMatchObject({ captureId: q.captureId });
        expect(success(await owner.request('GET', `${path}?tabId=other`))).toBeNull();
        denied(await owner.request('POST', `${path}/${q.captureId}`, { tabId: 'other', status: 'denied' }), [404]);
        denied(await owner.request('POST', `${path}/${q.captureId}`, { tabId: 'one', status: 'denied' }, { csrf: null }), [403]);
        const stranger = await h.account();
        denied(await stranger.request('GET', `${path}?tabId=one`));
        await expect(capture.status({ userId: stranger.user!.id }, { sessionId: s, displayId: d, captureId: q.captureId })).rejects.toThrow();
        denied(await owner.request('POST', `${path}/${q.captureId}`, { tabId: 'one', status: 'complete', base64: 'a'.repeat(2796205), width: 1, height: 1 }), [400]);
        denied(await owner.request('POST', `${path}/${q.captureId}`, { tabId: 'one', status: 'complete', base64: 'abcd', width: 1, height: 1 }), [400]);
        success(await owner.request('POST', `${path}/${q.captureId}`, { tabId: 'one', status: 'awaiting-permission' }));
        denied(await owner.request('POST', `${path}/${q.captureId}`, { tabId: 'one', status: 'complete', base64: 'abcd', width: 1, height: 1 }), [400]);
        success(await owner.request('POST', `${path}/${q.captureId}`, { tabId: 'one', status: 'denied' }));
        expect(await capture.status(p, { sessionId: s, displayId: d, captureId: q.captureId })).toMatchObject({ status: 'denied' });
        denied(await owner.request('POST', `${path}/${q.captureId}`, { tabId: 'one', status: 'awaiting-permission' }), [409]);
    });
    it('expires pending requests and refuses late uploads without creating an asset', async () => {
        const { owner, p, s, d, path, connect, capture } = await setup();
        await connect();
        const q = await capture.request(p, { sessionId: s, displayId: d });
        const original = Date.now();
        vi.spyOn(Date, 'now').mockReturnValue(original + 121000);
        expect(await capture.status(p, { sessionId: s, displayId: d, captureId: q.captureId })).toMatchObject({ status: 'expired' });
        denied(await owner.request('POST', `${path}/${q.captureId}`, { tabId: 'one', status: 'denied' }), [409]);
        expect(await h.runtime.store.list('capture-asset', s)).toHaveLength(0);
    });
    it('rechecks requesting access after arming before revealing or accepting the capture', async () => {
        const { owner, p, s, d, path, connect, capture } = await setup();
        await connect();
        const issued = await h.runtime.auth.issueToken(p.userId, 'Disposable', ['read', 'publish']);
        const tokenPrincipal = { userId: p.userId, tokenId: issued.token.id };
        const q = await capture.request(tokenPrincipal, { sessionId: s, displayId: d });
        await h.runtime.auth.revokeToken(p.userId, issued.token.id);
        expect(success(await owner.request('GET', `${path}?tabId=one`))).toBeNull();
        denied(await owner.request('POST', `${path}/${q.captureId}`, { tabId: 'one', status: 'denied' }), [401]);
    });
    it.each(['unsupported', 'failed'] as const)('surfaces %s and enforces the per-account request rate', async (status) => {
        const { owner, p, s, d, path, connect, capture } = await setup();
        await connect();
        for (let i = 0; i < 6; i++) {
            const q = await capture.request(p, { sessionId: s, displayId: d });
            success(await owner.request('POST', `${path}/${q.captureId}`, { tabId: 'one', status }));
            expect(await capture.status(p, { sessionId: s, displayId: d, captureId: q.captureId })).toMatchObject({ status });
        }
        await expect(capture.request(p, { sessionId: s, displayId: d })).rejects.toMatchObject({ code: 'CAPTURE_BUSY' });
    });
    it('defaults snapshots to actual live dimensions and preserves explicit dimension overrides', async () => {
        const { p, s, d, connect } = await setup();
        await connect();
        const service = h.runtime.service;
        const viewers = await service.experience.receiving.viewers(s, d);
        await h.runtime.store.put('viewer', { ...viewers[0], width: 390, height: 844, visible: true, observedAt: new Date().toISOString() });
        const mocked = vi.spyOn(service.visualCapture, 'capture').mockImplementation(async (_user, display, dimensions) => new VisualCaptureResult({ displayId: display.id, ...dimensions }, Buffer.from([1, 2, 3])));
        // Bypass storing only in this viewport selection unit; the capture engine is exercised in browser tests.
        const originalList = h.runtime.store.list.bind(h.runtime.store);
        vi.spyOn(h.runtime.store, 'list').mockImplementation(async (kind, ...rest) => kind === 'capture-asset' ? Array.from({ length: 100 }, (_, i) => ({ id: String(i) })) : originalList(kind, ...rest));
        const result = await service.execute("kanvas.display.snapshot", { sessionId: s, displayId: d }, p) as VisualCaptureResult;
        expect(mocked.mock.calls[0][2]).toEqual({ width: 390, height: 844 });
        expect(result.metadata.viewportSource).toBe('connected-viewer');
        await service.execute("kanvas.display.snapshot", { sessionId: s, displayId: d, width: 800 }, p);
        expect(mocked.mock.calls[1][2]).toEqual({ width: 800, height: 844 });
    });
});
