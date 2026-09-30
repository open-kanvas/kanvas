import { isSafeUrl } from './urls.js';

export interface VideoEmbed { provider: 'youtube' | 'vimeo'; id: string; origin: 'https://www.youtube-nocookie.com' | 'https://player.vimeo.com' }
/** Only recognized single-video URLs. Never promote arbitrary page URLs to an iframe. */
export function videoEmbed(value: string): VideoEmbed | undefined {
  if (!isSafeUrl(value)) return;
  let u: URL;
  try { u = new URL(value); } catch { return; } // Authorized uploads use relative native-media URLs.
  if (u.protocol !== 'https:' || u.port) return;
  const host = u.hostname;
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be', 'www.youtu.be'].includes(host)) {
    const id = host.endsWith('youtu.be') ? /^\/([\w-]+)\/?$/.exec(u.pathname)?.[1]
      : u.pathname === '/watch' ? u.searchParams.get('v') : /^\/(?:embed|shorts|live)\/([\w-]+)\/?$/.exec(u.pathname)?.[1];
    if (id && /^[\w-]{11}$/.test(id)) return { provider: 'youtube', id, origin: 'https://www.youtube-nocookie.com' };
  }
  if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(host)) {
    const id = /^\/(?:video\/)?(\d{1,20})\/?$/.exec(u.pathname)?.[1];
    if (id) return { provider: 'vimeo', id, origin: 'https://player.vimeo.com' };
  }
}

export function videoEmbedUrl(target: VideoEmbed, data: { start?: number; end?: number; autoplay?: boolean; muted?: boolean; loop?: boolean }, parentOrigin: string, preview = false): string {
  const u = new URL(target.provider === 'youtube' ? `/embed/${target.id}` : `/video/${target.id}`, target.origin);
  if (target.provider === 'youtube') {
    u.searchParams.set('enablejsapi', '1'); u.searchParams.set('origin', parentOrigin);
    u.searchParams.set('playsinline', '1'); u.searchParams.set('controls', '1'); u.searchParams.set('rel', '0');
    if (data.start) u.searchParams.set('start', String(Math.floor(data.start)));
    if (data.end) u.searchParams.set('end', String(Math.ceil(data.end)));
    u.searchParams.set('mute', preview || data.muted ? '1' : '0');
  } else {
    u.searchParams.set('dnt', '1'); u.searchParams.set('playsinline', '1');
    u.searchParams.set('muted', preview || data.muted ? '1' : '0');
    if (data.start) u.hash = `t=${data.start}s`;
  }
  u.searchParams.set('autoplay', !preview && data.autoplay ? '1' : '0');
  // Segmented looping is managed against the acknowledged playback position.
  if (!preview && data.loop && !data.start && data.end === undefined) {
    u.searchParams.set('loop', '1'); if (target.provider === 'youtube') u.searchParams.set('playlist', target.id);
  }
  return u.href;
}
