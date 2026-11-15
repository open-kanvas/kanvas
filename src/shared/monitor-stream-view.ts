import { z } from 'zod';

/** A display bound to one monitor stream. Rows come from the stream itself as
 * events arrive; the agent supplies only the binding and optional wording. */
export const monitorStreamDataSchema = z.object({
  streamId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).describe('A monitor stream of this session, from kanvas.monitor.stream.create.'),
  title: z.string().max(120).optional(),
  note: z.string().max(500).optional().describe('Your own annotation above the rows; patch it at /data/note.'),
  limit: z.number().int().min(10).max(200).default(100).describe('Newest events shown.'),
}).strict();
export type MonitorStreamData = z.infer<typeof monitorStreamDataSchema>;

/** The write-only stream address. Anything that looks like one is removed from
 * event content on arrival and again before it is shown. */
const STREAM_ADDRESS = /\/in\/[A-Za-z0-9_-]{16,}/g;
export const REDACTED_STREAM_ADDRESS = '/in/[redacted]';
export function redactStreamAddress<T>(value: T, depth = 0): T {
  if (typeof value === 'string') return value.replace(STREAM_ADDRESS, REDACTED_STREAM_ADDRESS) as T;
  if (!value || typeof value !== 'object' || depth > 12) return value;
  if (Array.isArray(value)) return value.map(item => redactStreamAddress(item, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) out[redactStreamAddress(key)] = redactStreamAddress(item, depth + 1);
  return out as T;
}

export interface StreamViewEvent { seq: number; receivedAt: string; source?: string; text?: string; data?: unknown }
export type StreamState = 'active' | 'expired' | 'revoked' | 'ended';
export interface StreamViewStatus { streamId: string; name?: string; state: StreamState; expiresAt?: string; endedAt?: string; lastEventAt?: string; received: number; dropped: number; rejected: number; buffered: number; sources: string[] }
export type StreamRowStatus = 'event' | 'running' | 'completed' | 'failed' | 'unknown';
export interface StreamRow {
  key: string; seq: number; source: string; event: string; tool: string; target: string; note: string;
  /** The reporter's own clock when it sent one, otherwise when Kanvas received the event. */
  at: string; receivedAt: string;
  /** Whole seconds between the reporter's timestamp and receipt, when both are known and they differ. */
  lagSeconds?: number;
  status: StreamRowStatus; durationMs?: number;
}

const text = (value: unknown, max = 400): string => typeof value === 'string' ? value.slice(0, max) : typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
const first = (fields: Record<string, unknown>, keys: string[], max?: number): string => { for (const key of keys) { const found = text(fields[key], max); if (found) return found; } return ''; };
const START = /^(pretooluse|pre_tool_use|start|started|begin)$/i, END_OK = /^(posttooluse|post_tool_use|end|ended|finish|finished|done|completed|success)$/i, END_FAIL = /^(posttoolusefailure|post_tool_use_failure|error|failed|failure)$/i;

/** Deterministic rows from raw events, newest first. A start and its end for the
 * same call become one row with a duration. A start whose reporter has since
 * sent something else, or whose stream has ended, is shown as outcome unknown:
 * a missing end is information, never silently treated as success. */
export function streamRows(events: StreamViewEvent[], active = true): StreamRow[] {
  const ordered = [...events].sort((a, b) => a.seq - b.seq), rows: StreamRow[] = [], open = new Map<string, StreamRow[]>(), lastSeq = new Map<string, number>();
  for (const event of ordered) {
    const fields = event.data && typeof event.data === 'object' && !Array.isArray(event.data) ? event.data as Record<string, unknown> : {};
    const source = text(event.source, 80) || first(fields, ['source', 'name'], 80), name = first(fields, ['event', 'hook_event_name', 'type', 'status'], 80), tool = first(fields, ['tool', 'tool_name'], 120);
    const target = first(fields, ['target', 'command', 'file', 'path', 'file_path', 'url']), callId = first(fields, ['callId', 'call_id', 'tool_use_id', 'id'], 120);
    const stated = first(fields, ['timestamp', 'time', 'at'], 40), statedMs = stated ? Date.parse(stated) : NaN, receivedMs = Date.parse(event.receivedAt);
    const at = Number.isFinite(statedMs) ? new Date(statedMs).toISOString() : event.receivedAt, atMs = Date.parse(at);
    const lag = Number.isFinite(statedMs) && Number.isFinite(receivedMs) ? Math.round((receivedMs - statedMs) / 1000) : 0;
    const note = event.text !== undefined ? event.text.slice(0, 600) : first(fields, ['note', 'message', 'summary', 'text', 'detail'], 600) || (!name && !tool ? JSON.stringify(event.data ?? '').slice(0, 600) : '');
    lastSeq.set(source, event.seq);
    const pairKey = callId ? `${source}\u0000id\u0000${callId}` : `${source}\u0000${tool}\u0000${target}`;
    if (tool && (END_OK.test(name) || END_FAIL.test(name))) {
      const waiting = open.get(pairKey), started = waiting?.pop();
      if (started) {
        started.status = END_FAIL.test(name) ? 'failed' : 'completed'; started.durationMs = Math.max(0, atMs - Date.parse(started.at));
        if (note && !started.note) started.note = note;
        started.seq = event.seq; started.event = `${started.event} → ${name}`;
        continue;
      }
    }
    const row: StreamRow = { key: `e${event.seq}`, seq: event.seq, source, event: name, tool, target, note, at, receivedAt: event.receivedAt, ...(Math.abs(lag) >= 2 ? { lagSeconds: lag } : {}), status: 'event' };
    if (tool && START.test(name)) { row.status = 'running'; const waiting = open.get(pairKey) ?? []; waiting.push(row); open.set(pairKey, waiting); }
    else if (tool && END_FAIL.test(name)) row.status = 'failed';
    else if (tool && END_OK.test(name)) row.status = 'completed';
    rows.push(row);
  }
  // A start is still running only while it is the last thing its source reported on a live stream.
  for (const waiting of open.values()) for (const row of waiting) if (!active || (lastSeq.get(row.source) ?? row.seq) > row.seq) row.status = 'unknown';
  return rows.sort((a, b) => b.seq - a.seq);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds - minutes * 60)} s`;
}
