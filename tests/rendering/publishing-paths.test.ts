import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MCP_TOOLS, listToolDefinitions, resolveToolCall } from '../../src/server/mcp/catalog.js';
import { guideFor } from '../../src/server/mcp/guide.js';
import { COMMON_DATA_SHAPES, PUBLISHING_DESCRIPTION, PUBLISHING_GUIDANCE, PUBLISHING_RECIPES } from '../../src/server/mcp/publishing-guidance.js';
import { parseDataset } from '../../src/server/rendering/datasets.js';
import { RenderingError } from '../../src/server/rendering/errors.js';
import { createInterpreter } from '../../src/server/rendering/interpreter.js';
import type { InterpretationInput, SubmissionInput, UpdateRecord } from '../../src/shared/types.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { startHarness, success, type Harness } from '../core/harness.js';
import { input, source, view } from './helpers.js';
const request = (fields: Partial<SubmissionInput>): InterpretationInput => ({ ...input(), submission: { sessionId: 'session-id', displayIds: ['display-id'], requestId: 'publishing-test', ...fields } });
const exactWords = '  Exact supplied words.\r\nKeep punctuation: 👋 1.2300.\n';
const rows = Array.from({ length: 51 }, (_, index) => ({ item: `Item ${index + 1}`, amount: index === 50 ? '9007199254740993' : `${index}.2300`, count: index, empty: index % 2 ? '' : null }));
let server: Harness | undefined;
let finishPendingModel: (() => void) | undefined;
afterEach(async () => { finishPendingModel?.(); finishPendingModel = undefined; await server?.close(); server = undefined; });

describe('inspectable publishing recipes without mandatory schema lookup', () => {
  it.each(PUBLISHING_RECIPES)('$id is a complete submit that prepares its documented template', async recipe => {
    const definition = MCP_TOOLS.find(tool => tool.name === 'kanvas_submit')!;
    expect(definition.schema.safeParse(recipe.arguments).success).toBe(true);
    const submitted = request(structuredClone(recipe.arguments));
    if (recipe.arguments.datasetId) submitted.datasets = [{ ...parseDataset({ name: 'Supplied ledger', rows: [{ item: 'A', amount: '1.2300' }, { item: 'B', amount: '9007199254740993' }] }), id: 'dataset-id', sessionId: 'session-id', createdAt: '2026-09-14T12:00:00Z' }];
    const result = await createInterpreter().interpret(submitted);
    expect(result.action).toBe('replace');
    expect(result.view?.template).toBe(recipe.expectedTemplate);
    expect(() => validateView(result.view)).not.toThrow();
    if (recipe.expectedTemplate === 'table') {
      expect(result.view?.data.rows).toEqual([{ item: 'A', amount: '1.2300' }, { item: 'B', amount: '9007199254740993' }]);
      expect(result.view?.data.summary).toMatchObject({ sourceRows: 2, displayedRows: 2 });
    }
  });

  it.each(COMMON_DATA_SHAPES)('$template quick-reference examples pass the final strict data contract', shape => {
    expect(shape.examples.length).toBeGreaterThan(0);
    for (const data of shape.examples) expect(() => validateView({ version: 1, template: shape.template, data })).not.toThrow();
    expect(JSON.stringify(shape).length).toBeLessThan(1800);
  });

  it('publishes bounded common shapes and complete recipes through guidance and the unchanged submit tool', () => {
    const guide = guideFor('publishing') as Record<string, unknown>;
    expect(guide.guidance).toEqual(PUBLISHING_GUIDANCE);
    expect(guide.recipes).toEqual(PUBLISHING_RECIPES);
    expect(guide.commonDataShapes).toEqual(COMMON_DATA_SHAPES);
    const submit = listToolDefinitions().find(tool => tool.name === 'kanvas_submit')!;
    expect(submit.description).toContain(PUBLISHING_DESCRIPTION);
    expect(submit.description!.length).toBeLessThanOrEqual(4096);
    expect(PUBLISHING_DESCRIPTION.length).toBeLessThanOrEqual(1400);
    expect(COMMON_DATA_SHAPES).toHaveLength(7);
    expect(JSON.stringify({ PUBLISHING_GUIDANCE, PUBLISHING_RECIPES, COMMON_DATA_SHAPES }).length).toBeLessThan(20_000);
    // Omitted requestId generates a fresh effect; explicit stable IDs still support retries.
    expect(submit.annotations).toMatchObject({ idempotentHint: false, destructiveHint: false, openWorldHint: false });
    const inline = /Literal transcription example arguments: (\{.+?\})\. Common native data shapes:/.exec(PUBLISHING_DESCRIPTION);
    expect(inline).not.toBeNull();
    expect(MCP_TOOLS.find(tool => tool.name === 'kanvas_submit')!.schema.safeParse(JSON.parse(inline![1])).success).toBe(true);
  });

  it('keeps every documented JSON publication complete and identical to an exercised recipe', () => {
    const documentation = readFileSync(new URL('../../docs/integration/publishing-paths.md', import.meta.url), 'utf8');
    const examples = [...documentation.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => JSON.parse(match[1]));
    expect(examples).toHaveLength(5);
    for (const example of examples) {
      const recipe = PUBLISHING_RECIPES.find(candidate => candidate.arguments.requestId === example.arguments.arguments.requestId);
      expect(recipe).toBeDefined();
      expect(example).toEqual({ name: 'kanvas_tool_use', arguments: { operationId: 'kanvas.submit', arguments: recipe!.arguments } });
      const resolved = resolveToolCall('discovery', example.name, example.arguments);
      expect(resolved.error).toBeUndefined();
      expect(resolved.canonicalName).toBe('kanvas_submit');
      expect(resolved.args).toEqual(MCP_TOOLS.find(tool => tool.name === 'kanvas_submit')!.schema.parse(recipe!.arguments));
    }
  });
});

describe('literal context and intent remain separate from exact source content', () => {
  it('prepares a context-only fact via the existing bounded selector without appending intent text', async () => {
    const submitted = request({ context: exactWords, intent: 'Show the supplied statement verbatim.', templateHint: 'fact', source });
    const result = await createInterpreter().interpret(submitted);
    expect(result.view?.data.text).toBe(exactWords);
    expect(result.view?.source).toEqual(source);
  });

  it('recognizes literal transcript context as a real source before the direct fast path', async () => {
    const submitted = request({ context: exactWords, intent: 'Show these words verbatim; do not create a speaker.', templateHint: 'transcription', source });
    const before = structuredClone(submitted);
    const result = await createInterpreter().interpret(submitted);
    expect(result.view?.data).toEqual({ segments: [{ id: 'supplied-1', text: exactWords }], status: 'complete' });
    expect(result.view?.source).toEqual(source);
    expect(submitted).toEqual(before);
  });

  it('takes exact transcript data instead of descriptive context and invents no segment metadata', async () => {
    const literal = await createInterpreter().interpret(request({ data: exactWords, context: 'Surrounding explanation, not transcript words.', intent: 'Show the supplied transcript.', templateHint: 'transcription' }));
    expect(literal.view?.data).toEqual({ segments: [{ id: 'supplied-1', text: exactWords }], status: 'complete' });
    const data = { segments: [{ id: 'segment-1', text: exactWords, timestamp: '00:01.020', speaker: 'Speaker A' }, { id: 'segment-2', text: '  Final exact words.  ' }], status: 'live' };
    const structured = await createInterpreter().interpret(request({ data, context: 'Surrounding explanation.', intent: 'Show all supplied words.', templateHint: 'transcription' }));
    expect(structured.view?.data).toEqual(data);
  });
});

describe('complete structured tables are source-bound, not inferred samples', () => {
  it.each(['native', 'inline-rows'] as const)('retains all 51 rows, decimal strings, zeros and nulls through %s + context/intent', async format => {
    const data = format === 'native' ? { columns: ['item', 'amount', 'count', 'empty'], rows, pageSize: 7 } : { rows };
    const submitted = request({ data, context: 'This is the complete supplied ledger.', intent: 'Show all 51 rows exactly; do not round, summarize, filter or aggregate.', templateHint: 'table', source });
    const before = structuredClone(submitted);
    const result = await createInterpreter().interpret(submitted);
    expect(result.view?.data.rows).toEqual(rows);
    expect(result.view?.data.rows).toHaveLength(51);
    expect(result.view?.source).toEqual(source);
    if (format === 'native') expect(result.view?.data.pageSize).toBe(7);
    else expect(result.view?.data.summary).toMatchObject({ sourceRows: 51, displayedRows: 51, aggregation: 'none' });
    expect(submitted).toEqual(before);
  });

  it('preserves original JSON decimal lexemes when the small table is supplied in literal context', async () => {
    const context = '```json\n[{"item":"A","amount":1.2300,"count":0},{"item":"B","amount":9007199254740993,"count":0}]\n```';
    const result = await createInterpreter().interpret(request({ context, intent: 'Show all original values without rounding.', templateHint: 'table' }));
    expect(result.view?.data.rows).toEqual([{ item: 'A', amount: '1.2300', count: '0' }, { item: 'B', amount: '9007199254740993', count: '0' }]);
  });
});

describe('caller source errors retain precise content-free validation guidance', () => {
  it.each([
    { status: 'live' },
    { transcription: { segments: [{ id: 's1', text: 'SOURCE_ONLY_MARKER' }] } },
    { segments: [] },
    { segments: [{ id: 's1', text: 42 }] },
    { segments: [{ id: 's1', text: 'SOURCE_ONLY_MARKER' }, { id: 's1', text: 'Duplicated ID' }] },
    { segments: [{ id: 's1', text: 'SOURCE_ONLY_MARKER' }], SOURCE_ONLY_FIELD: 'SOURCE_ONLY_MARKER' },
    ['SOURCE_ONLY_MARKER'],
  ])('rejects malformed explicit transcript data during deterministic preparation: %#', async data => {
    const error = await createInterpreter().interpret(request({ data, context: 'Do not substitute this explanatory context for invalid data.', intent: 'Display the transcript.', templateHint: 'transcription' })).catch(error => error);
    expect(error).toBeInstanceOf(RenderingError);
    expect(error).toMatchObject({ code: 'INVALID_TRANSCRIPT_SOURCE' });
    expect(error.issues.length).toBeGreaterThan(0);
    expect(error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: expect.stringMatching(/^data(?:\.|$)/), rule: expect.any(String) })]));
    expect(JSON.stringify(error)).not.toMatch(/SOURCE_ONLY_MARKER|SOURCE_ONLY_FIELD/);
  });

  it.each([
    { columns: ['value'], rows: [{ value: { private: 'SOURCE_ONLY_MARKER' } }] },
    { columns: ['value'], rows: [[1, 2]] },
    { columns: ['value', 'value'], rows: [] },
    { columns: ['value'], rows: [{ other: 'SOURCE_ONLY_MARKER' }] },
  ])('reports malformed native table fields as source errors without inventing replacement data: %#', async data => {
    const error = await createInterpreter().interpret(request({ data, context: 'The supplied ledger.', intent: 'Show every supplied row.', templateHint: 'table' })).catch(error => error);
    expect(error).toMatchObject({ code: 'INVALID_TABLE_SOURCE' });
    expect(error.issues.length).toBeGreaterThan(0);
    expect(JSON.stringify(error)).not.toContain('SOURCE_ONLY_MARKER');
  });

  it.each([
    { fields: { templateHint: 'transcription', intent: 'Transcribe the audio that is not supplied.' }, code: 'INVALID_TRANSCRIPT_SOURCE' },
    { fields: { templateHint: 'table', context: 'Make a sales table without supplied rows.' }, code: 'MISSING_TABLE_SOURCE' },
    { fields: { templateHint: 'table', datasetId: 'unavailable-dataset' }, code: 'DATASET_NOT_FOUND' },
    { fields: { templateHint: 'image', assetIds: ['unavailable-asset'] }, code: 'ASSET_NOT_FOUND' },
    { fields: { templateHint: 'document', context: 'https://example.com/unfetched-passage' }, code: 'MISSING_DOCUMENT_SOURCE' },
    { fields: { templateHint: 'countdown', context: 'Start a deadline without an actual timestamp.' }, code: 'MISSING_TIME_SOURCE' },
  ] as { fields: Partial<SubmissionInput>; code: string }[])('rejects unavailable source honestly as $code, retaining existing good content', async ({ fields, code }) => {
    const submitted = request(fields);
    await expect(createInterpreter().interpret(submitted)).rejects.toMatchObject({ code });
    const previous = validateView(view('fact', { text: 'Last good content' }));
    await expect(createInterpreter().interpret({ ...submitted, display: { ...submitted.display, view: previous } })).rejects.toMatchObject({code});
    expect(previous.data.text).toBe('Last good content');
  });
});

describe('real acceptance and ordering across deterministic source-bound publishing paths', () => {
  it.each([
    { template: 'transcription', data: { status: 'live', SOURCE_ONLY_FIELD: 'SOURCE_ONLY_MARKER' }, code: 'INVALID_TRANSCRIPT_SOURCE' },
    { template: 'table', data: { columns: ['value'], rows: [{ value: { private: 'SOURCE_ONLY_MARKER' } }] }, code: 'INVALID_TABLE_SOURCE' },
  ] as const)('records $code as a caller-source failure through real HTTP while preserving the last good view', async ({ template, data, code }) => {
    server = await startHarness({});
    const owner = await server.account(), session = await owner.session(), display = await owner.display(session.id);
    const seeded = await owner.submit(session.id, [display.id], view('fact', { text: 'Last good content.' }), 'seed-good');
    const previous = seeded.detail.displays.find(item => item.id === display.id)!;
    success(await owner.request<UpdateRecord>('POST', `/api/sessions/${session.id}/submit`, { requestId: 'invalid-source', displayIds: [display.id], context: 'Explanatory context must not hide invalid source fields.', intent: 'Display the supplied source.', templateHint: template, data }));
    const failed = await owner.settle(session.id, 'invalid-source');
    expect(failed.update).toMatchObject({ status: 'failed', errorCode: code });
    expect(failed.update.validationIssues?.length).toBeGreaterThan(0);
    expect(JSON.stringify(failed.update)).not.toMatch(/SOURCE_ONLY_MARKER|SOURCE_ONLY_FIELD/);
    expect(failed.detail.displays.find(item => item.id === display.id)).toMatchObject({ revision: previous.revision, view: previous.view });
  });
});
