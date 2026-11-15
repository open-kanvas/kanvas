import { mkdir, writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { ViewSpec } from '../../src/shared/types';
import { validateView } from '../../src/shared/view-schemas';
import { createDisplay, createSession, expect, openViewer, publishPrepared, register, sessionDetail, test, waitForDisplay } from './support';

const LABELS = ['52-week low', 'All-time high (May 13)', 'Sep 11 close', 'Latest session'];
const REGIONS = ['Northern coastal region', 'Central inland region', 'Southern offshore region'];
function chart(kind: 'line' | 'bar' | 'box' | 'heatmap'): ViewSpec {
  const points = kind === 'heatmap'
    ? REGIONS.flatMap((y, row) => LABELS.map((x, index) => ({ x, y, value: (row + 1) * 10 + index, raw: { value: `${(row + 1) * 10 + index}.00000000000000001` } })))
    : LABELS.map((x, index) => kind === 'box'
      ? { x, y: 40 + index * 10, low: 10 + index * 10, q1: 25 + index * 10, median: 40 + index * 10, q3: 50 + index * 10, high: 65 + index * 10 }
      : { x, y: 20 + index * 20, rawY: `${20 + index * 20}.00000000000000001` });
  return validateView({ version: 1, template: 'chart', data: { kind, xLabel: 'Price milestone', yLabel: kind === 'heatmap' ? 'Supplied region' : 'Share price', unit: 'USD', series: [{ name: 'Supplied values', points }] } });
}
async function setup(page: Page) {
  await register(page);
  const sessionId = await createSession(page, 'Measured category labels');
  const display = await createDisplay(page, sessionId, 'Category chart screen');
  const viewer = await openViewer(page, sessionId, display.id);
  return { sessionId, display, viewer };
}
async function show(page: Page, viewer: Page, sessionId: string, displayId: string, view: ViewSpec) {
  const before = (await sessionDetail(page, sessionId)).displays.find(display => display.id === displayId)!.revision;
  await publishPrepared(page, sessionId, [displayId], view);
  const current = await waitForDisplay(page, sessionId, displayId, display => display.revision > before && display.appliedRevision === display.revision);
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision', String(current.revision));
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status', 'ready');
  await viewer.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect.poll(() => viewer.locator('.legacy-chart-plot').evaluate(element => Math.abs(element.querySelector('svg')!.getBoundingClientRect().width - element.clientWidth))).toBeLessThan(1);
  await viewer.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function geometry(viewer: Page) {
  return viewer.locator('.legacy-chart').evaluate(root => {
    const svg = root.querySelector<SVGSVGElement>('.chart-svg')!, box = svg.getBoundingClientRect();
    const text = [...svg.querySelectorAll<SVGGraphicsElement>('text[data-chart-axis],.chart-axis-label')].map(element => {
      const rect = element.getBoundingClientRect(), matrix = element.getScreenCTM()!, box = element.getBBox();
      const corners = [[box.x,box.y],[box.x+box.width,box.y],[box.x+box.width,box.y+box.height],[box.x,box.y+box.height]].map(([x,y])=>{const p=new DOMPoint(x,y).matrixTransform(matrix);return {x:p.x,y:p.y};});
      return { corners, label: element.getAttribute('aria-label') ?? element.textContent, axis: element.getAttribute('data-chart-axis') ?? 'title', rotated: element.hasAttribute('transform'), x: rect.x, y: rect.y, width: rect.width, height: rect.height, actualFont: parseFloat(getComputedStyle(element).fontSize) * Math.hypot(matrix.a, matrix.b), lines: [...element.querySelectorAll('tspan')].map(line => line.textContent) };
    });
    const overlaps = (a:typeof text[number],b:typeof text[number]) => [a,b].every(shape=>shape.corners.every((p,i)=>{const q=shape.corners[(i+1)%4],length=Math.hypot(q.x-p.x,q.y-p.y);if(!length)return true;const axis={x:-(q.y-p.y)/length,y:(q.x-p.x)/length},project=(points:typeof shape.corners)=>points.map(v=>v.x*axis.x+v.y*axis.y),aa=project(a.corners),bb=project(b.corners);return Math.min(Math.max(...aa),Math.max(...bb))-Math.max(Math.min(...aa),Math.min(...bb))>.5;}));
    const collisions = text.flatMap((first,index)=>text.slice(index+1).filter(second=>overlaps(first,second)).map(second=>[first.label,second.label]));
    return {
      svg: { x: box.x, y: box.y, width: box.width, height: box.height }, text, collisions,
      outside: text.filter(rect => rect.x < box.x - .5 || rect.y < box.y - .5 || rect.x + rect.width > box.right + .5 || rect.y + rect.height > box.bottom + .5),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      labels: [...root.querySelectorAll('[data-chart-axis="x"][data-chart-tick-label]')].map(element => element.getAttribute('data-chart-tick-label')),
    };
  });
}

test('reported category names fit as full readable labels on narrow and desktop receiving screens', async ({ page }, info) => {
  test.setTimeout(180_000);
  const { sessionId, display, viewer } = await setup(page);
  const viewports = info.project.name.startsWith('phone') ? [{ width: 390, height: 844 }, { width: 443, height: 823 }, { width: 445, height: 823 }] : [{ width: 1440, height: 900 }];
  const receipt: unknown[] = [];
  await mkdir(info.outputPath('visuals'), { recursive: true });
  for (const viewport of viewports) {
    await viewer.setViewportSize(viewport);
    for (const kind of ['line', 'bar', 'box', 'heatmap'] as const) {
      const view = chart(kind);
      await show(page, viewer, sessionId, display.id, view);
      const metrics = await geometry(viewer);
      expect(metrics.labels).toEqual(LABELS); expect(metrics.collisions).toEqual([]); expect(metrics.outside).toEqual([]); expect(metrics.horizontalOverflow).toBe(false);
      expect(Math.min(...metrics.text.map(item => item.actualFont))).toBeGreaterThanOrEqual(15.9);
      // Current axes rotate dense ticks rather than requiring a particular line break.
      const xTicks = metrics.text.filter(item => item.axis === 'x');
      expect(xTicks.map(item => item.lines.join(' '))).toEqual(LABELS);
      if (viewport.width < 600) expect(xTicks.some(item => item.rotated || item.lines.length > 1)).toBe(true);
      await expect(viewer.locator('.legacy-chart [data-chart-series]')).toHaveCount(kind === 'heatmap' ? 12 : 4);
      await expect(viewer.locator('.legacy-chart table')).toHaveCount(0);
      await expect(viewer.locator('.legacy-chart').getByRole('button', { name: 'Data', exact: true })).toHaveCount(0);
      if (kind === 'heatmap') {
        expect(metrics.text.filter(item => item.axis === 'y').map(item => item.label)).toEqual(REGIONS);
        await viewer.locator('.legacy-chart [data-chart-series]').first().focus();
        await expect(viewer.locator('.chart-point-detail')).toContainText('10.00000000000000001');
      } else if (kind !== 'box') {
        const point = viewer.locator('.legacy-chart [data-chart-series]').first();
        await expect(point.locator('title')).toContainText('20.00000000000000001');
        await point.focus(); await expect(viewer.locator('.chart-point-detail')).toContainText('20.00000000000000001');
      }
      await viewer.locator('.legacy-chart').evaluate(element => { if (document.activeElement instanceof SVGElement) (document.activeElement as SVGElement & { blur(): void }).blur(); element.dispatchEvent(new MouseEvent('mouseleave')); });
      await viewer.screenshot({ path: `${info.outputPath('visuals')}/${info.project.name}-${kind}-${viewport.width}x${viewport.height}.png`, animations: 'disabled' });
      receipt.push({ kind, viewport, ...metrics });
      expect((await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)?.view?.data).toEqual(view.data);
    }
  }
  await writeFile(`${info.outputPath('visuals')}/${info.project.name}-geometry.json`, JSON.stringify(receipt, null, 2));
});

test('dense categories retain observations and exact accessible labels with rotated ticks and no key', async ({ page }, info) => {
  const { sessionId, display, viewer } = await setup(page);
  if (info.project.name.startsWith('phone')) await viewer.setViewportSize({ width: 443, height: 823 });
  const points = Array.from({ length: 35 }, (_, index) => ({ x: `Complete supplied milestone number ${index + 1}`, y: index === 17 ? null : index + 1, rawY: index === 17 ? null : `${index + 1}.00000000000000001` }));
  const view = validateView({ version: 1, template: 'chart', data: { kind: 'line', xLabel: 'Full source milestone', yLabel: 'Source amount', unit: 'USD', series: [{ name: 'Supplied values', points }] } });
  await show(page, viewer, sessionId, display.id, view);
  const metrics = await geometry(viewer);
  expect(metrics.collisions).toEqual([]); expect(metrics.outside).toEqual([]); expect(Math.min(...metrics.text.map(item => item.actualFont))).toBeGreaterThanOrEqual(15.9);
  await expect(viewer.locator('.legacy-chart [data-chart-series]')).toHaveCount(34);
  const key = viewer.getByRole('region', { name: 'Complete chart category labels' });
  await expect(key).toHaveCount(0);expect(metrics.labels.every(label=>points.some(point=>point.x===label))).toBe(true);expect(metrics.labels.length).toBeGreaterThan(2);
  expect((await viewer.locator('[data-chart-line]').getAttribute('d'))?.match(/M/gu)).toHaveLength(2);
  const point = viewer.locator('.legacy-chart [data-chart-series]').last();
  await point.focus(); await expect(viewer.locator('.chart-point-detail')).toContainText('Complete supplied milestone number 35'); await expect(viewer.locator('.chart-point-detail')).toContainText('35.00000000000000001');
  await expect(viewer.locator('.legacy-chart table')).toHaveCount(0);
  expect((await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)?.view?.data).toEqual(view.data);
});
