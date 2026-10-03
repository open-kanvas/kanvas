// UI-only visual/interaction checks. Real server authorization is tested separately.
// Run with a Vite dev server: npx tsx tests/client/browser-check.mjs
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { samples } from '../../src/client/samples.ts';

const origin = process.env.KANVAS_VISUAL_BASE_URL || 'http://127.0.0.1:5173';
const output = '/tmp/kanvas-client-visual';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.KANVAS_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const failures = [];
page.on('pageerror', error => failures.push(error.message));
const session = { id: 'visual-session', name: 'Design conversation', ownerId: 'visual-user', role: 'owner', configRevision: 1, createdAt: '2026-09-08T09:00:00Z', updatedAt: '2026-09-08T09:00:00Z', config: { theme: 'dark', accent: '#b9ed87' } };
const displays = [
  { id: 'visual-display', name: 'Main display', view: samples.number, width: 1440, height: 900, online: true },
  { id: 'second-display', name: 'A different angle', view: samples.chart, width: 1920, height: 1080, online: true },
  { id: 'third-display', name: 'The work in progress', view: samples.code, width: 1024, height: 768, online: false },
].map(item => ({ ...item, sessionId: session.id, revision: 1, viewportRevision: 1, pixelRatio: 1, held: false, updatedAt: '2026-09-08T09:00:00Z' }));
const detail = { session, displays, members: [{ userId: 'visual-user', username: 'designer', displayName: 'Alex', role: 'owner' }], updates: [], interactions: [], datasets: [], assets: [] };
await page.addInitScript(() => {
  const sources = [];
  class LocalEventSource extends EventTarget {
    constructor() { super(); sources.push(this); setTimeout(() => { this.onopen?.(new Event('open')); }, 40); }
    close() { this.closed = true; }
  }
  window.EventSource = LocalEventSource;
  window.__visualChange = data => sources.filter(source => !source.closed).forEach(source => source.dispatchEvent(new MessageEvent('change', { data: JSON.stringify(data) })));
});
await page.route('**/api/**', async route => {
  const request = route.request(), url = new URL(request.url());
  const path = url.pathname, body = request.method() !== 'GET' && request.postData() ? request.postDataJSON() : {};
  let value;
  if (path === '/api/auth/me') value = { user: { id: 'visual-user', username: 'designer', displayName: 'Alex' }, csrfToken: '' };
  else if (path === '/api/sessions') value = [session];
  else if (path === `/api/sessions/${session.id}`) value = detail;
  else if (path.endsWith('/presentations') || path.endsWith('/pairings') || path === '/api/tokens') value = [];
  else if (path.endsWith('/view') && request.method() === 'PATCH') {
    assert.equal(body.expectedRevision, displays[0].revision);
    displays[0].view = { ...displays[0].view, data: body.data }; displays[0].revision += 1; value = displays[0];
  } else if (path.endsWith('/applied')) { displays[0].appliedRevision = body.revision; value = { ok: true }; }
  else if (path.endsWith('/interactions')) { detail.interactions.push({ id: 'interaction', ...body, sessionId: session.id, userId: 'visual-user', createdAt: '2026-09-08T09:00:00Z', status: 'pending' }); value = detail.interactions.at(-1); }
  else if (path.endsWith('/config')) { session.config = body.config; session.configRevision += 1; value = session; }
  else if (path.includes('/displays/') && request.method() === 'PATCH') { Object.assign(displays[0], body); value = displays[0]; }
  else value = {};
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: value }) });
});

try {
  await page.goto(origin);
  await page.getByRole('heading', { name: 'Design conversation' }).waitFor();
  await page.locator('.display-card').first().waitFor();
  await page.locator('.display-card .code-content').waitFor();
  await page.screenshot({ path: `${output}/workspace-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/workspace-phone.png`, fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'workspace must not overflow horizontally');
  const checked = [];
  for (const [template, sample] of Object.entries(samples)) {
    displays[0].view = structuredClone(sample); displays[0].revision += 1; displays[0].appliedRevision = 0;
    await page.goto(`${origin}/view/${session.id}/${displays[0].id}`);
    await page.locator(`.template-${template}`).first().waitFor();
    if (template === 'code') await page.locator('.code-content').waitFor();
    if (template === 'map') await page.locator('.leaflet-container').waitFor();
    if (template === 'chart') await page.locator('.chart-portrait').waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${template} must not overflow the phone viewport`);
    assert.equal(await page.locator('.workspace-sidebar').count(), 0, 'viewer must not include workspace navigation');
    if (['number', 'chart', 'code', 'whiteboard', 'map', 'document'].includes(template)) await page.screenshot({ path: `${output}/${template}-phone.png` });
    if (template === 'checklist') {
      await page.getByRole('checkbox', { name: 'Invite the right people' }).click();
      await page.getByRole('checkbox', { name: 'Invite the right people' }).filter({ hasNot: page.locator('.spinner') }).waitFor();
      assert.equal(displays[0].view.data.items.find(item => item.id === 'invite').checked, true);
    }
    if (template === 'presentation') {
      await page.getByRole('button', { name: 'Next slide', exact: true }).click();
      await page.locator('.presentation-slide .number-content').waitFor();
      assert.equal(displays[0].view.data.index, 1);
    }
    if (template === 'whiteboard') {
      const before = displays[0].view.data.elements.length;
      await page.getByRole('button', { name: 'Draw (P)', exact: true }).click();
      const bounds = await page.locator('.board-surface').boundingBox();
      await page.mouse.move(bounds.x + bounds.width * .2, bounds.y + bounds.height * .35);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width * .4, bounds.y + bounds.height * .4, { steps: 8 });
      await page.mouse.up();
      await page.getByText('Changes saved', { exact: true }).waitFor();
      assert.equal(displays[0].view.data.elements.length, before + 1, 'drawing must save shared geometry');
    }
    checked.push(template);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  displays[0].view = samples.number; displays[0].revision += 1;
  await page.goto(`${origin}/view/${session.id}/${displays[0].id}`);
  await page.locator('.number-content').waitFor();
  await page.screenshot({ path: `${output}/number-desktop.png` });
  session.config.theme = 'light';
  await page.reload();
  await page.locator('.theme-light .number-content').waitFor();
  await page.screenshot({ path: `${output}/number-light.png` });
  session.config.theme = 'dark';
  displays[0].view = { ...samples.fact, actions: [{ id: 'respond', label: 'I see it', kind: 'button' }] }; displays[0].revision += 1;
  await page.goto(`${origin}/view/${session.id}/${displays[0].id}`);
  await page.getByRole('button', { name: 'I see it', exact: true }).click();
  await page.getByText('Sent · awaiting acknowledgement', { exact: true }).waitFor();
  detail.interactions[0].status = 'acknowledged';
  await page.evaluate(sessionId => window.__visualChange({ type: 'interaction', sessionId }), session.id);
  await page.getByText('Acknowledged', { exact: true }).waitFor();
  assert.deepEqual(failures, [], 'browser runtime errors');
  process.stdout.write(`UI fixture browser checks passed: ${checked.join(', ')}. Screenshots: ${output}\n`);
} finally { await browser.close(); }
