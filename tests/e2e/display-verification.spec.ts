import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { AssetRecord, DisplayRecord } from '../../src/shared/types';
import { createDisplay, createSession, expect, openViewer, publishPrepared, register, sessionApi, sessionDetail, tab, test, waitForDisplay } from './support';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

test('a failed video replacement retains the actual previously painted DOM and history restores it', async ({ page, diagnostics }) => {
  await register(page); const sessionId = await createSession(page, 'Retain what was painted'), display = await createDisplay(page, sessionId, 'Persistent picture');
  await tab(page, 'Library');
  const viewer = await openViewer(page, sessionId, display.id), goodUrl = 'https://example.com/retained-picture.png', badUrl = 'https://example.com/failed-replacement.mp4';
  let goodRequests = 0;
  await viewer.route(goodUrl, route => { goodRequests++; return route.fulfill({contentType: 'image/png', body: PNG}); });
  await viewer.route(badUrl, route => route.fulfill({status: 404, contentType: 'text/plain', body: 'Synthetic failed video'}));
  diagnostics.allowHttp(viewer, '/failed-replacement.mp4', 404);
  await publishPrepared(page, sessionId, [display.id], {version: 1, template: 'image', title: 'Previous successful content', data: {images: [{url: goodUrl, alt: 'Previously decoded image'}]}});
  const good = await waitForDisplay(page, sessionId, display.id, d => d.revision > 0 && d.appliedRevision === d.revision);
  await viewer.getByRole('img', {name: 'Previously decoded image'}).evaluate(element => element.setAttribute('data-original-node', 'yes'));
  await publishPrepared(page, sessionId, [display.id], {version: 1, template: 'video', data: {url: badUrl}});
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status', 'failed');
  const retained = viewer.locator('.viewer-last-good'); await expect(retained).toBeVisible();
  await expect(retained.getByRole('img')).toHaveAttribute('data-original-node', 'yes');
  await expect(viewer.locator('.viewer-status')).toContainText('Showing the last successful view.');
  expect(goodRequests).toBe(1);
  const failed = await waitForDisplay(page, sessionId, display.id, d => d.delivery?.status === 'failed');
  expect(failed.appliedRevision).toBe(good.revision); expect(failed.revision).toBeGreaterThan(good.revision);
  await viewer.getByRole('button', {name: 'Display controls', exact: true}).click();
  await viewer.getByRole('button', {name: 'Previous view', exact: true}).click();
  await expect(viewer.locator('.filmstrip-reading').getByRole('img', {name: 'Previously decoded image'})).toBeVisible();
  expect((await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)!.revision).toBe(failed.revision);
  // Local history browsing is read-only; an explicit authorized operation restores shared state.
  expect((await sessionApi(page, `/api/sessions/${sessionId}/navigate`, 'POST', {displayIds:[display.id],direction:'back',expectedRevisions:{[display.id]:failed.revision},requestId:crypto.randomUUID()})).status).toBe(200);
  const prepared = await waitForDisplay(page, sessionId, display.id, d => d.revision > failed.revision);
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-revision', String(prepared.revision));
  // A new shared revision returns this receiver to live automatically.
  await expect(viewer.locator('.filmstrip-reading')).toHaveCount(0);
  const restored = await waitForDisplay(page, sessionId, display.id, d => d.revision > failed.revision && d.appliedRevision === d.revision);
  expect(restored.view?.title).toBe('Previous successful content');
  await expect(viewer.locator('.viewer-last-good')).toHaveCount(0);
  await expect(viewer.getByRole('img', {name: 'Previously decoded image'})).toBeVisible();
  await viewer.getByRole('button', {name: 'Display controls', exact: true}).click();
  await viewer.getByLabel('About this view', {exact: true}).click();
  await expect(viewer.getByRole('region', {name: 'View information'})).toContainText('Previous successful content');
});

test('MCP visual readback returns real renderer pixels without impersonating physical viewer delivery', async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  await register(page); const sessionId = await createSession(page, 'Visual inspection scope'), display = await createDisplay(page, sessionId, 'Only this display');
  await tab(page, 'Library');
  await publishPrepared(page, sessionId, [display.id], {version: 1, template: 'code', title: 'Exact code capture', data: {kind: 'code', language: 'typescript', code: 'const exact = "9007199254740993.123456789";\n'}});
  const before = (await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)!;
  expect(before.online).toBe(false); expect(before.appliedRevision ?? 0).toBeLessThan(before.revision);
  const issued = await sessionApi<{token: string}>(page, '/api/tokens', 'POST', {name: 'Read-only visual inspection', scopes: ['read'], sessionIds: [sessionId]});
  expect(issued.status).toBe(201);
  const client = new Client({name: 'visual-readback-gate', version: '1'});
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseURL), {requestInit: {headers: {Authorization: `Bearer ${issued.data!.token}`}}}));
  const inspect = async () => {
    const result = await client.callTool({name: 'kanvas_capture', arguments: {operation:'snapshot', sessionId, displayId: display.id, width: 640, height: 480}}, {timeout: 60_000});
    expect(result.isError).not.toBe(true);
    const metadata = (result.structuredContent as {data: {readiness: string; source: string; revision: number; blockedExternalRequests: number; observedViewer: {online: boolean}; reusable: boolean; assetId: string; assetUrl: string; assetPath: string}}).data;
    const image = result.content.find(item => item.type === 'image'); expect(Boolean(image)).toBe(true);
    if (!image || image.type !== 'image') throw new Error('No screenshot image returned');
    const decoded = Buffer.from(image.data, 'base64'); expect(decoded.length).toBeGreaterThan(1000); expect(decoded.length).toBeLessThan(2 * 1024 * 1024);
    expect(decoded[0]).toBe(0xff); expect(decoded[1]).toBe(0xd8);
    const size = await page.evaluate(async data => { const image = new Image(); image.src = `data:image/jpeg;base64,${data}`; await image.decode(); return {width: image.naturalWidth, height: image.naturalHeight}; }, image.data);
    expect(size).toEqual({width: 640, height: 480});
    expect(metadata.source).toBe('isolated-server-browser');
    expect(metadata.reusable).toBe(true); expect(metadata.assetPath).toBe(`/api/assets/${metadata.assetId}`);
    expect(metadata.assetUrl).toBe(new URL(metadata.assetPath, baseURL).href);
    const saved = await fetch(metadata.assetUrl, {headers: {Authorization: `Bearer ${issued.data!.token}`}});
    expect(saved.ok).toBe(true); expect(Buffer.from(await saved.arrayBuffer())).toEqual(decoded);
    expect((await fetch(metadata.assetUrl)).ok).toBe(false);
    return metadata;
  };
  try {
    const code = await inspect(); expect(code.readiness).toBe('ready'); expect(code.revision).toBe(before.revision); expect(code.observedViewer.online).toBe(false);
    let after = (await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)!; expect(after.online).toBe(false); expect(after.appliedRevision).toBe(before.appliedRevision); expect(after.viewportRevision).toBe(before.viewportRevision);
    // Own protected media is available to the isolated browser, not anonymously.
    const asset = await sessionApi<AssetRecord>(page, `/api/sessions/${sessionId}/assets`, 'POST', {name: 'Private capture.png', mimeType: 'image/png', base64: PNG.toString('base64')}); expect(asset.status).toBe(201);
    await publishPrepared(page, sessionId, [display.id], {version: 1, template: 'image', data: {images: [{url: asset.data!.url, alt: 'Private captured image'}]}});
    expect((await inspect()).readiness).toBe('ready');
    await publishPrepared(page, sessionId, [display.id], {version: 1, template: 'image', data: {images: [{url: 'https://example.com/not-fetched-for-capture.png', alt: 'External media blocked'}]}});
    // Accepted image policy renders an explicit unavailable placeholder. Ready
    // describes that local surface, not successful external media or delivery.
    const blocked = await inspect(); expect(blocked.readiness).toBe('ready'); expect(blocked.blockedExternalRequests).toBeGreaterThan(0);
    after = (await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)!; expect(after.online).toBe(false); expect(after.appliedRevision).toBe(before.appliedRevision);
    const other = await createSession(page, 'Not granted to capture identity');
    const forbidden = await client.callTool({name: 'kanvas_capture', arguments: {operation:'snapshot', sessionId: other, displayId: display.id}}); expect(forbidden.isError).toBe(true);
  } finally { await client.close(); }
});

test('a cleared display and revoked viewer never resurrect retained visual content', async ({ page, diagnostics }) => {
  await register(page); const sessionId = await createSession(page, 'Clear fallback content'), display = await createDisplay(page, sessionId, 'Clear target');
  await tab(page, 'Library'); const viewer = await openViewer(page, sessionId, display.id);
  await publishPrepared(page, sessionId, [display.id], {version: 1, template: 'fact', data: {text: 'Private content must disappear on clear'}});
  await waitForDisplay(page, sessionId, display.id, d => d.appliedRevision === d.revision && d.revision > 0);
  const cleared = await sessionApi(page, `/api/sessions/${sessionId}/clear`, 'POST', {displayIds: [display.id], requestId: crypto.randomUUID()}); expect(cleared.status).toBe(200);
  await expect(viewer.getByRole('heading', {name: 'Ready when you are.'})).toBeVisible();
  await expect(viewer.getByText('Private content must disappear on clear')).toHaveCount(0);
  const current = await waitForDisplay(page, sessionId, display.id, d => !d.view && d.appliedRevision === d.revision); expect(current.revision).toBeGreaterThan(1);
  diagnostics.allowHttp(viewer, `/api/sessions/${sessionId}`, 410);
  diagnostics.allowHttp(page, `/api/sessions/${sessionId}`, 410);
  await sessionApi(page, `/api/sessions/${sessionId}/end`, 'POST', {});
  await expect(viewer.getByRole('heading', {name: 'This display is unavailable.'})).toBeVisible();
  await expect(viewer.locator('.viewer-last-good')).toHaveCount(0);
});
