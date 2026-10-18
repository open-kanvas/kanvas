import {diagnostic,diagnosticsAuthenticated} from './frontend-diagnostics';
import {diagnosticRoute} from '../shared/frontend-diagnostics';
import type { AssetRecord, DatasetSummary, DisplayRecord, InteractionRecord, Role, SessionRecord, UpdateRecord, ViewSpec } from '../shared/types';
import { isSafeUrl } from '../shared/view-schemas';

export interface User { id: string; username: string; displayName: string; avatarUrl?:string }
export interface Member { userId: string; id?: string; username: string; displayName?: string; role: Role }
export interface SessionDetail {
  session: SessionRecord;
  displays: DisplayRecord[];
  members: Member[];
  updates: UpdateRecord[];
  interactions: InteractionRecord[];
  datasets: DatasetSummary[];
  assets: AssetRecord[];
}
export interface PresentationRecord { id: string; name: string; slides: ViewSpec[]; createdAt?: string }
export interface TokenRecord { id: string; name: string; createdAt: string; lastUsedAt?: string; scopes?: string[]; sessionIds?: string[]; accessMode?: 'account'|'selected'; refreshable?: boolean; refreshExpiresAt?: number; reconnectRequired?: boolean; status?: 'active'|'expired' }
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'ApiError'; }
}

let csrfToken = '';
export function setCsrfToken(value: string, accountDiagnostics = false) { csrfToken = value; diagnosticsAuthenticated(accountDiagnostics ? value : ''); }

export async function api<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = options.method ?? 'GET';
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: options.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' && csrfToken ? { 'X-Kanvas-CSRF': csrfToken } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    diagnostic({event:'request',route:diagnosticRoute(path),status:0});
    throw new ApiError(0, 'offline', 'Connection interrupted. Your last saved content is unchanged.');
  }
  diagnostic({event:'request',route:diagnosticRoute(path),status:response.status});
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null) as { data?: T; error?: { code?: string; message?: string } } | null;
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new Event('kanvas:signout'));
    throw new ApiError(response.status, payload?.error?.code ?? 'request_failed', payload?.error?.message ?? `Request failed (${response.status}).`);
  }
  if (!payload || !('data' in payload)) throw new ApiError(response.status, 'invalid_response', 'The service returned an unexpected response.');
  return payload.data as T;
}

export const requestId = () => crypto.randomUUID();
export const sessionPath = (id: string) => `/api/sessions/${encodeURIComponent(id)}`;
export const displayPath = (sessionId: string, displayId: string) => `${sessionPath(sessionId)}/displays/${encodeURIComponent(displayId)}`;
export const viewerPath = (sessionId: string, displayId: string) => `/view/${encodeURIComponent(sessionId)}/${encodeURIComponent(displayId)}`;
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Something went wrong. Please try again.'; }

/** Content URLs must never become executable navigation. Asset URLs remain same-origin. */
export function safeUrl(value: unknown, asset = false): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  if (asset && /^\/api\/(?:assets\/|media\/|public\/sessions\/[A-Za-z0-9_-]{1,128}\/assets\/)[a-zA-Z0-9_-]{1,128}$/.test(value)) return value;
  if (!isSafeUrl(value)) return undefined;
  try {
    const url = new URL(value);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return undefined;
    return url.href;
  } catch { return undefined; }
}

/** Only approved asset routes may be relative. Do not resolve arbitrary relative navigation. */
export function sourceLabel(value: string): string {
  const url = safeUrl(value, true);
  if (!url) return 'Source';
  return url.startsWith('/api/') ? 'Protected document' : new URL(url).hostname.replace(/^www\./, '');
}

export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.replace(/[^a-zA-Z0-9._-]/g, '-') || 'kanvas'}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
