import { testDatabase } from '../postgres.js';
import type { Request } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Auth, type AuthPrincipal, type Token } from '../../src/server/auth.js';
import { KanvasService } from '../../src/server/domain.js';
import { Store } from '../../src/server/store.js';
import { MONITORING_DOCUMENT, type MonitoringJob } from '../../src/server/monitoring.js';
import type { MonitoringSummary } from '../../src/shared/monitoring.js';
import type { DisplayRecord, InteractionRecord, UpdateRecord, ViewSpec } from '../../src/shared/types.js';
import type { ViewerPresence } from '../../src/shared/viewer-experience.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.useRealTimers(); });

const exactView: ViewSpec = { version: 1, template: 'fact', title: 'Retained title', data: { text: 'Exact kanvas_submit source: 123.4500' } };
async function setup() {
  const store = new Store(testDatabase());
  // These identities are local fixtures, not a hosted database or login.
  (await store.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('test-owner', 'owner', 'Owner', 'unusable-test-hash'));
  const auth = new Auth(store, false, false, 'http://127.0.0.1/mcp');
  const principal: AuthPrincipal = { userId: 'test-owner', agentId: 'test-agent' };
  let time = Date.now();
  const fetcher = vi.fn(async () => ({ statusCode: 200, latencyMs: 1, mimeType: 'application/json', body: Buffer.from('{}'), finalUrl: 'https://example.com/status' }));
  const interpret = vi.fn(async () => { throw new Error('Inspection must not invoke source preparation.'); });
  const service = new KanvasService(store, auth, { interpret }, 'http://127.0.0.1', { automatic: false, now: () => time, fetcher });
  cleanup.push(async () => { await service.close(); (await store.close()); });
  const session = (await service.createSession(principal, 'Read-only regression'));
  const registered = (await service.createDisplay(principal, session.id, { name: 'Registered', width: 800, height: 600 }));
  // Emulate a retained display predating aliases/history without deleting any
  // existing records. Reads must not require a backfill or fabricate a short URL.
  const inherited = { ...(await service.display(principal, session.id, registered.id)), id: 'inherited-display', name: 'Existing retained screen', revision: 3, generation: 3, view: structuredClone(exactView) };
  (await store.put('display', inherited));
  (await store.put<UpdateRecord>('update', { id: 'known-update', sessionId: session.id, requestId: 'known-request', status: 'prepared', displayIds: [inherited.id], revisions: { [inherited.id]: 3 }, createdAt: new Date(time).toISOString() }));
  (await store.put<InteractionRecord>('interaction', { id: 'pending-interaction', sessionId: session.id, displayId: inherited.id, revision: 3, actionId: 'source.action', value: 'Exact viewer kanvas_submit input', userId: principal.userId, targetAgentId: principal.agentId, status: 'pending', createdAt: new Date(time).toISOString() }));
  const viewer: ViewerPresence = { id: 'active-viewer', sessionId: session.id, displayId: inherited.id, participantId: principal.userId, tabId: 'active-tab', revision: 3, renderedRevision: 3, status: 'ready', visible: true, text: 'Actual observed source', elements: [], width: 800, height: 600, context: null, observedAt: new Date(time).toISOString(), expiresAt: time + 120_000 };
  (await store.put('viewer', viewer));
  (await store.put('viewer', { ...viewer, id: 'expired-viewer', tabId: 'expired-tab', expiresAt: time - 1, text: 'Expired observation', context: { consent: true, locationStatus: 'granted', location: { latitude: 58, longitude: 8, accuracy: 5 } } }));
  return {
    store, auth, service, principal, session, registered, inherited, fetcher, interpret,
    advance(milliseconds: number) { time += milliseconds; },
    async startMonitor(owner: AuthPrincipal = principal) {
      return (await service.monitoring.start(owner, { sessionId: session.id, displayId: registered.id, requestId: 'start-monitor', expectedRevision: registered.revision, config: { mode: 'uptime', url: 'https://example.com/status', intervalSeconds: 30, durationSeconds: 60 } }));
    },
  };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
async function snapshot(store: Store) {
  return {
    changes: store.mutationCount,
    documents: (await store.db.prepare('SELECT kind,id,session_id,value FROM documents ORDER BY kind,id').all()),
    requests: (await store.db.prepare('SELECT * FROM requests ORDER BY session_id,principal,request_id').all()),
    members: (await store.db.prepare('SELECT * FROM members ORDER BY session_id,user_id').all()),
    assets: (await store.db.prepare("SELECT id,encode(bytes,'hex') AS bytes FROM assets ORDER BY id").all()),
  };
}
const scoped = (f: Fixture) => ({ sessionId: f.session.id });
const display = (f: Fixture) => ({ ...scoped(f), displayId: f.inherited.id });
const inspectCases: Array<[string, (f: Fixture) => Record<string, unknown>]> = [
  ['kanvas_guide', () => ({})],
  ['kanvas_template_get', () => ({ template: 'fact' })],
  ['kanvas_reports_read', scoped],
  ['kanvas_sessions_list', () => ({})],
  ['kanvas_session_state', scoped],
  ['kanvas_display_history', display],
  ['kanvas_video_status', display],
  ['kanvas_update_status', f => ({ ...scoped(f), updateId: 'known-update' })],
  ['kanvas_presentations_list', scoped],
  ['kanvas_interactions_read', scoped],
  ['kanvas_display_current', display],
  ['kanvas_view_validate', f => ({ ...scoped(f), view: structuredClone(exactView) })],
  ['kanvas_styles_list', () => ({})],
  ['kanvas_preferences_get', () => ({})],
  ['kanvas_pairings_read', scoped],
  ['kanvas_viewers_read', scoped],
  ['kanvas_display_inspect', f => ({ ...display(f), fresh: false })],
  ['kanvas_session_overview', scoped],
  ['kanvas_session_log', scoped],
  ['kanvas_monitoring_read', scoped],
];

describe('canonical operations behind read-only inspect', () => {
  it.each(inspectCases)('%s leaves persistent domain state unchanged', async (name, args) => {
    const f = (await setup());
    (await f.startMonitor()); f.advance(60_000);
    const before = (await snapshot(f.store));
    const result = await f.service.execute(name, args(f), f.principal);
    expect(result).not.toBeUndefined();
    expect((await snapshot(f.store))).toEqual(before);
    expect(f.fetcher).not.toHaveBeenCalled(); expect(f.interpret).not.toHaveBeenCalled();
  });

  it.each(inspectCases)('%s failures do not persist diagnostic or lifecycle records', async (name, args) => {
    const f = (await setup()), before = (await snapshot(f.store));
    expect((await f.service.recordFailure(name, { ...args(f), sessionId: f.session.id }, f.principal, new Error('Private failure details')))).toBeUndefined();
    expect((await snapshot(f.store))).toEqual(before);
  });

  it('retains registered locators and reserves missing ones only on explicit address retrieval', async () => {
    const f = (await setup()), registeredAlias = f.registered.shortUrl;
    expect(registeredAlias).toMatch(/^http:\/\/127\.0\.0\.1\/s\//);
    const before = (await snapshot(f.store));
    const current = await f.service.execute('kanvas_display_current', display(f), f.principal) as DisplayRecord;
    expect(current.viewerUrl).toBe(`http://127.0.0.1/view/${f.session.id}/${f.inherited.id}`);
    expect(current.shortUrl).toBeUndefined(); expect(current.view).toEqual(exactView);
    const resource = await f.service.readResource(`kanvas://sessions/${f.session.id}/state`, f.principal) as { displays: DisplayRecord[] };
    expect(resource.displays.find(item => item.id === f.registered.id)?.shortUrl).toBe(registeredAlias);
    expect((await snapshot(f.store))).toEqual(before);
    const grant = (await f.auth.issueToken(f.principal.userId, 'Read this session', ['read'], [f.session.id]));
    const readOnly = { userId: f.principal.userId, tokenId: grant.token.id };
    const address = await f.service.execute('kanvas_address_get', display(f), readOnly) as { url: string; viewerUrl: string };
    expect(address.viewerUrl).toBe(current.viewerUrl);
    expect((await f.service.publicDisplay((await f.service.display(f.principal, f.session.id, f.inherited.id)))).shortUrl).toBe(address.url);
    const reserved = (await snapshot(f.store));
    expect(await f.service.execute('kanvas_address_get', display(f), readOnly)).toEqual(address);
    expect((await snapshot(f.store))).toEqual(reserved);
    expect((await f.store.list('alias', f.session.id))).toHaveLength(2);
    expect((await f.store.list('share'))).toEqual([]); expect((await f.store.list('pairing'))).toEqual([]);
    expect(reserved.members).toEqual(before.members);
    expect((await f.service.display(f.principal, f.session.id, f.inherited.id))).toMatchObject({ revision: 3, view: exactView });
  });

  it('keeps implicit history navigable and persists the original revision only during a mutation', async () => {
    const f = (await setup()), before = (await snapshot(f.store));
    const history = (await f.service.displayHistory(f.principal, f.session.id, f.inherited.id));
    expect(history).toMatchObject({ cursor: 0, canGoBack: false, canGoForward: false, entries: [{ revision: 3, reason: 'initial', title: exactView.title }] });
    expect((await f.service.experience.overview(f.principal, f.session.id)).cards).toMatchObject([{ revision: 3, preview: exactView.data.text }]);
    expect((await snapshot(f.store))).toEqual(before);
    const request = { sessionId: f.session.id, displayIds: [f.inherited.id], requestId: 'initial-position', expectedRevisions: { [f.inherited.id]: 3 }, revision: 3 };
    (await f.service.navigate(f.principal, request));
    expect((await f.service.displayHistory(f.principal, f.session.id, f.inherited.id)).entries).toMatchObject([{ revision: 3, reason: 'initial' }]);
    expect((await f.store.list('display-history'))).toHaveLength(1);
    const afterNavigate = (await snapshot(f.store));
    (await f.service.navigate(f.principal, request));
    expect((await snapshot(f.store))).toEqual(afterNavigate);
    (await f.service.clear(f.principal, f.session.id, [f.inherited.id], 'clear-after-navigation'));
    (await f.service.navigate(f.principal, { sessionId: f.session.id, displayIds: [f.inherited.id], requestId: 'restore-original', expectedRevisions: { [f.inherited.id]: 5 }, direction: 'back' }));
    expect((await f.service.display(f.principal, f.session.id, f.inherited.id)).view).toEqual(exactView);
  });

  it('does not materialize any history when a later navigation target is invalid', async () => {
    const f = (await setup()), before = (await snapshot(f.store));
    (await expect((async () => (await f.service.navigate(f.principal, { sessionId: f.session.id, displayIds: [f.inherited.id, f.registered.id], requestId: 'invalid-second-target', expectedRevisions: { [f.inherited.id]: 3, [f.registered.id]: 0 }, revision: 3 })))()).rejects.toThrow(/history position/));
    expect((await snapshot(f.store))).toEqual(before);
  });

  it('hides expired observations without deleting records, and keeps cleanup on telemetry writes', async () => {
    const f = (await setup()), before = (await snapshot(f.store));
    const result = await f.service.execute('kanvas_display_inspect', { ...display(f), fresh: false }, f.principal) as { observations: ViewerPresence[] };
    expect(result.observations.map(item => item.id)).toEqual(['active-viewer']);
    expect(result.observations[0].text).toBe('Actual observed source');
    expect(JSON.stringify(result)).not.toContain('latitude');
    expect((await snapshot(f.store))).toEqual(before);
    const browser = { id: 'fixture-browser', userId: f.principal.userId, csrf: 'unused-test-value', expiresAt: Date.now() + 60_000 };
    (await f.store.put('browser', browser));
    (await f.service.experience.observe({ ...f.principal, browserId: browser.id }, f.session.id, f.inherited.id, { tabId: 'new-tab', revision: 3, renderedRevision: 3, status: 'ready', visible: true, text: 'New actual observation', width: 800, height: 600 }));
    expect((await f.store.get('viewer', 'expired-viewer'))).toBeUndefined();
    expect((await f.service.experience.viewers(f.principal, f.session.id))).toHaveLength(2);
  });

  it('reauthorizes after fresh observation waits without creating a diagnostic or capture', async () => {
    const f = (await setup()), grant = (await f.auth.issueToken(f.principal.userId, 'Revocable read', ['read'], [f.session.id]));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pending = f.service.execute('kanvas_display_inspect', display(f), { userId: f.principal.userId, tokenId: grant.token.id });
    const rejected = expect(pending).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    (await f.auth.revokeToken(f.principal.userId, grant.token.id));
    const revoked = (await snapshot(f.store));
    await vi.advanceTimersByTimeAsync(6500); await rejected;
    expect((await snapshot(f.store))).toEqual(revoked);
  });

  it('separates authentication last-use metadata from the subsequent pure read', async () => {
    const f = (await setup()), grant = (await f.auth.issueToken(f.principal.userId, 'Read-only client', ['read'], [f.session.id]));
    const before = (await snapshot(f.store));
    const request = { get: (name: string) => name === 'authorization' ? `Bearer ${grant.value}` : undefined } as Request;
    const principal = await f.service.authorize(request);
    const authenticated = (await snapshot(f.store));
    expect((await f.store.get<Token>('token', grant.token.id))?.lastUsedAt).toBeDefined();
    expect(authenticated.documents.filter(row => row.kind !== 'token')).toEqual(before.documents.filter(row => row.kind !== 'token'));
    expect(authenticated.changes).not.toBe(before.changes);
    await f.service.execute('kanvas_session_state', scoped(f), principal);
    expect((await snapshot(f.store))).toEqual(authenticated);
  });
});

describe('read-time monitoring eligibility', () => {
  it.each(['expired', 'authorization-lost', 'superseded'] as const)('reports %s honestly without changing persisted version, health or scheduling', async reason => {
    const f = (await setup());
    const grant = (await f.auth.issueToken(f.principal.userId, 'Monitoring grant', ['read', 'publish'], [f.session.id]));
    const job = (await f.startMonitor({ userId: f.principal.userId, tokenId: grant.token.id, agentId: grant.token.agentId }));
    if (reason === 'expired') f.advance(60_000);
    else if (reason === 'authorization-lost') (await f.auth.revokeToken(f.principal.userId, grant.token.id));
    else {
      const current = (await f.service.display(f.principal, f.session.id, f.registered.id));
      (await f.store.put('display', { ...current, revision: current.revision + 1, generation: current.generation + 1, view: exactView }));
    }
    const before = (await snapshot(f.store));
    const result = (await f.service.monitoring.read(f.principal, { sessionId: f.session.id, jobId: job.id })) as MonitoringSummary;
    expect(result).toMatchObject({ status: 'stopped', version: job.version, updatedAt: job.updatedAt, health: { status: 'stopped', stoppedReason: reason } });
    expect(result.health.nextPollAt).toBeUndefined(); expect(result.health.message).toContain('read-time status');
    expect(result.health.message).toContain('version and updatedAt describe the last saved job record');
    expect(result.health.message).toContain(reason === 'superseded' ? 'newer display content is untouched' : 'last valid content is retained');
    expect((await f.service.monitoring.read(f.principal, scoped(f)))).toEqual({ jobs: [result] });
    expect((await f.store.get<MonitoringJob>(MONITORING_DOCUMENT, job.id))).toMatchObject({ status: 'active', version: job.version, health: { status: 'starting' } });
    expect((await snapshot(f.store))).toEqual(before); expect(f.fetcher).not.toHaveBeenCalled();
    await f.service.monitoring.runDue();
    expect((await f.store.get<MonitoringJob>(MONITORING_DOCUMENT, job.id))).toMatchObject({ status: 'stopped', version: job.version + 1, health: { stoppedReason: reason } });
    const persisted = (await f.service.monitoring.read(f.principal, { sessionId: f.session.id, jobId: job.id })) as MonitoringSummary;
    expect(persisted.version).toBe(job.version + 1); expect(persisted.health.message).not.toContain('read-time status');
    expect(f.fetcher).not.toHaveBeenCalled();
  });
});
