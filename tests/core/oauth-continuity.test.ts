import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { Client, StreamableHTTPClientTransport, type OAuthClientProvider } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_LIMITS } from '../../src/server/access-flows.js';
import { hash, type OAuthAccessCredential, type OAuthRefreshCredential, type Token } from '../../src/server/auth.js';
import type { InteractionRecord, SessionRecord, UpdateRecord } from '../../src/shared/types.js';
import { ORIGIN, denied, fact, startHarness, success, type Browser, type Harness } from './harness.js';

const CALLBACK = 'http://127.0.0.1:41357/callback';
const RESOURCE = `${ORIGIN}/mcp`;
const DAY = 86400_000;
interface Registered { client_id: string; grant_types: string[]; token_endpoint_auth_method: 'none' }
interface Issued { access_token: string; refresh_token?: string; token_type: string; expires_in: number; scope: string }
interface TokenResult { status: number; headers: Headers; body: Partial<Issued> & { error?: string } }

async function registerClient(h: Harness, grantTypes = ['authorization_code', 'refresh_token']): Promise<Registered> {
  const response = await h.browser().raw('/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    client_name: 'OAuth continuity acceptance', redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none', grant_types: grantTypes,
  }) });
  expect(response.status).toBe(201);
  return await response.json() as Registered;
}
async function begin(h: Harness, client: Registered, scope = 'read publish') {
  const verifier = randomBytes(32).toString('base64url');
  const response = await h.browser().raw(`/oauth/authorize?${new URLSearchParams({
    response_type: 'code', client_id: client.client_id, redirect_uri: CALLBACK, resource: RESOURCE, scope,
    code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'), state: randomUUID(),
  })}`);
  expect(response.status).toBe(303);
  const requestId = new URL(response.headers.get('location')!).searchParams.get('authorize');
  await response.arrayBuffer(); expect(typeof requestId).toBe('string');
  return { requestId: requestId!, verifier };
}
async function tokenRequest(h: Harness, body: Record<string, unknown>, json = false): Promise<TokenResult> {
  const response = await h.browser().raw('/oauth/token', {
    method: 'POST', headers: { 'content-type': json ? 'application/json' : 'application/x-www-form-urlencoded' },
    body: json ? JSON.stringify(body) : new URLSearchParams(Object.entries(body).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])).toString(),
  });
  return { status: response.status, headers: response.headers, body: await response.json() as TokenResult['body'] };
}
function issued(result: TokenResult, refreshable = true): Issued {
  expect(result.status).toBe(200);
  expect(typeof result.body.access_token).toBe('string');
  expect(typeof result.body.refresh_token).toBe(refreshable ? 'string' : 'undefined');
  expect(result.body.token_type).toBe('Bearer');
  expect(result.headers.get('cache-control')).toBe('no-store');
  return result.body as Issued;
}
function invalid(result: TokenResult, error = 'invalid_grant') {
  expect(result.status).toBe(400); expect(result.body.error).toBe(error);
  expect(result.body.access_token === undefined && result.body.refresh_token === undefined).toBe(true);
}
function refresh(h: Harness, client: Registered, credential: string, extra: Record<string, unknown> = {}) {
  return tokenRequest(h, { grant_type: 'refresh_token', client_id: client.client_id, resource: RESOURCE, refresh_token: credential, ...extra });
}
async function approve(h: Harness, owner: Browser, client: Registered, pending: Awaited<ReturnType<typeof begin>>, sessionIds?: string[]) {
  const result = success(await owner.request<{ redirectUri: string }>('POST', '/api/oauth/approve', {
    requestId: pending.requestId, approve: true, ...(sessionIds ? { sessionIds } : { accessMode: 'account' }),
  }));
  const code = new URL(result.redirectUri).searchParams.get('code');
  expect(typeof code).toBe('string');
  return tokenRequest(h, { grant_type: 'authorization_code', client_id: client.client_id, redirect_uri: CALLBACK, resource: RESOURCE, code, code_verifier: pending.verifier });
}
async function connection(h: Harness, owner: Browser, sessionIds?: string[], scope = 'read publish', client?: Registered) {
  client ??= await registerClient(h);
  const pending = await begin(h, client, scope);
  return { client, tokens: issued(await approve(h, owner, client, pending, sessionIds), client.grant_types.includes('refresh_token')) };
}
async function bearerStatus(h: Harness, bearer: string) {
  const response = await h.browser().raw('/mcp', { method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({
    jsonrpc: '2.0', id: randomUUID(), method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'credential-status-check', version: '1' } },
  }) });
  await response.arrayBuffer(); return response.status;
}
async function call(h: Harness, bearer: string, name: string, args: Record<string, unknown> = {}) {
  const client = new Client({ name: 'oauth-scope-check', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', h.baseUrl), { requestInit: { headers: { Authorization: `Bearer ${bearer}` } } }));
    return await client.callTool({ name, arguments: args });
  } finally { await client.close(); }
}
function data<T>(result: unknown): T {
  const envelope = result as { isError?: boolean; structuredContent?: unknown };
  expect(envelope.isError).not.toBe(true);
  expect(Boolean(envelope.structuredContent && typeof envelope.structuredContent === 'object' && 'data' in envelope.structuredContent)).toBe(true);
  return (envelope.structuredContent as Record<string, unknown>).data as T;
}

describe('OAuth refresh continuity and explicit account consent', () => {
  let h: Harness;
  beforeEach(async () => { h = await startHarness(); });
  afterEach(async () => { vi.restoreAllMocks(); await h?.close(); });

  it('requires explicit account consent, connects a new account with Home, and dynamically follows actual membership', async () => {
    const owner = await h.account(), other = await h.account(), foreign = await other.session('Other account private');
    const client = await registerClient(h), pending = await begin(h, client);
    denied(await owner.request('POST', '/api/oauth/approve', { requestId: pending.requestId, approve: true, sessionIds: [] }), [400]);
    denied(await owner.request('POST', '/api/oauth/approve', { requestId: pending.requestId, approve: true, accessMode: 'account' }, { csrf: null }), [403]);
    denied(await owner.request('POST', '/api/oauth/approve', { requestId: pending.requestId, approve: true, accessMode: 'account', sessionIds: [foreign.id] }), [400]);
    const tokens = issued(await approve(h, owner, client, pending));
    const home = success(await owner.request<SessionRecord[]>('GET', '/api/sessions'));
    expect(home).toHaveLength(1); expect(home[0].name).toBe('Home');
    expect(data<SessionRecord[]>(await call(h, tokens.access_token, 'kanvas_sessions_list'))).toEqual(home);
    const created = data<SessionRecord>(await call(h, tokens.access_token, 'kanvas_session_create', { name: 'Created through MCP' }));
    expect(created.ownerId).toBe(owner.user!.id);
    expect(data<SessionRecord[]>(await call(h, tokens.access_token, 'kanvas_sessions_list')).map(item => item.id).sort()).toEqual([home[0].id, created.id].sort());
    expect((await call(h, tokens.access_token, 'kanvas_session_state', { sessionId: foreign.id })).isError).toBe(true);
    success(await other.request('POST', `/api/sessions/${foreign.id}/members`, { username: owner.user!.username, role: 'viewer' }));
    expect(data<SessionRecord[]>(await call(h, tokens.access_token, 'kanvas_sessions_list')).map(item => item.id)).toContain(foreign.id);
    expect((await call(h, tokens.access_token, 'kanvas_display_register', { sessionId: foreign.id, name: 'Not an editor', width: 800, height: 600 })).isError).toBe(true);
    success(await other.request('DELETE', `/api/sessions/${foreign.id}/members/${owner.user!.id}`));
    expect((await call(h, tokens.access_token, 'kanvas_session_state', { sessionId: foreign.id })).isError).toBe(true);
    expect(success(await owner.request<Record<string, unknown>[]>('GET', '/api/tokens'))[0]).toMatchObject({ accessMode: 'account', refreshable: true, reconnectRequired: false, status: 'active' });
  });

  it.each(['modern', 'legacy'] as const)('renews an expired credential transparently with the real %s SDK, preserving identity, retries and inbox', async profile => {
    const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
    const original = await connection(h, owner, [session.id]);
    const oldPrincipal = (await h.runtime.auth.authorize({ get: () => `Bearer ${original.tokens.access_token}` } as unknown as Request));
    let tokens: NonNullable<Awaited<ReturnType<OAuthClientProvider['tokens']>>> = { ...original.tokens, issuer: ORIGIN };
    let renewals = 0, redirects = 0;
    const provider: OAuthClientProvider = {
      redirectUrl: CALLBACK,
      clientMetadata: { redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], scope: 'read publish' },
      clientInformation: () => ({ ...original.client, issuer: ORIGIN }),
      tokens: () => tokens,
      saveTokens: value => { tokens = value; renewals++; },
      redirectToAuthorization: () => { redirects++; throw new Error('Interactive authorization is not expected during refresh.'); },
      saveCodeVerifier: () => { throw new Error('A refresh must not initiate PKCE consent.'); },
      codeVerifier: () => { throw new Error('A refresh must not reuse an authorization code.'); },
      validateResourceURL: async (server, resource) => {
        expect(new URL(server).origin).toBe(h.baseUrl); expect(resource).toBe(RESOURCE); return new URL(RESOURCE);
      },
    };
    // The harness has a dynamic loopback port but advertises a fixed loopback
    // issuer. Route only those two fixture authorities; no network is mocked.
    const routedFetch: typeof fetch = async (input, init) => {
      const request = new Request(input, init), url = new URL(request.url);
      if (![ORIGIN, h.baseUrl].includes(url.origin)) throw new Error('Unexpected test authority.');
      return fetch(new URL(url.pathname + url.search, h.baseUrl), {
        method: request.method, headers: request.headers, signal: request.signal,
        ...(request.method !== 'GET' && request.method !== 'HEAD' ? { body: await request.text() } : {}),
      });
    };
    const sdk = profile === 'modern'
      ? new Client({ name: 'rotating-modern', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } })
      : new LegacyClient({ name: 'rotating-legacy', version: '1' });
    const transport = profile === 'modern'
      ? new StreamableHTTPClientTransport(new URL('/mcp', h.baseUrl), { authProvider: provider, fetch: routedFetch })
      : new LegacyTransport(new URL('/mcp', h.baseUrl), { authProvider: provider, fetch: routedFetch });
    sdk.onerror = () => {};
    try {
      await sdk.connect(transport);
      const legacySessionId = transport.sessionId;
      const submission = { sessionId: session.id, displayIds: [display.id], requestId: 'renewal-idempotency', view: { ...fact('Continue this conversation'), actions: [{ id: 'next', kind: 'button', label: 'Next' }] } };
      const first = data<UpdateRecord>(await sdk.callTool({ name: 'kanvas_submit', arguments: submission }));
      const settled = await owner.settle(session.id, submission.requestId);
      const clicked = success(await owner.request<InteractionRecord>('POST', `/api/sessions/${session.id}/interactions`, {
        displayId: display.id, revision: settled.detail.displays[0].revision, actionId: 'next', value: true, requestId: 'before-refresh-click',
      }));
      const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 65 * 60_000);
      const retried = data<UpdateRecord>(await sdk.callTool({ name: 'kanvas_submit', arguments: submission }));
      expect(retried.id).toBe(first.id);
      const inbox = data<{ interactions: InteractionRecord[] }>(await sdk.callTool({ name: 'kanvas_interactions_read', arguments: { sessionId: session.id } }));
      expect(inbox.interactions.map(item => item.id)).toEqual([clicked.id]);
      expect(renewals).toBe(1); expect(redirects).toBe(0);
      expect(tokens.access_token !== original.tokens.access_token && tokens.refresh_token !== original.tokens.refresh_token).toBe(true);
      expect(transport.sessionId).toBe(legacySessionId);
      expect(await bearerStatus(h, original.tokens.access_token)).toBe(401);
      (await expect((async () => (await h.runtime.auth.assertCurrent(oldPrincipal, 'read', session.id)))()).rejects.toThrowError(/expired|revoked/));
      const row = (await h.runtime.store.list<Token>('token'))[0];
      expect(row.id).toBe(oldPrincipal.tokenId); expect(row.agentId).toBe(oldPrincipal.agentId); expect(row.sessionIds).toEqual([session.id]);
      expect((await h.runtime.store.list('token'))).toHaveLength(1);
      clock.mockReturnValue(Date.now() + 65 * 60_000);
      data(await sdk.callTool({ name: 'kanvas_sessions_list', arguments: {} }));
      expect(renewals).toBe(2); expect(redirects).toBe(0);
    } finally { await sdk.close(); }
  });

  it('binds refresh to its client, audience and prior scopes without consuming it on a rejected request', async () => {
    const owner = await h.account(), session = await owner.session(), otherClient = await registerClient(h);
    const current = await connection(h, owner, [session.id], 'read');
    invalid(await refresh(h, otherClient, current.tokens.refresh_token!));
    invalid(await refresh(h, current.client, current.tokens.refresh_token!, { resource: 'https://other.example/mcp' }), 'invalid_target');
    invalid(await refresh(h, current.client, current.tokens.refresh_token!, { scope: 'read publish' }), 'invalid_scope');
    invalid(await tokenRequest(h, { grant_type: 'refresh_token', client_id: current.client.client_id, refresh_token: current.tokens.refresh_token, accessMode: 'account' }, true), 'invalid_request');
    const next = issued(await refresh(h, current.client, current.tokens.refresh_token!, { resource: undefined }));
    expect(next.scope).toBe('read');
    expect((await call(h, next.access_token, 'kanvas_session_create', { name: 'Not allowed' })).isError).toBe(true);
    const newSession = await owner.session('Created after selected consent');
    expect((await call(h, next.access_token, 'kanvas_session_state', { sessionId: newSession.id })).isError).toBe(true);
    expect((await h.runtime.store.list<Token>('token'))[0].sessionIds).toEqual([session.id]);
  });

  it('allows downscoping but never restores removed refresh scopes or widens a selected-session grant', async () => {
    const owner = await h.account(), session = await owner.session(), current = await connection(h, owner, [session.id]);
    const narrowed = issued(await refresh(h, current.client, current.tokens.refresh_token!, { scope: 'read' }));
    expect(narrowed.scope).toBe('read');
    invalid(await refresh(h, current.client, narrowed.refresh_token!, { scope: 'read publish' }), 'invalid_scope');
    expect((await call(h, narrowed.access_token, 'kanvas_display_register', { sessionId: session.id, name: 'Not allowed', width: 800, height: 600 })).isError).toBe(true);
    // Previously issued access keeps its original, bounded authority until its
    // own expiry. Refreshing does not silently extend or replace that bearer.
    data(await call(h, current.tokens.access_token, 'kanvas_display_register', { sessionId: session.id, name: 'Original grant', width: 800, height: 600 }));
    const next = issued(await refresh(h, current.client, narrowed.refresh_token!));
    expect(next.scope).toBe('read');
    expect((await call(h, next.access_token, 'kanvas_session_create', { name: 'Not allowed' })).isError).toBe(true);
  });

  it('commits replay revocation of the entire family without revoking another connection', async () => {
    const owner = await h.account(), session = await owner.session(), original = await connection(h, owner, [session.id]);
    const separate = await connection(h, owner, [session.id], 'read publish', original.client);
    const next = issued(await refresh(h, original.client, original.tokens.refresh_token!));
    invalid(await refresh(h, original.client, original.tokens.refresh_token!));
    invalid(await refresh(h, original.client, next.refresh_token!));
    expect(await bearerStatus(h, original.tokens.access_token)).toBe(401);
    expect(await bearerStatus(h, next.access_token)).toBe(401);
    expect(await bearerStatus(h, separate.tokens.access_token)).toBe(200);
    expect(success(await owner.request<unknown[]>('GET', '/api/tokens'))).toHaveLength(1);
  });

  it('serializes simultaneous refreshes and rejects the winning credentials after reuse detection', async () => {
    const owner = await h.account(), session = await owner.session(), current = await connection(h, owner, [session.id]);
    const attempts = await Promise.all([
      refresh(h, current.client, current.tokens.refresh_token!), refresh(h, current.client, current.tokens.refresh_token!),
    ]);
    expect(attempts.map(item => item.status).sort()).toEqual([200, 400]);
    const winning = issued(attempts.find(item => item.status === 200)!);
    expect(await bearerStatus(h, winning.access_token)).toBe(401);
    invalid(await refresh(h, current.client, winning.refresh_token!));
  });

  it.each(['access_token', 'refresh_token', 'browser'] as const)('revokes the complete connection through %s and does not expose credential validity to other clients', async mechanism => {
    const owner = await h.account(), session = await owner.session(), current = await connection(h, owner, [session.id]), otherClient = await registerClient(h);
    const revoke = (client: Registered, token: string) => h.browser().raw('/oauth/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: client.client_id, token }).toString() });
    const unknown = await revoke(current.client, randomBytes(32).toString('base64url'));
    expect(unknown.status).toBe(200); expect(await unknown.text()).toBe('');
    const foreign = await revoke(otherClient, current.tokens.refresh_token!);
    expect(foreign.status).toBe(200); expect(await foreign.text()).toBe('');
    expect(await bearerStatus(h, current.tokens.access_token)).toBe(200);
    const rotated = issued(await refresh(h, current.client, current.tokens.refresh_token!));
    if (mechanism === 'browser') {
      const tokenId = (await h.runtime.store.list<Token>('token'))[0].id;
      const other = await h.account(); denied(await other.request('DELETE', `/api/tokens/${tokenId}`), [404]);
      success(await owner.request('DELETE', `/api/tokens/${tokenId}`));
    } else {
      const response = await revoke(current.client, rotated[mechanism]!);
      expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store'); await response.arrayBuffer();
    }
    expect(await bearerStatus(h, current.tokens.access_token)).toBe(401);
    expect(await bearerStatus(h, rotated.access_token)).toBe(401);
    invalid(await refresh(h, current.client, rotated.refresh_token!));
  });

  it('enforces the inactivity window and absolute lifetime even with repeated renewal', async () => {
    const owner = await h.account(), session = await owner.session(), inactive = await connection(h, owner, [session.id]);
    const active = await connection(h, owner, [session.id]), time = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(time);
    let latest = active.tokens;
    for (const days of [20, 40, 60, 80]) {
      clock.mockReturnValue(time + days * DAY);
      latest = issued(await refresh(h, active.client, latest.refresh_token!));
      if (days === 40) invalid(await refresh(h, inactive.client, inactive.tokens.refresh_token!));
    }
    const family = (await h.runtime.store.list<Token>('token')).find(item => item.clientId === active.client.client_id)!;
    clock.mockReturnValue(family.refreshExpiresAt! - 2000);
    latest = issued(await refresh(h, active.client, latest.refresh_token!));
    expect(latest.expires_in).toBeLessThanOrEqual(2);
    clock.mockReturnValue(family.refreshExpiresAt! + 1);
    invalid(await refresh(h, active.client, latest.refresh_token!));
    expect(await bearerStatus(h, latest.access_token)).toBe(401);
    expect((await h.runtime.auth.tokenMetadata(owner.user!.id)).every(item => item.reconnectRequired)).toBe(true);
  });

  it('retains replay tombstones after older idle expiry and persists only hashed credentials across restart', async () => {
    const owner = await h.account(), session = await owner.session(), original = await connection(h, owner, [session.id]), time = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(time + 20 * DAY);
    let latest = issued(await refresh(h, original.client, original.tokens.refresh_token!));
    clock.mockReturnValue(time + 40 * DAY);
    latest = issued(await refresh(h, original.client, latest.refresh_token!));
    const allStored = JSON.stringify((await h.runtime.store.db.prepare('SELECT value FROM documents').all()));
    for (const value of [original.tokens.access_token, original.tokens.refresh_token!, latest.access_token, latest.refresh_token!]) expect(allStored.includes(value)).toBe(false);
    expect((await h.runtime.store.list<OAuthRefreshCredential>('oauth-refresh')).every(item => /^[a-f0-9]{64}$/.test(item.id))).toBe(true);
    expect((await h.runtime.store.list<OAuthAccessCredential>('oauth-access')).every(item => /^[a-f0-9]{64}$/.test(item.id))).toBe(true);
    expect((await h.runtime.store.get<OAuthRefreshCredential>('oauth-refresh', hash(original.tokens.refresh_token!)))?.usedAt).toBeDefined();
    await h.shutdown();
    const restarted = await startHarness({ database: h.database });
    try {
      latest = issued(await refresh(restarted, original.client, latest.refresh_token!));
      invalid(await refresh(restarted, original.client, original.tokens.refresh_token!));
      expect(await bearerStatus(restarted, latest.access_token)).toBe(401);
    } finally { await restarted.close(); }
  });

  it('keeps pre-upgrade tokens and code-only registrations unchanged until expiry, without silently adding refresh or account scope', async () => {
    const owner = await h.account(), session = await owner.session(), client = await registerClient(h, ['authorization_code']);
    const registration = (await h.runtime.store.get<{ id: string; grantTypes?: string[] }>('oauth-client', client.client_id))!;
    delete registration.grantTypes; (await h.runtime.store.put('oauth-client', registration));
    const old = (await h.runtime.auth.issueToken(owner.user!.id, 'Pre-upgrade OAuth connection', ['read'], [session.id], client.client_id, ACCESS_LIMITS.oauthTokenSeconds));
    const originalExpiry = old.token.expiresAt;
    const codeOnly = await connection(h, owner, [session.id], 'read', client);
    expect(codeOnly.tokens.refresh_token).toBeUndefined();
    expect(await bearerStatus(h, old.value)).toBe(200);
    expect((await call(h, old.value, 'kanvas_session_create', { name: 'Must remain scoped' })).isError).toBe(true);
    invalid(await refresh(h, client, old.value));
    const fresh = await connection(h, owner, [session.id], 'read');
    expect(typeof fresh.tokens.refresh_token).toBe('string');
    const retained = (await h.runtime.store.get<Token>('token', old.token.id))!;
    expect(retained.expiresAt).toBe(originalExpiry); expect(retained.sessionIds).toEqual([session.id]); expect(retained.refreshExpiresAt).toBeUndefined();
    const metadata = (await h.runtime.auth.tokenMetadata(owner.user!.id)).find(item => item.id === old.token.id)!;
    expect(metadata).toMatchObject({ accessMode: 'selected', refreshable: false, reconnectRequired: true });
    vi.spyOn(Date, 'now').mockReturnValue(originalExpiry + 1);
    expect(await bearerStatus(h, old.value)).toBe(401);
    expect((await h.runtime.store.get<Token>('token', old.token.id))?.expiresAt).toBe(originalExpiry);
  });

  it('does not accept a new OAuth credential when the persisted database is opened for a different resource audience', async () => {
    const owner = await h.account(), session = await owner.session(), current = await connection(h, owner, [session.id]);
    await h.shutdown();
    const moved = await startHarness({ database: h.database, publicUrl: 'http://localhost' });
    try {
      const response = await moved.browser().raw('/mcp', {
        method: 'POST', headers: { Authorization: `Bearer ${current.tokens.access_token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'audience-check', version: '1' } } }),
      }, { origin: null });
      expect(response.status).toBe(401); await response.arrayBuffer();
      const renewal = await moved.browser().raw('/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({
        grant_type: 'refresh_token', client_id: current.client.client_id, refresh_token: current.tokens.refresh_token!, resource: 'http://localhost/mcp',
      }).toString() }, { origin: null });
      expect(renewal.status).toBe(400); expect((await renewal.json()).error).toBe('invalid_grant');
    } finally { await moved.close(); }
  });
});
