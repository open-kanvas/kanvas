import { testDatabase, removeTestDatabase } from '../postgres.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { expect, vi } from 'vitest';
import { createApp } from '../../src/server/app.js';
import type { AssetRecord, DatasetSummary, DisplayRecord, InteractionRecord, InterpretationInput, InterpretationResult, Interpreter, SessionRecord, UpdateRecord, ViewSpec } from '../../src/shared/types.js';

export const ORIGIN = 'http://127.0.0.1';
export const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=';
export const fact = (text: string): ViewSpec => ({ version: 1, template: 'fact', data: { text } });
export interface User { id: string; username: string; displayName: string }
export interface Detail {
  session: SessionRecord; displays: DisplayRecord[]; members: { userId: string; role: string }[];
  updates: UpdateRecord[]; interactions: InteractionRecord[]; datasets: DatasetSummary[]; assets: AssetRecord[];
}
export interface ApiResult<T> { status: number; headers: Headers; data?: T; error?: { code: string; message: string }; text: string }
export interface RequestOptions { csrf?: string | null; origin?: string | null; headers?: HeadersInit; signal?: AbortSignal; redirect?: RequestRedirect }

export function success<T>(result: ApiResult<T>): T {
  expect(result.status, result.error?.code ?? 'HTTP request').toBeGreaterThanOrEqual(200);
  expect(result.status, result.error?.code ?? 'HTTP request').toBeLessThan(300);
  expect(result.error).toBeUndefined();
  if (result.status === 204) return undefined as T;
  if (result.data === undefined) throw new Error('Expected the documented JSON data envelope.');
  return result.data;
}

export function denied(result: ApiResult<unknown>, statuses: number[] = [403, 404]): void {
  expect(statuses).toContain(result.status);
  expect(result.data).toBeUndefined();
  expect(result.error?.code).toEqual(expect.any(String));
  expect(result.error?.message).toEqual(expect.any(String));
  expect(result.text.length).toBeLessThan(2000);
}

export class Browser {
  readonly cookies = new Map<string, string>();
  csrf?: string;
  user?: User;
  constructor(readonly baseUrl: string) {}

  headers(options: RequestOptions = {}): Headers {
    const headers = new Headers({ host: '127.0.0.1', ...Object.fromEntries(new Headers(options.headers)) });
    if (this.cookies.size) headers.set('cookie', [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    const csrf = options.csrf === undefined ? this.csrf : options.csrf;
    if (csrf !== undefined && csrf !== null) headers.set('X-Kanvas-CSRF', csrf);
    if (options.origin !== null) headers.set('origin', options.origin ?? ORIGIN);
    return headers;
  }

  async raw(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<Response> {
    const headers = this.headers(options);
    for (const [key, value] of new Headers(init.headers)) headers.set(key, value);
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers, signal: options.signal ?? AbortSignal.timeout(5000), redirect: options.redirect ?? 'manual' });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0], equal = pair.indexOf('=');
      if (equal < 0) continue;
      const name = pair.slice(0, equal), value = pair.slice(equal + 1);
      if (/max-age=0(?:;|$)/i.test(cookie) || !value) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }

  async request<T = unknown>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<ApiResult<T>> {
    const response = await this.raw(path, { method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) }, options);
    const text = await response.text();
    let payload: { data?: T; error?: { code: string; message: string } } = {};
    try { payload = JSON.parse(text); } catch { /* Assertions expose a non-JSON protocol failure without logging credentials. */ }
    return { status: response.status, headers: response.headers, text, ...payload };
  }

  async register(): Promise<User> {
    const username = `test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
    // Only ephemeral test identities; no deployment credentials or provider access.
    const password = randomBytes(24).toString('base64url');
    success(await this.request('POST', '/api/auth/register', { username, password, displayName: `Test ${username}` }));
    const me = success(await this.request<{ user: User; csrfToken: string }>('GET', '/api/auth/me'));
    this.user = me.user; this.csrf = me.csrfToken;
    return me.user;
  }

  async session(name = 'Acceptance session'): Promise<SessionRecord> {
    return success(await this.request<SessionRecord>('POST', '/api/sessions', { name,initialDisplay:false }));
  }

  async display(sessionId: string, name = 'Test display', width = 1200, height = 800): Promise<DisplayRecord> {
    return success(await this.request<DisplayRecord>('POST', `/api/sessions/${sessionId}/displays`, { name, width, height, pixelRatio: 1 }));
  }

  async detail(sessionId: string): Promise<Detail> {
    return success(await this.request<Detail>('GET', `/api/sessions/${sessionId}`));
  }

  async settle(sessionId: string, requestId: string): Promise<{ detail: Detail; update: UpdateRecord }> {
    let detail: Detail | undefined, update: UpdateRecord | undefined;
    await vi.waitFor(async () => {
      detail = await this.detail(sessionId);
      update = detail.updates.find(item => item.requestId === requestId);
      expect(update).toBeDefined();
      expect(['accepted', 'rendering']).not.toContain(update!.status);
    }, { timeout: 4000, interval: 10 });
    return { detail: detail!, update: update! };
  }

  async submit(sessionId: string, displayIds: string[], view: ViewSpec, requestId: string = randomUUID()): Promise<{ detail: Detail; update: UpdateRecord }> {
    success(await this.request<UpdateRecord>('POST', `/api/sessions/${sessionId}/submit`, { requestId, displayIds, view }));
    return this.settle(sessionId, requestId);
  }
}

export async function startHarness(options: Parameters<typeof createApp>[0] = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'kanvas-core-'));
  const database = options?.database ?? testDatabase();
  // The existing flat-name regression suite is retained as the legacy gate.
  // Public-interface tests explicitly opt into twelve (the production default).
  const runtime = await createApp({ database, publicUrl: ORIGIN, mcpProfile: 'legacy', ...options });
  const server: Server = await new Promise((resolve, reject) => {
    const listener = runtime.app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No loopback test listener.');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  let stopped = false, closed = false;
  async function shutdown() {
    if (stopped) return; stopped = true;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await runtime.close();
  }
  return {
    runtime, server, baseUrl, database,
    browser: () => new Browser(baseUrl),
    async account() { const browser = new Browser(baseUrl); await browser.register(); return browser; },
    shutdown,
    async close() {
      if (closed) return; closed = true;
      await shutdown();
      await removeTestDatabase(database);
      await rm(directory, { recursive: true, force: true });
    },
  };
}
export type Harness = Awaited<ReturnType<typeof startHarness>>;

/** Resolve selected calls to exercise actual domain ordering, not timer luck. */
export class ControlledInterpreter implements Interpreter {
  readonly calls: { input: InterpretationInput; resolve: (result: InterpretationResult) => void; reject: (error: Error) => void }[] = [];
  interpret(input: InterpretationInput): Promise<InterpretationResult> {
    return new Promise((resolve, reject) => this.calls.push({ input: structuredClone(input), resolve, reject }));
  }
  async waitFor(count: number): Promise<void> {
    await vi.waitFor(() => expect(this.calls).toHaveLength(count), { timeout: 2000, interval: 10 });
  }
  releaseAll(): void { for (const call of this.calls) call.resolve({ action: 'retain' }); }
}
