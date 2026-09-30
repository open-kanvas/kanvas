import { asyncMap } from '../../src/server/async-collections.js';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ControlledInterpreter, denied, fact, PNG, startHarness, success, type Harness } from './harness.js';
import type { MonitoringFetchResult, MonitoringFetcher } from '../../src/server/monitoring.js';
import type { MonitoringSummary } from '../../src/shared/monitoring.js';
import type { AuthPrincipal, Token } from '../../src/server/auth.js';
import type { UpdateRecord } from '../../src/shared/types.js';

const running: Harness[] = [];
afterEach(async () => { await Promise.all((await asyncMap(running.splice(0), async h => (await h.close())))); });
async function setup(fetcher?: MonitoringFetcher) {
  let time = Date.now();
  const interpret = vi.fn(async () => { throw new Error('These source operations must not invoke the source renderer.'); });
  const fetch = vi.fn(fetcher ?? (async () => ({ statusCode: 200, latencyMs: 5, mimeType: 'application/json', body: Buffer.from('{"text":"Exact source result"}'), finalUrl: 'https://example.com/status' })));
  const h = await startHarness({ interpreter: { interpret }, monitoringOptions: { automatic: false, now: () => time, fetcher: fetch } }); running.push(h);
  const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
  return { h, owner, session, display, interpret, fetch, advance: (ms: number) => { time += ms; } };
}
const jsonConfig = { mode: 'json', url: 'https://example.com/status', template: 'fact', mapping: { text: { $path: '/text' } }, intervalSeconds: 30, durationSeconds: 3600 };

describe('September 14 real application boundaries', () => {
  it('publishes and durably replays a partial patch without content regeneration or metadata loss', async () => {
    const { h, owner, session, display, interpret } = await setup();
    const first = await owner.submit(session.id, [display.id], { ...fact('First'), source: { title: 'Supplied source' } });
    const revision = first.detail.displays[0].revision;
    const path = `/api/sessions/${session.id}/displays/${display.id}/patch`;
    const body = { requestId: randomUUID(), expectedRevision: revision, operations: [{ op: 'appendText', path: '/data/text', value: ' plus exact text' }] };
    const patch = success(await owner.request<UpdateRecord>('POST', path, body));
    expect(patch).toMatchObject({ status: 'prepared', metrics: { path: 'direct' }, revisions: { [display.id]: revision + 1 } });
    success(await owner.request('POST', path, body));
    const current = (await owner.detail(session.id)).displays[0];
    expect(current.revision).toBe(revision + 1);
    expect(current.view).toMatchObject({ data: { text: 'First plus exact text' }, source: { title: 'Supplied source' } });
    expect((await h.runtime.store.list('update', session.id))).toHaveLength(2);
    expect(interpret).not.toHaveBeenCalled();
    denied(await owner.request('POST', path, { ...body, requestId: randomUUID() }), [409]);
  });

  it('publishes an exact mapped source, retains its frame on failure and stops through HTTP', async () => {
    const { h, owner, session, display, fetch, interpret, advance } = await setup();
    const path = `/api/sessions/${session.id}/monitoring`;
    const job = success(await owner.request<MonitoringSummary>('POST', path, { requestId: randomUUID(), displayId: display.id, expectedRevision: 0, config: jsonConfig }));
    expect((await owner.detail(session.id)).displays[0].monitoring?.status).toBe('starting');
    await h.runtime.service.monitoring.runDue();
    let current = (await owner.detail(session.id)).displays[0];
    expect(current).toMatchObject({ revision: 1, view: { data: { text: 'Exact source result' } }, monitoring: { status: 'healthy' } });
    expect((await h.runtime.store.list('update', session.id))).toHaveLength(0);
    fetch.mockRejectedValueOnce(new Error('Synthetic unavailable source')); advance(31_000);
    await h.runtime.service.monitoring.runDue();
    current = (await owner.detail(session.id)).displays[0];
    expect(current).toMatchObject({ revision: 1, view: { data: { text: 'Exact source result' } }, monitoring: { status: 'stale' } });
    const latest = success(await owner.request<MonitoringSummary>('GET', `${path}/${job.id}`));
    success(await owner.request('POST', `${path}/${job.id}/stop`, { requestId: randomUUID(), expectedVersion: latest.version }));
    advance(60_000); await h.runtime.service.monitoring.runDue();
    expect(fetch).toHaveBeenCalledTimes(2); expect(interpret).not.toHaveBeenCalled();
    expect((await owner.detail(session.id)).displays[0].monitoring?.status).toBe('stopped');
  });

  it('never allows a late source result to replace a newer user publication', async () => {
    let release!: (result: MonitoringFetchResult) => void;
    const { h, owner, session, display, fetch } = await setup(() => new Promise(resolve => { release = resolve; }));
    const path = `/api/sessions/${session.id}/monitoring`;
    const job = success(await owner.request<MonitoringSummary>('POST', path, { requestId: randomUUID(), displayId: display.id, expectedRevision: 0, config: jsonConfig }));
    const poll = h.runtime.service.monitoring.runDue(); await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await owner.submit(session.id, [display.id], fact('New topic from user'));
    release({ statusCode: 200, latencyMs: 10, mimeType: 'application/json', body: Buffer.from('{"text":"Late old source"}'), finalUrl: jsonConfig.url });
    await poll;
    expect((await owner.detail(session.id)).displays[0].view?.data.text).toBe('New topic from user');
    expect(success(await owner.request<MonitoringSummary>('GET', `${path}/${job.id}`))).toMatchObject({ status: 'stopped', health: { stoppedReason: 'superseded' } });
  });

  it('a newly started monitor supersedes earlier pending rendering without clearing the visible view', async () => {
    const interpreter = new ControlledInterpreter();
    let release!: (result: MonitoringFetchResult) => void;
    const fetch = vi.fn(() => new Promise<MonitoringFetchResult>(resolve => { release = resolve; }));
    const h = await startHarness({ interpreter, monitoringOptions: { automatic: false, fetcher: fetch } }); running.push(h);
    const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
    const initial = await owner.submit(session.id, [display.id], fact('Existing visible content'));
    const revision = initial.detail.displays[0].revision, path = `/api/sessions/${session.id}/monitoring`;
    success(await owner.request('POST', `/api/sessions/${session.id}/submit`, {
      requestId: 'older-preparation', displayIds: [display.id], context: 'An earlier request', intent: 'Show the earlier result',
    }));
    await interpreter.waitFor(1);
    const job = success(await owner.request<MonitoringSummary>('POST', path, {
      requestId: 'newer-source', displayId: display.id, expectedRevision: revision, config: jsonConfig,
    }));
    expect((await owner.detail(session.id)).displays[0]).toMatchObject({ revision, view: fact('Existing visible content'), monitoring: { status: 'starting' } });
    const poll = h.runtime.service.monitoring.runDue();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    interpreter.calls[0].resolve({ action: 'replace', view: fact('Older preparation must not win') });
    const older = await owner.settle(session.id, 'older-preparation');
    expect(older.update.status).toBe('superseded');
    expect(older.detail.displays[0]).toMatchObject({ revision, view: fact('Existing visible content') });
    expect(success(await owner.request<MonitoringSummary>('GET', `${path}/${job.id}`)).status).toBe('active');
    release({ statusCode: 200, latencyMs: 10, mimeType: 'application/json', body: Buffer.from('{"text":"New explicitly selected source"}'), finalUrl: jsonConfig.url });
    await poll;
    expect((await owner.detail(session.id)).displays[0]).toMatchObject({ revision: revision + 1, view: fact('New explicitly selected source'), monitoring: { status: 'healthy' } });
  });

  it('a start rejected by server URL validation does not supersede earlier pending rendering', async () => {
    const interpreter = new ControlledInterpreter(), fetch = vi.fn<MonitoringFetcher>();
    const h = await startHarness({ interpreter, monitoringOptions: { automatic: false, fetcher: fetch } }); running.push(h);
    const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
    const initial = await owner.submit(session.id, [display.id], fact('Existing visible content'));
    const revision = initial.detail.displays[0].revision;
    success(await owner.request('POST', `/api/sessions/${session.id}/submit`, {
      requestId: 'still-authorized-preparation', displayIds: [display.id], context: 'An earlier request', intent: 'Show the earlier result',
    }));
    await interpreter.waitFor(1);
    // .test passes the shared URL shape but is a special-use destination the
    // server rejects before any fetch or successful monitoring claim.
    denied(await owner.request('POST', `/api/sessions/${session.id}/monitoring`, {
      requestId: 'rejected-source', displayId: display.id, expectedRevision: revision,
      config: { ...jsonConfig, url: 'https://reserved.test/source' },
    }), [400]);
    expect((await owner.detail(session.id)).displays[0]).toMatchObject({ revision, view: fact('Existing visible content') });
    expect((await h.runtime.store.list('monitoring-job', session.id))).toEqual([]); expect(fetch).not.toHaveBeenCalled();
    interpreter.calls[0].resolve({ action: 'replace', view: fact('Earlier authorized result') });
    const completed = await owner.settle(session.id, 'still-authorized-preparation');
    expect(completed.update.status).toBe('prepared');
    expect(completed.detail.displays[0]).toMatchObject({ revision: revision + 1, view: fact('Earlier authorized result') });
  });

  it('rechecks memberships and rejects view-only writes and unrelated-session reads', async () => {
    const { h, owner, session, display, fetch } = await setup();
    const viewer = await h.account(), stranger = await h.account();
    success(await owner.request('POST', `/api/sessions/${session.id}/members`, { username: viewer.user!.username, role: 'viewer' }));
    const path = `/api/sessions/${session.id}/monitoring`, body = { requestId: randomUUID(), displayId: display.id, expectedRevision: 0, config: jsonConfig };
    denied(await viewer.request('POST', path, body)); denied(await stranger.request('GET', path));
    success(await owner.request('POST', `/api/sessions/${session.id}/members`, { username: viewer.user!.username, role: 'editor' }));
    success(await viewer.request('POST', path, body));
    success(await owner.request('DELETE', `/api/sessions/${session.id}/members/${viewer.user!.id}`));
    await h.runtime.service.monitoring.runDue();
    expect(fetch).not.toHaveBeenCalled();
    const jobs = success(await owner.request<{jobs:MonitoringSummary[]}>('GET', path)).jobs;
    expect(jobs[0]).toMatchObject({ status: 'stopped', health: { stoppedReason: 'authorization-lost' } });
  });

  it('binds OAuth-created jobs to the durable refresh grant and stops on revocation', async () => {
    const { h, owner, session, display, advance, fetch } = await setup();
    const issued = (await h.runtime.auth.issueToken(owner.user!.id, 'Isolated monitoring test', ['read', 'publish'], [session.id], 'test-monitor-client'));
    const token: Token = { ...issued.token, resource: h.runtime.auth.oauthResource, refreshExpiresAt: Date.now() + 3_600_000, refreshIdleExpiresAt: Date.now() + 3_600_000 };
    (await h.runtime.store.put('oauth-client', { id: token.clientId!, redirectUris: ['https://example.com/callback'] }));
    (await h.runtime.store.put('token', token));
    const accessId = randomUUID();
    (await h.runtime.store.put('oauth-access', { id: accessId, tokenId: token.id, scopes: token.scopes, expiresAt: Date.now() + 60_000 }));
    const principal: AuthPrincipal = { userId: token.userId, agentId: token.agentId, tokenId: token.id, oauthAccessId: accessId };
    const job = await h.runtime.service.execute('kanvas_monitoring_start', { sessionId: session.id, displayId: display.id, requestId: randomUUID(), expectedRevision: 0, config: jsonConfig }, principal) as MonitoringSummary;
    (await h.runtime.store.put('token', { ...token, expiresAt: Date.now() - 1 }));
    (await h.runtime.store.delete('oauth-access', accessId));
    await h.runtime.service.monitoring.runDue();
    expect(fetch).toHaveBeenCalledTimes(1);
    (await h.runtime.auth.revokeToken(owner.user!.id, token.id)); advance(31_000);
    await h.runtime.service.monitoring.runDue();
    expect(fetch).toHaveBeenCalledTimes(1);
    const current = success(await owner.request<MonitoringSummary>('GET', `/api/sessions/${session.id}/monitoring/${job.id}`));
    expect(current.health.stoppedReason).toBe('authorization-lost');
    expect(current).not.toHaveProperty('owner.tokenId');
  });

  it('retains a prior successful image asset while history references it', async () => {
    const { h, owner, session, display, advance } = await setup(async () => ({ statusCode: 200, latencyMs: 3, mimeType: 'image/png', body: Buffer.from(PNG, 'base64'), finalUrl: 'https://example.com/source.png' }));
    const path = `/api/sessions/${session.id}/monitoring`;
    success(await owner.request('POST', path, { requestId: randomUUID(), displayId: display.id, expectedRevision: 0, config: { mode: 'image', url: 'https://example.com/source.png', intervalSeconds: 30, durationSeconds: 3600 } }));
    await h.runtime.service.monitoring.runDue();
    const first = (await owner.detail(session.id)).assets[0]; expect(first).toBeDefined();
    advance(31_000); await h.runtime.service.monitoring.runDue();
    expect((await owner.raw(first.url)).status).toBe(200);
    expect((await h.runtime.service.history.list((await h.runtime.service.display({ userId: owner.user!.id }, session.id, display.id)))).entries).toHaveLength(3);
  });

  it('rechecks revised source configuration without portraying old content as fresh', async () => {
    const { h, owner, session, display } = await setup();
    const path = `/api/sessions/${session.id}/monitoring`;
    const job = success(await owner.request<MonitoringSummary>('POST', path, { requestId: randomUUID(), displayId: display.id, expectedRevision: 0, config: jsonConfig }));
    await h.runtime.service.monitoring.runDue();
    const latest = success(await owner.request<MonitoringSummary>('GET', `${path}/${job.id}`));
    success(await owner.request('PATCH', `${path}/${job.id}`, { requestId: randomUUID(), expectedVersion: latest.version, config: { ...jsonConfig, url: 'https://example.com/second-source' } }));
    const current = (await owner.detail(session.id)).displays[0];
    expect(current.view?.data.text).toBe('Exact source result');
    expect(current.monitoring?.status).toBe('starting'); expect(current.monitoring?.lastSuccessAt).toBeUndefined();
  });
});
