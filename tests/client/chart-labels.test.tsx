import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChartRenderer, layoutChartTicks, wrapChartTick, type ChartData, type ChartTextMeasure } from '../../src/client/renderers/Chart';

const reported = ['52-week low', 'All-time high (May 13)', 'Sep 11 close', 'Latest session'];
// Variable-width glyphs deliberately distinguish WWW from iii; layout must use
// actual measurement, not a fixed character-count or a viewport tick count.
const measure: ChartTextMeasure = text => Array.from(text).reduce((sum, glyph) => sum + (/\s/u.test(glyph) ? 4 : /[ilI.,!]/u.test(glyph) ? 4 : /[MW]/u.test(glyph) ? 13 : 8), 0);
const sample = (kind: 'line' | 'bar' | 'box' | 'heatmap' = 'line'): ChartData => ({
  kind, xLabel: 'Price milestone', yLabel: kind === 'heatmap' ? 'Supplied region' : 'Price', unit: 'USD',
  series: [{ name: 'Source', points: reported.map((x, index) => kind === 'box'
    ? { x, y: 20 + index, low: 10 + index, q1: 15 + index, median: 20 + index, q3: 25 + index, high: 30 + index }
    : kind === 'heatmap' ? { x, y: 'Northern coastal region', value: 10 + index }
      : { x, y: 10 + index, rawY: `${10 + index}.00000000000000001` }) }],
});
function checkSlots(layout: ReturnType<typeof layoutChartTicks>, left: number, right: number) {
  for (const [index, tick] of layout.ticks.entries()) {
    expect(tick.lines.every(line => measure(line) <= tick.right - tick.left + .1)).toBe(true);
    expect(tick.x - tick.width / 2).toBeGreaterThanOrEqual(left);
    expect(tick.x + tick.width / 2).toBeLessThanOrEqual(right);
    if (index) expect(layout.ticks[index - 1].x + layout.ticks[index - 1].width / 2).toBeLessThanOrEqual(tick.x - tick.width / 2 - 7.9);
  }
}
describe('measured legacy category-axis layout', () => {
  it.each([390, 443, 445, 1440])('keeps all four reported labels in non-overlapping slots at %ipx', viewportWidth => {
    const left = 48, right = viewportWidth - 60;
    const positions = reported.map((_, index) => left + (index + .5) * (right - left) / reported.length);
    const result = layoutChartTicks(reported, positions, left, right, measure);
    expect(result.ticks).toHaveLength(4); expect(result.usesKey).toBe(false);
    expect(result.ticks.map(tick => tick.lines.join(' '))).toEqual(reported);
    checkSlots(result, left, right);
  });
  it('wraps measured words and unbroken identifiers without truncating supplied text', () => {
    const label = 'Customer identifier UnbrokenWWWWIdentifierAndLongSuffix';
    const lines = wrapChartTick(label, 90, measure);
    expect(lines.every(line => measure(line) <= 90)).toBe(true);
    expect(lines.join('').replaceAll(' ', '')).toBe(label.replaceAll(' ', ''));
    expect(lines.join('')).not.toContain('…');
    expect(wrapChartTick('WWWW iiiiiiiiiiii', 55, measure).length).toBeGreaterThan(1);
  });
  it('does not split emoji grapheme clusters across lines', () => {
    const family = '👨‍👩‍👧‍👦';
    const graphemeMeasure = (text: string) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length * 16;
    expect(wrapChartTick(`${family}${family}${family}`, 20, graphemeMeasure)).toEqual([family, family, family]);
  });
  it('uses a heatmap cell’s available width to keep ordinary words whole', () => {
    const left = 89.5, right = 346, positions = reported.map((_, index) => left + (index + .5) * (right - left) / 4);
    const result = layoutChartTicks(reported, positions, left, right, measure, 5, 0);
    expect(result.ticks).toHaveLength(4);
    expect(result.ticks[0].lines).toContain('52-week'); expect(result.ticks[3].lines).toContain('session');
    expect(result.ticks.every(tick => tick.x - tick.width / 2 >= tick.left && tick.x + tick.width / 2 <= tick.right)).toBe(true);
  });
  it('packs clustered continuous ticks by positions and preserves complete labels in the key', () => {
    const labels = ['2026-09-01T00:00:00Z', '2026-09-01T00:00:01Z', '2026-09-01T00:00:02Z', '2026-09-10T00:00:00Z', '2026-09-30T00:00:00Z'];
    const result = layoutChartTicks(labels, [40, 40.001, 40.002, 125, 350], 40, 350, measure);
    expect(result.usesKey).toBe(true); expect(result.ticks.length).toBeGreaterThan(0); expect(result.ticks.length).toBeLessThan(labels.length);
    expect(result.ticks.map(tick => tick.label)).toEqual(result.ticks.map(tick => labels[tick.index]));
    checkSlots(result, 40, 350);
  });
  it('uses a numbered key for exceptionally long labels instead of shrinking text or fabricating a shortened identity', () => {
    const labels = ['W'.repeat(500), 'i'.repeat(500)];
    const result = layoutChartTicks(labels, [90, 220], 30, 290, measure);
    expect(result.indexed).toBe(true); expect(result.usesKey).toBe(true);
    expect(result.ticks.map(tick => tick.lines)).toEqual([['1'], ['2']]);
    expect(result.ticks.map(tick => tick.label)).toEqual(labels); checkSlots(result, 30, 290);
  });
});

describe('legacy rendering preserves source observations while fitting labels', () => {
  it.each(['line', 'bar', 'box', 'heatmap'] as const)('%s retains complete category text and source marks', kind => {
    const html = renderToStaticMarkup(<ChartRenderer data={sample(kind)} />);
    expect(html.match(/data-chart-series="Source"/gu)).toHaveLength(4);
    for (const label of reported) expect(html).toContain(`data-chart-tick-label="${label}"`);
    expect(html).not.toContain('…'); expect(html).not.toContain('<table'); expect(html).not.toMatch(/NaN|Infinity/);
    expect(html).toContain('data-chart-axis-title="x"'); expect(html).toContain('Price milestone'); expect(html).toContain('USD');
  });
  it('does not bridge missing line values or manufacture a zero-valued point', () => {
    const data = sample(); data.series[0].points[1].y = null; data.series[0].points[1].rawY = null;
    const html = renderToStaticMarkup(<ChartRenderer data={data} />);
    expect(html.match(/data-chart-series="Source"/gu)).toHaveLength(3);
    const path = /data-chart-line="Source" d="([^"]*)"/u.exec(html)![1];
    expect(path.match(/M/gu)).toHaveLength(2); expect(path.match(/L/gu)).toHaveLength(1);
    expect(html).toContain('data-chart-tick-label="All-time high (May 13)"');
  });
  it('keeps exact raw values in both keyboard labels and native hover titles', () => {
    const data = sample(); data.series[0].points[0].rawX = 'Original 52-week low';
    const html = renderToStaticMarkup(<ChartRenderer data={data} />);
    expect(html).toContain('aria-label="Source: Original 52-week low, 10.00000000000000001 USD"');
    expect(html).toContain('<title>Source: Original 52-week low, 10.00000000000000001 USD</title>');
  });
  it('retains every dense observation without a below-chart category key or data table', () => {
    const data: ChartData = { kind: 'bar', series: [{ name: 'Source', points: Array.from({ length: 120 }, (_, index) => ({ x: `Full supplied category number ${index + 1}`, y: index + 1 })) }] };
    const html = renderToStaticMarkup(<ChartRenderer data={data} />);
    expect(html.match(/data-chart-series="Source"/gu)).toHaveLength(120);
    expect(html).not.toContain('data-chart-category-index');
    expect(html).not.toContain('aria-label="Complete chart category labels"'); expect(html).not.toContain('<table'); expect(html).not.toContain('<button');
  });
  it('keeps controls and source summaries opt-in while axis titles and units remain visible', () => {
    const data = { ...sample(), summary: { sourceRows: 20, displayedRows: 4 } };
    const quiet = renderToStaticMarkup(<ChartRenderer data={data} />), explicit = renderToStaticMarkup(<ChartRenderer data={data} showControls />);
    expect(quiet).not.toContain('<button'); expect(quiet).not.toContain('20 source rows'); expect(quiet).toContain('Price · USD');
    expect(explicit).not.toContain('>Data</button>'); expect(explicit).not.toContain('4 shown from 20 source rows');
  });
});
