import { describe, expect, it } from 'vitest';
import { materializeDatasetView, parseDataset } from '../../src/server/rendering/datasets.js';
import type { DatasetRecord } from '../../src/shared/types.js';
import { source, view } from './helpers.js';

function dataset(rows: Record<string, unknown>[]): DatasetRecord { return { ...parseDataset({ name: 'Source', rows, source }), id: 'dataset-1', sessionId: 'session-1', createdAt: '2026-09-08T00:00:00Z' }; }
describe('source-preserving dataset ingestion', () => {
  it('parses BOM/CRLF/quoted commas, multiline quotes and null versus empty text without changing lexemes', () => {
    const parsed = parseDataset({ name: 'Ledger', csv: '\uFEFFid,amount,note,missing,empty\r\n001,9007199254740993,"first, second\nsaid ""yes""",,""\r\n002,1.2300e-4,plain,,""\r\n', source });
    expect(parsed.columns).toEqual(['id', 'amount', 'note', 'missing', 'empty']);
    expect(parsed.rows).toEqual([{ id: '001', amount: '9007199254740993', note: 'first, second\nsaid "yes"', missing: null, empty: '' }, { id: '002', amount: '1.2300e-4', note: 'plain', missing: null, empty: '' }]);
    expect(parsed.source).toEqual(source);
    expect(parsed.summary.columns.find((column) => column.name === 'amount')?.precisionSensitive).toBe(true);
    expect(parsed.summary.columns.find((column) => column.name === 'id')?.kind).toBe('text');
  });
  it('preserves all numeric tokens in JSON text before IEEE-754 rounding', () => {
    const parsed = parseDataset({ name: 'Exact JSON', json: '[{"large":9007199254740993,"decimal":0.123456789012345678901,"signed":-0,"scientific":1.20e+2,"blank":null,"flag":true,"text":"number 123"}]' });
    expect(parsed.rows[0]).toEqual({ large: '9007199254740993', decimal: '0.123456789012345678901', signed: '-0', scientific: '1.20e+2', blank: null, flag: true, text: 'number 123' });
    expect(() => parseDataset({ name: 'Unsafe', rows: [{ large: 9007199254740993 }] })).toThrow(/Unsafe JSON number/);
  });
  it('retains typed JSON cells and fills missing columns with null', () => {
    const parsed = parseDataset({ name: 'Sparse', rows: [{ a: 1, flag: true }, { a: null, b: '001' }] });
    expect(parsed.rows).toEqual([{ a: 1, flag: true, b: null }, { a: null, flag: null, b: '001' }]);
    expect(parsed.summary.columns.find((column) => column.name === 'a')).toMatchObject({ kind: 'number', nullCount: 1, numericCount: 1, min: 1, max: 1, mean: 1 });
  });
  it('imports and reimports exported JSON documents without rounding numbers or losing provenance', () => {
    const parsed = parseDataset({ name: 'Document', json: '\uFEFF{"rows":[{"amount":0.123456789012345678901,"id":900719925474099312345,"flag":true}],"source":{"title":"Original source","locator":"Row 1","illustrative":true}}', source: { title: 'Explicit title' } });
    expect(parsed.rows).toEqual([{ amount: '0.123456789012345678901', id: '900719925474099312345', flag: true }]);
    expect(parsed.source).toEqual({ title: 'Explicit title', locator: 'Row 1' });
    const imported = parseDataset({ name: 'Reimport', json: JSON.stringify({ rows: parsed.rows, source: parsed.source }) });
    expect(imported.rows).toEqual(parsed.rows);
    expect(imported.source).toEqual(parsed.source);
    expect(imported.columns).toEqual(parsed.columns);
  });
  it('rejects malformed JSON envelopes and invalid embedded provenance without partial imports', () => {
    for (const json of ['{"rows":{}}', '{"source":{}}', '{"rows":[{"a":1}],"ignored":[{"a":2}]}', '{"rows":[{"a":1}],"source":{"url":"javascript:alert(1)"}}']) {
      expect(() => parseDataset({ name: 'Invalid document', json })).toThrow();
    }
  });
  it.each(['a,a\n1,2', 'a,b\n1', 'a\n"unfinished', 'a\n"value" trailing', 'a\nunquoted"quote', 'constructor\n1'])('rejects malformed or unsafe CSV without partial ingestion', (csv) => expect(() => parseDataset({ name: 'Invalid', csv })).toThrow());
  it('rejects unsupported nested cells, invalid numeric values, missing content, excessive rows/columns', () => {
    for (const rows of [[{ a: { nested: true } }], [{ a: Infinity }], [{ a: undefined }], []]) expect(() => parseDataset({ name: 'Invalid', rows })).toThrow();
    expect(() => parseDataset({ name: 'Both', csv: 'a\n1', rows: [{ a: 1 }] })).toThrow();
    expect(() => parseDataset({ name: 'Wide', rows: [Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`column-${i}`, 1]))] })).toThrow(/64-column/);
    expect(() => parseDataset({ name: 'Long', rows: Array.from({ length: 20_001 }, () => ({ a: 1 })) })).toThrow(/20,000-row/);
  });
});

describe('deterministic materialization', () => {
  it('replaces caller-transcribed points with exact source row bindings and preserves nulls/provenance', () => {
    const original = dataset([{ date: '2026-09-01', sales: '1.2300' }, { date: '2026-09-02', sales: null }, { date: '2026-09-03', sales: '2.4500' }]);
    const result = materializeDatasetView(view('chart', { kind: 'line', binding: { datasetId: original.id, x: 'date', y: ['sales'] }, series: [{ name: 'Invented', points: [{ x: 'wrong', y: 999 }] }] }), [original]);
    expect((result.data.series as any[])[0]).toEqual({ name: 'sales', points: [{ x: '2026-09-01', y: 1.23, rawX: '2026-09-01', rawY: '1.2300', sourceRows: [0] }, { x: '2026-09-02', y: null, rawX: '2026-09-02', rawY: null, sourceRows: [1] }, { x: '2026-09-03', y: 2.45, rawX: '2026-09-03', rawY: '2.4500', sourceRows: [2] }] });
    expect(result).not.toHaveProperty('source');
    expect(original.rows[0].sales).toBe('1.2300');
  });
  it('retains exact decimals and IDs in table/number selection, not rounded projections', () => {
    const original = dataset([{ id: '001', value: '9007199254740993' }]);
    const table = materializeDatasetView(view('table', { binding: { datasetId: original.id } }), [original]);
    expect(table.data.rows).toEqual(original.rows);
    const number = materializeDatasetView(view('number', { binding: { datasetId: original.id, y: ['value'], row: 0 }, value: 4 }), [original]);
    expect(number.data.value).toBe('9007199254740993');
  });
  it('bounds table previews by bytes without truncating any selected cell or source rows', () => {
    const original = dataset(Array.from({ length: 150 }, (_, i) => ({ id: i, text: 'exact '.repeat(3000) })));
    const result = materializeDatasetView(view('table', { binding: { datasetId: original.id } }), [original]);
    const rows = result.data.rows as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThan(1); expect(rows.length).toBeLessThan(150); expect(rows[0].text).toBe(original.rows[0].text);
    expect(result.data.summary).toMatchObject({ sourceRows: 150, displayedRows: rows.length }); expect(original.rows).toHaveLength(150);
  });
  it('keeps long source series names without overflowing the combined axis-label bound', () => {
    const names = Array.from({ length: 4 }, (_, i) => `${i}-${'n'.repeat(190)}`);
    const original = dataset([Object.fromEntries(names.map((name, i) => [name, i]))]);
    const result = materializeDatasetView(view('chart', { kind: 'bar', binding: { datasetId: original.id, y: names } }), [original]);
    expect((result.data.series as any[]).map((series) => series.name)).toEqual(names); expect(result.data.yLabel).toBeUndefined();
  });
  it('requires explicit point limits and retains both endpoints when explicitly downsampled', () => {
    const original = dataset(Array.from({ length: 5001 }, (_, x) => ({ x, y: x * 2 })));
    expect(() => materializeDatasetView(view('chart', { kind: 'line', binding: { datasetId: original.id, x: 'x', y: ['y'] } }), [original])).toThrow(/explicit aggregation\/downsampling/);
    const result = materializeDatasetView(view('chart', { kind: 'line', binding: { datasetId: original.id, x: 'x', y: ['y'], downsample: { method: 'stride', maxPoints: 100 } } }), [original]);
    const points = (result.data.series as any[])[0].points;
    expect(points).toHaveLength(100); expect(points[0].sourceRows).toEqual([0]); expect(points.at(-1).sourceRows).toEqual([5000]);
    expect(result.data.summary).toMatchObject({ sourceRows: 5001, displayedRows: 100, downsampled: true });
    expect(original.rows).toHaveLength(5001);
  });
  it('aggregates only source values and records all contributing source rows', () => {
    const original = dataset([{ group: 'A', amount: '0.1' }, { group: 'A', amount: '0.2' }, { group: 'B', amount: null }]);
    const result = materializeDatasetView(view('chart', { kind: 'bar', binding: { datasetId: original.id, x: 'group', y: ['amount'], aggregation: 'sum' } }), [original]);
    const points = (result.data.series as any[])[0].points;
    expect(points[0].y).toBeCloseTo(0.3); expect(points[0].sourceRows).toEqual([0, 1]); expect(points[1].y).toBeNull();
    expect(result.data.summary).toMatchObject({ aggregation: 'sum' });
  });
  it('computes explicit histogram edges, inclusive final bin and excluded/null rows', () => {
    const original = dataset([{ value: 0 }, { value: 1 }, { value: 2 }, { value: 3 }, { value: null }, { value: 10 }]);
    const result = materializeDatasetView(view('chart', { kind: 'histogram', binding: { datasetId: original.id, histogram: { column: 'value', edges: [0, 1, 3] } } }), [original]);
    const points = (result.data.series as any[])[0].points;
    expect(points.map((point: any) => point.y)).toEqual([1, 3]); expect(points[1].sourceRows).toEqual([1, 2, 3]);
    expect(result.data.summary).toMatchObject({ aggregation: 'histogram', excludedRows: 2 });
    expect(() => materializeDatasetView(view('chart', { kind: 'histogram', binding: { datasetId: original.id, histogram: { column: 'value' } } }), [original])).toThrow();
  });
  it('computes box quartiles and heatmap cells from explicit bindings, excluding unknown rather than showing zero', () => {
    const original = dataset([{ region: 'A', year: '2025', value: 1 }, { region: 'A', year: '2025', value: 3 }, { region: 'B', year: '2025', value: null }, { region: 'B', year: '2026', value: 5 }]);
    const box = materializeDatasetView(view('chart', { kind: 'box', binding: { datasetId: original.id, y: ['value'] } }), [original]);
    expect((box.data.series as any[])[0].points[0]).toMatchObject({ low: 1, q1: 2, median: 3, q3: 4, high: 5, sourceRows: [0, 1, 3] });
    const heatmap = materializeDatasetView(view('chart', { kind: 'heatmap', binding: { datasetId: original.id, x: 'region', groupBy: 'year', y: ['value'], aggregation: 'mean' } }), [original]);
    expect((heatmap.data.series as any[])[0].points).toEqual([{ x: 'A', y: '2025', value: 2, sourceRows: [0, 1] }, { x: 'B', y: '2026', value: 5, sourceRows: [3] }]);
    expect(heatmap.data.summary).toMatchObject({ excludedRows: 1 });
  });
  it('refuses missing datasets/columns and text projected as numbers', () => {
    const original = dataset([{ category: 'A', label: '001' }]);
    expect(() => materializeDatasetView(view('table', { binding: { datasetId: 'missing' } }), [original])).toThrow(/unavailable/);
    expect(() => materializeDatasetView(view('chart', { kind: 'line', binding: { datasetId: original.id, y: ['unknown'] } }), [original])).toThrow(/unknown source column/);
    expect(() => materializeDatasetView(view('chart', { kind: 'line', binding: { datasetId: original.id, y: ['label'] } }), [original])).toThrow(/nonnumeric/);
  });
});
