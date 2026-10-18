import { z } from 'zod';

const stamp = z.string().max(60).refine(v => /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v)), 'Supply an ISO timestamp with date and time.');
export const progressEventSchema = z.object({
  id: z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/),
  title: z.string().min(1).max(240), description: z.string().max(4000).optional(),
  timestamp: stamp, status: z.enum(['running','completed','blocked','failed']).default('running'),
}).strict();
export const progressDataSchema = z.object({
  task: z.string().min(1).max(300), orientation: z.enum(['horizontal','vertical']).default('horizontal'),
  layout: z.enum(['auto','single','alternating']).default('auto').describe('Auto alternates cards around a centered spine from six events; short lists use one side.'),
  status: z.enum(['running','completed','blocked','failed']).default('running'),
  events: z.array(progressEventSchema).max(500).default([]),
}).strict().refine(v => new Set(v.events.map(e=>e.id)).size===v.events.length, 'Progress event IDs must be unique.');
export const logEntrySchema = z.object({
  line: z.number().int().min(1).max(10000000).optional(), timestamp: z.string().max(100).optional(),
  level: z.enum(['trace','debug','info','warn','error','fatal']).default('info'),
  message: z.string().max(16000), flagged: z.boolean().default(false), annotation: z.string().max(1000).optional(),
}).strict();
export const logDataSchema = z.object({
  source: z.string().max(300).optional(), entries: z.array(logEntrySchema).min(1).max(2000).optional(),
  raw: z.string().min(1).max(200000).optional(), startLine: z.number().int().min(1).max(1000000).default(1),
  pageSize: z.number().int().min(1).max(200).default(100),
}).strict().superRefine((v,ctx)=>{
  if(Boolean(v.entries)===Boolean(v.raw))ctx.addIssue({code:'custom',message:'Supply structured entries or exact raw text, not both.'});
  if(v.raw && v.raw.split('\n').length>2000)ctx.addIssue({code:'custom',path:['raw'],message:'At most 2000 log lines.'});
  const lines=v.entries?.map((e,i)=>e.line??v.startLine+i)??[];
  if(new Set(lines).size!==lines.length)ctx.addIssue({code:'custom',path:['entries'],message:'Log line references must be unique.'});
});
export type ProgressData = z.infer<typeof progressDataSchema>;
export type LogData = z.infer<typeof logDataSchema>;
export function logEntries(data:LogData):Array<z.infer<typeof logEntrySchema>&{line:number}>{
  const entries:z.infer<typeof logEntrySchema>[]=data.entries??data.raw!.split('\n').map(message=>({message,level:'info',flagged:false}));
  return entries.map((entry,index)=>({...entry,line:entry.line??data.startLine+index}));
}

const slot=z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const progressAppendSchema=z.object({
  sessionId:slot,displayId:slot,requestId:slot,expectedRevision:z.number().int().nonnegative().optional(),
  event:progressEventSchema.omit({timestamp:true}).extend({timestamp:stamp.optional()}).strict(),
  status:z.enum(['running','completed','blocked','failed']).optional(),
}).strict();
