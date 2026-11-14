import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import { formatPlaybackSeconds, nowPlayingDataSchema, type NowPlayingData } from '../../src/shared/now-playing';
import { NowPlayingRenderer } from '../../src/client/renderers/NowPlaying';
import { Renderer } from '../../src/client/renderers/Renderer';
import { templateViewSchema, validateView } from '../../src/shared/view-schemas';

const required = { track: 'Open Water', artist: 'Ingrid Sol' };
const data = (extra: Partial<NowPlayingData> = {}) => nowPlayingDataSchema.parse({ ...required, ...extra });
const view = (extra: Partial<NowPlayingData> = {}) => validateView({ version: 1, template: 'now-playing', title: 'Audio display', data: data(extra) });

describe('strict supplied now-playing snapshot', () => {
  it('requires real track/artist information without inventing state, artwork or position', () => {
    expect(data()).toEqual(required);
    const schema = z.toJSONSchema(templateViewSchema('now-playing'), { io: 'input' });
    expect(schema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(schema.properties?.data).toMatchObject({ type: 'object', additionalProperties: false, required: ['track', 'artist'] });
    for (const input of [{}, { track: 'Title' }, { artist: 'Artist' }, { ...required, track: '' }, { ...required, artist: ' ' }]) {
      expect(nowPlayingDataSchema.safeParse(input).success).toBe(false);
    }
  });

  it('preserves exact source text, fractional positions, explicit state and zone-qualified observation', () => {
    const supplied = { track: '  Åpent hav — live  ', artist: 'Noor & 東京', album: 'Night\nSessions', state: 'paused' as const, elapsedSeconds: 360005.125, durationSeconds: 400000.25, observedAt: '2026-09-14T01:23:45.678+05:45', artwork: { url: '/api/assets/supplied-cover', alt: 'Original album cover' } };
    expect(nowPlayingDataSchema.parse(supplied)).toEqual(supplied);
    expect(data({ artwork: { url: 'https://example.com/cover.jpg' } as NowPlayingData['artwork'] }).artwork).toEqual({ url: 'https://example.com/cover.jpg', alt: '' });
  });

  it('rejects invented controls, nonfinite/coerced positions and out-of-bounds durations', () => {
    for (const extra of [
      { state: 'buffering' }, { state: 'live' }, { playing: true }, { controls: true }, { source: 'spotify' }, { fetchUrl: 'https://example.com/api' },
      { elapsedSeconds: -1 }, { elapsedSeconds: Infinity }, { elapsedSeconds: NaN }, { elapsedSeconds: '12' },
      { durationSeconds: 0 }, { durationSeconds: -1 }, { durationSeconds: Infinity }, { durationSeconds: Number.MAX_SAFE_INTEGER + 1 },
      { observedAt: '2026-09-14T01:23:45' }, { observedAt: '2026-02-30T00:00:00Z' }, { observedAt: 'yesterday' },
      { track: 'x'.repeat(501) }, { artist: 'x'.repeat(501) }, { album: 'x'.repeat(501) },
    ]) expect(nowPlayingDataSchema.safeParse({ ...required, ...extra }).success).toBe(false);
    expect(data({ elapsedSeconds: 0, durationSeconds: Number.MAX_SAFE_INTEGER }).durationSeconds).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('rejects elapsed beyond duration without silently clamping either supplied value', () => {
    const result = nowPlayingDataSchema.safeParse({ ...required, elapsedSeconds: 300.5, durationSeconds: 300.25 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ['elapsedSeconds'], message: 'Elapsed seconds cannot exceed the supplied duration' }));
    expect(data({ elapsedSeconds: 300.25, durationSeconds: 300.25 })).toMatchObject({ elapsedSeconds: 300.25, durationSeconds: 300.25 });
    expect(data({ elapsedSeconds: 300.25 })).toMatchObject({ elapsedSeconds: 300.25 });
  });

  it('allows only safe source artwork URLs, with strict nested fields and bounded alt text', () => {
    for (const url of ['/api/assets/own-cover_123', 'https://example.com/album.png']) expect(data({ artwork: { url, alt: '' } }).artwork?.url).toBe(url);
    for (const url of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'blob:https://example.com/id', 'file:///cover.png', 'https://127.0.0.1/cover.png', 'http://private.local/cover.png', '//example.com/cover.png', 'https://example.com/' + 'a'.repeat(2048)]) {
      expect(nowPlayingDataSchema.safeParse({ ...required, artwork: { url } }).success).toBe(false);
    }
    for (const artwork of [{ url: 'https://example.com/album.png', html: '<img>' }, { url: 'https://example.com/album.png', alt: 'x'.repeat(501) }]) {
      expect(nowPlayingDataSchema.safeParse({ ...required, artwork }).success).toBe(false);
    }
  });
});

describe('truthful elapsed and duration formatting', () => {
  it('retains decimal precision and long audiobook hours without wrapping at a day', () => {
    expect(formatPlaybackSeconds(0)).toBe('0:00');
    expect(formatPlaybackSeconds(60.1)).toBe('1:00.1');
    expect(formatPlaybackSeconds(3661.125)).toBe('1:01:01.125');
    expect(formatPlaybackSeconds(360005.125)).toBe('100:00:05.125');
    expect(formatPlaybackSeconds(400000.25)).toBe('111:06:40.25');
    expect(formatPlaybackSeconds(1e-7)).toBe('1e-7 s');
  });
});

describe('passive artwork and track presentation', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('uses the minimal text-only layout with no fake artwork, default active state or transport controls', () => {
    const html = renderToStaticMarkup(<Renderer view={view()} editable actionable onRespond={vi.fn()} />);
    expect(html).toContain('template-now-playing'); expect(html).toContain('now-playing-text-only');
    expect(html).toContain(required.track); expect(html).toContain(required.artist);
    expect(html).not.toContain('class="view-heading"'); expect(html).not.toContain('now-playing-state'); expect(html).not.toContain('now-playing-timing');
    expect(html).not.toMatch(/<img|<audio|<video|<iframe|<button|<input|role="slider"|role="progressbar"|Connecting|Listening|Playing/);
    expect(html).not.toContain('Artwork unavailable');
  });

  it('renders genuine artwork as an image pending actual load, with exact inert track text and alt', () => {
    const html = renderToStaticMarkup(<Renderer view={view({ track: '<b>Title</b>', artist: 'A & B', album: '<script>Album</script>', artwork: { url: '/api/assets/original-cover', alt: 'The <original> cover' } })} />);
    expect(html).toContain('src="/api/assets/original-cover"'); expect(html).toContain('alt="The &lt;original&gt; cover"');
    expect(html).toContain('referrerPolicy="no-referrer"'); expect(html).toContain('data-load-status="pending"'); expect(html).toContain('Loading media…');
    expect(html).toContain('&lt;b&gt;Title&lt;/b&gt;'); expect(html).toContain('A &amp; B'); expect(html).toContain('&lt;script&gt;Album&lt;/script&gt;');
    expect(html).not.toMatch(/<b>|<script>|<audio|<video|<button/);
  });

  it('shows an honest single readout but no progress bar when either position is absent', () => {
    for (const extra of [{ elapsedSeconds: 61.5 }, { durationSeconds: 181.25 }]) {
      const html = renderToStaticMarkup(<NowPlayingRenderer view={view(extra)} />);
      expect(html).not.toContain('role="progressbar"'); expect(html).toContain('now-playing-single-time');
      if ('elapsedSeconds' in extra) { expect(html).toContain('Elapsed '); expect(html).toContain('1:01.5'); expect(html).not.toContain('now-playing-duration'); }
      else { expect(html).toContain('Duration '); expect(html).toContain('3:01.25'); expect(html).not.toContain('now-playing-elapsed'); }
    }
  });

  it('uses supplied zero, fractional and complete progress values with exact accessible numbers', () => {
    for (const elapsedSeconds of [0, 300.125, 600.25]) {
      const html = renderToStaticMarkup(<NowPlayingRenderer view={view({ elapsedSeconds, durationSeconds: 600.25 })} />);
      expect(html).toContain('role="progressbar"'); expect(html).toContain(`aria-valuenow="${elapsedSeconds}"`); expect(html).toContain('aria-valuemax="600.25"');
      expect(html).toContain(`width:${elapsedSeconds / 600.25 * 100}%`);
      expect(html).toContain(`data-seconds="${elapsedSeconds}"`); expect(html).toContain(formatPlaybackSeconds(elapsedSeconds));
    }
  });

  it('never extrapolates a supplied playing position from time, observation age or server snapshots', () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-09-14T00:00:00Z');
    const snapshot = view({ state: 'playing', elapsedSeconds: 360005.125, durationSeconds: 400000.25, observedAt: '2025-01-01T00:00:00Z' });
    const first = renderToStaticMarkup(<NowPlayingRenderer view={snapshot} serverNow="2026-09-14T00:00:00Z" />);
    vi.advanceTimersByTime(86_400_000);
    const later = renderToStaticMarkup(<NowPlayingRenderer view={snapshot} serverNow="2035-01-01T00:00:00Z" />);
    expect(later).toBe(first); expect(later).toContain('100:00:05.125'); expect(later).toContain('111:06:40.25');
    expect(later).toContain('Reported playback state: playing'); expect(later).not.toContain('2025-01-01');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retains every explicitly supplied state and only exposes observation metadata when requested', () => {
    for (const state of ['playing', 'paused', 'stopped'] as const) {
      const snapshot = view({ state, observedAt: '2026-09-14T01:23:45+02:00' });
      const html = renderToStaticMarkup(<NowPlayingRenderer view={{ ...snapshot, showCaption: true, showControls: true }} actionable />);
      expect(html).toContain(`data-state="${state}"`); expect(html).toContain('dateTime="2026-09-14T01:23:45+02:00"');
      expect(html).not.toMatch(/<button|<audio|<video|<input|<iframe/);
    }
  });
});
