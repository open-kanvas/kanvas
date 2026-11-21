import { testDatabase } from '../postgres.js';
import { asyncForEach } from '../../src/server/async-collections.js';
import { EventEmitter } from 'node:events';
import type { RequestOptions } from 'node:https';
import type { request as httpsRequest } from 'node:https';
import { afterEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { vi } from 'vitest';
import { AppError } from '../../src/server/store.js';
import { id } from '../../src/server/store.js';
import { Store } from '../../src/server/store.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { validateMedia } from '../../src/server/rendering/media.js';
import type { ViewSpec } from '../../src/shared/types.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import { MONITORING_LIMITS } from '../../src/shared/monitoring.js';
import { assertMonitoringMapping } from '../../src/shared/monitoring.js';
import { isMonitoringUrl } from '../../src/shared/monitoring.js';
import { monitoringConfigSchema } from '../../src/shared/monitoring.js';
import { monitoringStartSchema } from '../../src/shared/monitoring.js';
import type { MonitoringHealth } from '../../src/shared/monitoring.js';
import type { MonitoringSummary } from '../../src/shared/monitoring.js';
import { Monitoring } from '../../src/server/monitoring.js';
import { MONITORING_DOCUMENT } from '../../src/server/monitoring.js';
import { createMonitoringFetcher } from '../../src/server/monitoring.js';
import { isPublicMonitoringAddress } from '../../src/server/monitoring.js';
import { publicMonitoringUrl } from '../../src/server/monitoring.js';
import { parseMonitoringJson } from '../../src/server/monitoring.js';
import { mapMonitoringJson } from '../../src/server/monitoring.js';
import { pinnedMonitoringRequest } from '../../src/server/monitoring.js';
import type { MonitoringFetchResult } from '../../src/server/monitoring.js';
import type { MonitoringFetcher } from '../../src/server/monitoring.js';
import type { MonitoringHooks } from '../../src/server/monitoring.js';
import type { MonitoringJob } from '../../src/server/monitoring.js';
import type { MonitoringLease } from '../../src/server/monitoring.js';
import type { PinnedMonitoringRequest } from '../../src/server/monitoring.js';
import type { PinnedMonitoringResponse } from '../../src/server/monitoring.js';
import { asyncMap } from '../../src/server/async-collections.js';
import { randomUUID } from 'node:crypto';
import { ControlledInterpreter } from './harness.js';
import { denied } from './harness.js';
import { fact } from './harness.js';
import { PNG } from './harness.js';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import type { Harness } from './harness.js';
import type { Token } from '../../src/server/auth.js';
import type { UpdateRecord } from '../../src/shared/types.js';
import { readFileSync } from 'node:fs';
import { safeError } from '../../src/server/mcp/results.js';
import { samples } from '../../src/shared/template-examples.js';
import { initialNavigation } from '../../src/shared/navigation.js';

describe("monitoring coverage 1", () => {


const URL = 'https://public.example.com/healthz';
const PRINCIPAL: AuthPrincipal = { userId: 'test-owner', agentId: 'test-agent', tokenId: 'stable-grant', oauthAccessId: 'rotating-access-credential' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=', 'base64');
const sample = (body: unknown = { price: '123.4500' }, statusCode = 200): MonitoringFetchResult => ({ statusCode, latencyMs: 31.25, mimeType: 'application/json', body: Buffer.from(JSON.stringify(body)), finalUrl: URL });
const networkSample = (request: PinnedMonitoringRequest, body = '{}', statusCode = 200, headers: Record<string, string> = {}): PinnedMonitoringResponse => ({ statusCode, headers: { 'content-type': 'application/json', ...headers }, body: Buffer.from(body), peerAddress: request.address.address });
const signal = () => new AbortController().signal;
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.useRealTimers(); });

function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
interface TestDisplay extends MonitoringLease { id: string; sessionId: string; view: ViewSpec | null; monitoring?: MonitoringHealth }
async function harness(fetcher: MonitoringFetcher = async () => sample(), automatic = false) {
  const store = new Store(testDatabase()); let time = Date.parse('2026-09-14T12:00:00Z'), sequence = 0;
  const deniedOwners = new Set<string>(), revoked = new Set<string>(), sessions = new Set(['session']);
  const imagesCreated: string[] = [], imagesReleased: string[] = [], validations: ViewSpec[] = [];
  async function display(displayId = 'display'): Promise<Awaited<TestDisplay>> { const result = (await store.get<TestDisplay>('test-display', displayId)); if (!result) throw new AppError('NOT_FOUND', 'Test display unavailable.', 404); return result; }
  async function addDisplay(displayId = 'display', sessionId = 'session') { sessions.add(sessionId); (await store.put('test-display', { id: displayId, sessionId, generation: 0, revision: 0, configRevision: 0, held: false, view: null } satisfies TestDisplay)); }
  (await addDisplay());
  const hooks: MonitoringHooks = {
    async authorize(principal, sessionId, displayId, write) {
      if (principal.userId !== PRINCIPAL.userId || write && principal.scopes?.includes('read') && !principal.scopes.includes('publish')) throw new AppError('FORBIDDEN', 'No access.', 403);
      if (!sessions.has(sessionId) || displayId && (await display(displayId)).sessionId !== sessionId) throw new AppError('NOT_FOUND', 'No session.', 404);
    },
    async inspect(owner, sessionId, displayId) {
      if (deniedOwners.has(owner.userId) || owner.tokenId && revoked.has(owner.tokenId)) throw new AppError('FORBIDDEN', 'Owner access revoked.', 403);
      const current = (await display(displayId)); if (current.sessionId !== sessionId) throw new AppError('NOT_FOUND', 'No session.', 404);
      return { generation: current.generation, revision: current.revision, configRevision: current.configRevision, held: current.held };
    },
    async validate(_owner, sessionId, view) {
      validations.push(structuredClone(view));
      const parsed = validateView(view);
      const inspect = async (value: unknown): Promise<Awaited<void>> => {
        if (typeof value === 'string' && value.startsWith('/api/assets/')) {
          const asset = (await store.get<{ sessionId: string }>('test-asset', value.slice('/api/assets/'.length)));
          if (asset?.sessionId !== sessionId) throw new AppError('NOT_FOUND', 'No source asset.', 404);
        } else if (value && typeof value === 'object') (await asyncForEach(Object.values(value), inspect));
      };
      (await inspect(parsed)); return parsed;
    },
    async publish(job, view, health, claimGeneration = false) {
      const current = (await display(job.displayId)), lease = await hooks.inspect(job.owner, job.sessionId, job.displayId);
      if (current.generation !== job.lease.generation || current.revision !== job.lease.revision || current.configRevision !== job.lease.configRevision || current.held) return null;
      if (claimGeneration) current.generation++;
      if (view) { current.view = view; current.generation++; current.revision++; }
      current.monitoring = structuredClone(health); (await store.put('test-display', current));
      return { ...lease, generation: current.generation, revision: current.revision };
    },
    async storeImage(job, image) {
      const media = validateMedia({ name: 'snapshot.png', mimeType: image.mimeType, base64: image.bytes.toString('base64') });
      const assetId = id(); imagesCreated.push(assetId);
      (await store.put('test-asset', { id: assetId, sessionId: job.sessionId, ownerJobId: job.id, mimeType: media.mimeType, size: media.size }));
      (await store.db.prepare('INSERT INTO assets VALUES(?,?)').run(assetId, media.bytes));
      return { id: assetId, url: `/api/assets/${assetId}` };
    },
    async releaseImage(job, assetId) {
      const asset = (await store.get<{ ownerJobId: string }>('test-asset', assetId));
      if (asset?.ownerJobId !== job.id || JSON.stringify((await display(job.displayId)).view).includes(assetId)) return;
      imagesReleased.push(assetId); (await store.delete('test-asset', assetId)); (await store.db.prepare('DELETE FROM assets WHERE id=?').run(assetId));
    },
  };
  const options = { fetcher, automatic, now: () => time };
  let engine = new Monitoring(store, hooks, options);
  cleanup.push(async () => { await engine.close(); (await store.close()); });
  return {
    store, hooks, display, addDisplay, deniedOwners, revoked, imagesCreated, imagesReleased, validations,
    get engine() { return engine; }, get time() { return time; }, advance(milliseconds: number) { time += milliseconds; },
    async start(config: unknown = { mode: 'uptime', url: URL }, displayId = 'display') { return (await engine.start(PRINCIPAL, { sessionId: 'session', displayId, expectedRevision: (await display(displayId)).revision, requestId: `request-${++sequence}`, config })); },
    async read(jobId: string) { return (await engine.read(PRINCIPAL, { sessionId: 'session', jobId })) as MonitoringSummary; },
    async restart() { await engine.close(); engine = new Monitoring(store, hooks, options); (await engine.resume()); },
    async changeView(text = 'Newer user content') { const current = (await display()); current.view = { version: 1, template: 'fact', data: { text } }; current.generation++; current.revision++; (await store.put('test-display', current)); },
  };
}

describe('monitoring source configuration and lossless mapping', () => {
  it('has modest defaults, a finite lifetime, and no arbitrary HTTP knobs', () => {
    expect(monitoringConfigSchema.parse({ mode: 'uptime', url: URL })).toMatchObject({ intervalSeconds: 60, durationSeconds: 86400, template: 'fact' });
    for (const config of [
      { intervalSeconds: 1 }, { durationSeconds: 8 * 86400 }, { headers: { authorization: 'unsupported' } }, { method: 'POST' }, { script: 'fetch()' },
    ]) expect(monitoringConfigSchema.safeParse({ mode: 'uptime', url: URL, ...config }).success).toBe(false);
    expect(monitoringStartSchema.safeParse({ sessionId: 'session', displayId: 'display', requestId: 'r', expectedRevision: 0, config: { mode: 'json', url: URL, template: 'number' } }).success).toBe(false);
  });

  it.each([
    'http://public.example.com/data', 'https://user:pass@public.example.com/data', 'https://public.example.com:444/data',
    'https://public.example.com/data#fragment', 'https://public.example.com/data?api_key=unsupported',
    'https://public.example.com/data?access%5Ftoken=unsupported', 'https://public.example.com/data?X-Amz-Signature=unsupported',
    'https://localhost/healthz', 'https://127.0.0.1/healthz',
  ])('rejects unsupported/authenticated endpoint configuration: %s', url => expect(isMonitoringUrl(url)).toBe(false));

  it('preserves exact selected strings, numbers, booleans, nulls, rows, and pointer escapes', () => {
    const source = parseMonitoringJson('{"price":"00123.4500","change":-1.25,"arrivals":[{"line":"A","wait":0,"active":false,"platform":null},{"line":"B","wait":12,"active":true,"platform":"03"}],"a/b":{"x~y":"exact"}}');
    expect(mapMonitoringJson({ value: { $path: '/price' }, comparison: { $path: '/a~1b/x~0y' } }, source)).toEqual({ value: '00123.4500', comparison: 'exact' });
    const mapped = mapMonitoringJson({ columns: ['Route', 'Wait', 'Active', 'Platform', 'Price'], rows: { $each: '/arrivals', map: { Route: { $path: '/line' }, Wait: { $path: '/wait' }, Active: { $path: '/active' }, Platform: { $path: '/platform' }, Price: { $path: '/price', root: true } } } }, source);
    expect(mapped.rows).toEqual([{ Route: 'A', Wait: 0, Active: false, Platform: null, Price: '00123.4500' }, { Route: 'B', Wait: 12, Active: true, Platform: '03', Price: '00123.4500' }]);
    expect(validateView({ version: 1, template: 'table', data: mapped }).template).toBe('table');
    expect(mapMonitoringJson({ center: { lat: { $path: '/lat' }, lng: { $path: '/lon' } } }, { lat: 58.46, lon: 8.77 })).toEqual({ center: { lat: 58.46, lng: 8.77 } });
  });

  it('supports literal dollar-prefixed source content and root-copy mappings without evaluation', () => {
    expect(mapMonitoringJson({ $literal: { text: 'literal $path /status', items: ['=SUM(A1)', '<script>opaque text</script>'] } }, {})).toEqual({ text: 'literal $path /status', items: ['=SUM(A1)', '<script>opaque text</script>'] });
    const root = { value: 0.125, label: 'An exact selected fraction' };
    const mapped = mapMonitoringJson({ $path: '' }, root); expect(mapped).toEqual(root); expect(mapped).not.toBe(root);
  });

  it.each(['9007199254740993', '9007199254740992', '1.234567890123456789', '1e999', '1e-999', '-0', '-0.0'])('rejects a lossy numeric token: %s', token => {
    expect(() => parseMonitoringJson(`{"value":${token}}`)).toThrow(/rounding/);
  });

  it('accepts equivalent number spellings without changing values', () => {
    expect(parseMonitoringJson('[0,1.2500,1e3,0.0000001,9007199254740991]')).toEqual([0, 1.25, 1000, 0.0000001, 9007199254740991]);
  });

  it.each(['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"__proto__":{}}', '{"nested":{"constructor":1}}', '[1,]', '{"a":truefalse}', '{"a":1} trailing', '"bad\nstring"'])('rejects ambiguous or invalid JSON: %s', input => {
    expect(() => parseMonitoringJson(input)).toThrow(/unambiguous JSON/);
  });

  it('bounds bytes, depth, array length, key counts, UTF-8, and mapping expansion', () => {
    expect(() => parseMonitoringJson('"' + 'a'.repeat(MONITORING_LIMITS.jsonBytes) + '"')).toThrow(/size limit/);
    expect(() => parseMonitoringJson('['.repeat(22) + '0' + ']'.repeat(22))).toThrow(/unambiguous/);
    expect(() => parseMonitoringJson(JSON.stringify(Array(1001).fill(0)))).toThrow(/unambiguous/);
    expect(() => parseMonitoringJson(JSON.stringify(Object.fromEntries(Array.from({ length: 129 }, (_, index) => [String(index), 0]))))).toThrow(/unambiguous/);
    expect(() => parseMonitoringJson(Buffer.from([0xc3, 0x28]))).toThrow(/unambiguous/);
    const body = { huge: 'x'.repeat(100_000) };
    expect(() => mapMonitoringJson({ copies: Array.from({ length: 8 }, () => ({ $path: '/huge' })) }, body)).toThrow(/size limit/);
  });

  it('rejects missing paths, unsupported operators, prototype access, and non-arrays without dropping rows', () => {
    for (const mapping of [{ text: { $path: '/missing' } }, { text: { $path: '/rows/01' } }, { rows: { $each: '/text', map: { $path: '' } } }]) expect(() => mapMonitoringJson(mapping, { text: 'literal', rows: [1, 2] })).toThrow(/No values were guessed/);
    for (const mapping of [{ $eval: '1+1' }, { $path: '/constructor' }, { $path: '/a', transform: 'number' }, JSON.parse('{"__proto__":1}'), { x: () => 1 }]) expect(() => assertMonitoringMapping(mapping)).toThrow();
  });
});

describe('public HTTPS transport', () => {
  it.each([
    '0.0.0.0', '10.1.2.3', '127.0.0.1', '169.254.169.254', '172.16.1.1', '192.168.1.1', '100.100.100.200',
    '192.0.0.8', '192.0.2.5', '192.88.99.1', '198.19.1.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255',
    '::', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fd00::1', 'fe80::1', 'ff02::1', '64:ff9b::7f00:1',
    '2001::1', '2001:db8::1', '2002:7f00:1::1', '3fff::1', '3ffe::1',
  ])('blocks non-global/transition destination %s', address => expect(isPublicMonitoringAddress(address)).toBe(false));

  it('allows global IPs and rejects numeric alternate localhost spellings and special-use names', () => {
    for (const address of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111', '2001:4860:4860::8888']) expect(isPublicMonitoringAddress(address)).toBe(true);
    for (const url of ['https://2130706433/', 'https://0x7f000001/', 'https://127.1/', 'https://metadata.internal/', 'https://router.home.arpa/', 'https://service.local./', 'https://[::ffff:7f00:1]/']) expect(() => publicMonitoringUrl(url)).toThrow();
  });

  it('rejects a hostname resolving to private or mixed addresses before creating a request', async () => {
    const send = vi.fn();
    for (const addresses of [[{ address: '169.254.169.254', family: 4 as const }], [{ address: '1.1.1.1', family: 4 as const }, { address: '127.0.0.1', family: 4 as const }]]) {
      const fetcher = createMonitoringFetcher({ resolve: async () => addresses, send });
      await expect(fetcher(URL, { mode: 'json', signal: signal() })).rejects.toMatchObject({ code: 'MONITORING_BLOCKED_URL' });
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('pins the validated address instead of resolving again, and rejects a rebound socket peer', async () => {
    const resolve = vi.fn().mockResolvedValueOnce([{ address: '1.1.1.1', family: 4 }]).mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    const send = vi.fn(async (request: PinnedMonitoringRequest) => networkSample(request));
    await createMonitoringFetcher({ resolve, send })(URL, { mode: 'json', signal: signal() });
    expect(resolve).toHaveBeenCalledTimes(1); expect(send.mock.calls[0][0].address).toEqual({ address: '1.1.1.1', family: 4 });
    const fetcher = createMonitoringFetcher({ resolve: async () => [{ address: '1.1.1.1', family: 4 }], send: async request => ({ ...networkSample(request), peerAddress: '127.0.0.1' }) });
    await expect(fetcher(URL, { mode: 'json', signal: signal() })).rejects.toMatchObject({ code: 'MONITORING_BLOCKED_URL' });
  });

  it('uses pinned native lookup, verified TLS, fixed headers, and a fresh socket', async () => {
    let captured!: RequestOptions;
    const fakeRequest = ((options: RequestOptions, callback: (response: EventEmitter) => void) => {
      captured = options;
      const request = new EventEmitter() as EventEmitter & { end(): void; destroy(): void };
      request.destroy = vi.fn();
      request.end = () => queueMicrotask(() => {
        const socket = Object.assign(new EventEmitter(), { remoteAddress: '1.1.1.1' }); request.emit('socket', socket); socket.emit('secureConnect');
        const response = Object.assign(new EventEmitter(), { statusCode: 200, headers: { 'content-type': 'application/json' }, socket, destroy: vi.fn() });
        callback(response); response.emit('data', Buffer.from('{}')); response.emit('end');
      });
      return request;
    }) as unknown as typeof httpsRequest;
    const request: PinnedMonitoringRequest = { url: publicMonitoringUrl(URL), address: { address: '1.1.1.1', family: 4 }, signal: signal(), maxBytes: 100, headersOnly: false, accept: 'application/json' };
    const result = await pinnedMonitoringRequest(request, fakeRequest);
    expect(result.body.toString()).toBe('{}');
    expect(captured).toMatchObject({ hostname: 'public.example.com', servername: 'public.example.com', port: 443, method: 'GET', agent: false, rejectUnauthorized: true, family: 4, maxHeaderSize: 16384 });
    expect(captured.headers).not.toHaveProperty('authorization'); expect(captured.headers).not.toHaveProperty('cookie');
    const answers: unknown[] = [];
    const lookup = captured.lookup as unknown as (host: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => void;
    lookup('public.example.com', { all: true }, (...args) => answers.push(args));
    lookup('public.example.com', {}, (...args) => answers.push(args));
    expect(answers).toEqual([[null, [{ address: '1.1.1.1', family: 4 }]], [null, '1.1.1.1', 4]]);
  });

  it('revalidates every redirect hostname and rejects redirect-to-private rebinding', async () => {
    const resolve = vi.fn(async (host: string) => [{ address: host === 'public.example.com' ? '1.1.1.1' : '10.0.0.1', family: 4 as const }]);
    const send = vi.fn(async (request: PinnedMonitoringRequest) => networkSample(request, '', 302, { location: 'https://second.example.com/data' }));
    await expect(createMonitoringFetcher({ resolve, send })(URL, { mode: 'json', signal: signal() })).rejects.toMatchObject({ code: 'MONITORING_BLOCKED_URL' });
    expect(resolve).toHaveBeenCalledTimes(2); expect(send).toHaveBeenCalledTimes(1);
    const sameHost = vi.fn().mockResolvedValueOnce([{ address: '1.1.1.1', family: 4 }]).mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    await expect(createMonitoringFetcher({ resolve: sameHost, send: async request => networkSample(request, '', 302, { location: '/next' }) })(URL, { mode: 'json', signal: signal() })).rejects.toMatchObject({ code: 'MONITORING_BLOCKED_URL' });
  });

  it.each(['http://public.example.com/data', 'https://u:p@public.example.com/data', 'https://127.0.0.1/data', 'https://public.example.com/data?token=unsupported'])('rejects unsafe redirect %s', async location => {
    const fetcher = createMonitoringFetcher({ resolve: async () => [{ address: '1.1.1.1', family: 4 }], send: async request => networkSample(request, '', 302, { location }) });
    await expect(fetcher(URL, { mode: 'json', signal: signal() })).rejects.toMatchObject({ code: 'MONITORING_BLOCKED_URL' });
  });

  it('bounds redirect loops and chains', async () => {
    const send = vi.fn(async request => networkSample(request, '', 302, { location: '/same' }));
    await expect(createMonitoringFetcher({ resolve: async () => [{ address: '1.1.1.1', family: 4 }], send })(URL, { mode: 'json', signal: signal() })).rejects.toMatchObject({ code: 'MONITORING_REDIRECT' });
    expect(send).toHaveBeenCalledTimes(2);
    let hop = 0;
    const chain = vi.fn(async request => networkSample(request, '', 302, { location: `/next-${++hop}` }));
    await expect(createMonitoringFetcher({ resolve: async () => [{ address: '1.1.1.1', family: 4 }], send: chain })(URL, { mode: 'json', signal: signal() })).rejects.toMatchObject({ code: 'MONITORING_REDIRECT' });
    expect(chain).toHaveBeenCalledTimes(3);
  });

  it('uses one deadline even when DNS hangs, and closes on caller abort', async () => {
    vi.useFakeTimers(); const resolve = vi.fn(() => new Promise<never>(() => {})), send = vi.fn();
    const fetcher = createMonitoringFetcher({ resolve, send });
    const timeout = expect(fetcher(URL, { mode: 'json', signal: signal(), timeoutMs: 25 })).rejects.toMatchObject({ code: 'MONITORING_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(26); await timeout;
    const controller = new AbortController();
    const cancelled = expect(fetcher(URL, { mode: 'json', signal: controller.signal })).rejects.toMatchObject({ code: 'MONITORING_CANCELLED' });
    controller.abort(); await cancelled; expect(send).not.toHaveBeenCalled();
  });

  it('rejects unbounded bodies, compression, wrong MIME, and unsupported encodings', async () => {
    for (const [body, headers, code] of [
      ['x'.repeat(MONITORING_LIMITS.jsonBytes + 1), {}, 'MONITORING_BODY_TOO_LARGE'],
      ['{}', { 'content-encoding': 'gzip' }, 'MONITORING_RESPONSE_TYPE'],
      ['<html></html>', { 'content-type': 'text/html' }, 'MONITORING_RESPONSE_TYPE'],
      ['{}', { 'content-type': 'application/json; charset=iso-8859-1' }, 'MONITORING_RESPONSE_TYPE'],
    ] as const) {
      const fetcher = createMonitoringFetcher({ resolve: async () => [{ address: '1.1.1.1', family: 4 }], send: async request => networkSample(request, body, 200, headers) });
      await expect(fetcher(URL, { mode: 'json', signal: signal() })).rejects.toMatchObject({ code });
    }
  });

  it('captures a retry-after delay without exposing response headers or error bodies', async () => {
    const fetcher = createMonitoringFetcher({ resolve: async () => [{ address: '1.1.1.1', family: 4 }], send: async request => networkSample(request, 'upstream details must not become messages', 429, { 'retry-after': '300', 'set-cookie': 'ignored' }) });
    expect(await fetcher(URL, { mode: 'json', signal: signal() })).toMatchObject({ statusCode: 429, retryAfterMs: 300_000 });
  });
});

describe('persisted monitoring jobs', () => {
  it('fetches only after an explicit start, persists an owned job, and publishes real uptime directly from the supplied probe', async () => {
    const fetcher = vi.fn(async () => sample()); const h = (await harness(fetcher));
    await h.engine.runDue(); expect(fetcher).not.toHaveBeenCalled();
    const started = (await h.start()); expect(fetcher).not.toHaveBeenCalled(); expect(started).toMatchObject({ version: 1, status: 'active', template: 'fact', health: { status: 'starting' } });
    const stored = (await h.store.get<MonitoringJob>(MONITORING_DOCUMENT, started.id))!;
    expect(stored.owner).toEqual({ userId: PRINCIPAL.userId, agentId: PRINCIPAL.agentId, tokenId: PRINCIPAL.tokenId });
    expect(JSON.stringify(started)).not.toContain('stable-grant'); expect(JSON.stringify(stored)).not.toContain('rotating-access-credential');
    await h.engine.runDue();
    expect(fetcher).toHaveBeenCalledTimes(1); expect((await h.display()).view).toMatchObject({ template: 'fact', data: { text: 'Up' } }); expect((await h.display()).view).not.toHaveProperty('source');
    expect((await h.read(started.id))).toMatchObject({ health: { status: 'healthy', targetState: 'up', statusCode: 200, latencyMs: 31.25, lastSuccessAt: '2026-09-14T12:00:00.000Z' } });
    expect(h.validations).toHaveLength(1); expect((await h.store.list('update'))).toHaveLength(0); expect((await h.store.list('work'))).toHaveLength(0);
  });

  it('maps public JSON into existing templates with exact source data', async () => {
    const h = (await harness(async () => sample({ price: '0000123.4500' })));
    const started = (await h.start({ mode: 'json', url: URL, template: 'number', mapping: { value: { $path: '/price' }, label: 'Price' } }));
    await h.engine.runDue();
    expect((await h.display()).view).toMatchObject({ template: 'number', data: { value: '0000123.4500', label: 'Price' } });
    expect((await h.read(started.id)).health.status).toBe('healthy');
  });

  it('treats a measured HTTP failure as current target-down data, not a fetch failure', async () => {
    const h = (await harness(async () => sample(undefined, 503))); const job = (await h.start()); await h.engine.runDue();
    expect((await h.display()).view?.data.text).toBe('Down'); expect((await h.read(job.id)).health).toMatchObject({ status: 'healthy', targetState: 'down', statusCode: 503, consecutiveFailures: 0 });
    expect((await h.read(job.id)).health.lastSuccessAt).toBeDefined();
  });

  it.each(['latency', 'http-status'] as const)('supports actual %s through the existing number template', async metric => {
    const h = (await harness()); (await h.start({ mode: 'uptime', url: URL, template: 'number', metric })); await h.engine.runDue();
    expect((await h.display()).view?.data.value).toBe(metric === 'latency' ? 31.25 : 200);
  });

  it('retains last good content and timestamp with honest stale status, bounded backoff, and recovery', async () => {
    const fetcher = vi.fn<MonitoringFetcher>().mockResolvedValueOnce(sample({ price: '12.30' })).mockRejectedValueOnce(new Error('secret upstream details')).mockResolvedValueOnce(sample({ price: '12.40' }));
    const h = (await harness(fetcher)), job = (await h.start({ mode: 'json', url: URL, template: 'number', mapping: { value: { $path: '/price' } } }));
    await h.engine.runDue(); const lastGood = structuredClone((await h.display()).view), successTime = (await h.read(job.id)).health.lastSuccessAt;
    h.advance(60_000); await h.engine.runDue();
    expect((await h.display()).view).toEqual(lastGood); const stale = (await h.read(job.id)).health;
    expect(stale).toMatchObject({ status: 'stale', consecutiveFailures: 1, lastSuccessAt: successTime });
    expect(stale.nextPollAt).toBe('2026-09-14T12:03:00.000Z'); expect(JSON.stringify(stale)).not.toContain('secret upstream');
    h.advance(119_999); await h.engine.runDue(); expect(fetcher).toHaveBeenCalledTimes(2);
    h.advance(1); await h.engine.runDue(); expect((await h.display()).view?.data.value).toBe('12.40'); expect((await h.read(job.id)).health).toMatchObject({ status: 'healthy', consecutiveFailures: 0 });
  });

  it('retains content on missing source paths, template mismatch, malformed JSON, and inaccessible asset references', async () => {
    const cases: Array<{ config: unknown; response: MonitoringFetchResult; code: string }> = [
      { config: { mode: 'json', url: URL, template: 'number', mapping: { value: { $path: '/missing' } } }, response: sample(), code: 'MONITORING_MAPPING' },
      { config: { mode: 'json', url: URL, template: 'map', mapping: { center: { $path: '/center' } } }, response: sample({ center: { lat: 100, lng: 0 } }), code: 'MONITORING_VALIDATION' },
      { config: { mode: 'json', url: URL, template: 'number', mapping: { value: { $path: '/value' } } }, response: { ...sample(), body: Buffer.from('{invalid') }, code: 'MONITORING_JSON' },
      { config: { mode: 'json', url: URL, template: 'image', mapping: { images: [{ url: { $path: '/url' } }] } }, response: sample({ url: '/api/assets/unowned-asset' }), code: 'MONITORING_VALIDATION' },
    ];
    for (const test of cases) {
      const h = (await harness(async () => test.response)); (await h.changeView('Original source')); const before = (await h.display()).view; const job = (await h.start(test.config)); await h.engine.runDue();
      expect((await h.display()).view).toEqual(before); expect((await h.read(job.id)).health).toMatchObject({ status: 'stale', errorCode: test.code });
    }
  });

  it('does not overlap polls, ignores a late result after stop, and retains the current view', async () => {
    const response = deferred<MonitoringFetchResult>(), fetcher = vi.fn(async () => response.promise);
    const h = (await harness(fetcher)); (await h.changeView('Original')); const job = (await h.start()); const running = h.engine.runDue();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await h.engine.runDue(); expect(fetcher).toHaveBeenCalledTimes(1);
    const stopped = (await h.engine.stop(PRINCIPAL, { sessionId: 'session', jobId: job.id, requestId: 'stop', expectedVersion: 1 }));
    await running; response.resolve(sample()); await Promise.resolve();
    expect(stopped.status).toBe('stopped'); expect((await h.display()).view?.data.text).toBe('Original'); expect(h.validations).toHaveLength(0);
    h.advance(600_000); await h.engine.runDue(); expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('never replaces newer user content with a late poll result', async () => {
    const response = deferred<MonitoringFetchResult>(); const h = (await harness(async () => response.promise)); const job = (await h.start()); const running = h.engine.runDue();
    (await h.changeView()); response.resolve(sample()); await running;
    expect((await h.display()).view?.data.text).toBe('Newer user content'); expect((await h.read(job.id))).toMatchObject({ status: 'stopped', health: { stoppedReason: 'superseded' } });
    expect(h.validations).toHaveLength(0);
  });

  it('invalidates in-flight work on config updates, checks versions, and never accelerates polling', async () => {
    const old = deferred<MonitoringFetchResult>(); const fetcher = vi.fn<MonitoringFetcher>().mockImplementationOnce(async () => old.promise).mockResolvedValue(sample({ price: 'new' }));
    const h = (await harness(fetcher)), job = (await h.start()); const running = h.engine.runDue();
    // The update must race an actually in-flight old fetch, not an unstarted async task.
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const changed = (await h.engine.update(PRINCIPAL, { sessionId: 'session', jobId: job.id, requestId: 'update', expectedVersion: job.version, config: { mode: 'json', url: URL, intervalSeconds: 30, template: 'number', mapping: { value: { $path: '/price' } } } }));
    expect(changed.version).toBe(2); await running; old.resolve(sample()); await Promise.resolve();
    expect((await h.display()).view).toBeNull(); (await expect((async () => (await h.engine.stop(PRINCIPAL, { sessionId: 'session', jobId: job.id, requestId: 'stale-stop', expectedVersion: 1 })))()).rejects.toThrow(/current version/));
    h.advance(29_999); await h.engine.runDue(); expect(fetcher).toHaveBeenCalledTimes(1);
    h.advance(1); await h.engine.runDue(); expect((await h.display()).view?.data.value).toBe('new');
  });

  it('deduplicates control retries and detects changed request IDs without adding tick receipts', async () => {
    const h = (await harness()); const input = { sessionId: 'session', displayId: 'display', requestId: 'same', expectedRevision: 0, config: { mode: 'uptime', url: URL } };
    const first = (await h.engine.start(PRINCIPAL, input)); expect((await h.engine.start(PRINCIPAL, input)).id).toBe(first.id);
    (await expect((async () => (await h.engine.start(PRINCIPAL, { ...input, config: { ...input.config, title: 'different' } })))()).rejects.toThrow(/request ID/));
    for (let i = 0; i < 12; i++) { await h.engine.runDue(); h.advance(60_000); }
    expect((await h.store.list<MonitoringJob>(MONITORING_DOCUMENT))).toHaveLength(1); expect((await h.store.get<MonitoringJob>(MONITORING_DOCUMENT, first.id))?.requests).toHaveLength(1);
    expect((await h.store.list('update'))).toHaveLength(0);
  });

  it('stops on membership or stable-grant revocation before accepting a pending result', async () => {
    for (const revoke of ['member', 'grant'] as const) {
      const pending = deferred<MonitoringFetchResult>(), h = (await harness(async () => pending.promise)), job = (await h.start()), running = h.engine.runDue();
      if (revoke === 'member') h.deniedOwners.add(PRINCIPAL.userId); else h.revoked.add(PRINCIPAL.tokenId!);
      (await h.engine.reconcileSession('session')); await running; pending.resolve(sample()); await Promise.resolve();
      const stored = (await h.store.get<MonitoringJob>(MONITORING_DOCUMENT, job.id))!;
      expect(stored).toMatchObject({ status: 'stopped', health: { stoppedReason: 'authorization-lost' } }); expect((await h.display()).view).toBeNull();
    }
  });

  it('cancels on session end and finite expiry without more network work', async () => {
    const fetcher = vi.fn(async () => sample()), h = (await harness(fetcher)), job = (await h.start({ mode: 'uptime', url: URL, durationSeconds: 60 }));
    h.advance(60_000); await h.engine.runDue(); expect(fetcher).not.toHaveBeenCalled(); expect((await h.read(job.id)).health.stoppedReason).toBe('expired');
    const next = (await h.start()); (await h.engine.cancelSession('session')); await h.engine.runDue(); expect((await h.read(next.id)).health.stoppedReason).toBe('session-ended'); expect(fetcher).not.toHaveBeenCalled();
  });

  it('resumes persisted jobs after shutdown and preserves their existing due time and ownership', async () => {
    const fetcher = vi.fn(async () => sample()), h = (await harness(fetcher)), job = (await h.start()); await h.engine.runDue();
    const revision = (await h.display()).revision; await h.restart(); await h.engine.runDue(); expect(fetcher).toHaveBeenCalledTimes(1);
    h.advance(60_000); await h.engine.runDue(); expect(fetcher).toHaveBeenCalledTimes(2); expect((await h.display()).revision).toBe(revision + 1); expect((await h.read(job.id)).status).toBe('active');
  });

  it('honors a persisted in-flight lease during crash recovery', async () => {
    const fetcher = vi.fn(async () => sample()), h = (await harness(fetcher)), job = (await h.start());
    const stored = (await h.store.get<MonitoringJob>(MONITORING_DOCUMENT, job.id))!; stored.pollToken = 'prior-process'; stored.pollLeaseUntil = new Date(h.time + 16000).toISOString(); (await h.store.put(MONITORING_DOCUMENT, stored));
    await h.restart(); await h.engine.runDue(); expect(fetcher).not.toHaveBeenCalled();
    h.advance(16000); await h.engine.runDue(); expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('closes promptly even when an injected fetcher ignores cancellation', async () => {
    const h = (await harness(async () => new Promise<never>(() => {}))); const job = (await h.start()); const running = h.engine.runDue();
    await h.engine.close(); await running;
    expect((await h.store.get<MonitoringJob>(MONITORING_DOCUMENT, job.id))).toMatchObject({ status: 'active' });
    expect((await h.store.get<MonitoringJob>(MONITORING_DOCUMENT, job.id))?.pollToken).toBeUndefined();
  });

  it('really schedules automatic refreshes after the API call returns and cancels its timer on stop', async () => {
    vi.useFakeTimers(); const fetcher = vi.fn(async () => sample()), h = (await harness(fetcher, true)), job = (await h.start());
    expect(fetcher).not.toHaveBeenCalled(); h.advance(1); await vi.advanceTimersByTimeAsync(1); await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1)); await vi.waitFor(async()=>expect((await h.read(job.id)).health.status).toBe('healthy'));
    h.advance(60_000); await vi.advanceTimersByTimeAsync(60_000); await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2)); await vi.waitFor(async()=>expect((await h.store.get<MonitoringJob>(MONITORING_DOCUMENT,job.id))?.pollToken).toBeUndefined());
    (await h.engine.stop(PRINCIPAL, { sessionId: 'session', jobId: job.id, requestId: 'automatic-stop', expectedVersion: job.version }));
    h.advance(300_000); await vi.advanceTimersByTimeAsync(300_000); expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('bounds a stalled custom fetcher and reports a timeout without losing content', async () => {
    vi.useFakeTimers(); const fetcher=vi.fn(async () => new Promise<never>(() => {})),h = (await harness(fetcher)); (await h.changeView('Last good')); const job = (await h.start());
    const running = h.engine.runDue(); await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1)); h.advance(15_000); await vi.advanceTimersByTimeAsync(15_000); await running;
    expect((await h.read(job.id)).health).toMatchObject({ status: 'stale', errorCode: 'MONITORING_TIMEOUT' }); expect((await h.display()).view?.data.text).toBe('Last good');
  });

  it('never starts more than four concurrent network operations across sessions and origins', async () => {
    const pending: ReturnType<typeof deferred<MonitoringFetchResult>>[] = [];
    const fetcher = vi.fn(async () => { const response = deferred<MonitoringFetchResult>(); pending.push(response); return response.promise; });
    const h = (await harness(fetcher));
    for (let i = 0; i < 5; i++) {
      const displayId = `parallel-${i}`, sessionId = i < 4 ? 'session' : 'second-session'; (await h.addDisplay(displayId, sessionId));
      (await h.engine.start(PRINCIPAL, { sessionId, displayId, requestId: `parallel-${i}`, expectedRevision: 0, config: { mode: 'uptime', url: `https://source-${i}.example.com/status` } }));
    }
    const running = h.engine.runDue(); await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4)); await h.engine.runDue(); expect(fetcher).toHaveBeenCalledTimes(4);
    for (const response of pending) response.resolve(sample()); await running;
    const last = h.engine.runDue(); await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(5)); pending[4].resolve(sample()); await last;
  });

  it('enforces session capacity, per-origin spacing, and single-target ownership', async () => {
    const fetcher = vi.fn(async () => sample()), h = (await harness(fetcher)); (await h.start());
    (await expect((async () => (await h.start()))()).rejects.toThrow(/already has an active/));
    for (let i = 1; i <= 4; i++) { (await h.addDisplay(`display-${i}`)); if (i < 4) (await h.start(undefined, `display-${i}`)); }
    (await expect((async () => (await h.start(undefined, 'display-4')))()).rejects.toThrow(/limit has been reached/));
    await h.engine.runDue(); expect(fetcher).toHaveBeenCalledTimes(1);
    h.advance(4999); await h.engine.runDue(); expect(fetcher).toHaveBeenCalledTimes(1);
    h.advance(1); await h.engine.runDue(); expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('honors rate-limit retry-after while preserving old content', async () => {
    const fetcher = vi.fn(async () => ({ ...sample({}, 429), retryAfterMs: 300_000 })), h = (await harness(fetcher));
    const job = (await h.start({ mode: 'json', url: URL, template: 'number', mapping: { value: { $path: '/price' } } }));
    await h.engine.runDue(); expect((await h.read(job.id)).health).toMatchObject({ status: 'stale', errorCode: 'MONITORING_HTTP', statusCode: 429, nextPollAt: '2026-09-14T12:05:00.000Z' });
    h.advance(299_999); await h.engine.runDue(); expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('protects read/write operations and refuses paired/view-only or cross-session access through the authorization hook', async () => {
    const h = (await harness()), job = (await h.start());
    (await expect((async () => (await h.engine.read({ userId: 'outsider' }, { sessionId: 'session', jobId: job.id })))()).rejects.toThrow(/No access/));
    (await expect((async () => (await h.engine.stop({ userId: PRINCIPAL.userId, scopes: ['read'] }, { sessionId: 'session', jobId: job.id, requestId: 'denied', expectedVersion: 1 })))()).rejects.toThrow(/No access/));
    (await expect((async () => (await h.engine.read(PRINCIPAL, { sessionId: 'other-session', jobId: job.id })))()).rejects.toThrow(/No session/));
  });

  it('refreshes actual raster bytes as protected owned images and releases only previous derivatives', async () => {
    const h = (await harness(async () => ({ ...sample(), body: PNG, mimeType: 'image/png' }))); const job = (await h.start({ mode: 'image', url: URL, alt: 'A live public camera' }));
    await h.engine.runDue(); const first = h.imagesCreated[0];
    expect((await h.display()).view).toMatchObject({ template: 'image', data: { images: [{ url: `/api/assets/${first}`, alt: 'A live public camera' }] } });
    h.advance(60_000); await h.engine.runDue(); expect(h.imagesCreated).toHaveLength(2); expect(h.imagesReleased).toEqual([first]);
    expect((await h.store.list('test-asset'))).toHaveLength(1); expect((await h.read(job.id)).health.status).toBe('healthy');
  });

  it('rejects fake/oversized raster content through the existing validator and rolls back failed image publishes', async () => {
    const h = (await harness(async () => ({ ...sample(), body: Buffer.from('<svg></svg>'), mimeType: 'image/png' }))); (await h.changeView('Last good')); const job = (await h.start({ mode: 'image', url: URL }));
    await h.engine.runDue(); expect((await h.display()).view?.data.text).toBe('Last good'); expect((await h.read(job.id)).health.errorCode).toBe('MONITORING_VALIDATION'); expect((await h.store.list('test-asset'))).toHaveLength(0);
    const other = (await harness(async () => ({ ...sample(), body: PNG, mimeType: 'image/png' })));
    (await other.start({ mode: 'image', url: URL })); const original = other.hooks.publish;
    other.hooks.publish = async (job, view, health) => view ? null : (await original(job, view, health));
    await other.engine.runDue(); expect((await other.store.list('test-asset'))).toHaveLength(0); expect((await other.display()).view).toBeNull();
  });

  it('enforces the smaller snapshot bound even for an injected transport before storing media', async () => {
    const h = (await harness(async () => ({ ...sample(), body: Buffer.alloc(MONITORING_LIMITS.imageBytes + 1), mimeType: 'image/png' }))); const job = (await h.start({ mode: 'image', url: URL }));
    await h.engine.runDue(); expect((await h.read(job.id)).health.errorCode).toBe('MONITORING_BODY_TOO_LARGE'); expect(h.imagesCreated).toHaveLength(0);
  });

  it('does not store image bytes from a stopped or superseded pending job', async () => {
    const pending = deferred<MonitoringFetchResult>(), h = (await harness(async () => pending.promise)); (await h.start({ mode: 'image', url: URL })); const running = h.engine.runDue();
    (await h.changeView()); pending.resolve({ ...sample(), body: PNG, mimeType: 'image/png' }); await running;
    expect(h.imagesCreated).toHaveLength(0); expect((await h.display()).view?.data.text).toBe('Newer user content');
  });
});
});

describe("monitoring coverage 2", () => {


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

describe("monitoring contracts", () => {

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
  });});
});

describe("monitoring coverage 3", () => {

let h!:Harness;const id=()=>randomUUID();afterEach(async()=>{await h?.close();});

it('pushes all six prioritized live views, preserves exact samples, replays lost responses and rejects stale, held, foreign or changed targets',async()=>{
 h=await startHarness();const a=await h.account(),b=await h.account(),s=await a.session(),d=await a.display(s.id),svc=h.runtime.service,p={userId:a.user!.id};
 const views:any[]=[{version:1,template:'number',data:{value:'1.2300',label:'Exact'}}];
 for(const kind of ['gauge','line','area','bar','heatmap'])views.push({version:1,template:'chart',data:kind==='gauge'?{kind,gauge:{min:0,max:100},series:[{name:'Sensor',points:[{x:'Now',y:12}]}]}:{kind,series:[{name:'Sensor',points:[{x:'T1',y:12,...(kind==='heatmap'?{value:12}:{})},{x:'T2',y:18,...(kind==='heatmap'?{value:18}:{})}]}]}});
 for(const view of views){await a.submit(s.id,[d.id],view);const before=(await svc.display(p,s.id,d.id)),data=structuredClone(before.view!.data);if(view.template==='number')data.value='9007199254740993';else(data.series as any)[0].points[0].y=23;
  const input={sessionId:s.id,displayId:d.id,requestId:id(),expectedRevision:before.revision,data};
  const result:any=await svc.execute('kanvas_live_push',input,p);expect((await svc.display(p,s.id,d.id)).view!.data).toEqual(validateView({...view,data}).data);
  expect((await svc.execute('kanvas_live_push',input,p) as any).id).toBe(result.id);
  await expect(svc.execute('kanvas_live_push',{...input,requestId:id()},p)).rejects.toMatchObject({code:'REVISION_CONFLICT'});
  await expect(svc.execute('kanvas_live_push',{...input,requestId:id(),expectedRevision:result.revisions[d.id]},{userId:b.user!.id})).rejects.toThrow();
 }
 const before=(await svc.display(p,s.id,d.id));(await svc.updateDisplay(p,s.id,d.id,{held:true,expectedRevision:before.revision}));const revision=(await svc.display(p,s.id,d.id)).revision;
 await expect(svc.execute('kanvas_live_push',{sessionId:s.id,displayId:d.id,requestId:id(),expectedRevision:revision,data:before.view!.data},p)).rejects.toMatchObject({code:'DISPLAY_HELD'});
 expect((await svc.display(p,s.id,d.id)).revision).toBe(revision);
});
});
