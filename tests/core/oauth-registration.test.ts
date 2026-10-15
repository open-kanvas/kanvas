import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OAuthDiagnostic } from '../../src/server/app.js';
import { ORIGIN, startHarness, type Harness } from './harness.js';

const metadata = {
  client_name: 'Hosted connector registration test',
  redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
  token_endpoint_auth_method: 'none',
  response_types: ['code'],
  scope: 'read publish',
};

describe('OAuth registration negotiation', () => {
  let h: Harness;
  beforeEach(async () => { h = await startHarness(); });
  afterEach(async () => { await h?.close(); });

  it.each([
    undefined,
    ['authorization_code'],
    ['authorization_code', 'refresh_token'],
    ['refresh_token', 'authorization_code'],
  ])('registers exactly the supported requested grant profile: %j', async grant_types => {
    const response = await h.browser().raw('/oauth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...metadata, grant_types }),
    });
    expect(response.status).toBe(201);
    const registered = await response.json();
    expect(registered).toMatchObject({
      client_id: expect.any(String), redirect_uris: metadata.redirect_uris,
      grant_types: grant_types?.includes('refresh_token') ? ['authorization_code', 'refresh_token'] : ['authorization_code'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: 'read publish',
    });
    expect(registered.client_secret).toBeUndefined();
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('does not turn grant negotiation into unsupported or malformed authorization', async () => {
    const bad: Record<string, unknown>[] = [
      { grant_types: [] }, { grant_types: 'authorization_code' }, { grant_types: null },
      { grant_types: ['refresh_token'] }, { grant_types: ['client_credentials'] },
      { grant_types: ['authorization_code', 'client_credentials'] },
      { grant_types: ['authorization_code', 'password'] },
      { grant_types: ['authorization_code', null] },
      { grant_types: ['authorization_code', 'authorization_code'] },
      { grant_types: ['authorization_code', 'refresh_token', 'refresh_token'] },
      { response_types: ['token'] }, { token_endpoint_auth_method: 'client_secret_post' },
      { scope: 'read publish offline_access' },
    ];
    for (const change of bad) {
      const response = await h.browser().raw('/oauth/register', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...metadata, ...change }),
      });
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(['invalid_client_metadata', 'invalid_scope']).toContain(body.error);
      expect(body.client_id).toBeUndefined();
    }
    expect((await h.runtime.store.list('oauth-client'))).toHaveLength(0);
  });

  it('advertises refresh and revocation but does not mint a grant from an unknown credential', async () => {
    const browser = h.browser();
    const discovery = await browser.raw('/.well-known/oauth-authorization-server');
    expect(await discovery.json()).toMatchObject({ grant_types_supported: ['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:device_code'], revocation_endpoint: `${ORIGIN}/oauth/revoke`, revocation_endpoint_auth_methods_supported: ['none'] });
    const registration = await browser.raw('/oauth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...metadata, grant_types: ['authorization_code', 'refresh_token'] }),
    });
    const client = await registration.json();
    expect(registration.status).toBe(201);
    const refresh = await browser.raw('/oauth/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: client.client_id, resource: `${ORIGIN}/mcp`, refresh_token: randomBytes(32).toString('base64url') }).toString(),
    });
    expect(refresh.status).toBe(400);
    const rejected = await refresh.json();
    expect(rejected.error).toBe('invalid_grant');
    expect(rejected.access_token).toBeUndefined();
    expect(rejected.refresh_token).toBeUndefined();
  });
});

describe('credential-free OAuth diagnostics', () => {
  let h: Harness;
  afterEach(async () => { await h?.close(); });

  it('reports registration categories and pre-handler failures without logging request values', async () => {
    const events: OAuthDiagnostic[] = [];
    h = await startHarness({ onOAuthDiagnostic: event => { events.push(event); } });
    const marker = randomBytes(32).toString('base64url'), browser = h.browser();
    const request = { ...metadata, client_name: marker, client_secret: marker, redirect_uris: [`https://example.com/${marker}`], grant_types: ['authorization_code', 'refresh_token'], scope: marker };
    const response = await browser.raw('/oauth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
    });
    expect(response.status).toBe(400); await response.arrayBuffer();
    const token = await browser.raw('/oauth/token', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${marker}` },
      body: JSON.stringify({ grant_type: 'authorization_code', client_secret: marker, code: marker }),
    });
    expect(token.status).toBe(400); await token.arrayBuffer();
    const crossOrigin = await browser.raw('/oauth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
    }, { origin: 'https://untrusted.example' });
    expect(crossOrigin.status).toBe(403); await crossOrigin.arrayBuffer();
    await vi.waitFor(() => { expect(events.length).toBe(3); });
    expect(events[0]).toMatchObject({
      event: 'kanvas-oauth', endpoint: 'registration', method: 'POST', status: 400, origin: 'same-origin',
      registration: { authMethod: 'none', authorizationCodeRequested: true, refreshTokenRequested: true, otherGrantRequested: false, unsupportedScopeRequested: true, redirectCount: 1 },
    });
    expect(events[1]).toMatchObject({ endpoint: 'token', status: 400 });
    expect(events[1].registration).toBeUndefined();
    expect(events[2]).toMatchObject({ endpoint: 'registration', status: 403, origin: 'other' });
    expect(JSON.stringify(events).includes(marker)).toBe(false);
    expect(JSON.stringify(events).includes('https://')).toBe(false);
  });

  it('does not let diagnostic-sink failures change registration behavior', async () => {
    h = await startHarness({ onOAuthDiagnostic: () => { throw new Error('Unavailable diagnostic sink'); } });
    const response = await h.browser().raw('/oauth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(metadata),
    });
    expect(response.status).toBe(201); await response.arrayBuffer();
  });
});
