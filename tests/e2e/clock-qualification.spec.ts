import type { Page } from '@playwright/test';
import type { ViewSpec } from '../../src/shared/types';
import { createDisplay, createSession, expect, openViewer, publishPrepared, register, sessionDetail, test, waitForDisplay } from './support';

const heading = 'A supplied outer clock heading that must remain fully readable alongside the display controls.';
const source = { title: 'Synthetic clock layout acceptance' };
const clock = (zones: boolean, qualified: boolean, extra: Partial<ViewSpec> = {}): ViewSpec => ({
  version: 1, template: 'clock', title: heading,
  ...(qualified ? { source } : {}),
  data: {
    timeZone: 'Europe/Oslo', label: 'Arendal', hourFormat: '24h', showSeconds: true, showDate: true,
    ...(zones ? { zones: [{ timeZone: 'America/New_York', label: 'New York' }, { timeZone: 'Asia/Tokyo', label: 'Tokyo' }] } : {}),
  },
  ...extra,
});

async function assertClockLayout(viewer: Page, qualified: boolean, showDate: boolean, showSource = false) {
  const surface = viewer.locator('.viewer-candidate .template-clock');
  await expect(surface.locator('.clock-primary-time')).toBeVisible();
  await viewer.evaluate(() => document.fonts.ready.then(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
  const geometry = await surface.evaluate(root => {
    const rect = (element: Element) => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    const menu = document.querySelector('.viewer-menu-toggle')!, menuRect = rect(menu), qualifier = root.querySelector(':scope > .view-qualification');
    const styles = getComputedStyle(root), locale = root.getAttribute('lang') || undefined;
    const calendarDay = (stamp: number, zone: string) => {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(stamp);
      const value = (name: string) => Number(parts.find(part => part.type === name)!.value);
      return Date.UTC(value('year'), value('month') - 1, value('day')) / 86_400_000;
    };
    const primaryZone = root.querySelector<HTMLElement>('.clock-primary')!.dataset.timeZone!;
    const readings = [...root.querySelectorAll<HTMLElement>('.clock-primary,.clock-comparison')].map(element => {
      const zone = element.dataset.timeZone!, time = element.querySelector<HTMLTimeElement>('.clock-time')!;
      const stamp = Date.parse(time.dateTime), difference = calendarDay(stamp, zone) - calendarDay(stamp, primaryZone);
      return {
        instant: time.dateTime, actualDate: element.querySelector('.clock-date time')?.textContent,
        expectedDate: new Intl.DateTimeFormat(locale, { timeZone: zone, calendar: 'gregory', weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }).format(stamp),
        actualDifference: element.querySelector('.clock-day-difference')?.textContent,
        expectedDifference: difference ? new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(difference, 'day') : undefined,
      };
    });
    const titleLines = [...document.querySelectorAll('.viewer-candidate .view-heading h1')].flatMap(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      return [...range.getClientRects()].map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
    });
    const texts = [...root.querySelectorAll('.clock-label,.clock-time,.clock-date,.clock-day-difference')].map(element => ({
      text: element.textContent, rect: rect(element), font: parseFloat(getComputedStyle(element).fontSize),
      isDate: element.matches('.clock-date,.clock-day-difference'),
    }));
    const menuClear = [[.5, .5], [.1, .1], [.9, .1], [.1, .9], [.9, .9]].every(([x, y]) => {
      const hit = document.elementFromPoint(menuRect.x + menuRect.width * x, menuRect.y + menuRect.height * y);
      return hit !== null && (hit === menu || menu.contains(hit));
    });
    const comparisons = root.querySelector('.clock-comparisons');
    return {
      surface: rect(root), body: rect(root.querySelector(':scope > .render-body')!),
      requestedChrome: [...root.children].filter(element => !element.matches('.render-body') && getComputedStyle(element).position !== 'absolute' && getComputedStyle(element).display !== 'none').reduce((sum, element) => {
        const style = getComputedStyle(element); return sum + element.getBoundingClientRect().height + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
      }, 0),
      padding: { top: parseFloat(styles.paddingTop), bottom: parseFloat(styles.paddingBottom) },
      qualifier: qualifier ? rect(qualifier) : null, menu: menuRect, menuClear, texts, titleLines, readings,
      comparisons: comparisons ? { client: comparisons.clientHeight, scroll: comparisons.scrollHeight } : null,
      viewport: { width: innerWidth, height: innerHeight },
      page: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
    };
  });
  const separate = (a: typeof geometry.menu, b: typeof geometry.menu) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
  expect(geometry.menuClear, 'The actual display-menu hit target is unobstructed').toBe(true);
  expect(geometry.menu.width).toBeGreaterThanOrEqual(44); expect(geometry.menu.height).toBeGreaterThanOrEqual(44);
  for (const line of geometry.titleLines) expect(separate(line, geometry.menu), 'Requested outer title clears the display controls').toBe(true);
  for (const text of geometry.texts) {
    expect(separate(text.rect, geometry.menu), `${text.text} clears the display controls`).toBe(true);
    if (geometry.qualifier) expect(separate(text.rect, geometry.qualifier), `${text.text} clears the actual qualification`).toBe(true);
    expect(text.rect.x).toBeGreaterThanOrEqual(-1); expect(text.rect.y).toBeGreaterThanOrEqual(-1);
    expect(text.rect.x + text.rect.width).toBeLessThanOrEqual(geometry.viewport.width + 1);
    expect(text.rect.y + text.rect.height).toBeLessThanOrEqual(geometry.viewport.height + 1);
    if (text.isDate) expect(text.font, 'Dates and day differences keep their readable text size').toBeGreaterThanOrEqual(16);
  }
  if (geometry.comparisons) expect(geometry.comparisons.scroll, 'Complete secondary-zone content is visible in these viewport fixtures').toBeLessThanOrEqual(geometry.comparisons.client + 1);
  expect(geometry.page.width).toBeLessThanOrEqual(geometry.viewport.width); expect(geometry.page.height).toBeLessThanOrEqual(geometry.viewport.height);
  expect(new Set(geometry.readings.map(reading => reading.instant)).size).toBe(1);
  for (const reading of geometry.readings) {
    if (showDate) expect(reading.actualDate).toBe(reading.expectedDate);
    else { expect(reading.actualDate).toBeUndefined(); expect(reading.actualDifference).toBe(reading.expectedDifference); }
  }
  if (!showDate) expect(geometry.readings.some(reading => reading.actualDifference), 'Opposite-date-line zones disclose their real day difference').toBe(true);
  await expect(surface.locator('.view-qualification,.illustrative-label')).toHaveCount(0);
  if(!showSource){
    expect(geometry.body.height).toBeCloseTo(geometry.surface.height-geometry.padding.top-geometry.padding.bottom-geometry.requestedChrome,0);
    await expect(surface.locator('.view-information,.view-actions')).toHaveCount(0);
  }

}

test('clock dates and day differences keep readable source details and unobstructed display controls', async ({ page }, info) => {
  await register(page);
  const sessionId = await createSession(page, 'Clock truth qualification'), display = await createDisplay(page, sessionId, 'Clock receiving screen');
  const viewer = await openViewer(page, sessionId, display.id); await viewer.bringToFront();
  const variants: Array<{ name: string; view: ViewSpec; qualified: boolean; showDate: boolean; showSource?: boolean; navigate?: boolean }> = [
    { name: 'solo', view: clock(false, false), qualified: false, showDate: true },
    { name: 'three-zones', view: clock(true, false), qualified: false, showDate: true },
    { name: 'day-difference', qualified: true, showDate: false, view: clock(true, true, { data: {
      timeZone: 'UTC', label: 'Shared reference', hourFormat: '24h', showSeconds: true, showDate: false,
      // UTC+14 and UTC-11 guarantee a real differing day at every test instant.
      zones: [{ timeZone: 'Pacific/Kiritimati', label: 'Kiritimati' }, { timeZone: 'Pacific/Pago_Pago', label: 'American Samoa' }],
    } }) },
    { name: 'explicit-source', view: clock(true, true, { showSource: true }), qualified: true, showDate: true, showSource: true },
    { name: 'long-title', view: clock(true, true, { showTitle: true }), qualified: true, showDate: true },
    { name: 'presentation-navigation', qualified: true, showDate: true, navigate: true, view: {
      version: 1, template: 'presentation', title: heading, showTitle: true, showControls: true, source,
      data: { index: 0, slides: [clock(true, false, { title: undefined }), { version: 1, template: 'fact', data: { text: 'A second supplied slide' } }] },
    } },
  ];
  for (const width of info.project.name.startsWith('phone') ? [390, 443] : [1440]) {
    const viewport = { width, height: width === 1440 ? 900 : width === 443 ? 823 : 844 };
    await viewer.setViewportSize(viewport);
    await expect.poll(() => viewer.locator('.viewer-shell').evaluate(element => {
      const { width, height } = element.getBoundingClientRect(); return { width, height };
    }), { message: 'The actual viewer surface receives the resized viewport' }).toEqual(viewport);
    for (const variant of variants) {
      await test.step(`${width}/${variant.name}`, async () => {
        const before = (await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)!.revision;
        await publishPrepared(page, sessionId, [display.id], variant.view);
        let current = await waitForDisplay(page, sessionId, display.id, item => item.revision > before && item.appliedRevision === item.revision);
        await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision', String(current.revision));
        await assertClockLayout(viewer, variant.qualified, variant.showDate, variant.showSource);
        if (variant.name === 'long-title' || variant.navigate) await expect(viewer.locator('.viewer-candidate .view-heading h1')).toHaveText(heading);
        if (variant.name === 'three-zones' || variant.name === 'long-title' || variant.navigate) {
          await viewer.getByRole('button', { name: 'Display controls', exact: true }).click();
          await expect(viewer.locator('.viewer-menu')).toBeInViewport({ ratio: 1 });
          await viewer.getByRole('button', { name: 'Display controls', exact: true }).click();
          await expect(viewer.locator('.viewer-menu')).toHaveCount(0);
        }
        if (variant.showSource) {
          await viewer.getByLabel('About this view', { exact: true }).click();
          await expect(viewer.getByRole('region', { name: 'View information', exact: true })).toBeInViewport({ ratio: 1 });
          await viewer.getByRole('button', { name: 'Close view information', exact: true }).click();
        }
        if (variant.name === 'three-qualified' || variant.navigate) {
          const path = info.outputPath(`clock-qualification-${width}-${variant.name}.png`);
          await viewer.screenshot({ path, animations: 'disabled' });
          await info.attach(`clock-qualification-${width}-${variant.name}`, { path, contentType: 'image/png' });
        }
        if (variant.navigate) {
          await viewer.getByRole('button', { name: 'Next slide', exact: true }).click();
          current = await waitForDisplay(page, sessionId, display.id, item => item.revision > current.revision && item.appliedRevision === item.revision && item.view?.data.index === 1);
          await expect(viewer.locator('.fact-text')).toHaveText('A second supplied slide');
          await expect(viewer.locator('.clock-content')).toHaveCount(0);
          await viewer.getByRole('button', { name: 'Previous slide', exact: true }).click();
          await waitForDisplay(page, sessionId, display.id, item => item.revision > current.revision && item.appliedRevision === item.revision && item.view?.data.index === 0);
          await assertClockLayout(viewer, true, true);
        }
      });
    }
  }
});
