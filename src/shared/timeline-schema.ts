import {chartDataSchema} from './chart-contract.js';
import {flowchartDataSchema} from './diagrams.js';
import {z} from 'zod';
import {isSafeUrl} from './urls.js';

const text = z.string().min(1).max(4000), label = z.string().min(1).max(240);

const url = z.string().max(4000).refine(value => (/^\/api\/assets\/[A-Za-z0-9_-]{1,128}$/.test(value) || isSafeUrl(value)), 'Expected a safe public URL or protected asset URL');

const id = z.string().min(1).max(128);

const date = z.string().max(60).refine(value => /^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)===value.slice(0,10), 'Expected a real YYYY-MM-DD date or timezone-qualified ISO timestamp');

const timelineVisual = z.discriminatedUnion('kind', [
  z.object({kind:z.literal('image'),url:url.refine(value=>{try{return !/^\/api\/media(?:\/|$)/i.test(decodeURIComponent(new URL(value,'https://kanvas.invalid').pathname));}catch{return false;}},'Progressive visuals use session assets or public images; relative and absolute account-library paths have session-wide grants.'),alt:label,caption:text.optional()}).strict(),
  z.object({kind:z.literal('chart'),data:chartDataSchema.refine(value=>!value.binding,'Timeline visual charts require supplied data, not dataset bindings.')}).strict(),
  z.object({kind:z.literal('flowchart'),data:flowchartDataSchema}).strict(),
]);

const image = z.object({ url, alt: label }).strict().optional();

const unique = <T extends { id: string }>(items: T[]) => new Set(items.map(x => x.id)).size === items.length;
export const timelineDataSchema = z.object({ activeEventId:id.optional().describe('Explicit active stable event ID. Omit for the static overview. Use view.patch op timeline select/next/previous/clear for revision-bound progression.'), orientation: z.enum(['horizontal','vertical']).default('horizontal'), events: z.array(z.object({ id, title: label, start: date, end: date.optional(), image, visual:timelineVisual.optional(), lane: label.optional(), description: text.optional(), url: url.optional() }).strict().refine(value => !value.end || Date.parse(value.end) >= Date.parse(value.start), 'End must not precede start')).min(1).max(200).refine(unique, 'Event IDs must be unique') }).strict().refine(value=>!value.activeEventId||value.events.some(event=>event.id===value.activeEventId),'Active event must refer to a supplied stable event ID.');
