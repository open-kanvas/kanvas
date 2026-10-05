import { operationRequest } from '../mcp/requests.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { Page } from '@playwright/test';
import type { SessionRecord } from '../../src/shared/types';
import { expect, register, sessionApi, test } from './support';

const CALLBACK = 'https://kanvas-continuity-client.example/callback';

async function beginConnection(page: Page, origin: string, scope = 'read publish') {
  const verifier = randomBytes(32).toString('base64url'), state = randomUUID();
  const registered = await page.request.post('/oauth/register', { data: {
    client_name: 'Account continuity client', redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], scope,
  } });
  expect(registered.status()).toBe(201);
  const client = await registered.json() as { client_id: string };
  const authorization = await page.request.get(`/oauth/authorize?${new URLSearchParams({
    client_id: client.client_id, redirect_uri: CALLBACK, response_type: 'code', scope, resource: `${origin}/mcp`, state,
    code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  })}`, { maxRedirects: 0 });
  expect(authorization.status()).toBe(303);
  const location = new URL(authorization.headers().location);
  expect(location.origin).toBe(origin);
  let finish!: (address: URL) => void;
  const callback = new Promise<URL>(resolve => { finish = resolve; });
  // Only the external host landing page is intercepted. All account, consent,
  // token and MCP requests use the real local service; auth traces stay off.
  await page.route(address => address.origin + address.pathname === CALLBACK, async route => {
    const address = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><h1>Connection approved</h1>' });
    finish(address);
  });
  return {
    path: location.pathname + location.search,
    async exchange() {
      const returned = await callback;
      // Receipt of the intercepted response precedes browser navigation commit.
      // Wait for its document before a later workspace navigation can race it.
      await expect(page.getByRole('heading', { name: 'Connection approved', exact: true })).toBeVisible();
      expect(returned.searchParams.get('state') === state).toBe(true);
      expect(returned.searchParams.has('code')).toBe(true);
      const response = await page.request.post('/oauth/token', { form: {
        grant_type: 'authorization_code', client_id: client.client_id, redirect_uri: CALLBACK,
        resource: `${origin}/mcp`, code: returned.searchParams.get('code')!, code_verifier: verifier,
      } });
      expect(response.status()).toBe(200);
      const tokens = await response.json() as { access_token: string; refresh_token: string; scope: string };
      expect(typeof tokens.access_token === 'string' && typeof tokens.refresh_token === 'string').toBe(true);
      return tokens;
    },
  };
}

async function mcpClient(origin: string, bearer: string) {
  const client = new Client({ name: 'browser-consent-verification', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', origin), { requestInit: { headers: { Authorization: `Bearer ${bearer}` } } }));
  return client;
}

test('account connection needs no session and grants creation only after explicit human approval', async ({ page, baseURL }) => {
  await register(page);
  const connection = await beginConnection(page, baseURL!);
  let approvalPosts = 0, sessionCreates = 0;
  page.on('request', request => {
    if (request.method() !== 'POST') return;
    const path = new URL(request.url()).pathname;
    if (path === '/api/oauth/approve') approvalPosts++;
    if (path === '/api/sessions') sessionCreates++;
  });
  await page.goto(connection.path);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByText('Connect this client to your KANVAS account', { exact:false })).toBeVisible();
  await expect(page.getByText('This connection renews automatically', { exact:false })).toBeVisible();
  await expect(page.getByLabel('New session name', { exact: true })).toHaveCount(0);
  const allow = page.getByRole('button', { name: 'Allow account access', exact: true });
  await expect(allow).toBeEnabled();
  expect(approvalPosts).toBe(0); expect(sessionCreates).toBe(0);
  const home=(await sessionApi<SessionRecord[]>(page,'/api/sessions')).data!;expect(home).toHaveLength(1);expect(home[0].name).toBe('Home');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  await allow.click();
  const tokens = await connection.exchange();
  expect(approvalPosts).toBe(1); expect(sessionCreates).toBe(0);
  await page.goto('/start');
  // The live start page opens a real Home display. Wait for that navigation to
  // finish before running browser-context API assertions across it.
  await expect(page.locator('.viewer-shell')).toBeVisible();
  const listed = await page.request.get('/api/tokens');
  const metadata = (await listed.json()).data as { accessMode: string; sessionIds?: string[]; refreshable: boolean; reconnectRequired: boolean }[];
  expect(metadata).toHaveLength(1);
  expect(metadata[0]).toMatchObject({ accessMode: 'account', refreshable: true, reconnectRequired: false });
  expect(metadata[0].sessionIds).toBeUndefined();
  expect((await sessionApi<SessionRecord[]>(page,'/api/sessions')).data?.map(s=>s.id)).toEqual([home[0].id]);
  const client = await mcpClient(baseURL!, tokens.access_token);
  try {
    const created = await client.callTool(operationRequest({ name: 'kanvas_session', arguments: { operation: 'create', name: 'Started directly by the agent' } }));
    expect(created.isError).not.toBe(true);
    const session = (created.structuredContent as { data: SessionRecord }).data;
    expect((await sessionApi<SessionRecord[]>(page, '/api/sessions')).data?.map(item => item.id).sort()).toEqual([home[0].id,session.id].sort());
  } finally { await client.close(); }
});

test('read-only account consent does not claim or grant session creation', async ({ page, baseURL }) => {
  await register(page);
  const connection = await beginConnection(page, baseURL!, 'read');
  await page.goto(connection.path);
  await expect(page.getByText('Read session content', { exact: true })).toBeVisible();
  await expect(page.getByText('Publish content', { exact: true })).toHaveCount(0);
  await expect(page.getByText('The client can also create new sessions for you through its tools.', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Allow account access', exact: true }).click();
  const tokens = await connection.exchange();
  expect(tokens.scope).toBe('read');
  const client = await mcpClient(baseURL!, tokens.access_token);
  try {
    const sessions = await client.callTool(operationRequest({ name: 'kanvas_inspect', arguments: { operation: 'sessions.list' } }));
    expect(sessions.isError).not.toBe(true);
    const retained=(sessions.structuredContent as {data:SessionRecord[]}).data;expect(retained).toHaveLength(1);expect(retained[0].name).toBe('Home');
    const attempted = await client.callTool(operationRequest({ name: 'kanvas_session', arguments: { operation: 'create', name: 'Must remain forbidden' } }));
    expect(attempted.isError).toBe(true);
  } finally { await client.close(); }
});

test('expired account consent cannot approve or create anything', async ({ page, baseURL }) => {
  await register(page);
  const connection = await beginConnection(page, baseURL!);
  await page.clock.install();
  await page.goto(connection.path);
  const allow = page.getByRole('button', { name: 'Allow account access', exact: true });
  await expect(allow).toBeEnabled();
  await page.clock.fastForward(11 * 60_000);
  await expect(page.getByRole('alert')).toContainText('connection request has expired');
  await expect(allow).toBeDisabled();
  await expect(page.getByRole('radio')).toHaveCount(0);
  const connections = await page.request.get('/api/tokens');
  expect((await connections.json()).data).toEqual([]);
  const retained=(await sessionApi<SessionRecord[]>(page,'/api/sessions')).data!;expect(retained).toHaveLength(1);expect(retained[0].name).toBe('Home');
});
