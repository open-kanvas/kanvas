import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { denied, startHarness, success, type Browser, type Harness } from './harness.js';

interface Pair { id: string; status: string; proofHash?: string }
describe('public pairing and enrolled receiver record boundaries', () => {
  let h: Harness;
  beforeEach(async () => {
    let sequence = 0;
    h = await startHarness({ pairingLabel: () => `boundary ${++sequence}` });
  });
  afterEach(async () => { await h?.close(); });

  async function enroll(owner: Browser) {
    const receiver = h.browser();
    const request = success(await receiver.request<{ code: string; label: string }>('POST', '/api/screens/request', {}));
    success(await owner.request('POST', '/api/screens/decide', { code: request.code, label: request.label, approve: true, confirm: true }));
    success(await receiver.request('POST', '/api/screens/claim', {}));
    const records = await h.runtime.store.list<Pair>('pairing');
    const record = records.find(pair => pair.proofHash === undefined);
    expect(record).toBeDefined();
    return { receiver, record: record! };
  }

  it('retries a public request alongside a real enrolled receiver without revoking that receiver', async () => {
    const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
    const { receiver, record } = await enroll(owner), guest = h.browser();
    const first = success(await guest.request<Pair>('POST', '/api/pairings', { sessionId: session.id, displayId: display.id }));
    const second = success(await guest.request<Pair>('POST', '/api/pairings', { sessionId: session.id, displayId: display.id }));
    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe('pending');
    expect(await h.runtime.store.get<Pair>('pairing', first.id)).toMatchObject({ status: 'cancelled' });
    expect(await h.runtime.store.get<Pair>('pairing', record.id)).toEqual(record);
    expect(success(await receiver.request<{ viewOnly: boolean }>('GET', '/api/auth/me')).viewOnly).toBe(true);
    success(await owner.request('POST', `/api/pairings/${second.id}/decision`, { approve: true }));
    expect(success(await guest.request<Pair>('GET', `/api/pairings/${second.id}/status`)).status).toBe('approved');
    expect(success(await guest.request<{ viewOnly: boolean }>('GET', '/api/auth/me')).viewOnly).toBe(true);
  });

  it('rejects public proof operations on enrolled records without cancelling their narrow grant', async () => {
    const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id), guest = h.browser();
    success(await guest.request('POST', '/api/pairings', { sessionId: session.id, displayId: display.id }));
    const { receiver, record } = await enroll(owner);
    // Repeated invalid probes must not hit the public request failed-proof cancellation path.
    for (let attempt = 0; attempt < 12; attempt++) denied(await guest.request('GET', `/api/pairings/${record.id}/status`), [404]);
    denied(await guest.request('POST', `/api/pairings/${record.id}/details`, { selfName: 'Not the receiver' }), [404]);
    denied(await guest.request('POST', `/api/pairings/${record.id}/cancel`, {}), [404]);
    expect(await h.runtime.store.get<Pair>('pairing', record.id)).toEqual(record);
    expect(success(await receiver.request<{ viewOnly: boolean }>('GET', '/api/auth/me')).viewOnly).toBe(true);
    denied(await guest.request('GET', '/api/auth/me'), [401]);
  });
});
