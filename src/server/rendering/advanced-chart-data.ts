import { ADVANCED_BINDING_KEYS, chartDataSchema, isAdvancedChartKind, type Cell, type ChartData, type ChartLink, type ChartNode, type ChartPoint, type ChartRegion, type DatasetBinding } from '../../shared/chart-contract.js';
import type { DatasetRecord } from '../../shared/types.js';
import { RenderingError } from './errors.js';

type Projection = (value: unknown) => number | null;
function fail(message: string): never { throw new RenderingError('INVALID_BINDING', message); }
export function advancedBindingColumns(binding: DatasetBinding): string[] {
  return ADVANCED_BINDING_KEYS.flatMap(key => {
    const value = binding[key];
    return typeof value === 'string' ? [value] : value ? Object.values(value).filter((column): column is string => typeof column === 'string') : [];
  });
}
export function hasAdvancedBinding(binding: DatasetBinding): boolean { return ADVANCED_BINDING_KEYS.some(key => binding[key] !== undefined); }
function cell(row: Record<string, unknown>, column: string): Cell { return (row[column] ?? null) as Cell; }
function sourceId(value: Cell, field = 'category'): string {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).length === 0 || String(value).length > 500) fail(`The ${field} column needs nonempty text/numeric IDs of at most 500 characters.`);
  return String(value);
}
function sourceX(value: Cell): string | number {
  if (value === null) fail('Selected x column contains missing values; supply complete source coordinates.');
  if (typeof value === 'string' && value.length > 500) fail('Chart labels are limited to 500 characters; display longer source text in a table.');
  return typeof value === 'boolean' ? String(value) : value;
}
function sourceNumber(value: Cell, projection: Projection, nullable = false): number | null {
  if (value === null && nullable) return null;
  const number = projection(value);
  if (number === null) fail('The selected chart column needs finite numeric source values; missing values are not zero.');
  return number;
}
function aggregate(cells: Cell[], method: DatasetBinding['aggregation'], projection: Projection): number | null {
  const present = cells.filter(value => value !== null);
  if (method === 'count') return present.length;
  if (!present.length) return null;
  const values = present.map(value => sourceNumber(value, projection)!);
  if (method === 'none') { if (values.length !== 1) fail('Repeated categories need an explicit aggregation.'); return values[0]; }
  if (method === 'min') return Math.min(...values);
  if (method === 'max') return Math.max(...values);
  let sum = 0, correction = 0;
  for (const value of values) { const delta = value - correction, next = sum + delta; correction = (next - sum) - delta; sum = next; }
  const result = method === 'mean' ? sum / values.length : sum;
  if (!Number.isFinite(result)) fail('Source aggregation exceeds finite plot precision; display exact source values in a table.');
  return result;
}
function noGenericSelection(binding: DatasetBinding): void {
  if (binding.x || binding.y || binding.groupBy || binding.row !== undefined) fail('This structured chart uses its explicit financial/distribution/edges/hierarchy/geography mapping, not x/y/groupBy/row selections.');
}
function noReduction(binding: DatasetBinding): void {
  if (binding.aggregation !== 'none' || binding.downsample) fail('This chart requires the actual source observations without aggregation or downsampling.');
}
function genericSeries(chart: ChartData, dataset: DatasetRecord, binding: DatasetBinding, projection: Projection): ChartData['series'] {
  if (!binding.y?.length) fail('Chart requires explicit numeric y column bindings.');
  if (binding.groupBy && binding.aggregation === 'none') fail('groupBy requires explicit aggregation.');
  if (chart.kind === 'radar' && !binding.x) fail('Radar requires an x column containing the supplied axis keys.');
  if (chart.kind === 'bubble' && (!binding.x || binding.y.length !== 1 || !binding.size || binding.aggregation !== 'none' || binding.groupBy)) fail('Bubble requires x, one y column and a positive size column, without aggregation.');
  if (chart.kind === 'waterfall' && binding.aggregation !== 'none') fail('Waterfall uses explicitly ordered source contributions/totals, not grouped aggregation.');
  return binding.y.map(column => {
    let points: ChartPoint[];
    if (binding.aggregation !== 'none') {
      const groups = new Map<string, { x: string | number; values: Cell[]; rows: number[] }>(), groupColumn = binding.groupBy ?? binding.x;
      dataset.rows.forEach((row, index) => {
        const x = groupColumn ? sourceX(cell(row, groupColumn)) : column, key = JSON.stringify(x), group = groups.get(key) ?? { x, values: [], rows: [] };
        group.values.push(cell(row, column)); group.rows.push(index); groups.set(key, group);
      });
      points = [...groups.values()].map(group => ({ x: group.x, y: aggregate(group.values, binding.aggregation, projection), rawValues: group.values, sourceRows: group.rows }));
    } else points = dataset.rows.map((row, index) => {
      const rawX = binding.x ? cell(row, binding.x) : index, rawY = cell(row, column);
      const point: ChartPoint = { x: chart.kind === 'bubble' ? sourceNumber(rawX, projection)! : sourceX(rawX), y: sourceNumber(rawY, projection, chart.kind === 'area'), rawX, rawY, sourceRows: [index] };
      if (binding.size) { const size = cell(row, binding.size); point.size = sourceNumber(size, projection)!; point.raw = { size }; }
      if (binding.total) {
        const total = cell(row, binding.total);
        if (typeof total !== 'boolean' && total !== 'true' && total !== 'false') fail('Waterfall total markers must be booleans or the exact CSV strings true/false.');
        point.total = total === true || total === 'true'; point.raw = { total };
      }
      return point;
    });
    return { name: column, points };
  });
}

/** Every plotted quantity is projected from stored cells; layout is exclusively a client concern. */
export function materializeAdvancedChartData(chart: ChartData, dataset: DatasetRecord, binding: DatasetBinding, projection: Projection, precisionNote?: string): ChartData | undefined {
  if (!isAdvancedChartKind(chart.kind)) return;
  if (binding.columns || binding.offset || binding.limit || binding.histogram) fail('Advanced charts do not silently truncate rows or accept unrelated table/histogram transformations.');
  if (binding.row !== undefined && chart.kind !== 'gauge') fail('Only a gauge can select a single explicit source row; other charts retain all requested observations.');
  const allowed: Partial<Record<ChartData['kind'], readonly typeof ADVANCED_BINDING_KEYS[number][]>> = {
    candlestick: ['financial'], ohlc: ['financial'], violin: ['distribution'], network: ['edges'], sankey: ['edges'], treemap: ['hierarchy'], choropleth: ['geography'], bubble: ['size'], waterfall: ['total'],
  };
  if (ADVANCED_BINDING_KEYS.some(key => binding[key] !== undefined && !allowed[chart.kind]?.includes(key))) fail('A structured source mapping was supplied for the wrong chart kind.');
  if (advancedBindingColumns(binding).some(column => !dataset.columns.includes(column))) fail('Binding refers to an unknown source column.');
  let series: ChartData['series'] = [], nodes: ChartNode[] | undefined, links: ChartLink[] | undefined, regions: ChartRegion[] | undefined;
  let excludedRows = 0, displayedRows = 0, originalPoints = 0;

  if (chart.kind === 'candlestick' || chart.kind === 'ohlc') {
    if (!binding.financial || !binding.x || binding.y || binding.groupBy) fail('OHLC requires x and financial {open, high, low, close} source columns.');
    noReduction(binding);
    const fields = binding.financial;
    if (new Set(Object.values(fields)).size !== 4) fail('Open/high/low/close must select four distinct source columns.');
    series = [{ name: binding.y?.[0] ?? fields.close, points: dataset.rows.map((row, index) => {
      const rawX = cell(row, binding.x!), raw = Object.fromEntries(Object.entries(fields).map(([key, column]) => [key, cell(row, column)]));
      const open = sourceNumber(raw.open, projection)!, high = sourceNumber(raw.high, projection)!, low = sourceNumber(raw.low, projection)!, close = sourceNumber(raw.close, projection)!;
      return { x: sourceX(rawX), y: close, open, high, low, close, rawX, rawY: raw.close, raw, sourceRows: [index] };
    }) }];
  } else if (chart.kind === 'violin') {
    if (!binding.distribution) fail('Violin requires distribution {value, groupBy?, bandwidth?} mapped to actual source observations.');
    noGenericSelection(binding); noReduction(binding);
    const fields = binding.distribution, groups = new Map<string, { x: string | number; values: number[]; raw: Cell[]; rows: number[] }>();
    dataset.rows.forEach((row, index) => {
      const raw = cell(row, fields.value);
      if (raw === null) { excludedRows++; return; }
      const x = fields.groupBy ? sourceX(cell(row, fields.groupBy)) : fields.value, key = JSON.stringify(x), group = groups.get(key) ?? { x, values: [], raw: [], rows: [] };
      group.values.push(sourceNumber(raw, projection)!); group.raw.push(raw); group.rows.push(index); groups.set(key, group);
    });
    series = [{ name: fields.value, points: [...groups.values()].map(group => {
      if (group.values.length < 2) fail('Every violin group needs at least two nonmissing actual source observations.');
      const sorted = [...group.values].sort((a, b) => a - b), middle = (sorted.length - 1) / 2;
      return { x: group.x, y: sorted[Math.floor(middle)] / 2 + sorted[Math.ceil(middle)] / 2, samples: group.values, rawSamples: group.raw, sourceRows: group.rows, ...(fields.bandwidth ? { bandwidth: fields.bandwidth } : {}) };
    }) }];
  } else if (chart.kind === 'network' || chart.kind === 'sankey') {
    if (!binding.edges) fail('Network/Sankey requires edges {source, target, value?} column mappings.');
    noGenericSelection(binding);
    if (binding.downsample || !['none', 'sum', 'count'].includes(binding.aggregation)) fail('Edges support only unreduced links or explicit sum/count aggregation; no implicit edge omission.');
    const fields = binding.edges;
    if ((chart.kind === 'sankey' || binding.aggregation === 'sum') && !fields.value && binding.aggregation !== 'count') fail('Weighted flows require an actual value column or an explicit count of source edges.');
    const byNode = new Map<string, ChartNode>(), byEdge = new Map<string, { source: string; target: string; values: Cell[]; rows: number[]; raw: Record<string, Cell> }>();
    dataset.rows.forEach((row, index) => {
      const rawSource = cell(row, fields.source), rawTarget = cell(row, fields.target), source = sourceId(rawSource, 'edge source'), target = sourceId(rawTarget, 'edge target');
      for (const [id, raw, labelColumn] of [[source, rawSource, fields.sourceLabel], [target, rawTarget, fields.targetLabel]] as const) {
        const rawLabel = labelColumn ? cell(row, labelColumn) : undefined, label = rawLabel === undefined ? undefined : sourceId(rawLabel, 'node label');
        const node = byNode.get(id);
        if (node && node.label !== label) fail('The same node ID has conflicting source labels.');
        if (node) { if (node.sourceRows!.at(-1) !== index) node.sourceRows!.push(index); }
        else byNode.set(id, { id, ...(label !== undefined ? { label } : {}), raw: { id: raw, ...(rawLabel !== undefined ? { label: rawLabel } : {}) }, sourceRows: [index] });
      }
      const key = JSON.stringify([source, target]);
      if (byEdge.has(key) && binding.aggregation === 'none') fail('Duplicate edge pairs need explicit sum/count aggregation.');
      const group = byEdge.get(key) ?? { source, target, values: [], rows: [], raw: { source: rawSource, target: rawTarget } };
      if (fields.value) { const value = cell(row, fields.value); if (binding.aggregation !== 'count' && !(sourceNumber(value, projection)! > 0)) fail('Flow/edge weights must be strictly positive, never missing or negative.'); group.values.push(value); }
      else group.values.push(1); // Explicit count means one real source record; unweighted edges omit a plotted weight.
      group.rows.push(index); byEdge.set(key, group);
    });
    nodes = [...byNode.values()];
    links = [...byEdge.values()].map(group => ({ source: group.source, target: group.target, ...(fields.value || binding.aggregation === 'count' ? { value: aggregate(group.values, binding.aggregation, projection)! } : {}),
      raw: { ...group.raw, ...(fields.value && group.rows.length === 1 && binding.aggregation === 'none' ? { value: group.values[0] } : {}) }, ...(fields.value ? { rawValues: group.values } : {}), sourceRows: group.rows,
    }));
    displayedRows = links.length;
  } else if (chart.kind === 'treemap') {
    if (!binding.hierarchy) fail('Treemap requires hierarchy {id, parent, value, label?} columns; parent cells are null/empty only for roots.');
    noGenericSelection(binding); noReduction(binding);
    const fields = binding.hierarchy;
    nodes = dataset.rows.map((row, index) => {
      const id = cell(row, fields.id), parent = cell(row, fields.parent), value = cell(row, fields.value), label = fields.label ? cell(row, fields.label) : undefined;
      return { id: sourceId(id, 'node id'), ...(parent !== null && parent !== '' ? { parent: sourceId(parent, 'parent id') } : {}), ...(value !== null ? { value: sourceNumber(value, projection)! } : {}), ...(label !== undefined ? { label: sourceId(label, 'node label') } : {}),
        sourceRows: [index], raw: { id, parent, value, ...(label !== undefined ? { label } : {}) },
      };
    });
    displayedRows = nodes.length;
  } else if (chart.kind === 'choropleth') {
    if (!binding.geography || !chart.regions?.length) fail('Choropleth requires geography {id, value} columns plus actual supplied region geometry.');
    noGenericSelection(binding);
    if (binding.downsample) fail('Region rows cannot be silently omitted by downsampling.');
    const fields = binding.geography, byId = new Map(chart.regions.map(region => [region.id, { region, values: [] as Cell[], rows: [] as number[], rawId: null as Cell }]));
    dataset.rows.forEach((row, index) => {
      const rawId = cell(row, fields.id), group = byId.get(sourceId(rawId, 'region id'));
      if (!group) fail('A source region ID has no supplied polygon geometry. Supply its boundary or correct the explicit mapping.');
      if (group.rows.length && binding.aggregation === 'none') fail('Duplicate region rows require an explicit aggregation.');
      group.values.push(cell(row, fields.value)); group.rows.push(index); group.rawId = rawId;
    });
    regions = [...byId.values()].map(group => {
      const value = group.rows.length ? aggregate(group.values, binding.aggregation, projection) : null;
      return { id: group.region.id, ...(group.region.label !== undefined ? { label: group.region.label } : {}), geometry: group.region.geometry, value, sourceRows: group.rows,
        ...(group.rows.length ? { raw: { id: group.rawId, ...(group.rows.length === 1 && binding.aggregation === 'none' ? { value: group.values[0] } : {}) }, rawValues: group.values } : {}),
      };
    });
    displayedRows = regions.filter(region => region.sourceRows?.length).length;
  } else if (chart.kind === 'gauge') {
    if (binding.y?.length !== 1 || binding.x || binding.groupBy || binding.downsample) fail('Gauge requires one y column with an explicit row or aggregation, plus its supplied range.');
    const column = binding.y[0];
    let point: ChartPoint;
    if (binding.aggregation === 'none') {
      if (binding.row === undefined || binding.row >= dataset.rows.length) fail('Gauge needs an existing explicit source row.');
      const rawY = cell(dataset.rows[binding.row], column);
      point = { x: column, y: sourceNumber(rawY, projection), rawY, sourceRows: [binding.row] };
    } else {
      if (binding.row !== undefined) fail('Gauge cannot combine row selection and aggregation.');
      const rawValues = dataset.rows.map(row => cell(row, column));
      point = { x: column, y: aggregate(rawValues, binding.aggregation, projection), rawValues, sourceRows: dataset.rows.map((_, index) => index) };
    }
    series = [{ name: column, points: [point] }];
  } else series = genericSeries(chart, dataset, binding, projection);

  originalPoints = series.reduce((count, series) => count + series.points.length, 0);
  if (binding.downsample) {
    if (chart.kind !== 'area' && chart.kind !== 'bubble') fail('Explicit stride downsampling is supported for area/bubble, not this chart kind.');
    const perSeries = Math.floor(binding.downsample.maxPoints / series.length);
    if (perSeries < 2) fail('Downsampling needs a budget of at least two points per series.');
    series = series.map(series => ({ ...series, points: series.points.length <= perSeries ? series.points : Array.from({ length: perSeries }, (_, i) => series.points[Math.round(i * (series.points.length - 1) / (perSeries - 1))]) }));
  }
  if (series.length) displayedRows = series.reduce((count, series) => count + series.points.length, 0);
  if (displayedRows > 5000) throw new RenderingError('PLOT_TOO_LARGE', 'Plot exceeds 5,000 points; request explicit supported aggregation/downsampling or use a table.');
  if (!displayedRows) fail('No renderable source observations were supplied.');
  if (chart.kind === 'area' && !series.some(series => series.points.some(point => point.y !== null))) fail('Area needs at least one nonmissing source value.');
  const result = chartDataSchema.safeParse({ ...chart, binding, series,
    ...(nodes ? { nodes } : {}), ...(links ? { links } : {}), ...(regions ? { regions } : {}),
    xLabel: chart.xLabel ?? binding.x,
    yLabel: chart.yLabel ?? (binding.y && binding.y.join(', ').length <= 500 ? binding.y.join(', ') : undefined),
    summary: { datasetId: dataset.id, sourceRows: dataset.rows.length, displayedRows, aggregation: chart.kind === 'violin' ? 'violin' : binding.aggregation,
      downsampled: originalPoints > 0 && displayedRows < originalPoints, ...(precisionNote ? { precisionNote } : {}), ...(excludedRows ? { excludedRows } : {}),
    },
  });
  if (!result.success) fail(result.error.issues.slice(0, 4).map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  return result.data;
}
