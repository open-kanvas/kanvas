import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { denied, fact, PNG, startHarness, success, type Harness } from './harness.js';
import type { AssetRecord, SessionRecord } from '../../src/shared/types.js';

describe('real HTTP browser authentication and session authority', () => {
  let h: Harness;
  beforeEach(async () => { h = await startHarness(); });
  afterEach(async () => { await h?.close(); });

  it('keeps a private session inaccessible with only its URL/IDs', async () => {
    const owner = await h.account(), session = await owner.session('Private report');
    const display = await owner.display(session.id);
    await owner.submit(session.id, [display.id], fact('Private acceptance fixture.'));
    const anonymous = h.browser(), stranger = await h.account();
    denied(await anonymous.request('GET', '/api/auth/me'), [401]);
    denied(await anonymous.request('GET', `/api/sessions/${session.id}`), [401]);
    denied(await anonymous.request('GET', `/api/sessions/${session.id}/events`), [401]);
    denied(await stranger.request('GET', `/api/sessions/${session.id}`));
    denied(await stranger.request('GET', `/api/sessions/${session.id}/events`));
    const sessions = success(await stranger.request<SessionRecord[]>('GET', '/api/sessions'));
    expect(sessions.some(item => item.id === session.id)).toBe(false);
  });

  it('sets protected browser cookies and does not expose password state in account results', async () => {
    const browser = h.browser();
    const password = randomBytes(24).toString('base64url');
    const registration = await browser.request('POST', '/api/auth/register', { username: 'cookie_acceptance', password });
    success(registration);
    const cookie = registration.headers.getSetCookie().join('; ');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=(Lax|Strict)/i);
    const me = success(await browser.request<{ user: Record<string, unknown>; csrfToken: string }>('GET', '/api/auth/me'));
    expect(me.csrfToken.length).toBeGreaterThanOrEqual(16);
    expect(Object.keys(me.user).sort()).toEqual(['displayName', 'id', 'username']);
    expect(registration.text.includes(password)).toBe(false);
    expect(registration.headers.get('cache-control')).toMatch(/no-store/i);
  });

  it('rejects missing, wrong, cross-account and cross-origin CSRF proofs without mutation', async () => {
    const owner = await h.account(), other = await h.account();
    const before = success(await owner.request<SessionRecord[]>('GET', '/api/sessions'));
    expect(before).toHaveLength(1); // The real Home target already exists.
    for (const options of [
      { csrf: null }, { csrf: 'invalid-test-proof' }, { csrf: other.csrf },
      { csrf: owner.csrf, origin: 'https://untrusted.example' },
    ]) denied(await owner.request('POST', '/api/sessions', { name: 'Must not exist' }, options), [403]);
    const sessions = success(await owner.request<SessionRecord[]>('GET', '/api/sessions'));
    expect(sessions).toEqual(before);
    const created = await owner.session('Authorized creation');
    expect(created.name).toBe('Authorized creation');
  });

  it('rejects wrong login and invalidates the server-side login on logout', async () => {
    const owner = await h.account();
    const copiedCookie = new Map(owner.cookies);
    const unauthenticated = h.browser();
    denied(await unauthenticated.request('POST', '/api/auth/login', { username: owner.user!.username, password: randomBytes(24).toString('base64url') }), [401]);
    const logout = await owner.request('POST', '/api/auth/logout', {});
    expect(logout.status).toBeGreaterThanOrEqual(200);
    expect(logout.status).toBeLessThan(300);
    denied(await owner.request('GET', '/api/auth/me'), [401]);
    const replay = h.browser();
    for (const [name, value] of copiedCookie) replay.cookies.set(name, value);
    denied(await replay.request('GET', '/api/auth/me'), [401]);
  });

  it('requires a fresh sign-in after the stored browser session expires', async () => {
    const owner = await h.account(), session = await owner.session();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 8 * 86400_000);
    try {
      denied(await owner.request('GET', '/api/auth/me'), [401]);
      denied(await owner.request('GET', `/api/sessions/${session.id}`), [401]);
      denied(await owner.request('POST', '/api/sessions', { name: 'Expired login cannot mutate' }), [401]);
    } finally { clock.mockRestore(); }
  });

  it('enforces viewer/editor/owner distinctions and revocation for reads, writes and assets', async () => {
    const owner = await h.account(), participant = await h.account();
    const session = await owner.session(), display = await owner.display(session.id);
    const asset = success(await owner.request<AssetRecord>('POST', `/api/sessions/${session.id}/assets`, { name: 'pixel.png', mimeType: 'image/png', base64: PNG }));
    success(await owner.request('POST', `/api/sessions/${session.id}/members`, { username: participant.user!.username, role: 'viewer' }));
    expect((await participant.detail(session.id)).session.id).toBe(session.id);
    const bytes = await participant.raw(asset.url);
    expect(bytes.status).toBe(200);
    expect(Buffer.from(await bytes.arrayBuffer()).toString('base64')).toBe(PNG);

    for (const [method, path, body] of [
      ['POST', `/api/sessions/${session.id}/submit`, { requestId: 'viewer-publish', displayIds: [display.id], view: fact('Not authorized') }],
      ['POST', `/api/sessions/${session.id}/clear`, { requestId: 'viewer-clear', displayIds: [display.id] }],
      ['PATCH', `/api/sessions/${session.id}/config`, { expectedRevision: session.configRevision, config: { theme: 'light' } }],
      ['POST', `/api/sessions/${session.id}/members`, { username: participant.user!.username, role: 'editor' }],
      ['POST', `/api/sessions/${session.id}/datasets`, { name: 'not allowed', rows: [{ value: 1 }] }],
      ['POST', `/api/sessions/${session.id}/end`, {}],
    ] as const) denied(await participant.request(method, path, body));

    success(await owner.request('POST', `/api/sessions/${session.id}/members`, { username: participant.user!.username, role: 'editor' }));
    const edited = await participant.submit(session.id, [display.id], fact('Editor publication'));
    expect(edited.detail.displays[0].view?.data.text).toBe('Editor publication');
    denied(await participant.request('POST', `/api/sessions/${session.id}/end`, {}));
    success(await owner.request('DELETE', `/api/sessions/${session.id}/members/${participant.user!.id}`));
    denied(await participant.request('GET', `/api/sessions/${session.id}`));
    denied(await participant.request('GET', `/api/sessions/${session.id}/events`));
    const revokedAsset = await participant.raw(asset.url);
    expect([403, 404]).toContain(revokedAsset.status);
    await revokedAsset.arrayBuffer();
    denied(await participant.request('POST', `/api/sessions/${session.id}/submit`, { requestId: 'revoked', displayIds: [display.id], view: fact('Denied') }));
    expect((await owner.detail(session.id)).displays[0].view?.data.text).toBe('Editor publication');
  });

  it('does not trust a body sessionId or cross-session display even for the same owner', async () => {
    const owner = await h.account(), a = await owner.session('A'), b = await owner.session('B');
    const da = await owner.display(a.id), db = await owner.display(b.id);
    denied(await owner.request('POST', `/api/sessions/${a.id}/submit`, { requestId: 'wrong-display', displayIds: [db.id], view: fact('Wrong session') }), [400, 403, 404, 422]);
    const attemptedOverride = await owner.request('POST', `/api/sessions/${a.id}/submit`, { sessionId: b.id, requestId: 'body-override', displayIds: [da.id], view: fact('Scoped to route') });
    // Rejecting the redundant field or enforcing the path is safe; using it to change B is not.
    if (attemptedOverride.status < 300) await owner.settle(a.id, 'body-override');
    else denied(attemptedOverride, [400, 422]);
    const otherSession = await owner.detail(b.id);
    expect(otherSession.displays[0].view).toBeNull();
    expect(otherSession.updates).toHaveLength(0);
  });

  it('stops live content, writes and asset access after ending a session', async () => {
    const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
    const asset = success(await owner.request<AssetRecord>('POST', `/api/sessions/${session.id}/assets`, { name: 'pixel.png', mimeType: 'image/png', base64: PNG }));
    await owner.submit(session.id, [display.id], fact('Before end'));
    success(await owner.request('POST', `/api/sessions/${session.id}/end`, {}));
    denied(await owner.request('POST', `/api/sessions/${session.id}/submit`, { requestId: 'after-end', displayIds: [display.id], view: fact('After end') }), [403, 404, 409, 410]);
    denied(await owner.request('GET', `/api/sessions/${session.id}/events`), [403, 404, 409, 410]);
    const response = await owner.raw(asset.url);
    expect([403, 404, 409, 410]).toContain(response.status);
    await response.arrayBuffer();
  });
});

describe('registration deployment policy', () => {
  it('can close public registration without exposing an account-creation fallback', async () => {
    const h = await startHarness({ allowRegistration: false });
    try {
      const browser = h.browser();
      denied(await browser.request('POST', '/api/auth/register', { username: 'closed_registration', password: randomBytes(24).toString('base64url') }), [403, 404]);
      denied(await browser.request('GET', '/api/auth/me'), [401]);
    } finally { await h.close(); }
  });
});
