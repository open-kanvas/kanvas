import {z} from 'zod';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const satisfactionDataSchema=z.object({surveyId:id,levels:z.union([z.literal(3),z.literal(5)]).default(3),question:z.string().max(240).optional(),thankYou:z.string().max(160).optional(),closed:z.boolean().default(false),thankYouSeconds:z.number().min(.5).max(10).default(2)}).strict();
export const satisfactionRateSchema=z.object({kind:z.literal('satisfaction.rate'),rating:z.number().int().min(1).max(5)}).strict();
export const satisfactionReadSchema=z.object({sessionId:id,displayId:id.optional(),surveyId:id.optional(),from:z.iso.datetime({offset:true}),to:z.iso.datetime({offset:true})}).strict().refine(x=>Date.parse(x.from)<Date.parse(x.to)&&Date.parse(x.to)-Date.parse(x.from)<=366*86400000,'Choose a positive half-open time range no longer than366days');
export const satisfactionScores=(levels:3|5)=>levels===3?[1,3,5]:[1,2,3,4,5];
export type SatisfactionData=z.infer<typeof satisfactionDataSchema>;
export function parseKioskRoute(path:string){const m=/^\/kiosk\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\/?$/.exec(path);return m?{sessionId:m[1],displayId:m[2]}:undefined;}
