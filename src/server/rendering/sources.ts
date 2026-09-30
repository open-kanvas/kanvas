import { iframeDataSchema } from '../../shared/browsing-templates';
import type { InterpretationInput, SubmissionInput, TemplateId } from '../../shared/types.js';
import { codeDataSchema, isSafeUrl, mapDataSchema, templateViewSchema, webDataSchema } from '../../shared/view-schemas.js';
import { chartDataSchema, isAdvancedChartKind } from '../../shared/chart-contract.js';
import type { DatasetInput } from './datasets.js';
import { RenderingError } from './errors.js';
import { safeSchemaIssues } from './validation.js';

export function objectData(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
export function selectedAssets(input: InterpretationInput) {
  const ids = input.submission.assetIds ?? [];
  return input.assets.filter(asset => ids.includes(asset.id));
}

/** Literal scale/geometry settings must survive source-reference and dataset fast paths. */
export function suppliedAdvancedChartOptions(value: unknown): Record<string, unknown> {
  const data = objectData(value);
  return Object.fromEntries(['radarAxes', 'gauge', 'regions', 'directed'].flatMap(key => data?.[key] !== undefined ? [[key, data[key]]] : []));
}

/** Literal formats only: parsing cells is not permission to infer rows from prose. */
export function inlineTabularText(submission: SubmissionInput): Omit<DatasetInput, 'name'> | undefined {
  if (submission.templateHint && !['table', 'chart', 'number'].includes(submission.templateHint)) return;
  const text = typeof submission.data === 'string' ? submission.data : submission.data === undefined ? submission.context : undefined;
  if (!text?.trim()) return;
  const trimmed = text.trim();
  const fences = [...text.matchAll(/```(json|csv)\s*\r?\n([\s\S]*?)\r?\n?```/gi)];
  if (fences.length > 1) throw new RenderingError('INVALID_INLINE_DATA', 'Supply one inline JSON/CSV table per update, or select a datasetId.');
  if (fences.length === 1) return fences[0][1].toLowerCase() === 'json' ? { json: fences[0][2] } : { csv: fences[0][2] };
  if (/^[\[{]/.test(trimmed) && ['table', 'chart'].includes(submission.templateHint ?? '')) return { json: text };
  const lines = text.split(/\r?\n/);
  const split = (line: string): string[] => {
    let value = line.trim();
    if (value.startsWith('|')) value = value.slice(1);
    if (value.endsWith('|') && !value.endsWith('\\|')) value = value.slice(0, -1);
    const cells: string[] = []; let cell = '';
    for (let i = 0; i < value.length; i++) {
      if (value[i] === '\\' && value[i + 1] === '|') { cell += '|'; i++; }
      else if (value[i] === '|') { cells.push(cell.trim()); cell = ''; }
      else cell += value[i];
    }
    cells.push(cell.trim());
    return cells;
  };
  const starts = lines.flatMap((line, i) => i > 0 && line.includes('|') && split(line).every(cell => /^:?-{3,}:?$/.test(cell)) && lines[i - 1].includes('|') ? [i] : []);
  if (starts.length > 1) throw new RenderingError('INVALID_INLINE_DATA', 'Supply one inline table per update, or select a datasetId.');
  if (starts.length) {
    const divider = starts[0], columns = split(lines[divider - 1]);
    if (columns.length !== split(lines[divider]).length || new Set(columns).size !== columns.length || columns.some(column => !column || ['__proto__', 'prototype', 'constructor'].includes(column))) throw new RenderingError('INVALID_INLINE_DATA', 'Inline table headers must be unique, nonempty column names matching the separator row.');
    const rows: Record<string, unknown>[] = [];
    for (let i = divider + 1; i < lines.length && lines[i].trim() && lines[i].includes('|'); i++) {
      const cells = split(lines[i]);
      if (cells.length !== columns.length) throw new RenderingError('INVALID_INLINE_DATA', 'Every inline table row must contain exactly one cell per header.');
      rows.push(Object.fromEntries(columns.map((column, index) => [column, cells[index]])));
    }
    if (!rows.length) return { csv: columns.map(column => `"${column.replaceAll('"', '""')}"`).join(',') };
    return { rows };
  }
  // Plain CSV is explicit only in data, not guessed from descriptive conversation.
  if (typeof submission.data === 'string' && ['table', 'chart'].includes(submission.templateHint ?? '') && trimmed.includes('\n') && trimmed.split(/\r?\n/)[0].includes(',')) return { csv: text };
  return;
}

export function sourceUrls(input: InterpretationInput): Set<string> {
  const urls = new Set<string>(selectedAssets(input).map(asset => asset.url));
  const collect = (value: unknown, depth: number): void => {
    if (depth > 16) return;
    if (typeof value === 'string') {
      if (isSafeUrl(value)) urls.add(value);
      for (const match of value.matchAll(/https?:\/\/[^\s<>"']+/g)) {
        if (isSafeUrl(match[0])) urls.add(match[0]);
        const cleaned = match[0].replace(/[.,;:!?)]*$/, '');
        if (isSafeUrl(cleaned)) urls.add(cleaned);
      }
    } else if (value && typeof value === 'object') for (const child of Object.values(value)) collect(child, depth + 1);
  };
  collect(input.submission.data, 0); collect(input.submission.context, 0); collect(input.submission.intent, 0);
  if (input.submission.source?.url) urls.add(input.submission.source.url);
  return urls;
}

export function literalCodeData(input: InterpretationInput): Record<string, unknown> {
  const data = objectData(input.submission.data);
  if (data && ['code', 'before', 'after', 'files', 'tools'].some(key => key in data)) {
    const kind = data.kind ?? ('before' in data || 'after' in data ? 'diff' : 'files' in data ? 'tree' : 'tools' in data ? 'tools' : 'code');
    try { return codeDataSchema.parse({ ...data, kind }); }
    catch (error) { throw new RenderingError('INVALID_CODE_SOURCE', 'Supply literal code, exact before/after text, file records, or tool status in the code template fields.', false, safeSchemaIssues(error, ['data'])); }
  }
  const text = typeof input.submission.data === 'string' ? input.submission.data : typeof data?.text === 'string' ? data.text : input.submission.context;
  if (typeof text !== 'string' || !text.length) throw new RenderingError('MISSING_CODE_SOURCE', 'The code template needs literal source code in data.code, data text, or context (plain or fenced). It does not generate or execute code.');
  const opening = /^[ \t]*(`{3,}|~{3,})([^\r\n]*)\r?\n/m.exec(text);
  let code = text, language: string | undefined;
  if (opening) {
    const bodyStart = opening.index + opening[0].length;
    const closing = new RegExp(`^[ \\t]*${opening[1]}[ \\t]*\\r?$`, 'gm');
    closing.lastIndex = bodyStart;
    const end = closing.exec(text);
    if (end) { code = text.slice(bodyStart, end.index); language = opening[2].trim() || undefined; }
  }
  try { return codeDataSchema.parse({ kind: 'code', code, ...(language ? { language } : {}) }); }
  catch (error) { throw new RenderingError('INVALID_CODE_SOURCE', 'Literal source code exceeds the code template limits.', false, safeSchemaIssues(error, ['data'])); }
}

/** Returns only supplied labels/content. A URL is a link, not evidence of a fetch. */
export function suppliedIframeData(input: InterpretationInput): Record<string, unknown> {
  const data=objectData(input.submission.data),urls=[...sourceUrls(input)].filter(url=>url.startsWith('https://'));
  const payload=Array.isArray(data?.pages)?data:{pages:urls.map(url=>({url})),index:0};
  const parsed=iframeDataSchema.safeParse(payload);
  if(!parsed.success)throw new RenderingError('INVALID_WEB_SOURCE','Supply 1–16 public HTTPS page entries as data.pages:[{url,title?}], with a valid zero-based index. Website text is not fetched.',false,safeSchemaIssues(parsed.error));
  return parsed.data;
}

export function suppliedWebData(input: InterpretationInput, chosenUrl?: string): Record<string, unknown> {
  const data = objectData(input.submission.data);
  const urls = sourceUrls(input);
  const url = typeof data?.url === 'string' ? data.url : chosenUrl && urls.has(chosenUrl) ? chosenUrl : input.submission.source?.url ?? urls.values().next().value;
  if (!url || !urls.has(url)) throw new RenderingError('MISSING_WEB_SOURCE', 'The web template needs a supplied public URL or a selected PDF asset. KANVAS does not fetch pages or generate website mockups; use whiteboard for a described layout.');
  const parsed = webDataSchema.safeParse({ url, ...(typeof data?.title === 'string' ? { title: data.title } : input.submission.source?.title ? { title: input.submission.source.title } : {}),
    ...(typeof data?.text === 'string' ? { text: data.text } : {}), ...(typeof data?.snapshotUrl === 'string' ? { snapshotUrl: data.snapshotUrl } : {}),
    ...(typeof data?.retrievedAt === 'string' ? { retrievedAt: data.retrievedAt } : {}), ...(data?.embed === true ? { embed: true } : {}),
  });
  if (!parsed.success) throw new RenderingError('INVALID_WEB_SOURCE', 'The supplied web link, snapshot, or timestamp does not match the supported web fields.', false, safeSchemaIssues(parsed.error, ['data']));
  return parsed.data;
}

/** Run after inline-source normalization, before validation/rendering. */
export function preflightSourceRequirements(input: InterpretationInput): void {
  if (input.submission.view) return;
  const template = input.submission.templateHint;
  const data = objectData(input.submission.data);
  if (template === 'map') {
    if (!data || !['center', 'markers', 'routes', 'polygons'].some(key => key in data)) throw new RenderingError('MISSING_MAP_SOURCE', 'Maps require supplied coordinates: data.center {lat,lng}, markers, routes, or polygons. A place name alone is not enough; KANVAS does not geocode or invent locations.');
    const parsed = mapDataSchema.safeParse(data);
    if (!parsed.success) throw new RenderingError('INVALID_MAP_SOURCE', 'Map coordinates or geometry do not match the template fields and bounds.', false, safeSchemaIssues(parsed.error, ['data']));
  }
  if (template === 'code') literalCodeData(input);
  if (template === 'transcription') {
    // Instructions belong in intent, not in a fabricated transcript. An
    // explicitly supplied but malformed data object must not fall back to
    // context or repaired from descriptive instructions.
    const literal = typeof input.submission.data === 'string' ? input.submission.data : input.submission.data === undefined ? input.submission.context : undefined;
    const transcript = typeof literal === 'string' ? { segments: [{ id: 'supplied-1', text: literal }], status: 'complete' } : input.submission.data;
    const parsed = templateViewSchema('transcription').safeParse({ version: 1, template: 'transcription', data: transcript });
    if (!parsed.success) throw new RenderingError('INVALID_TRANSCRIPT_SOURCE', 'Supply exact transcript words in context or a data string, or data.segments with {id,text} and optional speaker/timestamp. Keep display instructions in intent. KANVAS does not capture audio or reconstruct missing words.', false, safeSchemaIssues(parsed.error));
  }
  if (template === 'drafting') {
    const literal = typeof input.submission.data === 'string' ? input.submission.data : input.submission.context;
    const parsed = templateViewSchema('drafting').safeParse({ version: 1, template: 'drafting', data: data ?? (typeof literal === 'string' ? { text: literal } : undefined) });
    if (!parsed.success) throw new RenderingError('INVALID_DRAFT_SOURCE', 'Supply the exact draft in data.text or context, with suggestions anchored to that text. A description of a draft is not its content.', false, safeSchemaIssues(parsed.error));
  }
  if (template === 'now-playing') {
    const parsed = templateViewSchema('now-playing').safeParse({ version: 1, template: 'now-playing', data });
    if (!parsed.success) throw new RenderingError('INVALID_PLAYBACK_SOURCE', 'Supply the actual track and artist plus optional source artwork and playback state. Describing a player does not provide its current content.', false, safeSchemaIssues(parsed.error));
  }
  if (template === 'document') {
    const text = data?.text ?? data?.sourceText ?? (typeof input.submission.data === 'string' ? input.submission.data : input.submission.context);
    if (!(typeof text === 'string' && text.trim() && !isSafeUrl(text.trim())) && !(Array.isArray(data?.images) && data.images.length)) throw new RenderingError('MISSING_DOCUMENT_SOURCE', 'The document template needs supplied excerpt text or source images/crops. A URL or source title alone is not fetched; provide the actual passage or image.');
  }
  if (template === 'web') suppliedWebData(input); // retained legacy input only
  if ((template === 'iframe' || template === 'website')) suppliedIframeData(input);
  if(template==='list'){const parsed=templateViewSchema('list').safeParse({version:1,template:'list',data});if(!parsed.success)throw new RenderingError('UNBOUND_SOURCE','Supply the actual list items, ordered/unordered style and optional pageSize.',false,safeSchemaIssues(parsed.error));}
  if (template === 'image' || template === 'video') {
    const kind = template === 'image' ? 'image/' : 'video/';
    const assets = selectedAssets(input);
    const externalSource = [...sourceUrls(input)].some(url => !assets.some(asset => asset.url === url));
    if (!externalSource && !assets.some(asset => asset.mimeType.startsWith(kind))) throw new RenderingError(template === 'image' ? 'MISSING_IMAGE_SOURCE' : 'MISSING_VIDEO_SOURCE', `The ${template} template needs a supplied media URL or selected ${template} asset. It does not generate media from a description.`);
  }
  const nativeChart = template === 'chart' && data && (Array.isArray(data.series) || typeof data.kind === 'string' && isAdvancedChartKind(data.kind) && (Array.isArray(data.nodes) || Array.isArray(data.regions)));
  if ((template === 'table' || template === 'chart') && !input.submission.datasetId && !nativeChart && !(template === 'table' && Array.isArray(data?.columns) && Array.isArray(data?.rows))) throw new RenderingError('MISSING_TABLE_SOURCE', 'Supply small inline data in data.rows (objects), data.csv, data.json, a fenced JSON/CSV or Markdown table in context, or a datasetId. Native chart series, graph nodes/links and supplied region geometry are supported. Numeric rows or region boundaries are not inferred from prose.');
  if (template === 'table' && !input.submission.datasetId && Array.isArray(data?.columns) && Array.isArray(data?.rows)) {
    const parsed = templateViewSchema('table').safeParse({ version: 1, template: 'table', data });
    if (!parsed.success) throw new RenderingError('INVALID_TABLE_SOURCE', 'Supply unique columns and rows containing string, finite number, boolean or null cells. Object row keys must name supplied columns; row arrays must match column order and length. A descriptive context does not repair malformed table data.', false, safeSchemaIssues(parsed.error));
  }
  if (nativeChart && !input.submission.datasetId) {
    const parsed = chartDataSchema.safeParse(data);
    if (!parsed.success) throw new RenderingError('INVALID_CHART_SOURCE', 'Supply the actual observations, weights, ranges and geometry required by this chart kind.', false, safeSchemaIssues(parsed.error, ['data']));
  }
  if (template === 'schedule' || template === 'countdown') {
    const parsed = templateViewSchema(template).safeParse({ version: 1, template, data });
    if (!parsed.success) throw new RenderingError('MISSING_TIME_SOURCE', 'Supply the exact date/time fields: schedule date, timeZone and timestamped events; countdown endsAt; or direction:up with startedAt. Time instants need an explicit UTC offset. KANVAS does not invent event times.', false, safeSchemaIssues(parsed.error));
  }
}
