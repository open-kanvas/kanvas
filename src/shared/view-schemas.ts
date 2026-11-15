import {databaseSchemaDataSchema} from './database-schema.js';
import { instrumentDataSchema } from './instrument.js';
import { captionDataSchema } from './local-sequence.js';
import {mathWorkspaceSchema} from './math-workspace.js';
import {vennSchema} from './statistical-visuals.js';
import {moleculeDataSchema} from './molecules.js';
import {scene3dSchema} from './scene3d.js';
import {signageDataSchema} from './signage.js';
import { gameDataSchema } from './game.js';
import {satisfactionDataSchema} from './satisfaction.js';
import {trafficDemoSchema} from './traffic-demo.js';
import {venueSchemas} from './venue.js';
import {customViewSchema} from './custom-templates.js';
import { flashcardDataSchema } from './flashcards.js';
import { devicePreviewDataSchema } from './device-preview.js';
import { emphasisSchema } from './emphasis.js';
import { VERBATIM_SOURCE, SOURCE_RECORD_TEMPLATES } from './source-guidance.js';
import {architectureDataSchema,sportsLineupDataSchema,orgChartDataSchema,flowchartDataSchema,networkDataSchema} from './diagrams.js';
import { viewFormatSchema } from './regional.js';
import { galleryDataSchema,boardBackgroundSchema } from './image-gallery.js';
import { scoreboardDataSchema,standingsDataSchema,toolLogDataSchema } from './event-views.js';
import { jsonDataSchema,topologyDataSchema } from './connection-views.js';
import { taskListDataSchema } from './task-list.js';
import { colourDataSchema } from './colour.js';
import { iconPickerDataSchema, fontPickerDataSchema } from './pickers.js';
import { toolCallDetailsDataSchema, agentsDataSchema, welcomeDataSchema } from './nov10-templates.js';
import { tableRowStyleSchema,tableCellStyleSchema } from './table-style.js';
import { workSchemas } from './work-views.js';
import { selectionSchema, selectionKey } from './selection.js';
import { countdownDataSchema } from './timer.js';
import { nowPlayingDataSchema } from './now-playing.js';
import { rosterDataSchema } from './roster.js';
import { displayGridDataSchema } from './display-grid.js';
import { devicesViewDataSchema } from './devices-view.js';
export { devicesViewDataSchema } from './devices-view.js';
import { calendarDataSchema, plannerDataSchema } from './planner.js';
export { plannerDataSchema } from './planner.js';
export { displayGridDataSchema } from './display-grid.js';
export { rosterDataSchema } from './roster.js';
export type { RosterData } from './roster.js';
export { nowPlayingDataSchema } from './now-playing.js';
export type { NowPlayingData } from './now-playing.js';
import { clockDataSchema } from './clock.js';
export { clockDataSchema } from './clock.js';
export type { ClockData } from './clock.js';
export { countdownDataSchema } from './timer.js';
export type { CountdownData } from './timer.js';
import { isSafeUrl, isAllowedEmbedUrl } from './urls.js';
import { z } from 'zod';
import { progressDataSchema, logDataSchema } from './task-views.js';
import { videoEmbed } from './video-embed.js';
import { draftingDataSchema } from './drafting.js';
export { draftingDataSchema } from './drafting.js';
export type { DraftingData } from './drafting.js';
import { extendedSchemas } from './extended-templates.js';
import { iframeDataSchema, listDataSchema } from './browsing-templates.js';
import { cellSchema, datasetBindingSchema, summarySchema, chartDataSchema } from './chart-contract.js';
export { cellSchema, datasetBindingSchema, chartPointSchema, chartDataSchema } from './chart-contract.js';
export type { Cell, DatasetBinding, ChartPoint, ChartData } from './chart-contract.js';
import type { Provenance, TemplateId, ViewSpec } from './types.js';
import { SPLIT_LIMITS, splitGrid, splitLeaves, mapSplitViewsSync } from './split-screen.js';
import { monitorStreamDataSchema } from './monitor-stream-view.js';
import { messageBoardDataSchema } from './message-board.js';

/** Shared, browser-safe contracts. Content is text/data, never executable markup. */
export const VIEW_LIMITS = { bytes: 2 * 1024 * 1024, points: 5000, tableRows: 1000, slides: 64, boardElements: 1000, transcriptSegments: 1000, formFields: 40, scheduleEvents: 500, pollOptions: 12 } as const;
const short = z.string().max(500);
const label = z.string().min(1).max(200);
const identifier = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_.:-]+$/);
const finite = z.number().finite();
const positiveInteger = z.number().int().positive();
const dangerousKeys = new Set(['__proto__', 'prototype', 'constructor']);


export { isSafeUrl, isAllowedEmbedUrl } from './urls.js';
export const safeUrlSchema = z.string().max(2048).refine(isSafeUrl, 'Expected a public HTTP(S) URL or a protected asset URL');
const dateTime = z.string().max(60).refine((v) => /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v)), 'Expected an ISO timestamp');
export const provenanceSchema: z.ZodType<Provenance> = z.object({
  title: short.optional(), url: safeUrlSchema.optional(), locator: short.optional(), timestamp: dateTime.optional(),
}).strict();


export const factDataSchema = z.object({
  text: z.string().min(1).max(3000), subtitle: short.optional(), items: z.array(z.string().max(400)).max(12).optional(),
  original: z.string().max(3000).optional(), language: z.string().max(40).optional(), sourceLanguage: z.string().max(40).optional(),
}).strict();
export const numberDataSchema = z.object({ value: z.union([finite, z.string().min(1).max(100)]).optional(), label: short.optional(), unit: z.string().max(80).optional(), comparison: short.optional(), binding: datasetBindingSchema.optional(), summary: summarySchema.optional() }).strict()
  .refine((v) => v.value !== undefined || v.binding !== undefined, 'Number requires a value or source binding');


const columnName = label.refine((v) => !dangerousKeys.has(v), 'Reserved column name');
export const tableDataSchema = z.object({
  showHeaders: z.boolean().optional().describe('Omit headers for a flat list arranged as a grid. Supply positional row arrays and omit columns; retain headers when columns have distinct meanings.'), emphasis: emphasisSchema.optional(),
  columns: z.array(columnName).max(64).default([]), rows: z.array(z.union([z.record(columnName, cellSchema), z.array(cellSchema).max(64)])).max(VIEW_LIMITS.tableRows).default([]),
  pageSize: positiveInteger.max(100).default(12), binding: datasetBindingSchema.optional(), summary: summarySchema.optional(),
  rowStyles:z.array(tableRowStyleSchema).max(1000).optional(),cellStyles:z.array(tableCellStyleSchema).max(2000).optional(),
}).strict().superRefine((data, ctx) => {
  if (!data.binding && !data.columns.length && data.rows.some(row => !Array.isArray(row))) ctx.addIssue({ code: 'custom', message: 'Headerless tables require positional row arrays' });
  const width = data.columns.length || (Array.isArray(data.rows[0]) ? data.rows[0].length : 0);
  const keys=data.columns.length?data.columns:Array.from({length:width},(_,i)=>String(i));
  for(const e of data.emphasis??[])if(e.series!==undefined||e.point!==undefined||((!data.binding||data.rows.length>0)&&e.row!==undefined&&e.row>=data.rows.length)||(e.column!==undefined&&keys.length>0&&!keys.includes(e.column)))ctx.addIssue({code:'custom',path:['emphasis'],message:'Table emphasis targets a retained row and/or supplied column'});
  if (new Set(data.columns).size !== data.columns.length) ctx.addIssue({ code: 'custom', message: 'Columns must be unique' });
  data.rows.forEach((row, index) => {
    if (Array.isArray(row) ? row.length !== width : Object.keys(row).some(key => !data.columns.includes(key))) ctx.addIssue({ code: 'custom', path: ['rows', index], message: Array.isArray(row) ? 'Row array length must equal the number of columns' : 'Row contains an undeclared column' });
  });
  for(const key of ['rowStyles','cellStyles'] as const){
    const seen=new Set<string>();
    data[key]?.forEach((style,index)=>{
      const column='column' in style?style.column:undefined,identity=JSON.stringify([style.row,column]);
      if(seen.has(identity))ctx.addIssue({code:'custom',path:[key,index],message:'Only one decoration per row or cell is allowed'});seen.add(identity);
      if((!data.binding||data.rows.length>0)&&style.row>=data.rows.length)ctx.addIssue({code:'custom',path:[key,index,'row'],message:'Choose a zero-based retained row index'});
      if(typeof column==='string'&&data.columns.length&&!data.columns.includes(column))ctx.addIssue({code:'custom',path:[key,index,'column'],message:'Choose a supplied column name'});
    });
  }
});
const cropSchema = z.object({ x: finite.min(0).max(1), y: finite.min(0).max(1), width: finite.positive().max(1), height: finite.positive().max(1) }).strict()
  .refine((v) => v.x + v.width <= 1.000001 && v.y + v.height <= 1.000001, 'Crop must fit within the source');
export const imageItemSchema = z.object({ url: safeUrlSchema, alt: short.default(''), caption: short.optional(), crop: cropSchema.optional() }).strict();
export const imageDataSchema = z.object({ images: z.array(imageItemSchema).min(1).max(4) }).strict();
export const webDataSchema = z.object({ url: safeUrlSchema, title: short.optional(), text: z.string().max(6000).optional(), embed: z.boolean().default(false).describe('Show the genuine live, interactive page in an iframe when the site allows framing (the server checks its X-Frame-Options and CSP frame-ancestors headers). When framing is refused, the supplied summary or snapshot is shown with the reason. Needs an https URL.'), snapshotUrl: safeUrlSchema.optional(), retrievedAt: dateTime.optional() }).strict()
  .refine((v) => !v.embed || isAllowedEmbedUrl(v.url) || /^https:\/\//i.test(v.url), 'Live embedding needs an https URL (or a supported publisher embed URL)');
export const comparisonDataSchema = z.object({
  criteria: z.array(label).min(1).max(12),
  commentary: z.record(columnName, short).optional().describe('Agent-authored takeaway per criterion, separate from items.'), emphasis: emphasisSchema.optional(),
  items: z.array(z.object({ name: label, image: z.object({url:safeUrlSchema,alt:short.default('')}).strict().optional(), highlights:z.array(columnName).max(12).optional().describe('Criteria whose cells are emphasized for this item.'), values: z.record(columnName, cellSchema), pros: z.array(short).max(6).optional(), cons: z.array(short).max(6).optional() }).strict()).min(2).max(10),
}).strict().superRefine((data, ctx) => {
  for(const e of data.emphasis??[])if(e.series!==undefined||e.point!==undefined||e.row!==undefined&&e.row>=data.criteria.length||e.column!==undefined&&!data.items.some(i=>i.name===e.column))ctx.addIssue({code:'custom',path:['emphasis'],message:'Comparison emphasis targets zero-based criterion row and/or item name as column'});
  if (Object.keys(data.commentary ?? {}).some(key => !data.criteria.includes(key)) || data.items.some(item => item.highlights?.some(key => !data.criteria.includes(key)))) ctx.addIssue({code:'custom',message:'Commentary/highlights must name supplied criteria'});
  if (new Set(data.criteria).size !== data.criteria.length) ctx.addIssue({ code: 'custom', message: 'Comparison criteria must be unique' });
  for (const item of data.items) if (Object.keys(item.values).some((key) => !data.criteria.includes(key)) || data.criteria.some((key) => !(key in item.values))) ctx.addIssue({ code: 'custom', message: 'All alternatives must use the same criteria' });
});
const uniqueIds = <T extends { id: string }>(values: T[]) => new Set(values.map((v) => v.id)).size === values.length;
export const checklistDataSchema = z.object({ checklistId:identifier.optional().describe('Server-managed persistent checklist identity. Keep it to update the same checklist; omit to create a new checklist.'),checklistRevision:z.number().int().nonnegative().optional().describe('Current document revision. Stale copies cannot overwrite a newer checklist.'), highlight:identifier.optional().describe('ID of the one item to mark as current.'), items: z.array(z.object({ id: identifier, text: z.string().min(1).max(1000), checked: z.boolean().default(false), detail: short.optional() }).strict()).max(100).refine(uniqueIds, 'Checklist IDs must be unique') }).strict().refine(data=>!data.highlight||data.items.some(item=>item.id===data.highlight),{path:['highlight'],message:'highlight must be the id of an item in this checklist.'});
const coordinates = z.object({ lat: finite.min(-90).max(90), lng: finite.min(-180).max(180) }).strict();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const geometry = z.object({ name: short.optional(), coordinates: z.array(coordinates).min(2).max(5000), color: color.optional() }).strict();
export const mapDataSchema = z.object({
  markers: z.array(coordinates.extend({ label: short.optional(), description: short.optional(), color:color.optional(), iconUrl:safeUrlSchema.optional(), popupHtml:z.string().max(6000).optional().describe('Passive HTML including headings, div/span, lists and tables. Inline colors, bounded spacing/sizing, text and flex/grid layout are allowlisted. Scripts, stylesheets, selectors, URLs in CSS, images, event handlers and active content are removed.'), contentDisplay:z.enum(['popup','permanent']).optional().describe('permanent displays sanitized popupHtml (or label/description) as an always-visible tooltip; overrides map default.') }).strict()).max(500).default([]),
  contentDisplay:z.enum(['popup','permanent']).default('popup'),
  routes: z.array(geometry).max(12).default([]),
  polygons: z.array(geometry.refine((v) => v.coordinates.length >= 3, 'Polygon needs at least three coordinates')).max(12).default([]),
  center: coordinates.optional(), zoom: finite.min(1).max(20).default(11),
}).strict().refine((v) => Boolean(v.center || v.markers.length || v.routes.length || v.polygons.length), 'Map needs supplied geometry or a center');
const codePanelSchema=z.object({id:identifier,path:short.optional(),kind:z.enum(['code','diff']).default('code'),language:z.string().max(50).optional(),code:z.string().max(100000).optional(),before:z.string().max(100000).optional(),after:z.string().max(100000).optional(),startLine:positiveInteger.max(1000000).default(1),highlightLines:z.array(positiveInteger.max(1000000)).max(200).optional()}).strict().refine(v=>v.kind==='code'?v.code!==undefined:v.before!==undefined&&v.after!==undefined,'Supply source code or both diff versions');
export const codeDataSchema = z.object({
  kind: z.enum(['code', 'diff', 'tree', 'tools', 'terminal', 'split']).default('code'), path: short.optional(), language: z.string().max(50).optional(),
  code: z.string().max(100_000).optional(), before: z.string().max(100_000).optional(), after: z.string().max(100_000).optional(),
  panels:z.array(codePanelSchema).min(2).max(3).refine(uniqueIds,'Panel IDs must be unique').optional().describe('kind split: two or three independent code/diff panels; target navigation with panelId and optional side before/after.'),
  files: z.array(z.object({ path: label, kind: z.enum(['file', 'directory']).default('file'), status: z.enum(['added', 'modified', 'deleted', 'unchanged']).optional() }).strict()).max(1000).optional(),
  tools: z.array(z.object({ id: identifier, name: label, status: z.enum(['pending', 'running', 'success', 'error']), summary: short.optional() }).strict()).max(100).refine(uniqueIds, 'Tool IDs must be unique').optional(),
  entries:z.array(z.object({id:identifier,command:z.string().min(1).max(10000),stdout:z.string().max(100000).optional(),stderr:z.string().max(100000).optional(),status:z.enum(['pending','running','success','error']).optional(),exitCode:z.number().int().optional(),timestamp:z.string().datetime().optional(),cwd:short.optional()}).strict()).max(100).refine(uniqueIds,'Entry IDs must be unique').optional(),
  highlightLines: z.array(positiveInteger.max(1_000_000)).max(200).optional(), startLine: positiveInteger.max(1_000_000).default(1),
}).strict().superRefine((v, ctx) => {
  const valid = v.kind==='split'?Boolean(v.panels?.length):v.kind === 'code' ? v.code !== undefined : v.kind === 'diff' ? v.before !== undefined && v.after !== undefined : v.kind === 'tree' ? Boolean(v.files?.length) : v.kind === 'terminal' ? Boolean(v.entries?.length) : Boolean(v.tools?.length);
  if (!valid) ctx.addIssue({ code: 'custom', message: `Missing content for ${v.kind} layout` });
});
const position = finite.min(-100_000).max(100_000);
export const whiteboardElementSchema = z.object({
  id: identifier, type: z.enum(['draw', 'rect', 'ellipse', 'arrow', 'text']), x: position, y: position,
  width: finite.min(-100_000).max(100_000).optional(), height: finite.min(-100_000).max(100_000).optional(),
  points: z.array(z.object({ x: position, y: position }).strict()).max(2000).optional(), text: z.string().max(2000).optional(), color: color.default('#7dd3fc'),
  lineWidth: finite.min(0.5).max(20).default(3), fill: z.union([color, z.literal('transparent')]).default('transparent'),
}).strict().superRefine((v, ctx) => {
  if (v.type === 'draw' && (!v.points || v.points.length < 2)) ctx.addIssue({ code: 'custom', message: 'Stroke needs at least two points' });
  if (v.type === 'text' && !v.text) ctx.addIssue({ code: 'custom', message: 'Text element requires text' });
  if (['rect', 'ellipse', 'arrow'].includes(v.type) && (v.width === undefined || v.height === undefined)) ctx.addIssue({ code: 'custom', message: 'Shape requires width and height' });
  if (['rect', 'ellipse'].includes(v.type) && ((v.width ?? 0) <= 0 || (v.height ?? 0) <= 0)) ctx.addIssue({ code: 'custom', message: 'Rectangle and ellipse dimensions must be positive' });
});
export const whiteboardDataSchema = z.object({ background:boardBackgroundSchema.optional(), elements: z.array(whiteboardElementSchema).max(VIEW_LIMITS.boardElements).refine(uniqueIds, 'Board IDs must be unique') }).strict();
export const documentDataSchema = z.object({
  text: z.string().max(20_000).default(''), highlights: z.array(z.object({ start: z.number().int().min(0), end: positiveInteger, label: short.optional() }).strict()).max(100).default([]),
  layout: z.enum(['auto', 'excerpt', 'reading']).default('auto'),
  headings: z.array(z.object({ start: z.number().int().min(0), end: positiveInteger, level: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(2) }).strict()).max(100).default([]),
  images: z.array(imageItemSchema).max(4).optional(), page: z.union([positiveInteger, short]).optional(), section: short.optional(), quote: z.boolean().default(true), context: z.string().max(10_000).optional(),
}).strict().superRefine((v, ctx) => {
  if (!v.text && !v.images?.length) ctx.addIssue({ code: 'custom', message: 'Document needs source text or a crop' });
  for (const span of v.highlights) if (span.start >= span.end || span.end > v.text.length) ctx.addIssue({ code: 'custom', message: 'Highlight must address an existing text span' });
  const headings = [...v.headings].sort((a,b) => a.start-b.start);
  for (const [index, span] of headings.entries()) if (span.start >= span.end || span.end > v.text.length || index > 0 && span.start < headings[index-1].end) ctx.addIssue({ code: 'custom', path: ['headings', index], message: 'Headings must reference non-overlapping ranges of the exact supplied text' });
});
export const videoDataSchema = z.object({
  url: safeUrlSchema, start: finite.min(0).max(86400).default(0), end: finite.positive().max(86400).optional(), poster: safeUrlSchema.optional(),
  captions: z.array(z.object({ start: finite.min(0), end: finite.positive(), text: z.string().max(1000) }).strict().refine((v) => v.end > v.start, 'Caption end must follow start')).max(1000).optional(),
  muted: z.boolean().default(false), loop: z.boolean().default(false), autoplay: z.boolean().optional(), embed: z.boolean().optional(),
}).strict().superRefine((v, ctx) => {
  if (v.end !== undefined && v.end <= v.start) ctx.addIssue({ code: 'custom', path: ['end'], message: 'Video end must follow start' });
  if (v.embed && !videoEmbed(v.url)) ctx.addIssue({ code: 'custom', path: ['url'], message: 'Embedded video supports only a single HTTPS YouTube or Vimeo video URL. For direct MP4/WebM omit embed.' });
});
export const notificationsDataSchema = z.object({
  items: z.array(z.object({ id: identifier, title: label, body: z.string().max(1500).optional(), time: dateTime.optional(), urgency: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'), source: short.optional(), read: z.boolean().default(false) }).strict()).min(1).max(100).refine(uniqueIds, 'Notification IDs must be unique'),
}).strict();

/** Supplied transcript text and timestamps are opaque source strings, never reconstructed audio. */
export const transcriptionDataSchema = z.object({
  segments: z.array(z.object({ id: identifier, text: z.string().min(1).max(20_000), speaker: label.optional(), timestamp: z.string().min(1).max(60).optional() }).strict()).min(1).max(VIEW_LIMITS.transcriptSegments).refine(uniqueIds, 'Transcript segment IDs must be unique'),
  language: z.string().min(1).max(80).optional(), status: z.enum(['live', 'complete']).default('complete'),
}).strict();
export const translationDataSchema = z.object({
  sourceText: z.string().min(1).max(20_000), targetText: z.string().min(1).max(20_000),
  sourceLanguage: z.string().min(1).max(80), targetLanguage: z.string().min(1).max(80),
  layout: z.enum(['side-by-side', 'stacked']).default('side-by-side'),
}).strict();

const fieldId = identifier.refine(value => !dangerousKeys.has(value), 'Reserved field ID');
const fieldBase = { id: fieldId, label, required: z.boolean().default(false), help: short.optional() };
const fieldText = { ...fieldBase, placeholder: short.optional(), maxLength: positiveInteger.max(10_000).default(2000) };
const options = z.array(z.object({ id: fieldId, label }).strict()).min(2).max(20).refine(uniqueIds, 'Option IDs must be unique');
const numericBounds = (value: { min?: number; max?: number }, ctx: z.RefinementCtx) => {
  if (value.min !== undefined && value.max !== undefined && value.max <= value.min) ctx.addIssue({ code: 'custom', path: ['max'], message: 'Maximum must be greater than minimum' });
};
export const formFieldSchema = z.discriminatedUnion('type', [
  z.object({ ...fieldText, type: z.literal('text') }).strict(),
  z.object({ ...fieldText, type: z.literal('textarea') }).strict(),
  z.object({ ...fieldText, type: z.literal('email') }).strict(),
  z.object({ ...fieldBase, type: z.literal('number'), min: finite.optional(), max: finite.optional(), step: finite.positive().optional(), placeholder: short.optional() }).strict().superRefine(numericBounds),
  z.object({ ...fieldBase, type: z.literal('range'), min: finite, max: finite, step: finite.positive().default(1) }).strict().superRefine(numericBounds),
  z.object({ ...fieldBase, type: z.literal('choice'), options }).strict(),
  z.object({ ...fieldBase, type: z.literal('multi-choice'), options, maxChoices: positiveInteger.max(20).optional() }).strict()
    .refine(value => value.maxChoices === undefined || value.maxChoices <= value.options.length, 'Maximum choices cannot exceed the number of options'),
  z.object({ ...fieldBase, type: z.literal('checkbox') }).strict(),
]);
export const formDataSchema = z.object({
  description: z.string().max(4000).optional(), fields: z.array(formFieldSchema).min(1).max(VIEW_LIMITS.formFields).refine(uniqueIds, 'Form field IDs must be unique'),
  submitLabel: label.default('Submit response'), closed: z.boolean().default(false),
}).strict();

const scheduleDate = z.string().regex(/^\d{4}-\d\d-\d\d$/).refine(value => Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, 'Expected an existing calendar date');
const zonedTimestamp = z.string().max(60).refine(value => /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && scheduleDate.safeParse(value.slice(0, 10)).success && Number.isFinite(Date.parse(value)), 'Expected an existing ISO timestamp with an explicit UTC offset');
const timeZone = z.string().min(1).max(100).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return true; } catch { return false; } }, 'Expected an IANA timezone, for example Europe/Oslo');
export const scheduleDataSchema = z.object({
  date: scheduleDate, view: z.enum(['day', 'week', 'month', 'months', 'year']).default('day'), timeZone,
  // months: how many months (1-12) view 'months' shows from the month of date; 'year' shows January-December.
  months: z.number().int().min(1).max(12).optional(), eventStyle: z.enum(['detailed', 'compact']).optional(),
  legend: z.array(z.object({ label, color }).strict()).min(1).max(24).optional(),
  events: z.array(z.object({ id: identifier, title: label, start: zonedTimestamp, end: zonedTimestamp, location: short.optional(), description: z.string().max(2000).optional(), allDay: z.boolean().default(false), color: color.optional() }).strict()
    .refine(value => Date.parse(value.end) > Date.parse(value.start), 'Event end must follow start')).max(VIEW_LIMITS.scheduleEvents).refine(uniqueIds, 'Event IDs must be unique'),
}).strict();
export const pollDataSchema = z.object({
  question: z.string().min(1).max(2000), options: z.array(z.object({ id: fieldId, label }).strict()).min(2).max(VIEW_LIMITS.pollOptions).refine(uniqueIds, 'Poll option IDs must be unique'),
  maxChoices: positiveInteger.max(VIEW_LIMITS.pollOptions).default(1), closed: z.boolean().default(false), revealResults: z.boolean().default(false),
}).strict().refine(value => value.maxChoices <= value.options.length, 'Maximum choices cannot exceed the number of options');
export const qaDataSchema = z.object({
  prompt: z.string().min(1).max(2000), mode: z.enum(['questions', 'word-cloud']).default('questions'),
  maxLength: positiveInteger.max(2000).default(500), closed: z.boolean().default(false), revealResults: z.boolean().default(true),
}).strict();

export type TranscriptionData = z.infer<typeof transcriptionDataSchema>;
export type TranslationData = z.infer<typeof translationDataSchema>;
export type FormField = z.infer<typeof formFieldSchema>;
export type FormData = z.infer<typeof formDataSchema>;
export type ScheduleData = z.infer<typeof scheduleDataSchema>;
export type PollData = z.infer<typeof pollDataSchema>;
export type QAData = z.infer<typeof qaDataSchema>;

export const actionSchema = z.object({ id: identifier, label, kind: z.enum(['button', 'choice', 'input']), options: z.array(label).min(1).max(12).optional(), placeholder: short.optional() }).strict()
  .refine((v) => v.kind !== 'choice' || Boolean(v.options?.length), 'Choice action needs options')
  .meta({ allOf: [{ if: { properties: { kind: { const: 'choice' } }, required: ['kind'] }, then: { required: ['options'] } }] });
export const codeWorkspaceDataSchema=z.object({files:codeDataSchema.shape.files.unwrap(),activePath:z.string().min(1).max(500),excerpt:codeDataSchema}).strict().refine(v=>v.files.some(f=>f.path===v.activePath&&f.kind==='file'),'Active path must name a supplied file.').refine(v=>['code','diff'].includes(v.excerpt.kind),'Workspace excerpt must be code or diff.');
const base = { format: viewFormatSchema.optional().describe('Display-only format overrides; source stays ISO.'), selection: selectionSchema.optional().describe('Agent-controlled filter/sort/highlight; full source is retained. No display filter widgets.'), version: z.literal(1).default(1), title: short.optional(), showTitle: z.boolean().optional().describe('Show the stored title on the display only when explicitly true.'), showCaption: z.boolean().optional().describe('Opt in to supporting captions on the display; content remains stored when hidden.'), showControls: z.boolean().optional().describe('Default off for every template. Opt in to utility controls such as chart data; tables have no filter/sort/reset widgets. Intrinsic responses and navigation remain available.'), actions: z.array(actionSchema).max(8).refine(uniqueIds, 'Action IDs must be unique').optional() };
export const leafViewSchema = z.discriminatedUnion('template', [
  z.object({...base,template:z.literal('database-schema'),data:databaseSchemaDataSchema}).strict(),
  z.object({...base,template:z.literal('sing-along'),data:venueSchemas['sing-along']}).strict(),
  z.object({...base,template:z.literal('seat-map'),data:venueSchemas['seat-map']}).strict(),
  z.object({...base,template:z.literal('vocabulary'),data:venueSchemas['vocabulary']}).strict(),
  z.object({...base,template:z.literal('todays-special'),data:venueSchemas['todays-special']}).strict(),
  z.object({...base,template:z.literal('menu-board'),data:venueSchemas['menu-board']}).strict(),
  z.object({...base,template:z.literal('opening-hours'),data:venueSchemas['opening-hours']}).strict(),
  z.object({...base,template:z.literal('back-at'),data:venueSchemas['back-at']}).strict(),
  z.object({...base,template:z.literal('closed-sign'),data:venueSchemas['closed-sign']}).strict(),
  z.object({...base,template:z.literal('hiring'),data:venueSchemas['hiring']}).strict(),
  z.object({...base,template:z.literal('sale-poster'),data:venueSchemas['sale-poster']}).strict(),
  z.object({...base,template:z.literal('health-notice'),data:venueSchemas['health-notice']}).strict(),
  z.object({...base,template:z.literal('custom-sign'),data:venueSchemas['custom-sign']}).strict(),
  z.object({...base,template:z.literal('kanban'),data:venueSchemas['kanban']}).strict(),
  z.object({...base,template:z.literal('account-template'),data:customViewSchema}).strict(),
  z.object({...base,template:z.literal('json'),data:jsonDataSchema}).strict(),
  z.object({...base,template:z.literal('task-list'),data:taskListDataSchema}).strict(),
  z.object({...base,template:z.literal('colour'),data:colourDataSchema}).strict(),
  z.object({...base,template:z.literal('icon-picker'),data:iconPickerDataSchema}).strict(),
  z.object({...base,template:z.literal('font-picker'),data:fontPickerDataSchema}).strict(),
  z.object({...base,template:z.literal('tool-call-details'),data:toolCallDetailsDataSchema}).strict(),
  z.object({...base,template:z.literal('monitor-stream'),data:monitorStreamDataSchema}).strict(),
  z.object({...base,template:z.literal('message-board'),data:messageBoardDataSchema}).strict(),
  z.object({...base,template:z.literal('agents'),data:agentsDataSchema}).strict(),
  z.object({...base,template:z.literal('welcome'),data:welcomeDataSchema}).strict(),
  z.object({...base,template:z.literal('session-topology'),data:topologyDataSchema}).strict(),
  z.object({...base,actions:z.array(actionSchema).max(0).optional().describe('Read-only message display. Use drafting for composition; sending belongs to the agent and its messaging connector.'),template:z.literal('email'),data:workSchemas['email']}).strict(),
  z.object({...base,actions:z.array(actionSchema).max(0).optional().describe('Read-only summaries; no message-open, reply, archive or send actions.'),template:z.literal('inbox'),data:workSchemas['inbox']}).strict(),
  z.object({...base,actions:z.array(actionSchema).max(0).optional().describe('Read-only conversation. Use drafting for composition; sending belongs to the agent and its messaging connector.'),template:z.literal('chat'),data:workSchemas['chat']}).strict(),
  z.object({...base,template:z.literal('cards'),data:workSchemas['cards']}).strict(),
  z.object({...base,template:z.literal('record-detail'),data:workSchemas['record-detail']}).strict(),
  z.object({...base,template:z.literal('story-cards'),data:extendedSchemas['story-cards']}).strict(),
  z.object({...base,template:z.literal('bookmarks'),data:workSchemas['bookmarks']}).strict(),
  z.object({...base,template:z.literal('tool-inventory'),data:workSchemas['tool-inventory']}).strict(),
  z.object({...base,template:z.literal('tool-detail'),data:workSchemas['tool-detail']}).strict(),
  z.object({...base,template:z.literal('developer'),data:workSchemas['developer']}).strict(),
  z.object({...base,template:z.literal('operations'),data:workSchemas['operations']}).strict(),
  z.object({...base,template:z.literal('code-workspace'),data:codeWorkspaceDataSchema}).strict(),
  z.object({...base,template:z.literal('traffic-demo'),data:trafficDemoSchema}).strict(),
  z.object({ ...base, template: z.literal('progress'), data: progressDataSchema }).strict(),
  z.object({ ...base, template: z.literal('log'), data: logDataSchema }).strict(),
  z.object({ ...base, template: z.literal('fact'), data: factDataSchema }).strict(),
  z.object({ ...base, template: z.literal('number'), data: numberDataSchema }).strict(),
  z.object({...base,template:z.literal('math'),data:mathWorkspaceSchema}).strict(),
  z.object({...base,template:z.literal('venn'),data:vennSchema}).strict(),
  z.object({ ...base, template: z.literal('chart'), data: chartDataSchema }).strict(),
  z.object({ ...base, template: z.literal('table'), data: tableDataSchema }).strict(),
  z.object({ ...base, template: z.literal('image'), data: imageDataSchema }).strict(),
  z.object({ ...base, template: z.literal('web'), data: webDataSchema }).strict(),
  z.object({ ...base, template: z.literal('website'), data: iframeDataSchema }).strict(),
  z.object({ ...base, template: z.literal('iframe'), data: iframeDataSchema }).strict(),
  z.object({ ...base, template: z.literal('list'), data: listDataSchema }).strict(),
  z.object({ ...base, template: z.literal('comparison'), data: comparisonDataSchema }).strict(),
  z.object({ ...base, template: z.literal('flashcards'), data: flashcardDataSchema }).strict(),
  z.object({ ...base, template: z.literal('checklist'), data: checklistDataSchema }).strict(),
  z.object({ ...base, template: z.literal('map'), data: mapDataSchema }).strict(),
  z.object({ ...base, template: z.literal('code'), data: codeDataSchema }).strict(),
  z.object({ ...base, template: z.literal('image-gallery'), data: galleryDataSchema }).strict(),
  z.object({ ...base, template: z.literal('whiteboard'), data: whiteboardDataSchema }).strict(),
  z.object({ ...base, template: z.literal('document'), data: documentDataSchema }).strict(),
  z.object({ ...base, template: z.literal('video'), data: videoDataSchema }).strict(),
  z.object({ ...base, template: z.literal('notifications'), data: notificationsDataSchema }).strict(),
  z.object({...base,template:z.literal('instrument'),data:instrumentDataSchema}).strict(),
  z.object({...base,template:z.literal('live-captions'),data:captionDataSchema}).strict(),
  z.object({ ...base, template: z.literal('transcription'), data: transcriptionDataSchema }).strict(),
  z.object({ ...base, template: z.literal('translation'), data: translationDataSchema }).strict(),
  z.object({ ...base, template: z.literal('form'), data: formDataSchema }).strict(),
  z.object({ ...base, template: z.literal('schedule'), data: scheduleDataSchema }).strict(),
  z.object({ ...base, template: z.literal('roster'), data: rosterDataSchema }).strict(),
  z.object({ ...base, template: z.literal('poll'), data: pollDataSchema }).strict(),
  z.object({ ...base, template: z.literal('countdown'), data: countdownDataSchema }).strict(),
  z.object({ ...base, template: z.literal('qa'), data: qaDataSchema }).strict(),
  z.object({ ...base, template: z.literal('scene3d'), data: scene3dSchema }).strict(),
  z.object({ ...base, template: z.literal('drafting'), data: draftingDataSchema }).strict(),
  z.object({ ...base, template: z.literal('clock'), data: clockDataSchema }).strict(),
  z.object({ ...base, template: z.literal('now-playing'), data: nowPlayingDataSchema }).strict(),
  z.object({ ...base, template: z.literal('scoreboard'), data: scoreboardDataSchema }).strict(),
  z.object({ ...base, template: z.literal('standings'), data: standingsDataSchema }).strict(),
  z.object({ ...base, template: z.literal('tool-call-log'), data: toolLogDataSchema }).strict(),
  z.object({ ...base, template: z.literal('overview'), data: extendedSchemas.overview }).strict(),
  z.object({ ...base, template: z.literal('display-grid'), data: displayGridDataSchema }).strict(),
  z.object({...base,template:z.literal('catalog-list'),data:z.object({items:z.array(z.string().min(1).max(240)).max(2000),kind:z.enum(['operations','templates'])}).strict()}).strict(),
  z.object({ ...base, template: z.literal('devices'), data: devicesViewDataSchema }).strict(),
  z.object({...base,template:z.literal('sports-lineup'),data:sportsLineupDataSchema}).strict(),
  z.object({...base,template:z.literal('device-preview'),data:devicePreviewDataSchema}).strict(),
  z.object({...base,template:z.literal('architecture'),data:architectureDataSchema}).strict(),
  z.object({...base,template:z.literal('org-chart'),data:orgChartDataSchema}).strict(),
  z.object({...base,template:z.literal('flowchart'),data:flowchartDataSchema}).strict(),
  z.object({...base,template:z.literal('network'),data:networkDataSchema}).strict(),
  z.object({ ...base, template: z.literal('calendar'), data: calendarDataSchema }).strict(),
  z.object({ ...base, template: z.literal('planner'), data: plannerDataSchema }).strict(),
  z.object({ ...base, template: z.literal('settings'), data: extendedSchemas.settings }).strict(),
  z.object({ ...base, template: z.literal('procedure'), data: extendedSchemas.procedure }).strict(),
  z.object({ ...base, template: z.literal('join'), data: extendedSchemas.join }).strict(),
  z.object({ ...base, template: z.literal('html'), data: extendedSchemas.html }).strict(),
  z.object({ ...base, template: z.literal('molecule'), data: moleculeDataSchema }).strict(),
  z.object({ ...base, template:z.literal('qr'),data:z.object({content:z.string().min(1).max(2000).refine(value=>new TextEncoder().encode(value).length<=2000,'QR content must fit 2000 UTF-8 bytes'),title:short.optional(),text:z.string().max(2000).optional(),image:imageItemSchema.optional()}).strict() }).strict(),
  z.object({ ...base, template: z.literal('signage'), data: signageDataSchema }).strict(),
  z.object({ ...base, template: z.literal('game-board'), data: gameDataSchema }).strict(),
  z.object({ ...base, template: z.literal('satisfaction'), data: satisfactionDataSchema }).strict(),
  z.object({ ...base, template: z.literal('timeline'), data: extendedSchemas.timeline }).strict(),
  z.object({ ...base, template: z.literal('itinerary'), data: extendedSchemas.itinerary }).strict(),
  z.object({ ...base, template: z.literal('product'), data: extendedSchemas.product }).strict(),
  z.object({...base,template:z.literal('keyboard-shortcuts'),data:extendedSchemas['keyboard-shortcuts']}).strict(),
  z.object({ ...base, template: z.literal('weather'), data: extendedSchemas.weather }).strict(),
  z.object({ ...base, template: z.literal('profile'), data: extendedSchemas.profile }).strict(),
  z.object({ ...base, template: z.literal('kpi'), data: extendedSchemas.kpi }).strict(),
  z.object({ ...base, template: z.literal('quote'), data: extendedSchemas.quote }).strict(),
  z.object({ ...base, template: z.literal('recipe'), data: extendedSchemas.recipe }).strict(),
  z.object({ ...base, template: z.literal('menu'), data: extendedSchemas.menu }).strict(),
  z.object({ ...base, template: z.literal('leaderboard'), data: extendedSchemas.leaderboard }).strict(),
  z.object({ ...base, template: z.literal('status'), data: extendedSchemas.status }).strict(),
]);
export const presenterPreviewSchema = z.boolean().optional().describe('Notes display: private preview, with explicit Go live to cue linked screens.');
export const cueOptionsSchema={mirrored:z.union([z.boolean(),z.enum(['vertical','horizontal','both'])]).optional().describe('false disables mirroring; true defaults to vertical (top/bottom flip). Choose vertical, horizontal (left/right flip), or both (180-degree rotation). Select for your physical rig; no glass calibration is inferred.'),cueMode:z.boolean().optional()};
/** Views that belong on a display or in a split-screen pane, not on a slide: a live stream binding and the
 * message-board snapshot. Leaving them out keeps the complete presentation contract inside the MCP result budget. */
export const NOT_A_SLIDE:ReadonlySet<string>=new Set(['monitor-stream','message-board']);
const slideOptions=leafViewSchema.options.filter(option=>!NOT_A_SLIDE.has(option.shape.template.value)) as unknown as typeof leafViewSchema.options;
export const slideViewSchema=z.discriminatedUnion('template',slideOptions);
export const presentationDataSchema = z.object({ ...cueOptionsSchema,slides: z.array(slideViewSchema).min(1).max(VIEW_LIMITS.slides), index: z.number().int().min(0).default(0), presenterPreview: presenterPreviewSchema,
}).strict().refine((v) => v.index < v.slides.length, 'Slide index is outside this deck');
const ordinaryViewSchema = z.union([leafViewSchema,z.object({...base,template:z.literal('presentation'),data:presentationDataSchema}).strict()]);
const splitPaneId=z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),splitAxis=z.number().int().min(1).max(SPLIT_LIMITS.axis),splitDirection=z.enum(['vertical','horizontal']);
const splitLeafPane=z.object({id:splitPaneId,view:ordinaryViewSchema}).strict();
const splitGridMessage='Pane count must equal rows x columns (1-4 each). Without rows/columns only 2, 3, 4 or 6 panes are arranged automatically.';
const splitGridPane=z.object({id:splitPaneId,rows:splitAxis.optional(),columns:splitAxis.optional(),direction:splitDirection.optional(),panes:z.array(splitLeafPane).min(2).max(SPLIT_LIMITS.leaves)}).strict().refine(p=>Boolean(splitGrid(p.panes.length,p.rows,p.columns,p.direction)),splitGridMessage).describe('A pane that holds its own grid. Its panes cannot be split again.');
export const splitScreenDataSchema=z.object({rows:splitAxis.optional().describe('1-4. Panes fill the grid row by row.'),columns:splitAxis.optional().describe('1-4.'),direction:splitDirection.default('vertical').describe('Lane direction when rows/columns are omitted: vertical is side by side.'),
  divider:z.union([z.literal('none'),z.object({gap:z.number().min(0).max(64).optional().describe('CSS px between panes; default 6.'),borderWidth:z.number().min(0).max(16).optional().describe('CSS px; default 1.'),borderColor:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()}).strict()]).optional().describe('Omit for the standard thin border and gap. "none" lets content run edge to edge. Applies to nested grids too.'),
  panes:z.array(z.union([splitLeafPane,splitGridPane])).min(2).max(SPLIT_LIMITS.leaves)}).strict()
  .refine(d=>Boolean(splitGrid(d.panes.length,d.rows,d.columns,d.direction)),splitGridMessage)
  .refine(d=>splitLeaves(d).length<=SPLIT_LIMITS.leaves,`At most ${SPLIT_LIMITS.leaves} panes in total, nested panes included.`)
  .refine(d=>{const ids=[...d.panes.map(p=>p.id),...d.panes.flatMap(p=>'panes' in p?p.panes.map(x=>x.id):[])];return new Set(ids).size===ids.length;},'Pane IDs must be unique across the whole screen, nested panes included.');
export const splitScreenSchema=z.object({...base,template:z.literal('split-screen'),data:splitScreenDataSchema}).strict();
export const viewSchema = z.union([leafViewSchema, ordinaryViewSchema.options[1],splitScreenSchema]).describe('title, showTitle, showCaption, showControls and actions are view-level fields beside template/data, never inside data.');
export type ValidatedView = z.infer<typeof viewSchema>;

/** The same per-template contract powers runtime validation and MCP discovery. */
export function templateViewSchema(template: TemplateId): z.ZodType {
  if(template==='split-screen')return splitScreenSchema;
  return template === 'presentation' ? z.object({...base,template:z.literal('presentation'),data:z.object({...cueOptionsSchema,slides:z.array(z.union(slideViewSchema.options.filter(option=>!['web'].includes(option.shape.template.value)))).min(1).max(VIEW_LIMITS.slides),index:z.number().int().min(0).default(0),presenterPreview:presenterPreviewSchema}).strict().refine(data=>data.index<data.slides.length,'Slide index is outside the presentation.')}).strict()
    : sourceDescribedSchema(template);
}

function sourceDescribedSchema(template:TemplateId) {
  const schema=leafViewSchema.options.find(option=>option.shape.template.value===template)!;
  return SOURCE_RECORD_TEMPLATES.has(template)?schema.describe(VERBATIM_SOURCE):schema;
}

/** Guard before recursive schema traversal/stringification, including non-JSON callers. */
export function assertJsonBudget(input: unknown, maxBytes = VIEW_LIMITS.bytes, maxNodes = 100_000): void {
  const seen = new WeakSet<object>();
  let nodes = 0;
  function visit(value: unknown, depth: number): void {
    if (++nodes > maxNodes || depth > 16) throw new Error('Structured content exceeds its complexity limit');
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite numbers are not supported');
    if (value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value)) return;
    if (typeof value !== 'object') throw new Error('Content must contain only JSON values');
    if (seen.has(value)) throw new Error('Cyclic content is not supported');
    seen.add(value);
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('Content must contain plain objects');
    for (const [key, child] of Object.entries(value)) {
      if (dangerousKeys.has(key)) throw new Error('Reserved object key');
      visit(child, depth + 1);
    }
    seen.delete(value);
  }
  visit(input, 0);
  const serialized = JSON.stringify(input);
  if (!serialized || new TextEncoder().encode(serialized).byteLength > maxBytes) throw new Error('Structured content exceeds its byte limit');
}

export function validateView(input: unknown): ViewSpec {
  assertJsonBudget(input);
  // The retired demo-deck metadata is dropped; nothing else is rewritten.
  input = retainedProvenance(input);
  // Select the known discriminator before parsing so a malformed fact returns
  // fact field errors, not an opaque union failure across all fifteen templates.
  if (input && typeof input === 'object' && 'template' in input) {
    const schema = input.template === 'split-screen' ? splitScreenSchema : input.template === 'presentation' ? viewSchema.options[1]
      : leafViewSchema.options.find(option => option.shape.template.value === input.template);
    if (schema) return checkedSelection(normalizeTableRows(schema.parse(input) as ViewSpec));
  }
  return checkedSelection(normalizeTableRows(viewSchema.parse(input) as ViewSpec));
}

function checkedSelection(view:ViewSpec,path:(string|number)[]=[]):ViewSpec {
  if(view.template==='split-screen')splitLeaves(view.data).forEach(p=>checkedSelection(p.view,[...path,...p.path.slice(1).split('/').map(part=>/^\d+$/.test(part)?Number(part):part)]));
  if(view.selection&&!selectionKey(view))throw new z.ZodError([{code:'custom',path:[...path,'selection'],message:'Selection requires a table, list, log, communication or technical record view.'}]);
  if(view.template==='presentation')(view.data.slides as ViewSpec[]).forEach((slide,i)=>checkedSelection(slide,[...path,'data','slides',i]));
  return view;
}

function normalizeTableRows(view: ViewSpec): ViewSpec {
  if(view.template==='split-screen')return {...view,data:mapSplitViewsSync(view.data,normalizeTableRows)};
  if (view.template === 'presentation') return { ...view, data: { ...view.data, slides: (view.data.slides as ViewSpec[]).map(normalizeTableRows) } };
  if (view.template !== 'table') return view;
  const supplied = view.data.columns as string[], rows = view.data.rows as unknown[];
  const columns = supplied.length ? supplied : Array.from({length:Array.isArray(rows[0]) ? rows[0].length : 0}, (_, i) => String(i));
  return { ...view, data: { ...view.data, columns, showHeaders:view.data.showHeaders ?? (supplied.length > 0 || Boolean(view.data.binding)), rows: (view.data.rows as unknown[]).map(row => Array.isArray(row) ? Object.fromEntries(columns.map((column, index) => [column, row[index]])) : row) } };
}

export function retainedProvenance(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const v = input as Record<string, unknown>;
  const data = v.data as Record<string, unknown> | undefined;
  // The retired static demo deck stored per-slide agent prompts in data.demo;
  // retained decks keep their slides, but that legacy metadata is dropped.
  const deck = v.template === 'presentation' && data && typeof data === 'object' ? (({ demo: _demo, ...rest }) => rest)(data) : data;
  return { ...v, ...(v.template === 'presentation' && Array.isArray(data?.slides) ? { data: { ...deck, slides: data.slides.map(retainedProvenance) } } : {}) };
}
