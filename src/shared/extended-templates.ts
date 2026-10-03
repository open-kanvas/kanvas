import { z } from 'zod';
import { productSchema } from './product.js';
import { isSafeUrl } from './urls.js';
import { PROFILE_DETAIL_TYPES, profileDetailError } from './profile-contact.js';

const text = z.string().min(1).max(4000), label = z.string().min(1).max(240);
const url = z.string().max(4000).refine(value => (/^\/api\/assets\/[A-Za-z0-9_-]{1,128}$/.test(value) || isSafeUrl(value)), 'Expected a safe public URL or protected asset URL');
const id = z.string().min(1).max(128);
const date = z.string().max(60).refine(value => /^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)===value.slice(0,10), 'Expected a real YYYY-MM-DD date or timezone-qualified ISO timestamp');
const links = z.array(z.object({ label, url }).strict()).max(12).optional();
const image = z.object({ url, alt: label }).strict().optional();
const detail = z.object({ label, value: text }).strict();
const procedureFields = { name: label, description: text.optional(), materials: z.array(text).max(100).default([]), steps: z.array(text).min(1).max(100), index: z.number().int().min(0).max(99).default(0), stage: z.enum(['intro','step','complete']).default('intro'), completion: text.optional() };
const validStep = (v:{steps:string[];index:number}) => v.index < v.steps.length;
const unique = <T extends { id: string }>(items: T[]) => new Set(items.map(x => x.id)).size === items.length;
export const ITINERARY_CATEGORIES=['flight','hotel','transit','bus','train','boat','food','sightseeing','walk','car','meeting'] as const;
export const RECIPE_ACTIONS=['mix','pour','add','heat','bake','fry','chill','cut','serve','wait'] as const;
export const STATIC_HTML_RULE = 'Return a body fragment in html and optional separate css. Omit script, iframe, object, embed, base, meta and form tags, including viewport metadata. KANVAS supplies the document wrapper and viewport. Only static HTML/CSS is supported.';

/** Display-only contracts. Source retrieval is separate: a publisher supplies it,
 * or an explicitly started bounded monitor refreshes it. No checkout is implied. */
export const extendedSchemas = {
  overview: z.object({ layout:z.enum(['grid','list']).default('grid'), scope:z.enum(['session','account']).default('session').describe('Session: retained content thumbnails, oldest first. Account: live recent-session choices for an authenticated account, as used by the Home display; never selects a recent session automatically.'), displayIds: z.array(id).max(20).optional(), order: z.enum(['oldest', 'newest']).default('oldest').describe('Chronological oldest-first by default. Set newest explicitly only when requested.'), showPreviews: z.boolean().default(true), showMetadata: z.boolean().default(true) }).strict(),
  settings: z.object({ description: text.optional(), dimension: z.enum(['all','style','theme','density','accent','numberLocale','unitSystem','dateFormat','timeFormat','timeZone','readingFontSize','readingWpm','readingZoom']).default('all').describe('Show just one setting for focused voice interaction, or all. Ask whether to apply to session, account, team or organization; scope never changes implicitly.'), allowAccountDefaults: z.boolean().default(true) }).strict(),
  html: z.object({ html: z.string().min(1).max(150_000).refine(value => !/<\s*\/?\s*(?:script|iframe|object|embed|base|meta|form)\b/i.test(value), STATIC_HTML_RULE).describe(STATIC_HTML_RULE), css: z.string().max(50_000).optional(), description: text }).strict(),
  timeline: z.object({ orientation: z.enum(['horizontal','vertical']).default('horizontal'), events: z.array(z.object({ id, title: label, start: date, end: date.optional(), lane: label.optional(), description: text.optional(), url: url.optional() }).strict().refine(value => !value.end || Date.parse(value.end) >= Date.parse(value.start), 'End must not precede start')).min(1).max(200).refine(unique, 'Event IDs must be unique') }).strict(),
  itinerary: z.object({ layout:z.enum(['list','map']).default('list').describe('map requires explicit coordinates on each stop; place names are never geocoded. Legs are supplied straight connections, not actual road/rail routes.'), days: z.array(z.object({ date, title: label.optional(), items: z.array(z.object({ time: label.optional(), title: label, place: label.optional(), type: label.optional(), category:z.enum(ITINERARY_CATEGORIES).optional(), transport:z.enum(['flight','train','boat','car','walk','bus']).optional().describe('Mode of the straight connection arriving at this stop; not a calculated transport route.'), coordinates:z.object({lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180)}).strict().optional(), image:z.object({url,alt:label}).strict().optional(), description: text.optional(), url: url.optional() }).strict()).min(1).max(50) }).strict()).min(1).max(31) }).strict().refine(d=>d.layout!=='map'||d.days.every(day=>day.items.every(item=>item.coordinates)), 'Map itinerary requires explicit coordinates for every stop'),
  product: productSchema,
  weather: z.object({ temperatureUnit: z.enum(['celsius','fahrenheit']).optional(), place: label, temperature: label.optional(), high: label.optional(), low: label.optional(), timeLabel: label.optional(), condition: z.enum(['clear', 'partly-cloudy', 'cloudy', 'rain', 'snow', 'storm', 'fog']), period: z.enum(['day', 'night', 'sunrise', 'sunset']).default('day'), description: text.optional(), details: z.array(detail).max(8).optional(), forecast: z.array(z.object({ time: label, temperature: label, condition: z.enum(['clear', 'partly-cloudy', 'cloudy', 'rain', 'snow', 'storm', 'fog']) }).strict()).max(24).optional() }).strict().refine(d=>Boolean(d.temperature||d.high||d.low),'Supply temperature or an explicit high/low; never infer current temperature from a forecast range.'),
  profile: z.object({ name: label, kind: z.enum(['person', 'organization']).default('person'), role: label.optional(), description: text.optional(), image, details: z.array(detail.extend({ type: z.enum(PROFILE_DETAIL_TYPES).optional().describe('Explicit contact type. Omit or use text to retain plain, non-actionable label/value text.') }).superRefine((value, ctx) => { const message = profileDetailError(value); if (message) ctx.addIssue({ code: 'custom', path: ['value'], message }); })).max(20).optional(), links }).strict(),
  kpi: z.object({ items: z.array(z.object({ label, value: label, delta: label.optional(), trend: z.enum(['up', 'down', 'flat']).optional(), note: text.optional() }).strict()).min(1).max(8) }).strict(),
  quote: z.object({ text: z.string().min(1).max(8000), attribution: label, role: label.optional(), image, url: url.optional() }).strict(),
  'story-cards':z.object({items:z.array(z.object({image,headline:label,summary:text.optional()}).strict()).min(1).max(20)}).strict(),
  recipe: z.object({ ...procedureFields, image, stepDetails:z.array(z.object({index:z.number().int().min(0).max(99),action:z.enum(RECIPE_ACTIONS).optional(),image}).strict()).max(100).optional(), duration: label.optional(), yield: label.optional(), mode: z.enum(['overview','steps']).default('overview') }).strict().refine(validStep, 'Step index must refer to a supplied step').refine(d=>!d.stepDetails||(new Set(d.stepDetails.map(x=>x.index)).size===d.stepDetails.length&&d.stepDetails.every(x=>x.index<d.steps.length)),'Step details must refer to distinct supplied step indices.'),
  procedure: z.object(procedureFields).strict().refine(validStep, 'Step index must refer to a supplied step'),
  join: z.object({ url: z.union([url,z.string().regex(/^\/s\/[A-Za-z0-9_-]{1,128}$/)]), qr: z.object({url,alt:label}).strict(), expiresAt: z.string().datetime(), label: label.default('Join this display'), description: text.optional() }).strict(),
  menu: z.object({ image, groups: z.array(z.object({ title: label, image, items: z.array(z.object({ name: label, price: label.optional(), description: text.optional(), image, featured: z.boolean().default(false) }).strict()).min(1).max(100) }).strict()).min(1).max(20) }).strict(),
  leaderboard: z.object({ items: z.array(z.object({ rank: label, name: label, value: label, change: label.optional(), image }).strict()).min(1).max(100) }).strict(),
  status: z.object({ asOf: label.optional(), items: z.array(z.object({ name: label, status: z.enum(['ok', 'warning', 'down', 'unknown']), label: label.optional(), note: text.optional() }).strict()).min(1).max(100) }).strict(),
};
export type ExtendedTemplate = keyof typeof extendedSchemas;
export type ExtendedData<K extends ExtendedTemplate> = z.infer<(typeof extendedSchemas)[K]>;

export const extendedExamples: Record<ExtendedTemplate, Record<string, unknown>> = {
  overview: { order: 'oldest', showPreviews: true }, settings: { description: 'Tune this session or save your defaults.', allowAccountDefaults: true },
  html: { description: 'An illustrative custom visual', html: '<article><h1>Space to think.</h1><p>A custom visual, safely contained.</p></article>', css: 'article{padding:8vw;font:24px system-ui}h1{font-size:clamp(36px,7vw,100px)}' },
  timeline: { events: [{ id: 'launch', title: 'Launch', start: '2026-09-01', lane: 'Milestones' }, { id: 'review', title: 'Review', start: '2026-09-12', end: '2026-09-14', lane: 'Milestones' }] },
  itinerary: { days: [{ date: '2026-09-12', title: 'A day in Oslo', items: [{ time: '10:00', title: 'Waterfront walk', place: 'Aker Brygge', type: 'Walk' }, { time: '13:00', title: 'Lunch', description: 'A pause by the water.' }] }] },
  product: { name: 'Studio headphones', description: 'Illustrative vendor comparison.', layout: 'image-led', offers: [{ vendor: 'Local shop', price: '1 290 NOK', availability: 'In stock', hours: '10–18', distance: '1.2 km' }, { vendor: 'Online shop', price: '1 190 NOK', shipping: '2–3 days' }] },
  weather: { place: 'Oslo', temperature: '18°', condition: 'clear', period: 'sunset', description: 'Illustrative conditions', forecast: [{ time: '19:00', temperature: '17°', condition: 'clear' }, { time: '20:00', temperature: '15°', condition: 'cloudy' }] },
  profile: { name: 'Alex Morgan', kind: 'person', role: 'Designer', description: 'Making complex ideas feel simple.', details: [{ label: 'Based in', value: 'Oslo' }] },
  kpi: { items: [{ label: 'Revenue', value: '123,456.78', delta: '+12%', trend: 'up' }, { label: 'Response time', value: '42 ms', delta: '−8 ms', trend: 'down' }, { label: 'Availability', value: '99.98%', trend: 'flat' }] },
  quote: { text: 'Simplicity is the ultimate sophistication.', attribution: 'Attributed to Leonardo da Vinci' },
  'story-cards':{items:[{headline:'A quieter waterfront',summary:'The new walking route opens this weekend.'},{headline:'A place to gather',summary:'A restored library welcomes its first visitors.'}]},
  recipe: { name: 'A thoughtful cup of coffee', duration: '5 minutes', yield: '1 cup', materials: ['18 g ground coffee', '300 ml water'], steps: ['Heat the water.', 'Wet the grounds, then pour slowly.', 'Enjoy.'] },
  procedure: {name:'Set up your workspace',description:'One step at a time. Say next or use the controls.',materials:['A clear desk','A notebook'],steps:['Clear a space for the work ahead.','Write down the one result you want to achieve.','Begin with the smallest useful action.']},
  join: {url:'https://example.com/join',qr:{url:'https://example.com/qr.png',alt:'Illustrative join code'},expiresAt:'2099-01-01T00:00:00.000Z',label:'Join this display',description:'The owner approves each screen before it receives content.'},
  menu: { groups: [{ title: 'Coffee', items: [{ name: 'Espresso', price: '35 NOK' }, { name: 'Flat white', price: '49 NOK', featured: true }] }] },
  leaderboard: { items: [{ rank: '1', name: 'North', value: '92', change: '+2' }, { rank: '2', name: 'South', value: '88', change: '−1' }] },
  status: { asOf: 'Illustrative snapshot', items: [{ name: 'API', status: 'ok', note: 'All systems operational' }, { name: 'Imports', status: 'warning', note: 'Queue is longer than usual' }] },
};
