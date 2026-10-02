import { describe, expect, it } from 'vitest';
import { advancedChartExamples } from '../../src/shared/advanced-chart-examples.js';
import { ADVANCED_CHART_KINDS, chartDataSchema, type ChartData } from '../../src/shared/chart-contract.js';
import { validateView } from '../../src/shared/view-schemas.js';
import type { DatasetRecord } from '../../src/shared/types.js';
import { materializeDatasetView, parseDataset } from '../../src/server/rendering/datasets.js';
import { createInterpreter } from '../../src/server/rendering/interpreter.js';
import { preflightSourceRequirements } from '../../src/server/rendering/sources.js';
import { input, source, view } from './helpers.js';

const dataFor = (kind: keyof typeof advancedChartExamples) => structuredClone(advancedChartExamples[kind].data);
function dataset(rows: Record<string, unknown>[]): DatasetRecord { return { ...parseDataset({ name: 'Actual source records', rows, source }), id: 'advanced-source', sessionId: 'session-1', createdAt: '2026-09-14T00:00:00Z' }; }
function bound(kind: ChartData['kind'], original: DatasetRecord, binding: Record<string, unknown>, fields: Record<string, unknown> = {}): ChartData {
  return materializeDatasetView(view('chart', { kind, ...fields, binding: { datasetId: original.id, ...binding } }), [original]).data as ChartData;
}
function chart(kind: ChartData['kind'], points: unknown[], fields: Record<string, unknown> = {}) { return { kind, series: [{ name: 'Source', points }], ...fields }; }

describe('individual advanced chart contracts', () => {
  it.each(ADVANCED_CHART_KINDS)('%s has a valid source-labelled example and direct literal path', async kind => {
    const example = advancedChartExamples[kind];
    expect(validateView(example).source).toEqual(example.source);
    const request = input(); request.submission = { ...request.submission, templateHint: 'chart', data: example.data, source: example.source };
    const result = await createInterpreter().interpret(request);
    expect(result.view?.data.kind).toBe(kind);
  });
  it.each([
    ['candlestick', chart('candlestick', [{ x: 'Monday', y: 4, open: 3, high: 5, low: 2 }])],
    ['inverted OHLC', chart('ohlc', [{ x: 'Monday', y: 4, open: 3, high: 3, low: 2, close: 4 }])],
    ['inconsistent close', chart('ohlc', [{ x: 'Monday', y: 2, open: 3, high: 5, low: 1, close: 4 }])],
    ['missing bubble size', chart('bubble', [{ x: 2, y: 3 }])],
    ['zero bubble area', chart('bubble', [{ x: 2, y: 3, size: 0 }])],
    ['categorical bubble x', chart('bubble', [{ x: 'category', y: 3, size: 4 }])],
    ['invented violin from quartiles', chart('violin', [{ x: 'A', y: 3, low: 1, q1: 2, median: 3, q3: 4, high: 5 }])],
    ['degenerate violin without bandwidth', chart('violin', [{ x: 'A', y: 2, samples: [2, 2] }])],
    ['wrong violin median', chart('violin', [{ x: 'A', y: 8, samples: [1, 3, 5] }])],
    ['altered exact samples', chart('violin', [{ x: 'A', y: 2, samples: [1, 3], rawSamples: ['1.000', '9.000'] }])],
    ['radar without scales', chart('radar', [{ x: 'A', y: 3 }])],
    ['gauge without range', chart('gauge', [{ x: 'Progress', y: 3 }])],
    ['out-of-range gauge', chart('gauge', [{ x: 'Progress', y: 101 }], { gauge: { min: 0, max: 100 } })],
    ['unordered gauge thresholds', chart('gauge', [{ x: 'Progress', y: 30 }], { gauge: { min: 0, max: 100, thresholds: [{ value: 70 }, { value: 50 }] } })],
    ['negative pie values', chart('pie', [{ x: 'A', y: 3 }, { x: 'B', y: -2 }])],
    ['zero donut total', chart('donut', [{ x: 'A', y: 0 }])],
    ['growing funnel', chart('funnel', [{ x: 'Stage 1', y: 3 }, { x: 'Stage 2', y: 4 }])],
    ['invented waterfall total', chart('waterfall', [{ x: 'Start', y: 10, total: true }, { x: 'Change', y: -3 }, { x: 'End', y: 9, total: true }])],
    ['inconsistent subnormal-scale total', chart('waterfall', [{ x: 'Change', y: 1e-20 }, { x: 'End', y: 1e-30, total: true }])],
    ['overflowing axis range', chart('area', [{ x: 1, y: -1e308 }, { x: 2, y: 1e308 }])],
  ])('rejects %s rather than making a plausible plot', (_name, value) => expect(chartDataSchema.safeParse(value).success).toBe(false));
  it('accepts legitimate degenerate observations, zero categories and floating-point accumulation', () => {
    expect(chartDataSchema.safeParse(chart('violin', [{ x: 'constant', y: null, samples: [2, 2], bandwidth: .5 }])).success).toBe(true);
    expect(chartDataSchema.safeParse(chart('pie', [{ x: 'None', y: 0 }, { x: 'Present', y: 2 }])).success).toBe(true);
    expect(chartDataSchema.safeParse(chart('waterfall', [{ x: 'A', y: .1 }, { x: 'B', y: .2 }, { x: 'C', y: -.3 }, { x: 'Total', y: 0, total: true }])).success).toBe(true);
  });
  it('requires complete comparable radar attributes inside explicitly supplied scales', () => {
    const data = chartDataSchema.parse(dataFor('radar'));
    data.series[0].points.pop(); expect(chartDataSchema.safeParse(data).success).toBe(false);
    const outside = chartDataSchema.parse(dataFor('radar')); outside.series[0].points[0].y = 101; expect(chartDataSchema.safeParse(outside).success).toBe(false);
    const duplicate = chartDataSchema.parse(dataFor('radar')); duplicate.radarAxes![1].key = duplicate.radarAxes![0].key; expect(chartDataSchema.safeParse(duplicate).success).toBe(false);
  });
  it.each([
    { kind: 'network', nodes: [{ id: 'A' }], links: [{ source: 'A', target: 'missing' }] },
    { kind: 'network', nodes: [{ id: 'A' }, { id: 'A' }] },
    { kind: 'network', nodes: [{ id: 'A', x: 1, y: 2 }, { id: 'B' }] },
    { kind: 'network', nodes: [{ id: 'A', x: -1e308, y: 0 }, { id: 'B', x: 1e308, y: 1 }] },
    { kind: 'sankey', nodes: [{ id: 'A' }, { id: 'B' }], links: [{ source: 'A', target: 'B', value: -1 }] },
    { kind: 'sankey', nodes: [{ id: 'A' }, { id: 'B' }], links: [{ source: 'A', target: 'B' }] },
    { kind: 'sankey', nodes: [{ id: 'A' }, { id: 'B' }], links: [{ source: 'A', target: 'B', value: 1 }, { source: 'B', target: 'A', value: 1 }] },
    { kind: 'treemap', nodes: [{ id: 'A', parent: 'B', value: 2 }, { id: 'B', parent: 'A', value: 2 }] },
    { kind: 'treemap', nodes: [{ id: 'A', parent: 'missing', value: 2 }] },
    { kind: 'treemap', nodes: [{ id: 'A' }] },
    { kind: 'treemap', nodes: [{ id: 'A', value: 5 }, { id: 'B', parent: 'A', value: 4 }] },
    { kind: 'treemap', nodes: [{ id: 'A', value: -2 }] },
  ])('rejects invalid graph/flow/hierarchy records %#', data => expect(chartDataSchema.safeParse(data).success).toBe(false));
  it('allows actual flow imbalance without inventing balancing links or a fake node', () => {
    const parsed = chartDataSchema.parse({ kind: 'sankey', nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }], links: [{ source: 'A', target: 'B', value: 10 }, { source: 'B', target: 'C', value: 6 }] });
    expect(parsed.nodes).toHaveLength(3); expect(parsed.links).toHaveLength(2);
  });
  it('requires real closed non-self-intersecting geometry, not a region name lookup', () => {
    expect(chartDataSchema.safeParse({ kind: 'choropleth', regions: [{ id: 'Norway', value: 10 }] }).success).toBe(false);
    for (const ring of [[[0, 0], [1, 0], [1, 1], [0, 1]], [[0, 0], [1, 1], [0, 1], [1, 0], [0, 0]], [[0, 0], [1, 0], [2, 0], [0, 0]], [[170, 0], [-170, 0], [-170, 1], [170, 1], [170, 0]]]) {
      expect(chartDataSchema.safeParse({ kind: 'choropleth', regions: [{ id: 'A', value: 3, geometry: { type: 'Polygon', coordinates: [ring] } }] }).success).toBe(false);
    }
  });
  it('preserves polygon holes and multipolygons, rejecting holes outside the exterior', () => {
    const outer = [[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]], hole = [[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]];
    const value = { kind: 'choropleth', regions: [{ id: 'A', value: null, geometry: { type: 'MultiPolygon', coordinates: [[outer, hole], [[[6, 0], [7, 0], [7, 1], [6, 1], [6, 0]]]] } }] };
    expect(chartDataSchema.parse(value).regions![0].geometry!.coordinates).toEqual(value.regions[0].geometry.coordinates);
    value.regions[0].geometry.coordinates[0][1] = hole.map(([x, y]) => [x + 10, y]); expect(chartDataSchema.safeParse(value).success).toBe(false);
  });
  it('validates native graph and region payloads during source preflight', () => {
    for (const kind of ['network', 'treemap', 'sankey', 'choropleth'] as const) { const request = input(); request.submission = { ...request.submission, templateHint: 'chart', data: dataFor(kind) }; expect(() => preflightSourceRequirements(request)).not.toThrow(); }
    const invalid = input(); invalid.submission = { ...invalid.submission, templateHint: 'chart', data: { kind: 'choropleth', regions: [{ id: 'No boundary', value: 4 }] } }; expect(() => preflightSourceRequirements(invalid)).toThrow(/actual observations/);
  });
});

describe('authoritative advanced source bindings', () => {
  it.each(['candlestick', 'ohlc'] as const)('reconstructs %s OHLC from exact cells and retains raw decimals/source rows', kind => {
    const original = dataset([{ day: '2026-09-01', opening: '0.2000000000000000001', highest: '0.5000', lowest: '0.1000', closing: '0.3000000000000000001' }]);
    const binding = { x: 'day', financial: { open: 'opening', high: 'highest', low: 'lowest', close: 'closing' } };
    const result = bound(kind, original, binding, { series: [{ name: 'Fabrication', points: [{ x: 'wrong', y: 99, open: 98, high: 100, low: 97, close: 99 }] }] });
    expect(result.series[0].points[0]).toMatchObject({ x: '2026-09-01', y: .3, open: .2, high: .5, low: .1, close: .3, rawY: '0.3000000000000000001', raw: { open: '0.2000000000000000001', high: '0.5000', low: '0.1000', close: '0.3000000000000000001' }, sourceRows: [0] });
    expect(result.summary?.precisionNote).toContain('approximate'); expect(original.rows[0].opening).toBe('0.2000000000000000001');
    expect(() => bound(kind, original, { ...binding, financial: { ...binding.financial, high: 'unknown' } })).toThrow(/unknown source column/);
    expect(() => bound(kind, original, { ...binding, aggregation: 'mean' })).toThrow(/actual source observations/);
  });
  it('rejects missing/inconsistent OHLC instead of inferring prices', () => {
    for (const row of [{ day: 'A', open: 3, high: null, low: 2, close: 4 }, { day: 'A', open: 7, high: 5, low: 2, close: 4 }]) expect(() => bound('candlestick', dataset([row]), { x: 'day', financial: { open: 'open', high: 'high', low: 'low', close: 'close' } })).toThrow();
  });
  it('does not let IEEE-754 rounding hide invalid exact OHLC/range/weight values', () => {
    expect(() => bound('candlestick', dataset([{ day: 'A', open: '1.000000000000000001', high: '1.000000000000000000', low: '0.9', close: '1.0' }]), { x: 'day', financial: { open: 'open', high: 'high', low: 'low', close: 'close' } })).toThrow(/Exact OHLC/);
    expect(() => bound('gauge', dataset([{ n: '1.000000000000000001' }]), { y: ['n'], row: 0 }, { gauge: { min: 0, max: 1 } })).toThrow(/exact gauge/);
    expect(() => bound('pie', dataset([{ label: 'Small negative', value: '-1e-999' }, { label: 'Positive', value: '1' }]), { x: 'label', y: ['value'] })).toThrow(/nonnegative/);
    expect(() => bound('funnel', dataset([{ label: 'First', value: '1.000000000000000001' }, { label: 'Second', value: '1.000000000000000002' }]), { x: 'label', y: ['value'] })).toThrow(/non-increasing/);
  });
  it('checks exact hierarchy/waterfall totals without losing tiny source discrepancies', () => {
    const hierarchy = { id: 'id', parent: 'parent', value: 'value' };
    expect(() => bound('treemap', dataset([{ id: 'root', parent: null, value: '0.3' }, { id: 'A', parent: 'root', value: '0.1' }, { id: 'B', parent: 'root', value: '0.2' }]), { hierarchy })).not.toThrow();
    expect(() => bound('treemap', dataset([{ id: 'root', parent: null, value: '1.000000000000000002' }, { id: 'A', parent: 'root', value: '1.000000000000000001' }]), { hierarchy })).toThrow(/Exact treemap/);
    expect(() => bound('waterfall', dataset([{ n: '1.000000000000000001', total: false }, { n: '1.000000000000000002', total: true }]), { y: ['n'], total: 'total' })).toThrow(/Exact waterfall/);
  });
  it('keeps area gaps and explicitly requested downsampling with both real endpoints', () => {
    const original = dataset(Array.from({ length: 31 }, (_, index) => ({ index, value: index === 15 ? null : `${index}.000` })));
    const all = bound('area', original, { x: 'index', y: ['value'] }); expect(all.series[0].points[15]).toMatchObject({ y: null, rawY: null, sourceRows: [15] });
    const sampled = bound('area', original, { x: 'index', y: ['value'], downsample: { method: 'stride', maxPoints: 5 } });
    expect(sampled.series[0].points).toHaveLength(5); expect(sampled.series[0].points[0].sourceRows).toEqual([0]); expect(sampled.series[0].points.at(-1)!.sourceRows).toEqual([30]); expect(sampled.summary?.downsampled).toBe(true);
  });
  it('builds distribution samples from source groups without transcribing or manufacturing samples', () => {
    const original = dataset([{ cohort: 'A', duration: '1.000000000000001' }, { cohort: 'A', duration: '2.0000' }, { cohort: 'A', duration: null }, { cohort: 'B', duration: '3.2500' }, { cohort: 'B', duration: '4.7500' }]);
    const result = bound('violin', original, { distribution: { value: 'duration', groupBy: 'cohort' } });
    expect(result.series[0].points[0]).toMatchObject({ x: 'A', samples: [1.000000000000001, 2], rawSamples: ['1.000000000000001', '2.0000'], sourceRows: [0, 1] });
    expect(result.series[0].points[1]).toMatchObject({ x: 'B', samples: [3.25, 4.75], sourceRows: [3, 4] }); expect(result.summary).toMatchObject({ aggregation: 'violin', excludedRows: 1 });
    expect(() => bound('violin', dataset([{ cohort: 'A', value: 1 }]), { distribution: { value: 'value', groupBy: 'cohort' } })).toThrow(/at least two/);
  });
  it.each(['network', 'sankey'] as const)('materializes %s endpoints/weights solely from supplied edges', kind => {
    const original = dataset([{ from: 'Input', to: 'Process', amount: '1.2300' }, { from: 'Process', to: 'Output', amount: '0.7000' }]);
    const result = bound(kind, original, { edges: { source: 'from', target: 'to', value: 'amount' } });
    expect(result.nodes?.map(node => node.id)).toEqual(['Input', 'Process', 'Output']);
    expect(result.links?.[0]).toMatchObject({ source: 'Input', target: 'Process', value: 1.23, raw: { source: 'Input', target: 'Process', value: '1.2300' }, rawValues: ['1.2300'], sourceRows: [0] });
    expect(() => bound(kind, dataset([{ from: 'A', to: 'B', amount: -1 }]), { edges: { source: 'from', target: 'to', value: 'amount' } })).toThrow(/positive/);
  });
  it('requires explicit repeated-edge aggregation and preserves each contributing exact value', () => {
    const original = dataset([{ from: 'A', to: 'B', amount: '0.1000' }, { from: 'A', to: 'B', amount: '0.2000' }]), edges = { source: 'from', target: 'to', value: 'amount' };
    expect(() => bound('sankey', original, { edges })).toThrow(/explicit sum/);
    const result = bound('sankey', original, { edges, aggregation: 'sum' }); expect(result.links?.[0].value).toBeCloseTo(.3); expect(result.links?.[0].rawValues).toEqual(['0.1000', '0.2000']); expect(result.links?.[0].sourceRows).toEqual([0, 1]);
    const counted = bound('network', original, { edges: { source: 'from', target: 'to' }, aggregation: 'count' }); expect(counted.links?.[0].value).toBe(2);
  });
  it('does not label a derived count using an unrelated original numeric/source value', () => {
    const original = dataset([{ from: 'A', to: 'B', amount: '42.000' }]), result = bound('network', original, { edges: { source: 'from', target: 'to', value: 'amount' }, aggregation: 'count' });
    expect(result.links?.[0].value).toBe(1); expect(result.links?.[0].raw?.value).toBeUndefined(); expect(result.links?.[0].rawValues).toEqual(['42.000']);
    const regions = chartDataSchema.parse(dataFor('choropleth')).regions!, mapped = bound('choropleth', dataset([{ region: 'zone-a', value: '42.000' }]), { geography: { id: 'region', value: 'value' }, aggregation: 'count' }, { regions });
    expect(mapped.regions?.[0].value).toBe(1); expect(mapped.regions?.[0].raw?.value).toBeUndefined(); expect(mapped.regions?.[0].rawValues).toEqual(['42.000']);
  });
  it('keeps supplied hierarchy IDs/parents/leaf values and does not double-count parent totals', () => {
    const original = dataset([{ id: 'budget', parent: null, value: null }, { id: 'A', parent: 'budget', value: '12.5000' }, { id: 'B', parent: 'budget', value: '37.5000' }]);
    const result = bound('treemap', original, { hierarchy: { id: 'id', parent: 'parent', value: 'value' } });
    expect(result.nodes?.[0].value).toBeUndefined(); expect(result.nodes?.[1]).toMatchObject({ id: 'A', parent: 'budget', value: 12.5, raw: { id: 'A', parent: 'budget', value: '12.5000' }, sourceRows: [1] });
  });
  it('joins regions to existing supplied geometry, preserving no-data and refusing unmapped rows', () => {
    const regions = chartDataSchema.parse(dataFor('choropleth')).regions!, original = dataset([{ region: 'zone-a', observed: '24.000000000000001' }, { region: 'zone-b', observed: null }]);
    const before = structuredClone(regions), result = bound('choropleth', original, { geography: { id: 'region', value: 'observed' } }, { regions });
    expect(result.regions?.map(region => region.geometry)).toEqual(before.map(region => region.geometry));
    expect(result.regions?.[0]).toMatchObject({ value: 24, raw: { value: '24.000000000000001' }, sourceRows: [0] }); expect(result.regions?.[1].value).toBeNull(); expect(result.regions?.[2]).toMatchObject({ value: null, sourceRows: [] }); expect(regions).toEqual(before);
    expect(() => bound('choropleth', dataset([{ region: 'No polygon', observed: 2 }]), { geography: { id: 'region', value: 'observed' } }, { regions })).toThrow(/no supplied polygon/);
  });
  it('uses explicit radar scales, source bubble areas, gauge rows and waterfall total markers', () => {
    const radar = chartDataSchema.parse(dataFor('radar')), original = dataset(radar.series[0].points.map(point => ({ attribute: point.x, value: point.y })));
    expect(bound('radar', original, { x: 'attribute', y: ['value'] }, { radarAxes: radar.radarAxes }).series[0].points.map(point => point.y)).toEqual(radar.series[0].points.map(point => point.y));
    const bubbles = bound('bubble', dataset([{ a: '1.2000', b: '3.4000', size: '7.8000' }]), { x: 'a', y: ['b'], size: 'size' }); expect(bubbles.series[0].points[0]).toMatchObject({ x: 1.2, y: 3.4, size: 7.8, rawX: '1.2000', rawY: '3.4000', raw: { size: '7.8000' } });
    const gauges = dataset([{ completion: '10.0000' }, { completion: '80.0000' }]); expect(bound('gauge', gauges, { y: ['completion'], row: 1 }, { gauge: { min: 0, max: 100 } }).series[0].points[0]).toMatchObject({ y: 80, rawY: '80.0000', sourceRows: [1] });
    const contributions = dataset([{ stage: 'Start', change: '100.00', total: 'true' }, { stage: 'Loss', change: '-20.00', total: 'false' }, { stage: 'End', change: '80.00', total: 'true' }]); expect(bound('waterfall', contributions, { x: 'stage', y: ['change'], total: 'total' }).series[0].points.map(point => point.total)).toEqual([true, false, true]);
  });
  it.each(['pie', 'donut', 'funnel'] as const)('%s binds category/value rows without silent sums', kind => {
    const result = bound(kind, dataset([{ category: 'A', value: '12.3000' }, { category: 'B', value: '4.5000' }]), { x: 'category', y: ['value'] }); expect(result.series[0].points.map(point => point.rawY)).toEqual(['12.3000', '4.5000']); expect(result.summary?.aggregation).toBe('none');
  });
  it('preserves top-level opt-in display controls/source flags during materialization', () => {
    const original = dataset([{ n: 2 }]);
    const result = materializeDatasetView({ ...view('chart', { kind: 'area', binding: { datasetId: original.id, y: ['n'] } }), showControls: true, showSource: true }, [original]);
    expect(result.showControls).toBe(true); expect(result.showSource).toBe(true); expect(result.source).toEqual(source);
  });
  it('rejects structured mappings on incompatible legacy/table/number kinds', () => {
    const original = dataset([{ x: 1, y: 2, size: 4 }]);
    for (const template of ['chart', 'table', 'number'] as const) expect(() => materializeDatasetView(view(template, { ...(template === 'chart' ? { kind: 'line' } : {}), binding: { datasetId: original.id, y: ['y'], size: 'size' } }), [original])).toThrow(/mapping|mappings/);
  });
  it('retains bound geometry/scales through the interpreter source-reference fast path', async () => {
    const original = dataset([{ region: 'zone-a', value: '9.000' }]), regions = chartDataSchema.parse(dataFor('choropleth')).regions;
    const request = input({ datasets: [original] }); request.submission = { ...request.submission, templateHint: 'chart', datasetId: original.id, data: { kind: 'choropleth', binding: { geography: { id: 'region', value: 'value' } }, regions } };
    const result = await createInterpreter().interpret(request);
    expect(result.view?.data.regions).toMatchObject([{ id: 'zone-a', value: 9, raw: { value: '9.000' } }, { id: 'zone-b', value: null }, { id: 'zone-c', value: null }]);
  });
});
