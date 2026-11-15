import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import type { AssetRecord, DatasetRecord, DisplayRecord, UpdateRecord, ViewSpec } from '../../src/shared/types';
import { createDisplay, createSession, expect, openViewer, publishPrepared, register, sessionApi, sessionDetail, tab, test, waitForDisplay } from './support';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const board = (text?: string): ViewSpec => ({ version: 1, template: 'whiteboard', data: { elements: text ? [{ id: 'shared-note', type: 'text', x: 300, y: 170, text, color: '#b9ed87', width: 280, height: 70 }] : [] } });

async function workspace(page: Page, name: string) {
  await register(page);
  const sessionId = await createSession(page, name);
  const display = await createDisplay(page, sessionId, 'Integrity display');
  // Keep the workspace away from visual previews; the viewer is the surface under test.
  await tab(page, 'Library');
  return { sessionId, display };
}

async function twoFrames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test('drawing gestures and note drafts retain their original revision across a live shared update', async ({ page, diagnostics }) => {
  const { sessionId, display } = await workspace(page, 'Concurrent local work');
  await publishPrepared(page, sessionId, [display.id], board());
  const viewer = await openViewer(page, sessionId, display.id);
  await expect(viewer.locator('.whiteboard-content.is-editable')).toBeVisible();
  let shared = await waitForDisplay(page, sessionId, display.id, d => d.revision > 0 && d.appliedRevision === d.revision);
  const editPath = `/api/sessions/${sessionId}/displays/${display.id}/view`;
  diagnostics.allowHttp(viewer, editPath, 409);
  const attempts: number[] = [];
  viewer.on('request', request => { if (request.method() === 'PATCH' && new URL(request.url()).pathname === editPath) attempts.push(request.postDataJSON().expectedRevision); });

  const surface = viewer.locator('.board-surface');
  const bounds = await surface.boundingBox(); expect(bounds).not.toBeNull();
  await viewer.mouse.move(bounds!.x + bounds!.width * .2, bounds!.y + bounds!.height * .35);
  await viewer.mouse.down();
  await viewer.mouse.move(bounds!.x + bounds!.width * .45, bounds!.y + bounds!.height * .55, { steps: 8 });
  const concurrent = await sessionApi<DisplayRecord>(page, editPath, 'PATCH', { expectedRevision: shared.revision, data: board('A collaborator changed the board').data });
  expect(concurrent.status).toBe(200);
  await expect(viewer.locator('.board-error')).toContainText('shared board changed');
  await viewer.mouse.up();
  await expect(viewer.locator('.board-save-status')).toHaveText('Not saved');
  await expect.poll(() => attempts).toEqual([shared.revision]);
  await expect(viewer.getByRole('button', { name: 'Retry save', exact: true })).toHaveCount(0);
  const retained = (await sessionDetail(page, sessionId)).displays.find(d => d.id === display.id)!;
  expect(retained.revision).toBe(concurrent.data!.revision);
  expect(retained.view!.data).toEqual(concurrent.data!.view!.data);
  expect(retained.appliedRevision ?? 0).toBeLessThan(retained.revision);
  await viewer.getByRole('button', { name: 'Use shared version', exact: true }).click();
  await expect(surface.locator('[data-element-id="shared-note"]')).toHaveAttribute('aria-label', 'A collaborator changed the board');
  shared = await waitForDisplay(page, sessionId, display.id, d => d.appliedRevision === concurrent.data!.revision);

  // A note editor has the same source-snapshot lifetime as a pointer gesture.
  await viewer.getByRole('button', { name: 'Text / note (T)', exact: true }).click();
  await surface.click({ position: { x: bounds!.width * .25, y: bounds!.height * .65 } });
  await viewer.getByLabel('Add your thought').fill('My unsaved note');
  const newer = await sessionApi<DisplayRecord>(page, editPath, 'PATCH', { expectedRevision: shared.revision, data: board('Another shared version').data });
  expect(newer.status).toBe(200);
  await expect(viewer.locator('.board-error')).toContainText('shared board changed');
  await viewer.getByRole('button', { name: 'Add note', exact: true }).click();
  await expect(viewer.locator('.board-save-status')).toHaveText('Not saved');
  await expect.poll(() => attempts).toEqual([shared.revision - 1, shared.revision]);
  await expect(surface).toContainText('My unsaved note');
  const afterNote = (await sessionDetail(page, sessionId)).displays.find(d => d.id === display.id)!;
  expect(afterNote.revision).toBe(newer.data!.revision);
  expect(afterNote.view!.data).toEqual(newer.data!.view!.data);
  await viewer.getByRole('button', { name: 'Use shared version', exact: true }).click();
  await expect(surface).toContainText('Another shared version');
  await expect(surface).not.toContainText('My unsaved note');
});

test('a failed local save is not silently rebased or retried after a newer shared board arrives', async ({ page, diagnostics }) => {
  const { sessionId, display } = await workspace(page, 'Conflict after a failed save');
  await publishPrepared(page, sessionId, [display.id], board());
  const viewer = await openViewer(page, sessionId, display.id);
  await expect(viewer.locator('.whiteboard-content.is-editable')).toBeVisible();
  const shared = await waitForDisplay(page, sessionId, display.id, d => d.revision > 0 && d.appliedRevision === d.revision);
  const editPath = `/api/sessions/${sessionId}/displays/${display.id}/view`;
  diagnostics.allowHttp(viewer, editPath, 503);
  const attempts: number[] = [];
  await viewer.route(`**${editPath}`, async route => {
    if (route.request().method() !== 'PATCH') { await route.continue(); return; }
    attempts.push(route.request().postDataJSON().expectedRevision);
    await route.fulfill({ status: 503, contentType: 'application/json', json: { error: { code: 'TEMPORARY_UNAVAILABLE', message: 'Temporarily unavailable.' } } });
  });
  await viewer.getByRole('button', { name: 'Text / note (T)', exact: true }).click();
  await viewer.locator('.board-surface').click({ position: { x: 80, y: 150 } });
  await viewer.getByLabel('Add your thought').fill('Keep my local idea');
  await viewer.getByRole('button', { name: 'Add note', exact: true }).click();
  await expect(viewer.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
  await viewer.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect.poll(() => attempts).toEqual([shared.revision, shared.revision]);
  await expect(viewer.locator('.board-save-status')).toHaveText('Not saved');
  const remote = await sessionApi<DisplayRecord>(page, editPath, 'PATCH', { expectedRevision: shared.revision, data: board('The accepted shared idea').data });
  expect(remote.status).toBe(200);
  await expect(viewer.locator('.board-error')).toContainText('shared board changed');
  await expect(viewer.getByRole('button', { name: 'Retry save', exact: true })).toHaveCount(0);
  await expect(viewer.locator('.board-surface')).toContainText('Keep my local idea');
  await twoFrames(viewer);
  expect(attempts).toEqual([shared.revision, shared.revision]);
  expect((await sessionDetail(page, sessionId)).displays.find(d => d.id === display.id)!.view!.data).toEqual(remote.data!.view!.data);
});

test('JSON import and on-demand inspect/export preserve exact decimal and integer lexemes', async ({ page }) => {
  const { sessionId } = await workspace(page, 'Lossless browser import');
  const exactDecimal = '0.12345678901234567890123456789', exactInteger = '9007199254740993123456789';
  const json = `{"rows":[{"label":"Exact source","decimal":${exactDecimal},"integer":${exactInteger}}],"source":{"title":"Original source record"}}`;
  await page.getByRole('button', { name: 'Import data', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Dataset name', { exact: true }).fill('Unrounded source');
  await dialog.getByLabel('Or paste CSV / JSON', { exact: true }).fill(json);
  const importedRequest = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === `/api/sessions/${sessionId}/datasets`);
  await dialog.getByRole('button', { name: 'Import dataset', exact: true }).click();
  const payload = (await importedRequest).postDataJSON();
  expect(payload.json).toBe(json); expect(payload.rows).toBeUndefined();
  await expect(dialog).toBeHidden();
  const summary = (await sessionDetail(page, sessionId)).datasets.find(d => d.name === 'Unrounded source')!;
  expect(summary).toBeDefined(); expect(summary).not.toHaveProperty('rows');
  expect(summary.source?.title).toBe('Original source record');
  const readPath = `/api/sessions/${sessionId}/datasets/${summary.id}`;
  const read = page.waitForResponse(response => new URL(response.url()).pathname === readPath && response.request().method() === 'GET');
  await page.getByRole('button', { name: 'Inspect Unrounded source', exact: true }).click();
  expect((await read).status()).toBe(200);
  await expect(dialog).toContainText(exactDecimal); await expect(dialog).toContainText(exactInteger);
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  const exportedRead = page.waitForResponse(response => new URL(response.url()).pathname === readPath && response.request().method() === 'GET');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Unrounded source', exact: true }).click();
  expect((await exportedRead).status()).toBe(200);
  const stream = await (await downloaded).createReadStream(); expect(stream).not.toBeNull();
  const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exportedJson = Buffer.concat(chunks).toString('utf8');
  const exported = JSON.parse(exportedJson) as Pick<DatasetRecord, 'rows' | 'source'>;
  expect(exported.rows[0]).toEqual({ label: 'Exact source', decimal: exactDecimal, integer: exactInteger });
  expect(exported.source?.title).toBe('Original source record');
  await page.getByRole('button', { name: 'Import data', exact: true }).click();
  await dialog.getByLabel('Dataset name', { exact: true }).fill('Reimported source');
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'export.json', mimeType: 'application/json', buffer: Buffer.from(exportedJson) });
  await dialog.getByRole('button', { name: 'Import dataset', exact: true }).click();
  await expect(dialog).toBeHidden();
  const restoredSummary = (await sessionDetail(page, sessionId)).datasets.find(d => d.name === 'Reimported source')!;
  const restored = await sessionApi<DatasetRecord>(page, `/api/sessions/${sessionId}/datasets/${restoredSummary.id}`);
  expect(restored.status).toBe(200);
  expect(restored.data?.rows).toEqual(exported.rows);
  expect(restored.data?.source).toEqual(exported.source);
});

async function videoFixture(page: Page): Promise<Buffer> {
  // Generate a real decodable VP8 fixture locally in Chromium, without external media services.
  return Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 48;
    const drawing = canvas.getContext('2d')!;
    const stream = canvas.captureStream(10), chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const finished = new Promise<number[]>(resolve => { recorder.onstop = async () => resolve([...new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer())]); });
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    drawing.fillStyle = '#228844'; drawing.fillRect(0, 0, 64, 48); recorder.start();
    await new Promise(resolve => setTimeout(resolve, 180));
    drawing.fillStyle = '#4477cc'; drawing.fillRect(0, 0, 64, 48);
    await new Promise(resolve => setTimeout(resolve, 180));
    recorder.stop(); const bytes = await finished; stream.getTracks().forEach(track => track.stop()); return bytes;
  }));
}

test('image galleries, document crops, snapshots, presentation media and videos wait for actual media before applied', async ({ page }) => {
  test.setTimeout(100_000);
  const { sessionId, display } = await workspace(page, 'Verified media delivery');
  const video = await videoFixture(page);
  const viewer = await openViewer(page, sessionId, display.id);
  let revision = 0;
  for (const kind of ['image', 'document', 'snapshot', 'presentation', 'video'] as const) {
    const url = `https://example.com/kanvas-integrity/${kind}.${kind === 'video' ? 'webm' : 'png'}`;
    let release!: () => void;
    const delayed = new Promise<void>(resolve => { release = resolve; });
    await viewer.route(url, async route => { await delayed; await route.fulfill({ status: 200, contentType: kind === 'video' ? 'video/webm' : 'image/png', body: kind === 'video' ? video : PNG }); });
    const entry = { url, alt: `${kind} readiness fixture` };
    const image: ViewSpec = { version: 1, template: 'image', data: { images: [entry] } };
    const view: ViewSpec = kind === 'document' ? { version: 1, template: 'document', data: { text: 'Source excerpt with a focused crop.', images: [entry] } }
      : kind === 'snapshot' ? { ...image, title: 'Supplied screenshot' }
      : kind === 'presentation' ? { version: 1, template: 'presentation', data: { slides: [image], index: 0 } }
      : kind === 'video' ? { version: 1, template: 'video', data: { url, muted: true } } : image;
    if (kind === 'image') {
      const fastUrl = 'https://example.com/kanvas-integrity/already-loaded.png';
      await viewer.route(fastUrl, route => route.fulfill({ contentType: 'image/png', body: PNG }));
      view.data.images = [{ url: fastUrl, alt: 'First loaded image' }, entry];
    }
    try {
      const requested = viewer.waitForRequest(url);
      await publishPrepared(page, sessionId, [display.id], view); await requested;
      const prepared = await waitForDisplay(page, sessionId, display.id, d => d.revision > revision);
      if (revision > 0) {
        await expect(viewer.locator('.viewer-last-good')).toBeVisible();
        await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status', 'pending');
        await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision', String(revision));
      } else await expect(viewer.getByText('Loading media…', { exact: true })).toBeVisible();
      if (kind === 'video') await viewer.locator('video').dispatchEvent('loadedmetadata');
      await twoFrames(viewer);
      expect((await sessionDetail(page, sessionId)).displays.find(d => d.id === display.id)!.appliedRevision ?? 0).toBeLessThan(prepared.revision);
      release();
      const applied = await waitForDisplay(page, sessionId, display.id, d => d.appliedRevision === prepared.revision);
      revision = applied.revision;
      if (kind === 'video') expect(await viewer.locator('video').evaluate(element => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
      else expect(await viewer.locator(`img[src="${url}"]`).evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    } finally { release(); await viewer.unroute(url); }
  }
});

test('broken images render placeholders, videos cannot apply, and website frames never claim verified remote content', async ({ page, diagnostics }) => {
  const { sessionId, display } = await workspace(page, 'Unverified media');
  const viewer = await openViewer(page, sessionId, display.id);
  // A prior failed-media report can arrive after the next revision is installed.
  diagnostics.allowHttp(viewer, `/api/sessions/${sessionId}/displays/${display.id}/delivery`, 409);
  await viewer.route('**/image-fallback', route => route.fulfill({ json: { data: { status: 'unavailable', message: 'Controlled missing image' } } }));
  let revision = 0;
  for (const template of ['image', 'video'] as const) {
    const url = `https://example.com/kanvas-integrity/broken-${template}`;
    diagnostics.allowHttp(viewer, new URL(url).pathname, 404);
    await viewer.route(url, route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Fixture media unavailable' }));
    const view: ViewSpec = { version: 1, template, data: template === 'image' ? { images: [{ url, alt: 'Unavailable fixture image' }] } : { url } };
    await publishPrepared(page, sessionId, [display.id], view);
    const current = await waitForDisplay(page, sessionId, display.id, d => d.revision > revision);
    if (template === 'image') {
      await expect(viewer.locator('.viewer-candidate .media-unavailable')).toBeVisible();
      await expect(viewer.locator('.viewer-candidate .media-unavailable')).toContainText('Unavailable fixture image');
      await waitForDisplay(page, sessionId, display.id, d => d.appliedRevision === current.revision);
    } else {
      await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status', 'failed');
      await expect(viewer.locator('.viewer-status')).toContainText('browser rejected this video source');
      await expect(viewer.locator('.viewer-last-good .media-unavailable')).toBeVisible(); await twoFrames(viewer);
      expect((await sessionDetail(page, sessionId)).displays.find(d => d.id === display.id)!.appliedRevision ?? 0).toBeLessThan(current.revision);
    }
    revision = current.revision;
  }
  const embeddedUrl = 'https://player.vimeo.com/video/123456';
  await viewer.route(embeddedUrl, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><h1>Frame fixture loaded</h1></body></html>' }));
  await publishPrepared(page, sessionId, [display.id], { version: 1, template: 'website', data: { pages: [{ url: embeddedUrl, title: 'Opaque publisher content' }], screenshotFallback: false } });
  const frame = await waitForDisplay(page, sessionId, display.id, d => d.revision > revision);
  await expect(viewer.frameLocator('iframe').getByRole('heading', { name: 'Frame fixture loaded' })).toBeVisible();
  await expect(viewer.getByRole('status')).toContainText('Frame loaded. Remote content remains unverified.');
  await twoFrames(viewer);
  // Only the local website container is acknowledged, never cross-origin content.
  await waitForDisplay(page, sessionId, display.id, d => d.appliedRevision === frame.revision);
  expect(frame.view?.data.pages).toMatchObject([{ url: embeddedUrl, title: 'Opaque publisher content' }]);
});

test('a stalled image reaches a bounded explicit placeholder and a late load cannot remove that evidence', async ({ page }) => {
  const { sessionId, display } = await workspace(page, 'Bounded media waiting');
  const viewer = await openViewer(page, sessionId, display.id);
  await viewer.clock.install();
  const url = 'https://example.com/kanvas-integrity/stalled.png';
  let release!: () => void;
  const stalled = new Promise<void>(resolve => { release = resolve; });
  await viewer.route(url, async route => { await stalled; await route.fulfill({ contentType: 'image/png', body: PNG }); });
  await viewer.route('**/image-fallback', async route => { await stalled; await route.fulfill({ json: { data: { status: 'unavailable' } } }); });
  try {
    await publishPrepared(page, sessionId, [display.id], { version: 1, template: 'image', data: { images: [{ url, alt: 'Stalled image' }] } });
    await viewer.clock.runFor(200);
    await expect(viewer.getByText('Loading media…', { exact: true })).toBeVisible();
    // Images allow thirty seconds for anonymous fallback before the accepted
    // degraded-image policy acknowledges an explicit unavailable surface.
    // 2026-11-11: this failed twice on the phone, late in complete runs. The page checks the privacy lock once a
    // second with a four-second limit on the same (here: test-controlled) clock. A 30-second jump taken while one of
    // those checks was in flight ended it as "no answer", so the page hid and rebuilt its content, and the rebuilt
    // image started a fresh 30-second wait. Shown both ways by a temporary spec (evidence browser-c3-evidence1). The
    // jump is now taken right after a check has been answered, when none is in flight; the next one starts a second
    // later. What the test asserts is unchanged.
    await viewer.waitForResponse(response => new URL(response.url()).pathname === '/api/device-privacy/status' && response.ok());
    await viewer.clock.fastForward(30_000 + 50);
    // 2026-11-10: failed once on the phone late in a complete run and never alone. The assertion is unchanged; a failure
    // now also reports, without page content, what the window shows instead of the placeholder.
    await expect(viewer.locator('.viewer-candidate .media-unavailable')).toBeVisible().catch(async (error: Error) => {
      const state = await viewer.evaluate(() => ({ privacyStage: document.querySelector('.device-privacy-screen')?.getAttribute('data-privacy-stage') ?? null, candidate: Boolean(document.querySelector('.viewer-candidate')), loading: Boolean(document.body.textContent?.includes('Loading media')), renderedRevision: document.querySelector('.viewer-shell')?.getAttribute('data-rendered-revision') ?? null, clock: Date.now() })).catch(() => 'page unavailable');
      throw new Error(`${error.message}\nWindow state when the placeholder was missing: ${JSON.stringify(state)}`);
    });
    await expect(viewer.locator('.viewer-candidate .media-unavailable')).toContainText('Stalled image');
    release(); await viewer.clock.runFor(200);
    const current = await waitForDisplay(page, sessionId, display.id, d => d.revision > 0 && d.appliedRevision === d.revision);
    expect(current.view?.data.images).toEqual([{ url, alt: 'Stalled image' }]);
    await expect(viewer.locator('.viewer-candidate .media-unavailable')).toBeVisible();
    await expect(viewer.locator('.viewer-candidate img')).toHaveCount(0);
  } finally { release(); }
});

test('the PDF adapter exposes a safe protected download and document provenance remains linked', async ({ page }) => {
  const { sessionId, display } = await workspace(page, 'Protected PDF source');
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
  const asset = await sessionApi<AssetRecord>(page, `/api/sessions/${sessionId}/assets`, 'POST', { name: 'source.pdf', mimeType: 'application/pdf', base64: pdf.toString('base64') });
  expect(asset.status).toBeGreaterThanOrEqual(200); expect(asset.status).toBeLessThan(300);
  const viewer = await openViewer(page, sessionId, display.id);
  const submitted = await sessionApi<UpdateRecord>(page, `/api/sessions/${sessionId}/submit`, 'POST', { requestId: randomUUID(), sessionId, displayIds: [display.id], assetIds: [asset.data!.id], intent: 'Show the supplied PDF document download.' });
  expect(submitted.status).toBeGreaterThanOrEqual(200); expect(submitted.status).toBeLessThan(300);
  const original = viewer.getByRole('link', { name: 'Open original', exact: true });
  await expect(original).toHaveAttribute('href', asset.data!.url);
  await expect(viewer.locator('.source-domain')).toHaveCount(0);
  await expect(viewer.getByText('PDF document · protected download', { exact: true })).toBeVisible();
  const download = await viewer.evaluate(async url => { const response = await fetch(url, { credentials: 'same-origin' }); return { status: response.status, type: response.headers.get('content-type'), attachment: response.headers.get('content-disposition')?.startsWith('attachment'), pdf: (await response.text()).startsWith('%PDF-') }; }, asset.data!.url);
  expect(download).toMatchObject({ status: 200, type: 'application/pdf', attachment: true, pdf: true });
  await waitForDisplay(page, sessionId, display.id, item => item.revision > 0 && item.appliedRevision === item.revision);
  await publishPrepared(page, sessionId, [display.id], { version: 1, template: 'document', data: { text: 'The relevant document passage.', quote: true } });
  await waitForDisplay(page, sessionId, display.id, item => item.view?.template === 'document' && item.appliedRevision === item.revision);
  // 0.38.0: a view carries no source and draws no information control.
  await expect(viewer.getByLabel('About this view',{exact:true})).toHaveCount(0);await expect(viewer.locator('.view-information')).toHaveCount(0);
});
