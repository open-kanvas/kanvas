import { z } from 'zod';
import { assertJsonBudget, chartDataSchema, datasetBindingSchema, provenanceSchema, retainedProvenance, tableDataSchema, validateView, VIEW_LIMITS, type Cell, type ChartData, type ChartPoint, type DatasetBinding } from '../../shared/view-schemas.js';
import type { DatasetRecord, Provenance, ViewSpec } from '../../shared/types.js';
import { RenderingError } from './errors.js';
import { advancedBindingColumns, hasAdvancedBinding, materializeAdvancedChartData } from './advanced-chart-data.js';

export const DATASET_LIMITS = { bytes: 5 * 1024 * 1024, rows: 20_000, columns: 64, cellCharacters: 20_000 } as const;
const unsafeNames = new Set(['__proto__', 'prototype', 'constructor']);
const numericPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
export interface ColumnSummary {
  name: string; kind: 'number'|'date'|'boolean'|'text'|'mixed'|'empty'; nullCount: number; numericCount: number;
  distinctCount: number; min?: number; max?: number; mean?: number; precisionSensitive: boolean;
}
export interface DatasetSummary { rowCount: number; columns: ColumnSummary[]; sample: Record<string, unknown>[]; numericProjection: 'IEEE-754; original cells retained' }
export interface ParsedDataset { name: string; columns: string[]; rows: Record<string, Cell>[]; rowCount: number; source?: Provenance; summary: DatasetSummary }
export interface DatasetInput { name: string; csv?: string; rows?: unknown; json?: string; source?: Provenance }
interface CsvField { value: string; quoted: boolean }

function fail(message: string, code = 'INVALID_DATASET'): never { throw new RenderingError(code, message); }
function checkColumn(name: string): void {
  if (!name || name.length > 200 || unsafeNames.has(name) || name.includes('\0')) fail('Column names must be nonempty, unique, at most 200 characters, and not reserved.');
}

/** RFC-4180-style CSV: quoted commas/newlines/escaped quotes; no silent repair. */
export function parseCsv(csv: string): { columns: string[]; rows: Record<string, Cell>[] } {
  if (typeof csv !== 'string' || Buffer.byteLength(csv, 'utf8') > DATASET_LIMITS.bytes) fail('CSV exceeds the 5 MiB limit.', 'DATASET_TOO_LARGE');
  if (csv.charCodeAt(0) === 0xfeff) csv = csv.slice(1);
  const records: CsvField[][] = [];
  let row: CsvField[] = [], value = '', quoted = false, inQuote = false, closedQuote = false, fieldStarted = false;
  const pushField = () => {
    if (value.length > DATASET_LIMITS.cellCharacters) fail('A CSV cell exceeds the character limit.', 'DATASET_TOO_LARGE');
    row.push({ value, quoted });
    if (row.length > DATASET_LIMITS.columns) fail('Dataset exceeds the 64-column limit.', 'DATASET_TOO_LARGE');
    value = ''; quoted = false; closedQuote = false; fieldStarted = false;
  };
  const pushRow = () => {
    pushField();
    // An empty physical line is not a one-column null record. A quoted empty value is.
    if (!(row.length === 1 && row[0].value === '' && !row[0].quoted)) records.push(row);
    row = [];
    if (records.length > DATASET_LIMITS.rows + 1) fail('Dataset exceeds the 20,000-row limit.', 'DATASET_TOO_LARGE');
  };
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (inQuote) {
      if (char === '"') {
        if (csv[i + 1] === '"') { value += '"'; i++; }
        else { inQuote = false; closedQuote = true; }
      } else value += char;
    } else if (char === ',') pushField();
    else if (char === '\r' || char === '\n') { if (char === '\r' && csv[i + 1] === '\n') i++; pushRow(); }
    else if (char === '"') {
      if (fieldStarted || closedQuote) fail('Malformed CSV quotation.');
      inQuote = true; quoted = true; fieldStarted = true;
    } else {
      if (closedQuote) fail('Unexpected characters after a quoted CSV field.');
      value += char; fieldStarted = true;
    }
    if (value.length > DATASET_LIMITS.cellCharacters) fail('A CSV cell exceeds the character limit.', 'DATASET_TOO_LARGE');
  }
  if (inQuote) fail('Unterminated quoted CSV field.');
  if (row.length || fieldStarted || closedQuote || value) pushRow();
  if (!records.length) fail('CSV needs a header row.');
  const columns = records.shift()!.map((field) => field.value);
  columns.forEach(checkColumn);
  if (new Set(columns).size !== columns.length) fail('Duplicate CSV columns are not supported.');
  const rows = records.map((fields) => {
    if (fields.length !== columns.length) fail('CSV row width does not match the header.');
    return Object.fromEntries(columns.map((column, index) => [column, fields[index].value === '' && !fields[index].quoted ? null : fields[index].value]));
  });
  return { columns, rows };
}

/** JSON text keeps every numeric lexeme as a decimal string, before binary rounding. */
export function parseLosslessJsonRows(json: string): unknown {
  if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > DATASET_LIMITS.bytes) fail('JSON exceeds the 5 MiB limit.', 'DATASET_TOO_LARGE');
  if (json.charCodeAt(0) === 0xfeff) json = json.slice(1);
  try { JSON.parse(json); } catch { fail('Malformed JSON dataset.'); }
  let output = '', inString = false, escaped = false;
  for (let i = 0; i < json.length;) {
    const char = json[i];
    if (inString) {
      output += char; i++;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') { inString = true; output += char; i++; }
    else if (char === '-' || /\d/.test(char)) {
      const token = json.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)?.[0];
      if (!token) fail('Malformed JSON numeric token.');
      output += JSON.stringify(token); i += token.length;
    } else { output += char; i++; }
  }
  try { return JSON.parse(output); } catch { fail('Malformed JSON dataset.'); }
}

function normalizeRows(value: unknown): { columns: string[]; rows: Record<string, Cell>[] } {
  if (!Array.isArray(value) || !value.length) fail('JSON dataset needs a nonempty array of row objects.');
  if (value.length > DATASET_LIMITS.rows) fail('Dataset exceeds the 20,000-row limit.', 'DATASET_TOO_LARGE');
  try { assertJsonBudget(value, DATASET_LIMITS.bytes, DATASET_LIMITS.rows * (DATASET_LIMITS.columns + 2)); }
  catch { fail('Dataset contains unsupported values or exceeds its byte/complexity limit.'); }
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || Array.isArray(row) || typeof row !== 'object') fail('Every dataset row must be an object.');
    for (const [key, cell] of Object.entries(row)) {
      checkColumn(key);
      if (!seen.has(key)) { columns.push(key); seen.add(key); }
      if (columns.length > DATASET_LIMITS.columns) fail('Dataset exceeds the 64-column limit.', 'DATASET_TOO_LARGE');
      if (cell !== null && !['string', 'number', 'boolean'].includes(typeof cell)) fail('Cells must be strings, numbers, booleans or null.');
      if (typeof cell === 'string' && cell.length > DATASET_LIMITS.cellCharacters) fail('A JSON cell exceeds the character limit.', 'DATASET_TOO_LARGE');
      if (typeof cell === 'number' && (!Number.isFinite(cell) || (Number.isInteger(cell) && !Number.isSafeInteger(cell)))) fail('Unsafe JSON number: send exact decimals/large integers as strings or use JSON text.');
    }
  }
  if (!columns.length) fail('Dataset needs at least one column.');
  return { columns, rows: value.map((row) => Object.fromEntries(columns.map((column) => [column, Object.hasOwn(row, column) ? row[column] : null]))) };
}

export function parseDataset(input: DatasetInput): ParsedDataset {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200) fail('Dataset name is required and limited to 200 characters.');
  if ([input.csv, input.rows, input.json].filter((v) => v !== undefined).length !== 1) fail('Supply exactly one of csv, rows, or json.');
  let rows = input.json === undefined ? input.rows : parseLosslessJsonRows(input.json);
  let embeddedSource: unknown;
  // The library exports {rows, source}. Unwrap only after lossless parsing so
  // importing that document never takes a binary-number round trip in the UI.
  if (input.json !== undefined && rows !== null && typeof rows === 'object' && !Array.isArray(rows)) {
    const document = rows as Record<string, unknown>;
    if (!Object.hasOwn(document, 'rows') || Object.keys(document).some(key => !['rows', 'source'].includes(key))) fail('A JSON dataset document must contain rows and optional source provenance.');
    embeddedSource = document.source;
    rows = document.rows;
  }
  let source: Provenance | undefined;
  try {
    const embedded = embeddedSource === undefined ? undefined : provenanceSchema.parse((retainedProvenance({source:embeddedSource}) as {source:unknown}).source);
    const explicit = input.source === undefined ? undefined : provenanceSchema.parse(input.source);
    source = embedded || explicit ? { ...embedded, ...explicit } : undefined;
  } catch { fail('Dataset provenance is invalid.'); }
  const parsed = input.csv !== undefined ? parseCsv(input.csv) : normalizeRows(rows);
  const dataset = { name: input.name, ...parsed, rowCount: parsed.rows.length, ...(source ? { source } : {}) };
  return { ...dataset, summary: summarizeDataset(dataset) };
}

export function numericProjection(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !numericPattern.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function precisionSensitive(value: unknown): boolean {
  if (typeof value !== 'string' || !numericPattern.test(value)) return false;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || (Number.isInteger(numeric) && !Number.isSafeInteger(numeric))) return true;
  const significant = value.replace(/e.*$/i, '').replace(/[^\d]/g, '').replace(/^0+/, '').replace(/0+$/, '');
  return significant.length > 15 || (numeric === 0 && /[1-9]/.test(value.split(/e/i)[0]));
}

export function summarizeDataset(dataset: Pick<DatasetRecord, 'columns'|'rows'>): DatasetSummary {
  const columns = dataset.columns.map((name): ColumnSummary => {
    let nullCount = 0, numericCount = 0, mean = 0, min = Infinity, max = -Infinity, sensitive = false;
    const types = new Set<string>(), distinct = new Set<string>();
    for (const row of dataset.rows) {
      const value = row[name];
      if (value === null || value === undefined) { nullCount++; continue; }
      distinct.add(`${typeof value}:${String(value)}`);
      const numeric = numericProjection(value);
      if (numeric !== null) { types.add('number'); numericCount++; min = Math.min(min, numeric); max = Math.max(max, numeric); mean += (numeric - mean) / numericCount; }
      else if (typeof value === 'boolean') types.add('boolean');
      else if (typeof value === 'string' && /^\d{4}-\d\d-\d\d(?:T|$)/.test(value) && Number.isFinite(Date.parse(value))) types.add('date');
      else types.add('text');
      sensitive ||= precisionSensitive(value);
    }
    const kind = !types.size ? 'empty' : types.size === 1 ? [...types][0] as ColumnSummary['kind'] : 'mixed';
    return { name, kind, nullCount, numericCount, distinctCount: distinct.size, ...(numericCount ? { min, max, ...(Number.isFinite(mean) ? { mean } : {}) } : {}), precisionSensitive: sensitive };
  });
  return { rowCount: dataset.rows.length, columns, sample: dataset.rows.slice(0, 4).map((row) => Object.fromEntries(dataset.columns.map((name) => [name, typeof row[name] === 'string' && (row[name] as string).length > 200 ? `${(row[name] as string).slice(0, 197)}…` : row[name]]))), numericProjection: 'IEEE-754; original cells retained' };
}

function resolveBinding(view: ViewSpec, datasets: DatasetRecord[]): { binding: DatasetBinding; dataset: DatasetRecord } {
  let binding: DatasetBinding;
  try { binding = datasetBindingSchema.parse(view.data.binding); } catch { fail('A valid dataset binding is required.', 'INVALID_BINDING'); }
  const dataset = datasets.find((item) => item.id === binding.datasetId);
  if (!dataset) fail('Referenced dataset is unavailable in this session.', 'DATASET_NOT_FOUND');
  const selected = [...(binding.columns ?? []), ...(binding.x ? [binding.x] : []), ...(binding.y ?? []), ...(binding.groupBy ? [binding.groupBy] : []), ...(binding.histogram ? [binding.histogram.column] : []), ...advancedBindingColumns(binding)];
  if (selected.some((name) => !dataset.columns.includes(name))) fail('Binding refers to an unknown source column.', 'INVALID_BINDING');
  if (binding.y && new Set(binding.y).size !== binding.y.length) fail('Binding series columns must be unique.', 'INVALID_BINDING');
  if (binding.columns && new Set(binding.columns).size !== binding.columns.length) fail('Binding table columns must be unique.', 'INVALID_BINDING');
  return { binding, dataset };
}

function projected(value: unknown, nullable = true): number | null {
  if (value === null || value === undefined) { if (nullable) return null; fail('Numeric plot cannot use a missing value here.', 'INVALID_BINDING'); }
  const numeric = numericProjection(value);
  if (numeric === null) fail('Selected plot column contains nonnumeric values; use a table or different column.', 'INVALID_BINDING');
  return numeric;
}
function xValue(value: unknown, row: number): string | number {
  if (value === null || value === undefined) fail('Selected x column contains missing values; use a table or supply complete coordinates.', 'INVALID_BINDING');
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return String(value);
  fail(`Unsupported x value at source row ${row}.`, 'INVALID_BINDING');
}
function aggregate(values: number[], method: DatasetBinding['aggregation']): number | null {
  if (method === 'count') return values.length;
  if (!values.length) return null;
  let result: number;
  if (method === 'min') result = Math.min(...values);
  else if (method === 'max') result = Math.max(...values);
  else {
    // Compensated summation improves ordinary floating-point plots; source rows stay exact.
    let sum = 0, compensation = 0;
    for (const value of values) { const y = value - compensation, t = sum + y; compensation = (t - sum) - y; sum = t; }
    result = method === 'mean' ? sum / values.length : sum;
  }
  if (!Number.isFinite(result)) fail('Aggregation exceeds finite plot precision; display source values in a table.', 'INVALID_BINDING');
  return result;
}
function stride(points: ChartPoint[], maxPoints: number): ChartPoint[] {
  if (points.length <= maxPoints) return points;
  return Array.from({ length: maxPoints }, (_, i) => points[Math.round(i * (points.length - 1) / (maxPoints - 1))]);
}
function quantile(sorted: number[], fraction: number): number {
  const position = (sorted.length - 1) * fraction, low = Math.floor(position), high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

function histogram(dataset: DatasetRecord, binding: DatasetBinding): { series: ChartData['series']; excludedRows: number } {
  if (!binding.histogram) fail('Histogram requires an explicit column and bins or edges.', 'INVALID_BINDING');
  const values = dataset.rows.map((row, index) => ({ value: projected(row[binding.histogram!.column]), index })).filter((item): item is {value: number; index: number} => item.value !== null);
  if (!values.length) fail('Histogram needs numeric source values.', 'INVALID_BINDING');
  let edges = binding.histogram.edges;
  if (!edges) {
    const min = Math.min(...values.map((v) => v.value)), max = Math.max(...values.map((v) => v.value));
    const lo = min === max ? min - (Math.abs(min) || 1) * 0.5 : min, hi = min === max ? max + (Math.abs(max) || 1) * 0.5 : max;
    const count = binding.histogram.bins!;
    edges = Array.from({ length: count + 1 }, (_, index) => index === count ? hi : lo + (hi - lo) * index / count);
    if (edges.some((v, i) => !Number.isFinite(v) || (i > 0 && v <= edges![i - 1]))) fail('Histogram edges cannot be represented at plot precision; supply explicit edges.', 'INVALID_BINDING');
  }
  const points: ChartPoint[] = edges.slice(0, -1).map((edge, i) => ({ x: `${edge}–${edges![i + 1]}${i === edges!.length - 2 ? ' (inclusive)' : ''}`, y: 0, low: edge, high: edges![i + 1], sourceRows: [] }));
  let excludedRows = dataset.rows.length - values.length;
  for (const item of values) {
    const bin = points.findIndex((point, i) => item.value >= point.low! && (item.value < point.high! || (i === points.length - 1 && item.value === point.high)));
    if (bin === -1) { excludedRows++; continue; }
    points[bin].y = (points[bin].y as number) + 1; points[bin].sourceRows!.push(item.index);
  }
  return { series: [{ name: binding.histogram.column, points }], excludedRows };
}

/** The caller selects bindings; every emitted value/index below comes from stored source rows. */
export function materializeDatasetView(view: ViewSpec, datasets: DatasetRecord[]): ViewSpec {
  if (view.template === 'presentation') return validateView({ ...view, data: { ...view.data, slides: (view.data.slides as ViewSpec[]).map((slide) => materializeDatasetView(slide, datasets)) } });
  if (!view.data.binding) return validateView(view);
  if (view.template !== 'chart' && view.template !== 'table' && view.template !== 'number') fail('This template does not support dataset binding.', 'INVALID_BINDING');
  const { binding, dataset } = resolveBinding(view, datasets);
  if (view.template !== 'chart' && hasAdvancedBinding(binding)) fail('Financial/distribution/edge/hierarchy/geography/size/total mappings belong to charts, not number/table bindings.', 'INVALID_BINDING');
  const precisionNote = summarizeDataset(dataset).columns.some((column) => column.precisionSensitive) ? 'Some plot coordinates are approximate; exact original cells are retained in the dataset and table.' : undefined;
  if (view.template === 'number') {
    if (binding.y?.length !== 1 || binding.x || binding.columns || binding.groupBy || binding.histogram || binding.downsample || binding.offset || binding.limit) fail('Number binding requires one y column and an explicit row or aggregation.', 'INVALID_BINDING');
    let value: unknown;
    if (binding.aggregation === 'none') {
      if (binding.row === undefined || binding.row >= dataset.rows.length) fail('Number binding needs an existing explicit source row.', 'INVALID_BINDING');
      value = dataset.rows[binding.row][binding.y[0]];
    } else {
      if (binding.row !== undefined) fail('Number binding cannot combine a row and an aggregation.', 'INVALID_BINDING');
      const cells = dataset.rows.map((row) => row[binding.y![0]]).filter((cell) => cell !== null && cell !== undefined);
      value = binding.aggregation === 'count' ? cells.length : aggregate(cells.map((cell) => projected(cell, false)!), binding.aggregation);
    }
    if ((typeof value !== 'string' && typeof value !== 'number') || value === '') fail('Selected source number is not displayable.', 'INVALID_BINDING');
    return validateView({ ...view, source: dataset.source ?? view.source, data: { ...view.data, value, binding, label: view.data.label ?? binding.y[0], summary: { datasetId: dataset.id, sourceRows: dataset.rows.length, displayedRows: 1, aggregation: binding.aggregation, ...(precisionNote && binding.aggregation !== 'none' ? { precisionNote } : {}) } } });
  }
  if (view.template === 'table') {
    if (binding.aggregation !== 'none' || binding.histogram || binding.downsample || binding.x || binding.y || binding.groupBy || binding.row !== undefined) fail('Tables select source columns/rows only; chart transformations are not table bindings.', 'INVALID_BINDING');
    const columns = binding.columns ?? dataset.columns;
    const end = binding.offset + (binding.limit ?? VIEW_LIMITS.tableRows);
    const rows: Record<string, unknown>[] = [];
    let previewBytes = 0;
    for (const row of dataset.rows.slice(binding.offset, end)) {
      const selected = Object.fromEntries(columns.map((column) => [column, row[column] ?? null]));
      const bytes = Buffer.byteLength(JSON.stringify(selected), 'utf8') + 1;
      if (previewBytes + bytes > VIEW_LIMITS.bytes - 128 * 1024) {
        if (!rows.length) fail('One table row exceeds the display byte budget; select fewer columns.', 'PLOT_TOO_LARGE');
        break;
      }
      previewBytes += bytes; rows.push(selected);
    }
    return validateView({ ...view, source: dataset.source ?? view.source, data: tableDataSchema.parse({ ...view.data, columns, rows, binding, summary: { datasetId: dataset.id, sourceRows: dataset.rows.length, displayedRows: rows.length, aggregation: 'none' } }) });
  }
  const chart = chartDataSchema.parse(view.data);
  const advanced = materializeAdvancedChartData(chart, dataset, binding, numericProjection, precisionNote);
  if (advanced) return validateView({ ...view, source: dataset.source ?? view.source, data: advanced });
  if (hasAdvancedBinding(binding)) fail('This chart kind does not use the supplied structured source mapping.', 'INVALID_BINDING');
  if (binding.offset || binding.limit || binding.columns || binding.row !== undefined) fail('Chart row truncation is not implicit: use explicit downsampling or aggregation.', 'INVALID_BINDING');
  let series: ChartData['series'] = [], excludedRows = 0;
  if (chart.kind === 'histogram') {
    if (binding.aggregation !== 'none' || binding.x || binding.y || binding.groupBy) fail('Histogram uses only its explicit histogram binding.', 'INVALID_BINDING');
    ({ series, excludedRows } = histogram(dataset, binding));
  } else if (chart.kind === 'box') {
    if (!binding.y?.length || binding.aggregation !== 'none' || binding.histogram || binding.x || binding.groupBy) fail('Box plots require numeric y columns without additional aggregation.', 'INVALID_BINDING');
    series = [{ name: 'Distribution', points: binding.y.map((column) => {
      const values = dataset.rows.map((row, index) => ({ value: projected(row[column]), index })).filter((item): item is {value:number;index:number} => item.value !== null);
      if (!values.length) fail('Box plot needs numeric source values.', 'INVALID_BINDING');
      const sorted = values.map((v) => v.value).sort((a, b) => a - b);
      return { x: column, y: quantile(sorted, 0.5), low: sorted[0], q1: quantile(sorted, 0.25), median: quantile(sorted, 0.5), q3: quantile(sorted, 0.75), high: sorted[sorted.length - 1], sourceRows: values.map((v) => v.index) };
    }) }];
  } else if (chart.kind === 'heatmap') {
    if (!binding.x || !binding.groupBy || binding.y?.length !== 1 || binding.histogram || binding.aggregation === 'none') fail('Heatmap requires x, groupBy (y category), one value column, and explicit aggregation.', 'INVALID_BINDING');
    const groups = new Map<string, {x:string|number;y:string|number;values:number[];rows:number[]}>();
    for (const [index, row] of dataset.rows.entries()) {
      const x = xValue(row[binding.x], index), y = xValue(row[binding.groupBy], index), key = JSON.stringify([x, y]);
      const group = groups.get(key) ?? { x, y, values: [], rows: [] }; groups.set(key, group);
      const cell = row[binding.y[0]], value = binding.aggregation === 'count' ? (cell === null || cell === undefined ? null : 1) : projected(cell); if (value !== null) group.values.push(value); group.rows.push(index);
    }
    const renderable = [...groups.values()].filter((group) => { if (!group.values.length && binding.aggregation !== 'count') { excludedRows += group.rows.length; return false; } return true; });
    series = [{ name: binding.y[0], points: renderable.map((group) => ({ x: group.x, y: group.y, value: aggregate(group.values, binding.aggregation)!, sourceRows: group.rows })) }];
  } else {
    if (!binding.y?.length || binding.histogram) fail('Chart requires numeric y column bindings.', 'INVALID_BINDING');
    if (binding.groupBy && binding.aggregation === 'none') fail('groupBy requires explicit aggregation.', 'INVALID_BINDING');
    if (chart.kind === 'scatter' && !binding.x) fail('Scatter plot requires a numeric x column.', 'INVALID_BINDING');
    series = binding.y.map((column) => {
      let points: ChartPoint[];
      if (binding.aggregation !== 'none') {
        const groups = new Map<string, {x:string|number;values:number[];rows:number[]}>();
        const groupColumn = binding.groupBy ?? binding.x;
        for (const [index, row] of dataset.rows.entries()) {
          const x = groupColumn ? xValue(row[groupColumn], index) : column, key = JSON.stringify(x);
          const group = groups.get(key) ?? { x, values: [], rows: [] }; groups.set(key, group);
          const cell = row[column], value = binding.aggregation === 'count' ? (cell === null || cell === undefined ? null : 1) : projected(cell); if (value !== null) group.values.push(value); group.rows.push(index);
        }
        points = [...groups.values()].map((group) => ({ x: group.x, y: aggregate(group.values, binding.aggregation), sourceRows: group.rows }));
      } else points = dataset.rows.map((row, index) => {
        const rawX = binding.x ? row[binding.x] as Cell : index, rawY = (row[column] ?? null) as Cell;
        const x = chart.kind === 'scatter' ? projected(rawX, false)! : xValue(rawX, index);
        return { x, y: projected(rawY), rawX, rawY, sourceRows: [index] };
      });
      return { name: column, points };
    });
  }
  const originalPoints = series.reduce((sum, item) => sum + item.points.length, 0);
  if (binding.downsample) {
    if (chart.kind !== 'line' && chart.kind !== 'scatter') fail('Stride downsampling is supported only for line/scatter plots.', 'INVALID_BINDING');
    const perSeries = Math.max(2, Math.floor(binding.downsample.maxPoints / series.length));
    if (perSeries * series.length > binding.downsample.maxPoints) fail('Downsample budget needs at least two points per series.', 'INVALID_BINDING');
    series = series.map((item) => ({ ...item, points: stride(item.points, perSeries) }));
  }
  const displayedRows = series.reduce((sum, item) => sum + item.points.length, 0);
  if (displayedRows > VIEW_LIMITS.points) fail('Plot exceeds 5,000 points; request explicit aggregation/downsampling or use a table.', 'PLOT_TOO_LARGE');
  if (!series.some((item) => item.points.some((point) => point.y !== null))) fail('No renderable numeric source values.', 'INVALID_BINDING');
  return validateView({ ...view, source: dataset.source ?? view.source, data: { ...chart, binding, series,
    xLabel: chart.xLabel ?? binding.x, yLabel: chart.yLabel ?? (binding.y && binding.y.join(', ').length <= 500 ? binding.y.join(', ') : undefined),
    summary: { datasetId: dataset.id, sourceRows: dataset.rows.length, displayedRows, aggregation: chart.kind === 'histogram' ? 'histogram' : chart.kind === 'box' ? 'box' : binding.aggregation, downsampled: displayedRows < originalPoints, ...(precisionNote ? { precisionNote } : {}), ...(excludedRows ? { excludedRows } : {}) },
  } });
}
