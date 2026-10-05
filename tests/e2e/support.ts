import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test as base, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import type { SessionDetail } from '../../src/client/api';
import type { DisplayRecord, UpdateRecord, ViewSpec } from '../../src/shared/types';

export { expect } from '@playwright/test';
export interface DisposableAccount { username: string; password: string }
interface Diagnostic { kind: 'pageerror' | 'console'; pathname: string; message: string }
interface AllowedHttpError { page: Page; pathname: string; status: number }

class BrowserDiagnostics {
  private errors: Array<Diagnostic & { page: Page }> = [];
  private seen = new Set<Page>();
  private expectedHttp: AllowedHttpError[] = [];
  private offlinePages = new Set<Page>();
  private revisionReads = new Map<Page, Map<string, number>>();
  private staleRevisions: Array<{ page: Page; pathname: string; revision: number }> = [];
  private gridReads = new Map<Page, Map<string, { gridRevision: number; replacementRevision: number }>>();
  private retiredGridReads: Array<{ page: Page; pathname: string }> = [];
  private responseChecks: Promise<void>[] = [];

  watch(page: Page) {
    if (this.seen.has(page)) return;
    this.seen.add(page);
    page.on('pageerror', error => this.errors.push({ page, kind: 'pageerror', pathname: '', message: error.message.slice(0, 600) }));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      let pathname = '';
      try { pathname = new URL(message.location().url).pathname; } catch { /* Non-URL console locations are retained. */ }
      this.errors.push({ page, kind: 'console', pathname, message: message.text().slice(0, 600) });
    });
    // A response event only means headers arrived. Viewer reloads can cancel
    // the body; do not leave teardown awaiting JSON for an unfinished request.
    // These reads establish narrow diagnostic exemptions, not app success.
    page.on('requestfinished', request => {
      const pathname = new URL(request.url()).pathname;
      const displayPath = /^\/api\/sessions\/[^/]+\/displays\/[^/]+\/(navigation|applied)$/.exec(pathname);
      const gridPath = /^\/api\/sessions\/[^/]+\/displays\/[^/]+\/grid$/.test(pathname);
      const sessionRead = /^\/api\/sessions\/[^/]+$/.test(pathname) && request.method() === 'GET';
      if (!displayPath && !sessionRead && !gridPath) return;
      this.responseChecks.push((async () => {
        const response = await request.response();
        if (!response) return;
        const payload = await response.json();
        if (sessionRead && response.ok() && Array.isArray(payload.data?.displays)) {
          const reads = this.revisionReads.get(page) ?? new Map<string, number>();
          for (const display of payload.data.displays) {
            if (typeof display.id !== 'string' || !Number.isInteger(display.revision)) continue;
            for (const action of ['applied', 'navigation']) {
              const path = `${pathname}/displays/${display.id}/${action}`;
              reads.set(path, Math.max(reads.get(path) ?? -1, display.revision));
            }
            const grids = this.gridReads.get(page) ?? new Map<string, { gridRevision: number; replacementRevision: number }>();
            const gridPath = `${pathname}/displays/${display.id}/grid`;
            const grid = grids.get(gridPath) ?? { gridRevision: -1, replacementRevision: -1 };
            if (display.view?.template === 'display-grid') grid.gridRevision = Math.max(grid.gridRevision, display.revision);
            else grid.replacementRevision = Math.max(grid.replacementRevision, display.revision);
            grids.set(gridPath, grid); this.gridReads.set(page, grids);
          }
          this.revisionReads.set(page, reads);
        } else if (gridPath && response.status() === 409 && response.request().method() === 'GET' && payload.error?.code === 'INVALID_VIEW') {
          this.retiredGridReads.push({ page, pathname });
        } else if (displayPath && response.ok() && Number.isInteger(payload.data?.revision)) {
          const reads = this.revisionReads.get(page) ?? new Map<string, number>();
          reads.set(pathname, Math.max(reads.get(pathname) ?? -1, payload.data.revision)); this.revisionReads.set(page, reads);
        } else if (displayPath && response.status() === 409 && response.request().method() === 'POST' && payload.error?.code === 'REVISION_CONFLICT') {
          const body = response.request().postDataJSON();
          const revision = displayPath[1] === 'applied' ? body?.revision : body?.expectedRevision;
          if (Number.isInteger(revision)) this.staleRevisions.push({ page, pathname, revision });
        }
      })().catch(() => {}));
    });
  }

  allowHttp(page: Page, pathname: string, status: number) { this.expectedHttp.push({ page, pathname, status }); }
  allowOffline(page: Page) { this.offlinePages.add(page); }

  async assertClean() {
    await Promise.all(this.responseChecks);
    // A publication can overtake an already-sent scroll or paint acknowledgement.
    // Recognize only the
    // exact 409 contract, once per confirmed response, after a successful read
    // independently proves that the display revision advanced. All other
    // conflicts and every application exception remain failures.
    const stale = this.staleRevisions.filter(item => (this.revisionReads.get(item.page)?.get(item.pathname) ?? -1) > item.revision);
    // A grid poll already in flight may reach the server after replacement.
    // Accept exactly INVALID_VIEW only when this same receiving page observed
    // the grid and a newer non-grid revision, and has painted that replacement.
    const retiredGrids: Array<{ page: Page; pathname: string }> = [];
    for (const item of this.retiredGridReads) {
      const state = this.gridReads.get(item.page)?.get(item.pathname);
      if (!state || state.gridRevision < 0 || state.replacementRevision <= state.gridRevision || item.page.isClosed()) continue;
      const shell = item.page.locator('.viewer-shell');
      const painted = Number(await shell.getAttribute('data-rendered-revision'));
      if (painted >= state.replacementRevision && await shell.getAttribute('data-render-status') === 'ready') retiredGrids.push(item);
    }
    const unexpected = this.errors.filter(error => {
      if (error.kind === 'pageerror') return true;
      const status = Number(/server responded with a status of (\d{3})/.exec(error.message)?.[1]);
      // Signed-out /me probes are part of the documented authentication contract.
      if (status === 401 && error.pathname === '/api/auth/me') return false;
      if (status === 409) {
        const index = stale.findIndex(item => item.page === error.page && item.pathname === error.pathname);
        if (index >= 0) { stale.splice(index, 1); return false; }
        const gridIndex = retiredGrids.findIndex(item => item.page === error.page && item.pathname === error.pathname);
        if (gridIndex >= 0) { retiredGrids.splice(gridIndex, 1); return false; }
      }
      if (this.expectedHttp.some(rule => rule.page === error.page && rule.status === status && error.pathname.startsWith(rule.pathname))) return false;
      if (this.offlinePages.has(error.page) && error.pathname.startsWith('/api/sessions/') && /net::ERR_(INTERNET_DISCONNECTED|NETWORK_CHANGED|CONNECTION_CLOSED|FAILED)/.test(error.message)) return false;
      return true;
    }).map(({ kind, pathname, message }) => ({ kind, pathname, message }));
    expect(unexpected, 'No application exceptions or unexpected browser console errors').toEqual([]);
  }
}

export const test = base.extend<{ diagnostics: BrowserDiagnostics }>({
  diagnostics: [async ({ context }, use, testInfo) => {
    const diagnostics = new BrowserDiagnostics();
    context.pages().forEach(page => diagnostics.watch(page));
    context.on('page', page => diagnostics.watch(page));
    try { await use(diagnostics); }
    finally {
      // Locator assertions can attach a full DOM snapshot even when the runner's
      // automatic page snapshot is disabled. Authentication/pairing pages must
      // not be persisted in failure artifacts. Keep the assertion itself intact.
      for (const error of testInfo.errors) delete (error as { errorContext?: string }).errorContext;
    }
    await diagnostics.assertClean();
  }, { auto: true }],
});

export async function register(page: Page): Promise<DisposableAccount> {
  const account = { username: `qa_${randomUUID().replaceAll('-', '').slice(0, 16)}`, password: randomBytes(24).toString('base64url') };
  // Only fixture setup uses the dev-only API. Real email verification and
  // explicit OAuth consent are exercised in email-signup.spec.ts.
  const response = await page.request.post('/api/auth/register', { data: { ...account, displayName: 'Browser acceptance' } });
  expect(response.status()).toBe(201);
  await page.goto('/admin');
  await expect(page.locator('.workspace')).toBeVisible();
  return account;
}

export async function login(page: Page, account: DisposableAccount, path = '/admin') {
  const response = await page.request.post('/api/auth/login', { data: account });
  expect(response.status()).toBe(200);
  await page.goto(path);
  await expect(page.locator(path.startsWith('/view/') ? '.viewer-shell' : '.workspace')).toBeVisible();
}

export async function signOutWorkspace(page: Page) {
  const signOut = page.getByRole('button', { name: 'Sign out', exact: true });
  const navigation = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await navigation.isVisible() && await navigation.getAttribute('aria-expanded') !== 'true') await navigation.click();
  await signOut.click();
  await expect(page.getByRole('heading', { name: 'Welcome to KANVAS.' })).toBeVisible();
}

export async function createSession(page: Page, name: string): Promise<string> {
  const firstSession = page.getByRole('button', { name: 'Create your first session', exact: true });
  const headerAction = page.locator('.workspace-header').getByRole('button', { name: 'New session', exact: true });
  if (await firstSession.isVisible()) await firstSession.click();
  else if (await headerAction.isVisible()) await headerAction.click();
  else {
    const navigation = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await navigation.getAttribute('aria-expanded') !== 'true') await navigation.click();
    await page.locator('.workspace-sidebar').getByRole('button', { name: 'New session', exact: true }).click();
  }
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Session name', { exact: true }).fill(name);
  const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/sessions' && response.request().method() === 'POST');
  // Creation closes the dialog before the account-list refresh selects the new
  // session. Synchronize with that business response, not a premature UI timeout.
  const refreshed = page.waitForResponse(async response => {
    if (new URL(response.url()).pathname !== '/api/sessions' || response.request().method() !== 'GET' || !response.ok()) return false;
    const creation = await created;
    if (!creation.ok()) return false;
    const session = (await creation.json()).data;
    const sessions = (await response.json()).data;
    return Array.isArray(sessions) && sessions.some(item => item.id === session.id);
  });
  const [creation] = await Promise.all([created, refreshed, dialog.getByRole('button', { name: 'Create session', exact: true }).click()]);
  expect(creation.status()).toBe(200);
  const session = (await creation.json()).data;
  expect(session.name).toBe(name);
  await expect(dialog).toBeHidden();
  await expect(page.locator('.workspace-heading h1')).toHaveText(name);
  await expect.poll(() => new URL(page.url()).searchParams.get('session')).toBe(session.id);
  return session.id;
}

export async function createDisplay(page: Page, sessionId: string, name: string): Promise<DisplayRecord> {
  await tab(page, 'Displays');
  await page.getByRole('button', { name: 'Add display', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Display name', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Add display', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const detail = await sessionDetail(page, sessionId);
  const display = detail.displays.find(item => item.name === name);
  expect(display, 'New display is persisted').toBeDefined();
  return display!;
}

export async function tab(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Session workspace' }).getByRole('button', { name, exact: true }).click();
}

/** Run scoped business API requests inside the browser; never return auth headers or cookies. */
export async function sessionApi<T>(page: Page, path: string, method = 'GET', body?: unknown): Promise<{ status: number; data?: T; code?: string }> {
  const allowedAccountRead = method === 'GET' && ['/api/start', '/api/devices', '/api/account/details'].includes(path);
  const allowedWindowPresent = method === 'POST' && /^\/api\/devices\/[A-Za-z0-9_-]+\/windows\/[A-Za-z0-9_-]+\/present$/.test(path);
  if (!path.startsWith('/api/sessions') && path !== '/api/tokens' && !allowedAccountRead && !allowedWindowPresent) throw new Error('Browser fixture helper permits scoped session APIs, read-only account discovery, explicit window targeting and test token creation.');
  return page.evaluate(async ({ path, method, body }) => {
    const me = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
    if (!me.ok) return { status: me.status, code: 'FIXTURE_NOT_SIGNED_IN' };
    const auth = await me.json();
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Kanvas-CSRF': auth.data.csrfToken },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 204) return { status: response.status };
    const payload = await response.json();
    return { status: response.status, data: payload.data, code: payload.error?.code };
  }, { path, method, body }) as Promise<{ status: number; data?: T; code?: string }>;
}

export async function sessionDetail(page: Page, sessionId: string): Promise<SessionDetail> {
  const response = await sessionApi<SessionDetail>(page, `/api/sessions/${sessionId}`);
  expect(response.status, `Session state is available (${response.code ?? 'ok'})`).toBe(200);
  return response.data!;
}

export async function publishPrepared(page: Page, sessionId: string, displayIds: string[], view: ViewSpec): Promise<UpdateRecord> {
  const response = await sessionApi<UpdateRecord>(page, `/api/sessions/${sessionId}/submit`, 'POST', {
    requestId: randomUUID(), sessionId, displayIds, view,
  });
  expect(response.status, `Prepared visual is accepted (${response.code ?? 'ok'})`).toBeGreaterThanOrEqual(200);
  expect(response.status).toBeLessThan(300);
  // Submission returns an accepted receipt before PostgreSQL preparation commits.
  // Wait for this update (not a previous ready display); painting stays a separate
  // browser assertion, and held/failed outcomes remain available to their tests.
  await expect.poll(async () => {
    const update = (await sessionDetail(page, sessionId)).updates.find(item => item.id === response.data!.id);
    return update !== undefined && !['accepted', 'rendering'].includes(update.status);
  }, { intervals: [10, 25, 50, 100] }).toBe(true);
  return response.data!;
}

export async function waitForDisplay(page: Page, sessionId: string, displayId: string, check: (display: DisplayRecord) => boolean, options: { timeout?: number; message?: string } = {}): Promise<DisplayRecord> {
  let latest: DisplayRecord | undefined;
  await expect.poll(async () => {
    const detail = await sessionDetail(page, sessionId);
    latest = detail.displays.find(item => item.id === displayId);
    const pending = detail.updates.some(update => update.displayIds.includes(displayId) && ['accepted', 'rendering'].includes(update.status));
    return Boolean(!pending && latest && check(latest));
  }, { message: 'Display reaches the expected persisted state', ...options }).toBe(true);
  return latest!;
}

export async function selectTargets(page: Page, names: string[]) {
  const labels = page.locator('.target-choices label');
  for (const label of await labels.all()) {
    const text = await label.innerText();
    await label.locator('input[type=checkbox]').setChecked(names.some(name => text.includes(name)));
  }
}

export function viewerPath(sessionId: string, displayId: string) { return `/view/${sessionId}/${displayId}`; }

export async function openViewer(page: Page, sessionId: string, displayId: string): Promise<Page> {
  const viewer = await page.context().newPage();
  await viewer.goto(viewerPath(sessionId, displayId));
  await expect(viewer.locator('.viewer-shell')).toBeVisible();
  return viewer;
}

export async function isolatedContext(browser: Browser, testInfo: TestInfo, baseURL: string): Promise<BrowserContext> {
  const phone = testInfo.project.name.startsWith('phone');
  return browser.newContext({
    baseURL,
    viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    isMobile: phone,
    hasTouch: phone,
    deviceScaleFactor: phone ? 2 : 1,
    locale: 'en-GB',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
}

export async function expectFullSurface(page: Page) {
  await expect(page.locator('.viewer-shell')).toBeVisible();
  await expect(page.locator('.workspace-sidebar, .workspace-header, .workspace-tabs, .workspace-footer')).toHaveCount(0);
  await expect(page.locator('.viewer-menu')).toHaveCount(0);
  const geometry = await page.locator('.viewer-shell').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      viewportWidth: innerWidth, viewportHeight: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
    };
  });
  expect(Math.abs(geometry.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.width - geometry.viewportWidth)).toBeLessThanOrEqual(2);
  expect(Math.abs(geometry.height - geometry.viewportHeight)).toBeLessThanOrEqual(2);
  expect(geometry.documentWidth, 'No document-level horizontal overflow').toBeLessThanOrEqual(geometry.viewportWidth + 2);
  expect(geometry.documentHeight, 'No document-level vertical overflow').toBeLessThanOrEqual(geometry.viewportHeight + 2);
  const clippedContent = await page.locator('.viewer-shell').evaluate(element => {
    return [...element.querySelectorAll('.fact-text, .number-value, .view-heading h1, .chart-svg, .view-information>summary')]
      .map(node => ({ node, rect: node.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0)
      .filter(({ node, rect }) => rect.left < -2 || rect.top < -2 || rect.right > innerWidth + 2 || rect.bottom > innerHeight + 2 || node.scrollWidth > node.clientWidth + 2)
      .map(({ node }) => node.getAttribute('class'));
  });
  expect(clippedContent, 'Essential fact, number, chart and source content stays within the viewport').toEqual([]);
}

export async function captureDisplay(page: Page, testInfo: TestInfo, name: string) {
  await expectFullSurface(page);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}
