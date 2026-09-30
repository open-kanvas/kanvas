import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AssetRecord } from '../../src/shared/types.js';
import { denied, fact, PNG, startHarness, success, type Harness } from './harness.js';

interface Pairing { id: string; label: string; status: string; expiresAt: string; sessionId: string; displayId: string }

describe('browser-bound view-only display pairing', () => {
  let h: Harness;
  beforeEach(async () => { h = await startHarness(); });
  afterEach(async () => { await h?.close(); });

  it('requires both browser-held proof and the authorized owner decision', async () => {
    const owner = await h.account(), stranger = await h.account(), session = await owner.session(), display = await owner.display(session.id);
    const requesting = h.browser(), unrelated = h.browser();
    const pending = await requesting.request<Pairing>('POST', '/api/pairings', { sessionId: session.id, displayId: display.id, deviceName: 'Meeting room' });
    const pairing = success(pending);
    expect(pairing.status).toBe('pending');
    expect(pairing.label).toEqual(expect.any(String));
    expect(pending.headers.getSetCookie().join('; ')).toMatch(/HttpOnly/i);
    expect(Object.keys(pairing).some(key => /token|proof|secret|password/i.test(key))).toBe(false);
    denied(await requesting.request('GET', `/api/sessions/${session.id}`), [401]);
    denied(await unrelated.request('GET', `/api/pairings/${pairing.id}/status`), [401, 403, 404]);
    denied(await unrelated.request('POST', `/api/pairings/${pairing.id}/cancel`, {}), [401, 403, 404]);
    denied(await stranger.request('POST', `/api/pairings/${pairing.id}/decision`, { approve: true }));
    denied(await owner.request('POST', `/api/pairings/${pairing.id}/decision`, { approve: true }, { csrf: null }), [403]);
    expect(success(await requesting.request<Pairing>('GET', `/api/pairings/${pairing.id}/status`)).status).toBe('pending');
    success(await owner.request('POST', `/api/pairings/${pairing.id}/decision`, { approve: true }));
    expect(success(await requesting.request<Pairing>('GET', `/api/pairings/${pairing.id}/status`)).status).toBe('approved');
    success(await requesting.request('GET', '/api/auth/me'));
    denied(await unrelated.request('GET', `/api/pairings/${pairing.id}/status`), [401, 403, 404]);
  });

  it('grants only the approved display, without unrelated source data or interaction/publisher authority', async () => {
    const owner = await h.account(), session = await owner.session(), otherSession = await owner.session('Other private session');
    const approved = await owner.display(session.id, 'Shared'), privateDisplay = await owner.display(session.id, 'Private');
    const content = { ...fact('Approved display'), actions: [{ id: 'act', label: 'Contextual control', kind: 'button' as const }] };
    await owner.submit(session.id, [approved.id], content);
    await owner.submit(session.id, [privateDisplay.id], fact('Other display must stay private'));
    success(await owner.request('POST', `/api/sessions/${session.id}/datasets`, { name: 'Unrelated private rows', rows: [{ amount: '99.00' }] }));
    const hiddenAsset = success(await owner.request<AssetRecord>('POST', `/api/sessions/${session.id}/assets`, { name: 'private.png', mimeType: 'image/png', base64: PNG }));
    const requesting = h.browser();
    const pairing = success(await requesting.request<Pairing>('POST', '/api/pairings', { sessionId: session.id, displayId: approved.id, deviceName: 'Shared screen' }));
    success(await owner.request('POST', `/api/pairings/${pairing.id}/decision`, { approve: true }));
    success(await requesting.request('GET', `/api/pairings/${pairing.id}/status`));
    const me = success(await requesting.request<{ csrfToken: string }>('GET', '/api/auth/me'));
    requesting.csrf = me.csrfToken;
    const scoped = await requesting.detail(session.id);
    expect(scoped.displays.map(display => display.id)).toEqual([approved.id]);
    expect(scoped.displays[0].view?.data.text).toBe('Approved display');
    expect(scoped.datasets).toHaveLength(0);
    expect(scoped.assets).toHaveLength(0);
    expect(scoped.members).toHaveLength(0);
    expect(scoped.interactions).toHaveLength(0);
    denied(await requesting.request('GET', `/api/sessions/${otherSession.id}`));
    denied(await requesting.request('GET', hiddenAsset.url));
    denied(await requesting.request('GET', `/api/sessions/${session.id}/events?displayId=${privateDisplay.id}`));
    denied(await requesting.request('POST', `/api/sessions/${session.id}/interactions`, { displayId: approved.id, revision: scoped.displays[0].revision, actionId: 'act', value: true, requestId: 'not-an-interactor' }));
    denied(await requesting.request('POST', `/api/sessions/${session.id}/submit`, { requestId: 'not-a-publisher', displayIds: [approved.id], view: fact('Forbidden') }));
    denied(await requesting.request('POST', '/api/tokens', { name: 'No escalation', sessionIds: [session.id], scopes: ['read', 'publish'] }));
    success(await requesting.request('PATCH', `/api/sessions/${session.id}/displays/${approved.id}`, { width: 800, height: 600 }));
    denied(await requesting.request('PATCH', `/api/sessions/${session.id}/displays/${privateDisplay.id}`, { width: 800, height: 600 }));
    success(await requesting.request('POST', `/api/sessions/${session.id}/displays/${approved.id}/applied`, { revision: scoped.displays[0].revision }));
  });

  it('does not reactivate a revoked pairing by replaying its approval or proof cookie', async () => {
    const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id), requesting = h.browser();
    const pairing = success(await requesting.request<Pairing>('POST', '/api/pairings', { sessionId: session.id, displayId: display.id, deviceName: 'Revoked screen' }));
    success(await owner.request('POST', `/api/pairings/${pairing.id}/decision`, { approve: true }));
    success(await requesting.request('GET', `/api/pairings/${pairing.id}/status`));
    const captured = new Map(requesting.cookies);
    success(await owner.request('DELETE', `/api/pairings/${pairing.id}`));
    denied(await owner.request('POST', `/api/pairings/${pairing.id}/decision`, { approve: true }), [403, 404, 409, 410]);
    const replay = h.browser();
    for (const [name, value] of captured) replay.cookies.set(name, value);
    denied(await replay.request('GET', `/api/sessions/${session.id}`), [401, 403, 404]);
    denied(await replay.request('GET', `/api/sessions/${session.id}/events?displayId=${display.id}`), [401, 403, 404]);
    const status = await replay.request<Pairing>('GET', `/api/pairings/${pairing.id}/status`);
    if (status.status < 300) expect(success(status).status).toBe('revoked');
    else denied(status, [401, 403, 404, 410]);
  });

  it('keeps denial and browser cancellation terminal and rejects mismatched session/display pairing', async () => {
    const owner = await h.account(), a = await owner.session('A'), b = await owner.session('B'), da = await owner.display(a.id), db = await owner.display(b.id);
    const deniedScreen = h.browser(), cancelledScreen = h.browser();
    denied(await deniedScreen.request('POST', '/api/pairings', { sessionId: a.id, displayId: db.id, deviceName: 'Mismatch' }), [400, 404, 422]);
    const pair = success(await deniedScreen.request<Pairing>('POST', '/api/pairings', { sessionId: a.id, displayId: da.id, deviceName: 'Denied' }));
    success(await owner.request('POST', `/api/pairings/${pair.id}/decision`, { approve: false }));
    expect(success(await deniedScreen.request<Pairing>('GET', `/api/pairings/${pair.id}/status`)).status).toBe('denied');
    denied(await deniedScreen.request('GET', '/api/auth/me'), [401]);
    const cancelled = success(await cancelledScreen.request<Pairing>('POST', '/api/pairings', { sessionId: a.id, displayId: da.id, deviceName: 'Cancelled' }));
    success(await cancelledScreen.request('POST', `/api/pairings/${cancelled.id}/cancel`, {}));
    denied(await owner.request('POST', `/api/pairings/${cancelled.id}/decision`, { approve: true }), [403, 404, 409, 410]);
    denied(await cancelledScreen.request('GET', '/api/auth/me'), [401]);
  });
});
