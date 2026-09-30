import { assertJsonBudget, validateView } from '../../shared/view-schemas.js';
import type { DatasetRecord, InterpretationInput, Interpreter, SubmissionInput } from '../../shared/types.js';
import { materializeDatasetView, parseDataset } from './datasets.js';
import { RenderingError } from './errors.js';
import { renderSuppliedContent } from './deterministic.js';
import { inlineTabularText, objectData, preflightSourceRequirements } from './sources.js';
import { safeSchemaIssues } from './validation.js';

/** Parse inline source once at acceptance; the service supplies a durable, session-scoped ID. */
export function inlineDatasetForSubmission(submission: SubmissionInput, datasetId: string): DatasetRecord | undefined {
  if (submission.datasetId || submission.view) return;
  const data = objectData(submission.data);
  if (submission.templateHint === 'table' && Array.isArray(data?.columns)) return;
  if (typeof objectData(data?.binding)?.datasetId === 'string') return;
  const canBeDataset = !submission.templateHint || ['chart', 'table', 'number'].includes(submission.templateHint);
  let inline: ReturnType<typeof parseDataset> | undefined;
  if (canBeDataset && data && ['rows', 'csv', 'json'].some(key => Object.hasOwn(data, key))) inline = parseDataset({ name: 'Inline source', rows: data.rows, csv: data.csv as string | undefined, json: data.json as string | undefined, source: submission.source });
  else if (canBeDataset && Array.isArray(submission.data) && submission.data.length && objectData(submission.data[0])) inline = parseDataset({ name: 'Inline source', rows: submission.data, source: submission.source });
  else if (canBeDataset) {
    const source = inlineTabularText(submission);
    if (source) inline = parseDataset({ name: 'Inline source', ...source, source: submission.source });
  }
  if (!inline) return;
  const { summary: _summary, ...parsed } = inline;
  return { ...parsed, id: datasetId, sessionId: submission.sessionId, createdAt: new Date().toISOString() };
}

function prepareInput(input: InterpretationInput): InterpretationInput {
  const submission = { ...input.submission };
  const bindingId = objectData(objectData(submission.data)?.binding)?.datasetId;
  if (!submission.datasetId && !submission.view && typeof bindingId === 'string') submission.datasetId = bindingId;
  input = { ...input, submission };
  if (submission.context && (typeof submission.context !== 'string' || submission.context.length > 12_000)) throw new RenderingError('CONTEXT_TOO_LARGE', 'Display context is limited to 12,000 characters.');
  if (submission.intent && (typeof submission.intent !== 'string' || submission.intent.length > 1000)) throw new RenderingError('CONTEXT_TOO_LARGE', 'Display intent is limited to 1,000 characters.');
  if (submission.data !== undefined) {
    try { assertJsonBudget(submission.data, 5 * 1024 * 1024, 1_400_000); }
    catch { throw new RenderingError('INVALID_CONTENT', 'Source data exceeds its JSON byte/complexity limit.'); }
  }
  if (submission.assetIds?.some((id) => !input.assets.some((asset) => asset.id === id && asset.sessionId === submission.sessionId))) throw new RenderingError('ASSET_NOT_FOUND', 'A selected asset is unavailable in this session.');
  if (submission.datasetId) {
    if (!input.datasets.some((dataset) => dataset.id === submission.datasetId && dataset.sessionId === submission.sessionId)) throw new RenderingError('DATASET_NOT_FOUND', 'Referenced dataset is unavailable in this session.');
    return input;
  }
  if (submission.view) return input;
  const dataset = inlineDatasetForSubmission(submission, 'inline-source');
  if (!dataset) return input;
  return { ...input, submission: { ...submission, datasetId: dataset.id }, datasets: [dataset] };
}

/** Pure deterministic rendering: no provider, queue, prompt or inferred content. */
export function createInterpreter(): Interpreter {
  return {
    async interpret(originalInput) {
      const started = performance.now();
      const input = prepareInput(originalInput);
      let view;
      try {
        if (input.submission.view) view = validateView({ ...input.submission.view, source: input.submission.view.source ?? input.submission.source });
        else {
          preflightSourceRequirements(input);
          view = renderSuppliedContent(input).view;
        }
        if (!view) throw new RenderingError('PREPARED_VIEW_REQUIRED', 'Supply literal content with an explicit templateHint, or a prepared view {version:1,template,data}. Kanvas does not generate or interpret instructions.');
        view = materializeDatasetView(view, input.datasets);
      } catch (error) {
        if (error instanceof RenderingError) throw error;
        throw new RenderingError('INVALID_SOURCE_CONTENT', 'Supplied content does not match the template. Read its schema and supply a valid prepared view.', false, safeSchemaIssues(error));
      }
      const metrics = { path: input.submission.view ? 'prepared' : 'source', validationMs: Math.round(performance.now() - started) };
      return JSON.stringify(view) === JSON.stringify(input.display.view) ? { action: 'retain', metrics } : { action: 'replace', view, metrics };
    },
  };
}
