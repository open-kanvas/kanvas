import { imageReferenceSchema } from './image-gallery.js';
import { z } from 'zod';
import type { ViewSpec } from './types.js';
const id=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const label=z.string().min(1).max(200);
const value=z.union([z.number().finite(),z.string().max(120)]);
export const scoreboardDataSchema=z.object({
  sides:z.array(z.object({id,name:label,logo:imageReferenceSchema.optional(),score:value,color:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()}).strict()).min(2).max(16),
  size:z.enum(['standard','large','extra-large']).default('large'),logoPosition:z.enum(['beside','above']).default('beside'),logoSize:z.number().min(.5).max(3).default(1),
  context:z.string().max(300).optional(),period:z.string().max(120).optional(),clock:z.string().max(80).optional(),
  event:z.object({text:z.string().min(1).max(1000),sideId:id.optional(),type:z.enum(['goal','penalty','card','substitution','score','timeout','info']).optional()}).strict().nullable().optional(),
  interactive:z.boolean().default(true),step:z.number().int().min(1).max(1000).default(1),
}).strict().refine(d=>new Set(d.sides.map(s=>s.id)).size===d.sides.length,'Side IDs must be unique').refine(d=>!d.event?.sideId||d.sides.some(s=>s.id===d.event!.sideId),'Event sideId must name a supplied side');
export type ScoreboardData=z.infer<typeof scoreboardDataSchema>;
export const standingsDataSchema=z.object({
  columns:z.array(z.object({id,label,type:z.enum(['number','text']).default('number')}).strict()).min(1).max(16),
  groups:z.array(z.object({id,name:label.optional(),rows:z.array(z.object({id,name:label,logo:imageReferenceSchema.optional(),position:z.number().int().positive(),movement:z.number().int().min(-10000).max(10000).optional(),values:z.record(id,value)}).strict()).max(500)}).strict()).min(1).max(20),
  sort:z.object({column:id,direction:z.enum(['asc','desc'])}).strict().optional(),
}).strict().superRefine((d,c)=>{
  if(new Set(d.columns.map(x=>x.id)).size!==d.columns.length||new Set(d.groups.map(x=>x.id)).size!==d.groups.length)c.addIssue({code:'custom',message:'Column and group IDs must be unique'});
  if(d.sort&&!d.columns.some(x=>x.id===d.sort!.column))c.addIssue({code:'custom',message:'Sort must name a supplied column'});
  let count=0;for(const g of d.groups){count+=g.rows.length;if(new Set(g.rows.map(x=>x.id)).size!==g.rows.length)c.addIssue({code:'custom',message:'Row IDs must be unique within a group'});for(const row of g.rows)if(Object.keys(row.values).some(k=>!d.columns.some(x=>x.id===k)))c.addIssue({code:'custom',message:'Row contains an undeclared column'});}
  if(count>1000)c.addIssue({code:'custom',message:'Maximum 1000 standings rows'});
});
export type StandingsData=z.infer<typeof standingsDataSchema>;
export const toolCallSchema=z.object({id,integration:label,tool:label,operation:label.optional(),source:z.enum(['automatic','agent']).optional(),sessionId:id.optional(),durationMs:z.number().int().nonnegative().optional(),timestamp:z.string().datetime({offset:true}),status:z.enum(['started','completed','failed']).default('completed'),summary:z.string().max(1000).optional()}).strict();
export type ToolCall=z.infer<typeof toolCallSchema>;
export const toolLogDataSchema=z.object({channel:id.default('main'),limit:z.number().int().min(1).max(200).default(100)}).strict();
/** Only adjacent calls to the same integration/tool are folded. Exact calls remain available. */
export function consecutiveCalls(events:ToolCall[]){const groups:{calls:ToolCall[]}[]=[];for(const event of events){const last=groups.at(-1);if(last&&last.calls[0].integration===event.integration&&last.calls[0].tool===event.tool&&last.calls[0].operation===event.operation&&last.calls[0].status===event.status)last.calls.push(event);else groups.push({calls:[event]});}return groups;}
export const eventViewExamples:Record<'scoreboard'|'standings'|'tool-call-log',ViewSpec>={
  scoreboard:{version:1,template:'scoreboard',data:{sides:[{id:'home',name:'Harbour',score:12},{id:'away',name:'Forest',score:9}],period:'Round 2',clock:'04:32',interactive:true,step:1}},
  standings:{version:1,template:'standings',data:{columns:[{id:'played',label:'Played',type:'number'},{id:'points',label:'Points',type:'number'}],groups:[{id:'north',name:'North division',rows:[{id:'harbour',position:1,name:'Harbour',movement:1,values:{played:6,points:15}},{id:'forest',position:2,name:'Forest',movement:-1,values:{played:6,points:12}}]}]}},
  'tool-call-log':{version:1,template:'tool-call-log',data:{channel:'main',limit:100}},
};
