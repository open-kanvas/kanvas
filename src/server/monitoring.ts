import {assertExpectedRevision} from './revisions.js';
import { asyncFilter, asyncMap } from './async-collections.js';
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { isIP } from 'node:net';
import type { TLSSocket } from 'node:tls';
import { createHash } from 'node:crypto';
import type { AuthPrincipal } from './auth.js';
import { AppError, id, Store } from './store.js';
import type { ViewSpec } from '../shared/types.js';
import {
  MONITORING_LIMITS as LIMITS, assertMonitoringMapping, isMonitoringUrl, monitoringPointer,
  monitoringConfigSchema, monitoringReadSchema, monitoringStartSchema, monitoringStopSchema, monitoringUpdateSchema,
  type MonitoringConfig, type MonitoringExpression, type MonitoringHealth, type MonitoringJson,
  type MonitoringStopReason, type MonitoringSummary,
} from '../shared/monitoring.js';

export { monitoringConfigSchema, monitoringReadSchema, monitoringStartSchema, monitoringStopSchema, monitoringUpdateSchema };
export const MONITORING_DOCUMENT = 'monitoring-job';

const messages: Record<string, string> = {
  MONITORING_BLOCKED_URL: 'Monitoring accepts public HTTPS endpoints on port 443 without credentials. Local, private, reserved, and special-use destinations are blocked.',
  MONITORING_DNS: 'The endpoint could not be resolved to public addresses.',
  MONITORING_NETWORK: 'The endpoint could not be reached securely from KANVAS. Its current state is unknown.',
  MONITORING_TIMEOUT: 'The endpoint did not finish responding within the polling time limit.',
  MONITORING_REDIRECT: 'The endpoint exceeded the redirect limit or returned an unsupported redirect.',
  MONITORING_BODY_TOO_LARGE: 'The endpoint response exceeds the monitoring size limit. Use a smaller public response.',
  MONITORING_RESPONSE_TYPE: 'The endpoint did not return the expected uncompressed JSON or supported raster image.',
  MONITORING_JSON: 'The response is not bounded, unambiguous JSON. Duplicate/reserved keys and excessive depth or arrays are not accepted.',
  MONITORING_PRECISION: 'A JSON number cannot be preserved without rounding. Have the endpoint supply precise numbers as strings.',
  MONITORING_MAPPING: 'The mapping needs an existing JSON Pointer and the expected object or array. No values were guessed, coerced, or dropped.',
  MONITORING_VALIDATION: 'The mapped source does not satisfy the existing template or owned-media validation rules.',
  MONITORING_HTTP: 'The endpoint returned an unsuccessful HTTP status. The last valid content is retained.',
  MONITORING_CANCELLED: 'The polling operation was cancelled.',
};
function failure(code: string, status = 400): AppError { return new AppError(code, messages[code] ?? messages.MONITORING_NETWORK, status); }
const copy = <T>(value: T): T => structuredClone(value);
const iso = (time: number): string => new Date(time).toISOString();
const reserved = new Set(['__proto__', 'prototype', 'constructor']);

function ipv4Number(address: string): number | undefined {
  if (isIP(address) !== 4) return;
  return address.split('.').reduce((result, part) => result * 256 + Number(part), 0);
}
function ipv6Number(address: string): bigint | undefined {
  if (isIP(address) !== 6 || address.includes('%')) return;
  let value = address.toLowerCase();
  if (value.includes('.')) {
    const last = value.lastIndexOf(':'), v4 = ipv4Number(value.slice(last + 1));
    if (v4 === undefined) return;
    value = `${value.slice(0, last)}:${Math.floor(v4 / 65536).toString(16)}:${(v4 % 65536).toString(16)}`;
  }
  const halves = value.split('::');
  const left = halves[0] ? halves[0].split(':') : [], right = halves[1] ? halves[1].split(':') : [];
  const parts = halves.length === 2 ? [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right] : left;
  if (parts.length !== 8) return;
  return parts.reduce((result, part) => (result << 16n) + BigInt(`0x${part}`), 0n);
}
function inV4(value: number, prefix: string, bits: number): boolean {
  const size = 2 ** (32 - bits);
  return Math.floor(value / size) === Math.floor(ipv4Number(prefix)! / size);
}
function inV6(value: bigint, prefix: string, bits: number): boolean { return value >> BigInt(128 - bits) === ipv6Number(prefix)! >> BigInt(128 - bits); }

/** Conservative globally routable IP policy; never rely on a hostname-only URL check. */
export function isPublicMonitoringAddress(address: string): boolean {
  const v4 = ipv4Number(address);
  if (v4 !== undefined) return !([
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
    ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
    ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
  ] as const).some(([prefix, bits]) => inV4(v4, prefix, bits));
  const v6 = ipv6Number(address);
  // Only global unicast, excluding transition mechanisms and reserved/documentation ranges.
  return v6 !== undefined && inV6(v6, '2000::', 3) && !([
    ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3ffe::', 16], ['3fff::', 20],
  ] as const).some(([prefix, bits]) => inV6(v6, prefix, bits));
}

export function publicMonitoringUrl(value: string): URL {
  if (!isMonitoringUrl(value)) throw failure('MONITORING_BLOCKED_URL');
  const url = new URL(value), hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (isIP(hostname)) { if (!isPublicMonitoringAddress(hostname)) throw failure('MONITORING_BLOCKED_URL'); }
  else if (!hostname.includes('.') || /(?:^|\.)(?:localhost|local|localdomain|internal|invalid|test|example|onion|lan|home|corp|svc)$/.test(hostname) || hostname.endsWith('.home.arpa')) throw failure('MONITORING_BLOCKED_URL');
  // Normalize trailing dots once so the hostname checked is the hostname used for TLS and DNS.
  url.hostname = isIP(hostname) === 6 ? `[${hostname}]` : hostname;
  return url;
}

export interface MonitoringAddress { address: string; family: 4 | 6 }
export interface PinnedMonitoringRequest {
  url: URL; address: MonitoringAddress; signal: AbortSignal; maxBytes: number; headersOnly: boolean; accept: string;
}
export interface PinnedMonitoringResponse {
  statusCode: number; headers: Record<string, string | string[] | undefined>; body: Buffer; peerAddress: string;
}
export interface MonitoringNetwork {
  resolve(hostname: string): Promise<MonitoringAddress[]>;
  send(request: PinnedMonitoringRequest): Promise<PinnedMonitoringResponse>;
}
function equivalentPeer(actual: string, expected: string): boolean {
  // Node can expose a v4 peer in mapped form even though the selected destination was v4.
  if (isIP(expected) === 4 && isIP(actual) === 6) {
    const number = ipv6Number(actual);
    return number !== undefined && number >> 32n === 0xffffn && Number(number & 0xffffffffn) === ipv4Number(expected);
  }
  return isIP(actual) === isIP(expected) && (isIP(actual) === 4 ? actual === expected : ipv6Number(actual) === ipv6Number(expected));
}

/** New TLS socket per request, pinned lookup, normal certificate verification, no proxy or cookie jar. */
export function pinnedMonitoringRequest(input: PinnedMonitoringRequest, requestFactory: typeof httpsRequest = httpsRequest): Promise<PinnedMonitoringResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const hostname = input.url.hostname.replace(/^\[|\]$/g, '');
    const finish = (error?: Error, response?: PinnedMonitoringResponse): void => {
      if (settled) return;
      settled = true;
      if (error) reject(error); else resolve(response!);
    };
    const pinnedLookup: RequestOptions['lookup'] = (_host, options, callback) => {
      if (options.all) callback(null, [input.address]); else callback(null, input.address.address, input.address.family);
    };
    const request = requestFactory({
      protocol: 'https:', hostname, port: 443, path: `${input.url.pathname}${input.url.search}`,
      method: 'GET', agent: false, lookup: pinnedLookup, family: input.address.family,
      ...(isIP(hostname) ? {} : { servername: hostname }), rejectUnauthorized: true,
      maxHeaderSize: 16 * 1024, signal: input.signal,
      headers: { accept: input.accept, 'accept-encoding': 'identity', 'cache-control': 'no-cache', 'user-agent': 'KANVAS-Monitor/1.0' },
    }, response => {
      const peerAddress = response.socket.remoteAddress ?? '';
      if (!equivalentPeer(peerAddress, input.address.address)) { finish(failure('MONITORING_BLOCKED_URL')); response.destroy(); request.destroy(); return; }
      const statusCode = response.statusCode ?? 0;
      const redirect = [301, 302, 303, 307, 308].includes(statusCode);
      const output = (body: Buffer): PinnedMonitoringResponse => ({ statusCode, headers: response.headers, body, peerAddress });
      // Uptime measures headers, not an unbounded/download response. Redirect bodies are never read.
      if (input.headersOnly || redirect) { finish(undefined, output(Buffer.alloc(0))); response.destroy(); return; }
      const encoding = String(response.headers['content-encoding'] ?? 'identity').trim().toLowerCase();
      if (encoding !== 'identity') { finish(failure('MONITORING_RESPONSE_TYPE')); response.destroy(); return; }
      const length = response.headers['content-length'];
      if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > input.maxBytes)) { finish(failure('MONITORING_BODY_TOO_LARGE')); response.destroy(); return; }
      let size = 0;
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > input.maxBytes) { finish(failure('MONITORING_BODY_TOO_LARGE')); response.destroy(); request.destroy(); }
        else chunks.push(chunk);
      });
      response.once('end', () => finish(undefined, output(Buffer.concat(chunks, size))));
      response.once('error', () => finish(failure('MONITORING_NETWORK')));
      response.once('aborted', () => finish(failure('MONITORING_NETWORK')));
    });
    request.once('socket', socket => {
      (socket as TLSSocket).once('secureConnect', () => {
        if (!equivalentPeer(socket.remoteAddress ?? '', input.address.address)) { finish(failure('MONITORING_BLOCKED_URL')); request.destroy(); }
      });
    });
    request.once('error', error => finish(error instanceof AppError ? error : failure(input.signal.aborted ? 'MONITORING_CANCELLED' : 'MONITORING_NETWORK')));
    request.end();
  });
}

function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) { void pending.catch(() => {}); return Promise.reject(failure('MONITORING_CANCELLED')); }
  return new Promise((resolve, reject) => {
    const abort = () => reject(failure('MONITORING_CANCELLED'));
    signal.addEventListener('abort', abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort)).catch(() => {});
  });
}
const header = (headers: PinnedMonitoringResponse['headers'], key: string): string | undefined => {
  const value = headers[key]; return typeof value === 'string' ? value : undefined;
};
function retryAfter(value: string | undefined, time: number): number | undefined {
  if (!value || value.length > 100) return;
  const delay = /^\d{1,9}$/.test(value.trim()) ? Number(value.trim()) * 1000 : Date.parse(value) - time;
  return Number.isFinite(delay) && delay > 0 ? Math.min(LIMITS.maxDurationSeconds * 1000, delay) : undefined;
}
export interface MonitoringFetchResult {
  statusCode: number; latencyMs: number; mimeType: string; body: Buffer; finalUrl: string; retryAfterMs?: number;
}
export interface MonitoringFetchOptions { mode: MonitoringConfig['mode']; signal: AbortSignal; timeoutMs?: number }
export type MonitoringFetcher = (url: string, options: MonitoringFetchOptions) => Promise<MonitoringFetchResult>;

/** Entire DNS + redirect + TLS + body operation has one deadline; every hop is independently checked. */
export function createMonitoringFetcher(network: Partial<MonitoringNetwork> = {}): MonitoringFetcher {
  const resolve = network.resolve ?? (async hostname => (await dnsLookup(hostname, { all: true, verbatim: true })).map(item => ({ address: item.address, family: item.family as 4 | 6 })));
  const send = network.send ?? pinnedMonitoringRequest;
  return async (value, options) => {
    const controller = new AbortController(), started = performance.now();
    let timedOut = false;
    const abort = () => controller.abort();
    options.signal.addEventListener('abort', abort, { once: true });
    if (options.signal.aborted) controller.abort();
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, Math.max(1, Math.min(options.timeoutMs ?? LIMITS.timeoutMs, LIMITS.maxTimeoutMs)));
    timer.unref();
    try {
      let url = publicMonitoringUrl(value);
      const visited = new Set<string>();
      for (let hop = 0; hop <= LIMITS.maxRedirects; hop++) {
        if (controller.signal.aborted) throw failure('MONITORING_CANCELLED');
        if (visited.has(url.href)) throw failure('MONITORING_REDIRECT');
        visited.add(url.href);
        const hostname = url.hostname.replace(/^\[|\]$/g, '');
        let addresses: MonitoringAddress[];
        try { addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) as 4 | 6 }] : await abortable(resolve(hostname), controller.signal); }
        catch (error) { if (controller.signal.aborted) throw error; throw failure('MONITORING_DNS'); }
        if (!addresses.length || addresses.length > 16) throw failure('MONITORING_DNS');
        // Reject the entire DNS answer, including a private alternative. Never retry on a new lookup.
        if (addresses.some(address => ![4, 6].includes(address.family) || isIP(address.address) !== address.family || !isPublicMonitoringAddress(address.address))) throw failure('MONITORING_BLOCKED_URL');
        const address = addresses[0], maxBytes = options.mode === 'image' ? LIMITS.imageBytes : LIMITS.jsonBytes;
        const response = await abortable(send({ url, address, signal: controller.signal, maxBytes, headersOnly: options.mode === 'uptime', accept: options.mode === 'image' ? 'image/png,image/jpeg,image/webp,image/gif,image/avif' : options.mode === 'json' ? 'application/json' : '*/*' }), controller.signal);
        if (!equivalentPeer(response.peerAddress, address.address)) throw failure('MONITORING_BLOCKED_URL');
        if (!Number.isInteger(response.statusCode) || response.statusCode < 200 || response.statusCode > 599) throw failure('MONITORING_NETWORK');
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          const location = header(response.headers, 'location');
          if (!location || location.length > 2048 || hop === LIMITS.maxRedirects) throw failure('MONITORING_REDIRECT');
          try { url = publicMonitoringUrl(new URL(location, url).href); }
          catch (error) { if (error instanceof AppError) throw error; throw failure('MONITORING_REDIRECT'); }
          continue;
        }
        if (response.statusCode >= 300 && response.statusCode < 400) throw failure('MONITORING_REDIRECT');
        if (response.body.length > maxBytes) throw failure('MONITORING_BODY_TOO_LARGE');
        const encoding = (header(response.headers, 'content-encoding') ?? 'identity').trim().toLowerCase();
        const contentType = header(response.headers, 'content-type') ?? '';
        const mimeType = contentType.split(';')[0].trim().toLowerCase();
        if (options.mode !== 'uptime' && encoding !== 'identity') throw failure('MONITORING_RESPONSE_TYPE');
        if (response.statusCode >= 200 && response.statusCode < 300 && options.mode === 'json' && !/^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json$/.test(mimeType)) throw failure('MONITORING_RESPONSE_TYPE');
        if (response.statusCode >= 200 && response.statusCode < 300 && options.mode === 'json' && /;\s*charset\s*=/i.test(contentType) && !/;\s*charset\s*=\s*"?utf-8"?\s*(?:;|$)/i.test(contentType)) throw failure('MONITORING_RESPONSE_TYPE');
        if (response.statusCode >= 200 && response.statusCode < 300 && options.mode === 'image' && !['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'].includes(mimeType)) throw failure('MONITORING_RESPONSE_TYPE');
        return { statusCode: response.statusCode, latencyMs: Math.round((performance.now() - started) * 100) / 100, mimeType, body: response.body, finalUrl: url.href,
          ...([429, 503].includes(response.statusCode) ? { retryAfterMs: retryAfter(header(response.headers, 'retry-after'), Date.now()) } : {}) };
      }
      throw failure('MONITORING_REDIRECT');
    } catch (error) {
      if (timedOut) throw failure('MONITORING_TIMEOUT', 504);
      if (options.signal.aborted) throw failure('MONITORING_CANCELLED');
      throw error instanceof AppError && messages[error.code] ? error : failure('MONITORING_NETWORK');
    } finally { clearTimeout(timer); options.signal.removeEventListener('abort', abort); controller.abort(); }
  };
}

/** Decimal identity, allowing spelling differences (1e3 == 1000), never silent precision loss. */
function decimalIdentity(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value);
  if (!match) throw failure('MONITORING_PRECISION');
  let digits = `${match[2]}${match[3] ?? ''}`.replace(/^0+/, '');
  let exponent = Number(match[4] ?? 0) - (match[3]?.length ?? 0);
  if (!Number.isSafeInteger(exponent)) throw failure('MONITORING_PRECISION');
  if (!digits) return `${match[1]}0`;
  while (digits.endsWith('0')) { digits = digits.slice(0, -1); exponent++; }
  return `${match[1]}${digits}e${exponent}`;
}

/** Bounded parser rejects duplicate keys and lossy numbers before JSON.parse could erase them. */
export function parseMonitoringJson(bytes: Buffer | string): MonitoringJson {
  let text: string;
  if (typeof bytes === 'string') { if (Buffer.byteLength(bytes) > LIMITS.jsonBytes) throw failure('MONITORING_BODY_TOO_LARGE'); text = bytes; }
  else { if (bytes.length > LIMITS.jsonBytes) throw failure('MONITORING_BODY_TOO_LARGE'); try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw failure('MONITORING_JSON'); } }
  let index = 0, nodes = 0;
  const whitespace = () => { while (/[\x20\t\r\n]/.test(text[index] ?? '\0')) index++; };
  const string = (): string => {
    const start = index++;
    while (index < text.length) {
      if (text[index] === '\\') { index += 2; continue; }
      if (text[index++] === '"') { try { return JSON.parse(text.slice(start, index)) as string; } catch { throw failure('MONITORING_JSON'); } }
    }
    throw failure('MONITORING_JSON');
  };
  const value = (depth: number): MonitoringJson => {
    if (++nodes > LIMITS.jsonNodes || depth > LIMITS.jsonDepth) throw failure('MONITORING_JSON');
    whitespace();
    const first = text[index];
    if (first === '"') return string();
    if (first === '{') {
      index++; whitespace(); const object: Record<string, MonitoringJson> = {};
      if (text[index] === '}') { index++; return object; }
      let keys = 0;
      for (;;) {
        whitespace(); if (text[index] !== '"' || ++keys > LIMITS.objectKeys) throw failure('MONITORING_JSON');
        const key = string();
        if (reserved.has(key) || Object.hasOwn(object, key)) throw failure('MONITORING_JSON');
        whitespace(); if (text[index++] !== ':') throw failure('MONITORING_JSON');
        object[key] = value(depth + 1); whitespace();
        const separator = text[index++]; if (separator === '}') return object; if (separator !== ',') throw failure('MONITORING_JSON');
      }
    }
    if (first === '[') {
      index++; whitespace(); const array: MonitoringJson[] = [];
      if (text[index] === ']') { index++; return array; }
      for (;;) {
        if (array.length >= LIMITS.arrayItems) throw failure('MONITORING_JSON');
        array.push(value(depth + 1)); whitespace();
        const separator = text[index++]; if (separator === ']') return array; if (separator !== ',') throw failure('MONITORING_JSON');
      }
    }
    for (const [token, result] of [['true', true], ['false', false], ['null', null]] as const) if (text.startsWith(token, index)) { index += token.length; return result; }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(index));
    if (!match) throw failure('MONITORING_JSON');
    const raw = match[0], number = Number(raw); index += raw.length;
    if (!Number.isFinite(number) || Object.is(number, -0) || Number.isInteger(number) && !Number.isSafeInteger(number) || decimalIdentity(raw) !== decimalIdentity(String(number))) throw failure('MONITORING_PRECISION');
    return number;
  };
  const result = value(0); whitespace(); if (index !== text.length) throw failure('MONITORING_JSON'); return result;
}

function pointer(root: MonitoringJson, path: string): MonitoringJson {
  if (!monitoringPointer(path)) throw failure('MONITORING_MAPPING');
  let current = root;
  for (const raw of path.split('/').slice(1)) {
    const key = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    if (!current || typeof current !== 'object' || reserved.has(key) || Array.isArray(current) && !/^(?:0|[1-9]\d*)$/.test(key) || !Object.hasOwn(current, key)) throw failure('MONITORING_MAPPING');
    current = (current as Record<string, MonitoringJson>)[key];
  }
  return current;
}

/** Exactly select/copy declared source fields. No filters, arithmetic, date guessing, or truncation. */
export function mapMonitoringJson(mapping: unknown, root: MonitoringJson): Record<string, unknown> {
  try { assertMonitoringMapping(mapping); } catch { throw failure('MONITORING_MAPPING'); }
  let nodes = 0, bytes = 0;
  const budget = (depth: number, added = 1): void => {
    bytes += added;
    if (++nodes > LIMITS.jsonNodes || depth > LIMITS.jsonDepth || bytes > LIMITS.jsonBytes) throw failure('MONITORING_BODY_TOO_LARGE');
  };
  const literal = (item: MonitoringJson, depth: number): MonitoringJson => {
    budget(depth, typeof item === 'string' ? Buffer.byteLength(item) + 2 : 8);
    if (item === null || typeof item !== 'object') return item;
    if (Array.isArray(item)) {
      if (item.length > LIMITS.arrayItems) throw failure('MONITORING_BODY_TOO_LARGE');
      return item.map(child => literal(child, depth + 1));
    }
    return Object.fromEntries(Object.entries(item).map(([key, child]) => { bytes += Buffer.byteLength(key) + 4; return [key, literal(child, depth + 1)]; }));
  };
  const evaluate = (expression: MonitoringExpression, current: MonitoringJson, depth: number): MonitoringJson => {
    budget(depth);
    if (expression === null || typeof expression !== 'object') return literal(expression as MonitoringJson, depth);
    if (Array.isArray(expression)) return expression.map(child => evaluate(child, current, depth + 1));
    const object = expression as Record<string, unknown>;
    if ('$path' in object) return literal(pointer(object.root ? root : current, object.$path as string), depth);
    if ('$literal' in object) return literal(object.$literal as MonitoringJson, depth);
    if ('$each' in object) {
      const items = pointer(object.root ? root : current, object.$each as string);
      if (!Array.isArray(items)) throw failure('MONITORING_MAPPING');
      if (items.length > LIMITS.arrayItems) throw failure('MONITORING_BODY_TOO_LARGE');
      return items.map(item => evaluate(object.map as MonitoringExpression, item, depth + 1));
    }
    return Object.fromEntries(Object.entries(object).map(([key, child]) => { bytes += Buffer.byteLength(key) + 4; return [key, evaluate(child as MonitoringExpression, current, depth + 1)]; }));
  };
  const output = evaluate(mapping, root, 0);
  if (!output || typeof output !== 'object' || Array.isArray(output)) throw failure('MONITORING_MAPPING');
  return output;
}

export interface MonitoringOwner { userId: string; agentId?: string; tokenId?: string }
export interface MonitoringLease { generation: number; revision: number; configRevision: number; held: boolean }
interface MonitoringReceipt { principal: string; requestId: string; digest: string }
export interface MonitoringJob {
  id: string; sessionId: string; displayId: string; owner: MonitoringOwner; lease: MonitoringLease;
  version: number; status: 'active' | 'stopped'; config: MonitoringConfig;
  createdAt: string; updatedAt: string; expiresAt: string; health: MonitoringHealth;
  lastAttemptAt?: string; lastOrigin?: string; currentAssetId?: string;
  pollToken?: string; pollLeaseUntil?: string;
  requests: MonitoringReceipt[];
}
export interface MonitoringHooks {
  /** Public API authorization uses the caller's current ordinary credentials. */
  authorize(principal: AuthPrincipal, sessionId: string, displayId: string | undefined, write: boolean): Promise<Awaited<void>>;
  /** Re-check stable grant identity + current session membership, not a rotating access credential. */
  inspect(owner: MonitoringOwner, sessionId: string, displayId: string): MonitoringLease | Promise<MonitoringLease>;
  /** Existing source/template/asset validators; are awaited and must not regenerate source content. */
  validate(owner: MonitoringOwner, sessionId: string, view: ViewSpec): Promise<Awaited<ViewSpec>>;
  /** Inside Store.transaction: compare job.lease, check owner, publish atomically.
   * Explicit start claims a fresh generation without changing visible content or its revision.
   * A null result never changes the display. */
  publish(job: MonitoringJob, view: ViewSpec | null, health: MonitoringHealth, claimGeneration?: boolean): Promise<Awaited<MonitoringLease | null>>;
  /** Awaited owned asset mutation inside the same Store.transaction; no external fetch. */
  storeImage?(job: MonitoringJob, image: { bytes: Buffer; mimeType: string }): { id: string; url: string } | Promise<{ id: string; url: string }>;
  /** Delete only this job's unreferenced derivatives; retain saved/history/current references. */
  releaseImage?(job: MonitoringJob, assetId: string): void | Promise<void>;
  changed?(sessionId: string, displayId: string): void | Promise<void>;
}
export interface MonitoringOptions {
  /** Test/embedding seam; production uses the pinned HTTPS transport. */
  fetcher?: MonitoringFetcher;
  /** Tests may drive runDue() with a controlled clock instead of real timers. */
  automatic?: boolean;
  now?: () => number;
}
interface RunningPoll { controller: AbortController; promise: Promise<void>; token: string; origin: string }
const sameLease = (left: MonitoringLease, right: MonitoringLease) => left.generation === right.generation && left.revision === right.revision && left.configRevision === right.configRevision && !right.held;
const canonical = (input: unknown): string => JSON.stringify(input, (_key, value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);

/** One scheduler per Store/service process. Records and in-flight claims survive process restart. */
export class Monitoring {
  private readonly activeIds = new Set<string>();
  private readonly running = new Map<string, RunningPoll>();
  private readonly originReady = new Map<string, number>();
  private readonly fetcher: MonitoringFetcher;
  private readonly clock: () => number;
  private readonly automatic: boolean;
  private timer?: ReturnType<typeof setTimeout>;
  private dispatch?: Promise<void>;
  private resumed = false;
  private closed = false;
  constructor(readonly store: Store, readonly hooks: MonitoringHooks, options: MonitoringOptions = {}) {
    this.fetcher = options.fetcher ?? createMonitoringFetcher(); this.clock = options.now ?? Date.now; this.automatic = options.automatic !== false;
  }

  private summary(job: MonitoringJob): MonitoringSummary {
    const health = copy(job.health);
    if (job.status === 'active' && health.status === 'healthy' && health.lastSuccessAt && this.clock() > Date.parse(health.lastSuccessAt) + job.config.intervalSeconds * 2000 + LIMITS.timeoutMs) {
      health.status = 'stale'; health.message = 'Waiting for a fresh sample. The last valid content is retained.';
    }
    return copy({ id: job.id, sessionId: job.sessionId, displayId: job.displayId, ownerId: job.owner.userId, version: job.version,
      status: job.status, config: job.config, template: job.config.mode === 'image' ? 'image' : job.config.template,
      createdAt: job.createdAt, updatedAt: job.updatedAt, expiresAt: job.expiresAt, health });
  }
  /** Effective eligibility is observable without stopping jobs or changing leases. */
  private async readSummary(job: MonitoringJob): Promise<MonitoringSummary> {
    const result = this.summary(job);
    const reason = job.status === 'active' ? (await this.inspect(job)) : undefined;
    if (reason) {
      result.status = 'stopped';
      result.health.status = 'stopped';
      result.health.stoppedReason = reason;
      delete result.health.nextPollAt;
      result.health.message = `${reason === 'expired' ? 'This monitoring lifetime has expired.' : reason === 'superseded' ? 'This job no longer owns the current display.' : 'This job no longer has active session authorization.'} Polling is no longer permitted. This is a read-time status; version and updatedAt describe the last saved job record. ${reason === 'superseded' ? 'The newer display content is untouched.' : 'The last valid content is retained.'}`;
    }
    return result;
  }
  private owner(principal: AuthPrincipal): MonitoringOwner {
    return { userId: principal.userId, ...(principal.agentId ? { agentId: principal.agentId } : {}), ...(principal.tokenId ? { tokenId: principal.tokenId } : {}) };
  }
  private changed(job: MonitoringJob): void { this.store.afterCommit(() => this.hooks.changed?.(job.sessionId, job.displayId)); }
  private requireOpen(): void { if (this.closed) throw new AppError('SERVICE_CLOSED', 'The monitoring service is shutting down.', 503); }
  private async job(sessionId: string, jobId: string): Promise<Awaited<MonitoringJob>> {
    const job = (await this.store.get<MonitoringJob>(MONITORING_DOCUMENT, jobId));
    if (!job || job.sessionId !== sessionId) throw new AppError('NOT_FOUND', 'This monitoring job is unavailable.', 404);
    return job;
  }
  private receipt(principal: AuthPrincipal, requestId: string, input: unknown): MonitoringReceipt {
    return { principal: principal.tokenId ?? principal.userId, requestId, digest: createHash('sha256').update(canonical(input)).digest('hex') };
  }
  private async replay(sessionId: string, receipt: MonitoringReceipt): Promise<Awaited<MonitoringJob | undefined>> {
    for (const job of (await this.store.list<MonitoringJob>(MONITORING_DOCUMENT, sessionId))) {
      const prior = job.requests.find(item => item.principal === receipt.principal && item.requestId === receipt.requestId);
      if (prior) {
        if (prior.digest !== receipt.digest) throw new AppError('REQUEST_ID_CONFLICT', 'This monitoring request ID was already used with different parameters.', 409);
        return job;
      }
    }
  }
  private addReceipt(job: MonitoringJob, receipt: MonitoringReceipt): void {
    if (job.requests.length >= LIMITS.requestsPerJob) throw new AppError('LIMIT_REACHED', 'This job has reached its control-operation limit. Stop it and create a new job.', 429);
    job.requests.push(receipt);
  }
  private configuration(config: MonitoringConfig): MonitoringConfig {
    publicMonitoringUrl(config.url);
    if (config.mode === 'image' && (!this.hooks.storeImage || !this.hooks.releaseImage)) throw new AppError('MONITORING_IMAGE_UNAVAILABLE', 'This installation has not enabled validated, owned snapshot storage.', 503);
    return copy(config);
  }
  private async inspect(job: MonitoringJob): Promise<MonitoringStopReason | undefined> {
    if (Date.parse(job.expiresAt) <= this.clock()) return 'expired';
    try { if (!sameLease(job.lease, (await this.hooks.inspect(job.owner, job.sessionId, job.displayId)))) return 'superseded'; }
    catch { return 'authorization-lost'; }
  }
  private checkVersion(job: MonitoringJob, expected: number | undefined): void {assertExpectedRevision(expected,job.version,'version'); }

  /** Call once after domain initialization. This is the only implicit restart, of already explicit jobs. */
  async resume(): Promise<Awaited<void>> {
    return this.store.atomic(async () => {
    this.requireOpen(); if (this.resumed) return; this.resumed = true;
    const counts = new Map<string, number>();
    for (const job of (await this.store.list<MonitoringJob>(MONITORING_DOCUMENT))) {
      if (job.lastAttemptAt && job.lastOrigin) this.originReady.set(job.lastOrigin, Math.max(this.originReady.get(job.lastOrigin) ?? 0, Date.parse(job.lastAttemptAt) + LIMITS.originGapMs));
      if (job.status !== 'active') continue;
      const reason = (await this.inspect(job));
      if (reason) { (await this.stopInternal(job, reason)); continue; }
      if (this.activeIds.size >= LIMITS.activeTotal || (counts.get(job.sessionId) ?? 0) >= LIMITS.activePerSession) { (await this.stopInternal(job, 'resource-limit')); continue; }
      counts.set(job.sessionId, (counts.get(job.sessionId) ?? 0) + 1); this.activeIds.add(job.id);
      if (job.pollLeaseUntil && Date.parse(job.pollLeaseUntil) > this.clock()) job.health.nextPollAt = iso(Math.max(Date.parse(job.health.nextPollAt ?? '') || 0, Date.parse(job.pollLeaseUntil)));
      if (!Number.isFinite(Date.parse(job.health.nextPollAt ?? ''))) job.health.nextPollAt = iso(this.clock() + job.config.intervalSeconds * 1000);
      (await this.store.put(MONITORING_DOCUMENT, job));
    }
    (await this.arm());

    });
  }

  async start(principal: AuthPrincipal, raw: unknown): Promise<Awaited<MonitoringSummary>> {
    return this.store.atomic(async () => {
    this.requireOpen(); const input = monitoringStartSchema.parse(raw);
    (await this.hooks.authorize(principal, input.sessionId, input.displayId, true));
    if (!this.resumed) (await this.resume());
    const receipt = this.receipt(principal, input.requestId, { action: 'start', ...input });
    const replay = (await this.replay(input.sessionId, receipt)); if (replay) return this.summary(replay);
    (await this.reconcileSession(input.sessionId));
    const config = this.configuration(input.config), owner = this.owner(principal);
    const created = (await this.store.transaction(async () => {
      const all = (await this.store.list<MonitoringJob>(MONITORING_DOCUMENT)), session = all.filter(job => job.sessionId === input.sessionId);
      if (all.length >= LIMITS.recordsTotal || session.length >= LIMITS.recordsPerSession || all.filter(job => job.status === 'active').length >= LIMITS.activeTotal || session.filter(job => job.status === 'active').length >= LIMITS.activePerSession) throw new AppError('LIMIT_REACHED', 'The monitoring job limit has been reached. Stop an active job or ask the operator to remove old job records.', 429);
      if (session.some(job => job.displayId === input.displayId && job.status === 'active')) throw new AppError('MONITORING_ACTIVE', 'This display already has an active monitoring job. Update or stop that job first.', 409);
      const lease = (await this.hooks.inspect(owner, input.sessionId, input.displayId));
      assertExpectedRevision(input.expectedRevision,lease.revision);
      if (lease.held) throw new AppError('DISPLAY_HELD', 'Resume the display before starting monitoring.', 409);
      const time = this.clock(), jobId = id(), expiresAt = iso(time + config.durationSeconds * 1000);
      const job: MonitoringJob = { id: jobId, sessionId: input.sessionId, displayId: input.displayId, owner, lease, version: 1, status: 'active', config,
        createdAt: iso(time), updatedAt: iso(time), expiresAt, requests: [receipt],
        health: { jobId, status: 'starting', expiresAt, nextPollAt: iso(time), consecutiveFailures: 0, message: 'Waiting for the first sample. Previous display content is retained.' } };
      (await this.store.put(MONITORING_DOCUMENT, job));
      const nextLease = (await this.hooks.publish(job, null, job.health, true));
      if (!nextLease) throw new AppError('REVISION_CONFLICT', 'This display changed before monitoring could start.', 409);
      job.lease = nextLease; (await this.store.put(MONITORING_DOCUMENT, job)); return job;
    }));
    this.activeIds.add(created.id); this.changed(created); (await this.arm()); return this.summary(created);

    });
  }

  async read(principal: AuthPrincipal, raw: unknown): Promise<Awaited<MonitoringSummary | { jobs: MonitoringSummary[] }>> {
    this.requireOpen(); const input = monitoringReadSchema.parse(raw);
    (await this.hooks.authorize(principal, input.sessionId, undefined, false));
    if (input.jobId) { const job = (await this.job(input.sessionId, input.jobId)); (await this.hooks.authorize(principal, input.sessionId, job.displayId, false)); return this.readSummary(job); }
    const jobs = (await this.store.list<MonitoringJob>(MONITORING_DOCUMENT, input.sessionId));
    return { jobs: await asyncMap(await asyncFilter(jobs, async job => { try { await this.hooks.authorize(principal, input.sessionId, job.displayId, false); return true; } catch { return false; } }), job => this.readSummary(job)) };
  }

  async update(principal: AuthPrincipal, raw: unknown): Promise<Awaited<MonitoringSummary>> {
    return this.store.atomic(async () => {
    this.requireOpen(); const input = monitoringUpdateSchema.parse(raw);
    (await this.hooks.authorize(principal, input.sessionId, undefined, true));
    const prior = (await this.job(input.sessionId, input.jobId)); (await this.hooks.authorize(principal, input.sessionId, prior.displayId, true));
    const receipt = this.receipt(principal, input.requestId, { action: 'update', ...input }), replay = (await this.replay(input.sessionId, receipt));
    if (replay) return this.summary(replay);
    (await this.reconcileSession(input.sessionId));
    const config = this.configuration(input.config);
    const updated = (await this.store.transaction(async () => {
      const job = (await this.job(input.sessionId, input.jobId)); this.checkVersion(job, input.expectedVersion);
      if (job.status !== 'active') throw new AppError('MONITORING_STOPPED', 'This job is stopped. Start a new job to resume polling.', 409);
      const reason = (await this.inspect(job)); if (reason) throw new AppError('MONITORING_SUPERSEDED', 'This job no longer owns the current display or authorization.', 409);
      this.addReceipt(job, receipt); job.version++; job.config = config; job.updatedAt = iso(this.clock()); job.expiresAt = iso(this.clock() + config.durationSeconds * 1000);
      const next = Math.max(this.clock(), (Date.parse(job.lastAttemptAt ?? '') || 0) + config.intervalSeconds * 1000);
      job.health = { jobId: job.id, status: 'starting', expiresAt: job.expiresAt, nextPollAt: iso(next), consecutiveFailures: 0, message: 'Waiting for a sample of the updated source. Previous display content is retained.' };
      delete job.pollToken; delete job.pollLeaseUntil;
      const nextLease = (await this.hooks.publish(job, null, job.health)); if (!nextLease) throw new AppError('REVISION_CONFLICT', 'This display changed before monitoring could be updated.', 409);
      job.lease = nextLease; (await this.store.put(MONITORING_DOCUMENT, job)); return job;
    }));
    this.running.get(updated.id)?.controller.abort(); this.changed(updated); (await this.arm()); return this.summary(updated);

    });
  }

  async stop(principal: AuthPrincipal, raw: unknown): Promise<Awaited<MonitoringSummary>> {
    return this.store.atomic(async () => {
    this.requireOpen(); const input = monitoringStopSchema.parse(raw);
    (await this.hooks.authorize(principal, input.sessionId, undefined, true));
    const prior = (await this.job(input.sessionId, input.jobId)); (await this.hooks.authorize(principal, input.sessionId, prior.displayId, true));
    const receipt = this.receipt(principal, input.requestId, { action: 'stop', ...input }), replay = (await this.replay(input.sessionId, receipt));
    if (replay) return this.summary(replay);
    const stopped = (await this.store.transaction(async () => {
      const job = (await this.job(input.sessionId, input.jobId)); this.checkVersion(job, input.expectedVersion);
      // Stopping must remain possible even after the regular control-receipt budget is exhausted.
      if (job.requests.length < LIMITS.requestsPerJob + 1) job.requests.push(receipt);
      return (await this.stopInternal(job, 'user'));
    }));
    (await this.arm()); return this.summary(stopped);

    });
  }

  private async stopInternal(job: MonitoringJob, reason: MonitoringStopReason): Promise<Awaited<MonitoringJob>> {
    return this.store.atomic(async () => {
    if (job.status === 'active') {
      job.version++; job.status = 'stopped'; job.updatedAt = iso(this.clock());
      job.health = { ...job.health, status: 'stopped', stoppedReason: reason,
        message: reason === 'expired' ? 'Monitoring reached its expiry. The last valid content is retained.' : reason === 'superseded' ? 'Monitoring stopped because the display changed. Newer content is untouched.' : reason === 'authorization-lost' || reason === 'session-ended' ? 'Monitoring stopped because its session or authorization is no longer active.' : 'Monitoring stopped. The last valid content is retained.' };
    }
    delete job.health.nextPollAt; delete job.pollToken; delete job.pollLeaseUntil;
    (await this.store.transaction(async () => {
      // Cancellation is durable even if publishing health is no longer authorized.
      if (reason !== 'authorization-lost' && reason !== 'session-ended') {
        try { const lease = (await this.hooks.publish(job, null, job.health)); if (lease) job.lease = lease; } catch { /* Do not touch a revoked or newer display. */ }
      }
      (await this.store.put(MONITORING_DOCUMENT, job));
    }));
    this.activeIds.delete(job.id); this.running.get(job.id)?.controller.abort(); this.changed(job); return job;

    });
  }

  async cancelSession(sessionId: string, reason: MonitoringStopReason = 'session-ended'): Promise<Awaited<void>> {
    return this.store.atomic(async () => {
    if (this.closed) return;
    for (const job of (await this.store.list<MonitoringJob>(MONITORING_DOCUMENT, sessionId))) if (job.status === 'active') (await this.stopInternal(job, reason));
    (await this.arm());

    });
  }
  /** Wire membership, grant invalidations, display changes, and session-end events here. */
  async reconcileSession(sessionId: string): Promise<Awaited<void>> {
    return this.store.atomic(async () => {
    if (this.closed) return;
    for (const job of (await this.store.list<MonitoringJob>(MONITORING_DOCUMENT, sessionId))) if (job.status === 'active') {
      const reason = (await this.inspect(job)); if (reason) (await this.stopInternal(job, reason));
    }
    (await this.arm());

    });
  }

  private async current(claim: MonitoringJob): Promise<Awaited<MonitoringJob | undefined>> {
    if (this.closed) return;
    const job = (await this.store.get<MonitoringJob>(MONITORING_DOCUMENT, claim.id));
    if (job?.status === 'active' && job.version === claim.version && job.pollToken === claim.pollToken) return job;
  }
  private nextDelay(job: MonitoringJob, failures: number, response?: MonitoringFetchResult): number {
    const base = job.config.intervalSeconds * 1000;
    return Math.max(base, Math.min(LIMITS.maxBackoffMs, base * 2 ** Math.min(failures, 6)), response?.retryAfterMs ?? 0);
  }
  private uptime(job: MonitoringJob, response: MonitoringFetchResult, time: string): ViewSpec {
    if (job.config.mode !== 'uptime') throw failure('MONITORING_VALIDATION');
    const state = response.statusCode >= 400 ? 'Down' : response.latencyMs > job.config.degradedAfterMs ? 'Degraded' : 'Up';
    const label = job.config.title ?? publicMonitoringUrl(job.config.url).hostname;
    const value = job.config.metric === 'latency' ? response.latencyMs : job.config.metric === 'http-status' ? response.statusCode : state;
    const detail = `HTTP ${response.statusCode} · ${response.latencyMs} ms`;
    return { version: 1, template: job.config.template, ...(job.config.title ? { title: job.config.title } : {}),
      data: job.config.template === 'fact' ? { text: String(value), subtitle: `${label} · ${detail}` } : { value, label, ...(job.config.metric === 'latency' ? { unit: 'ms' } : {}), comparison: detail },
      source: { url: job.config.url, title: 'Public endpoint observation from KANVAS', timestamp: time } };
  }

  private async commitSample(claim: MonitoringJob, response: MonitoringFetchResult, data?: Record<string, unknown>): Promise<Awaited<void>> {
    return this.store.atomic(async () => {
    let released: { job: MonitoringJob; assetId: string } | undefined;
    const committed = (await this.store.transaction(async () => {
      const job = (await this.current(claim)); if (!job) return;
      const reason = (await this.inspect(job)); if (reason) { (await this.stopInternal(job, reason)); return; }
      const time = iso(this.clock()), oldAsset = job.currentAssetId;
      let view: ViewSpec;
      if (job.config.mode === 'uptime') view = this.uptime(job, response, time);
      else if (job.config.mode === 'json') view = { version: 1, template: job.config.template, ...(job.config.title ? { title: job.config.title } : {}), data: data!, source: { url: job.config.url, title: 'Polled public JSON source', timestamp: time } };
      else {
        const asset = (await this.hooks.storeImage!(job, { bytes: response.body, mimeType: response.mimeType }));
        job.currentAssetId = asset.id;
        view = { version: 1, template: 'image', ...(job.config.title ? { title: job.config.title } : {}), data: { images: [{ url: asset.url, alt: job.config.alt, ...(job.config.caption ? { caption: job.config.caption } : {}) }] }, source: { url: job.config.url, title: 'Polled public snapshot', timestamp: time } };
      }
      view = (await this.hooks.validate(job.owner, job.sessionId, view));
      const health: MonitoringHealth = { jobId: job.id, status: 'healthy', checkedAt: time, lastSuccessAt: time,
        expiresAt: job.expiresAt, consecutiveFailures: 0, statusCode: response.statusCode, latencyMs: response.latencyMs,
        nextPollAt: iso(this.clock() + this.nextDelay(job, 0, response)),
        ...(job.config.mode === 'uptime' ? { targetState: response.statusCode >= 400 ? 'down' : response.latencyMs > job.config.degradedAfterMs ? 'degraded' : 'up' } : {}) };
      const lease = (await this.hooks.publish(job, view, health));
      if (!lease) throw new AppError('MONITORING_SUPERSEDED', 'This display changed before the poll completed.', 409);
      job.lease = lease; job.health = health; job.updatedAt = time; delete job.pollToken; delete job.pollLeaseUntil;
      if (job.config.mode !== 'image') delete job.currentAssetId;
      (await this.store.put(MONITORING_DOCUMENT, job));
      if (oldAsset && oldAsset !== job.currentAssetId) released = { job, assetId: oldAsset };
      return job;
    }));
    if (released) { try { await this.hooks.releaseImage?.(released.job, released.assetId); } catch { /* Retaining an owned derivative is safer than deleting a referenced asset. */ } }
    if (committed) this.changed(committed);

    });
  }

  private async commitFailure(claim: MonitoringJob, error: unknown, response?: MonitoringFetchResult): Promise<Awaited<void>> {
    return this.store.atomic(async () => {
    const committed = (await this.store.transaction(async () => {
      const job = (await this.current(claim)); if (!job) return;
      const reason = (await this.inspect(job)); if (reason) { (await this.stopInternal(job, reason)); return; }
      if (error instanceof AppError && error.code === 'MONITORING_SUPERSEDED') { (await this.stopInternal(job, 'superseded')); return; }
      const code = error instanceof AppError && messages[error.code] ? error.code : 'MONITORING_VALIDATION';
      const time = iso(this.clock()), failures = Math.min(1000, job.health.consecutiveFailures + 1);
      const health: MonitoringHealth = { jobId: job.id, status: 'stale', checkedAt: time, ...(job.health.lastSuccessAt ? { lastSuccessAt: job.health.lastSuccessAt } : {}),
        expiresAt: job.expiresAt, consecutiveFailures: failures, errorCode: code, message: messages[code],
        nextPollAt: iso(this.clock() + this.nextDelay(job, failures, response)),
        ...(response ? { statusCode: response.statusCode, latencyMs: response.latencyMs } : {}), ...(job.config.mode === 'uptime' ? { targetState: 'unknown' } : {}) };
      const lease = (await this.hooks.publish(job, null, health));
      if (!lease) { (await this.stopInternal(job, 'superseded')); return; }
      job.lease = lease; job.health = health; job.updatedAt = time; delete job.pollToken; delete job.pollLeaseUntil;
      (await this.store.put(MONITORING_DOCUMENT, job)); return job;
    }));
    if (committed) this.changed(committed);

    });
  }

  private async poll(claim: MonitoringJob, signal: AbortSignal): Promise<void> {
    let response: MonitoringFetchResult | undefined;
    // Bound even injected/custom fetchers that ignore AbortSignal. Production transport also has its own deadline.
    const deadline = new AbortController(), cancelled = () => deadline.abort();
    signal.addEventListener('abort', cancelled, { once: true }); if (signal.aborted) deadline.abort();
    let timeout = false;
    const timer = setTimeout(() => { timeout = true; deadline.abort(); }, LIMITS.maxTimeoutMs); timer.unref();
    try {
      response = await abortable(this.fetcher(claim.config.url, { mode: claim.config.mode, signal: deadline.signal, timeoutMs: LIMITS.timeoutMs }), deadline.signal);
      if (!(await this.current(claim)) || deadline.signal.aborted) return;
      if (response.body.length > (claim.config.mode === 'image' ? LIMITS.imageBytes : LIMITS.jsonBytes)) throw failure('MONITORING_BODY_TOO_LARGE');
      if (claim.config.mode !== 'uptime' && (response.statusCode < 200 || response.statusCode >= 300)) throw failure('MONITORING_HTTP');
      if (claim.config.mode === 'image' && !['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'].includes(response.mimeType)) throw failure('MONITORING_RESPONSE_TYPE');
      const data = claim.config.mode === 'json' ? mapMonitoringJson(claim.config.mapping, parseMonitoringJson(response.body)) : undefined;
      (await this.commitSample(claim, response, data));
    } catch (error) {
      if (!this.closed) (await this.commitFailure(claim, timeout ? failure('MONITORING_TIMEOUT') : !response && !(error instanceof AppError && messages[error.code]) ? failure('MONITORING_NETWORK') : error, response));
    } finally { clearTimeout(timer); signal.removeEventListener('abort', cancelled); deadline.abort(); }
  }

  /** Internal/testing operation only. Respects due times, origin spacing, persisted claims, and concurrency. */
  async runDue(): Promise<void> {
    if (this.closed || this.dispatch) return;
    let dispatched!: () => void;
    this.dispatch = new Promise<void>(resolve => { dispatched = resolve; });
    const pending: Promise<void>[] = [];
    try {
    if (!this.resumed) (await this.resume());
    if (this.timer) clearTimeout(this.timer); this.timer = undefined;
    const time = this.clock();
    const candidates = (await asyncMap([...this.activeIds], async jobId => (await this.store.get<MonitoringJob>(MONITORING_DOCUMENT, jobId)))).filter((job): job is MonitoringJob => Boolean(job));
    candidates.sort((a, b) => Date.parse(a.health.nextPollAt ?? a.expiresAt) - Date.parse(b.health.nextPollAt ?? b.expiresAt));
    for (const candidate of candidates) {
      if (candidate.status !== 'active') { this.activeIds.delete(candidate.id); continue; }
      const reason = (await this.inspect(candidate)); if (reason) { (await this.stopInternal(candidate, reason)); continue; }
      if (this.running.has(candidate.id) || this.running.size >= LIMITS.concurrentFetches || Date.parse(candidate.health.nextPollAt ?? candidate.expiresAt) > time || Date.parse(candidate.pollLeaseUntil ?? '') > time) continue;
      const origin = publicMonitoringUrl(candidate.config.url).origin;
      if ((this.originReady.get(origin) ?? 0) > time || [...this.running.values()].some(running => running.origin === origin)) continue;
      const claim = (await this.store.transaction(async () => {
        const job = (await this.store.get<MonitoringJob>(MONITORING_DOCUMENT, candidate.id));
        if (!job || job.status !== 'active' || job.version !== candidate.version || Date.parse(job.pollLeaseUntil ?? '') > time || Date.parse(job.health.nextPollAt ?? job.expiresAt) > time) return;
        job.pollToken = id(); job.pollLeaseUntil = iso(time + LIMITS.maxTimeoutMs + 1000); job.lastAttemptAt = iso(time); job.lastOrigin = origin;
        (await this.store.put(MONITORING_DOCUMENT, job)); return job;
      }));
      if (!claim) continue;
      this.originReady.set(origin, time + LIMITS.originGapMs);
      const running: RunningPoll = { controller: new AbortController(), token: claim.pollToken!, origin, promise: Promise.resolve() };
      this.running.set(claim.id, running);
      running.promise = this.poll(claim, running.controller.signal).catch(async () => {
        // A broken embedding callback must not create an unhandled rejection or a rapid retry loop.
        if (!this.closed) { const job = (await this.current(claim)); if (job) (await this.stopInternal(job, 'authorization-lost')); }
      }).finally(async () => { if (this.running.get(claim.id) === running) this.running.delete(claim.id); (await this.arm()); });
      pending.push(running.promise);
    }
    (await this.arm());
    } finally { this.dispatch = undefined; dispatched(); }
    await Promise.allSettled(pending);
  }

  private async arm(): Promise<Awaited<void>> {
    if (this.timer) clearTimeout(this.timer); this.timer = undefined;
    if (this.closed || !this.automatic || !this.resumed || !this.activeIds.size) return;
    const time = this.clock(); let wake = time + LIMITS.maxIntervalSeconds * 1000;
    for (const [origin, ready] of this.originReady) if (ready <= time && ![...this.running.values()].some(running => running.origin === origin)) this.originReady.delete(origin);
    for (const jobId of this.activeIds) {
      const job = (await this.store.get<MonitoringJob>(MONITORING_DOCUMENT, jobId)); if (!job || job.status !== 'active') continue;
      wake = Math.min(wake, Date.parse(job.expiresAt));
      if (this.running.has(job.id)) continue;
      const origin = publicMonitoringUrl(job.config.url).origin;
      const busy = this.running.size >= LIMITS.concurrentFetches || [...this.running.values()].some(running => running.origin === origin);
      wake = Math.min(wake, Math.max(Date.parse(job.health.nextPollAt ?? job.expiresAt), Date.parse(job.pollLeaseUntil ?? '') || 0, this.originReady.get(origin) ?? 0, busy ? time + 1000 : time + 1));
    }
    this.store.afterCommit(() => { if (this.closed) return; if(this.timer)clearTimeout(this.timer); this.timer = setTimeout(() => { this.timer=undefined; void this.runDue().catch(() => this.arm()).catch(() => {}); }, Math.max(1,wake-this.clock())); this.timer.unref(); });
  }

  /** Stop this process, not the durable jobs. Restart may resume within their existing finite lifetime. */
  async close(): Promise<void> {
    if (this.closed) return; this.closed = true;
    if (this.timer) clearTimeout(this.timer); this.timer = undefined;
    await this.dispatch;
    const running = [...this.running.entries()]; for (const [, poll] of running) poll.controller.abort();
    await Promise.allSettled(running.map(([, poll]) => poll.promise));
    for (const [jobId, poll] of running) {
      const job = (await this.store.get<MonitoringJob>(MONITORING_DOCUMENT, jobId));
      if (job?.status === 'active' && job.pollToken === poll.token) {
        delete job.pollToken; delete job.pollLeaseUntil;
        job.health.nextPollAt = iso(Math.max(this.clock(), (Date.parse(job.lastAttemptAt ?? '') || 0) + job.config.intervalSeconds * 1000));
        (await this.store.put(MONITORING_DOCUMENT, job));
      }
    }
    this.running.clear(); this.activeIds.clear();
  }
}
