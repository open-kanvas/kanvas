import type { Response } from 'express';
import type { DisplayRecord } from '../shared/types.js';
import { Auth } from './auth.js';
import { AppError, id, now, Store } from './store.js';

/** Trusted result marker: arbitrary submitted content cannot become an MCP image block. */
export class VisualCaptureResult {
  constructor(readonly metadata: Record<string, unknown>, readonly image: Buffer, readonly mimeType = 'image/jpeg') {}
}

export class VisualCapture {
  private active = 0;
  private recent = new Map<string, number[]>();
  constructor(private readonly store: Store, private readonly auth: Auth, private readonly origin: string) {}
  async capture(userId: string, display: DisplayRecord, dimensions: { width?: number; height?: number }, recheck: () => Promise<Awaited<DisplayRecord>>): Promise<VisualCaptureResult> {
    for (const [account, times] of this.recent) if (!times.some(time => Date.now() - time < 60_000)) this.recent.delete(account);
    const recent = (this.recent.get(userId) ?? []).filter(time => Date.now() - time < 60_000);
    if (this.active >= 2 || recent.length >= 6) throw new AppError('SNAPSHOT_BUSY', 'Snapshot capacity is busy. Retry shortly; maximum six captures per account per minute.', 429);
    this.recent.set(userId, [...recent, Date.now()]); this.active++;
    const pairingId = id(), createdAt = now(), deadline = Date.now() + 45_000;
    let browser: import('playwright').Browser | undefined, sessionId: string | undefined;
    const width = Math.max(320, Math.min(1920, dimensions.width ?? display.width)), height = Math.max(240, Math.min(1080, dimensions.height ?? display.height));
    try {
      const { chromium } = await import('playwright');
      browser = await chromium.launch({ headless: true, timeout: 15_000 });
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: false });
      let cookieValue = '';
      const capturePairing = { id: pairingId, sessionId: display.sessionId, displayId: display.id, ownerId: userId, status: 'approved', createdAt, decidedAt: createdAt, claimedAt: createdAt, expiresAt: new Date(deadline).toISOString(), grantExpiresAt: deadline, purpose: 'visual-capture', deviceName: 'Isolated visual inspection', label: 'Isolated visual inspection', proofHash: 'capture-only-no-public-claim' };
      (await this.store.put('pairing', capturePairing));
      const session = (await this.auth.issueBrowser(userId, { cookie: (_name: string, value: string) => { cookieValue = value; } } as unknown as Response, { scopedSessionId: display.sessionId, scopedDisplayId: display.id, pairingId, captureOnly: true }));
      session.expiresAt = deadline; (await this.store.put('browser', session)); sessionId = session.id;
      (await this.store.put('pairing', {...capturePairing, browserSessionId: session.id}));
      await context.addCookies([{ name: this.auth.cookieName, value: cookieValue, url: this.origin, httpOnly: true, secure: this.origin.startsWith('https:'), sameSite: 'Strict' }]);
      cookieValue = '';
      let blockedExternal = 0;
      const prefix = `/api/sessions/${encodeURIComponent(display.sessionId)}`;
      await context.route('**/*', route => {
        const request = route.request();
        let url: URL; try { url = new URL(request.url()); } catch { return route.abort(); }
        // This reads our own renderer only. Never let user-selected media URLs
        // turn the headless browser into an internal-network/credential proxy.
        if (url.origin !== this.origin) { blockedExternal++; return route.abort(); }
        // The normal privacy boundary must obtain status; never bypass it for capture.
        const allowed = url.pathname === `/view/${display.sessionId}/${display.id}` || url.pathname === '/api/auth/me' || url.pathname === '/api/device-privacy/status' || url.pathname === '/api/map/config' || url.pathname === `${prefix}/displays/${display.id}/overview` || url.pathname === prefix || url.pathname === `${prefix}/events` || url.pathname.startsWith('/api/assets/') || url.pathname.startsWith('/assets/');
        if (!allowed || !['GET', 'HEAD'].includes(request.method())) return route.abort();
        return route.continue();
      });
      const page = await context.newPage();
      page.on('pageerror', () => {});
      await page.goto(`${this.origin}/view/${encodeURIComponent(display.sessionId)}/${encodeURIComponent(display.id)}`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      let readiness = 'timed_out';
      try { await page.waitForFunction(() => ['ready', 'failed'].includes(document.querySelector<HTMLElement>('.viewer-shell')?.dataset.renderStatus ?? ''), undefined, { timeout: 20_000 }); } catch { /* Capture the observable failure/loading surface with its label. */ }
      // Font and image readiness are bounded: broken/external media must not
      // hang capture. A separate settle window covers async layout and charts.
      await page.evaluate(async () => {
        await Promise.race([
          Promise.all([document.fonts.ready, ...Array.from(document.images).map(image => image.complete ? Promise.resolve() : new Promise<void>(resolve => { image.addEventListener('load', () => resolve(), {once:true}); image.addEventListener('error', () => resolve(), {once:true}); }))]),
          new Promise(resolve => setTimeout(resolve, 2500)),
        ]);
      });
      await page.waitForTimeout(1500);
      const observed = await page.locator('.viewer-shell').evaluate(element => ({ revision: Number((element as HTMLElement).dataset.revision), renderedRevision: Number((element as HTMLElement).dataset.renderedRevision), status: (element as HTMLElement).dataset.renderStatus ?? 'unavailable' })).catch(() => null);
      if (observed) readiness = observed.status;
      const current = (await recheck());
      if (current.revision !== display.revision || observed?.revision !== display.revision) throw new AppError('SNAPSHOT_CHANGED', 'The display changed during capture. Retry against the new revision.', 409);
      const bytes = await page.screenshot({ type: 'jpeg', quality: 72, animations: 'disabled', caret: 'hide', timeout: 8000 });
      // Screenshotting is asynchronous too: permission or revision can change
      // while Chromium encodes the image. Never return a revoked/stale capture.
      if ((await recheck()).revision !== display.revision) throw new AppError('SNAPSHOT_CHANGED', 'The display changed during capture. Retry against the new revision.', 409);
      if (bytes.length > 2 * 1024 * 1024) throw new AppError('SNAPSHOT_TOO_LARGE', 'Capture exceeds the supported image limit. Use a smaller viewport.', 413);
      return new VisualCaptureResult({ displayId: display.id, sessionId: display.sessionId, revision: display.revision, renderedRevision: observed?.renderedRevision, capturedAt: now(), width, height, source: 'isolated-server-browser', settleMs: 1500, readiness, blockedExternalRequests: blockedExternal, observedViewer: { online: display.online, appliedRevision: display.appliedRevision, delivery: display.delivery }, note: 'Actual KANVAS renderer in an isolated browser, not the physical audience screen. No viewer acknowledgement was sent. External media is blocked in this capture.' }, bytes);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('SNAPSHOT_UNAVAILABLE', 'The server browser could not capture this view. Verify Chromium installation and use the viewer URL for inspection.', 503);
    } finally {
      await browser?.close().catch(() => {});
      if (sessionId) (await this.store.delete('browser', sessionId));
      (await this.store.delete('pairing', pairingId)); this.active--;
    }
  }
}
