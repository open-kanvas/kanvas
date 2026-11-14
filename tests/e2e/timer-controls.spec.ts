import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { countdownDataSchema, timerSeconds } from '../../src/shared/timer';
import type { UpdateRecord, ViewSpec } from '../../src/shared/types';
import { test, expect, register, createSession, createDisplay, openViewer, publishPrepared, waitForDisplay, sessionApi, captureDisplay } from './support';

async function control(page: Page, sessionId: string, displayId: string, input: { expectedRevision: number; requestId: string; action: 'pause' | 'resume' }) {
  const result = await sessionApi<UpdateRecord>(page, `/api/sessions/${sessionId}/displays/${displayId}/timer-control`, 'POST', input);
  expect(result.status, result.code ?? 'Timer action accepted').toBeGreaterThanOrEqual(200); expect(result.status).toBeLessThan(300);
  return result.data!;
}
async function ready(page: Page, viewer: Page, sessionId: string, displayId: string, revision: number) {
  const display = await waitForDisplay(page, sessionId, displayId, display => display.revision === revision && display.appliedRevision === revision);
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status', 'ready');
  await expect(viewer.locator('.viewer-candidate .countdown-digits')).toBeVisible();
  return display;
}

for (const direction of ['down', 'up'] as const) test(`${direction} timer pause survives reload and exact retry, then resumes without paused wall time`, async ({ page, diagnostics }, info) => {
  await register(page);
  const sessionId = await createSession(page, `Timer ${direction} control acceptance`), display = await createDisplay(page, sessionId, 'Timer screen');
  const viewer = await openViewer(page, sessionId, display.id);
  if (info.project.name.startsWith('phone')) await viewer.setViewportSize({ width: 443, height: 823 });
  await viewer.bringToFront();
  const nowMs = Date.now(), view: ViewSpec = {
    version: 1, template: 'countdown', title: 'Stored timer metadata', 
    data: { label: 'Workshop time', ...(direction === 'up' ? { direction, startedAt: new Date(nowMs - 42125).toISOString() } : { endsAt: new Date(nowMs + 120000).toISOString(), completeText: 'Workshop resumes' }) },
  };
  await publishPrepared(page, sessionId, [display.id], view); await ready(page, viewer, sessionId, display.id, 1);
  const request = { expectedRevision: 1, requestId: randomUUID(), action: 'pause' as const }, pause = await control(page, sessionId, display.id, request);
  const paused = await ready(page, viewer, sessionId, display.id, 2), field = direction === 'up' ? 'pausedElapsedSeconds' : 'pausedRemainingSeconds';
  const storedSeconds = Number(paused.view!.data[field]), displaySeconds = direction === 'up' ? Math.floor(storedSeconds) : Math.ceil(storedSeconds);
  const digits = viewer.locator('.viewer-candidate .countdown-digits');
  await expect(viewer.locator('.viewer-candidate .countdown-status')).toHaveText('Paused');
  await expect(digits).toHaveAttribute('data-seconds', String(displaySeconds));
  await expect(viewer.locator('.viewer-candidate .countdown-label')).toHaveText('Workshop time');
  await viewer.waitForTimeout(1300);
  await expect(digits).toHaveAttribute('data-seconds', String(displaySeconds));
  await viewer.reload(); await ready(page, viewer, sessionId, display.id, 2);
  await expect(digits).toHaveAttribute('data-seconds', String(displaySeconds));
  const replay = await control(page, sessionId, display.id, request);
  expect(replay).toMatchObject({ id: pause.id, revisions: pause.revisions, createdAt: pause.createdAt });
  const afterRetry = await waitForDisplay(page, sessionId, display.id, display => display.revision === 2);
  expect(afterRetry.view!.data[field]).toBe(storedSeconds);
  await captureDisplay(viewer, info, `${direction}-timer-paused`);

  await control(page, sessionId, display.id, { expectedRevision: 2, requestId: randomUUID(), action: 'resume' });
  const resumed = await ready(page, viewer, sessionId, display.id, 3);
  expect(resumed.view!.data).not.toHaveProperty(field);
  expect(Math.abs(timerSeconds(countdownDataSchema.parse(resumed.view!.data), Date.parse(resumed.serverNow!)) - storedSeconds)).toBeLessThan(1);
  await expect(viewer.locator('.viewer-candidate .countdown-content')).toHaveAttribute('data-phase', 'running');
  const first = Number(await digits.getAttribute('data-seconds'));
  if (direction === 'up') await expect.poll(async () => Number(await digits.getAttribute('data-seconds'))).toBeGreaterThan(first);
  else await expect.poll(async () => Number(await digits.getAttribute('data-seconds'))).toBeLessThan(first);
  await captureDisplay(viewer, info, `${direction}-timer-resumed`);

  // A new publication is a separate visual intent; an old control cannot
  // resurrect its timer when the receiving browser is already on that view.
  await publishPrepared(page, sessionId, [display.id], { version: 1, template: 'fact', data: { text: 'A newer visual takes priority.' } });
  await waitForDisplay(page, sessionId, display.id, display => display.revision === 4 && display.appliedRevision === 4);
  await expect(viewer.locator('.viewer-candidate')).toContainText('A newer visual takes priority.');
  const path = `/api/sessions/${sessionId}/displays/${display.id}/timer-control`;
  diagnostics.allowHttp(page, path, 409);
  const stale = await sessionApi(page, path, 'POST', { expectedRevision: 3, requestId: randomUUID(), action: 'pause' });
  expect(stale.status).toBe(409); expect(stale.code).toBe('REVISION_CONFLICT');
  await expect(viewer.locator('.viewer-candidate')).toContainText('A newer visual takes priority.');
  await expect(viewer.locator('.viewer-candidate .countdown-content')).toHaveCount(0);
});
