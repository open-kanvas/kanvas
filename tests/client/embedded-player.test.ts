import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmbeddedPlayer } from '../../src/client/renderers/embedded-player';
import { videoEmbed, videoEmbedUrl, type VideoEmbed } from '../../src/shared/video-embed';
import { validateView } from '../../src/shared/view-schemas';
import { nativeVideoFailure } from '../../src/shared/media-failures';

const players: EmbeddedPlayer[] = [];
afterEach(() => { for (const player of players.splice(0)) player.dispose(); });
function fixture(target: VideoEmbed) {
  const owner = new EventTarget(), contentWindow = { postMessage: vi.fn() }, hooks = { ready: vi.fn(), failed: vi.fn(), state: vi.fn() };
  const frame = { id: 'player-1', contentWindow, ownerDocument: { defaultView: owner, fullscreenElement: null } } as unknown as HTMLIFrameElement;
  const player = new EmbeddedPlayer(frame, target, { url: `${target.origin}/video`, end: 30 }, hooks); players.push(player);
  const message = (data: unknown, origin = target.origin as string, source: unknown = contentWindow) => {
    const event = new Event('message'); Object.assign(event, { data: JSON.stringify(data), origin, source }); owner.dispatchEvent(event);
  };
  return { player, message, hooks, contentWindow, frame };
}

describe('bounded native/embedded video contract', () => {
  it('normalizes only recognized video identities and never widens arbitrary iframe or native URL access', () => {
    const y = videoEmbed('https://youtu.be/M7lc1UVf-VE')!, v = videoEmbed('https://vimeo.com/76979871')!;
    expect(y).toEqual({ provider: 'youtube', id: 'M7lc1UVf-VE', origin: 'https://www.youtube-nocookie.com' });
    const url = new URL(videoEmbedUrl(y, { start: 1.25, end: 9.5, autoplay: true }, 'https://kanvas.example', true));
    expect(url.origin).toBe(y.origin); expect(url.searchParams.get('autoplay')).toBe('0'); expect(url.searchParams.get('origin')).toBe('https://kanvas.example');
    expect(new URL(videoEmbedUrl(v, {}, 'https://kanvas.example')).searchParams.get('dnt')).toBe('1');
    for (const url of ['https://example.com/video', 'https://youtube.com.evil.example/watch?v=M7lc1UVf-VE', 'https://www.youtube.com:8443/watch?v=M7lc1UVf-VE', 'http://youtu.be/M7lc1UVf-VE', 'https://youtube.com/playlist?list=anything', 'https://vimeo.com/not-a-video']) {
      expect(videoEmbed(url)).toBeUndefined(); expect(() => validateView({ version: 1, template: 'video', data: { url, embed: true } })).toThrow();
    }
    expect(validateView({ version: 1, template: 'video', data: { url: 'https://example.com/clip.mp4' } }).data).not.toHaveProperty('embed');
    expect(videoEmbed('/api/assets/clip')).toBeUndefined();
    expect(validateView({ version: 1, template: 'video', data: { url: '/api/assets/clip' } }).data.url).toBe('/api/assets/clip');
    expect([1, 2, 3, 4].map(code => nativeVideoFailure({ code }))).toEqual(['MEDIA_ABORTED', 'MEDIA_NETWORK', 'MEDIA_DECODE', 'MEDIA_UNSUPPORTED']);
  });

  it('requires YouTube video identity/readiness and confirms controls from provider state, rejecting spoofed senders', async () => {
    const f = fixture(videoEmbed('https://youtu.be/M7lc1UVf-VE')!);
    const initialized = { event: 'initialDelivery', info: { videoData: { video_id: 'M7lc1UVf-VE' }, duration: 60, currentTime: 0, playerState: 5, volume: 100, muted: false, playbackRate: 1 } };
    f.message(initialized, 'https://www.youtube.com.evil.example'); f.message(initialized, undefined, {});
    f.message({ event: 'onReady' }); expect(f.hooks.ready).not.toHaveBeenCalled();
    f.message(initialized); expect(f.hooks.ready).toHaveBeenCalledTimes(1);
    let settled = false;
    const command = f.player.control({ id: 'command', action: 'play' }, {} as HTMLElement).then(r => { settled = true; return r; });
    await Promise.resolve(); expect(settled).toBe(false);
    f.message({ event: 'onStateChange', info: 1 }, 'https://player.vimeo.com'); await Promise.resolve(); expect(settled).toBe(false);
    f.message({ event: 'infoDelivery', info: { playerState: 1, currentTime: .1 } });
    expect(await command).toMatchObject({ status: 'applied', paused: false, currentTime: .1 });
    f.message({ event: 'onError', info: 153 }); expect(f.hooks.failed).toHaveBeenCalledWith('EMBED_BLOCKED');
  });

  it('requires Vimeo identity and duration, waits for an actual seek, and exposes provider refusal without its arbitrary error text', async () => {
    const f = fixture(videoEmbed('https://vimeo.com/76979871')!);
    f.message({ event: 'ready' }); f.message({ method: 'getDuration', value: 60 }); expect(f.hooks.ready).not.toHaveBeenCalled();
    f.message({ method: 'getVideoId', value: 76979871 }); expect(f.hooks.ready).toHaveBeenCalledTimes(1);
    const command = f.player.control({ id: 'seek', action: 'seek', time: 12 }, {} as HTMLElement);
    f.message({ method: 'getCurrentTime', value: 12 }); expect(await command).toMatchObject({ status: 'applied', currentTime: 12 });
    expect(await f.player.control({ id: 'bad-seek', action: 'seek', time: 40 }, {} as HTMLElement)).toMatchObject({ status: 'failed' });
    f.message({ event: 'error', data: { name: 'PrivacyError', message: 'untrusted provider payload' } });
    expect(f.hooks.failed).toHaveBeenCalledWith('EMBED_BLOCKED');
  });
});
