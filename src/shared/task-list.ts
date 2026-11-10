import {z} from 'zod';
/** Task list: a table of work items kept in the session. Columns are open and
 * agent-defined; status and tags are plain text with no hidden ids. The stored
 * list holds every item's full detail; what a display receives is a projection
 * that carries full detail only for the highlighted item. */
const identifier=z.string().min(1).max(128).regex(/^[a-zA-Z0-9_.:-]+$/);
export const TASK_LIST_MAX_ITEMS=200,TASK_DETAIL_MAX=8000,STATUS_COLOURS_MAX=16;
export const taskColumnSchema=z.object({key:z.string().min(1).max(40),label:z.string().min(1).max(60)}).strict();
export const taskItemSchema=z.object({
 id:identifier.optional(),
 number:z.number().int().min(1).optional(),
 title:z.string().min(1).max(300),
 summary:z.string().max(500).optional(),
 detail:z.string().max(TASK_DETAIL_MAX).optional(),
 source:z.string().max(500).optional(),
 checked:z.boolean().default(false),
 status:z.string().min(1).max(40).optional(),
 tags:z.array(z.string().min(1).max(30)).max(8).optional(),
 fields:z.record(z.string().max(40),z.string().max(200)).optional(),
 hasDetail:z.boolean().optional(),
}).strict();
export const STATUS_PALETTES={
 traffic:{'not started':'#8a8f98','in progress':'#d9a441','blocked':'#d95757','done':'#4caf7d'},
 testing:{'untested':'#8a8f98','testing':'#d9a441','failed':'#d95757','passed':'#4caf7d','skipped':'#6b7fd7'},
 workflow:{'todo':'#8a8f98','doing':'#5b9bd5','review':'#b07fd9','done':'#4caf7d'},
} as const;
export type StatusPaletteName=keyof typeof STATUS_PALETTES;
const sortSchema=z.object({by:z.string().max(40),direction:z.enum(['asc','desc']).default('asc')}).strict();
/** Values of an own column to keep, e.g. {"owner":["Anna"]}. Matching ignores case, like status and tags. */
export const taskFieldFilterSchema=z.record(z.string().min(1).max(40),z.array(z.string().max(200)).min(1).max(12)).refine(value=>Object.keys(value).length<=6,'At most 6 columns in one filter.');
const filterSchema=z.object({status:z.array(z.string().max(40)).max(12).optional(),tags:z.array(z.string().max(30)).max(12).optional(),fields:taskFieldFilterSchema.optional(),done:z.boolean().optional()}).strict();
export const taskListDataSchema=z.object({
 taskListId:identifier.optional(),
 taskListRevision:z.number().int().nonnegative().optional(),
 columns:z.array(taskColumnSchema).max(6).optional(),
 statusPalette:z.enum(['traffic','testing','workflow']).optional(),
 statusColors:z.record(z.string().min(1).max(40),z.string().regex(/^#[0-9a-fA-F]{6}$/)).optional().describe('Own status colours, e.g. {"waiting":"#d9a441"}.'),
 items:z.array(taskItemSchema).max(TASK_LIST_MAX_ITEMS),
 highlight:identifier.optional(),
 sort:sortSchema.optional(),filter:filterSchema.optional(),
}).strict().superRefine((data,ctx)=>{
 const ids=new Set<string>(),numbers=new Set<number>();
 if(data.statusColors&&Object.keys(data.statusColors).length>STATUS_COLOURS_MAX)ctx.addIssue({code:'custom',path:['statusColors'],message:`At most ${STATUS_COLOURS_MAX} status colours.`});
 data.items.forEach((item,index)=>{
  if(item.id){if(ids.has(item.id))ctx.addIssue({code:'custom',path:['items',index,'id'],message:'Task ids must be unique.'});ids.add(item.id);}
  if(item.number!==undefined){if(numbers.has(item.number))ctx.addIssue({code:'custom',path:['items',index,'number'],message:'Task numbers must be unique.'});numbers.add(item.number);}
 });
});
export type TaskListData=z.infer<typeof taskListDataSchema>;
export type TaskItem=z.infer<typeof taskItemSchema>;
const same=(a:string|undefined,b:string|undefined)=>(a??'').trim().toLocaleLowerCase()===(b??'').trim().toLocaleLowerCase();
/** Colour of a status pill: the list's own colours first, then its ready-made
 * palette. Matching ignores case. Any other value is a neutral pill. */
export function statusColor(palette:TaskListData['statusPalette'],status:string|undefined,own?:TaskListData['statusColors']):string|undefined{
 if(!status)return undefined;
 const custom=own?Object.entries(own).find(([value])=>same(value,status))?.[1]:undefined;
 if(custom||!palette)return custom;
 const map:Record<string,string>=STATUS_PALETTES[palette];
 return Object.entries(map).find(([value])=>same(value,status))?.[1];
}
/** Deterministic filter and sort over stored items: the same function runs on
 * the server (reads) and in the browser (display). Stable; ties keep stored
 * order. Done items always go last. Nothing is dropped silently:
 * the caller reports how many items the filter hides. */
export function projectTasks<T extends Pick<TaskItem,'checked'|'status'|'tags'|'title'|'number'|'fields'>>(items:readonly T[],view:{sort?:TaskListData['sort'];filter?:TaskListData['filter'];doneLast?:boolean}={}):{items:T[];hidden:number}{
 const filter=view.filter;
 const kept=items.filter(item=>{
  if(filter?.done!==undefined&&Boolean(item.checked)!==filter.done)return false;
  if(filter?.status?.length&&!filter.status.some(value=>same(value,item.status)))return false;
  if(filter?.tags?.length&&!filter.tags.some(tag=>(item.tags??[]).some(own=>same(own,tag))))return false;
  if(filter?.fields)for(const [column,values] of Object.entries(filter.fields))if(!values.some(value=>same(value,item.fields?.[column])))return false;
  return true;
 });
 const indexed=kept.map((item,index)=>({item,index}));
 const by=view.sort?.by,direction=view.sort?.direction==='desc'?-1:1;
 const value=(item:T):string|number=>by==='number'?item.number??0:by==='title'?item.title.toLocaleLowerCase():by==='status'?(item.status??'￿').toLocaleLowerCase():by==='tag'?((item.tags??[])[0]??'￿').toLocaleLowerCase():by&&by!=='position'?(item.fields?.[by]??'￿').toLocaleLowerCase():0;
 indexed.sort((a,b)=>{
  if(view.doneLast!==false&&Boolean(a.item.checked)!==Boolean(b.item.checked))return a.item.checked?1:-1;
  if(by&&by!=='position'){const x=value(a.item),y=value(b.item);if(x!==y)return (x<y?-1:1)*direction;}
  return a.index-b.index;
 });
 return {items:indexed.map(x=>x.item),hidden:items.length-kept.length};
}
