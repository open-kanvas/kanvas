import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AssetRecord, DisplayRecord, InteractionRecord, ViewSpec } from '../../src/shared/types.js';
import { hash } from '../../src/server/auth.js';
import type { PairingRecord } from '../../src/server/access-flows.js';
import type { ShareRecord } from '../../src/server/sharing.js';
import { denied, fact, PNG, startHarness, success, type Browser, type Harness } from './harness.js';

interface Invitation { id: string; label: string; sessionId: string; displayId: string; allowInteraction: boolean; status: string; expiresAt: string; joinUrl: string; viewerPath?: string }
interface Pairing { id: string; label: string; shareId?: string; sessionId: string; displayId: string; status: string; expiresAt: string; grantExpiresAt?: number; requestedInteractive?: boolean; interactive?: boolean }
interface Me { user: { id: string; username: string; displayName: string }; csrfToken: string; viewOnly?: boolean; interactive?: boolean; captureOnly?: boolean; sessionId?: string; displayId?: string }
const poll: ViewSpec = { version: 1, template: 'poll', data: { question: 'Choose a direction', options: [{ id: 'a', label: 'North' }, { id: 'b', label: 'South' }] } };

describe('owner-approved invitation sharing, isolated guest responses and revocation', () => {
  let h: Harness, owner: Browser, sessionId: string, displayId: string;
  beforeEach(async () => {
    h = await startHarness(); owner = await h.account();
    sessionId = (await owner.session('Private owner workspace')).id;
    displayId = (await owner.display(sessionId, 'Private display name')).id;
  });
  afterEach(async () => { await h?.close(); });
  const path = () => `/api/sessions/${sessionId}`;
  const invite = async (allowInteraction = false) => success(await owner.request<Invitation>('POST', `${path()}/shares`, { displayId, label: 'Workshop invitation', allowInteraction, expiresInHours: 1 }));
  const request = async (share: Invitation, requestedInteractive = false, guest = h.browser()) => ({ guest, pair: success(await guest.request<Pairing>('POST', '/api/pairings', { shareId: share.id, deviceName: 'Guest device', requestedInteractive })) });
  const claim = async (guest: Browser, pair: Pairing) => {
    expect(success(await guest.request<Pairing>('GET', `/api/pairings/${pair.id}/status`)).status).toBe('approved');
    const me = success(await guest.request<Me>('GET', '/api/auth/me')); guest.csrf = me.csrfToken; return me;
  };
  const approve = async (share: Invitation, interactive = false) => {
    const { guest, pair } = await request(share, interactive);
    success(await owner.request('POST', `/api/pairings/${pair.id}/decision`, { approve: true, interactive }));
    return { guest, pair, me: await claim(guest, pair) };
  };
  const current = async (browser = owner) => (await browser.detail(sessionId)).displays.find(item => item.id === displayId)!;
  const publish = async (view: ViewSpec) => { await owner.submit(sessionId, [displayId], view); return current(); };
  const respond = (browser: Browser, value: Record<string, unknown>, revision: number, requestId = randomUUID()) => browser.request<InteractionRecord>('POST', `${path()}/displays/${displayId}/respond`, { value, revision, requestId });

  it('keeps invitation discovery separate from authorization and exposes no private metadata', async () => {
    const share = await invite(), guest = h.browser();
    const discovered = success(await guest.request<Invitation>('GET', `/api/shares/${share.id}`));
    expect(Object.keys(discovered).sort()).toEqual(['allowInteraction', 'expiresAt', 'id', 'label', 'status']);
    expect(discovered.label).toBe('Workshop invitation');
    expect(share.joinUrl).toBe(`http://127.0.0.1/join/${share.id}`);
    expect(new URL(share.joinUrl).search).toBe('');
    expect(guest.cookies.size).toBe(0);
    denied(await guest.request('GET', '/api/auth/me'), [401]);
    denied(await guest.request('GET', `${path()}?displayId=${displayId}`), [401]);
    denied(await guest.request('GET', `${path()}/events?displayId=${displayId}`), [401]);
    expect((await guest.raw('/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'invitation-has-no-token', version: '1' } } }) })).status).toBe(401);
    const { pair } = await request(share, false, guest);
    expect(pair.status).toBe('pending');
    expect(Object.keys(pair).some(key => /token|proof|password|owner|browserSession/i.test(key))).toBe(false);
    denied(await guest.request('GET', '/api/auth/me'), [401]);
    denied(await h.browser().request('GET', `/api/pairings/${pair.id}/status`), [401]);
    denied(await h.browser().request('POST', `/api/pairings/${pair.id}/cancel`, {}), [401]);
    const stored = (await h.runtime.store.get<PairingRecord>('pairing', pair.id))!;
    expect(stored.proofHash).toMatch(/^[a-f0-9]{64}$/);
    expect([...guest.cookies.values()].some(value => value === stored.proofHash)).toBe(false);
  });

  it('requires owning-account approval and enforces CSRF, origin, display and duration boundaries', async () => {
    const editor = await h.account(), stranger = await h.account();
    success(await owner.request('POST', `${path()}/members`, { username: editor.user!.username, role: 'editor' }));
    for (const other of [editor, stranger, h.browser()]) {
      denied(await other.request('POST', `${path()}/shares`, { displayId }), [401, 403, 404]);
      denied(await other.request('GET', `${path()}/shares`), [401, 403, 404]);
    }
    denied(await owner.request('POST', `${path()}/shares`, { displayId }, { csrf: null }), [403]);
    denied(await owner.request('POST', `${path()}/shares`, { displayId }, { origin: 'https://unrelated.invalid' }), [403]);
    const otherSession = await owner.session(), otherDisplay = await owner.display(otherSession.id);
    denied(await owner.request('POST', `${path()}/shares`, { displayId: otherDisplay.id }), [404]);
    for (const expiresInHours of [0, 169, 1.5]) denied(await owner.request('POST', `${path()}/shares`, { displayId, expiresInHours }), [400]);
    denied(await owner.request('POST', `${path()}/shares`, { displayId, publicAccess: true }), [400]);
    const share = await invite(), { guest, pair } = await request(share);
    denied(await editor.request('POST', `/api/pairings/${pair.id}/decision`, { approve: true }));
    denied(await owner.request('POST', `/api/pairings/${pair.id}/decision`, { approve: true }, { csrf: null }), [403]);
    denied(await guest.request('POST', '/api/pairings', { shareId: share.id, deviceName: 'Cross origin' }, { origin: 'https://unrelated.invalid' }), [403]);
    denied(await guest.request('POST', '/api/pairings', { shareId: share.id, displayId: otherDisplay.id }), [400]);
    denied(await guest.request('POST', '/api/pairings', { shareId: share.id, sessionId: otherSession.id }), [400]);
    denied(await stranger.request('DELETE', `/api/shares/${share.id}`));
    expect(success(await guest.request<Pairing>('GET', `/api/pairings/${pair.id}/status`)).status).toBe('pending');
  });

  it('defaults even requested participation to view-only and never replaces a signed-in account', async () => {
    const display = await publish(poll), share = await invite(true), outsider = await h.account();
    const accountId = outsider.user!.id;
    expect(success(await outsider.request<Invitation>('GET', `/api/shares/${share.id}`)).viewerPath).toBeUndefined();
    denied(await outsider.request('POST', '/api/pairings', { shareId: share.id, requestedInteractive: true }), [409]);
    expect(success(await outsider.request<Me>('GET', '/api/auth/me')).user.id).toBe(accountId);
    expect(success(await owner.request<Invitation>('GET', `/api/shares/${share.id}`)).viewerPath).toBe(`/view/${sessionId}/${displayId}`);
    const { guest, pair } = await request(share, true);
    success(await owner.request('POST', `/api/pairings/${pair.id}/decision`, { approve: true }));
    const me = await claim(guest, pair);
    expect(me.interactive).toBe(false); expect(me.viewOnly).toBe(true);
    expect(me.user.id).toBe(`pairing:${pair.id}`); expect(me.user.username).toBe('guest');
    expect(JSON.stringify(me).includes(owner.user!.username)).toBe(false);
    denied(await respond(guest, { kind: 'poll.vote', optionIds: ['a'] }, display.revision), [403]);
    expect((await current()).responseState!.poll).toEqual({ revealed: false });
  });

  it('requires an allowed request plus an explicit interactive decision and rejects forged authority', async () => {
    const readShare = await invite(), liveShare = await invite(true);
    denied(await h.browser().request('POST', '/api/pairings', { shareId: readShare.id, requestedInteractive: true }), [403]);
    for (const body of [{ interactive: true }, { participantId: owner.user!.id }, { userId: owner.user!.id }, { requestedInteractive: 'true' }]) {
      denied(await h.browser().request('POST', '/api/pairings', { shareId: liveShare.id, ...body }), [400]);
    }
    const unrequested = await request(liveShare, false);
    denied(await owner.request('POST', `/api/pairings/${unrequested.pair.id}/decision`, { approve: true, interactive: true }), [403]);
    expect(success(await unrequested.guest.request<Pairing>('GET', `/api/pairings/${unrequested.pair.id}/status`)).status).toBe('pending');
    const directGuest = h.browser(), direct = success(await directGuest.request<Pairing>('POST', '/api/pairings', { sessionId, displayId }));
    denied(await owner.request('POST', `/api/pairings/${direct.id}/decision`, { approve: true, interactive: true }), [403]);
    const { me, pair } = await approve(liveShare, true);
    expect(me.interactive).toBe(true); expect(me.user.id).toBe(`pairing:${pair.id}`);
    denied(await owner.request('POST', `/api/pairings/${pair.id}/decision`, { approve: true, interactive: true }), [409]);
  });

  it('isolates guest votes, selected answers and retry keys from the owner and other browsers', async () => {
    const display = await publish(poll), share = await invite(true), first = await approve(share, true), second = await approve(share, true);
    const requestId = randomUUID(), vote = { kind: 'poll.vote', optionIds: ['a'] };
    const a = success(await respond(first.guest, vote, display.revision, requestId));
    const b = success(await respond(second.guest, { ...vote, optionIds: ['b'] }, display.revision, requestId));
    const c = success(await respond(owner, vote, display.revision, requestId));
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    expect([a.userId, b.userId, c.userId]).toEqual([first.me.user.id, second.me.user.id, owner.user!.id]);
    expect(success(await respond(first.guest, vote, display.revision, requestId)).id).toBe(a.id);
    expect((await current(first.guest)).responseState!.poll).toEqual({ revealed: false, selectedOptionIds: ['a'] });
    expect((await current(second.guest)).responseState!.poll).toEqual({ revealed: false, selectedOptionIds: ['b'] });
    denied(await first.guest.request('GET', `${path()}/interactions`), [404]);
    expect((await first.guest.detail(sessionId)).interactions).toEqual([]);
    denied(await first.guest.request('POST', `${path()}/displays/${displayId}/respond`, { value: vote, revision: display.revision, requestId: randomUUID(), participantId: owner.user!.id }), [400]);
    denied(await respond(first.guest, { ...vote, userId: owner.user!.id }, display.revision), [400]);
    const revealed = success(await owner.request<DisplayRecord>('PATCH', `${path()}/displays/${displayId}/view`, { expectedRevision: display.revision, data: { ...display.view!.data, revealResults: true } }));
    expect(revealed.responseState!.poll).toMatchObject({ revealed: true, totalVotes: 3, counts: { a: 2, b: 1 } });
    expect((await current(first.guest)).responseState!.poll).toMatchObject({ selectedOptionIds: ['a'], totalVotes: 3 });
    success(await respond(second.guest, vote, revealed.revision));
    expect((await current()).responseState!.poll).toMatchObject({ totalVotes: 3, counts: { a: 3, b: 0 } });
  });

  it('allows only current on-display responses and keeps management, source data and other screens private', async () => {
    const display = await publish({ ...fact('Shared content'), actions: [{ id: 'ask', kind: 'input', label: 'Ask presenter' }] });
    const privateDisplay = await owner.display(sessionId, 'Other private screen');
    await owner.submit(sessionId, [privateDisplay.id], fact('Unrevealed private content'));
    const dataset = success(await owner.request<{ id: string }>('POST', `${path()}/datasets`, { name: 'Private source', rows: [{ private: 'Raw data' }] }));
    const asset = success(await owner.request<AssetRecord>('POST', `${path()}/assets`, { name: 'Hidden media', mimeType: 'image/png', base64: PNG }));
    const share = await invite(true), { guest, pair } = await approve(share, true);
    const body = { requestId: randomUUID(), displayId, revision: display.revision, actionId: 'ask', value: 'My question' };
    expect(success(await guest.request<InteractionRecord>('POST', `${path()}/interactions`, body)).userId).toBe(`pairing:${pair.id}`);
    denied(await guest.request('POST', `${path()}/interactions`, { ...body, requestId: randomUUID(), actionId: 'invented' }), [404]);
    denied(await guest.request('POST', `${path()}/interactions`, { ...body, requestId: randomUUID(), revision: display.revision - 1 }), [409]);
    denied(await guest.request('POST', `${path()}/interactions`, { ...body, requestId: randomUUID(), displayId: privateDisplay.id }), [404]);
    const detail = await guest.detail(sessionId);
    expect(detail.displays.map(item => item.id)).toEqual([displayId]);
    expect([detail.members, detail.updates, detail.datasets, detail.assets, detail.interactions]).toEqual([[], [], [], [], []]);
    expect(JSON.stringify(detail)).not.toContain('Unrevealed private content');
    for (const endpoint of [`${path()}?displayId=${privateDisplay.id}`, `${path()}/datasets/${dataset.id}`, `/api/assets/${asset.id}`, `${path()}/displays/${displayId}/history`, `${path()}/shares`, `${path()}/pairings`, '/api/tokens']) denied(await guest.request('GET', endpoint));
    denied(await guest.request('POST', '/api/sessions', { name: 'Escalation' }));
    denied(await guest.request('POST', `${path()}/submit`, { requestId: randomUUID(), displayIds: [displayId], view: fact('Escalation') }));
    denied(await guest.request('PATCH', `${path()}/config`, { expectedRevision: 0, requestId: randomUUID(), config: { mode: 'focus' } }), [400, 403, 404]);
    denied(await guest.request('POST', `${path()}/members`, { username: 'uninvited', role: 'editor' }));
    denied(await guest.request('POST', `${path()}/shares`, { displayId }));
    denied(await guest.request('DELETE', `/api/shares/${share.id}`));
    expect((await guest.raw('/mcp', { method: 'GET', headers: { accept: 'text/event-stream' } })).status).toBe(401);
  });

  it('keeps form submission state per guest and permits shared checkbox updates without edit authority', async () => {
    const display = await publish({ version: 1, template: 'form', data: { fields: [{ id: 'answer', type: 'text', label: 'Private response', required: true }] } });
    const share = await invite(true), first = await approve(share, true), second = await approve(share, true);
    success(await respond(first.guest, { kind: 'form.submit', values: { answer: 'First guest answer' } }, display.revision));
    expect((await current(first.guest)).responseState!.form).toEqual({ submitted: true });
    expect((await current(second.guest)).responseState!.form).toEqual({ submitted: false });
    expect((await current()).responseState!.form).toEqual({ submitted: false });
    expect(JSON.stringify(await second.guest.detail(sessionId))).not.toContain('First guest answer');
    const checklist = await publish({ version: 1, template: 'checklist', data: { items: [{ id: 'item', text: 'Shared task', checked: false }] } });
    const toggled = success(await respond(first.guest, { kind: 'checklist.toggle', itemId: 'item', checked: true }, checklist.revision));
    expect(toggled.userId).toBe(first.me.user.id);
    expect((await current(second.guest)).view!.data.items).toMatchObject([{ id: 'item', checked: true }]);
    denied(await respond(second.guest, { kind: 'checklist.toggle', itemId: 'item', checked: false }, checklist.revision), [409]);
    denied(await first.guest.request('PATCH', `${path()}/displays/${displayId}/view`, { expectedRevision: checklist.revision + 1, data: { items: [{ id: 'item', text: 'Unauthorized edit', checked: true }] } }));
  });

  it('revokes one guest independently and cascades invitation revocation to pending requests and active streams', async () => {
    await publish(fact('Revoke me'));
    const share = await invite(true), first = await approve(share, true), second = await approve(share, true), pending = await request(share);
    const retainedCookies = new Map(first.guest.cookies);
    success(await owner.request('DELETE', `/api/pairings/${first.pair.id}`));
    denied(await first.guest.request('GET', path()), [401]);
    expect((await current(second.guest)).view!.data.text).toBe('Revoke me');
    const stream = await second.guest.raw(`${path()}/events?displayId=${displayId}`);
    expect(stream.status).toBe(200);
    success(await owner.request('DELETE', `/api/shares/${share.id}`));
    await stream.text();
    denied(await second.guest.request('GET', path()), [401]);
    denied(await h.browser().request('GET', `/api/shares/${share.id}`), [410]);
    denied(await h.browser().request('POST', '/api/pairings', { shareId: share.id }), [410]);
    expect(success(await pending.guest.request<Pairing>('GET', `/api/pairings/${pending.pair.id}/status`)).status).toBe('revoked');
    denied(await owner.request('POST', `/api/pairings/${pending.pair.id}/decision`, { approve: true }), [409]);
    const replay = h.browser(); for (const [name, value] of retainedCookies) replay.cookies.set(name, value);
    denied(await replay.request('GET', path()), [401]);
    expect((await h.runtime.store.list<PairingRecord>('pairing', sessionId)).filter(pair => pair.shareId === share.id).every(pair => pair.status === 'revoked')).toBe(true);
  });

  it('clamps grants to invitation expiry and rechecks persisted expiry before every request', async () => {
    const share = await invite(true), first = await approve(share, true), pending = await request(share);
    const pair = (await h.runtime.store.get<PairingRecord>('pairing', first.pair.id))!;
    expect(pair.grantExpiresAt).toBe(Date.parse(share.expiresAt));
    const browser = (await h.runtime.store.get<{ id: string; expiresAt: number }>('browser', pair.browserSessionId!))!;
    expect(browser.expiresAt).toBe(pair.grantExpiresAt);
    const stored = (await h.runtime.store.get<ShareRecord>('share', share.id))!;
    stored.expiresAt = new Date(Date.now() - 1).toISOString(); (await h.runtime.store.put('share', stored));
    denied(await first.guest.request('GET', '/api/auth/me'), [401]);
    denied(await first.guest.request('GET', path()), [401]);
    denied(await h.browser().request('GET', `/api/shares/${share.id}`), [410]);
    expect((await h.runtime.store.get<PairingRecord>('pairing', first.pair.id))!.status).toBe('expired');
    expect((await h.runtime.store.get('browser', pair.browserSessionId!))).toBeUndefined();
    expect(success(await pending.guest.request<Pairing>('GET', `/api/pairings/${pending.pair.id}/status`)).status).toBe('expired');
    denied(await owner.request('POST', `/api/pairings/${pending.pair.id}/decision`, { approve: true }), [409]);
  });

  it('rejects removed owning identities despite surviving browser and invitation records', async () => {
    await publish(fact('Access requires a current account'));
    const share = await invite(true), { guest } = await approve(share, true), waiting = await request(share);
    const retained = (await h.runtime.auth.browser({ cookies: Object.fromEntries(guest.cookies) } as unknown as Request)).principal;
    // PostgreSQL requires membership removal first; historical JSON grants
    // deliberately remain so authorization must recheck the owning identity.
    await h.runtime.store.db.prepare('DELETE FROM members WHERE user_id=?').run(owner.user!.id);
    (await h.runtime.store.db.prepare('DELETE FROM users WHERE id=?').run(owner.user!.id));
    for (const browser of [owner, guest]) {
      denied(await browser.request('GET', '/api/auth/me'), [401]);
      denied(await browser.request('GET', path()), [401]);
    }
    (await expect((async () => (await h.runtime.service.detail(retained, sessionId)))()).rejects.toThrow('Sign in to continue.'));
    denied(await h.browser().request('GET', `/api/shares/${share.id}`), [410]);
    denied(await h.browser().request('POST', '/api/pairings', { shareId: share.id }), [410]);
    expect(success(await waiting.guest.request<Pairing>('GET', `/api/pairings/${waiting.pair.id}/status`)).status).toBe('expired');
  });

  it('never upgrades a capture identity even if interactive flags are present', async () => {
    const display = await publish(poll), capture = h.browser(), pairingId = randomUUID(), deadline = Date.now() + 60_000, stamp = new Date().toISOString();
    let cookieValue = '';
    const session = (await h.runtime.auth.issueBrowser(owner.user!.id, { cookie: (_name: string, value: string) => { cookieValue = value; } } as unknown as Response, { scopedSessionId: sessionId, scopedDisplayId: displayId, pairingId, captureOnly: true, interactive: true }));
    session.expiresAt = deadline; (await h.runtime.store.put('browser', session));
    (await h.runtime.store.put<PairingRecord>('pairing', { id: pairingId, ownerId: owner.user!.id, sessionId, displayId, deviceName: 'Capture fixture', label: 'Capture fixture', status: 'approved', proofHash: hash(randomUUID()), createdAt: stamp, expiresAt: new Date(deadline).toISOString(), grantExpiresAt: deadline, claimedAt: stamp, browserSessionId: session.id, interactive: true }));
    capture.cookies.set(h.runtime.auth.cookieName, cookieValue); cookieValue = '';
    const me = success(await capture.request<Me>('GET', '/api/auth/me')); capture.csrf = me.csrfToken;
    expect(me.captureOnly).toBe(true); expect(me.interactive).toBe(false); expect(me.user.id).toBe('capture');
    expect((await current(capture)).responseState!.poll).toEqual({ revealed: false });
    denied(await respond(capture, { kind: 'poll.vote', optionIds: ['a'] }, display.revision), [403]);
    denied(await capture.request('POST', `${path()}/displays/${displayId}/applied`, { revision: display.revision }), [403]);
    denied(await capture.request('PATCH', `${path()}/displays/${displayId}`, { width: 640, height: 480 }), [403]);
    denied(await capture.request('POST', '/api/auth/logout', {}), [403]);
  });
});
