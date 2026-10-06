import { operationRequest } from '../mcp/requests.js';
import { legacySelectedCode } from './legacy-oauth-fixture.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ORIGIN, denied, startHarness, success, type Browser, type Harness } from './harness.js';

interface Metadata { issuer: string; authorization_endpoint: string; token_endpoint: string; registration_endpoint: string; code_challenge_methods_supported: string[] }
interface Registered { client_id: string; grant_types: string[]; token_endpoint_auth_method: string }
interface Issued { access_token?: string; token_type?: string; expires_in?: number; error?: string }
const CALLBACK = 'http://127.0.0.1:43117/callback';
const localPath = (address: string) => { const url = new URL(address); expect(url.origin).toBe(ORIGIN); return `${url.pathname}${url.search}`; };
async function json<T>(response: Response): Promise<T> { return await response.json() as T; }

async function discover(browser: Browser): Promise<Metadata> {
  const response = await browser.raw('/.well-known/oauth-authorization-server');
  expect(response.status).toBe(200);
  return json<Metadata>(response);
}

async function register(browser: Browser, metadata: Metadata): Promise<Registered> {
  const response = await browser.raw(localPath(metadata.registration_endpoint), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Core acceptance OAuth client', redirect_uris: [CALLBACK], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }) });
  expect(response.status).toBeGreaterThanOrEqual(200); expect(response.status).toBeLessThan(300);
  const registered = await json<Registered>(response);
  expect(registered.grant_types).toEqual(['authorization_code', 'refresh_token']);
  expect(registered.token_endpoint_auth_method).toBe('none');
  return registered;
}

async function authorize(browser: Browser, metadata: Metadata, registered: Registered, overrides: Record<string, string> = {}) {
  const verifier = randomBytes(32).toString('base64url'), state = randomUUID();
  const query = new URLSearchParams({ response_type: 'code', client_id: registered.client_id, redirect_uri: CALLBACK, scope: 'read publish', resource: `${ORIGIN}/mcp`, state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', ...overrides });
  const response = await browser.raw(`${localPath(metadata.authorization_endpoint)}?${query}`);
  const location = response.headers.get('location');
  await response.arrayBuffer();
  return { response, location, verifier, state, requestId: location ? new URL(location, ORIGIN).searchParams.get('authorize') : null };
}

async function approve(h:Harness, browser: Browser, requestId: string, sessionIds: string[]) {
  const result = success(await browser.request<{ redirectUri: string }>('POST', '/api/oauth/approve', { requestId, approve: true, accessMode:'account' }));
  const redirect = new URL(result.redirectUri);
  expect(`${redirect.origin}${redirect.pathname}`).toBe(CALLBACK);
  const code = redirect.searchParams.get('code');
  expect(typeof code).toBe('string');
  await legacySelectedCode(h,code!,sessionIds);
  return { code: code!, state: redirect.searchParams.get('state') };
}

async function exchange(browser: Browser, metadata: Metadata, registered: Registered, code: string, verifier: string, overrides: Record<string, string> = {}) {
  const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: registered.client_id, redirect_uri: CALLBACK, code, code_verifier: verifier, resource: `${ORIGIN}/mcp`, ...overrides });
  const response = await browser.raw(localPath(metadata.token_endpoint), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  return { response, body: await json<Issued>(response) };
}

describe('OAuth consent, PKCE and single-use grants', () => {
  let h: Harness;
  beforeEach(async () => { h = await startHarness(); });
  afterEach(async () => { await h?.close(); });

  it('advertises and requires S256 PKCE and refuses an unregistered redirect target', async () => {
    const browser = h.browser(), metadata = await discover(browser), registered = await register(browser, metadata);
    expect(metadata.code_challenge_methods_supported).toContain('S256');
    expect(metadata.code_challenge_methods_supported).not.toContain('plain');
    const invalidRequests: Record<string, string>[] = [
      { code_challenge_method: 'plain' }, { code_challenge: '' }, { redirect_uri: 'https://unregistered.example/callback' },
    ];
    for (const overrides of invalidRequests) {
      const attempted = await authorize(browser, metadata, registered, overrides);
      expect(attempted.requestId).toBeNull();
      if (attempted.response.status >= 300 && attempted.response.status < 400) {
        expect(new URL(attempted.location!, ORIGIN).searchParams.has('error')).toBe(true);
        expect(new URL(attempted.location!, ORIGIN).searchParams.has('code')).toBe(false);
        expect(new URL(attempted.location!, ORIGIN).hostname).not.toBe('unregistered.example');
      } else expect([400, 401, 403]).toContain(attempted.response.status);
    }
  });

  it('preserves pre-upgrade selected-session grants, preserves OAuth state and rejects code replay', async () => {
    const owner = await h.account(), allowed = await owner.session('Allowed'), excluded = await owner.session('Excluded');
    const clientBrowser = h.browser(), metadata = await discover(clientBrowser), registered = await register(clientBrowser, metadata);
    const request = await authorize(clientBrowser, metadata, registered);
    expect(request.requestId).toEqual(expect.any(String));
    const consent = success(await owner.request<{ id: string; scopes: string[] }>('GET', `/api/oauth/requests/${request.requestId}`));
    expect(consent.id).toBe(request.requestId);
    expect(consent.scopes).toEqual(expect.arrayContaining(['read', 'publish']));
    denied(await owner.request('POST', '/api/oauth/approve', { requestId: request.requestId, approve: true, sessionIds: [allowed.id] }, { csrf: null }), [403]);
    const approved = await approve(h, owner, request.requestId!, [allowed.id]);
    expect(approved.state).toBe(request.state);
    const issued = await exchange(clientBrowser, metadata, registered, approved.code, request.verifier);
    expect(issued.response.status).toBe(200);
    expect(typeof issued.body.access_token).toBe('string');
    expect(issued.body.token_type?.toLowerCase()).toBe('bearer');
    expect(issued.body.expires_in).toBeGreaterThan(0);
    expect(issued.response.headers.get('cache-control')).toMatch(/no-store/);
    const replay = await exchange(clientBrowser, metadata, registered, approved.code, request.verifier);
    expect(replay.response.status).toBe(400);
    expect(replay.body.error).toBe('invalid_grant');
    expect(replay.body.access_token).toBeUndefined();
    const sdk = new Client({ name: 'core-oauth-acceptance', version: '1.0' });
    try {
      await sdk.connect(new StreamableHTTPClientTransport(new URL('/mcp', h.baseUrl), { requestInit: { headers: { Authorization: `Bearer ${issued.body.access_token}` } } }));
      const permitted = await sdk.callTool(operationRequest({ name: 'kanvas_session_state', arguments: { sessionId: allowed.id } }));
      expect(permitted.isError).not.toBe(true);
      const rejected = await sdk.callTool(operationRequest({ name: 'kanvas_session_state', arguments: { sessionId: excluded.id } }));
      expect(rejected.isError).toBe(true);
    } finally { await sdk.close(); }
  });

  it('rejects incorrect verifier, client binding, redirect binding and resource audience', async () => {
    const owner = await h.account(), session = await owner.session(), client = h.browser();
    const metadata = await discover(client), registered = await register(client, metadata), differentClient = await register(client, metadata);
    const invalidBindings: Record<string, string>[] = [
      { code_verifier: randomBytes(32).toString('base64url') },
      { client_id: differentClient.client_id },
      { redirect_uri: 'http://127.0.0.1:43117/different' },
      { resource: 'https://untrusted.example/mcp' },
    ];
    for (const change of invalidBindings) {
      const request = await authorize(client, metadata, registered);
      expect(request.requestId).toEqual(expect.any(String));
      const approved = await approve(h, owner, request.requestId!, [session.id]);
      const result = await exchange(client, metadata, registered, approved.code, request.verifier, change);
      expect([400, 401]).toContain(result.response.status);
      expect(result.body.error).toEqual(expect.any(String));
      expect(result.body.access_token).toBeUndefined();
    }
  });

  it('cannot consent to another account’s session and makes explicit denial terminal', async () => {
    const owner = await h.account(), other = await h.account(), foreign = await other.session('Foreign');
    const client = h.browser(), metadata = await discover(client), registered = await register(client, metadata);
    const request = await authorize(client, metadata, registered);
    expect(request.requestId).toEqual(expect.any(String));
    denied(await owner.request('POST', '/api/oauth/approve', { requestId: request.requestId, approve: true, sessionIds: [foreign.id] }), [400, 403, 404]);
    const rejected = success(await owner.request<{ redirectUri: string }>('POST', '/api/oauth/approve', { requestId: request.requestId, approve: false }));
    const uri = new URL(rejected.redirectUri);
    expect(uri.searchParams.get('error')).toBe('access_denied');
    expect(uri.searchParams.get('state')).toBe(request.state);
    expect(uri.searchParams.has('code')).toBe(false);
    denied(await owner.request('POST', '/api/oauth/approve', { requestId: request.requestId, approve: true, sessionIds: [foreign.id] }), [400, 403, 404, 409, 410]);
  });
});
