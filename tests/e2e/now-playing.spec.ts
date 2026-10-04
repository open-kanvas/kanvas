import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import type { AssetRecord, UpdateRecord, ViewSpec } from '../../src/shared/types';
import type { NowPlayingData } from '../../src/shared/now-playing';
import { captureDisplay, createDisplay, createSession, expect, openViewer, publishPrepared, register, sessionApi, sessionDetail, test, waitForDisplay } from './support';

const base = { track: 'Open Water', artist: 'Ingrid Sol' };
const snapshot = (extra: Partial<NowPlayingData> = {}): ViewSpec => ({ version: 1, template: 'now-playing', title: 'Audio display', data: { ...base, ...extra } });

async function setup(page: Page) {
  await register(page); const sessionId = await createSession(page, 'Passive now-playing acceptance'), display = await createDisplay(page, sessionId, 'Audio information');
  const viewer = await openViewer(page, sessionId, display.id); await viewer.bringToFront();
  return { sessionId, displayId: display.id, viewer };
}

async function ready(page: Page, viewer: Page, sessionId: string, displayId: string, revision = 1) {
  await waitForDisplay(page, sessionId, displayId, value => value.revision === revision && value.appliedRevision === revision);
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status', 'ready');
  await expect(viewer.locator('.now-playing-track')).toBeVisible();
}

async function artwork(page: Page, sessionId: string, alternate = false): Promise<AssetRecord> {
  // A locally generated, explicitly supplied acceptance image, never an online
  // cover lookup or an image manufactured by the now-playing renderer.
  const base64 = await page.evaluate(alternate => {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
    const context = canvas.getContext('2d')!;
    context.fillStyle = alternate ? '#412941' : '#123a46'; context.fillRect(0, 0, 512, 512);
    context.fillStyle = '#ecb477'; context.beginPath(); context.arc(350, 172, 93, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#2f8291'; context.fillRect(0, 290, 512, 222);
    context.fillStyle = '#f8eee0'; context.font = '500 38px sans-serif'; context.fillText('OPEN WATER', 38, 405);
    context.font = '24px sans-serif'; context.fillText('INGRID SOL', 40, 452);
    return canvas.toDataURL('image/png').split(',')[1];
  }, alternate);
  const asset = await sessionApi<AssetRecord>(page, `/api/sessions/${sessionId}/assets`, 'POST', { name: alternate ? 'Alternate supplied artwork.png' : 'Supplied artwork.png', mimeType: 'image/png', base64 });
  expect(asset.status).toBe(201); return asset.data!;
}

async function assertFit(viewer: Page) {
  const geometry = await viewer.locator('.now-playing-content').evaluate(element => {
    const art = element.querySelector<HTMLImageElement>('.now-playing-artwork img')!, title = element.querySelector<HTMLElement>('.now-playing-track')!, artist = element.querySelector<HTMLElement>('.now-playing-artist')!;
    const frame = element.getBoundingClientRect(), bounds = art.getBoundingClientRect();
    return { width: frame.width, artWidth: bounds.width, artHeight: bounds.height, center: Math.abs((bounds.left + bounds.right) / 2 - (frame.left + frame.right) / 2), naturalWidth: art.naturalWidth,
      titleSize: parseFloat(getComputedStyle(title).fontSize), artistSize: parseFloat(getComputedStyle(artist).fontSize),
      contained: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1,
      allVisible: [...element.querySelectorAll('.now-playing-artwork,.now-playing-details')].every(child => { const box = child.getBoundingClientRect(); return box.left >= frame.left - 1 && box.right <= frame.right + 1 && box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1; }),
    };
  });
  expect(geometry.naturalWidth).toBe(512); expect(geometry.artWidth).toBeGreaterThan(Math.min(300, geometry.width * .8));
  expect(geometry.artWidth).toBeCloseTo(geometry.artHeight, 0); expect(geometry.center).toBeLessThan(2);
  expect(geometry.titleSize).toBeGreaterThanOrEqual(32); expect(geometry.artistSize).toBeGreaterThanOrEqual(22);
  expect(geometry.contained).toBe(true); expect(geometry.allVisible).toBe(true);
}

test('real supplied artwork dominates a readable passive display at phone and desktop sizes', async ({ page }, info) => {
  const { sessionId, displayId, viewer } = await setup(page), asset = await artwork(page, sessionId);
  const outsideRequests: string[] = [], origin = new URL(viewer.url()).origin;
  viewer.on('request', request => { if (new URL(request.url()).origin !== origin) outsideRequests.push(request.url()); });
  await publishPrepared(page, sessionId, [displayId], snapshot({ album: 'Night Sessions', artwork: { url: asset.url, alt: 'Supplied Open Water album cover' }, state: 'paused', elapsedSeconds: 72.5, durationSeconds: 248 }));
  await ready(page, viewer, sessionId, displayId);
  await expect(viewer.getByRole('img', { name: 'Supplied Open Water album cover' })).toBeVisible();
  await expect(viewer.locator('.now-playing-track')).toHaveText(base.track); await expect(viewer.locator('.now-playing-artist')).toHaveText(base.artist);
  await expect(viewer.locator('.now-playing-album')).toHaveText('Night Sessions'); await expect(viewer.locator('.now-playing-state')).toHaveText('Paused');
  await expect(viewer.locator('.now-playing-elapsed')).toHaveText('1:12.5'); await expect(viewer.locator('.now-playing-duration')).toHaveText('4:08');
  await expect(viewer.locator('.render-body button,.render-body audio,.render-body video,.render-body input,.view-heading')).toHaveCount(0);
  await assertFit(viewer); await captureDisplay(viewer, info, 'now-playing-artwork');
  if (info.project.name.startsWith('phone')) {
    const resizedViewport = { width: 443, height: 823 };
    await viewer.setViewportSize(resizedViewport);
    await expect.poll(() => viewer.locator('.viewer-shell').evaluate(element => {
      const { width, height } = element.getBoundingClientRect(); return { width, height };
    }), { message: 'Artwork surface receives the requested phone viewport' }).toEqual(resizedViewport);
    await assertFit(viewer); await captureDisplay(viewer, info, 'now-playing-artwork-443');
  }
  expect(outsideRequests).toEqual([]);
});

test('supplied playing progress never ticks or extrapolates, including a wake, and changes only with a revision', async ({ page }) => {
  const { sessionId, displayId, viewer } = await setup(page);
  await publishPrepared(page, sessionId, [displayId], snapshot({ state: 'playing', elapsedSeconds: 360005.125, durationSeconds: 400000.25, observedAt: '2025-01-01T00:00:00Z' }));
  await ready(page, viewer, sessionId, displayId);
  const progress = viewer.getByRole('progressbar', { name: 'Supplied playback position' });
  const before = await progress.getAttribute('aria-valuenow'), beforeWidth = await progress.locator('span').getAttribute('style');
  await viewer.clock.install(); await viewer.clock.fastForward(120_000);
  const current = await viewer.evaluate(() => Date.now()); await viewer.clock.setSystemTime(new Date(current + 86_400_000));
  await viewer.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow')));
  await expect(progress).toHaveAttribute('aria-valuenow', before!); await expect(progress.locator('span')).toHaveAttribute('style', beforeWidth!);
  await expect(viewer.locator('.now-playing-elapsed')).toHaveText('100:00:05.125'); await expect(viewer.locator('.now-playing-state')).toHaveText('Playing');
  expect((await sessionDetail(page, sessionId)).displays.find(value => value.id === displayId)!.revision).toBe(1);
  const updated = await sessionApi<UpdateRecord>(page, `/api/sessions/${sessionId}/displays/${displayId}/patch`, 'POST', { requestId: randomUUID(), expectedRevision: 1, operations: [{ op: 'set', path: '/data/elapsedSeconds', value: 360010.25 }, { op: 'set', path: '/data/state', value: 'paused' }] });
  expect(updated.status).toBeGreaterThanOrEqual(200); expect(updated.status).toBeLessThan(300); await ready(page, viewer, sessionId, displayId, 2);
  await expect(progress).toHaveAttribute('aria-valuenow', '360010.25'); await expect(viewer.locator('.now-playing-elapsed')).toHaveText('100:00:10.25'); await expect(viewer.locator('.now-playing-state')).toHaveText('Paused');
});

test('missing artwork and partial timing never create placeholders or inferred progress; long supplied text stays readable', async ({ page }, info) => {
  const { sessionId, displayId, viewer } = await setup(page);
  await publishPrepared(page, sessionId, [displayId], snapshot({ album: 'Night Sessions', durationSeconds: 248 })); await ready(page, viewer, sessionId, displayId);
  await expect(viewer.locator('.now-playing-content')).toHaveClass(/now-playing-text-only/);
  await expect(viewer.locator('.now-playing-content img,.now-playing-artwork-error,.now-playing-state,.now-playing-elapsed')).toHaveCount(0);
  await expect(viewer.getByRole('progressbar')).toHaveCount(0); await expect(viewer.locator('.now-playing-duration')).toHaveText('Duration 4:08');
  await captureDisplay(viewer, info, 'now-playing-no-artwork');
  const long = { track: 'A very long supplied audio title '.repeat(14), artist: 'An exact supplied list of credited artists '.repeat(10), album: 'Album details remain available without truncation. '.repeat(9), elapsedSeconds: 61.25 };
  await publishPrepared(page, sessionId, [displayId], snapshot(long)); await ready(page, viewer, sessionId, displayId, 2);
  await expect(viewer.locator('.now-playing-track')).toHaveText(long.track); await expect(viewer.locator('.now-playing-artist')).toHaveText(long.artist); await expect(viewer.locator('.now-playing-album')).toHaveText(long.album);
  await expect(viewer.getByRole('progressbar')).toHaveCount(0); await expect(viewer.locator('.now-playing-duration')).toHaveCount(0);
  const scroll = viewer.locator('.now-playing-content');
  expect(await scroll.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await scroll.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await scroll.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const ending = await viewer.locator('.now-playing-elapsed').boundingBox(); expect(ending).not.toBeNull();
  expect(ending!.y).toBeGreaterThanOrEqual(0); expect(ending!.y + ending!.height).toBeLessThanOrEqual(viewer.viewportSize()!.height);
  await expect(viewer.locator('.now-playing-elapsed')).toHaveText('Elapsed 1:01.25');
});

test('a now-playing revision waits for actual artwork bytes and rejects a premature load event', async ({ page }) => {
  const { sessionId, displayId, viewer } = await setup(page), asset = await artwork(page, sessionId);
  const match = (url: URL) => url.pathname === asset.url;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await viewer.route(match, async route => { await held; await route.continue(); });
  try {
    const requested = viewer.waitForRequest(request => new URL(request.url()).pathname === asset.url);
    await publishPrepared(page, sessionId, [displayId], snapshot({ artwork: { url: asset.url, alt: 'Delayed supplied cover' } })); await requested;
    await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status', 'pending');
    await expect(viewer.getByText('Loading media…', { exact: true })).toBeVisible();
    const image = viewer.locator('.now-playing-artwork img'); expect(await image.evaluate(element => (element as HTMLImageElement).complete)).toBe(false);
    await image.dispatchEvent('load');
    await viewer.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const waiting = (await sessionDetail(page, sessionId)).displays.find(value => value.id === displayId)!;
    expect(waiting.revision).toBe(1); expect(waiting.appliedRevision ?? 0).toBeLessThan(1);
    release(); await ready(page, viewer, sessionId, displayId);
    await expect(viewer.locator('.now-playing-artwork')).toHaveAttribute('data-load-status', 'ready');
    expect(await image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(512);
  } finally { release(); await viewer.unroute(match); }
});

test('failed replacement artwork retains the real previous view and a newer supplied image can recover', async ({ page, diagnostics }) => {
  const { sessionId, displayId, viewer } = await setup(page), good = await artwork(page, sessionId), broken = await artwork(page, sessionId, true);
  await publishPrepared(page, sessionId, [displayId], snapshot({ artwork: { url: good.url, alt: 'Previously painted cover' } })); await ready(page, viewer, sessionId, displayId);
  await viewer.locator('.now-playing-artwork img').evaluate(element => element.setAttribute('data-original-node', 'yes'));
  const match = (url: URL) => url.pathname === broken.url;
  diagnostics.allowHttp(viewer, broken.url, 404);
  let unavailable = true;
  // Keep interception (and its cache mode) stable while the source recovers.
  await viewer.route(match, route => unavailable ? route.fulfill({ status: 404, contentType: 'text/plain', body: 'Supplied artwork unavailable in this acceptance case' }) : route.continue());
  await publishPrepared(page, sessionId, [displayId], snapshot({ track: 'Unpainted replacement', artwork: { url: broken.url, alt: 'Unavailable new cover' } }));
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status', 'failed');
  const failed = await waitForDisplay(page, sessionId, displayId, value => value.revision === 2 && value.delivery?.status === 'failed');
  expect(failed.appliedRevision).toBe(1);
  await expect(viewer.locator('.viewer-last-good .now-playing-track')).toHaveText(base.track);
  await expect(viewer.locator('.viewer-last-good .now-playing-artwork img')).toHaveAttribute('data-original-node', 'yes');
  unavailable = false;
  const recoveredBytes = viewer.waitForResponse(response => new URL(response.url()).pathname === broken.url && response.status() === 200);
  await publishPrepared(page, sessionId, [displayId], snapshot({ track: 'Recovered supplied title', artwork: { url: broken.url, alt: 'Recovered supplied cover' } }));
  await recoveredBytes; await ready(page, viewer, sessionId, displayId, 3);
  await expect(viewer.locator('.now-playing-track')).toHaveText('Recovered supplied title'); await expect(viewer.locator('.viewer-last-good')).toHaveCount(0);
  expect(await viewer.locator('.now-playing-artwork img').evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(512);
  await viewer.unroute(match);
});
