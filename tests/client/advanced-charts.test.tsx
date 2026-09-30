import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { advancedChartExamples } from '../../src/shared/advanced-chart-examples';
import { ADVANCED_CHART_KINDS, chartDataSchema, type ChartData } from '../../src/shared/chart-contract';
import { AdvancedChartRenderer, advancedChartRows, choroplethPaths, pieArc, sankeyLayout, treemapLayout, violinDensity, waterfallSteps, wrapChartLabel } from '../../src/client/renderers/AdvancedCharts';
import { ChartRenderer } from '../../src/client/renderers/Chart';

const sample = (kind: keyof typeof advancedChartExamples) => chartDataSchema.parse(structuredClone(advancedChartExamples[kind].data));
describe('real single-visual advanced chart renderers', () => {
  it.each(ADVANCED_CHART_KINDS)('%s renders one finite SVG with keyboard-inspectable supplied marks', kind => {
    const data = sample(kind), html = renderToStaticMarkup(<ChartRenderer data={data} />);
    expect(html).toContain(`data-chart-kind="${kind}"`); expect(html.match(/<svg\b/g)).toHaveLength(1); expect(html).toContain('tabindex="0"'); expect(html).toContain('data-chart-mark=');
    expect(html).not.toMatch(/(?:NaN|Infinity|not supported|No advanced chart selected)/); expect(html).not.toContain('advanced-data-control'); expect(html).not.toContain('advanced-source-summary');
  });
  it('uses distinct actual financial marks for candle bodies versus OHLC ticks', () => {
    const candle = renderToStaticMarkup(<AdvancedChartRenderer data={sample('candlestick')} />), ohlc = renderToStaticMarkup(<AdvancedChartRenderer data={sample('ohlc')} />);
    expect(candle).toContain('data-chart-part="open-close-body"'); expect(candle).toContain('data-chart-part="doji"'); expect(candle).toContain('data-chart-part="high-low"');
    expect(ohlc).toContain('data-chart-part="open"'); expect(ohlc).toContain('data-chart-part="close"'); expect(ohlc).not.toContain('open-close-body');
  });
  it('does not bridge missing area observations with fabricated fill', () => {
    const data = chartDataSchema.parse({ kind: 'area', series: [{ name: 'Source', points: [{ x: 1, y: 2 }, { x: 2, y: null }, { x: 3, y: 6 }] }] });
    const html = renderToStaticMarkup(<AdvancedChartRenderer data={data} />); expect(html.match(/data-chart-mark="area-fill"/g)).toHaveLength(2); expect(html.match(/data-chart-mark="area"/g)).toHaveLength(2);
  });
  it('normalizes bubble area, not radius, to the third supplied dimension', () => {
    const data = chartDataSchema.parse({ kind: 'bubble', series: [{ name: 'Source', points: [{ x: 1, y: 2, size: 4 }, { x: 2, y: 3, size: 16 }] }] });
    const html = renderToStaticMarkup(<AdvancedChartRenderer data={data} />), radii = [...html.matchAll(/<circle[^>]*r="([\d.]+)"[^>]*data-chart-size=/g)].map(match => Number(match[1]));
    expect(radii).toHaveLength(2); expect(radii[1] ** 2 / radii[0] ** 2).toBeCloseTo(4);
  });
  it('keeps maximum-size bubbles inside the axis-label gutters at all coordinate extremes', () => {
    const data = chartDataSchema.parse({ kind: 'bubble', series: [{ name: 'Supplied extrema', points: [
      { x: 0, y: 0, size: 9, rawX: '0.000', rawY: '0.00000000000000000' },
      { x: 0, y: 10, size: 9 }, { x: 10, y: 0, size: 9 }, { x: 10, y: 10, size: 9 },
    ] }] }), original = structuredClone(data);
    const html = renderToStaticMarkup(<AdvancedChartRenderer data={data} />);
    const bubbles = [...html.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"[^>]*data-chart-size=/g)].map(match => ({ x: Number(match[1]), y: Number(match[2]), radius: Number(match[3]) }));
    const tickEnds = [...html.matchAll(/<text x="([\d.]+)" y="[\d.]+" text-anchor="end">/g)].map(match => Number(match[1]));
    const xTickBaselines = [...html.matchAll(/<text class="advanced-label " x="[\d.]+" y="([\d.]+)"/g)].map(match => Number(match[1]));
    expect(bubbles).toHaveLength(4); expect(tickEnds).toHaveLength(5); expect(xTickBaselines.length).toBeGreaterThan(1);
    for (const bubble of bubbles) {
      expect(bubble.x - bubble.radius).toBeGreaterThan(Math.max(...tickEnds) + 4);
      expect(bubble.y + bubble.radius).toBeLessThan(Math.min(...xTickBaselines) - 16 - 4);
    }
    expect(data).toEqual(original); expect(html).toContain('0.00000000000000000');
  });
  it('keeps precise OHLC and size source values in accessible labels and exact data', () => {
    const data = sample('candlestick'); data.series[0].points[0].raw = { open: '101.000000000000001', high: '111.0000', low: '98.000', close: '108.000000000000001' }; data.series[0].points[0].rawY = '108.000000000000001';
    const html = renderToStaticMarkup(<AdvancedChartRenderer data={data} />); expect(html).toContain('open 101.000000000000001'); expect(html).toContain('close 108.000000000000001');
    expect(advancedChartRows(data).rows[0]).toMatchObject({ Open: '101.000000000000001', Close: '108.000000000000001', Y: '108.000000000000001' });
  });
  it('keeps data controls and source summaries off unless explicitly requested', () => {
    const data: ChartData = { ...sample('area'), summary: { sourceRows: 100, displayedRows: 6, downsampled: true } };
    const quiet = renderToStaticMarkup(<AdvancedChartRenderer data={data} />), explicit = renderToStaticMarkup(<AdvancedChartRenderer data={data} showControls showSource />);
    expect(quiet).not.toContain('<button'); expect(quiet).not.toContain('100 source rows'); expect(explicit).toContain('>Data</button>'); expect(explicit).toContain('6 shown from 100 source rows'); expect(explicit).toContain('downsampled');
  });
  it('keeps full long categorical labels and wraps them without ellipsizing source identities', () => {
    const label = 'Completed customer onboarding and initial deployment review', data = sample('waterfall'); data.series[0].points[1].x = label;
    const html = renderToStaticMarkup(<AdvancedChartRenderer data={data} />); expect(html).toContain(`aria-label="${label}"`); expect(html).toContain('<tspan'); expect(html).not.toContain('…');
    expect(wrapChartLabel(label, 12).join(' ')).toBe(label); expect(wrapChartLabel('UnbrokenVeryLongIdentifier', 7).join('')).toBe('UnbrokenVeryLongIdentifier');
  });
  it('renders supplied apparent markup as text, never executable SVG/HTML', () => {
    const data = sample('network'); data.nodes![0].label = '<script>alert("unsafe")</script>';
    const html = renderToStaticMarkup(<AdvancedChartRenderer data={data} />); expect(html).not.toContain('<script>'); expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('onclick=');
  });
});

describe('meaningful chart geometry and source inspection', () => {
  it('computes a real KDE with a visible bimodal distribution and no extra observations', () => {
    const samples = [-3.2, -3.1, -3, -2.9, -2.8, 2.8, 2.9, 3, 3.1, 3.2], original = [...samples], result = violinDensity(samples, .4);
    const center = result.density.reduce((best, point) => Math.abs(point.value) < Math.abs(best.value) ? point : best), left = result.density.filter(point => point.value < -2), right = result.density.filter(point => point.value > 2);
    expect(Math.max(...left.map(point => point.density))).toBeGreaterThan(center.density * 10); expect(Math.max(...right.map(point => point.density))).toBeGreaterThan(center.density * 10); expect(result.median).toBe(0); expect(result.bandwidth).toBe(.4); expect(samples).toEqual(original);
    expect(result.density.every(point => Number.isFinite(point.value) && Number.isFinite(point.density) && point.density >= 0 && point.density <= 1)).toBe(true);
  });
  it('preserves every actual violin sample and its corresponding source row', () => {
    const data = chartDataSchema.parse({ kind: 'violin', series: [{ name: 'Measured duration', points: [{ x: 'A', y: null, samples: [1.2, 3.4], rawSamples: ['1.20000000000000001', '3.40000000000000001'], sourceRows: [4, 7] }] }] });
    expect(advancedChartRows(data).rows).toEqual([{ Series: 'Measured duration', Distribution: 'A', Value: '1.20000000000000001', 'Source row': 4 }, { Series: 'Measured duration', Distribution: 'A', Value: '3.40000000000000001', 'Source row': 7 }]);
  });
  it('partitions treemap root areas proportionally and derives parent totals from children once', () => {
    const result = treemapLayout([{ id: 'A', value: 25 }, { id: 'B', value: 75 }], 800, 400);
    expect(result[1].width * result[1].height / (result[0].width * result[0].height)).toBeCloseTo(3); expect(result.reduce((sum, rect) => sum + rect.width * rect.height, 0)).toBeCloseTo(800 * 400);
    const nested = treemapLayout(sample('treemap').nodes!, 800, 400); expect(nested.find(rect => rect.node.id === 'budget')?.value).toBe(120); expect(nested.find(rect => rect.node.id === 'build')?.value).toBe(80);
    expect(nested.every(rect => rect.width >= 0 && rect.height >= 0 && Number.isFinite(rect.x + rect.y + rect.width + rect.height))).toBe(true);
  });
  it('keeps Sankey ribbon thickness ratios equal to source flow ratios, including imbalances', () => {
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }], links = [{ source: 'A', target: 'B', value: 10 }, { source: 'B', target: 'C', value: 6 }], layout = sankeyLayout(nodes, links, 443, 500);
    expect(layout.links).toHaveLength(2); expect(layout.nodes).toHaveLength(3); expect(layout.links[0].thickness / layout.links[1].thickness).toBeCloseTo(10 / 6);
    const middle = layout.nodes.find(node => node.node.id === 'B')!; expect(middle.incoming).toBe(10); expect(middle.outgoing).toBe(6); expect(middle.height).toBeCloseTo(layout.links[0].thickness);
    expect(layout.links.every(link => !/NaN|Infinity/.test(link.path))).toBe(true);
  });
  it('keeps waterfall contributions floating on the true running balance and honours supplied totals', () => {
    const result = waterfallSteps(sample('waterfall').series[0].points);
    expect(result.map(step => [step.start, step.end])).toEqual([[0, 180], [180, 240], [240, 225], [225, 170], [0, 170]]);
  });
  it('draws full-circle pie/donut sectors with two finite arcs instead of a degenerate one', () => {
    expect(pieArc(100, 100, 80, 0, 0, Math.PI * 2).match(/ A/g)).toHaveLength(2); expect(pieArc(100, 100, 80, 40, 0, Math.PI * 2).match(/ A/g)).toHaveLength(4);
    const data = chartDataSchema.parse({ kind: 'donut', series: [{ name: 'One', points: [{ x: 'Only category', y: 4 }] }] }); expect(renderToStaticMarkup(<AdvancedChartRenderer data={data} />)).not.toMatch(/NaN|Infinity/);
  });
  it('projects only supplied geography and retains explicit holes/no-data markings', () => {
    const data = sample('choropleth'), paths = choroplethPaths(data, 443, 450);
    expect(paths.map(path => path.id)).toEqual(['zone-a', 'zone-b', 'zone-c']); expect(paths[0].path.match(/\b[ML]/g)).toHaveLength(5);
    const html = renderToStaticMarkup(<AdvancedChartRenderer data={data} />); expect(html).toContain('fill-rule="evenodd"'); expect(html).toContain('data-chart-value="no-data"'); expect(html).toContain('No data'); expect(html).not.toContain('<iframe');
    expect(advancedChartRows(data).rows[0].Geometry).toBe(JSON.stringify(data.regions![0].geometry));
  });
});
