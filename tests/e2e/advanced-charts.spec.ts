import { mkdir, writeFile } from 'node:fs/promises';
import { advancedChartExamples } from '../../src/shared/advanced-chart-examples';
import { validateView } from '../../src/shared/view-schemas';
import { createDisplay, createSession, expect, openViewer, publishPrepared, register, sessionDetail, test, waitForDisplay } from './support';

test('all fifteen advanced chart families paint supplied data with readable narrow-screen geometry', async ({ page }, info) => {
  test.setTimeout(300_000);
  await register(page);
  const sessionId = await createSession(page, 'Advanced chart acceptance');
  const display = await createDisplay(page, sessionId, 'Source-backed charts');
  const viewer = await openViewer(page, sessionId, display.id);
  await viewer.bringToFront();
  if (info.project.name.startsWith('phone')) await viewer.setViewportSize({ width: 443, height: 823 });
  const directory = info.outputPath('visuals');
  await mkdir(directory, { recursive: true });
  const audit: unknown[] = [];
  for (const [kind, sample] of Object.entries(advancedChartExamples)) {
    const view = validateView(structuredClone(sample));
    const prior = (await sessionDetail(page, sessionId)).displays[0].revision;
    await publishPrepared(page, sessionId, [display.id], view);
    const ready = await waitForDisplay(page, sessionId, display.id, d => d.revision > prior && d.appliedRevision === d.revision);
    expect(ready.view?.data).toEqual(view.data);
    await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision', String(ready.revision));
    const chart = viewer.locator(`.viewer-candidate .advanced-chart-${kind}`);
    await expect(chart).toBeVisible();
    await expect(chart.locator('[data-chart-mark]').first()).toBeVisible();
    await expect(viewer.locator('.viewer-candidate .view-information>summary')).toHaveCount(0);
    await expect(viewer.locator('.viewer-candidate .view-qualification')).toHaveCount(0);
    await viewer.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const metrics = await chart.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const sizes = [...element.querySelectorAll<SVGGraphicsElement>('svg .advanced-label,svg .advanced-axis text')].map(label => {
        const matrix = label.getScreenCTM();
        return matrix ? parseFloat(getComputedStyle(label).fontSize) * Math.hypot(matrix.a, matrix.b) : 0;
      });
      return { width: rect.width, height: rect.height, viewport: { width: innerWidth, height: innerHeight },
        documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight,
        smallestLabel: sizes.length ? Math.min(...sizes) : null,
        invalidGeometry: [...element.querySelectorAll('svg [d],svg [transform]')].some(node => /(?:NaN|Infinity)/.test(`${node.getAttribute('d')} ${node.getAttribute('transform')}`)),
        marks: element.querySelectorAll('[data-chart-mark]').length,
      };
    });
    expect(metrics.width).toBeGreaterThan(200); expect(metrics.height).toBeGreaterThan(150);
    expect(metrics.documentWidth, `${kind}: no page-wide overflow`).toBeLessThanOrEqual(metrics.viewport.width + 2);
    expect(metrics.documentHeight, `${kind}: inner data scroll only`).toBeLessThanOrEqual(metrics.viewport.height + 2);
    if (metrics.smallestLabel !== null) expect(metrics.smallestLabel, `${kind}: labels use real CSS pixels`).toBeGreaterThanOrEqual(15.9);
    expect(metrics.invalidGeometry, `${kind}: finite rendered geometry`).toBe(false);
    audit.push({ kind, ...metrics });
    await viewer.screenshot({ path: `${directory}/${info.project.name}-${kind}.png`, animations: 'disabled' });
    // Filled regions/arcs are geometry; source observations and supplied keys
    // expose the focusable inspection contract used by keyboard readers.
    const firstMark = chart.locator('[data-chart-mark][tabindex="0"][aria-label]').first();
    const suppliedReadout = await firstMark.getAttribute('aria-label');
    expect(suppliedReadout, `${kind}: a focusable supplied-data label exists`).toBeTruthy();
    await firstMark.focus();
    await expect(firstMark).toBeFocused();
    await expect(chart.locator('.advanced-chart-readout')).toHaveText(suppliedReadout!);
  }
  await writeFile(`${directory}/${info.project.name}-audit.json`, JSON.stringify(audit, null, 2));
});
