import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { AssetRecord, DisplayRecord, VideoControlCommand, ViewSpec } from '../../src/shared/types';
import type { VideoCommandRecord } from '../../src/server/video-controls';
import { createDisplay, createSession, expect, openViewer, publishPrepared, register, sessionApi, sessionDetail, tab, test, waitForDisplay } from './support';

async function workspace(page: Page, name: string) {
  await register(page);
  const sessionId = await createSession(page, name), display = await createDisplay(page, sessionId, 'Template display');
  await tab(page, 'Library');
  return { sessionId, display, base: `/api/sessions/${sessionId}/displays/${display.id}` };
}
async function publish(page: Page, viewer: Page, sessionId: string, displayId: string, template: ViewSpec['template'], data: ViewSpec['data'], options: Partial<ViewSpec> = {}) {
  const update = await publishPrepared(page, sessionId, [displayId], { version: 1, template, data, ...options });
  let display: DisplayRecord | undefined;
  await expect.poll(async () => {
    const detail = await sessionDetail(page, sessionId), revision = detail.updates.find(item => item.id === update.id)?.revisions[displayId];
    display = detail.displays.find(item => item.id === displayId);
    return revision !== undefined && display?.revision === revision && display.appliedRevision === revision;
  }, { message: 'The accepted update reaches actual displayed readiness' }).toBe(true);
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision', String(display!.revision));
  return display!;
}
async function edit(page: Page, viewer: Page, sessionId: string, displayId: string, change: Record<string, unknown>) {
  const display = (await sessionDetail(page, sessionId)).displays.find(item => item.id === displayId)!;
  const result = await sessionApi<DisplayRecord>(page, `/api/sessions/${sessionId}/displays/${displayId}/view`, 'PATCH', { expectedRevision: display.revision, data: { ...display.view!.data, ...change } });
  expect(result.status).toBe(200);
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision', String(result.data!.revision));
  await expect(viewer.locator('.viewer-candidate')).toBeVisible();
  return result.data!;
}

test('filled whiteboard labels, literal code and honest source cards reach actual displayed readiness', async ({ page }, testInfo) => {
  const { sessionId, display } = await workspace(page, 'Visual feedback regressions');
  const viewer = await openViewer(page, sessionId, display.id);
  await publish(page, viewer, sessionId, display.id, 'whiteboard', { elements: ['First idea', 'Second idea', 'Third idea'].map((text, index) => ({ id: `note-${index}`, type: 'rect', x: index * 230 + 100, y: 150, width: 200, height: 140, color: '#ffff00', fill: '#ffff00', text })) });
  for (const text of ['First idea', 'Second idea', 'Third idea']) {
    const label = viewer.locator('.viewer-candidate .board-shape-text').filter({ hasText: text });
    await expect(label).toBeVisible(); await expect(label).toHaveAttribute('fill', '#000000');
    const box = await label.boundingBox(); expect(box?.width).toBeGreaterThan(10); expect(box?.height).toBeGreaterThan(1);
  }
  await viewer.screenshot({ path: testInfo.outputPath('filled-shape-labels.png') });
  const exact = 'const greeting = "<not markup>";\nconsole.log(greeting);';
  const code = await publish(page, viewer, sessionId, display.id, 'code', { kind: 'code', path: 'example.ts', language: 'typescript', code: exact });
  await expect(viewer.locator('.viewer-candidate .code-content')).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Highlight line 2' })).toHaveCount(0);
  await expect(viewer.getByLabel('Line 2', { exact: true })).toHaveText('2');
  expect(await viewer.locator('.viewer-candidate .code-line>span:last-child').allTextContents()).toEqual(exact.split('\n'));
  await publishPrepared(page, sessionId, [display.id], { ...code.view!, showControls: true });
  await waitForDisplay(page, sessionId, display.id, item => item.revision > code.revision && item.appliedRevision === item.revision);
  await viewer.getByRole('button', { name: 'Highlight line 2', exact: true }).click();
  await expect(viewer.getByRole('button', { name: 'Highlight line 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await viewer.locator('.viewer-candidate .code-line>span:last-child').allTextContents()).toEqual(exact.split('\n'));
  const sourceText = 'This text did not come from a KANVAS fetch.';
  await publish(page, viewer, sessionId, display.id, 'document', { text: sourceText, quote: false }, {
    title: 'Supplied description', showTitle: true, showSource: true,
    source: { title: 'Supplied summary · not a fetched excerpt', url: 'https://example.com/article' },
  });
  await expect(viewer.locator('.viewer-candidate .view-heading')).toContainText('Supplied description');
  await expect(viewer.locator('.viewer-candidate .document-content')).toContainText(sourceText);
  await viewer.locator('.viewer-candidate').getByLabel('About this view', { exact: true }).click();
  await expect(viewer.locator('.viewer-candidate').getByRole('link', { name: 'Supplied summary · not a fetched excerpt' })).toHaveAttribute('href', 'https://example.com/article');
});

test('transcription and translation preserve source text, speaker labels and timestamp lexemes', async ({ page }, testInfo) => {
  const { sessionId, display } = await workspace(page, 'Exact spoken-text displays'), viewer = await openViewer(page, sessionId, display.id);
  const original = 'Keep  both spaces.\nBehold: <literal text> & “quotation”.';
  await publish(page, viewer, sessionId, display.id, 'transcription', { status: 'live', language: 'en', segments: [{ id: 'line-01', timestamp: '00:01:02.000001', speaker: 'Speaker 01', text: original }] });
  expect(await viewer.locator('.transcript-segments p').textContent()).toBe(original);
  await expect(viewer.locator('.transcript-timestamp')).toHaveText('00:01:02.000001');
  await expect(viewer.locator('.transcript-meta strong')).toHaveText('Speaker 01');
  const target = 'Behold  begge mellomrom.\nSe: <bokstavelig tekst> & «sitat».';
  await publish(page, viewer, sessionId, display.id, 'translation', { sourceText: original, targetText: target, sourceLanguage: 'en', targetLanguage: 'nb' });
  expect(await viewer.locator('.translation-source p').textContent()).toBe(original);
  expect(await viewer.locator('.translation-target p').textContent()).toBe(target);
  await expect(viewer.locator('.translation-source')).toHaveAttribute('lang', 'en');
  await expect(viewer.locator('.translation-target')).toHaveAttribute('lang', 'nb');
  expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await viewer.screenshot({ path: testInfo.outputPath('source-and-translation.png') });
});

test('checklist clicks persist intrinsic events and forms submit real typed field responses', async ({ page }, testInfo) => {
  const { sessionId, display } = await workspace(page, 'Intrinsic audience responses'), viewer = await openViewer(page, sessionId, display.id);
  await publish(page, viewer, sessionId, display.id, 'checklist', { items: [{ id: 'a', text: 'First task', checked: false }, { id: 'b', text: 'Second task', checked: false }] });
  await viewer.getByRole('checkbox', { name: 'First task', exact: true }).click();
  await expect(viewer.getByRole('checkbox', { name: 'First task', exact: true })).toHaveAttribute('aria-checked', 'true');
  let detail = await sessionDetail(page, sessionId);
  expect(detail.interactions.find(item => item.actionId === 'checklist.toggle')?.value).toEqual({ itemId: 'a', checked: true });
  expect((detail.displays.find(item => item.id === display.id)!.view!.data.items as Array<{ id: string; checked: boolean }>)[0].checked).toBe(true);
  await publish(page, viewer, sessionId, display.id, 'form', { fields: [
    { id: 'name', type: 'text', label: 'Your response name', required: true, maxLength: 100 },
    { id: 'choice', type: 'choice', label: 'Format', required: true, options: [{ id: 'a', label: 'Discussion' }, { id: 'b', label: 'Workshop' }] },
    { id: 'rating', type: 'range', label: 'Rating', min: 1, max: 5, step: 1 },
    { id: 'topics', type: 'multi-choice', label: 'Topics', required: true, maxChoices: 2, options: [{ id: 'exact', label: 'Exact data' }, { id: 'visual', label: 'Visual clarity' }, { id: 'speed', label: 'Speed' }] },
    { id: 'ready', type: 'checkbox', label: 'Ready for the next step' },
  ] });
  await expect(viewer.getByRole('button', { name: 'Submit response', exact: true })).toBeDisabled();
  await viewer.getByLabel('Your response name', { exact: false }).fill('  Untrimmed source  ');
  await viewer.getByLabel('Format', { exact: false }).selectOption('b');
  await viewer.getByLabel('Rating', { exact: true }).focus();
  await viewer.getByLabel('Rating', { exact: true }).press('End');
  await viewer.getByLabel('Rating', { exact: true }).press('ArrowLeft');
  await viewer.getByLabel('Exact data', { exact: true }).check();
  await viewer.getByLabel('Visual clarity', { exact: true }).check();
  await expect(viewer.getByLabel('Speed', { exact: true })).toBeDisabled();
  await viewer.getByLabel('Ready for the next step', { exact: true }).check();
  await viewer.screenshot({ path: testInfo.outputPath('typed-form-fields.png') });
  await viewer.getByRole('button', { name: 'Submit response', exact: true }).click();
  await expect(viewer.getByText('Response sent', { exact: true })).toBeVisible();
  detail = await sessionDetail(page, sessionId);
  expect(detail.interactions.find(item => item.actionId === 'form.submit')?.value).toEqual({ name: '  Untrimmed source  ', choice: 'b', rating: 4, topics: ['exact', 'visual'], ready: true });
  await viewer.reload();
  await expect(viewer.getByText('Response sent', { exact: true })).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Submit response', exact: true })).toBeDisabled();
  expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('poll votes remain private until reveal, replace a prior vote, and Q&A uses server submissions', async ({ page, diagnostics }, testInfo) => {
  const { sessionId, display } = await workspace(page, 'Presenter-controlled reveal'), viewer = await openViewer(page, sessionId, display.id);
  // A reveal edit may supersede a painted revision before its ACK arrives.
  diagnostics.allowHttp(viewer, `/api/sessions/${sessionId}/displays/${display.id}/applied`, 409);
  await publish(page, viewer, sessionId, display.id, 'poll', { question: 'Choose a focus', options: [{ id: 'a', label: 'Clarity' }, { id: 'b', label: 'Depth' }], revealResults: false });
  await viewer.getByRole('radio', { name: 'Clarity', exact: true }).check();
  await viewer.getByRole('button', { name: 'Vote', exact: true }).click();
  await expect(viewer.getByText('Vote saved', { exact: true })).toBeVisible();
  let stored = (await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)!;
  expect(stored.responseState?.poll).toEqual({ revealed: false, selectedOptionIds: ['a'] });
  await expect(viewer.locator('.poll-count')).toHaveCount(0);
  await expect(viewer.locator('.poll-results-status')).toContainText('Results are hidden');
  await edit(page, viewer, sessionId, display.id, { revealResults: true });
  await expect(viewer.locator('.poll-results-status')).toContainText('1 participant has voted');
  await expect(viewer.locator('.poll-option').filter({ hasText: 'Clarity' }).locator('.poll-count')).toHaveText('1 vote');
  await viewer.getByRole('radio', { name: /Depth/ }).check();
  await viewer.getByRole('button', { name: 'Update vote', exact: true }).click();
  await expect(viewer.locator('.poll-option').filter({ hasText: 'Depth' }).locator('.poll-count')).toHaveText('1 vote');
  stored = (await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)!;
  expect(stored.responseState?.poll).toMatchObject({ totalVotes: 1, counts: { a: 0, b: 1 } });
  await edit(page, viewer, sessionId, display.id, { revealResults: false });
  await expect(viewer.locator('.poll-count')).toHaveCount(0);
  stored = (await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)!;
  expect(stored.responseState?.poll).not.toHaveProperty('counts');
  expect(stored.responseState?.poll).not.toHaveProperty('totalVotes');
  await publish(page, viewer, sessionId, display.id, 'qa', { prompt: 'What should we discuss?', revealResults: false });
  const question = '<b>Is the source exact?</b>';
  await viewer.getByLabel('Your question', { exact: true }).fill(question);
  await viewer.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(viewer.getByText('Response sent', { exact: true })).toBeVisible();
  expect((await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)!.responseState?.qa).not.toHaveProperty('entries');
  await expect(viewer.locator('.qa-entries')).toHaveCount(0);
  await edit(page, viewer, sessionId, display.id, { revealResults: true });
  await expect(viewer.locator('.qa-entries p')).toHaveText(question);
  await expect(viewer.locator('.qa-entries b')).toHaveCount(0);
  await publish(page, viewer, sessionId, display.id, 'qa', { prompt: 'Describe the experience', mode: 'word-cloud', revealResults: true });
  await viewer.getByLabel('Your word or phrase', { exact: true }).fill('Clarity clarity trust');
  await viewer.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(viewer.locator('.word-cloud li').filter({ hasText: 'clarity' }).locator('small')).toHaveText('2');
  await expect(viewer.locator('.word-cloud li').filter({ hasText: 'trust' }).locator('small')).toHaveText('1');
  await viewer.screenshot({ path: testInfo.outputPath('word-cloud.png') });
});

test('prepared deck cues keep native navigation and intrinsic controls on the active slide', async ({ page }) => {
  const { sessionId, display } = await workspace(page, 'Prepared presentation controls');
  const slides: ViewSpec[] = [
    { version: 1, template: 'fact', data: { text: 'First prepared slide' } },
    { version: 1, template: 'checklist', data: { items: [{ id: 'ready', text: 'The audience is ready', checked: false }] } },
    { version: 1, template: 'whiteboard', data: { elements: [{ id: 'note', type: 'rect', x: 200, y: 150, width: 250, height: 150, text: 'Final idea', fill: '#ffff00', color: '#ffff00' }] } },
  ];
  const created = await sessionApi<{ id: string }>(page, `/api/sessions/${sessionId}/presentations`, 'POST', { name: 'Prepared navigation', slides });
  expect(created.status).toBeGreaterThanOrEqual(200); expect(created.status).toBeLessThan(300);
  const cued = await sessionApi(page, `/api/sessions/${sessionId}/presentations/${created.data!.id}/cue`, 'POST', { index: 0, displayIds: [display.id], requestId: randomUUID() });
  expect(cued.status).toBeLessThan(300);
  const prepared = await waitForDisplay(page, sessionId, display.id, item => item.view?.template === 'presentation');
  await publishPrepared(page, sessionId, [display.id], {...prepared.view!, showControls: true});
  const viewer = await openViewer(page, sessionId, display.id);
  await expect(viewer.getByText('First prepared slide', { exact: true })).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Previous slide', exact: true })).toBeDisabled();
  await viewer.getByRole('button', { name: 'Next slide', exact: true }).click();
  await viewer.getByRole('checkbox', { name: 'The audience is ready', exact: true }).click();
  await expect(viewer.getByRole('checkbox', { name: 'The audience is ready', exact: true })).toHaveAttribute('aria-checked', 'true');
  await viewer.getByRole('button', { name: 'Next slide', exact: true }).click();
  await expect(viewer.locator('.viewer-candidate .board-shape-text')).toHaveText('Final idea');
  await waitForDisplay(page, sessionId, display.id, item => item.appliedRevision === item.revision && item.view?.data.index === 2);
  await expect(viewer.getByRole('button', { name: 'Next slide', exact: true })).toBeDisabled();
  await viewer.getByRole('button', { name: 'Previous slide', exact: true }).click();
  await expect(viewer.getByRole('checkbox', { name: 'The audience is ready', exact: true })).toHaveAttribute('aria-checked', 'true');
  const detail = await sessionDetail(page, sessionId);
  expect(detail.interactions.filter(item => item.actionId === 'presentation.navigate')).toHaveLength(3);
  expect(detail.interactions.find(item => item.actionId === 'checklist.toggle')?.value).toEqual({ itemId: 'ready', checked: true });
});

test('schedule dates use the supplied zone and countdown ignores the receiving device wall clock', async ({ page }, testInfo) => {
  const { sessionId, display } = await workspace(page, 'Time-aware templates'), viewer = await openViewer(page, sessionId, display.id);
  await publish(page, viewer, sessionId, display.id, 'schedule', { date: '2026-10-25', view: 'week', timeZone: 'Europe/Oslo', events: [{ id: 'overnight', title: 'Crossing the clock change', start: '2026-10-24T23:30:00+02:00', end: '2026-10-25T02:30:00+01:00', location: 'Studio' }] }, { title: 'Clock change week', showTitle: true });
  await expect(viewer.locator('.schedule-day')).toHaveCount(7);
  await expect(viewer.locator('.schedule-day[aria-label="2026-10-24"]')).toContainText('Crossing the clock change');
  await expect(viewer.locator('.schedule-day[aria-label="2026-10-25"]')).toContainText('Crossing the clock change');
  await expect(viewer.locator('.schedule-heading')).toContainText('Europe/Oslo');
  expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await viewer.screenshot({ path: testInfo.outputPath('week-schedule.png') });
  await viewer.clock.setFixedTime(new Date('2001-01-01T00:00:00Z'));
  await publish(page, viewer, sessionId, display.id, 'countdown', { endsAt: new Date(Date.now() + 90_000).toISOString(), label: 'Server time exercise' });
  const remaining = async () => Number(/^(\d+) seconds/.exec(await viewer.getByRole('timer').getAttribute('aria-label') ?? '')?.[1] ?? -1);
  const initial = await remaining(); expect(initial).toBeGreaterThan(70); expect(initial).toBeLessThanOrEqual(90);
  await viewer.clock.setFixedTime(new Date('2099-01-01T00:00:00Z'));
  await expect.poll(remaining).toBeLessThan(initial);
  expect(await remaining()).toBeGreaterThan(65);
  await edit(page, viewer, sessionId, display.id, { pausedRemainingSeconds: 42 });
  await expect(viewer.getByRole('timer')).toHaveText('00:00:42');
  await expect(viewer.getByText('Paused', { exact: true })).toBeVisible();
});

test('video commands acknowledge actual media state, persist blocked-click fallback and keep previews silent', async ({ page }) => {
  test.setTimeout(120_000);
  const { sessionId, display, base } = await workspace(page, 'Real runtime video controls'), viewer = await openViewer(page, sessionId, display.id);
  const bytes = await readFile(new URL('../rendering/fixtures/sample.mp4', import.meta.url));
  const asset = await sessionApi<AssetRecord>(page, `/api/sessions/${sessionId}/assets`, 'POST', { name: 'runtime-controls.mp4', mimeType: 'video/mp4', base64: bytes.toString('base64') });
  expect(asset.status).toBeGreaterThanOrEqual(200); expect(asset.status).toBeLessThan(300);
  const url = asset.data!.url, rangeResponses: number[] = [];
  expect(url).toMatch(/^\/api\/assets\//);
  viewer.on('response', response => { if (new URL(response.url()).pathname === url) rangeResponses.push(response.status()); });
  const unseekableUrl = 'https://example.com/kanvas-video-controls/no-ranges.mp4';
  await viewer.route(unseekableUrl, route => route.fulfill({ status: 200, contentType: 'video/mp4', body: bytes }));
  let current = await publish(page, viewer, sessionId, display.id, 'video', { url: unseekableUrl });
  const video = viewer.locator('.viewer-candidate video');
  expect(await video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(true);
  const ackIds: string[] = [];
  viewer.on('request', request => { const match = /\/video-commands\/([^/]+)\/result$/.exec(new URL(request.url()).pathname); if (match && request.method() === 'POST') ackIds.push(match[1]); });
  async function command(input: Pick<VideoControlCommand, 'action' | 'time' | 'value' | 'fullscreen'>, expected: 'applied' | 'blocked' | 'failed' = 'applied') {
    const created = await sessionApi<VideoCommandRecord>(page, `${base}/video-control`, 'POST', { requestId: randomUUID(), expectedRevision: current.revision, command: input });
    expect(created.status).toBeLessThan(300); expect(created.data?.id).toBeTruthy();
    let result: VideoCommandRecord | undefined;
    await expect.poll(async () => { result = (await sessionApi<VideoCommandRecord>(page, `${base}/video-status?commandId=${created.data!.id}`)).data; return result?.status; }).toBe(expected);
    return result!;
  }
  const unavailableSeek = await command({ action: 'seek', time: .04 }, 'failed');
  expect(unavailableSeek.result?.currentTime).toBe(0);
  await expect(viewer.locator('.viewer-candidate .video-control-feedback')).toContainText('not made that playback time seekable');
  current = await publish(page, viewer, sessionId, display.id, 'video', { url, loop: true, muted: false });
  expect(await video.evaluate(element => (element as HTMLVideoElement).seekable.end(0))).toBeGreaterThan(.08);
  expect(rangeResponses).toContain(206);
  expect((await command({ action: 'mute' })).result?.muted).toBe(true);
  expect((await command({ action: 'play' })).result?.paused).toBe(false);
  expect((await command({ action: 'pause' })).result?.paused).toBe(true);
  expect((await command({ action: 'seek', time: .04 })).result?.currentTime).toBeCloseTo(.04, 2);
  expect((await command({ action: 'volume', value: .3 })).result?.volume).toBeCloseTo(.3, 2);
  expect((await command({ action: 'rate', value: 2 })).result?.playbackRate).toBe(2);
  expect((await command({ action: 'skip', value: .04 })).result?.currentTime).toBeCloseTo(.08, 2);
  await video.evaluate(element => { (element as HTMLVideoElement).play = () => Promise.reject(new DOMException('Synthetic autoplay policy denial', 'NotAllowedError')); });
  const blocked = await command({ action: 'play' }, 'blocked');
  await expect(viewer.getByRole('button', { name: 'Play video', exact: true })).toBeVisible();
  expect(ackIds.filter(id => id === blocked.id)).toHaveLength(1);
  await viewer.reload();
  await expect(viewer.getByRole('button', { name: 'Play video', exact: true })).toBeVisible();
  expect(await viewer.locator('.viewer-candidate video').evaluate(element => (element as HTMLVideoElement).paused)).toBe(true);
  expect(ackIds.filter(id => id === blocked.id)).toHaveLength(1);
  await viewer.getByRole('button', { name: 'Play video', exact: true }).click();
  await expect.poll(async () => (await sessionApi<VideoCommandRecord>(page, `${base}/video-status?commandId=${blocked.id}`)).data?.status).toBe('applied');
  expect(ackIds.filter(id => id === blocked.id)).toHaveLength(2);
  await command({ action: 'pause' });
  await command({ action: 'unmute' });
  const canFullscreen = await viewer.evaluate(() => document.fullscreenEnabled);
  if (canFullscreen) {
    await viewer.locator('.viewer-candidate .video-frame').evaluate(element => { (element as HTMLElement).requestFullscreen = () => Promise.reject(new DOMException('Synthetic fullscreen policy denial', 'NotAllowedError')); });
    const fullscreen = await command({ action: 'fullscreen' }, 'blocked');
    await expect(viewer.getByRole('button', { name: 'Enter fullscreen', exact: true })).toBeVisible();
    await viewer.locator('.viewer-candidate .video-frame').evaluate(element => { delete (element as Partial<HTMLElement>).requestFullscreen; });
    await viewer.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
    await expect.poll(async () => (await sessionApi<VideoCommandRecord>(page, `${base}/video-status?commandId=${fullscreen.id}`)).data?.status).toBe('applied');
    expect(await viewer.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await command({ action: 'fullscreen', fullscreen: false });
    await viewer.getByRole('button', { name: 'Display controls', exact: true }).click();
    await viewer.locator('.viewer-menu').getByRole('button', { name: 'Enter fullscreen', exact: false }).click();
    await expect.poll(() => viewer.evaluate(() => document.fullscreenElement?.classList.contains('viewer-shell') ?? false)).toBe(true);
    expect((await command({ action: 'pause' })).result?.fullscreen).toBe(true);
    expect((await command({ action: 'fullscreen', fullscreen: false })).result?.fullscreen).toBe(false);
    expect(await viewer.evaluate(() => document.fullscreenElement)).toBeNull();
  } else await command({ action: 'fullscreen' }, 'failed');
  // A duplicate last-good video must never start playback behind a pending replacement.
  const pendingUrl = 'https://example.com/kanvas-video-controls/pending.png';
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await viewer.route(pendingUrl, async route => { await pending; await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') }); });
  try {
    await publishPrepared(page, sessionId, [display.id], { version: 1, template: 'image', data: { images: [{ url: pendingUrl, alt: 'Pending replacement' }] } });
    await expect(viewer.locator('.viewer-last-good video')).toBeVisible();
    expect(await viewer.locator('.viewer-last-good video').evaluate(element => ({ paused: (element as HTMLVideoElement).paused, muted: (element as HTMLVideoElement).muted, controls: (element as HTMLVideoElement).controls }))).toEqual({ paused: true, muted: true, controls: false });
  } finally { release(); }
});
