import {z} from 'zod';
import {KANVAS_VERSION} from './version.js';
export const diagnosticEventSchema=z.strictObject({
 event:z.enum(['startup','route','command','navigation','stream-open','stream-error','stream-close','request','js-error','render-error','asset-error','render-applied','update-received']),
 sessionId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),displayId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
 updateId:z.string().uuid().optional(),revision:z.number().int().nonnegative().optional(),
 route:z.enum(['start','view','console','auth','other']).optional(),status:z.number().int().min(0).max(599).optional(),
 clientAt:z.number().int().nonnegative().max(100000000000000).optional(),
 elapsedMs:z.number().int().min(0).max(3600000).optional()
});
export const diagnosticBatchSchema=z.strictObject({clientRelease:z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/).default(KANVAS_VERSION),supportRef:z.string().uuid(),windowId:z.string().uuid(),events:z.array(diagnosticEventSchema).min(1).max(20)});
export const diagnosticReadSchema=z.strictObject({supportRef:z.string().uuid(),accountId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional()});
export type DiagnosticEvent=z.infer<typeof diagnosticEventSchema>;
/** Deliberately classify, never retain a URL, filename, query, fragment or error text. */
export function diagnosticRoute(path:string):'start'|'view'|'console'|'auth'|'other'{
 const clean=path.split(/[?#]/,1)[0];
 return clean==='/start'||clean==='/'?'start':clean.startsWith('/view/')?'view':clean.startsWith('/console')?'console':clean.startsWith('/api/auth/')?'auth':'other';
}
