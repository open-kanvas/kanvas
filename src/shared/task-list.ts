import {z} from 'zod';
/** Task list: a table of work items kept in the session. Columns are open and
 * agent-defined; status and tags are plain text with no hidden ids. The stored
 * list holds every item's full detail; what a display receives is a projection
 * that carries full detail only for the highlighted item. */
const identifier=z.string().min(1).max(128).regex(/^[a-zA-Z0-9_.:-]+$/);
const color=z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const TASK_LIST_MAX_ITEMS=200,TASK_DETAIL_MAX=8000;
export const taskColumnSchema=z.object({key:z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/).describe('Field name used in each item\'s fields.'),label:z.string().min(1).max(60)}).strict();
export const taskItemSchema=z.object({
 id:identifier.optional().describe('Stable id. Omit and the server assigns one.'),
 number:z.number().int().min(1).max(100000).optional().describe('Stable item number people say aloud ("item 7"). Assigned by the server; it stays with the item when it moves or is sorted.'),
 title:z.string().min(1).max(300),
 summary:z.string().max(500).optional().describe('Short description, shown on at most two lines.'),
 detail:z.string().max(TASK_DETAIL_MAX).optional().describe('Full detail, e.g. the original section of an email or document. Stored; shown only for the highlighted item. Read it back with tasklist.read item.'),
 source:z.string().max(500).optional().describe('Where the item came from: a reference, link or document name.'),
 checked:z.boolean().default(false),
 status:z.string().min(1).max(40).optional().describe('Free text. Matched case-insensitively for filter, sort and palette.'),
 tags:z.array(z.string().min(1).max(30)).max(8).optional(),
 fields:z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/),z.string().max(200)).optional().describe('Values for the extra columns, by column key.'),
 hasDetail:z.boolean().optional().describe('Set by the server on a displayed item whose stored detail is not included.'),
}).strict();
export const STATUS_PALETTES={
 traffic:{'not started':'#8a8f98','in progress':'#d9a441','blocked':'#d95757','done':'#4caf7d'},
 testing:{'untested':'#8a8f98','testing':'#d9a441','failed':'#d95757','passed':'#4caf7d','skipped':'#6b7fd7'},
 workflow:{'todo':'#8a8f98','doing':'#5b9bd5','review':'#b07fd9','done':'#4caf7d'},
} as const;
export type StatusPaletteName=keyof typeof STATUS_PALETTES;
const sortSchema=z.object({by:z.string().max(40).describe('number (default order by item number), position (stored order), title, status, tag, or a column key.'),direction:z.enum(['asc','desc']).default('asc')}).strict();
const filterSchema=z.object({status:z.array(z.string().max(40)).max(12).optional(),tags:z.array(z.string().max(30)).max(12).optional(),done:z.boolean().optional().describe('true: only done items. false: only open items.')}).strict();
export const taskListDataSchema=z.object({
 taskListId:identifier.optional().describe('Server-managed identity of the saved task list. Present on a shown list; omit to create a new one.'),
 taskListRevision:z.number().int().nonnegative().optional(),
 columns:z.array(taskColumnSchema).max(6).optional().describe('Extra columns after number, item, status and tags. All optional; start with none and add what the work needs.'),
 statusPalette:z.union([z.enum(['traffic','testing','workflow']),z.record(z.string().min(1).max(40),color)]).optional().describe('Colours for status pills: a ready-made palette name, or your own value-to-colour map. Any status value is allowed with or without a colour.'),
 items:z.array(taskItemSchema).max(TASK_LIST_MAX_ITEMS),
 highlight:identifier.optional().describe('id of the item being worked on. It is marked and expanded to show its detail.'),
 sort:sortSchema.optional(),filter:filterSchema.optional(),
 doneLast:z.boolean().default(true).describe('Done items move to the bottom and are muted.'),
 showCounts:z.boolean().default(true),
}).strict().superRefine((data,ctx)=>{
 const ids=new Set<string>(),numbers=new Set<number>();
 data.items.forEach((item,index)=>{
  if(item.id){if(ids.has(item.id))ctx.addIssue({code:'custom',path:['items',index,'id'],message:'Task ids must be unique.'});ids.add(item.id);}
  if(item.number!==undefined){if(numbers.has(item.number))ctx.addIssue({code:'custom',path:['items',index,'number'],message:'Task numbers must be unique.'});numbers.add(item.number);}
 });
});
export type TaskListData=z.infer<typeof taskListDataSchema>;
export type TaskItem=z.infer<typeof taskItemSchema>;
const same=(a:string|undefined,b:string|undefined)=>(a??'').trim().toLocaleLowerCase()===(b??'').trim().toLocaleLowerCase();
export function statusColor(palette:TaskListData['statusPalette'],status:string|undefined):string|undefined{
 if(!status||!palette)return undefined;
 const map:Record<string,string>=typeof palette==='string'?STATUS_PALETTES[palette]:palette;
 return Object.entries(map).find(([value])=>same(value,status))?.[1];
}
/** Deterministic filter and sort over stored items: the same function runs on
 * the server (reads) and in the browser (display). Stable; ties keep stored
 * order. Done items go last when doneLast is on. Nothing is dropped silently:
 * the caller reports how many items the filter hides. */
export function projectTasks<T extends Pick<TaskItem,'checked'|'status'|'tags'|'title'|'number'|'fields'>>(items:readonly T[],view:{sort?:TaskListData['sort'];filter?:TaskListData['filter'];doneLast?:boolean}):{items:T[];hidden:number}{
 const filter=view.filter;
 const kept=items.filter(item=>{
  if(filter?.done!==undefined&&Boolean(item.checked)!==filter.done)return false;
  if(filter?.status?.length&&!filter.status.some(value=>same(value,item.status)))return false;
  if(filter?.tags?.length&&!filter.tags.some(tag=>(item.tags??[]).some(own=>same(own,tag))))return false;
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
