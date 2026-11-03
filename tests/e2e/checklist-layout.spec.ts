import type { Page } from '@playwright/test';
import type { ViewSpec } from '../../src/shared/types';
import { createDisplay, createSession, expect, openViewer, publishPrepared, register, sessionDetail, test, waitForDisplay } from './support';

const items = Array.from({ length: 40 }, (_, index) => ({ id: `item-${index + 1}`, text: `Item ${index + 1}`, checked: false }));
const checklist = (content: Array<{ id: string; text: string; checked?: boolean; detail?: string }> = items, options: Partial<ViewSpec> = {}): ViewSpec => ({ version: 1, template: 'checklist', data: { items: content }, ...options });
async function setup(page: Page) {
  await register(page);
  const sessionId = await createSession(page, 'Synthetic compact checklist'), display = await createDisplay(page, sessionId, 'Checklist acceptance');
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
}
const list = (viewer: Page) => viewer.locator('.viewer-candidate .checklist-content > ul');
async function columns(viewer: Page) {
  return list(viewer).evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
}
async function geometry(viewer: Page) {
  return list(viewer).evaluate(element => ({
    overflow: element.scrollWidth > element.clientWidth + 1,
    documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    rows: [...element.children].map(row => {
      const label = row.querySelector('span')!, button = row.querySelector('button')!;
      const rect = row.getBoundingClientRect(), target = button.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, text: label.textContent, font: parseFloat(getComputedStyle(label).fontSize), target: { width: target.width, height: target.height } };
    }),
  }));
}

test('forty short labels pack responsively in source order and persist pointer/keyboard toggles', async ({ page }, info) => {
  const { sessionId, display, viewer } = await setup(page);
  await show(page, viewer, sessionId, display.id, checklist());
  const phone = info.project.name.startsWith('phone');
  if (phone) await expect.poll(() => columns(viewer)).toBe(1);
  else await expect.poll(() => columns(viewer)).toBeGreaterThanOrEqual(4);
  const initial = await geometry(viewer);
  expect(initial.rows.map(row => row.text)).toEqual(items.map(item => item.text));
  expect(initial.overflow).toBe(false); expect(initial.documentOverflow).toBe(false);
  for (const row of initial.rows) {
    expect(row.font).toBeGreaterThanOrEqual(16);
    expect(row.target.width).toBeGreaterThanOrEqual(24); expect(row.target.height).toBeGreaterThanOrEqual(24);
  }
  if (!phone) {
    expect(initial.rows[0].y).toBe(initial.rows[3].y);
    expect(initial.rows[3].x).toBeGreaterThan(initial.rows[0].x);
    expect(initial.rows[0].height).toBeLessThan(105);
  }
  await viewer.screenshot({ path: info.outputPath('compact-checklist.png'), animations: 'disabled' });
  const first = list(viewer).getByRole('checkbox', { name: 'Item 1', exact: true });
  await first.click(); await expect(first).toHaveAttribute('aria-checked', 'true');
  await first.focus(); await viewer.keyboard.press('Tab');
  const second = list(viewer).getByRole('checkbox', { name: 'Item 2', exact: true });
  await expect(second).toBeFocused(); await viewer.keyboard.press('Space');
  await expect(second).toHaveAttribute('aria-checked', 'true');
  const persisted = (await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)!.view!.data.items as typeof items;
  expect(persisted).toEqual(items.map((item, index) => ({ ...item, checked: index < 2 })));
  await expect(viewer.locator('.viewer-candidate').getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  await list(viewer).getByRole('checkbox', { name: 'Item 40', exact: true }).scrollIntoViewIfNeeded();
  await expect(list(viewer).getByRole('checkbox', { name: 'Item 40', exact: true })).toBeInViewport();
  // Exercise an actual size change in both directions, without republishing.
  await viewer.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => columns(viewer)).toBe(1);
  expect((await geometry(viewer)).overflow).toBe(false);
  await viewer.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => columns(viewer)).toBeGreaterThanOrEqual(4);
  await expect(first).toHaveAttribute('aria-checked', 'true');
});

test('prose and details use readable responsive columns without clipping or losing exact source text', async ({ page }, info) => {
  const { sessionId, display, viewer } = await setup(page);
  const longLabel = 'Keep every word of this intentionally detailed checklist instruction: review the complete release notes and verify every acceptance criterion before approving the next step.';
  const detail = '  Exact supplied detail.\nSecond line with an_unbroken_identifier_' + 'x'.repeat(100) + '  ';
  const cases = [
    { content: items.map((item, index) => index === 0 ? { ...item, text: longLabel } : item), options: {} },
    { content: items.map((item, index) => index === 0 ? { ...item, detail } : item), options: {} },
    { content: items.map((item, index) => index === 0 ? { ...item, detail } : item), options: { showControls: true } },
    { content: items.map((item, index) => index === 0 ? { ...item, text: '  First line\nSecond line  ' } : item), options: {} },
  ];
  for (const [index, sample] of cases.entries()) {
    await show(page, viewer, sessionId, display.id, checklist(sample.content, sample.options));
    // October 27 replaced the original blanket single-column fallback with
    // wide prose columns: 28em for long text/detail, 20em for short multiline.
    const phone = info.project.name.startsWith('phone');
    const expectedColumns = phone ? 1 : 2;
    await expect.poll(() => columns(viewer)).toBe(expectedColumns);
    expect(await list(viewer).locator(':scope > li > div > span').allTextContents()).toEqual(sample.content.map(item => item.text));
    const disclosure = list(viewer).locator('details');
    if (sample.options.showControls) await disclosure.locator('summary').click();
    if (index === 1 || index === 2) expect(await list(viewer).locator('li').first().locator('p').textContent()).toBe(detail);
    const metrics = await geometry(viewer);
    expect(metrics.overflow).toBe(false); expect(metrics.documentOverflow).toBe(false);
    for (const row of metrics.rows) {
      expect(row.font).toBeGreaterThanOrEqual(16);
      if (!phone) expect(row.width).toBeGreaterThanOrEqual(row.font * (index === 3 ? 20 : 28));
    }
    expect(metrics.rows[expectedColumns].y).toBeGreaterThan(metrics.rows[0].y);
    expect(metrics.rows[expectedColumns].x).toBe(metrics.rows[0].x);
    if (!phone) {
      expect(metrics.rows[1].y).toBe(metrics.rows[0].y);
      expect(metrics.rows[1].x).toBeGreaterThan(metrics.rows[0].x);
    }
    const clipped = await list(viewer).locator('li > div').evaluateAll(elements =>
      elements.some(element => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1));
    expect(clipped).toBe(false);
    await viewer.screenshot({ path: info.outputPath(`prose-columns-${index}.png`), animations: 'disabled' });
  }
  // New content must recover its compact layout, not retain an old fallback.
  await show(page, viewer, sessionId, display.id, checklist());
  if (info.project.name.startsWith('phone')) await expect.poll(() => columns(viewer)).toBe(1);
  else await expect.poll(() => columns(viewer)).toBeGreaterThanOrEqual(4);
});
