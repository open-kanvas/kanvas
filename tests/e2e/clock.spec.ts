import { randomUUID } from 'node:crypto';
import type { Page, TestInfo } from '@playwright/test';
import type { ClockData } from '../../src/shared/clock';
import type { UpdateRecord, ViewSpec } from '../../src/shared/types';
import { captureDisplay, createDisplay, createSession, expect, openViewer, publishPrepared, register, sessionApi, sessionDetail, test, waitForDisplay } from './support';

test.use({ timezoneId: 'Europe/Oslo' });

async function setup(page: Page) {
  await register(page); const sessionId = await createSession(page, 'Clock acceptance'), display = await createDisplay(page, sessionId, 'Clock display');
  const viewer = await openViewer(page, sessionId, display.id); await viewer.bringToFront();
  return { sessionId, displayId: display.id, viewer };
}
const clock = (data: Partial<ClockData> = {}): ViewSpec => ({ version: 1, template: 'clock', title: 'Current time display', data });
async function ready(page: Page, viewer: Page, sessionId: string, displayId: string, revision = 1) {
  await waitForDisplay(page, sessionId, displayId, value => value.revision === revision && value.appliedRevision === revision);
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status', 'ready');
  await expect(viewer.locator('.clock-primary-time')).toBeVisible();
}
const instant = (viewer: Page) => viewer.locator('.clock-primary-time').evaluate(element => Date.parse(element.getAttribute('datetime')!));
async function assertTimes(viewer: Page, options: { hourFormat: '12h' | '24h'; showSeconds: boolean; showDate: boolean }) {
  const readings = await viewer.locator('.clock-primary,.clock-comparison').evaluateAll((elements, options) => elements.map(element => {
    const time = element.querySelector<HTMLElement>('.clock-time')!, zone = (element as HTMLElement).dataset.timeZone!, iso = time.getAttribute('datetime')!;
    const stamp = Date.parse(iso), formatter = new Intl.DateTimeFormat(undefined, { timeZone: zone, hour: '2-digit', minute: '2-digit', ...(options.showSeconds ? { second: '2-digit' } : {}), hourCycle: options.hourFormat === '12h' ? 'h12' : 'h23' });
    const date = element.querySelector('.clock-date time'), rectangle = time.getBoundingClientRect(), parent = element.getBoundingClientRect();
    return { actual: time.textContent, expected: formatter.formatToParts(stamp).map(part => part.value).join(''), iso,
      actualDate: date?.textContent,
      expectedDate: new Intl.DateTimeFormat(undefined, { timeZone: zone, calendar: 'gregory', weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }).format(stamp),
      fits: rectangle.left >= parent.left - 1 && rectangle.right <= parent.right + 1 && rectangle.top >= -1 && rectangle.bottom <= innerHeight + 1,
      size: parseFloat(getComputedStyle(time).fontSize),
    };
  }), options);
  for (const reading of readings) {
    expect(reading.actual).toBe(reading.expected); expect(reading.fits).toBe(true);
    if (options.showDate) expect(reading.actualDate).toBe(reading.expectedDate); else expect(reading.actualDate).toBeUndefined();
  }
  expect(new Set(readings.map(reading => reading.iso)).size).toBe(1);
  return readings;
}

test('minimal local clock ticks without publishing and fits both requested phone widths', async ({ page }, info: TestInfo) => {
  const { sessionId, displayId, viewer } = await setup(page);
  await publishPrepared(page, sessionId, [displayId], clock({ showSeconds: true })); await ready(page, viewer, sessionId, displayId);
  await expect(viewer.locator('.clock-primary')).toHaveAttribute('data-time-zone', 'Europe/Oslo');
  await expect(viewer.locator('.view-heading,.clock-label,.clock-date,.clock-comparisons')).toHaveCount(0);
  await expect(viewer.locator('.clock-content button')).toHaveCount(0);
  const before = await instant(viewer);
  await expect.poll(async () => (await instant(viewer)) - before).toBeGreaterThanOrEqual(1000);
  const first = await assertTimes(viewer, { hourFormat: '24h', showSeconds: true, showDate: false }); expect(first[0].size).toBeGreaterThan(50);
  // Session creation also adds Main display; verify the specific clock target.
  expect((await sessionDetail(page, sessionId)).displays.find(item => item.id === displayId)!.revision).toBe(1);
  await captureDisplay(viewer, info, 'clock-local');
  if (info.project.name.startsWith('phone')) {
    const resizedViewport = { width: 443, height: 823 };
    await viewer.setViewportSize(resizedViewport);
    // The viewer applies visual-viewport height through its resize/report
    // debounce. Await the observed surface, not just the browser resize command.
    await expect.poll(() => viewer.locator('.viewer-shell').evaluate(element => {
      const { width, height } = element.getBoundingClientRect();
      return { width, height };
    }), { message: 'Clock surface receives the requested phone viewport' }).toEqual(resizedViewport);
    await assertTimes(viewer, { hourFormat: '24h', showSeconds: true, showDate: false }); await captureDisplay(viewer, info, 'clock-local-443');
  }
});

test('three labelled clock zones share an exact instant with correct dates and 12-hour markers', async ({ page }, info) => {
  const { sessionId, displayId, viewer } = await setup(page);
  const data: Partial<ClockData> = { timeZone: 'UTC', label: 'Shared reference', hourFormat: '12h', showSeconds: true, zones: [{ timeZone: 'Pacific/Kiritimati', label: 'Kiritimati' }, { timeZone: 'Pacific/Pago_Pago', label: 'American Samoa' }] };
  await publishPrepared(page, sessionId, [displayId], clock(data)); await ready(page, viewer, sessionId, displayId);
  for (const label of ['Shared reference', 'Kiritimati', 'American Samoa']) await expect(viewer.getByRole('heading', { name: label, exact: true })).toBeVisible();
  await expect(viewer.locator('.clock-time')).toHaveCount(3);
  await assertTimes(viewer, { hourFormat: '12h', showSeconds: true, showDate: false });
  // UTC+14 and UTC-11 guarantee at least one differing local calendar day.
  expect(await viewer.locator('.clock-day-difference').count()).toBeGreaterThanOrEqual(1);
  const update = await sessionApi<UpdateRecord>(page, `/api/sessions/${sessionId}/displays/${displayId}/patch`, 'POST', { requestId: randomUUID(), expectedRevision: 1, operations: [{ op: 'set', path: '/data/showDate', value: true }] });
  expect(update.status).toBeGreaterThanOrEqual(200); expect(update.status).toBeLessThan(300); await ready(page, viewer, sessionId, displayId, 2);
  await expect(viewer.locator('.clock-date')).toHaveCount(3); await assertTimes(viewer, { hourFormat: '12h', showSeconds: true, showDate: true });
  await captureDisplay(viewer, info, 'clock-comparison-zones');
});

test('server-anchored clock catches delayed callbacks and suspended monotonic time on wake', async ({ page }) => {
  const { sessionId, displayId, viewer } = await setup(page);
  await publishPrepared(page, sessionId, [displayId], clock({ timeZone: 'UTC', showSeconds: true })); await ready(page, viewer, sessionId, displayId);
  // Keep this disposable browser's already-authorized snapshot stable while
  // changing its local clocks. New real server snapshots are tested separately.
  const snapshot = await sessionDetail(page, sessionId), sourcePath = `/api/sessions/${sessionId}`;
  const ownState = (url: URL) => url.pathname === sourcePath;
  await viewer.route(ownState, async route => {
    if (route.request().method() === 'GET') await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: snapshot }) });
    else await route.continue();
  });
  await viewer.clock.install({ time: new Date('2035-01-01T00:00:00Z') }); await viewer.reload();
  await expect(viewer.locator('.clock-content')).toHaveAttribute('data-clock-source', 'server');
  const baseline = await instant(viewer), serverMs = Date.parse(snapshot.displays.find(value => value.id === displayId)!.serverNow!);
  expect(Math.abs(baseline - serverMs)).toBeLessThan(2000);
  await viewer.clock.fastForward(95_000);
  await expect.poll(async () => Math.abs((await instant(viewer)) - baseline - 95_000)).toBeLessThan(2000);
  const beforeWake = await instant(viewer), localBeforeSleep = await viewer.evaluate(() => Date.now());
  // A wall-time jump without performance advancing models platforms that stop
  // their monotonic source during device sleep, rather than 3,600 timer ticks.
  await viewer.clock.setSystemTime(new Date(localBeforeSleep + 3_600_000));
  await viewer.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow')));
  await expect.poll(async () => Math.abs((await instant(viewer)) - beforeWake - 3_600_000)).toBeLessThan(2000);
  await assertTimes(viewer, { hourFormat: '24h', showSeconds: true, showDate: false });
  expect((await sessionDetail(page, sessionId)).displays.find(item => item.id === displayId)!.revision).toBe(1);
  await viewer.unroute(ownState);
});
