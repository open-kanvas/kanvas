import { legacySelectedCode, verifiedEmailConsent } from './legacy-oauth-fixture.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetRecord, ViewSpec } from '../../src/shared/types.js';
import { ORIGIN, PNG, denied, fact, startHarness, success, type Browser, type Harness } from './harness.js';

const callback = 'http://127.0.0.1:41837/callback';
interface Pairing { id: string; status: string; expiresAt: string }
async function client(browser: Browser) {
  const response = await browser.raw('/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Access-boundary acceptance client', redirect_uris: [callback], token_endpoint_auth_method: 'none' }) });
  expect(response.status).toBe(201);
  const body = await response.json() as { client_id: string };
  return body.client_id;
}
async function authorize(browser: Browser, clientId: string) {
  const verifier = randomBytes(32).toString('base64url');
  const query = new URLSearchParams({ client_id: clientId, redirect_uri: callback, response_type: 'code', resource: `${ORIGIN}/mcp`, scope: 'read publish', state: randomUUID(), code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') });
  const response = await browser.raw(`/oauth/authorize?${query}`);
  expect(response.status).toBe(303);
  const requestId = new URL(response.headers.get('location')!).searchParams.get('authorize');
  expect(typeof requestId).toBe('string'); await response.arrayBuffer();
  return { requestId: requestId!, verifier };
}
async function consent(h:Harness, owner: Browser, requestId: string, sessionIds: string[]) {
  await verifiedEmailConsent(h,owner,requestId);
  const result = success(await owner.request<{ redirectUri: string }>('POST', '/api/oauth/approve', { requestId, approve: true, accessMode:'account' }));
  const code = new URL(result.redirectUri).searchParams.get('code');
  expect(typeof code).toBe('string');
  await legacySelectedCode(h,code!,sessionIds);
  return code!;
}
async function exchange(browser: Browser, clientId: string, code: string, verifier: string) {
  const body = new URLSearchParams({ client_id: clientId, redirect_uri: callback, grant_type: 'authorization_code', resource: `${ORIGIN}/mcp`, code, code_verifier: verifier });
  const response = await browser.raw('/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  return { response, body: await response.json() as { error?: string; access_token?: string } };
}
async function pair(h: Harness, owner: Browser, sessionId: string, displayId: string, screen = h.browser()) {
  const record = success(await screen.request<Pairing>('POST', '/api/pairings', { sessionId, displayId, deviceName: 'Boundary acceptance screen' }));
  success(await owner.request('POST', `/api/pairings/${record.id}/decision`, { approve: true }));
  return { screen, record };
}

describe('authorization expiry and paired-screen exchange boundaries', () => {
  let h: Harness;
  beforeEach(async () => { h = await startHarness(); });
  afterEach(async () => { vi.restoreAllMocks(); await h?.close(); });

  it('requires a full account session, never a paired owner identity, for account OAuth consent', async () => {
    const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
    const {screen,record} = await pair(h,owner,session.id,display.id);
    success(await screen.request('GET', `/api/pairings/${record.id}/status`));
    const me = success(await screen.request<{csrfToken:string;viewOnly:boolean}>('GET','/api/auth/me'));
    expect(me.viewOnly).toBe(true); screen.csrf=me.csrfToken;
    const clientId=await client(screen),pending=await authorize(screen,clientId);
    // Public bounded connector metadata is safe to preview, never a grant.
    success(await screen.request('GET', `/api/oauth/requests/${pending.requestId}`));
    for(const approve of [true,false]) denied(await screen.request('POST','/api/oauth/approve',{requestId:pending.requestId,approve,accessMode:'account'}),[403]);
    expect(success(await owner.request<unknown[]>('GET','/api/tokens'))).toHaveLength(0);
    // A different, deliberately signed-in account owns the resulting grant.
    const identity=await screen.register();
    await verifiedEmailConsent(h,screen,pending.requestId);
    const decision=success(await screen.request<{redirectUri:string}>('POST','/api/oauth/approve',{requestId:pending.requestId,approve:true,accessMode:'account'}));
    const issued=await exchange(screen,clientId,new URL(decision.redirectUri).searchParams.get('code')!,pending.verifier);
    expect(issued.response.status).toBe(200);
    expect(success(await screen.request<{user:{id:string};viewOnly?:boolean}>('GET','/api/auth/me'))).toMatchObject({user:{id:identity.id}});
    expect(success(await owner.request<unknown[]>('GET','/api/tokens'))).toHaveLength(0);
    expect(success(await screen.request<{accessMode:string}[]>('GET','/api/tokens'))).toMatchObject([{accessMode:'account'}]);
    denied(await screen.request('GET',`/api/sessions/${session.id}`),[403,404]);
  });

  it('rejects insecure and credential-bearing registered redirects and publishes the exact MCP audience', async () => {
    const browser = h.browser();
    for (const address of ['http://remote.example/callback', 'https://user:password@client.example/callback', 'https://client.example/callback#fragment', 'javascript:alert(1)']) {
      const response = await browser.raw('/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: [address] }) });
      expect(response.status).toBe(400);
      const result = await response.json() as { error?: string; client_id?: string };
      expect(result.error).toEqual(expect.any(String)); expect(result.client_id).toBeUndefined();
    }
    const metadata = await browser.raw('/.well-known/oauth-protected-resource/mcp');
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toMatchObject({ resource: `${ORIGIN}/mcp`, authorization_servers: [ORIGIN], bearer_methods_supported: ['header'] });
  });

  it('expires pending consent and issued codes without granting account-wide access for an empty selection', async () => {
    const owner = await h.account(), session = await owner.session(), browser = h.browser(), clientId = await client(browser);
    const pending = await authorize(browser, clientId);
    denied(await owner.request('POST', '/api/oauth/approve', { requestId: pending.requestId, approve: true, sessionIds: [] }), [400, 422]);
    const live = await authorize(browser, clientId), code = await consent(h, owner, live.requestId, [session.id]);
    const time = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(time + 3 * 60_000);
    const expiredCode = await exchange(browser, clientId, code, live.verifier);
    expect(expiredCode.response.status).toBe(400); expect(expiredCode.body.error).toBe('invalid_grant'); expect(expiredCode.body.access_token).toBeUndefined();
    vi.mocked(Date.now).mockReturnValue(time + 11 * 60_000);
    denied(await owner.request('GET', `/api/oauth/requests/${pending.requestId}`), [404, 410]);
    denied(await owner.request('POST', '/api/oauth/approve', { requestId: pending.requestId, approve: true, sessionIds: [session.id] }), [404, 410]);
    expect(success(await owner.request<unknown[]>('GET', '/api/tokens'))).toHaveLength(0);
  });

  it('rechecks membership between consent and token exchange', async () => {
    const owner = await h.account(), editor = await h.account(), session = await owner.session(), browser = h.browser();
    success(await owner.request('POST', `/api/sessions/${session.id}/members`, { username: editor.user!.username, role: 'editor' }));
    const clientId = await client(browser), pending = await authorize(browser, clientId), code = await consent(h, editor, pending.requestId, [session.id]);
    success(await owner.request('DELETE', `/api/sessions/${session.id}/members/${editor.user!.id}`));
    const attempted = await exchange(browser, clientId, code, pending.verifier);
    expect(attempted.response.status).toBe(400); expect(attempted.body.error).toBe('invalid_grant'); expect(attempted.body.access_token).toBeUndefined();
    expect(success(await editor.request<unknown[]>('GET', '/api/tokens'))).toHaveLength(0);
  });

  it('makes proof claim single-use and does not replace an account that signs in while awaiting approval', async () => {
    const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
    const first = await pair(h, owner, session.id, display.id), proofOnly = new Map(first.screen.cookies);
    expect(success(await first.screen.request<Pairing>('GET', `/api/pairings/${first.record.id}/status`)).status).toBe('approved');
    const replay = h.browser(); for (const [name, value] of proofOnly) replay.cookies.set(name, value);
    denied(await replay.request('GET', `/api/pairings/${first.record.id}/status`), [401, 403, 404, 410]);
    denied(await replay.request('GET', '/api/auth/me'), [401]);
    const signedIn = await pair(h, owner, session.id, display.id);
    const ownIdentity = await signedIn.screen.register();
    denied(await signedIn.screen.request('GET', `/api/pairings/${signedIn.record.id}/status`), [409]);
    const me = success(await signedIn.screen.request<{ user: { id: string }; viewOnly?: boolean }>('GET', '/api/auth/me'));
    expect(me.user.id).toBe(ownIdentity.id); expect(me.viewOnly).not.toBe(true);
  });

  it('does not activate pending or approved-but-unclaimed requests after their expiry', async () => {
    const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id), unapprovedScreen = h.browser();
    const unapproved = success(await unapprovedScreen.request<Pairing>('POST', '/api/pairings', { sessionId: session.id, displayId: display.id }));
    const approved = await pair(h, owner, session.id, display.id);
    vi.spyOn(Date, 'now').mockReturnValue(Math.max(Date.parse(unapproved.expiresAt), Date.parse(approved.record.expiresAt)) + 1);
    expect(success(await unapprovedScreen.request<Pairing>('GET', `/api/pairings/${unapproved.id}/status`)).status).toBe('expired');
    expect(success(await approved.screen.request<Pairing>('GET', `/api/pairings/${approved.record.id}/status`)).status).toBe('expired');
    denied(await owner.request('POST', `/api/pairings/${unapproved.id}/decision`, { approve: true }), [409, 410]);
    denied(await approved.screen.request('GET', '/api/auth/me'), [401]);
  });

  it('allows only media in the approved display’s currently active view', async () => {
    const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
    const a = success(await owner.request<AssetRecord>('POST', `/api/sessions/${session.id}/assets`, { name: 'current.png', mimeType: 'image/png', base64: PNG }));
    const b = success(await owner.request<AssetRecord>('POST', `/api/sessions/${session.id}/assets`, { name: 'next.png', mimeType: 'image/png', base64: PNG }));
    const image = (asset: AssetRecord): ViewSpec => ({ version: 1, template: 'image', data: { images: [{ url: asset.url, alt: 'Acceptance fixture' }] } });
    await owner.submit(session.id, [display.id], { version: 1, template: 'presentation', data: { slides: [image(a), image(b)], index: 0 } });
    const { screen, record } = await pair(h, owner, session.id, display.id);
    success(await screen.request('GET', `/api/pairings/${record.id}/status`));
    const visible = await screen.raw(a.url); expect(visible.status).toBe(200); await visible.arrayBuffer();
    denied(await screen.request('GET', b.url));
    await owner.submit(session.id, [display.id], { version: 1, template: 'presentation', data: { slides: [image(a), image(b)], index: 1 } });
    denied(await screen.request('GET', a.url));
    const next = await screen.raw(b.url); expect(next.status).toBe(200); await next.arrayBuffer();
    await owner.submit(session.id, [display.id], fact(b.url));
    denied(await screen.request('GET', b.url));
  });

  it('ends an already-connected paired viewer stream when the owner revokes the grant', async () => {
    const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
    const { screen, record } = await pair(h, owner, session.id, display.id);
    success(await screen.request('GET', `/api/pairings/${record.id}/status`));
    const response = await screen.raw(`/api/sessions/${session.id}/events?displayId=${display.id}`);
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    try {
      expect((await reader.read()).done).toBe(false);
      success(await owner.request('DELETE', `/api/pairings/${record.id}`));
      let done = false;
      while (!done) done = (await reader.read()).done;
      expect(done).toBe(true);
    } finally { await reader.cancel(); }
    denied(await screen.request('GET', `/api/sessions/${session.id}`), [401, 403, 404]);
  });
});
