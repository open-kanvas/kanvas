import { operationRequest } from '../mcp/requests.js';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { Page } from '@playwright/test';
import type { AssetRecord, DisplayRecord, SessionRecord, UpdateRecord, ViewSpec } from '../../src/shared/types';
import type { VideoCommandRecord } from '../../src/server/video-controls';
import { createDisplay, createSession, expect, openViewer, publishPrepared, register, sessionApi, sessionDetail, test, waitForDisplay } from './support';

const fact = (text: string): ViewSpec => ({ version: 1, template: 'fact', data: { text } });
interface Receipt extends UpdateRecord { updateId: string; targetRef: string; targets: { viewerUrl: string; shortUrl: string }[] }
async function connection(page: Page, baseURL: string) {
  const issued = await sessionApi<{ token: string }>(page, '/api/tokens', 'POST', { name: 'Disposable publish-first acceptance', scopes: ['read', 'publish'] });
  expect(issued.status).toBe(201);
  const client = new Client({ name: 'publish-first-browser', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseURL), { requestInit: { headers: { Authorization: `Bearer ${issued.data!.token}` } } }));
  return { client, async call<T>(name: string, operation: string, args: Record<string, unknown> = {}): Promise<T> {
    const response = await client.callTool(operationRequest({ name, arguments: { operation, ...args } }));
    expect(response.isError, `${name}/${operation}`).not.toBe(true);
    return (response.structuredContent as { data: T }).data;
  } };
}

test('one first publication opens the returned screen, continues slides without a run, and renders explicitly supplied translation', async ({ page, baseURL }, info) => {
  await register(page);
  const { client, call } = await connection(page, baseURL!);
  try {
    const homes=await call<{id:string;name:string}[]>('kanvas_inspect','sessions.list');expect(homes).toHaveLength(1);expect(homes[0].name).toBe('Home');
    const input = { requestId: 'first-publication', view: { version: 1, template: 'presentation', showControls: true, data: { slides: [fact('First exact slide.'), fact('Second exact slide.'), fact('Third exact slide.')], index: 0 } } };
    const [first, retry] = await Promise.all([call<Receipt>('kanvas_publish', 'show', input), call<Receipt>('kanvas_publish', 'show', input)]);
    expect(first.id).toBe(retry.id); expect(first.targetRef).toBe(retry.targetRef);
    expect(await call('kanvas_inspect', 'sessions.list')).toHaveLength(2);expect(first.sessionId).not.toBe(homes[0].id);
    expect(first.targets[0].viewerUrl).toBe(`${baseURL}/view/${first.sessionId}/${first.displayIds[0]}`);
    const viewer = await page.context().newPage(); await viewer.goto(first.targets[0].shortUrl); await viewer.bringToFront();
    const sessionId = first.sessionId, displayId = first.displayIds[0];
    let current = await waitForDisplay(page, sessionId, displayId, d => d.revision > 0 && d.appliedRevision === d.revision);
    await expect(viewer.getByText('First exact slide.', { exact: true })).toBeVisible();
    const next = { sessionId, displayId, requestId: 'spoken-next-slide', expectedRevision: current.revision, action: 'next' };
    const moved = await call<UpdateRecord>('kanvas_control', 'presentation.navigate', next);
    expect((await call<UpdateRecord>('kanvas_control', 'presentation.navigate', next)).id).toBe(moved.id);
    await expect(viewer.getByText('Second exact slide.', { exact: true })).toBeVisible();
    await viewer.getByRole('button', { name: 'Next slide', exact: true }).click();
    current = await waitForDisplay(page, sessionId, displayId, d => d.view?.data.index === 2 && d.appliedRevision === d.revision);
    await expect(viewer.getByText('Third exact slide.', { exact: true })).toBeVisible();
    expect(current.view?.data.slides).toEqual(input.view.data.slides);

    const sourceText = 'So the quick brown fox jumped over the fence.', targetText = 'Den raske brune reven hoppet over gjerdet.';
    const configured = await call<SessionRecord>('kanvas_configure', 'session.update', { sessionId, expectedRevision: 0, config: { theme: 'light' } });
    await call('kanvas_publish', 'show', { targetRef: first.targetRef, requestId: 'supplied-translation', templateHint: 'translation', data: { sourceText, targetText, sourceLanguage: 'en', targetLanguage: 'nb' } });
    await waitForDisplay(page, sessionId, displayId, d => d.view?.template === 'translation' && d.appliedRevision === d.revision);
    await expect(viewer.getByText(sourceText, { exact: true })).toBeVisible(); await expect(viewer.getByText(targetText, { exact: true })).toBeVisible();
    await info.attach('translation-receiving-screen', { body: await viewer.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
    await call('kanvas_publish', 'show', { targetRef: first.targetRef, requestId: 'intentional-fact', view: fact(targetText) });
    await waitForDisplay(page, sessionId, displayId, d => d.view?.template === 'fact' && d.appliedRevision === d.revision);
    await call('kanvas_configure', 'session.update', { sessionId, expectedRevision: configured.configRevision, config: { theme: 'dark' } });
    const state = await call<{ session: SessionRecord }>('kanvas_inspect', 'session.state', { sessionId });
    expect(state.session.config).toMatchObject({ theme: 'dark' }); expect(state).not.toHaveProperty('publicationDefaults'); expect(state.session.config).not.toHaveProperty('mode');

    // An unbound host conversation cannot silently replace this existing screen.
    const choiceInput = { requestId: 'unbound-conversation', view: fact('Explicitly selected destination.') };
    const choice = await call<{ status: string; resolutionRef: string }>('kanvas_publish', 'show', choiceInput);
    expect(choice.status).toBe('needs_target'); await expect(viewer.getByText(targetText, { exact: true })).toBeVisible();
    await call('kanvas_publish', 'show', { ...choiceInput, resolution: { ref: choice.resolutionRef, sessionId, displayIds: [displayId] } });
    await expect(viewer.getByText('Explicitly selected destination.', { exact: true })).toBeVisible();
    await viewer.close();
  } finally { await client.close(); }
});

test('a rejected external video explains its failure, retains the last good view, and recovers to a decoded uploaded clip', async ({ page, baseURL, diagnostics }) => {
  await register(page); const sessionId = await createSession(page, 'Media recovery'), display = await createDisplay(page, sessionId, 'Receiving screen');
  const viewer = await openViewer(page, sessionId, display.id); await viewer.bringToFront();
  const { client, call } = await connection(page, baseURL!);
  try {
    await publishPrepared(page, sessionId, [display.id], fact('Keep this known good view.'));
    const good = await waitForDisplay(page, sessionId, display.id, d => d.revision > 0 && d.revision === d.appliedRevision);
    const url = 'https://example.com/kanvas-acceptance/not-a-video.mp4';
    await viewer.route(url, r => r.fulfill({ status: 200, contentType: 'video/mp4', body: 'Not playable media bytes.' }));
    const rejected = await publishPrepared(page, sessionId, [display.id], { version: 1, template: 'video', data: { url } });
    let update: UpdateRecord | undefined;
    await expect.poll(async () => { update = await call<UpdateRecord>('kanvas_inspect', 'update.status', { sessionId, updateId: rejected.id }); return update.delivery?.[display.id]?.code; }).toBe('MEDIA_UNSUPPORTED');
    expect(update!.delivery?.[display.id]?.status).toBe('failed');
    await expect(viewer.getByText('Keep this known good view.', { exact: true })).toBeVisible();
    await expect(viewer.locator('.media-readiness-error')).toContainText('browser rejected this video source');
    expect((await sessionDetail(page, sessionId)).displays.find(d => d.id === display.id)!.appliedRevision).toBe(good.revision);
    const bytes = await readFile(new URL('../rendering/fixtures/sample.mp4', import.meta.url));
    const uploaded = await sessionApi<AssetRecord>(page, `/api/sessions/${sessionId}/assets`, 'POST', { name: 'Actual recovery clip.mp4', mimeType: 'video/mp4', base64: bytes.toString('base64') });
    expect(uploaded.status).toBe(201);
    diagnostics.allowHttp(viewer, `/api/sessions/${sessionId}/displays/${display.id}/delivery`, 409);
    await publishPrepared(page, sessionId, [display.id], { version: 1, template: 'video', data: { url: uploaded.data!.url, muted: true } });
    await waitForDisplay(page, sessionId, display.id, d => d.view?.data.url === uploaded.data!.url && d.revision === d.appliedRevision);
    expect(await viewer.locator('.viewer-candidate video').evaluate(e => (e as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
    await expect(viewer.getByText('Keep this known good view.', { exact: true })).toHaveCount(0);
  } finally { await client.close(); await viewer.close(); }
});

/** Deterministic provider wire fixtures, NOT evidence of public provider availability.
 * Real provider acceptance is separately captured by the release probe. */
function providerPage(provider: 'youtube' | 'vimeo', id: string) {
  return `<!doctype html><html><body style="margin:0;background:#123;color:white;font:24px system-ui"><h1>Provider fixture</h1><button id="ready">Make video ready</button><button id="play">Play</button><script>
    const provider=${JSON.stringify(provider)},videoId=${JSON.stringify(id)}; let allowed=false,time=0,paused=true,muted=true,volume=.5,rate=1,peerId,peerChannel,peerOrigin;
    const send=m=>parent.postMessage(JSON.stringify(provider==='youtube'?{...m,id:peerId,channel:peerChannel}:m),peerOrigin);
    const info=()=>send({event:'infoDelivery',info:{videoData:{video_id:videoId},duration:60,currentTime:time,playerState:paused?2:1,muted,volume:volume*100,playbackRate:rate}});
    addEventListener('message',e=>{if(e.source!==parent)return;let m;try{m=JSON.parse(e.data)}catch{return}peerOrigin=e.origin;peerId=m.id;peerChannel=m.channel;
      if(!allowed)return;
      if(provider==='youtube'){if(m.event==='listening'){info();return}if(m.func==='playVideo')paused=false;if(m.func==='pauseVideo')paused=true;if(m.func==='seekTo')time=m.args[0];if(m.func==='mute')muted=true;if(m.func==='unMute')muted=false;if(m.func==='setVolume')volume=m.args[0]/100;if(m.func==='setPlaybackRate')rate=m.args[0];if(m.event==='command')info();}
      else {const method=m.method;if(method==='play')paused=false;if(method==='pause')paused=true;if(method==='setCurrentTime')time=m.value;if(method==='setMuted')muted=m.value;if(method==='setVolume')volume=m.value;if(method==='setPlaybackRate')rate=m.value;const values={getVideoId:videoId,getDuration:60,getCurrentTime:time,getPaused:paused,getMuted:muted,getVolume:volume,getPlaybackRate:rate};if(method in values)send({method,value:values[method]});if(method==='play'||method==='pause')send({event:method,data:{seconds:time}});}
    });
    document.querySelector('#ready').onclick=()=>{allowed=true;if(peerOrigin){if(provider==='youtube')info();else send({event:'loaded',data:{id:videoId}})}};
    document.querySelector('#play').onclick=()=>{paused=false;if(provider==='youtube')info();else send({event:'play',data:{seconds:time}})};
    window.rejectEmbed=()=>send(provider==='youtube'?{event:'onError',info:150}:{event:'error',data:{method:'loadVideo',name:'PrivacyError'}});
  </script></body></html>`;
}

test('YouTube and Vimeo require provider readiness, fill the actual screen, and acknowledge real provider-state changes', async ({ page, baseURL, diagnostics }, info) => {
  await register(page); const sessionId = await createSession(page, 'Embedded video controls'), display = await createDisplay(page, sessionId, 'Receiving video screen');
  const viewer = await openViewer(page, sessionId, display.id); await viewer.bringToFront();
  const { client, call } = await connection(page, baseURL!);
  diagnostics.allowHttp(viewer, `/api/sessions/${sessionId}/displays/${display.id}/delivery`, 409);
  try {
    for (const target of [{ provider: 'youtube', id: 'M7lc1UVf-VE', url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE', pattern: 'https://www.youtube-nocookie.com/embed/**' }, { provider: 'vimeo', id: '76979871', url: 'https://vimeo.com/76979871', pattern: 'https://player.vimeo.com/video/**' }] as const) {
      await page.context().route(target.pattern, route => route.fulfill({ status: 200, contentType: 'text/html', body: providerPage(target.provider, target.id) }));
      await publishPrepared(page, sessionId, [display.id], { version: 1, template: 'video', data: { url: target.url, start: 3, end: 12, muted: true, autoplay: false } });
      const prepared = await waitForDisplay(page, sessionId, display.id, d => d.view?.data.url === target.url);
      const candidate = viewer.locator('.viewer-candidate iframe'), frame = candidate.contentFrame();
      // The frame has loaded, but it has not claimed any playable content.
      await expect(frame.getByRole('heading', { name: 'Provider fixture' })).toBeAttached();
      expect((await sessionDetail(page, sessionId)).displays.find(d => d.id === display.id)!.appliedRevision ?? 0).toBeLessThan(prepared.revision);
      // The candidate is intentionally hidden until ready; this is a provider
      // message, not a simulated user click through a hidden playback surface.
      await frame.locator('#ready').evaluate(e => (e as HTMLButtonElement).click());
      const current = await waitForDisplay(page, sessionId, display.id, d => d.appliedRevision === prepared.revision);
      const rect = await candidate.boundingBox(); expect(rect!.width).toBeGreaterThan(300); expect(rect!.height).toBeGreaterThanOrEqual(200);
      expect(rect!.x).toBeGreaterThanOrEqual(0); expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewer.viewportSize()!.width + 1);
      await frame.getByRole('button', { name: 'Play', exact: true }).click();
      const command = async (value: Record<string, unknown>) => {
        const created = await call<VideoCommandRecord>('kanvas_control', 'video.control', { sessionId, displayId: display.id, expectedRevision: current.revision, requestId: randomUUID(), command: value });
        let result: VideoCommandRecord | undefined;
        await expect.poll(async () => { result = await call<VideoCommandRecord>('kanvas_inspect', 'video.status', { sessionId, displayId: display.id, commandId: created.id }); return result.status; }).toBe('applied');
        return result!.result!;
      };
      expect((await command({ action: 'pause' })).paused).toBe(true);
      expect((await command({ action: 'seek', time: 8 })).currentTime).toBeCloseTo(8, 1);
      expect((await command({ action: 'play' })).paused).toBe(false);
      expect((await command({ action: 'pause' })).paused).toBe(true);
      await info.attach(`${target.provider}-screen`, { body: await viewer.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
      // A provider denial remains a failure, even after an iframe loaded.
      await frame.locator('body').evaluate(() => (window as unknown as { rejectEmbed(): void }).rejectEmbed());
      await expect(viewer.locator('.media-readiness-error')).toContainText('provider refused embedded playback');
    }
  } finally { await client.close(); await viewer.close(); }
});
