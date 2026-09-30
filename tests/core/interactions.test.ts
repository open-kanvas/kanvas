import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { InteractionRecord, ViewSpec } from '../../src/shared/types.js';
import { denied, fact, startHarness, success, type Harness } from './harness.js';

const question: ViewSpec = {
  version: 1, template: 'fact', data: { text: 'Choose the next supplied comparison.' },
  actions: [{ id: 'choose', kind: 'choice', label: 'Compare', options: ['Cost', 'Duration'] }],
};

describe('revision-bound viewer actions', () => {
  let h: Harness;
  beforeEach(async () => { h = await startHarness(); });
  afterEach(async () => { await h?.close(); });

  it('retains one pending action across retries and explicit reads until acknowledgement', async () => {
    const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
    const view = await owner.submit(session.id, [display.id], question);
    const revision = view.detail.displays[0].revision;
    const input = { displayId: display.id, revision, actionId: 'choose', value: 'Cost', requestId: 'one-action' };
    const first = success(await owner.request<InteractionRecord>('POST', `/api/sessions/${session.id}/interactions`, input));
    const retry = success(await owner.request<InteractionRecord>('POST', `/api/sessions/${session.id}/interactions`, input));
    expect(first.id).toBe(retry.id);
    expect(first).toMatchObject({ sessionId: session.id, displayId: display.id, revision, actionId: 'choose', value: 'Cost', userId: owner.user!.id, status: 'pending' });
    const readOne = (await owner.detail(session.id)).interactions;
    const readTwo = (await owner.detail(session.id)).interactions;
    expect(readOne).toHaveLength(1); expect(readTwo).toHaveLength(1);
    expect(readTwo[0].status).toBe('pending');
    denied(await owner.request('POST', `/api/sessions/${session.id}/interactions`, { ...input, value: 'Duration' }), [409]);
    // The unique inbox record ID, not reusable template actionId, acknowledges processing.
    denied(await owner.request('POST', `/api/sessions/${session.id}/interactions/choose/ack`, {}), [400, 404]);
    success(await owner.request('POST', `/api/sessions/${session.id}/interactions/${first.id}/ack`, {}));
    success(await owner.request('POST', `/api/sessions/${session.id}/interactions/${first.id}/ack`, {}));
    expect((await owner.detail(session.id)).interactions[0].status).toBe('acknowledged');
  });

  it('refuses fabricated choices, unknown controls and stale view revisions without enqueueing', async () => {
    const owner = await h.account(), stranger = await h.account(), session = await owner.session(), display = await owner.display(session.id);
    const initial = await owner.submit(session.id, [display.id], question), revision = initial.detail.displays[0].revision;
    const input = { displayId: display.id, revision, actionId: 'choose', value: 'Cost', requestId: 'base' };
    denied(await stranger.request('POST', `/api/sessions/${session.id}/interactions`, input));
    denied(await owner.request('POST', `/api/sessions/${session.id}/interactions`, { ...input, requestId: 'unknown', actionId: 'not-in-this-view' }), [400, 404, 422]);
    denied(await owner.request('POST', `/api/sessions/${session.id}/interactions`, { ...input, requestId: 'fabricated-choice', value: 'Not an offered choice' }), [400, 422]);
    denied(await owner.request('POST', `/api/sessions/${session.id}/interactions`, { ...input, requestId: 'oversized', value: 'x'.repeat(100_000) }), [400, 413, 422]);
    await owner.submit(session.id, [display.id], fact('The choice is no longer active'));
    denied(await owner.request('POST', `/api/sessions/${session.id}/interactions`, { ...input, requestId: 'stale' }), [409]);
    expect((await owner.detail(session.id)).interactions).toHaveLength(0);
  });

  it('does not confuse identical request IDs or action IDs from independent sessions', async () => {
    const owner = await h.account(), a = await owner.session('A'), b = await owner.session('B');
    const da = await owner.display(a.id), db = await owner.display(b.id);
    const va = await owner.submit(a.id, [da.id], question), vb = await owner.submit(b.id, [db.id], question);
    const ia = success(await owner.request<InteractionRecord>('POST', `/api/sessions/${a.id}/interactions`, { displayId: da.id, revision: va.detail.displays[0].revision, actionId: 'choose', value: 'Cost', requestId: 'same-client-id' }));
    const ib = success(await owner.request<InteractionRecord>('POST', `/api/sessions/${b.id}/interactions`, { displayId: db.id, revision: vb.detail.displays[0].revision, actionId: 'choose', value: 'Duration', requestId: 'same-client-id' }));
    expect(ia.id).not.toBe(ib.id);
    denied(await owner.request('POST', `/api/sessions/${a.id}/interactions/${ib.id}/ack`, {}));
    expect((await owner.detail(b.id)).interactions[0].status).toBe('pending');
    success(await owner.request('POST', `/api/sessions/${a.id}/interactions/${ia.id}/ack`, {}));
    expect((await owner.detail(a.id)).interactions[0].status).toBe('acknowledged');
    expect((await owner.detail(b.id)).interactions[0].status).toBe('pending');
  });
});
