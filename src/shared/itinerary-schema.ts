import {z} from 'zod';
import {isSafeUrl} from './urls.js';

const text = z.string().min(1).max(4000), label = z.string().min(1).max(240);

const url = z.string().max(4000).refine(value => (/^\/api\/assets\/[A-Za-z0-9_-]{1,128}$/.test(value) || isSafeUrl(value)), 'Expected a safe public URL or protected asset URL');

const date = z.string().max(60).refine(value => /^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)===value.slice(0,10), 'Expected a real YYYY-MM-DD date or timezone-qualified ISO timestamp');

const image = z.object({ url, alt: label }).strict().optional();

export const ITINERARY_CATEGORIES=['flight','hotel','transit','bus','train','boat','food','sightseeing','walk','car','meeting'] as const;
export const itineraryDataSchema = z.object({ layout:z.enum(['list','map']).default('list').describe('map requires explicit coordinates on each stop; place names are never geocoded. Legs are supplied straight connections, not actual road/rail routes.'), days: z.array(z.object({ date, title: label.optional(), items: z.array(z.object({ time: label.optional(), title: label, place: label.optional(), type: label.optional(), category:z.enum(ITINERARY_CATEGORIES).optional(), transport:z.enum(['flight','train','boat','car','walk','bus']).optional().describe('Mode of the straight connection arriving at this stop; not a calculated transport route.'), coordinates:z.object({lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180)}).strict().optional(), inlineMap:z.object({points:z.array(z.object({lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180),label:z.string().max(80).optional()}).strict()).min(1).max(2),connect:z.boolean().default(true)}).strict().optional().describe('Lightweight geographic thumbnail with one or two supplied coordinate pins and optional straight connecting line. Not roads or a calculated route; no geocoding.'), image:z.object({url,alt:label}).strict().optional(), description: text.optional(), url: url.optional() }).strict()).min(1).max(50) }).strict()).min(1).max(31) }).strict().refine(d=>d.layout!=='map'||d.days.every(day=>day.items.every(item=>item.coordinates)), 'Map itinerary requires explicit coordinates for every stop');
