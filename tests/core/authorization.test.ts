import { asyncMap } from '../../src/server/async-collections.js';
import { randomUUID } from 'node:crypto';
import { afterEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { vi } from 'vitest';
import { ControlledInterpreter } from './harness.js';
import { denied } from './harness.js';
import { fact } from './harness.js';
import { PNG } from './harness.js';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import type { Harness } from './harness.js';
import type { MonitoringFetchResult } from '../../src/server/monitoring.js';
import type { MonitoringFetcher } from '../../src/server/monitoring.js';
import type { MonitoringSummary } from '../../src/shared/monitoring.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import type { Token } from '../../src/server/auth.js';
import type { UpdateRecord } from '../../src/shared/types.js';

describe("authorization coverage 1", () => {


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

describe("authorization contracts", () => {

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
  });});
});
