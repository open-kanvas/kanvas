import { z } from 'zod';
import { TEMPLATE_IDS, type TemplateId } from './types.js';
import { isSafeUrl } from './urls.js';

/** Public polling is an explicitly owned, finite session resource, not a template. */
export const MONITORING_LIMITS = {
  minIntervalSeconds: 30, maxIntervalSeconds: 3600, defaultIntervalSeconds: 60,
  minDurationSeconds: 60, maxDurationSeconds: 7 * 86400, defaultDurationSeconds: 86400,
  timeoutMs: 10_000, maxTimeoutMs: 15_000, maxRedirects: 2,
  jsonBytes: 512 * 1024, imageBytes: 2 * 1024 * 1024, mappingBytes: 64 * 1024,
  jsonDepth: 20, jsonNodes: 20_000, arrayItems: 1000, objectKeys: 128,
  mappingDepth: 16, mappingNodes: 4000, activePerSession: 4, activeTotal: 32,
  recordsPerSession: 64, recordsTotal: 512, requestsPerJob: 64,
  concurrentFetches: 4, originGapMs: 5000, maxBackoffMs: 15 * 60_000,
} as const;

export type MonitoringJson = null | boolean | number | string | MonitoringJson[] | { [key: string]: MonitoringJson };
/** JSON Pointer paths are relative to the current item; root:true selects the response root. */
export type MonitoringExpression = MonitoringJson
  | { $path: string; root?: boolean }
  | { $each: string; map: MonitoringExpression; root?: boolean }
  | { $literal: MonitoringJson }
  | MonitoringExpression[]
  | { [key: string]: MonitoringExpression | undefined };

const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);
const credentialKey = /^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|api[_-]?key|key|secret|client[_-]?secret|password|passwd|pass|authorization|auth|bearer|credential|credentials|signature|sig|session|sessionid|jwt|x-amz-.+|x-goog-.+)$/i;
/** DNS/IP checks are additionally mandatory in the server transport, before every connection. */
export function isMonitoringUrl(value: string): boolean {
  if (!isSafeUrl(value) || /[\u0000-\u0020\u007f\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (!url.port || url.port === '443') && !url.username && !url.password && !url.hash
      && [...url.searchParams.keys()].every(key => !credentialKey.test(key));
  } catch { return false; }
}

export function monitoringPointer(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 1000 || value !== '' && !value.startsWith('/')) return false;
  if (/~(?![01])/u.test(value)) return false;
  return value.split('/').slice(1).every(part => !forbiddenKeys.has(part.replaceAll('~1', '/').replaceAll('~0', '~')));
}

/** Validate before recursive Zod/template work. No expressions, functions, coercion, or key synthesis. */
export function assertMonitoringMapping(value: unknown): asserts value is MonitoringExpression {
  let nodes = 0, bytes = 0;
  const visit = (item: unknown, depth: number, literal = false): void => {
    if (++nodes > MONITORING_LIMITS.mappingNodes || depth > MONITORING_LIMITS.mappingDepth) throw new Error('Mapping exceeds its size or depth limit.');
    if (item === null || typeof item === 'boolean') { bytes += 5; return; }
    if (typeof item === 'number') { if (!Number.isFinite(item) || Object.is(item, -0) || Number.isInteger(item) && !Number.isSafeInteger(item)) throw new Error('Use strings for numbers requiring greater precision.'); bytes += 32; return; }
    if (typeof item === 'string') { bytes += new TextEncoder().encode(item).length + 2; return; }
    if (!item || typeof item !== 'object' || Object.getPrototypeOf(item) !== Object.prototype && !Array.isArray(item) && Object.getPrototypeOf(item) !== null) throw new Error('Mapping must be declarative JSON.');
    if (Array.isArray(item)) {
      if (item.length > MONITORING_LIMITS.arrayItems) throw new Error('Mapping array exceeds its item limit.');
      bytes += item.length + 2;
      for (const child of item) visit(child, depth + 1, literal);
      return;
    }
    const object = item as Record<string, unknown>, keys = Object.keys(object);
    if (keys.length > MONITORING_LIMITS.objectKeys || keys.some(key => forbiddenKeys.has(key))) throw new Error('Mapping contains reserved or excessive object fields.');
    bytes += keys.reduce((sum, key) => sum + new TextEncoder().encode(key).length + 4, 2);
    if (!literal && keys.some(key => key.startsWith('$'))) {
      if ('$path' in object) {
        if (!monitoringPointer(object.$path) || keys.some(key => !['$path', 'root'].includes(key)) || object.root !== undefined && typeof object.root !== 'boolean') throw new Error('Use {$path:"/field",root?:true} with an exact JSON Pointer.');
        visit(object.$path, depth + 1); return;
      }
      if ('$each' in object) {
        if (!monitoringPointer(object.$each) || !Object.hasOwn(object, 'map') || keys.some(key => !['$each', 'map', 'root'].includes(key)) || object.root !== undefined && typeof object.root !== 'boolean') throw new Error('Use {$each:"/items",map:{...},root?:true}.');
        visit(object.$each, depth + 1); visit(object.map, depth + 1); return;
      }
      if ('$literal' in object && keys.length === 1) { visit(object.$literal, depth + 1, true); return; }
      throw new Error('Only $path, $each, and $literal mapping operators are supported.');
    }
    for (const child of Object.values(object)) visit(child, depth + 1, literal);
  };
  visit(value, 0);
  if (bytes > MONITORING_LIMITS.mappingBytes) throw new Error('Mapping exceeds its byte limit.');
}

const identifier = z.string().min(1).max(128);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const base = {
  url: z.string().max(2048).refine(isMonitoringUrl, 'Use a public HTTPS URL on port 443, without credentials, authentication query parameters, or a fragment.')
    .meta({ pattern: '^[Hh][Tt][Tt][Pp][Ss]:', 'x-kanvas-validation': 'public-https', description: 'Public HTTPS on port 443 only: no credentials, authentication query parameters, or fragment. The server additionally checks parsed URL, DNS/IP, redirects and network limits before every connection.' }),
  intervalSeconds: z.number().int().min(MONITORING_LIMITS.minIntervalSeconds).max(MONITORING_LIMITS.maxIntervalSeconds).default(MONITORING_LIMITS.defaultIntervalSeconds),
  durationSeconds: z.number().int().min(MONITORING_LIMITS.minDurationSeconds).max(MONITORING_LIMITS.maxDurationSeconds).default(MONITORING_LIMITS.defaultDurationSeconds),
  title: z.string().min(1).max(200).optional(),
};
const mappingSchema = z.unknown().superRefine((value, ctx) => {
  try { assertMonitoringMapping(value); } catch { ctx.addIssue({ code: 'custom', message: 'Supply a bounded declarative mapping using literal JSON, $path JSON Pointers, or $each/map. Scripts, reserved keys, and imprecise numbers are unsupported.' }); }
}).meta({ 'x-kanvas-validation': 'monitor-mapping', description: 'Bounded declarative JSON using literal values, {$path:"/field",root?:true}, {$each:"/items",map:{...},root?:true}, or {$literal:value}. Server enforces depth 16, 4000 nodes, 64 KiB estimated size, safe scalar precision and reserved-key/pointer rules. This is data, never executable code.' });
export const monitoringConfigSchema = z.discriminatedUnion('mode', [
  z.object({ ...base, mode: z.literal('uptime'), template: z.enum(['fact', 'number']).default('fact'), metric: z.enum(['status', 'latency', 'http-status']).default('status'), degradedAfterMs: z.number().int().min(100).max(60_000).default(1500) }).strict(),
  z.object({ ...base, mode: z.literal('json'), template: z.enum(TEMPLATE_IDS), mapping: mappingSchema }).strict(),
  z.object({ ...base, mode: z.literal('image'), alt: z.string().max(500).default('Live snapshot'), caption: z.string().max(500).optional() }).strict(),
]);
export type MonitoringConfig = z.infer<typeof monitoringConfigSchema>;
export const monitoringStartSchema = z.object({ sessionId: identifier, displayId: identifier, requestId: identifier, expectedRevision: revision.optional(), config: monitoringConfigSchema }).strict();
export const monitoringReadSchema = z.object({ sessionId: identifier, jobId: identifier.optional() }).strict();
export const monitoringUpdateSchema = z.object({ sessionId: identifier, jobId: identifier, requestId: identifier, expectedVersion: revision.optional(), config: monitoringConfigSchema }).strict();
export const monitoringStopSchema = z.object({ sessionId: identifier, jobId: identifier, requestId: identifier, expectedVersion: revision.optional() }).strict();

/** Inbound samples use the existing authenticated MCP connection, never a
 * public webhook secret or an outbound polling credential. */
export const livePushSchema = z.object({
  sessionId: identifier, displayId: identifier, requestId: identifier, expectedRevision: revision.optional(),
  data: z.record(z.string(), z.unknown()).describe('Complete replacement data for the current number, gauge, line, area, bar or heatmap. Send the producer’s bounded current sample/window; no expression evaluation or generated values.'),
}).strict();

export type MonitoringStopReason = 'user' | 'expired' | 'superseded' | 'authorization-lost' | 'session-ended' | 'resource-limit';
export interface MonitoringHealth {
  jobId: string;
  status: 'starting' | 'healthy' | 'stale' | 'stopped';
  checkedAt?: string;
  lastSuccessAt?: string;
  nextPollAt?: string;
  expiresAt: string;
  consecutiveFailures: number;
  statusCode?: number;
  latencyMs?: number;
  targetState?: 'up' | 'degraded' | 'down' | 'unknown';
  errorCode?: string;
  message?: string;
  stoppedReason?: MonitoringStopReason;
}
export interface MonitoringSummary {
  id: string;
  sessionId: string;
  displayId: string;
  ownerId: string;
  version: number;
  status: 'active' | 'stopped';
  config: MonitoringConfig;
  template: TemplateId;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  health: MonitoringHealth;

}
