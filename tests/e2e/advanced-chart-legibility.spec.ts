import { mkdir, writeFile } from 'node:fs/promises';
import { advancedChartExamples } from '../../src/shared/advanced-chart-examples';
import { validateView } from '../../src/shared/view-schemas';
import { advancedChartLegibility, advancedScalePixels } from './advanced-chart-legibility-metrics';
import { createDisplay, createSession, expect, openViewer, publishPrepared, register, sessionDetail, test, waitForDisplay } from './support';

test('advanced chart scales, numbered keys and extremal bubbles remain legible on actual receiving screens', async ({ page }, info) => {
  test.setTimeout(180_000);
  await register(page);
  const sessionId = await createSession(page, 'Advanced chart legibility');
  const display = await createDisplay(page, sessionId, 'Measured chart screen');
  const viewer = await openViewer(page, sessionId, display.id);
  const directory = info.outputPath('visuals');
  await mkdir(directory, { recursive: true });
  const viewports = info.project.name.startsWith('phone') ? [{ width: 390, height: 844 }, { width: 443, height: 823 }] : [{ width: 1440, height: 900 }];
  const extrema = validateView({ version: 1, template: 'chart', data: { kind: 'bubble', xLabel: 'Supplied X', yLabel: 'Supplied Y', series: [{ name: 'Four supplied corners', points: [
    { x: 0, y: 0, size: 9, rawX: '0.000', rawY: '0.00000000000000000' },
    { x: 0, y: 10, size: 9 }, { x: 10, y: 0, size: 9 }, { x: 10, y: 10, size: 9 },
  ] }] } });
  const scenarios = [
    ...(['radar', 'choropleth', 'bubble'] as const).map(kind => ({ name: kind, view: validateView(structuredClone(advancedChartExamples[kind])) })),
    { name: 'bubble-extrema', view: extrema },
  ];
  const receipt: unknown[] = [];
  for (const viewport of viewports) {
    await viewer.setViewportSize(viewport);
    for (const { name, view } of scenarios) {
      const prior = (await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)!.revision;
      await publishPrepared(page, sessionId, [display.id], view);
      const ready = await waitForDisplay(page, sessionId, display.id, item => item.revision > prior && item.appliedRevision === item.revision);
      expect(ready.view?.data).toEqual(view.data);
      await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision', String(ready.revision));
      const chart = viewer.locator(`.viewer-candidate .advanced-chart-${view.data.kind}`);
      await expect(chart).toBeVisible();
      await viewer.evaluate(() => document.fonts.ready.then(() => undefined));
      await viewer.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      if (name === 'choropleth') await chart.locator('.advanced-color-scale').scrollIntoViewIfNeeded();
      const metrics = await chart.evaluate(advancedChartLegibility);
      expect(metrics.overflow).toBe(false);
      const png = await viewer.screenshot({ path: `${directory}/${info.project.name}-${name}-${viewport.width}.png`, animations: 'disabled' });
      let scalePixels;
      if (name === 'radar') {
        expect(metrics.badges.map(badge => badge.label)).toEqual(['1', '2', '3', '4', '5']);
        for (const badge of metrics.badges) { expect(badge.font).toBeGreaterThanOrEqual(16); expect(badge.contrast).toBeGreaterThanOrEqual(4.5); }
      } else if (name === 'choropleth') {
        expect(metrics.scale?.backgroundImage).toContain('linear-gradient');
        scalePixels = await viewer.evaluate(advancedScalePixels, { png: png.toString('base64'), rect: metrics.scale! });
        expect(scalePixels.difference).toBeGreaterThan(30);
        await expect(chart.locator('[data-chart-region="zone-c"]')).toHaveAttribute('data-chart-value', 'no-data');
      } else {
        expect(metrics.bubbles).toHaveLength(4); expect(metrics.collisions).toEqual([]); expect(metrics.outside).toEqual([]);
      }
      const mark = chart.locator('[data-chart-mark][tabindex="0"][aria-label]').first();
      await mark.focus();
      await expect(chart.locator('.advanced-chart-readout')).toHaveText((await mark.getAttribute('aria-label'))!);
      const selected = await chart.evaluate(advancedChartLegibility);
      expect(selected.readout?.alpha).toBe(255); expect(selected.readout?.color).toBe(selected.surface);
      if (name === 'bubble-extrema') await expect(chart.locator('.advanced-chart-readout')).toContainText('0.00000000000000000');
      receipt.push({ name, viewport, ...metrics, scalePixels, readout: selected.readout });
    }
  }
  await writeFile(`${directory}/${info.project.name}-audit.json`, JSON.stringify(receipt, null, 2));
});

test('ordinary inner scrolling reaches full trailing chart labels and unobscured hierarchy-key rows', async ({ page }, info) => {
  test.setTimeout(180_000);
  await register(page);
  const sessionId = await createSession(page, 'Complete chart reader scrolling');
  const display = await createDisplay(page, sessionId, 'Chart scrolling screen');
  const viewer = await openViewer(page, sessionId, display.id);
  const viewports = info.project.name.startsWith('phone') ? [{ width: 390, height: 844 }, { width: 443, height: 823 }] : [{ width: 1440, height: 900 }];
  for (const viewport of viewports) {
    await viewer.setViewportSize(viewport);
    for (const kind of ['candlestick', 'ohlc', 'waterfall', 'treemap', 'sankey', 'choropleth'] as const) {
      const view = validateView({...structuredClone(advancedChartExamples[kind]), showControls: true});
      const prior = (await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)!.revision;
      await publishPrepared(page, sessionId, [display.id], view);
      const ready = await waitForDisplay(page, sessionId, display.id, item => item.revision > prior && item.appliedRevision === item.revision);
      expect(ready.view?.data).toEqual(view.data);
      await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision', String(ready.revision));
      const chart = viewer.locator(`.viewer-candidate .advanced-chart-${kind}`), body = chart.locator('.advanced-chart-body');
      await expect(chart).toBeVisible();
      await viewer.evaluate(() => document.fonts.ready.then(() => undefined));
      await viewer.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const scrolling = await body.evaluate(element => ({ x: element.scrollWidth - element.clientWidth, y: element.scrollHeight - element.clientHeight }));
      await body.hover({ position: { x: 90, y: 90 } });
      await viewer.mouse.wheel(scrolling.x + 150, scrolling.y + 150);
      await expect.poll(() => body.evaluate(element => element.scrollWidth - element.clientWidth - element.scrollLeft)).toBeLessThanOrEqual(1);
      await expect.poll(() => body.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(1);
      const key = chart.locator('.advanced-hierarchy .advanced-chart-key');
      if (await key.count()) {
        await viewer.mouse.wheel(-scrolling.x - 150, 0);
        await expect.poll(() => body.evaluate(element => element.scrollLeft)).toBeLessThanOrEqual(1);
        await viewer.mouse.move(2, 2);
        const last = key.locator('li').last(), row = (await last.boundingBox())!, frame = (await body.boundingBox())!;
        expect(row.y + row.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
        if (kind === 'treemap') await expect(last).toContainText('Verification');
        if (kind === 'sankey') await expect(last).toContainText('Recycled');
        if (kind === 'choropleth') await expect(last).toContainText('No data');
      } else {
        await viewer.mouse.move(2, 2);
        const lastLabel = chart.locator('svg .advanced-label[aria-label]').last(), label = (await lastLabel.boundingBox())!, frame = (await body.boundingBox())!;
        expect(label.x).toBeGreaterThanOrEqual(frame.x - 1); expect(label.x + label.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
        await expect(lastLabel).toHaveAttribute('aria-label', kind === 'waterfall' ? 'Closing balance' : '2026-09-04');
      }
      const last = chart.locator('[data-chart-mark][tabindex="0"][aria-label]').last();
      await last.focus(); await expect(chart.locator('.advanced-chart-readout')).toHaveText((await last.getAttribute('aria-label'))!);
      expect(await chart.evaluate(element => document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    }
  }
  // The reader clearance is conditional on an actual visible qualification.
  const ordinary = validateView(structuredClone(advancedChartExamples.treemap));
  const prior = (await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)!.revision;
  await publishPrepared(page, sessionId, [display.id], ordinary);
  await waitForDisplay(page, sessionId, display.id, item => item.revision > prior && item.appliedRevision === item.revision);
  await expect(viewer.locator('.viewer-candidate .view-qualification')).toHaveCount(0);
  await expect(viewer.locator('.viewer-candidate .advanced-hierarchy')).toHaveCSS('padding-bottom', '0px');
});
