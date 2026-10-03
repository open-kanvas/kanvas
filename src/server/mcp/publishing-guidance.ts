import type { SubmissionInput, TemplateId } from '../../shared/types.js';

export interface PublishingRecipe {
  id: string;
  when: string;
  path: 'source-bound' | 'prepared';
  arguments: SubmissionInput;
  expectedTemplate: TemplateId;
  note: string;
}

const target = { sessionId: 'session-id', displayIds: ['display-id'] };

/** Complete, inert submit arguments; no schema lookup or generated rows required. */
export const PUBLISHING_RECIPES: readonly PublishingRecipe[] = [
  {
    id: 'literal-fact', when: 'Show a supplied short statement with prose intent.', path: 'source-bound', expectedTemplate: 'fact',
    arguments: { ...target, requestId: 'fact-context-1', context: 'The supplied count is 17.', intent: 'Show this supplied statement as one short fact.', templateHint: 'fact' },
    note: 'The supplied text is rendered exactly. Instructions are not interpreted.',
  },
  {
    id: 'literal-transcription', when: 'Show exact supplied words without constructing segments.', path: 'source-bound', expectedTemplate: 'transcription',
    arguments: { ...target, requestId: 'transcript-context-1', context: 'These are the exact supplied words.\nKeep this line too.', intent: 'Display these words verbatim as a completed transcript.', templateHint: 'transcription' },
    note: 'The literal context becomes one complete segment. No speaker or timestamp is inferred; no audio is captured or transcribed.',
  },
  {
    id: 'structured-transcription', when: 'Retain supplied segment IDs, speakers and timestamps.', path: 'source-bound', expectedTemplate: 'transcription',
    arguments: { ...target, requestId: 'transcript-data-1', context: 'The following data is the supplied transcript.', intent: 'Show every supplied segment without rewriting.', templateHint: 'transcription', data: { segments: [{ id: 'segment-1', text: 'Exact supplied words.', speaker: 'Speaker A', timestamp: '00:01.020' }], status: 'live' } },
    note: 'data is the template data object itself, not {transcription:{...}}. context explains the source; it does not replace data.segments.',
  },
  {
    id: 'rows-table', when: 'Publish exact small tabular data without hand-authoring a table view.', path: 'source-bound', expectedTemplate: 'table',
    arguments: { ...target, requestId: 'table-rows-1', context: 'These are the supplied ledger rows.', intent: 'Show every supplied row and its exact decimal text; do not aggregate, filter or round.', templateHint: 'table', data: { rows: [{ item: 'A', amount: '1.2300' }, { item: 'B', amount: '9007199254740993' }] } },
    note: 'Object rows are imported and source-bound. Use strings for significant trailing zeros or unsafe integers; pagination is not row omission.',
  },
  {
    id: 'literal-table', when: 'The exact small table is already available as literal text.', path: 'source-bound', expectedTemplate: 'table',
    arguments: { ...target, requestId: 'table-context-1', context: '```csv\nitem,amount\nA,1.2300\nB,9007199254740993\n```', intent: 'Show every supplied row without changing numeric text.', templateHint: 'table' },
    note: 'One fenced JSON/CSV block or one Markdown table in context is parsed literally. A prose request for missing rows is not a table source.',
  },
  {
    id: 'stored-table', when: 'The authorized session already has an imported dataset.', path: 'source-bound', expectedTemplate: 'table',
    arguments: { ...target, requestId: 'table-dataset-1', datasetId: 'dataset-id', intent: 'Display the supplied dataset as a table without aggregation.', templateHint: 'table' },
    note: 'Replace dataset-id with the returned ID of an existing dataset in this session. Unavailable or cross-session sources fail; they are not fetched or reconstructed.',
  },
  {
    id: 'native-fact', when: 'Show exact short text with no generative step.', path: 'source-bound', expectedTemplate: 'fact',
    arguments: { ...target, requestId: 'fact-data-1', intent: 'Show this exact supplied sentence.', templateHint: 'fact', data: { text: 'Exact supplied sentence.' } },
    note: 'A valid explicit templateHint plus its native data is source-bound. The final strict template schema still applies.',
  },
  {
    id: 'prepared-transcription', when: 'The caller already has a complete validated view.', path: 'prepared', expectedTemplate: 'transcription',
    arguments: { ...target, requestId: 'transcript-view-1', view: { version: 1, template: 'transcription', data: { segments: [{ id: 'segment-1', text: 'Exact supplied words.' }], status: 'complete' } } },
    note: 'A prepared view uses direct validation, preserving, source-access checks, revision ordering or browser acknowledgement.',
  },
];

export interface CommonDataShape {
  template: TemplateId;
  fields: Record<string, string>;
  examples: readonly Record<string, unknown>[];
  rules: string;
}

/** Bounded quick references, not duplicate schemas or a substitute for validation. */
export const COMMON_DATA_SHAPES: readonly CommonDataShape[] = [
  { template: 'fact', fields: { text: 'Required string, 1–3000 characters.', subtitle: 'Optional string.', items: 'Optional string array, at most 12.' }, examples: [{ text: 'Exact supplied sentence.' }], rules: 'Use data.text, not data.fact or an unnamed text value inside a prepared view.' },
  { template: 'transcription', fields: { segments: 'Required nonempty array of {id:string,text:string,speaker?:string,timestamp?:string}.', status: 'Optional live | complete; default complete.', language: 'Optional language string.' }, examples: [{ segments: [{ id: 'segment-1', text: 'Exact supplied words.', speaker: 'Speaker A', timestamp: '00:01.020' }], status: 'live' }], rules: 'IDs must be unique; timestamp is an opaque supplied string, not a guessed date or reconstructed audio time.' },
  { template: 'table', fields: { columns: 'String array, at most 64 unique names; required without a dataset binding.', rows: 'Object rows keyed by columns, or cell arrays exactly matching column order.', pageSize: 'Optional integer 1–100; default 12.', rowStyles: 'Optional [{row:0,background:"#123456",color:"#ffffff"}], arbitrary RGB hex colours; row indexes refer to retained source rows.', cellStyles: 'Optional [{row:0,column:"status",background:"#654321",indicator:{kind:"dot",color:"#abcdef",label:"Available"}}]. Indicator kinds dot, icon (name) or image (url); labels required. Cell colours override row colours. Text colour defaults to readable black/white. Styling stays with the original row through filtering/sorting.' }, examples: [{ columns: ['item', 'amount'], rows: [{ item: 'A', amount: '1.2300' }, { item: 'B', amount: '9007199254740993' }] }], rules: 'Cells are strings, finite numbers, booleans or null. A loose submit may instead use data.rows and let KANVAS supply the dataset binding; a prepared view must have its own complete shape.' },
  { template: 'number', fields: { value: 'Finite number or nonempty string up to 100 characters; required without a dataset binding.', label: 'Optional label string.', unit: 'Optional unit string.' }, examples: [{ value: '1.2300', label: 'Supplied amount' }], rules: 'Keep significant decimal text as a string. Do not infer a statistic or unit not present in the source.' },
  { template: 'checklist', fields: { items: 'Required array of 1–100 {id:string,text:string,checked?:boolean,detail?:string}.' }, examples: [{ items: [{ id: 'item-1', text: 'Supplied task', checked: false }] }], rules: 'Item IDs must be unique. Preserve supplied task content and checked state.' },
  { template: 'countdown', fields: { direction: 'Optional down | up; omitted means down.', endsAt: 'Required timezone-qualified timestamp for down.', startedAt: 'Required timezone-qualified timestamp for up.', paused: 'Optional boolean.', pausedRemainingSeconds: 'Required finite nonnegative snapshot for paused down.', pausedElapsedSeconds: 'Required finite nonnegative snapshot for paused up.', label: 'Optional timer label.' }, examples: [{ endsAt: '2030-01-01T12:00:00Z', label: 'Supplied deadline' }, { direction: 'up', startedAt: '2030-01-01T12:00:00Z', label: 'Supplied start' }], rules: 'Use only fields for the selected direction. Example timestamps are syntax, not the actual time. Control an existing timer with kanvas_timer_control and current revision.' },
  { template: 'code', fields: { kind: 'code for a literal code pane; other kinds have separate shapes.', code: 'Literal source string for kind:code.', language: 'Optional supplied language label.' }, examples: [{ kind: 'code', code: 'const count = 17;\n', language: 'javascript' }], rules: 'Supply exact code; displaying it neither generates missing code nor executes it. Literal code can also go in context with templateHint:code.' },
];

export const PUBLISHING_GUIDANCE = {
  start: 'When asked to start/use Kanvas without an active session, first call kanvas_account_begin to find a connected owned screen or return the bare startUrl. No long/short URL narration is needed. For direct publishing first use can call kanvas_submit with only requestId and content; automatic setup returns actual viewer URLs and a scoped targetRef. Continue using that reference or explicit targets. If needs_target is returned, resolve the one scoped choice. For existing sessions read permissions, displays and held state. Use kanvas_submit to publish or replace content; do not use display_update, which changes viewport/hold only.',
  choose: 'For an unfamiliar or advanced template, read kanvas_template_get before constructing data. Prefer a complete prepared view {version:1,template,data} when you control the fields; use templateHint with source content only with literal or template-shaped data. A hint does not validate an invented shape. Familiar native fields need no redundant lookup.',
  fields: {
    context: 'Relevant source text or surrounding context. For a literal transcription, this is the actual supplied wording, not a request to listen or fetch something.',
    intent: 'The desired display operation and fidelity constraints. Instructions here are not substituted for missing transcript, table, media or time data.',
    templateHint: 'The existing template ID, for example fact, transcription or table. This selects a contract; it does not fabricate required source content.',
    data: 'Actual native template fields, or exact inline rows/CSV/JSON. Structured data wins over descriptive context; missing required fields are not filled from prose.',
    view: 'A complete {version:1,template,data} ViewSpec. Do not combine competing prepared-view and loose-source paths in one request.',
  },
  fidelity: 'Native template data and supported literal transcript/code/table sources remain source-bound. Ambiguous input requires an explicit templateHint or prepared view. Store significant decimals or unsafe integers as strings, or supply original CSV/JSON text; already-rounded JavaScript numbers cannot be recovered. Do not summarize source rows into a sample. A table may paginate while retaining all rows.',
  inspection: 'Common fields and complete arguments are supplied here and in tool discovery. These quick references are intentionally bounded; the runtime schema remains authoritative and reports safe field paths and rules for invalid input.',
  recovery: {
    arguments: 'INVALID_ARGUMENT or validationIssues naming request fields: correct the caller’s JSON. A missing template field is not a provider outage.',
    source: 'INVALID_TRANSCRIPT_SOURCE, INVALID_TABLE_SOURCE, INVALID_SOURCE_CONTENT or MISSING_*_SOURCE: supply the real source or fix its exact fields. Do not retry unchanged or invent missing values.',
    unavailable: 'DATASET_NOT_FOUND or ASSET_NOT_FOUND: use an accessible source from the same session, or import the actual authorized source. An ID, URL or title is not evidence that content was fetched.',
  },
  delivery: 'Do not remain silent on failure: state the error and next corrective step briefly. Do not say shown until delivery confirms the receiving browser. If preparation is pending, say preparing; if no browser is connected, say saved and awaiting a screen. Acceptance starts an asynchronous update. Inspect kanvas_update_status using the returned update ID; prepared means saved, not painted. Check delivery separately. A newer accepted update supersedes a slow older completion. Reuse a requestId only for an identical retry; new content needs a new ID.',
  boundaries: 'Examples use inert IDs and illustrative source values, not access grants or actual facts. KANVAS does not fetch absent rows, transcribe audio, geocode place names or invent timestamps. Host tool loading, real-provider behavior and browser delivery must be verified in their own environments.',
} as const;

/** Small submit-description fragment; common schemas are not repeated per tool. */
export const PUBLISHING_DESCRIPTION = 'Read template_get for unfamiliar fields; prefer prepared {version:1,template,data}. Report failure; verify update_status and browser delivery before claiming shown. Familiar native data needs no extra lookup: use source context/data + intent + templateHint, or a complete view. Literal transcription example arguments: {"sessionId":"session-id","displayIds":["display-id"],"requestId":"transcript-1","context":"Exact supplied words.","intent":"Show these words verbatim.","templateHint":"transcription"}. Common native data shapes: fact {"text":"Exact words."}; transcription {"segments":[{"id":"s1","text":"Exact words."}],"status":"live"}; table {"columns":["item","amount"],"rows":[{"item":"A","amount":"1.2300"}]}. Loose tables can use data:{"rows":[{"item":"A","amount":"1.2300"}]}; prose cannot replace missing rows. data is the template object, not a template-named wrapper. Valid explicitly hinted native data is deterministic; prose selection may use the interpreter. Inspect update_status for preparation versus delivery. Examples are inert syntax, not authorization or live facts.';
