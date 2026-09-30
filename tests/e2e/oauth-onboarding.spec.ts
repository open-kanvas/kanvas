import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import type { SessionRecord } from '../../src/shared/types';
import { expect, register, sessionApi, signOutWorkspace, test } from './support';

const CALLBACK = 'https://kanvas-oauth-client.example/callback';

async function beginConnection(page: Page, origin: string) {
  const verifier = randomBytes(32).toString('base64url'), state = randomUUID();
  const registered = await page.request.post('/oauth/register', { data: {
    client_name: 'Browser onboarding client', redirect_uris: [CALLBACK],
    token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], scope: 'read publish',
  } });
  expect(registered.status()).toBe(201);
  const client = await registered.json() as { client_id: string };
  const parameters = new URLSearchParams({
    client_id: client.client_id, redirect_uri: CALLBACK, response_type: 'code', scope: 'read publish', resource: `${origin}/mcp`,
    state, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  });
  const authorization = await page.request.get(`/oauth/authorize?${parameters}`, { maxRedirects: 0 });
  expect(authorization.status()).toBe(303);
  const location = new URL(authorization.headers().location);
  expect(location.origin).toBe(origin);
  let finish!: (address: URL) => void;
  const callback = new Promise<URL>(resolve => { finish = resolve; });
  // Stand in for the external client's callback only. Sign-in, consent and
  // token exchange below all use the real local service. No external traffic,
  // traces, recordings, or credential-bearing callback URLs are printed.
  await page.route(address => address.origin + address.pathname === CALLBACK, async route => {
    const address = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><h1>Returned to client</h1>' });
    finish(address);
  });
  return { clientId: client.client_id, verifier, state, path: `${location.pathname}${location.search}`, callback };
}

async function connectionCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const response = await fetch('/api/tokens', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Could not check connection metadata.');
    return (await response.json()).data.length;
  });
}

// Registration now provisions Home. These cases deliberately exercise the
// still-supported account state with no active session, through the normal API.
async function endActiveSessions(page: Page, diagnostics: { allowHttp(page: Page, pathname: string, status: number): void }) {
  const sessions = (await sessionApi<SessionRecord[]>(page, '/api/sessions')).data!;
  for (const session of sessions.filter(item => !item.endedAt)) {
    const path = `/api/sessions/${session.id}`;
    // This fixture deliberately ends Home while its workspace may still have
    // a read/event stream in flight. Only that retired session may return Gone.
    diagnostics.allowHttp(page, path, 410);
    expect((await sessionApi(page, `${path}/end`, 'POST', {})).status).toBe(200);
    const retired = await sessionApi(page, path);
    expect(retired.status).toBe(410);
    expect(retired.code).toBe('SESSION_ENDED');
  }
}

test('first OAuth login can create a private session but still requires explicit consent', async ({ page, baseURL, diagnostics }) => {
  const account = await register(page);
  await endActiveSessions(page, diagnostics);
  await signOutWorkspace(page);
  const connection = await beginConnection(page, baseURL!);
  await page.goto(connection.path);
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  // Email link sign-in is exercised in email-signup.spec.ts. Establish this
  // account through fixture login, then verify the pending consent is retained.
  const signedIn = await page.request.post('/api/auth/login', { data: account }); expect(signedIn.status()).toBe(200);
  await page.goto(connection.path);
  await expect(page.getByRole('heading', { name: 'Browser onboarding client' })).toBeVisible();
  const allow = page.getByRole('button', { name: 'Allow selected sessions', exact: true });
  await expect(allow).toBeDisabled();
  let approvalPosts = 0;
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/oauth/approve') approvalPosts++; });
  await page.getByLabel('New session name', { exact: true }).fill('First connector session');
  await page.getByRole('button', { name: 'Create session', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'First connector session', exact: true })).toBeChecked();
  await expect(allow).toBeEnabled();
  expect(approvalPosts).toBe(0);
  expect(await connectionCount(page)).toBe(0);
  const sessions = (await sessionApi<SessionRecord[]>(page, '/api/sessions')).data!.filter(item => !item.endedAt);
  expect(sessions.length).toBe(1);
  expect(sessions[0].role).toBe('owner');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  await allow.click();
  const returned = await connection.callback;
  await expect(page.getByRole('heading', { name: 'Returned to client', exact: true })).toBeVisible();
  expect(approvalPosts).toBe(1);
  expect(returned.searchParams.get('state') === connection.state).toBe(true);
  expect(returned.searchParams.has('code')).toBe(true);
  const issued = await page.request.post('/oauth/token', { form: {
    grant_type: 'authorization_code', client_id: connection.clientId, redirect_uri: CALLBACK,
    resource: `${baseURL}/mcp`, code: returned.searchParams.get('code')!, code_verifier: connection.verifier,
  } });
  expect(issued.status()).toBe(200);
  const token = await issued.json();
  expect(typeof token.access_token === 'string').toBe(true);
  expect(token.token_type).toBe('Bearer');
  await page.goto('/');
  await expect(page.locator('.workspace')).toBeVisible();
  const connections = await page.request.get('/api/tokens');
  expect((await connections.json()).data.map((item: { sessionIds: string[] }) => item.sessionIds)).toEqual([[sessions[0].id]]);
});

test('declining after session creation keeps the session private and issues no connection', async ({ page, baseURL, diagnostics }) => {
  await register(page);
  await endActiveSessions(page, diagnostics);
  const connection = await beginConnection(page, baseURL!);
  await page.goto(connection.path);
  await page.getByLabel('New session name', { exact: true }).fill('Still private');
  await page.getByRole('button', { name: 'Create session', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Still private', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Decline', exact: true }).click();
  const returned = await connection.callback;
  await expect(page.getByRole('heading', { name: 'Returned to client', exact: true })).toBeVisible();
  expect(returned.searchParams.get('error')).toBe('access_denied');
  expect(returned.searchParams.has('code')).toBe(false);
  await page.goto('/');
  await expect(page.locator('.workspace')).toBeVisible();
  expect(await connectionCount(page)).toBe(0);
  const sessions = (await sessionApi<SessionRecord[]>(page, '/api/sessions')).data!.filter(item => !item.endedAt);
  expect(sessions.map(session => session.name)).toEqual(['Still private']);
});

test('an expired consent page blocks session creation and approval', async ({ page, baseURL, diagnostics }) => {
  await register(page);
  await endActiveSessions(page, diagnostics);
  const connection = await beginConnection(page, baseURL!);
  await page.clock.install();
  await page.goto(connection.path);
  await expect(page.getByLabel('New session name', { exact: true })).toBeVisible();
  await page.clock.fastForward(11 * 60_000);
  await expect(page.getByRole('alert')).toContainText('connection request has expired');
  await expect(page.getByRole('button', { name: 'Create session', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Allow selected sessions', exact: true })).toBeDisabled();
  expect(await connectionCount(page)).toBe(0);
  expect((await sessionApi<SessionRecord[]>(page, '/api/sessions')).data?.filter(item => !item.endedAt).length).toBe(0);
  await expect(page.getByRole('link', { name: 'Open your workspace in another tab' })).toHaveAttribute('href', '/');
});
