import { mkdir, writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { AssetRecord, ViewSpec } from '../../src/shared/types';
import type { AnnotationInput } from '../../src/shared/viewer-experience';
import type { ImageEntry } from '../../src/client/renderers/Image';
import { validateView } from '../../src/shared/view-schemas';
import { createDisplay, createSession, expect, openViewer, publishPrepared, register, sessionApi, sessionDetail, test, waitForDisplay } from './support';

const shapes = [{ name: 'landscape', width: 1200, height: 800 }, { name: 'portrait', width: 800, height: 1200 }, { name: 'square', width: 900, height: 900 }];
const exactCaption = '  Exact supplied caption.\nSecond line with retained trailing spaces.  ';
const exactAlt = '  Complete supplied image, including all four corners.  ';

async function setup(page: Page) {
  await register(page);
  const sessionId = await createSession(page, 'Full-frame original images'), display = await createDisplay(page, sessionId, 'Image receiving screen');
  const viewer = await openViewer(page, sessionId, display.id);
  await viewer.bringToFront();
  return { sessionId, display, viewer };
}

async function uploadImages(page: Page, sessionId: string) {
  // Real browser-generated PNG files enter through the ordinary protected asset API.
  const files = await page.evaluate(shapes => shapes.map(shape => {
    const canvas = document.createElement('canvas'); canvas.width = shape.width; canvas.height = shape.height;
    const context = canvas.getContext('2d')!;
    for (const [x, y, color] of [[0, 0, '#de4d3f'], [.5, 0, '#37a472'], [0, .5, '#356ecd'], [.5, .5, '#e4b64d']] as const) {
      context.fillStyle = color; context.fillRect(x * canvas.width, y * canvas.height, canvas.width / 2, canvas.height / 2);
    }
    context.strokeStyle = '#fff'; context.lineWidth = 12; context.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
    context.fillStyle = '#fff'; context.font = '48px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(shape.name, canvas.width / 2, canvas.height / 2);
    return { name: `Supplied ${shape.name}.png`, mimeType: 'image/png', base64: canvas.toDataURL('image/png').split(',')[1] };
  }), shapes);
  const assets: AssetRecord[] = [];
  for (const file of files) {
    const response = await sessionApi<AssetRecord>(page, `/api/sessions/${sessionId}/assets`, 'POST', file);
    expect(response.status).toBe(201); assets.push(response.data!);
  }
  return assets;
}

const imageEntry = (asset: AssetRecord, extra: Partial<ImageEntry> = {}): ImageEntry => ({ url: asset.url, alt: exactAlt, caption: exactCaption, ...extra });
const imageView = (images: ImageEntry[], options: Partial<ViewSpec> = {}): ViewSpec => validateView({ version: 1, template: 'image', title: 'Retained original collection title', source: { title: 'Locally generated acceptance image', url: images[0].url, locator: 'Original protected asset; all source pixels retained', timestamp: '2026-09-14T12:00:00Z' }, data: { images }, ...options });
const twoFrames = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

async function show(page: Page, viewer: Page, sessionId: string, displayId: string, view: ViewSpec) {
  const previous = (await sessionDetail(page, sessionId)).displays.find(display => display.id === displayId)!.revision;
  await publishPrepared(page, sessionId, [displayId], view);
  const current = await waitForDisplay(page, sessionId, displayId, display => display.revision > previous && display.appliedRevision === display.revision);
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision', String(current.revision));
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status', 'ready');
  await viewer.evaluate(() => document.fonts.ready.then(() => undefined)); await twoFrames(viewer);
  return current;
}

async function imageGeometry(viewer: Page, stage = '.viewer-candidate') {
  return viewer.locator(`${stage} .image-surface`).evaluate(root => {
    const rect = (element: Element) => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    const frame = root.querySelector('.image-grid figure:not([hidden]) .image-frame')!, image = frame.querySelector<HTMLImageElement>('img')!, crop = frame.querySelector('.image-crop');
    return {
      viewport: { width: innerWidth, height: innerHeight }, document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      root: rect(root), frame: rect(frame), image: rect(image), crop: crop ? rect(crop) : null,
      natural: { width: image.naturalWidth, height: image.naturalHeight }, objectFit: getComputedStyle(image).objectFit,
      padding: getComputedStyle(root.closest('.render-surface')!).padding, gridGap: getComputedStyle(root.querySelector('.image-grid')!).gap,
      sourceOrder: [...root.querySelectorAll('img')].map(image => image.getAttribute('src')),
    };
  });
}

function close(actual: number, expected: number) { expect(Math.abs(actual - expected)).toBeLessThan(1.1); }
function fullFrame(metrics: Awaited<ReturnType<typeof imageGeometry>>) {
  close(metrics.frame.x, 0); close(metrics.frame.y, 0); close(metrics.frame.width, metrics.viewport.width); close(metrics.frame.height, metrics.viewport.height);
  expect(metrics.padding).toBe('0px'); expect(metrics.document.width).toBeLessThanOrEqual(metrics.viewport.width + 1); expect(metrics.document.height).toBeLessThanOrEqual(metrics.viewport.height + 1);
}

test('protected images use the full phone/desktop frame without cropping or discarding rich metadata', async ({ page }, info) => {
  test.setTimeout(150_000);
  const { sessionId, display, viewer } = await setup(page), assets = await uploadImages(page, sessionId), receipt: unknown[] = [];
  const viewports = info.project.name.startsWith('phone') ? [{ width: 390, height: 844 }, { width: 443, height: 823 }] : [{ width: 1440, height: 900 }];
  await mkdir(info.outputPath('visuals'), { recursive: true });
  for (const viewport of viewports) {
    await viewer.setViewportSize(viewport);
    for (const [index, shape] of shapes.entries()) {
      const view = imageView([imageEntry(assets[index])]);
      const current = await show(page, viewer, sessionId, display.id, view), metrics = await imageGeometry(viewer); fullFrame(metrics);
      expect(metrics.objectFit).toBe('contain'); expect(metrics.natural).toEqual({ width: shape.width, height: shape.height });
      expect(metrics.sourceOrder).toEqual([assets[index].url]); expect(assets[index].url).toMatch(/^\/api\/assets\//u);
      await expect(viewer.locator('.viewer-candidate .image-surface img')).toHaveAttribute('alt', exactAlt);
      await expect(viewer.locator('.viewer-candidate .view-heading,.viewer-candidate figcaption,.viewer-candidate .view-information,.viewer-candidate .image-original-link,.viewer-candidate .gallery-controls')).toHaveCount(0);
      expect(await viewer.locator('.viewer-candidate .image-surface').innerText()).toBe('');
      expect(current.view?.data).toEqual(view.data); expect(current.view?.source).toEqual(view.source); expect(current.view?.title).toBe(view.title);
      const scale = Math.min(viewport.width / shape.width, viewport.height / shape.height), painted = { width: shape.width * scale, height: shape.height * scale };
      expect(Math.min(Math.abs(painted.width - viewport.width), Math.abs(painted.height - viewport.height))).toBeLessThan(1);
      await viewer.screenshot({ path: `${info.outputPath('visuals')}/${info.project.name}-${shape.name}-${viewport.width}x${viewport.height}.png`, animations: 'disabled' });
      receipt.push({ shape: shape.name, ...metrics, painted });
    }
    for (const crop of [{ x: .25, y: .25, width: .5, height: .5 }, { x: .4, y: 0, width: .2, height: 1 }]) {
      const view = imageView([imageEntry(assets[0], { crop })]); await show(page, viewer, sessionId, display.id, view);
      const metrics = await imageGeometry(viewer); fullFrame(metrics);
      const scale = Math.min(viewport.width / (1200 * crop.width), viewport.height / (800 * crop.height));
      close(metrics.crop!.width, 1200 * crop.width * scale); close(metrics.crop!.height, 800 * crop.height * scale);
      close(metrics.image.width, 1200 * scale); close(metrics.image.height, 800 * scale);
      close(metrics.crop!.x - metrics.image.x, 1200 * crop.x * scale); close(metrics.crop!.y - metrics.image.y, 800 * crop.y * scale);
      await viewer.screenshot({ path: `${info.outputPath('visuals')}/${info.project.name}-explicit-crop-${crop.width}-${viewport.width}x${viewport.height}.png`, animations: 'disabled' });
      receipt.push({ requestedCrop: crop, ...metrics });
    }
  }
  await writeFile(`${info.outputPath('visuals')}/${info.project.name}-image-geometry.json`, JSON.stringify(receipt, null, 2));
});

test('all gallery images remain reachable and caption/source/utility flags work independently and in a presentation', async ({ page }, info) => {
  test.setTimeout(120_000);
  const { sessionId, display, viewer } = await setup(page), assets = await uploadImages(page, sessionId);
  if (info.project.name.startsWith('phone')) await viewer.setViewportSize({ width: 390, height: 844 });
  const entries = Array.from({ length: 4 }, (_, index) => imageEntry(assets[index % assets.length], { alt: `Original gallery image ${index + 1}`, caption: `Exact retained caption ${index + 1}` }));
  const view = imageView(entries); await show(page, viewer, sessionId, display.id, view);
  const surface = viewer.locator('.viewer-candidate .image-surface');
  await expect(surface.locator('figure:not([hidden])')).toHaveCount(4); expect((await imageGeometry(viewer)).sourceOrder).toEqual(entries.map(entry => entry.url));
  expect((await imageGeometry(viewer)).gridGap).toBe('0px'); await expect(surface.locator('figcaption,.image-original-link,.gallery-controls')).toHaveCount(0);
  await surface.getByRole('button', { name: 'Enlarge Original gallery image 2', exact: true }).focus(); await viewer.keyboard.press('Space');
  await expect(surface.locator('figure:not([hidden])')).toHaveAttribute('data-image-index', '1'); await expect(surface.locator('img')).toHaveCount(4);
  await expect(surface.getByRole('button', { name: 'All 4 images', exact: true })).toBeFocused(); fullFrame(await imageGeometry(viewer));
  const controls = await surface.locator('.gallery-controls').evaluate(element => ({ position: getComputedStyle(element).position, minimumTarget: Math.min(...[...element.querySelectorAll('button')].map(button => Math.min(button.getBoundingClientRect().width, button.getBoundingClientRect().height))) }));
  expect(controls.position).toBe('absolute'); expect(controls.minimumTarget).toBeGreaterThanOrEqual(44);
  await surface.getByRole('button', { name: 'Next image', exact: true }).click(); await expect(surface.locator('figure:not([hidden])')).toHaveAttribute('data-image-index', '2');
  await viewer.keyboard.press('ArrowRight'); await expect(surface.locator('figure:not([hidden])')).toHaveAttribute('data-image-index', '3');
  await viewer.keyboard.press('ArrowRight'); await expect(surface.locator('figure:not([hidden])')).toHaveAttribute('data-image-index', '0');
  await surface.getByRole('button', { name: 'Previous image', exact: true }).click(); await expect(surface.locator('figure:not([hidden])')).toHaveAttribute('data-image-index', '3');
  await viewer.keyboard.press('Escape'); await expect(surface.locator('figure:not([hidden])')).toHaveCount(4);
  await expect(surface.getByRole('button', { name: 'Enlarge Original gallery image 4', exact: true })).toBeFocused();
  expect((await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)?.view?.data).toEqual(view.data);

  const caption = '  Exact caption.\n' + ('Identifier ' + 'X'.repeat(80) + '\n').repeat(3) + '  final supplied line  ';
  const explicit = imageView([imageEntry(assets[1], { caption })], { showTitle: true, showCaption: true, showSource: true, showControls: true });
  await show(page, viewer, sessionId, display.id, explicit);
  expect(await surface.locator('figcaption').textContent()).toBe(caption); await expect(viewer.locator('.viewer-candidate h1')).toHaveText(explicit.title!);
  await expect(surface.getByRole('link', { name: 'Open original image', exact: true })).toHaveAttribute('href', assets[1].url);
  const captionMetrics = await surface.locator('figcaption').evaluate(element => ({ font: parseFloat(getComputedStyle(element).fontSize), whiteSpace: getComputedStyle(element).whiteSpace, width: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(captionMetrics.font).toBeGreaterThanOrEqual(16); expect(captionMetrics.whiteSpace).toBe('break-spaces'); expect(captionMetrics.scrollWidth).toBeLessThanOrEqual(captionMetrics.width + 1);
  await viewer.getByLabel('About this view', { exact: true }).click(); await expect(viewer.getByRole('region', { name: 'View information', exact: true })).toContainText('Original protected asset; all source pixels retained');
  await viewer.getByRole('button', { name: 'Close view information', exact: true }).click();
  await mkdir(info.outputPath('visuals'), { recursive: true }); await viewer.screenshot({ path: `${info.outputPath('visuals')}/${info.project.name}-explicit-metadata.png`, animations: 'disabled' });
  await show(page, viewer, sessionId, display.id, imageView([imageEntry(assets[0], { caption: undefined })], { source: {}, title: undefined, showSource: true }));
  await expect(viewer.locator('.viewer-candidate .view-information')).toHaveCount(0);

  const slide = imageView([imageEntry(assets[0])]);
  const deck = validateView({ version: 1, template: 'presentation', showCaption: true, showSource: true, showControls: true, data: { slides: [slide], index: 0 } });
  await show(page, viewer, sessionId, display.id, deck);
  await expect(surface.locator('figcaption')).toHaveCount(1); await expect(surface.locator('.image-original-link')).toHaveCount(1); await expect(viewer.locator('.viewer-candidate .view-information')).toHaveCount(1);
  await show(page, viewer, sessionId, display.id, validateView({ ...deck, data: { slides: [{ ...slide, showCaption: false, showSource: false, showControls: false }], index: 0 } }));
  await expect(surface.locator('figcaption,.image-original-link')).toHaveCount(0); await expect(viewer.locator('.viewer-candidate .view-information')).toHaveCount(0);
});

test('a delayed gallery preserves the last frame until a corrupt image resolves to an explicit placeholder', async ({ page }, info) => {
  test.setTimeout(90_000);
  const { sessionId, display, viewer } = await setup(page), assets = await uploadImages(page, sessionId);
  const good = await show(page, viewer, sessionId, display.id, imageView([imageEntry(assets[0])]));
  let release!: () => void; const delayed = new Promise<void>(resolve => { release = resolve; });
  const route = `**${assets[1].url}`;
  await viewer.route(route, async request => { await delayed; await request.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('Deliberately corrupt PNG bytes for actual native decode failure') }); });
  try {
    const requested = viewer.waitForRequest(request => new URL(request.url()).pathname === assets[1].url);
    await publishPrepared(page, sessionId, [display.id], imageView([imageEntry(assets[0]), imageEntry(assets[1], { alt: 'Delayed corrupt second image' })])); await requested;
    const candidate = await waitForDisplay(page, sessionId, display.id, item => item.revision > good.revision);
    await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status', 'pending');
    await expect(viewer.locator('.viewer-last-good .image-surface img')).toHaveAttribute('src', assets[0].url);
    await expect(viewer.locator('.viewer-last-good .image-surface img')).toBeVisible(); fullFrame(await imageGeometry(viewer, '.viewer-last-good'));
    await expect(viewer.locator('.viewer-candidate .image-surface img')).toHaveCount(2);
    await expect.poll(() => viewer.locator('.viewer-candidate .image-surface img').first().evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(1200);
    await twoFrames(viewer); expect((await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)?.appliedRevision).toBe(good.revision);
    release(); await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status', 'ready');
    const degraded = await waitForDisplay(page, sessionId, display.id, item => item.appliedRevision === candidate.revision);
    expect(degraded.view?.data.images).toEqual([imageEntry(assets[0]), imageEntry(assets[1], { alt: 'Delayed corrupt second image' })]);
    await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision', String(candidate.revision));
    await expect(viewer.locator('.viewer-last-good')).toHaveCount(0);
    await expect(viewer.locator('.viewer-candidate .media-unavailable')).toBeVisible();
    await expect(viewer.locator('.viewer-candidate .media-unavailable')).toContainText('Delayed corrupt second image');
    await expect(viewer.locator('.viewer-candidate .image-surface img')).toHaveCount(1);
    expect(await viewer.locator('.viewer-candidate .image-surface img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(1200);
    await mkdir(info.outputPath('visuals'), { recursive: true }); await viewer.screenshot({ path: `${info.outputPath('visuals')}/${info.project.name}-gallery-with-explicit-placeholder.png`, animations: 'disabled' });
  } finally { release(); await viewer.unroute(route); }
  await show(page, viewer, sessionId, display.id, imageView([imageEntry(assets[2])])); await expect(viewer.locator('.viewer-last-good')).toHaveCount(0);
  expect((await imageGeometry(viewer)).natural).toEqual({ width: 900, height: 900 });
});

async function annotationOptions(viewer: Page, enabled: boolean, note?: string) {
  await viewer.getByRole('button', { name: 'Display controls', exact: true }).click();
  await viewer.getByRole('button', { name: 'Screen options', exact: true }).click();
  await viewer.getByLabel('Annotate this view', { exact: true }).setChecked(enabled);
  if (note !== undefined) await viewer.getByLabel('Annotation note', { exact: true }).fill(note);
  await viewer.getByRole('button', { name: 'Close screen options', exact: true }).click();
}

test('adjacent explicit crops bind annotations to the visible source image and hide marks on hidden gallery images', async ({ page }, info) => {
  test.setTimeout(90_000);
  const { sessionId, display, viewer } = await setup(page), assets = await uploadImages(page, sessionId);
  if (info.project.name.startsWith('phone')) await viewer.setViewportSize({ width: 390, height: 844 });
  const view = imageView([
    imageEntry(assets[0], { alt: 'First explicit crop', crop: { x: 0, y: 0, width: .25, height: .25 } }),
    imageEntry(assets[0], { alt: 'Second explicit crop', crop: { x: .5, y: .5, width: .25, height: .25 } }),
  ]);
  const current = await show(page, viewer, sessionId, display.id, view), surface = viewer.locator('.viewer-candidate .image-surface');
  const note = 'Point belongs to the second visible crop';
  await annotationOptions(viewer, true, note);
  const firstImage = await surface.locator('figure[data-image-index="0"] img').boundingBox(), secondCrop = await surface.locator('figure[data-image-index="1"] .image-crop').boundingBox();
  const point = { x: secondCrop!.x + secondCrop!.width / 2, y: secondCrop!.y + secondCrop!.height / 2 };
  // This is the original regression: the first IMG's invisible oversized box
  // genuinely covers a point belonging to the second visible clipped image.
  expect(point.x).toBeGreaterThan(firstImage!.x); expect(point.x).toBeLessThan(firstImage!.x + firstImage!.width);
  expect(point.y).toBeGreaterThan(firstImage!.y); expect(point.y).toBeLessThan(firstImage!.y + firstImage!.height);
  await viewer.mouse.click(point.x, point.y);
  let stored: AnnotationInput | undefined;
  await expect.poll(async () => {
    const entries = (await sessionDetail(page, sessionId)).interactions.filter(item => item.displayId === display.id && item.revision === current.revision && item.actionId === 'viewer.annotation');
    stored = entries.map(item => item.value as AnnotationInput).find(item => item.note === note);
    return stored?.target.type === 'image' ? stored.target.imageIndex : null;
  }).toBe(1);
  expect(stored!.target).toMatchObject({ type: 'image', coordinates: 'normalized-image', imageIndex: 1, naturalWidth: 1200, naturalHeight: 800 });
  expect(stored!.points[0].x).toBeCloseTo(.625, 3); expect(stored!.points[0].y).toBeCloseTo(.625, 3);
  const mark = viewer.locator('.viewer-annotations > g').filter({ hasText: note }).locator('circle');
  await expect(mark).toBeVisible();
  await annotationOptions(viewer, false);
  await surface.getByRole('button', { name: 'Enlarge First explicit crop', exact: true }).click();
  await expect(surface.locator('figure:not([hidden])')).toHaveAttribute('data-image-index', '0'); await expect(mark).toHaveCount(0);
  await surface.getByRole('button', { name: 'Next image', exact: true }).click();
  await expect(surface.locator('figure:not([hidden])')).toHaveAttribute('data-image-index', '1'); await expect(mark).toBeVisible();
  const projected = await mark.boundingBox(), focusedCrop = await surface.locator('figure:not([hidden]) .image-crop').boundingBox();
  close(projected!.x + projected!.width / 2, focusedCrop!.x + focusedCrop!.width / 2); close(projected!.y + projected!.height / 2, focusedCrop!.y + focusedCrop!.height / 2);
  expect((await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)?.view?.data).toEqual(view.data);
});
