import { testDatabase } from '../postgres.js';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../../src/server/app.js';
import type { MonitoringSummary } from '../../src/shared/monitoring.js';
import { createDisplay, createSession, expect, isolatedContext, openViewer, publishPrepared, register, sessionApi, test, waitForDisplay } from './support.js';

test('source updates retain the last good frame on failure and can be stopped from the display', async ({ browser, diagnostics }, testInfo) => {
  const directory = await mkdtemp(join(tmpdir(), 'kanvas-monitor-browser-'));
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected isolated TCP listener');
  const baseURL = `http://127.0.0.1:${address.port}`;
  let time = Date.now(), fail = false, fetches = 0;
  const runtime = await createApp({
    database: testDatabase(), publicUrl: baseURL, staticDirectory: resolve('dist/client'),
    interpreter: { interpret: async () => { throw new Error('Source monitoring must not reinterpret supplied results'); } },
    monitoringOptions: {
      automatic: false, now: () => time,
      fetcher: async () => {
        fetches++;
        if (fail) throw new Error('Controlled source outage');
        return { statusCode: 200, latencyMs: 7, mimeType: 'application/json', finalUrl: 'https://example.com/state', body: Buffer.from('{"text":"Exact monitored content"}') };
      },
    },
  });
  server.on('request', runtime.app);
  const context = await isolatedContext(browser, testInfo, baseURL);
  context.on('page', page => diagnostics.watch(page));
  try {
    const page = await context.newPage();
    await register(page);
    const sessionId = await createSession(page, 'Source lifecycle acceptance');
    const display = await createDisplay(page, sessionId, 'Source display');
    await publishPrepared(page, sessionId, [display.id], { version: 1, template: 'fact', data: { text: 'Previously supplied content' } });
    const initial = await waitForDisplay(page, sessionId, display.id, d => d.view?.data.text === 'Previously supplied content');
    const viewer = await openViewer(page, sessionId, display.id);
    await expect(viewer.getByText('Previously supplied content', { exact: true })).toBeVisible();
    const started = await sessionApi<MonitoringSummary>(page, `/api/sessions/${sessionId}/monitoring`, 'POST', {
      requestId: randomUUID(), displayId: display.id, expectedRevision: initial.revision,
      config: { mode: 'json', url: 'https://example.com/state', template: 'fact', mapping: { text: { $path: '/text' } }, intervalSeconds: 30, durationSeconds: 3600 },
    });
    expect(started.status).toBe(200);
    await expect(viewer.locator('.viewer-source-status')).toContainText('Waiting');
    await expect(viewer.getByText('Previously supplied content', { exact: true })).toBeVisible();
    await runtime.service.monitoring.runDue();
    await expect(viewer.getByText('Exact monitored content', { exact: true })).toBeVisible();
    await waitForDisplay(page, sessionId, display.id, d => d.appliedRevision === d.revision && d.monitoring?.status === 'healthy');
    await expect(viewer.locator('.viewer-source-status')).toHaveCount(0);

    fail = true; time += 31_000;
    await runtime.service.monitoring.runDue();
    await expect(viewer.locator('.viewer-source-status')).toContainText('last valid');
    await expect(viewer.getByText('Exact monitored content', { exact: true })).toBeVisible();
    await expect(viewer.locator('.viewer-source-status time')).toContainText('Last success');
    await viewer.getByLabel('Display controls', { exact: true }).click();
    await viewer.getByRole('button', { name: 'Stop source updates', exact: true }).click();
    await expect(viewer.locator('.viewer-monitoring')).toContainText('stopped');
    await expect(viewer.getByRole('button', { name: 'Stop source updates', exact: true })).toHaveCount(0);
    time += 60_000; await runtime.service.monitoring.runDue();
    expect(fetches).toBe(2);
    expect((await runtime.store.list('update', sessionId))).toHaveLength(1);
    await expect(viewer.getByText('Exact monitored content', { exact: true })).toBeVisible();
  } finally {
    await context.close();
    await runtime.close();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
