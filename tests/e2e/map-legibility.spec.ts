import type { Page, TestInfo } from '@playwright/test';
import { samples } from '../../src/shared/template-examples';
import type { ViewSpec } from '../../src/shared/types';
import { validateView } from '../../src/shared/view-schemas';
import { captureDisplay, createDisplay, createSession, expect, openViewer, publishPrepared, register, sessionDetail, test, waitForDisplay } from './support';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const safeArea = { top: 24, left: 12, right: 12, bottom: 34 };
interface MapSurface extends HTMLElement { kanvasCoordinate(x: number, y: number): { lat: number; lng: number } }

test.beforeEach(async ({ context, baseURL }) => {
  // Deterministic synthetic tiles; neither map configuration nor these checks
  // need an external request. Legal attribution is still rendered unchanged.
  await context.route('**/api/map/config', route => route.fulfill({ json: { data: {
    url: `${baseURL}/map-legibility-tiles/{z}/{x}/{y}.png`,
    attribution: 'OpenStreetMap contributors', attributionUrl: 'https://www.openstreetmap.org/copyright',
  } } }));
  await context.route('**/map-legibility-tiles/**', route => route.fulfill({ contentType: 'image/png', body: PNG }));
});

async function setup(page: Page, controlClock = false) {
  await register(page);
  const sessionId = await createSession(page, 'Map overlay legibility'), display = await createDisplay(page, sessionId, 'Map screen');
  let viewer: Page;
  if (controlClock) {
    viewer = await page.context().newPage();
    // Install before Leaflet imports: it captures the browser's RAF functions.
    await viewer.clock.install();
    await viewer.goto(`/view/${sessionId}/${display.id}`);
    await expect(viewer.locator('.viewer-shell')).toBeVisible();
  } else viewer = await openViewer(page, sessionId, display.id);
  await viewer.bringToFront();
  return { sessionId, displayId: display.id, viewer };
}
async function show(page: Page, viewer: Page, sessionId: string, displayId: string, view: ViewSpec) {
  view = validateView(view);
  const before = (await sessionDetail(page, sessionId)).displays.find(value => value.id === displayId)!.revision;
  await publishPrepared(page, sessionId, [displayId], view);
  const current = await waitForDisplay(page, sessionId, displayId, value => value.revision > before && value.appliedRevision === value.revision);
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision', String(current.revision));
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status', 'ready');
  await expect(viewer.locator('.map-geometry-note')).toHaveText('Supplied path · not turn-by-turn navigation');
  await expect(viewer.locator('.map-status')).toHaveCount(0);
  await painted(viewer);
  expect(current.view?.data).toEqual(view.data);
}
const painted = (viewer: Page) => viewer.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
async function settledViewport(viewer: Page, size: { width: number; height: number }) {
  // CSS layout, the emulated visual viewport, and its hit-test paint can settle
  // separately after resizing or clearing synthetic safe-area insets.
  await expect.poll(() => viewer.locator('.viewer-shell').evaluate(element => {
    const visual = window.visualViewport;
    return { width: element.clientWidth, height: element.clientHeight, visibleWidth: visual?.width ?? innerWidth, visibleHeight: visual?.height ?? innerHeight, scale: visual?.scale ?? 1 };
  })).toEqual({ ...size, visibleWidth: size.width, visibleHeight: size.height, scale: 1 });
  await painted(viewer);
}
async function legible(viewer: Page, { safe = { top: 0, left: 0, right: 0, bottom: 0 }, presentation = false } = {}) {
  const geometry = await viewer.evaluate(() => {
    const selectors = {
      map: '.map-surface', frame: '.template-map > .render-body', note: '.map-geometry-note',
      qualification: '.template-map > .view-qualification', attribution: '.leaflet-control-attribution',
      menu: '.viewer-menu-toggle', zoom: '.leaflet-control-zoom', fit: '.map-recenter',
      previous: '.presentation-controls > button[aria-label="Previous slide"]', next: '.presentation-controls > button[aria-label="Next slide"]',
    };
    const boxes: Record<string, { x: number; y: number; width: number; height: number; right: number; bottom: number; font: number; uncovered: boolean; fitsText: boolean }> = {};
    const occlusions: unknown[] = [];
    for (const [name, selector] of Object.entries(selectors)) {
      const element = document.querySelector<HTMLElement>(selector); if (!element) continue;
      const rect = element.getBoundingClientRect(), previous = element.style.pointerEvents;
      // Pointer-transparent truth labels still need an occlusion test: this
      // temporary hit-test change does not change their layout or stacking.
      element.style.pointerEvents = 'auto';
      const uncovered = [.2, .5, .8].every(x => {
        const hit = document.elementFromPoint(rect.left + rect.width * x, rect.top + rect.height / 2);
        const ownsHit = hit === element || element.contains(hit);
        if (!ownsHit) occlusions.push({ name, x: rect.left + rect.width * x, y: rect.top + rect.height / 2,
          tag: hit?.tagName, className: hit?.getAttribute('class'), stage: hit?.closest('.viewer-candidate,.viewer-last-good')?.className,
          selectedStage: element.closest('.viewer-candidate,.viewer-last-good')?.className });
        return ownsHit;
      });
      element.style.pointerEvents = previous;
      boxes[name] = { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom,
        font: parseFloat(getComputedStyle(element).fontSize), uncovered, fitsText: element.scrollWidth <= element.clientWidth + 1 };
    }
    return { boxes, viewport: { width: innerWidth, height: innerHeight }, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight,
      occlusions, visualViewport: window.visualViewport && { width: visualViewport!.width, height: visualViewport!.height, offsetLeft: visualViewport!.offsetLeft, offsetTop: visualViewport!.offsetTop, scale: visualViewport!.scale }, scroll: { x: scrollX, y: scrollY } };
  });
  if (geometry.occlusions.length) {
    await test.info().attach('map-occlusion-geometry', { body: Buffer.from(JSON.stringify(geometry, null, 2)), contentType: 'application/json' });
    await test.info().attach('map-occlusion-screen', { body: await viewer.screenshot(), contentType: 'image/png' });
  }
  const { boxes, viewport } = geometry;
  expect(boxes.map.width).toBe(boxes.frame.width); expect(boxes.map.height).toBe(boxes.frame.height);
  if (!presentation) { expect(boxes.map.width).toBe(viewport.width); expect(boxes.map.height).toBe(viewport.height); }
  expect(geometry.documentWidth).toBeLessThanOrEqual(viewport.width + 1); expect(geometry.documentHeight).toBeLessThanOrEqual(viewport.height + 1);
  const names = ['note', 'attribution', 'menu', ...(boxes.zoom ? ['zoom', 'fit'] : []), ...(presentation ? ['previous', 'next'] : [])];
  for (const name of names) {
    const box = boxes[name]; expect(box, name).toBeDefined();
    expect(box.x, `${name}: safe left`).toBeGreaterThanOrEqual(safe.left); expect(box.right, `${name}: safe right`).toBeLessThanOrEqual(viewport.width - safe.right + .5);
    expect(box.y, `${name}: safe top`).toBeGreaterThanOrEqual(safe.top); expect(box.bottom, `${name}: safe bottom`).toBeLessThanOrEqual(viewport.height - safe.bottom + .5);
    expect(box.uncovered, `${name}: not covered by another layer`).toBe(true); expect(box.fitsText, `${name}: text is not clipped`).toBe(true);
  }
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = boxes[names[i]], b = boxes[names[j]];
    expect(a.x < b.right - .5 && a.right > b.x + .5 && a.y < b.bottom - .5 && a.bottom > b.y + .5, `${names[i]} and ${names[j]} do not overlap`).toBe(false);
  }
  expect(boxes.note.font).toBeGreaterThanOrEqual(16); expect(boxes.attribution.font).toBeGreaterThanOrEqual(14);
  expect(boxes.menu.width).toBeGreaterThanOrEqual(44); expect(boxes.menu.height).toBeGreaterThanOrEqual(44);
  await expect(viewer.locator('.view-qualification')).toHaveCount(0);
  const attribution = viewer.getByRole('link', { name: 'OpenStreetMap contributors', exact: true });
  await expect(attribution).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
  await attribution.focus(); await expect(attribution).toBeFocused(); await attribution.evaluate(element => (element as HTMLElement).blur());
  return geometry;
}
const mapScale = (viewer: Page) => viewer.locator('.map-surface').evaluate(element => {
  const surface = element as MapSurface, rect = surface.getBoundingClientRect();
  const center = surface.kanvasCoordinate(rect.x + rect.width / 2, rect.y + rect.height / 2), offset = surface.kanvasCoordinate(rect.x + rect.width / 2 + 24, rect.y + rect.height / 2);
  return Math.abs(offset.lng - center.lng);
});
async function cameraSettled(viewer: Page) {
  // Leaflet updates its reported coordinates at animation start but ignores
  // another zoom/fit or drag until the visible transition has finished.
  await expect(viewer.locator('.map-surface .leaflet-zoom-anim')).toHaveCount(0);
  await painted(viewer);
}

test('map truth labels and legal links stay uncovered across phone widths, safe areas, and gesture controls', async ({ page }, info: TestInfo) => {
  const { sessionId, displayId, viewer } = await setup(page), phone = info.project.name.startsWith('phone');
  const sizes = phone ? [{ width: 390, height: 844 }, { width: 443, height: 823 }] : [{ width: 1440, height: 900 }];
  const cdp = await viewer.context().newCDPSession(viewer);
  for (const size of sizes) {
    await viewer.setViewportSize(size);
    await settledViewport(viewer, size);
    await show(page, viewer, sessionId, displayId, structuredClone(samples.map));
    await expect(viewer.locator('.map-recenter,.leaflet-control-zoom')).toHaveCount(0);
    await legible(viewer); await captureDisplay(viewer, info, `map-corners-${size.width}`);
    await viewer.getByRole('button', { name: 'Display controls', exact: true }).click();
    await expect(viewer.locator('.viewer-menu')).toBeVisible();
    const menu = await viewer.locator('.viewer-menu').boundingBox(), attribution = await viewer.locator('.leaflet-control-attribution').boundingBox();
    expect(menu!.y + menu!.height).toBeLessThanOrEqual(attribution!.y);
    await viewer.getByRole('button', { name: 'Display controls', exact: true }).click();
    await expect(viewer.locator('.viewer-menu')).toHaveCount(0);
    await show(page, viewer, sessionId, displayId, { ...structuredClone(samples.map), showControls: true });
    await legible(viewer);
    const scale = await mapScale(viewer);
    await viewer.getByRole('button', { name: 'Zoom in', exact: true }).click(); await expect.poll(() => mapScale(viewer)).toBeLessThan(scale * .75);
    await cameraSettled(viewer);
    await viewer.getByRole('button', { name: 'Fit all locations', exact: true }).click(); await expect.poll(async () => Math.abs((await mapScale(viewer)) - scale)).toBeLessThan(scale * .01);
    await cameraSettled(viewer);
    const center = () => viewer.locator('.map-surface').evaluate(element => { const surface = element as MapSurface, r = surface.getBoundingClientRect(); return surface.kanvasCoordinate(r.x + r.width / 2, r.y + r.height / 2); });
    const before = await center(), point = { x: size.width / 2, y: size.height * .65 };
    if (phone) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + i * 10, y: point.y + i * 6 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await viewer.mouse.move(point.x, point.y); await viewer.mouse.down(); await viewer.mouse.move(point.x + 50, point.y + 30, { steps: 5 }); await viewer.mouse.up();
    }
    await expect.poll(async () => Math.abs((await center()).lng - before.lng)).toBeGreaterThan(.000001);
    if (phone) {
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: safeArea });
      await expect.poll(() => viewer.locator('.map-notices').evaluate(element => element.getBoundingClientRect().top)).toBe(safeArea.top);
      await painted(viewer);
      await legible(viewer, { safe: safeArea }); await captureDisplay(viewer, info, `map-safe-area-${size.width}`);
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 0, right: 0, bottom: 0 } });
      await expect.poll(() => viewer.locator('.map-content').evaluate(element => ({
        top: element.querySelector('.map-notices')!.getBoundingClientRect().top,
        bottomInset: parseFloat(getComputedStyle(element.querySelector('.leaflet-bottom.leaflet-right')!).bottom),
      }))).toEqual({ top: 10, bottomInset: 10 });
      await painted(viewer);
    }
  }
  await cdp.detach();
});

test('a presentation map preserves attribution and safe navigation, then releases map-only menu placement', async ({ page }, info) => {
  const { sessionId, displayId, viewer } = await setup(page, true), phone = info.project.name.startsWith('phone');
  const cdp = await viewer.context().newCDPSession(viewer);
  if (phone) await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: safeArea });
  const leaf = { ...structuredClone(samples.map), showControls: true };
  await show(page, viewer, sessionId, displayId, { version: 1, template: 'presentation', showControls: true, data: { index: 0, slides: [leaf, { version: 1, template: 'fact', data: { text: 'Next supplied slide.' } }] } });
  await legible(viewer, { presentation: true, ...(phone ? { safe: safeArea } : {}) });
  await captureDisplay(viewer, info, 'map-presentation-corners');
  const scale = await mapScale(viewer);
  await viewer.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(() => mapScale(viewer)).toBeLessThan(scale * .75);
  // Hold animation callbacks while a real fit and publication replace this
  // leaf. Releasing them must not redraw the disposed Canvas. Public browser
  // clock control makes the teardown regression deterministic, without touching
  // Leaflet internals or suppressing any application errors.
  await viewer.clock.pauseAt((await viewer.evaluate(() => Date.now())) + 1000);
  await viewer.evaluate(() => {
    document.querySelector<HTMLButtonElement>('.map-recenter')!.click();
    document.querySelector<HTMLButtonElement>('.presentation-controls > button[aria-label="Next slide"]')!.click();
  });
  await expect(viewer.locator('.fact-text')).toHaveText('Next supplied slide.');
  await expect(viewer.locator('.map-content')).toHaveCount(0);
  await viewer.clock.runFor(100); await viewer.clock.resume();
  const toggle = await viewer.getByRole('button', { name: 'Display controls', exact: true }).boundingBox();
  expect(toggle!.y).toBeGreaterThan(viewer.viewportSize()!.height - 100);
  await cdp.detach();
});
