import { describe, expect, it } from 'vitest';
import { isAllowedEmbedUrl, isSafeUrl, validateView } from '../../src/shared/view-schemas.js';
import { TEMPLATE_IDS } from '../../src/shared/types.js';
import { cases, source, view } from './helpers.js';

describe('accepted template contracts', () => {
  it('validates one genuine renderable case for every accepted family and preserves provenance', () => {
    expect(cases.map((sample) => sample.template).sort()).toEqual([...TEMPLATE_IDS].sort());
    for (const sample of cases) { expect(validateView(view(sample.template, sample.data)).template).toBe(sample.template); expect(() => validateView({ ...view(sample.template, sample.data), source })).toThrow(); }
  });
  it('sets safe interaction and playback defaults', () => {
    expect((validateView(view('checklist', { items: [{ id: 'one', text: 'Verify' }] })).data.items as any[])[0].checked).toBe(false);
    expect(validateView(view('video', { url: 'https://example.com/clip.mp4' })).data).toMatchObject({ start: 0, muted: false, loop: false });
    expect(validateView(view('web', { url: 'https://example.com/' })).data.embed).toBe(false);
  });
  it.each(['javascript:alert(1)', 'data:text/html,evil', 'file:///etc/passwd', '//example.com', '/api/assets/../../auth/me', 'https://user:password@example.com/', 'http://127.1/', 'http://0x7f000001/', 'http://2130706433/', 'http://10.1.2.3/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://localhost/', 'http://host.local/', 'https://example.com/\nanything'])('rejects unsafe URL %s', (url) => {
    expect(isSafeUrl(url)).toBe(false);
    expect(() => validateView(view('image', { images: [{ url }] }))).toThrow();
  });
  it('allows public links and protected asset references; embeds are publisher endpoints or live https pages checked at display time', () => {
    expect(isSafeUrl('/api/assets/asset_123')).toBe(true);
    expect(isSafeUrl('https://example.com/report?q=one')).toBe(true);
    expect(isAllowedEmbedUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe(true);
    expect(isAllowedEmbedUrl('https://example.com/arbitrary.html')).toBe(false);
    // Any https page may request a live embed; the server checks the site's own framing headers before framing it.
    expect(validateView(view('web', { url: 'https://example.com/report', embed: true })).data.embed).toBe(true);
    expect(() => validateView(view('web', { url: 'http://example.com/report', embed: true }))).toThrow();
  });
  it('rejects executable fields, malformed geometry/highlights, duplicate actions and invalid timelines', () => {
    expect(() => validateView(view('fact', { text: 'ok', html: '<script>run()</script>' }))).toThrow();
    expect(() => validateView(view('map', { markers: [{ lat: 91, lng: 0 }] }))).toThrow();
    expect(() => validateView(view('document', { text: 'source', highlights: [{ start: 2, end: 20 }] }))).toThrow();
    expect(() => validateView(view('video', { url: 'https://example.com/clip.mp4', start: 5, end: 3 }))).toThrow();
    expect(() => validateView({ ...view('fact', { text: 'ok' }), actions: [{ id: 'x', label: 'One', kind: 'button' }, { id: 'x', label: 'Two', kind: 'button' }] })).toThrow();
    expect(() => validateView(view('comparison', { criteria: ['Price'], items: [{ name: 'A', values: { Price: 1 } }, { name: 'B', values: { Weight: 1 } }] }))).toThrow();
    expect(() => validateView(view('whiteboard', { elements: [{ id: 'draw', type: 'draw', x: 0, y: 0, points: [{ x: 0, y: 0 }] }] }))).toThrow();
    expect(() => validateView(view('whiteboard', { elements: [{ id: 'rect', type: 'rect', x: 0, y: 0, width: -10, height: 10 }] }))).toThrow();
  });
  it('requires valid plot-specific semantics and never treats missing values as fabricated numbers', () => {
    expect(() => validateView(view('chart', { kind: 'scatter', series: [{ name: 's', points: [{ x: 'wrong', y: 1 }] }] }))).toThrow();
    expect(() => validateView(view('chart', { kind: 'heatmap', series: [{ name: 's', points: [{ x: 'a', y: 'b' }] }] }))).toThrow();
    expect(() => validateView(view('chart', { kind: 'box', series: [{ name: 's', points: [{ x: 'a', y: 3, low: 4, q1: 1, median: 2, q3: 3, high: 5 }] }] }))).toThrow();
  });
  it('bounds nested decks, object complexity and dangerous object keys', () => {
    expect(() => validateView(view('presentation', { slides: [view('presentation', { slides: [view('fact', { text: 'nested' })] })] }))).toThrow();
    expect(() => validateView(JSON.parse('{"version":1,"template":"fact","data":{"text":"x","__proto__":{"polluted":true}}}'))).toThrow();
    const cyclic: any = view('fact', { text: 'x' }); cyclic.data.next = cyclic;
    expect(() => validateView(cyclic)).toThrow(/Cyclic/);
  });
});
