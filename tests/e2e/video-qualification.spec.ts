import { readFile } from 'node:fs/promises';
import type { Locator } from '@playwright/test';
import type { AssetRecord, ViewSpec } from '../../src/shared/types';
import { createDisplay, createSession, expect, openViewer, publishPrepared, register, sessionApi, sessionDetail, test, waitForDisplay } from './support';

function videoGeometry(surface: Locator) {
  return surface.evaluate(root => {
    const rect = (element: Element) => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    const describe = (element: Element | null) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      return { tag: element.tagName, className: element.getAttribute('class'), role: element.getAttribute('role'), rect: rect(element), visibility: style.visibility, pointerEvents: style.pointerEvents, zIndex: style.zIndex };
    };
    const video = root.querySelector('video')!, qualifier = root.querySelector('.view-qualification'), information = root.querySelector<HTMLDetailsElement>('.view-information');
    const menu = document.querySelector('.viewer-menu-toggle')!, menuRect = rect(menu), videoRect = rect(video), title = root.querySelector('.view-heading h1');
    const titleLines: Array<ReturnType<typeof rect>> = [];
    if (title) { const range = document.createRange(); range.selectNodeContents(title); for (const r of range.getClientRects()) titleLines.push({ x: r.x, y: r.y, width: r.width, height: r.height }); }
    const point = (element: Element, x: number, y: number) => {
      const hit = document.elementFromPoint(x, y), owned = hit !== null && (hit === element || element.contains(hit));
      return { x, y, owned, ...(!owned ? { hit: describe(hit), stack: document.elementsFromPoint(x, y).slice(0, 8).map(describe) } : {}) };
    };
    const menuPoints = [[.5, .5], [.1, .1], [.9, .1], [.1, .9], [.9, .9]].map(([x, y]) => point(menu, menuRect.x + menuRect.width * x, menuRect.y + menuRect.height * y));
    const transportPoints = [24, videoRect.width / 2, videoRect.width - 24].flatMap(x => [22, 48].map(y => point(video, videoRect.x + x, videoRect.y + videoRect.height - y)));
    return {
      surface: rect(root), video: videoRect, qualifier: qualifier ? rect(qualifier) : null, information: information ? rect(information) : null, menu: menuRect, titleLines,
      menuClear: menuPoints.every(point => point.owned), transportClear: transportPoints.every(point => point.owned), menuPoints, transportPoints,
      diagnostic: {
        body: describe(root.querySelector(':scope > .render-body')), frame: describe(root.querySelector('.video-frame')), videoInfo: describe(root.querySelector('.video-info')),
        candidate: describe(root.closest('.viewer-candidate')), informationOpen: information?.open, activeElement: describe(document.activeElement),
        shell: { revision: document.querySelector('.viewer-shell')?.getAttribute('data-rendered-revision'), status: document.querySelector('.viewer-shell')?.getAttribute('data-render-status') },
        media: { readyState: video.readyState, networkState: video.networkState, duration: video.duration, currentTime: video.currentTime, paused: video.paused, seeking: video.seeking, errorCode: video.error?.code ?? null, width: video.videoWidth, height: video.videoHeight },
        viewport: { width: innerWidth, height: innerHeight, visual: visualViewport ? { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale } : null },
        visibility: document.visibilityState,
      },
    };
  });
}

test('video source controls and requested titles keep native transport unobstructed', async ({ page }, info) => {
  await register(page);
  const sessionId = await createSession(page, 'Video truth qualification'), display = await createDisplay(page, sessionId, 'Video receiving screen');
  const uploaded = await sessionApi<AssetRecord>(page, `/api/sessions/${sessionId}/assets`, 'POST', {
    name: 'Synthetic acceptance clip.mp4', mimeType: 'video/mp4',
    base64: (await readFile(new URL('../rendering/fixtures/sample.mp4', import.meta.url))).toString('base64'),
  });
  expect(uploaded.status).toBe(201);
  const viewer = await openViewer(page, sessionId, display.id);
  const base: ViewSpec = {
    version: 1, template: 'video',
    title: 'A supplied video with a longer title that remains readable when the receiving screen is narrow.',
    
    data: { url: uploaded.data!.url, muted: true, loop: true },
  };
  const variants: Array<{ name: string; showTitle?: boolean; showControls?: boolean }> = [
    { name: 'default' }, { name: 'title', showTitle: true },
    { name: 'explicit', showTitle: true, showControls: true },
  ];
  // The second phone width reproduces a title line extending under the menu.
  const widths = info.project.name.startsWith('phone') ? [390, 443] : [1440];
  for (const width of widths) {
    await viewer.setViewportSize({ width, height: width === 1440 ? 900 : width === 443 ? 823 : 844 });
    for (const { name, ...flags } of variants) {
      const before = (await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)!.revision;
      await publishPrepared(page, sessionId, [display.id], { ...base, ...flags });
      const current = await waitForDisplay(page, sessionId, display.id, item => item.revision > before && item.appliedRevision === item.revision);
      await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision', String(current.revision));
      const surface = viewer.locator('.viewer-candidate .template-video'), video = surface.locator('video');
      await expect.poll(() => video.evaluate(element => { const media = element as HTMLVideoElement; return media.readyState >= 2 && Number.isFinite(media.duration) && media.duration > 0; })).toBe(true);
      await expect(video).toHaveJSProperty('controls', true);
      let geometry = await videoGeometry(surface);
      const separate = (a: typeof geometry.menu, b: typeof geometry.menu) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      try {
        // Decoded media readiness does not mean Chromium's native controls have
        // finished painting after the candidate becomes visible. Until then its
        // letterbox can hit .video-frame despite unchanged layout. Normal,
        // actionability-waited play/pause proves the actual native transport is
        // ready before the full hit/bounds checks; no forced click or delay.
        const nativePlay = { x: 24, y: geometry.video.height - 48 };
        await video.click({ position: nativePlay });
        await expect(video).toHaveJSProperty('paused', false);
        await video.click({ position: nativePlay });
        await expect(video).toHaveJSProperty('paused', true);
        geometry = await videoGeometry(surface);
        expect(geometry.menuClear, `${width}/${name}: display menu receives real pointer events`).toBe(true);
        expect(geometry.transportClear, `${width}/${name}: native transport remains unobstructed`).toBe(true);
      } catch (error) {
        // The runner's default page is the workspace. Preserve the receiving
        // screen and exact failed hit stack before any diagnostic wait; later
        // recovery is evidence, never a reason to discard the original failure.
        await info.attach(`video-hit-${width}-${name}-initial`, { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' });
        await info.attach(`video-hit-${width}-${name}-receiver`, { body: await viewer.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
        await info.attach(`video-hit-${width}-${name}-receiver-dom`, { body: await viewer.locator('.viewer-shell').ariaSnapshot(), contentType: 'text/plain' });
        await viewer.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        await info.attach(`video-hit-${width}-${name}-after-paint`, { body: JSON.stringify(await videoGeometry(surface), null, 2), contentType: 'application/json' });
        throw error;
      }
      expect(geometry.menu.width).toBeGreaterThanOrEqual(44); expect(geometry.menu.height).toBeGreaterThanOrEqual(44);
      for (const line of geometry.titleLines) expect(separate(line, geometry.menu), 'Requested title text clears the display menu').toBe(true);
      await expect(surface.locator('.view-qualification,.view-information')).toHaveCount(0);

      if (flags.showTitle) await expect(surface.locator('.view-heading h1')).toHaveText(base.title!);
      else await expect(surface.locator('.view-heading')).toHaveCount(0);
      if (name === 'default') {
        expect(geometry.video.width).toBeCloseTo(geometry.surface.width, 0); expect(geometry.video.height).toBeCloseTo(geometry.surface.height, 0);
        await expect(surface.locator('.video-info,.view-information')).toHaveCount(0);
      }
      if (flags.showControls) {
        await viewer.getByRole('button', { name: 'Replay segment', exact: true }).click();
        await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(false);
        await video.evaluate(element => (element as HTMLVideoElement).pause());
      }
    }
  }
});
