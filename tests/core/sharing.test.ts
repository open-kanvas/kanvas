import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { Response } from 'express';
import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import type { AssetRecord } from '../../src/shared/types.js';
import type { DisplayRecord } from '../../src/shared/types.js';
import type { InteractionRecord } from '../../src/shared/types.js';
import type { ViewSpec } from '../../src/shared/types.js';
import { hash } from '../../src/server/auth.js';
import type { PairingRecord } from '../../src/server/access-flows.js';
import type { ShareRecord } from '../../src/server/sharing.js';
import { denied } from './harness.js';
import { fact } from './harness.js';
import { PNG } from './harness.js';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import type { Browser } from './harness.js';
import type { Harness } from './harness.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import type { UpdateRecord } from '../../src/shared/types.js';
import { toolFailure } from '../../src/server/mcp/results.js';
import { toolSuccess } from '../../src/server/mcp/results.js';
import { canonicalToolDefinitions } from '../../src/server/mcp/canonical.js';
import { OPERATION_ENTRIES } from '../../src/server/mcp/operations.js';
import { AppError } from '../../src/server/store.js';
import { ACCESS_LIMITS } from '../../src/server/access-flows.js';
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
import { SEAT_LAYOUTS } from '../../src/shared/venue';
import { materializeSeats } from '../../src/shared/venue';
import { VOCABULARY } from '../../src/shared/venue';
import { venueSchemas } from '../../src/shared/venue';
import { validateStatic } from '../../src/server/custom-templates';
import { validateCustomSchema } from '../../src/server/custom-templates';
import { bindTemplate } from '../../src/shared/custom-templates';
import { DiscoveryCatalog } from '../../src/server/mcp/discovery';
import { safeError } from '../../src/server/mcp/results';
import { CANONICAL_TOOLS } from '../../src/server/mcp/canonical';
import { vi } from 'vitest';
import { accountTier } from '../../src/server/usage-limits.js';
import { accountUsageLimits } from '../../src/server/usage-limits.js';
import { VisualCaptureResult } from '../../src/server/visual-capture.js';
import { resolveToolCall } from '../../src/server/mcp/catalog.js';
import type { ViewerPresence } from '../../src/shared/viewer-experience.js';
import { createApp } from '../../src/server/app.js';
import { validateMedia } from '../../src/server/rendering/media.js';
import { normalizedScroll } from '../../src/client/renderers/Navigation.js';
import { navigationCapabilities } from '../../src/shared/navigation.js';
import { readFileSync } from 'node:fs';

describe("sharing coverage 1", () => {


interface Invitation { id: string; label: string; sessionId: string; displayId: string; allowInteraction: boolean; status: string; expiresAt: string; joinUrl: string; viewerPath?: string }
interface Pairing { id: string; label: string; shareId?: string; sessionId: string; displayId: string; status: string; expiresAt: string; grantExpiresAt?: number; requestedInteractive?: boolean; interactive?: boolean }
interface Me { user: { id: string; username: string; displayName: string }; csrfToken: string; viewOnly?: boolean; interactive?: boolean; captureOnly?: boolean; sessionId?: string; displayId?: string }
const poll: ViewSpec = { version: 1, template: 'poll', data: { question: 'Choose a direction', options: [{ id: 'a', label: 'North' }, { id: 'b', label: 'South' }] } };

describe('owner-approved invitation sharing, isolated guest responses and revocation', () => {
  let h!:Harness, owner: Browser, sessionId: string, displayId: string;
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
});

describe("sharing coverage 2", () => {


describe("sharing contracts",()=>{
  let h!:Harness,owner:Browser,s:string,d:string,p:AuthPrincipal;
  const path=()=>`/api/sessions/${s}/displays/${d}`;
  const call=async <T=Record<string,unknown>>(name:string,args:unknown)=>(await h.runtime.service.execute(name,args,p)) as Promise<T>;
  const current=async()=> (await owner.detail(s)).displays.find(x=>x.id===d)!;
  const settle=async(update:UpdateRecord)=>owner.settle(s,update.requestId);
  beforeEach(async()=>{h=await startHarness();owner=await h.account();s=(await owner.session()).id;d=(await owner.display(s)).id;p={userId:owner.user!.id};});
  afterEach(async()=>{await h?.close();});
  async function guest(interactive:boolean){
    const share=await call<{id:string}>('kanvas_share_create',{sessionId:s,displayId:d,allowInteraction:interactive});const g=h.browser();
    const pair=success(await g.request<{id:string}>('POST','/api/pairings',{shareId:share.id,deviceName:'Evening test screen',requestedInteractive:interactive}));
    await call('kanvas_pairing_decide',{sessionId:s,pairingId:pair.id,approve:true,confirm:true,interactive});success(await g.request('GET',`/api/pairings/${pair.id}/status`));g.csrf=success(await g.request<{csrfToken:string}>('GET','/api/auth/me')).csrfToken;return g;
  }
  it('does not replace content by default or create half an invitation for a stale show request',async()=>{
    await owner.submit(s,[d],fact('Keep this'));await call('kanvas_share_create',{sessionId:s,displayId:d});expect((await current()).view?.data.text).toBe('Keep this');
    const before=(await h.runtime.store.list('share',s)).length;
    await expect(call('kanvas_share_create',{sessionId:s,displayId:d,showOnDisplay:true,requestId:randomUUID(),expectedRevision:0})).rejects.toMatchObject({code:'REVISION_CONFLICT'});expect((await h.runtime.store.list('share',s))).toHaveLength(before);
    const shown=await call<{update:UpdateRecord}>('kanvas_share_create',{sessionId:s,displayId:d,showOnDisplay:true});await settle(shown.update);expect((await current()).view?.template).toBe('join');
  });});
});

describe("sharing coverage 3", () => {


describe("sharing contracts", () => {
  let h!:Harness, owner: Browser, sessionId: string, displayId: string, p: AuthPrincipal;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = async (name: string, args: unknown) => (await h.runtime.service.execute(name, args, p)) as any;
  const path = (id = displayId) => `/api/sessions/${sessionId}/displays/${id}`;
  beforeEach(async () => { h = await startHarness(); owner = await h.account(); sessionId = (await owner.session()).id; displayId = (await owner.display(sessionId)).id; p = { userId: owner.user!.id }; });
  afterEach(async () => { await h?.close(); });

  it('keeps pending pairing requests open for one hour without granting access', () => {
    expect(ACCESS_LIMITS.pairingMs).toBe(60 * 60_000);
    expect(ACCESS_LIMITS.pairedBrowserMs).toBe(7 * 86400_000);
  });});
});

describe("sharing coverage 4", () => {

const displayGuidance=(template:string)=>(TEMPLATE_DISPLAY_GUIDANCE as Record<string,unknown>)[template];

const pane=(id:string,text=id)=>({id,view:{version:1,template:'fact',data:{text}}});
const split=(data:Record<string,unknown>)=>({version:1,template:'split-screen',data});

describe("sharing contracts",()=>{
 it('22eccdda: a session reports its most exposed sharing level',async()=>{
  const h=await startHarness();
  try{
   const o=await h.account(),other=await h.account(),session=await o.session(),p={userId:o.user!.id},svc=h.runtime.service;
   const level=async()=>sharingLevel(svc,(await svc.store.get<any>('session',session.id))!);
   expect(await level()).toBe('private');
   success(await o.request('POST',`/api/sessions/${session.id}/members`,{username:other.user!.username,role:'viewer'}));
   expect(await level()).toBe('shared');
   const overview=success(await o.request<any>('GET','/api/start'));
   expect(overview.sessions.find((x:any)=>x.id===session.id).sharing).toBe('shared');
   const stored=(await svc.store.get<any>('session',session.id))!;
   await svc.store.put('session',{...stored,publicAccess:{enabled:true,revision:1}});
   expect(await level()).toBe('public');
   await svc.store.put('session',{...stored,publicAccess:{enabled:false,revision:2}});
   await svc.store.put('session-group-grant',{id:`${session.id}:g1`,sessionId:session.id,groupId:'g1',role:'viewer',revision:1,updatedAt:new Date().toISOString()});
   expect(await level()).toBe('team');void p;
  }finally{await h.close();}
 });});
});

describe("sharing coverage 5", () => {

describe("sharing contracts",()=>{
 let h!:Harness,o:Browser,s:string,d:string,p:{userId:string};
 beforeEach(async()=>{h=await startHarness();o=await h.account();s=(await o.session()).id;d=(await o.display(s)).id;p={userId:o.user!.id};});
 afterEach(async()=>{await h?.close();});
 const call=(name:string,args:Record<string,unknown>={})=>h.runtime.service.execute(name,args,p) as Promise<any>;
 const update=(name:string,args:Record<string,unknown>)=>call(name,{sessionId:s,displayId:d,...args});
 const publish=async(template:any,data:any)=>{const result=await o.submit(s,[d],{version:1,template,data});expect(result.update.status).toBe('prepared');return result.detail.displays.find(x=>x.id===d)!;};
 const current=async()=> (await o.detail(s)).displays.find(x=>x.id===d)!;
 const definition={name:'Team list',schema:{type:'object',properties:{title:{type:'string'},items:{type:'array',items:{type:'object',properties:{name:{type:'string'}},required:['name']}}},required:['title','items']},html:'<article><h1>{{title}}</h1><ul>{{#each items}}<li>{{name}}</li>{{/each}}</ul></article>',css:'article {padding: 24px; color: white;} h1 {font-size: 48px;}'};
 it('media sharing is only granted after successful publication and revocation is immediate',async()=>{
  const media=await h.runtime.service.mediaLibrary.upload(p,{name:'photo.png',mimeType:'image/png',base64:PNG});
  const guest=await h.account();await call('kanvas_member_add',{sessionId:s,username:guest.user!.username,role:'viewer'});
  await expect(h.runtime.service.verifyView(p,s,{version:1,template:'todays-special',data:{item:{image:media.url,price:{invalid:true}}}})).rejects.toThrow();
  expect((await guest.raw(media.url)).status).toBe(404);
  await publish('todays-special',{item:{image:media.url}});
  expect((await guest.raw(media.url)).status).toBe(200);
  await call('kanvas_member_remove',{sessionId:s,userId:guest.user!.id});
  expect((await guest.raw(media.url)).status).toBe(404);
 });});
});

describe("sharing coverage 6", () => {

let h!:Harness;
afterEach(async()=>{vi.restoreAllMocks();delete process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT;delete process.env.KANVAS_MAX_VIEWS_PER_SESSION;await h?.close();});
async function principal(a:Browser){const session=await h.runtime.auth.issueBrowser(a.user!.id,{cookie:()=>{}} as unknown as Response);return {userId:a.user!.id,browserId:session.id};}
const pixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=';
describe("sharing contracts",()=>{
 it('tiers retain session entitlements and share the fixed view cap without gaining administrator authority',async()=>{
  h=await startHarness();const a=await h.account(),p=await principal(a);
  process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT=String((await h.runtime.service.sessionUsage(p.userId)).active+1);/* 2026-11-10 (43bcc861): the automatic Home session no longer uses a slot. */process.env.KANVAS_MAX_VIEWS_PER_SESSION='1';
  expect(await accountTier(h.runtime.store,p.userId)).toBe('trial');
  const s=await h.runtime.service.createSession(p,'Trial'),d=await h.runtime.service.createDisplay(p,s.id,{name:'Screen',width:800,height:600});
  await expect(h.runtime.service.createSession(p,'Too many')).rejects.toMatchObject({code:'SESSION_LIMIT_REACHED'});
  await h.runtime.store.put('account-tier',{id:p.userId,tier:'future-invalid'});
  await expect(h.runtime.service.createSession(p,'Still trial')).rejects.toMatchObject({code:'SESSION_LIMIT_REACHED'});
  for(const tier of ['free','admin']){await h.runtime.store.put('account-tier',{id:p.userId,tier});await h.runtime.service.createSession(p,`Tier ${tier}`);expect(await h.runtime.service.accounts.isServiceAdmin(p)).toBe(false);}
  for(let i=0;i<3;i++)await a.submit(s.id,[d.id],fact(`View ${i}`));
  expect((await h.runtime.service.history.list(await h.runtime.service.display(p,s.id,d.id))).entries.filter(x=>x.template)).toHaveLength(3);
  await h.runtime.store.put('account-tier',{id:p.userId,tier:'trial'});
  expect((await accountUsageLimits(h.runtime.store,p.userId)).views).toBe(1000);await a.submit(s.id,[d.id],fact('Within fixed cap'));
  for(const tier of ['free','admin']){await h.runtime.store.put('account-tier',{id:p.userId,tier});expect((await accountUsageLimits(h.runtime.store,p.userId)).views).toBe(1000);}
 });});
});

describe("sharing coverage 7", () => {


describe("sharing contracts",()=>{
  let h!:Harness,owner:Browser,sessionId:string,displayId:string,p:AuthPrincipal;
  const path=()=>`/api/sessions/${sessionId}/displays/${displayId}`;
  const call=async (name:string,args:unknown)=>(await h.runtime.service.execute(name,args,p));
  beforeEach(async()=>{h=await startHarness();owner=await h.account();sessionId=(await owner.session()).id;displayId=(await owner.display(sessionId)).id;p={userId:owner.user!.id};});
  afterEach(async()=>{await h?.close();});
  it('short addresses never grant content access and are stable service-wide locators',async()=>{
    const first=await call('kanvas_address_get',{sessionId,displayId}) as {alias:string;url:string};const again=await call('kanvas_address_get',{sessionId,displayId});expect(again).toEqual(first);
    const response=await h.browser().raw(`/s/${first.alias}`);expect(response.status).toBe(302);expect(response.headers.get('location')).toBe(`/view/${sessionId}/${displayId}`);
    denied(await h.browser().request('GET',`/api/sessions/${sessionId}`),[401]);
    const another=await owner.display(sessionId);expect((await call('kanvas_address_get',{sessionId,displayId:another.id}) as {alias:string}).alias===first.alias).toBe(false);
  });});
});

describe("sharing coverage 8", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});const id=()=>randomUUID();
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><defs><linearGradient id="g"><stop offset="0" stop-color="#123456"/><stop offset="1" stop-color="#abcdef"/></linearGradient></defs><rect width="100" height="60" fill="url(#g)"/><text x="4" y="30">Team &amp; Friends</text></svg>';
it('revokes only the selected approved browser while other paired browsers and owner account remain authorized',async()=>{
  h=await startHarness();const owner=await h.account(),stranger=await h.account(),s=await owner.session(),d=await owner.display(s.id),browsers=[h.browser(),h.browser()],pairs:any[]=[];
  for(const browser of browsers){const pair=success(await browser.request<any>('POST','/api/pairings',{sessionId:s.id,displayId:d.id,deviceName:'Pair fixture'}));pairs.push(pair);success(await owner.request('POST',`/api/pairings/${pair.id}/decision`,{approve:true}));success(await browser.request('GET',`/api/pairings/${pair.id}/status`));}
  const args={sessionId:s.id,pairingId:pairs[0].id};await expect(h.runtime.service.execute('kanvas_pairing_revoke',args,{userId:stranger.user!.id})).rejects.toThrow();await h.runtime.service.execute('kanvas_pairing_revoke',args,{userId:owner.user!.id});
  denied(await browsers[0].request('GET','/api/auth/me'),[401,403]);success(await browsers[1].request('GET','/api/auth/me'));success(await owner.request('GET',`/api/sessions/${s.id}`));expect((await h.runtime.service.experience.pairings({userId:owner.user!.id},s.id)).find(p=>p.id===pairs[0].id)?.status).toBe('revoked');
});
});

describe("sharing coverage 9", () => {

let h!:Harness;const id=()=>randomUUID();afterEach(async()=>{await h?.close();});

it('keeps public broadcast navigation on reload and never exposes private viewer positioning',async()=>{
 h=await startHarness();const a=await h.account(),s=await a.session(),d=await a.display(s.id),p={userId:a.user!.id},svc=h.runtime.service;
 await a.submit(s.id,[d.id],{version:1,template:'image-gallery',data:{mode:'carousel',images:[{url:'https://example.com/1.png'},{url:'https://example.com/2.png'}]}});
 await svc.execute('kanvas_navigation_control',{sessionId:s.id,displayId:d.id,requestId:id(),expectedRevision:1,navigation:{action:'page',page:2}},p);
 const nav=(await svc.navigation.publicPosition(s.id,d.id));expect(nav?.state.page).toBe(1);expect(nav).not.toHaveProperty('viewerId');expect((await svc.display(p,s.id,d.id)).revision).toBe(1);
});
});
