import {distributionSchema} from './statistical-visuals.js';
import { geographyCodes } from './geography/codes.js';
import { emphasisSchema } from './emphasis.js';
import { z } from 'zod';

/** Browser-safe chart/source contracts. No dependency on the encompassing view schema. */
const short = z.string().max(500);
const label = z.string().min(1).max(200);
const identifier = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_.:-]+$/);
const finite = z.number().finite();
const positiveInteger = z.number().int().positive();
const pointLimit = 5000;
const rowLimit = 20_000;
export const cellSchema = z.union([z.string().max(20_000), finite, z.boolean(), z.null()]);
export type Cell = z.infer<typeof cellSchema>;

export const ADVANCED_BINDING_KEYS = ['financial', 'distribution', 'edges', 'hierarchy', 'geography', 'size', 'total'] as const;
export const datasetBindingSchema = z.object({
  datasetId: identifier,
  columns: z.array(label).min(1).max(64).optional(),
  x: label.optional(), y: z.array(label).min(1).max(4).optional(), groupBy: label.optional(),
  aggregation: z.enum(['none', 'sum', 'mean', 'min', 'max', 'count']).default('none'),
  downsample: z.object({ method: z.literal('stride'), maxPoints: positiveInteger.min(2).max(pointLimit) }).strict().optional(),
  histogram: z.object({ column: label, bins: positiveInteger.max(100).optional(), edges: z.array(finite).min(2).max(101).optional() }).strict()
    .superRefine((v, ctx) => {
      if (!v.bins && !v.edges) ctx.addIssue({ code: 'custom', message: 'Histogram requires explicit bins or edges' });
      if (v.bins && v.edges) ctx.addIssue({ code: 'custom', message: 'Choose bins or edges, not both' });
      if (v.edges?.some((edge, i) => i > 0 && edge <= v.edges![i - 1])) ctx.addIssue({ code: 'custom', message: 'Histogram edges must increase' });
    }).optional(),
  financial: z.object({ open: label, high: label, low: label, close: label }).strict().optional(),
  distribution: z.object({ value: label, groupBy: label.optional(), bandwidth: finite.positive().optional() }).strict().optional(),
  edges: z.object({ source: label, target: label, value: label.optional(), sourceLabel: label.optional(), targetLabel: label.optional() }).strict().optional(),
  hierarchy: z.object({ id: label, parent: label, value: label, label: label.optional() }).strict().optional(),
  geography: z.object({ id: label, value: label }).strict().optional(),
  size: label.optional(), total: label.optional(),
  offset: z.number().int().min(0).max(100_000).default(0),
  limit: positiveInteger.max(1000).optional(), row: z.number().int().min(0).max(100_000).optional(),
}).strict();
export type DatasetBinding = z.infer<typeof datasetBindingSchema>;
export const summarySchema = z.object({
  datasetId: identifier.optional(), sourceRows: z.number().int().min(0), displayedRows: z.number().int().min(0),
  aggregation: z.enum(['none', 'sum', 'mean', 'min', 'max', 'count', 'histogram', 'box', 'violin']).optional(),
  downsampled: z.boolean().optional(), precisionNote: short.optional(), excludedRows: z.number().int().min(0).optional(),
}).strict();
export type ChartSummary = z.infer<typeof summarySchema>;

const sourceRows = z.array(z.number().int().min(0).max(100_000)).max(rowLimit);
const rawCells = z.record(label, cellSchema).refine(value => Object.keys(value).length <= 16 && Object.keys(value).every(key => !['__proto__', 'prototype', 'constructor'].includes(key)), 'At most 16 non-reserved raw fields');
export const chartPointSchema = z.object({
  x: z.union([short, finite]), y: z.union([finite, short, z.null()]), value: finite.optional(),
  low: finite.optional(), q1: finite.optional(), median: finite.optional(), q3: finite.optional(), high: finite.optional(),
  open: finite.optional(), close: finite.optional(), size: finite.positive().optional(), total: z.boolean().optional(),
  samples: z.array(finite).min(2).max(rowLimit).optional(), rawSamples: z.array(cellSchema).min(2).max(rowLimit).optional(), bandwidth: finite.positive().optional(),
  sourceRows: sourceRows.optional(), rawX: cellSchema.optional(), rawY: cellSchema.optional(), raw: rawCells.optional(), rawValues: z.array(cellSchema).max(rowLimit).optional(),
}).strict();
export type ChartPoint = z.infer<typeof chartPointSchema>;

const nodeId = z.string().min(1).max(500);
export const chartNodeSchema = z.object({
  id: nodeId, label: short.optional(), parent: nodeId.optional(), value: finite.nonnegative().optional(),
  x: finite.optional(), y: finite.optional(), sourceRows: sourceRows.optional(), raw: rawCells.optional(),
}).strict();
export const chartLinkSchema = z.object({
  source: nodeId, target: nodeId, value: finite.positive().optional(), sourceRows: sourceRows.optional(), raw: rawCells.optional(), rawValues: z.array(cellSchema).max(rowLimit).optional(),
}).strict();
export type ChartNode = z.infer<typeof chartNodeSchema>;
export type ChartLink = z.infer<typeof chartLinkSchema>;

const position = z.tuple([finite.min(-180).max(180), finite.min(-90).max(90)]);
const ring = z.array(position).min(4).max(2000);
const polygon = z.array(ring).min(1).max(16);
const geometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: polygon }).strict(),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(polygon).min(1).max(40) }).strict(),
]);
export type ChartGeometry = z.infer<typeof geometrySchema>;
export const chartRegionSchema = z.object({
  id: nodeId, label: short.optional(), geometry: geometrySchema.optional(), countryCode:z.string().regex(/^(?:[A-Za-z]{2,3}|[A-Za-z]{2}-[A-Za-z]{2})$/).optional().describe('ISO alpha-2/alpha-3 country or US-XX state. Natural Earth 110m polygons plus small-country point fallbacks. Unknown codes are retained but omitted from the map with an explicit on-map warning naming excluded codes; source records remain available. Supply GeoJSON to display them.'), value: finite.nullable().optional(),
  sourceRows: sourceRows.optional(), raw: rawCells.optional(), rawValues: z.array(cellSchema).max(rowLimit).optional(),
}).strict().refine(v=>Boolean(v.geometry)!==Boolean(v.countryCode),'Supply exactly one of geometry or countryCode');
export type ChartRegion = z.infer<typeof chartRegionSchema>;
export const radarAxisSchema = z.object({ key: label, label: short.optional(), min: finite, max: finite, unit: z.string().max(80).optional() }).strict()
  .refine(value => value.max > value.min && Number.isFinite(value.max - value.min), 'Radar axis requires a finite increasing min/max range');
const gaugeSchema = z.object({
  min: finite, max: finite,
  thresholds: z.array(z.object({ value: finite, label: short.optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }).strict()).max(8).optional(),
}).strict().superRefine((value, ctx) => {
  if (!(value.max > value.min) || !Number.isFinite(value.max - value.min)) ctx.addIssue({ code: 'custom', message: 'Gauge requires a finite increasing min/max range' });
  if (value.thresholds?.some((threshold, index) => threshold.value < value.min || threshold.value > value.max || index > 0 && threshold.value <= value.thresholds![index - 1].value)) ctx.addIssue({ code: 'custom', message: 'Gauge thresholds must increase within the supplied range' });
});

export const ADVANCED_CHART_KINDS = ['candlestick', 'ohlc', 'area', 'violin', 'radar', 'network', 'treemap', 'sankey', 'bubble', 'choropleth', 'pie', 'donut', 'gauge', 'funnel', 'waterfall'] as const;
export const CHART_KINDS = ['line', 'bar', 'histogram', 'scatter', 'heatmap', 'box', ...ADVANCED_CHART_KINDS] as const;
export type AdvancedChartKind = typeof ADVANCED_CHART_KINDS[number];
export function isAdvancedChartKind(kind: string): kind is AdvancedChartKind { return (ADVANCED_CHART_KINDS as readonly string[]).includes(kind); }

/** A deterministic layout order, not additional source nodes/links. Undefined means a cycle. */
export function chartTopologicalOrder(nodes: ChartNode[], links: ChartLink[]): string[] | undefined {
  const counts = new Map(nodes.map(node => [node.id, 0]));
  const outgoing = new Map(nodes.map(node => [node.id, [] as string[]]));
  for (const link of links) { if (!counts.has(link.source) || !counts.has(link.target)) return; counts.set(link.target, counts.get(link.target)! + 1); outgoing.get(link.source)!.push(link.target); }
  const ready = nodes.filter(node => counts.get(node.id) === 0).map(node => node.id), result: string[] = [];
  for (let i = 0; i < ready.length; i++) { const id = ready[i]; result.push(id); for (const target of outgoing.get(id)!) { counts.set(target, counts.get(target)! - 1); if (counts.get(target) === 0) ready.push(target); } }
  return result.length === nodes.length ? result : undefined;
}
export function nearlyEqualChartValue(a: number, b: number, referenceMagnitude = 0): boolean { return a === b || Math.abs(a - b) <= Math.max(referenceMagnitude, Math.abs(a), Math.abs(b)) * Number.EPSILON * 32; }

const decimalPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
function decimalProjection(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !decimalPattern.test(value)) return;
  const projected = Number(value); return Number.isFinite(projected) ? projected : undefined;
}
function decimalParts(value: unknown) {
  if (decimalProjection(value) === undefined) return;
  const text = String(value), negative = text.startsWith('-'), [coefficient, exponent = '0'] = text.replace(/^-/, '').split(/e/i), [integer, fraction = ''] = coefficient.split('.');
  const fullDigits = `${integer}${fraction}`.replace(/^0+/, ''), scale = BigInt(exponent) - BigInt(fraction.length);
  return { sign: fullDigits ? negative ? -1 : 1 : 0, digits: fullDigits.replace(/0+$/, '') || '0', fullDigits: fullDigits || '0', scale, order: BigInt(fullDigits.length) + scale };
}
/** Compare supplied decimal lexemes without letting binary rounding hide a violated range. */
function compareDecimal(a: unknown, b: unknown): number | undefined {
  const left = decimalParts(a), right = decimalParts(b); if (!left || !right) return;
  if (left.sign !== right.sign) return Math.sign(left.sign - right.sign);
  if (!left.sign) return 0;
  if (left.order !== right.order) return (left.order < right.order ? -1 : 1) * left.sign;
  const length = Math.max(left.digits.length, right.digits.length), l = left.digits.padEnd(length, '0'), r = right.digits.padEnd(length, '0');
  return (l === r ? 0 : l < r ? -1 : 1) * left.sign;
}
/** Exact relation checks are bounded by the same 20,000-character source-cell budget. */
function decimalSum(values: unknown[]): string | undefined {
  const parts = values.map(decimalParts); if (parts.some(value => value === undefined)) return;
  const nonzero = parts.filter((value): value is NonNullable<typeof value> => value !== undefined && value.sign !== 0);
  if (!nonzero.length) return '0';
  const scale = nonzero.reduce((min, value) => value.scale < min ? value.scale : min, nonzero[0].scale), order = nonzero.reduce((max, value) => value.order > max ? value.order : max, nonzero[0].order);
  if (order - scale > 20_000n) return;
  const sum = nonzero.reduce((sum, value) => sum + BigInt(value.sign) * BigInt(value.fullDigits) * 10n ** (value.scale - scale), 0n);
  return `${sum}e${scale}`;
}

type Position = [number, number];
function cross(a: Position, b: Position, c: Position): number { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
function onSegment(a: Position, b: Position, p: Position): boolean { return cross(a, b, p) === 0 && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]); }
function intersects(a: Position, b: Position, c: Position, d: Position): boolean {
  if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.min(a[0], b[0]) > Math.max(c[0], d[0]) || Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.min(a[1], b[1]) > Math.max(c[1], d[1])) return false;
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0) || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}
function inside(point: Position, exterior: Position[]): boolean {
  let result = false;
  for (let i = 0, j = exterior.length - 2; i < exterior.length - 1; j = i++) {
    const a = exterior[i], b = exterior[j];
    if (onSegment(a, b, point)) return false;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}
function validatePolygon(rings: Position[][]): string | undefined {
  for (const coordinates of rings) {
    const first = coordinates[0], last = coordinates.at(-1)!;
    if (first[0] !== last[0] || first[1] !== last[1]) return 'GeoJSON polygon rings must be explicitly closed';
    let area = 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
      const a = coordinates[i], b = coordinates[i + 1];
      if (a[0] === b[0] && a[1] === b[1]) return 'Polygon edges must have nonzero length';
      if (Math.abs(b[0] - a[0]) > 180) return 'Split polygons at the antimeridian before supplying region geometry';
      area += cross(first, a, b);
      for (let j = i + 2; j < coordinates.length - 1; j++) if (!(i === 0 && j === coordinates.length - 2) && intersects(a, b, coordinates[j], coordinates[j + 1])) return 'Polygon rings must not self-intersect';
    }
    if (!area) return 'Polygon rings must enclose a nonzero area';
  }
  for (let hole = 1; hole < rings.length; hole++) {
    if (!inside(rings[hole][0], rings[0])) return 'Polygon holes must lie strictly inside the exterior ring';
    for (let other = 0; other < hole; other++) {
      for (let i = 0; i < rings[hole].length - 1; i++) for (let j = 0; j < rings[other].length - 1; j++) if (intersects(rings[hole][i], rings[hole][i + 1], rings[other][j], rings[other][j + 1])) return 'Polygon rings must not cross or touch';
      if (other > 0 && (inside(rings[hole][0], rings[other]) || inside(rings[other][0], rings[hole]))) return 'Polygon holes must not overlap';
    }
  }
}

export const chartDataSchema = z.object({
  distribution:distributionSchema.optional().describe('Supplied numeric line curves with shaded x-ranges and supplied low/high bands; no probability calculation. Ranges reference a series by name.'),
  emphasis:emphasisSchema.optional(),
  stacking:z.enum(['grouped','stacked','percent']).optional(),orientation:z.enum(['vertical','horizontal']).optional(),showValues:z.boolean().optional(),showTotals:z.boolean().optional(),legend:z.boolean().optional(),numberFormat:z.object({notation:z.enum(['standard','compact']).default('compact'),maximumFractionDigits:z.number().int().min(0).max(8).default(2),prefix:z.string().max(20).optional(),suffix:z.string().max(20).optional()}).strict().optional(),yMin:finite.optional(),yMax:finite.optional(),secondaryLabel:short.optional(),

  referenceLines:z.array(z.object({value:finite,label:short.optional(),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()}).strict()).max(8).optional().describe('Supplied y-axis targets for Cartesian line/bar/scatter/histogram/box charts.'),
  kind: z.enum(CHART_KINDS).default('line'),
  series: z.array(z.object({ name: label,stackGroup:identifier.optional().describe('Independent stack identifier within this axis and chart kind. Bar stack groups occupy side-by-side slots; lines remain independent.'),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),kind:z.enum(['bar','line','area']).optional(),axis:z.enum(['primary','secondary']).optional(),lineWidth:z.number().min(1).max(8).optional(),dashed:z.boolean().optional(), points: z.array(chartPointSchema).max(pointLimit) }).strict()).max(16).default([]),
  nodes: z.array(chartNodeSchema).max(200).optional(), links: z.array(chartLinkSchema).max(500).optional(), directed: z.boolean().optional(),
  regions: z.array(chartRegionSchema).max(250).optional(), territoryNote: z.boolean().optional().describe('Choropleth: show the note that dots mark approximate small-territory locations. Off by default.'), radarAxes: z.array(radarAxisSchema).min(3).max(16).optional(), gauge: gaugeSchema.optional(),
  xLabel: short.optional(), yLabel: short.optional(), unit: z.string().max(80).optional(), binding: datasetBindingSchema.optional(), summary: summarySchema.optional(),
}).strict().superRefine((data, ctx) => {
  const issue = (message: string, path: (string | number)[] = []) => ctx.addIssue({ code: 'custom', message, path });
  if(data.distribution){
   if(data.kind!=='line'||data.binding||data.stacking||data.orientation||data.yMin!==undefined||data.yMax!==undefined||data.referenceLines?.length||data.emphasis?.length||data.showValues||data.showTotals||data.numberFormat||data.secondaryLabel||data.series.some(s=>s.axis||s.kind||s.stackGroup))issue('Distribution overlays require supplied numeric unstacked line series without secondary axes or composable options');
   if(!data.series.length||data.series.some(s=>s.points.length<2||s.points.some((p,i)=>typeof p.x!=='number'||typeof p.y!=='number'||!Number.isFinite(p.y)||i>0&&Number(p.x)<=Number(s.points[i-1].x))))issue('Distribution curves require at least two finite numeric points, strictly increasing x');
   const overlays=[...data.distribution.ranges,...data.distribution.bands];
   if(new Set(overlays.map(x=>x.id)).size!==overlays.length)issue('Overlay IDs must be unique');
   for(const range of data.distribution.ranges){const s=data.series.find(s=>s.name===range.series);if(!s||range.from<Number(s.points[0]?.x)||range.to>Number(s.points.at(-1)?.x))issue('Ranges must name a supplied series and stay within its x extent');}
   for(const band of data.distribution.bands){const s=data.series.find(s=>s.name===band.series);if(!s||band.points.some((p,i)=>i>0&&p.x<=band.points[i-1].x)||band.points[0].x<Number(s?.points[0]?.x)||band.points.at(-1)!.x>Number(s?.points.at(-1)?.x))issue('Bands require a supplied series, increasing x within its extent');}
   if(data.distribution.bands.reduce((n,b)=>n+b.points.length,0)>5000)issue('At most 5000 total band points');
  }
  if(data.referenceLines?.length&&!['line','bar','scatter','histogram','box'].includes(data.kind))issue('Reference lines require a Cartesian line/bar/scatter/histogram/box chart');
  if(data.emphasis?.length&&!['line','bar','scatter','histogram','box','heatmap'].includes(data.kind))issue('Point emphasis supports Cartesian and heatmap charts');
  for(const e of data.emphasis??[])if(e.row!==undefined||e.column!==undefined||e.point===undefined||((!data.binding||data.series.length>0)&&!data.series.some(s=>(e.series===undefined||s.name===e.series)&&e.point!<s.points.length)))issue('Chart emphasis targets an existing series and zero-based point index',['emphasis']);
  if((data.stacking||data.orientation||data.showValues!==undefined||data.showTotals!==undefined||data.numberFormat||data.yMin!==undefined||data.yMax!==undefined||data.series.some(s=>s.stackGroup||s.kind||s.axis||s.color||s.lineWidth||s.dashed))&&!['bar','line','area'].includes(data.kind))issue('Composable axes/stacking/options apply to bar, line and area charts');
  if(data.series.some(s=>s.stackGroup&&(s.kind??data.kind)==='line'))issue('Line series cannot stack; omit stackGroup on lines');
  if(data.stacking==='percent'&&data.series.some(s=>(s.kind??data.kind)!=='line'&&s.points.some(p=>typeof p.y==='number'&&p.y<0)))issue('Percent stacks require non-negative values');
  if(data.yMin!==undefined&&data.yMax!==undefined&&data.yMin>=data.yMax)issue('yMax must exceed yMin');
  if((data.stacking==='stacked'||data.stacking==='percent'||data.series.some(s=>s.stackGroup))&&data.series.some(s=>new Set(s.points.map(p=>p.x)).size!==s.points.length))issue('Stacked series require unique x categories');
  const points = data.series.flatMap(series => series.points);
  const graphKind = ['network', 'sankey', 'treemap'].includes(data.kind);
  if (!data.binding && !points.length && !(graphKind && data.nodes?.length) && !(data.kind === 'choropleth' && data.regions?.length)) issue('Chart requires points, source geometry/structure, or a dataset binding');
  if (points.length > pointLimit) issue('Chart exceeds the total point limit');
  if (graphKind && points.length) issue('Graph and hierarchy charts use nodes/links, not an additional series plot', ['series']);
  if (!graphKind && data.nodes !== undefined) issue('Nodes belong to network, sankey or treemap charts', ['nodes']);
  if (!['network', 'sankey'].includes(data.kind) && data.links !== undefined) issue('Links belong to network or sankey charts', ['links']);
  if (data.kind !== 'choropleth' && data.regions !== undefined) issue('Regions belong to choropleth charts', ['regions']);
  if (data.kind === 'choropleth' && points.length) issue('Choropleths shade supplied regions, not a separate series plot', ['series']);
  if (data.kind !== 'network' && data.directed !== undefined) issue('directed is an optional network setting', ['directed']);
  if (data.kind !== 'radar' && data.radarAxes !== undefined) issue('radarAxes belong to radar charts', ['radarAxes']);
  if (data.kind !== 'gauge' && data.gauge !== undefined) issue('gauge range belongs to gauge charts', ['gauge']);

  for (const [si, series] of data.series.entries()) for (const [pi, point] of series.points.entries()) {
    const path = ['series', si, 'points', pi];
    if (data.kind !== 'heatmap' && typeof point.y === 'string') issue('This plot requires numeric y values', path);
    if (data.kind === 'heatmap' && point.value === undefined) issue('Heatmap requires a numeric cell value', path);
    if (['scatter', 'bubble'].includes(data.kind) && typeof point.x !== 'number') issue('Scatter/bubble requires numeric x values', path);
    if (data.kind === 'box') {
      const bounds = [point.low, point.q1, point.median, point.q3, point.high];
      if (bounds.some(v => v === undefined) || bounds.some((v, i) => i > 0 && v! < bounds[i - 1]!)) issue('Box requires ordered low/q1/median/q3/high', path);
    }
    if (data.kind === 'candlestick' || data.kind === 'ohlc') {
      if ([point.open, point.high, point.low, point.close].some(value => value === undefined) || point.low! > Math.min(point.open!, point.close!) || point.high! < Math.max(point.open!, point.close!) || point.high! < point.low!) issue('OHLC requires low ≤ open/close ≤ high', path);
      const source = (field: 'open' | 'high' | 'low' | 'close') => point.raw?.[field] !== undefined ? point.raw[field] : point[field];
      if ([compareDecimal(source('low'), source('open')), compareDecimal(source('low'), source('close')), compareDecimal(source('open'), source('high')), compareDecimal(source('close'), source('high'))].some(order => order !== undefined && order > 0)) issue('Exact OHLC source values violate low ≤ open/close ≤ high, even if numeric projections round together', path);
      if (point.y !== null && point.y !== point.close) issue('OHLC y must be close or null; supply the actual open/high/low/close fields', path);
    }
    if (data.kind === 'bubble' && (point.size === undefined || typeof point.y !== 'number')) issue('Bubble requires numeric x/y and positive size (circle area)', path);
    if (data.kind === 'violin') {
      if (!point.samples || point.samples.length < 2) issue('Violin requires at least two actual samples per distribution', path);
      else {
        const sorted = [...point.samples].sort((a, b) => a - b), middle = (sorted.length - 1) / 2;
        const median = sorted[Math.floor(middle)] / 2 + sorted[Math.ceil(middle)] / 2;
        if (point.y !== null && (typeof point.y !== 'number' || !nearlyEqualChartValue(point.y, median))) issue('Violin y must equal the sample median or be null', path);
        if (sorted[0] === sorted.at(-1) && !point.bandwidth) issue('Violin needs distinct samples or an explicit positive bandwidth', path);
        if (point.rawSamples && (point.rawSamples.length !== point.samples.length || point.rawSamples.some((raw, i) => decimalProjection(raw) !== point.samples![i]))) issue('rawSamples must preserve the numeric projections in sample order', path);
      }
    }
    if (isAdvancedChartKind(data.kind)) {
      if (point.rawY !== undefined && typeof point.y === 'number' && decimalProjection(point.rawY) !== point.y) issue('rawY must preserve the numeric projection, not a different value', path);
      if (data.kind === 'bubble' && point.rawX !== undefined && decimalProjection(point.rawX) !== point.x) issue('Bubble rawX must preserve its numeric coordinate', path);
      for (const field of ['open', 'high', 'low', 'close', 'size', 'value'] as const) if (point.raw?.[field] !== undefined && decimalProjection(point.raw[field]) !== point[field]) issue(`Raw ${field} must preserve its numeric projection`, path);
      if (point.rawValues && point.sourceRows && point.rawValues.length !== point.sourceRows.length || point.samples && point.sourceRows && point.samples.length !== point.sourceRows.length) issue('Raw observations and sourceRows must remain aligned', path);
    }
  }
  if (isAdvancedChartKind(data.kind)) {
    let lo = Infinity, hi = -Infinity, xLo = Infinity, xHi = -Infinity;
    for (const point of points) {
      for (const value of [point.y, point.low, point.high, point.open, point.close]) if (typeof value === 'number') { lo = Math.min(lo, value); hi = Math.max(hi, value); }
      for (const value of point.samples ?? []) { lo = Math.min(lo, value); hi = Math.max(hi, value); }
      if (typeof point.x === 'number') { xLo = Math.min(xLo, point.x); xHi = Math.max(xHi, point.x); }
    }
    if (lo !== Infinity && !Number.isFinite(hi - lo)) issue('The numeric domain exceeds finite plotting precision; use exact source values in a table');
    if (xLo !== Infinity && !Number.isFinite(xHi - xLo)) issue('The x domain exceeds finite plotting precision');
  }
  if (data.kind === 'violin' && (points.length > 50 || points.reduce((count, point) => count + (point.samples?.length ?? 0), 0) > rowLimit)) issue('Violin supports at most 50 distributions and 20,000 total actual samples');
  if (['pie', 'donut', 'funnel', 'gauge', 'waterfall', 'candlestick', 'ohlc'].includes(data.kind) && data.series.length > 1) issue('This kind is one source series, not a composite chart', ['series']);
  if (['pie', 'donut', 'funnel'].includes(data.kind) && points.length) {
    if (points.some(point => typeof point.y !== 'number' || point.y < 0 || compareDecimal(point.rawY !== undefined ? point.rawY : point.y, 0) === -1)) issue('Proportions and funnel stages require nonnegative numeric values');
    const total = points.reduce((sum, point) => sum + (typeof point.y === 'number' ? point.y : 0), 0);
    if (!(total > 0) || !Number.isFinite(total)) issue('Proportions need a positive finite total');
    if (points.length > 50) issue('A proportion or funnel chart supports at most 50 categories');
    if (data.kind === 'funnel' && points.some((point, i) => i > 0 && ((point.y as number) > (points[i - 1].y as number) || compareDecimal(point.rawY ?? point.y, points[i - 1].rawY ?? points[i - 1].y) === 1))) issue('Funnel stages must be supplied in non-increasing order; use bars for values that grow');
  }
  if (data.kind === 'waterfall') {
    let running = 0, magnitude = 0, low = 0, high = 0, exactRunning: string | undefined = '0';
    for (const [index, point] of points.entries()) {
      if (typeof point.y !== 'number') { issue('Waterfall requires numeric contributions/totals'); continue; }
      magnitude = Math.max(magnitude, Math.abs(point.y), Math.abs(running));
      if (point.total) {
        if (index && !nearlyEqualChartValue(point.y, running, magnitude)) issue('A supplied waterfall total must equal the accumulated contributions', ['series', 0, 'points', index]);
        if (index && typeof point.rawY === 'string' && (exactRunning === undefined || compareDecimal(point.rawY, exactRunning) !== 0)) issue('Exact waterfall totals must equal exact source contributions; use compatible decimal scales or omit a total row', ['series', 0, 'points', index]);
        running = point.y; exactRunning = String(point.rawY ?? point.y);
      } else { running += point.y; exactRunning = exactRunning === undefined ? undefined : decimalSum([exactRunning, point.rawY ?? point.y]); }
      low = Math.min(low, running); high = Math.max(high, running);
      if (!Number.isFinite(running)) issue('Waterfall cumulative total exceeds finite plot precision');
    }
    if (!Number.isFinite(high - low)) issue('Waterfall cumulative range exceeds finite plot precision');
  }
  if (data.kind === 'radar') {
    if (!data.radarAxes) issue('Radar requires explicit axes with min/max scales', ['radarAxes']);
    else {
      const keys = data.radarAxes.map(axis => axis.key);
      if (new Set(keys).size !== keys.length) issue('Radar axis keys must be unique', ['radarAxes']);
      for (const [index, series] of data.series.entries()) {
        if (series.points.length !== keys.length || new Set(series.points.map(point => point.x)).size !== keys.length || series.points.some(point => !keys.includes(String(point.x)))) issue('Each radar series must provide exactly one value for every axis', ['series', index]);
        for (const point of series.points) { const axis = data.radarAxes.find(axis => axis.key === point.x), value = point.rawY !== undefined ? point.rawY : point.y; if (axis && (typeof point.y !== 'number' || point.y < axis.min || point.y > axis.max || compareDecimal(value, axis.min) === -1 || compareDecimal(value, axis.max) === 1)) issue('Radar values must lie within their explicitly supplied axis ranges', ['series', index]); }
      }
    }
  }
  if (data.kind === 'gauge') {
    if (!data.gauge) issue('Gauge requires an explicit min/max range', ['gauge']);
    if (points.length && (points.length !== 1 || typeof points[0].y !== 'number' || data.gauge && (points[0].y < data.gauge.min || points[0].y > data.gauge.max))) issue('Gauge requires one numeric value within its supplied range');
    if (data.gauge && points.length === 1) { const value = points[0].rawY !== undefined ? points[0].rawY : points[0].y; if (compareDecimal(value, data.gauge.min) === -1 || compareDecimal(value, data.gauge.max) === 1) issue('The exact gauge source value lies outside its supplied range'); }
  }

  if (graphKind && data.nodes) {
    const nodes = data.nodes, links = data.links ?? [], ids = new Set(nodes.map(node => node.id)), byId = new Map(nodes.map(node => [node.id, node]));
    if (ids.size !== nodes.length) issue('Node IDs must be unique', ['nodes']);
    for (const [index, node] of nodes.entries()) if (node.value !== undefined && node.raw?.value !== undefined && (decimalProjection(node.raw.value) !== node.value || compareDecimal(node.raw.value, 0) === -1)) issue('Raw node weights must project to the supplied nonnegative value', ['nodes', index]);
    if (links.some(link => !ids.has(link.source) || !ids.has(link.target))) issue('Every link endpoint must reference an existing supplied node', ['links']);
    for (const [index, link] of links.entries()) {
      if (link.raw?.value !== undefined && decimalProjection(link.raw.value) !== link.value) issue('Raw link weights must preserve the numeric projection', ['links', index]);
      if (link.rawValues && link.sourceRows && link.rawValues.length !== link.sourceRows.length) issue('Raw link observations and sourceRows must remain aligned', ['links', index]);
    }
    if (new Set(links.map(link => JSON.stringify([link.source, link.target]))).size !== links.length) issue('Duplicate links need explicit source aggregation', ['links']);
    if (data.kind === 'network') {
      const located = nodes.filter(node => node.x !== undefined || node.y !== undefined);
      if (located.length && (located.length !== nodes.length || located.some(node => node.x === undefined || node.y === undefined))) issue('Supply x/y for every network node, or omit coordinates for deterministic layout');
      for (const coordinate of ['x', 'y'] as const) { const values = located.map(node => node[coordinate]).filter((value): value is number => value !== undefined); if (values.length && !Number.isFinite(Math.max(...values) - Math.min(...values))) issue('Supplied network coordinates exceed finite layout precision'); }
      if (nodes.some(node => node.parent !== undefined)) issue('Network relationships belong in links, not hierarchy parent fields');
    }
    if (data.kind === 'sankey') {
      if (nodes.some(node => node.parent !== undefined || node.x !== undefined || node.y !== undefined || node.value !== undefined)) issue('Sankey node positions/throughputs are derived from the supplied links');
      if ((!data.binding && !links.length) || links.some(link => link.value === undefined || link.source === link.target)) issue('Sankey requires positive weighted links without self-links', ['links']);
      if (!chartTopologicalOrder(nodes, links)) issue('Sankey requires an acyclic directed flow graph', ['links']);
      if (nodes.some(node => !links.some(link => link.source === node.id || link.target === node.id))) issue('Every Sankey node must participate in a supplied flow');
      for (const node of nodes) for (const field of ['source', 'target'] as const) if (!Number.isFinite(links.filter(link => link[field] === node.id).reduce((sum, link) => sum + (link.value ?? 0), 0))) issue('Sankey throughput exceeds finite plot precision');
    }
    if (data.kind === 'treemap') {
      if (nodes.some(node => node.parent !== undefined && (!ids.has(node.parent) || node.parent === node.id) || node.x !== undefined || node.y !== undefined)) issue('Treemap requires existing parent IDs and derives area positions from values');
      const children = (id: string) => nodes.filter(node => node.parent === id), visiting = new Set<string>(), done = new Map<string, number>(), exactTotals = new Map<string, string | undefined>();
      const sum = (node: ChartNode, depth: number): number => {
        if (done.has(node.id)) return done.get(node.id)!;
        if (visiting.has(node.id) || depth > 12) { issue('Treemap hierarchy must be acyclic and at most 12 levels deep'); return 0; }
        visiting.add(node.id);
        const nested = children(node.id), value = nested.length ? nested.reduce((total, child) => total + sum(child, depth + 1), 0) : node.value;
        const exactTotal = nested.length ? decimalSum(nested.map(child => exactTotals.get(child.id))) : node.value === undefined ? undefined : String(node.raw?.value ?? node.value);
        exactTotals.set(node.id, exactTotal);
        if (value === undefined) issue('Every treemap leaf needs a nonnegative value');
        else if (!Number.isFinite(value)) issue('Treemap total exceeds finite plot precision');
        else if (nested.length && node.value !== undefined && !nearlyEqualChartValue(node.value, value)) issue('Supplied treemap parent totals must equal their children; omit parent values to derive them');
        if (nested.length && typeof node.raw?.value === 'string' && (exactTotal === undefined || compareDecimal(node.raw.value, exactTotal) !== 0)) issue('Exact treemap parent totals must equal exact child values; omit parent totals to derive them');
        visiting.delete(node.id); done.set(node.id, value ?? 0); return value ?? 0;
      };
      nodes.forEach(node => sum(node, 1));
      const total = nodes.filter(node => !node.parent || !byId.has(node.parent)).reduce((value, node) => value + (done.get(node.id) ?? 0), 0);
      if (nodes.length && (!(total > 0) || !Number.isFinite(total))) issue('Treemap needs a positive finite root total');
    }
  }
  if (data.kind === 'choropleth') {
    if (!data.regions?.length) issue('Choropleth requires regions with geometry or a supported countryCode; place names are not geocoded', ['regions']);
    else {
      if (new Set(data.regions.map(region => region.id)).size !== data.regions.length) issue('Region IDs must be unique', ['regions']);
      const countryKeys=data.regions.flatMap(region=>region.countryCode&&geographyCodes[region.countryCode.toUpperCase()]?[geographyCodes[region.countryCode.toUpperCase()]]:[]);if(new Set(countryKeys).size!==countryKeys.length)issue('Country code aliases must not repeat the same built-in region',['regions']);
      const values = data.regions.flatMap(region => typeof region.value === 'number' ? [region.value] : []);
      if (values.length && !Number.isFinite(Math.max(...values) - Math.min(...values))) issue('Region values exceed finite color-scale precision');
      let vertices = 0;
      for (const [index, region] of data.regions.entries()) {
        if (!data.binding && region.value === undefined) issue('Each region needs its supplied value or explicit null for no data', ['regions', index, 'value']);
        if (region.raw?.value !== undefined && (region.raw.value === null ? region.value !== null : decimalProjection(region.raw.value) !== region.value)) issue('Raw region values must preserve numeric projections or explicit no-data', ['regions', index]);
        if (region.rawValues && region.sourceRows && region.rawValues.length !== region.sourceRows.length) issue('Raw region observations and sourceRows must remain aligned', ['regions', index]);
        if(!region.geometry)continue; // Licensed built-in boundaries resolve in the browser, never inflate caller payload.
        const polygons = region.geometry.type === 'Polygon' ? [region.geometry.coordinates] : region.geometry.coordinates;
        for (const coordinates of polygons) { vertices += coordinates.reduce((total, ring) => total + ring.length, 0); if (vertices <= 20_000) { const error = validatePolygon(coordinates); if (error) issue(error, ['regions', index, 'geometry']); } }
      }
      if (vertices > 20_000) issue('Choropleth geometry exceeds 20,000 total vertices; supply a simplified boundary source');
    }
  }
});
export type ChartData = z.infer<typeof chartDataSchema>;
