import { suppliedAdvancedChartOptions } from './sources.js';
import type { InterpretationInput, InterpretationResult, TemplateId, ViewSpec } from '../../shared/types.js';
import { factDataSchema, leafViewSchema, validateView } from '../../shared/view-schemas.js';
import { summarizeDataset } from './datasets.js';
import { RenderingError } from './errors.js';
import { literalCodeData, objectData, selectedAssets, suppliedWebData, suppliedIframeData } from './sources.js';
export { objectData, selectedAssets } from './sources.js';
export function assetViewData(input: InterpretationInput, template: TemplateId): Record<string, unknown> {
  const assets = selectedAssets(input);
  if (template === 'image') {
    const images = assets.filter((asset) => asset.mimeType.startsWith('image/')).slice(0, 4).map((asset) => ({ url: asset.url, alt: asset.name }));
    if (!images.length) throw new RenderingError('INVALID_ASSET_REFERENCE', 'No supplied image asset is available.');
    return { images };
  }
  if (template === 'video') {
    const video = assets.find((asset) => asset.mimeType.startsWith('video/'));
    if (!video) throw new RenderingError('INVALID_ASSET_REFERENCE', 'No supplied video asset is available.');
    return { url: video.url };
  }
  if (template === 'web') {
    const document = assets.find((asset) => asset.mimeType === 'application/pdf');
    if (document) return { url: document.url, title: document.name, text: 'PDF document · protected download' };
  }
  throw new RenderingError('INVALID_ASSET_REFERENCE', 'These assets cannot populate the selected template.');
}

/** Render only supplied content; ambiguous structured input requires a prepared view. */
export function renderSuppliedContent(input: InterpretationInput): InterpretationResult {
  const { submission } = input;
  const data = objectData(submission.data);
  const text = typeof submission.data === 'string' ? submission.data : typeof data?.text === 'string' ? data.text : (submission.context ?? '');
  const source = submission.source;
  const make = (template: TemplateId, value: Record<string, unknown>): InterpretationResult => ({ action: 'replace', view: validateView({ version: 1, template, data: value, ...(source ? { source } : {}) }) });
  if (submission.datasetId) {
    const dataset = input.datasets.find((item) => item.id === submission.datasetId);
    if (!dataset) throw new RenderingError('DATASET_NOT_FOUND', 'Referenced dataset is unavailable in this session.');
    const summary = summarizeDataset(dataset);
    const numbers = summary.columns.filter((column) => column.kind === 'number');
    const requestedBinding = objectData(data?.binding);
    if (submission.templateHint && !['table', 'chart', 'number'].includes(submission.templateHint)) throw new RenderingError('PREPARED_VIEW_REQUIRED', 'This dataset cannot populate the requested template. Supply a prepared view, or choose table/chart with source bindings.');
    if (submission.templateHint === 'number' && !requestedBinding) throw new RenderingError('PREPARED_VIEW_REQUIRED', 'A dataset number requires an explicit column and row or aggregation binding. Supply that binding or a prepared view.');
    if (submission.templateHint === 'number' && requestedBinding) return make('number', { ...(data?.label ? { label: data.label } : {}), ...(data?.unit ? { unit: data.unit } : {}), binding: { ...requestedBinding, datasetId: dataset.id } });
    if (submission.templateHint === 'table' || !submission.templateHint) return make('table', { binding: { ...requestedBinding, datasetId: dataset.id, columns: requestedBinding?.columns ?? dataset.columns } });
    if (requestedBinding) return make('chart', { ...suppliedAdvancedChartOptions(data), kind: data?.kind ?? 'line', binding: { ...requestedBinding, datasetId: dataset.id }, ...(data?.unit ? { unit: data.unit } : {}), ...(data?.xLabel ? { xLabel: data.xLabel } : {}), ...(data?.yLabel ? { yLabel: data.yLabel } : {}) });
    if (!numbers.length) return make('table', { binding: { datasetId: dataset.id } });
    const x = summary.columns.find((column) => ['date', 'text'].includes(column.kind))?.name ?? (numbers.length > 1 ? numbers[0].name : undefined);
    const y = numbers.filter((column) => column.name !== x).slice(0, 4).map((column) => column.name);
    const kind = data?.kind === 'bar' || (x && summary.columns.find((column) => column.name === x)?.kind === 'text') ? 'bar' : 'line';
    // Large datasets never get silently sampled; an explicit requested binding can authorize it.
    if (dataset.rows.length * y.length > 5000) return make('table', { binding: { datasetId: dataset.id } });
    return make('chart', { kind, binding: { datasetId: dataset.id, ...(x ? { x } : {}), y } });
  }
  const assets = selectedAssets(input);
  if (assets.length && submission.data === undefined) {
    const template = submission.templateHint ?? (assets.some((asset) => asset.mimeType.startsWith('image/')) ? 'image' : assets.some((asset) => asset.mimeType.startsWith('video/')) ? 'video' : 'web');
    return make(template, assetViewData(input, template));
  }
  let template = submission.templateHint;
  if (!template && typeof submission.data === 'number') template = 'number';
  if (!template && (typeof submission.data === 'string' || (data && Object.keys(data).every(key => ['text','subtitle','items'].includes(key)) && typeof data.text === 'string') || (submission.data === undefined && typeof submission.context === 'string'))) template = 'fact';
  if (!template) throw new RenderingError('PREPARED_VIEW_REQUIRED', 'Ambiguous content: supply an explicit templateHint with schema-valid data, or a prepared view {version:1,template,data}. Instructions in intent are not display content.');
  if(['iframe','website'].includes(template))return make(template,suppliedIframeData(input));
  if (data) {
    const direct = leafViewSchema.safeParse({ version: 1, template, data, source });
    if (direct.success) return { action: 'replace', view: validateView(direct.data) };
  }
  switch (template) {
    case 'fact':
      return make('fact', factDataSchema.parse(data ?? { text }));
    case 'number': {
      const value = typeof submission.data === 'number' || typeof submission.data === 'string' ? submission.data : data?.value;
      if (value === undefined) throw new RenderingError('INVALID_CONTENT', 'Number display requires a supplied value.');
      return make('number', { ...(data ?? {}), value });
    }
    case 'image':
      return make('image', { images: data?.images ?? [{ url: data?.url ?? text, alt: typeof data?.alt === 'string' ? data.alt : '' }] });
    case 'web':
      return make('web', suppliedWebData(input));
    case 'checklist': {
      const items = Array.isArray(submission.data) ? submission.data : Array.isArray(data?.items) ? data.items : text.split(/\r?\n/).filter(Boolean);
      return make('checklist', { items: items.map((item, index) => typeof item === 'string' ? { id: `item-${index + 1}`, text: item.replace(/^\s*(?:[-*]|\d+\.)\s+/, ''), checked: false } : item) });
    }
    case 'code':
      return make('code', literalCodeData(input));
    case 'whiteboard': {
      if (data?.elements) return make('whiteboard', data);
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(submission.data) ? submission.data : text.split(/\r?\n/).filter(line => line.trim());
      if (!items.length || items.length > 100 || items.some(item => typeof item !== 'string')) throw new RenderingError('INVALID_SOURCE_CONTENT', 'Supply whiteboard elements or 1–100 text items; each supplied item is preserved.');
      const columns = Math.min(3, Math.ceil(Math.sqrt(items.length))), width = 1200 / columns;
      return make('whiteboard', { elements: items.map((item, index) => ({ id: `source-${index+1}`, type: 'text', x: 30+(index%columns)*width, y: 30+Math.floor(index/columns)*150, width: width-45, height: 130, text: item, color: '#a1a1aa' })) });
    }
    case 'presentation':
      return make('presentation', data ?? { slides: [{ version: 1, template: 'fact', data: { text } }], index: 0 });
    case 'document':
      if (data && typeof data.sourceText === 'string' && data.text === undefined) {
        const { sourceText, ...rest } = data;
        return make('document', { ...rest, text: sourceText });
      }
      return make('document', data ?? { text, quote: true });
    case 'video':
      return make('video', data ?? { url: text });
    case 'transcription':
      return make('transcription', data ?? { segments: [{ id: 'supplied-1', text }], status: 'complete' });
    case 'drafting':
      return make('drafting', data ?? { text, status: 'drafting' });
    case 'clock':
      return make('clock', data ?? {});
    default:
      if (data) return make(template, data);
      throw new RenderingError('INVALID_CONTENT', 'This template needs structured source data.');
  }
}
