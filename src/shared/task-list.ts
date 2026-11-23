import {z} from 'zod';
/** Task list: a table of work items kept in the session. Columns are open and
 * agent-defined; status and tags are plain text with no hidden ids. The stored
 * list holds every item's full detail; what a display receives is a projection
 * that carries full detail for expanded items. */
const identifier=z.string().min(1).max(128).regex(/^[a-zA-Z0-9_.:-]+$/);
export const TASK_LIST_MAX_ITEMS=200,TASK_DETAIL_MAX=8000,STATUS_COLOURS_MAX=16,TASK_ITEM_MAX_BYTES=64*1024,TASK_LIST_MAX_BYTES=2*1024*1024;
/** Columns the list always has. Naming one in `columns` adds nothing: it is already on screen. */
export const TASK_BUILTIN_COLUMNS=new Set(['number','#','no','item','title','status','tags','tag','summary','done','checked','check']);
export const isBuiltinTaskColumn=(key:string)=>TASK_BUILTIN_COLUMNS.has(key.trim().toLowerCase());
/** Own columns worth a place on screen: not a built-in, and at least one item has a value for it. */
export function taskCustomColumns<C extends {key:string}>(columns:readonly C[]|undefined,items?:readonly {fields?:Record<string,string>}[]):C[]{
 return (columns??[]).filter(column=>!isBuiltinTaskColumn(column.key)&&(!items||items.some(item=>(item.fields?.[column.key]??'').trim())));
}
export const taskColumnSchema=z.object({key:z.string().min(1).max(40),label:z.string().min(1).max(60)}).strict();
/** A small map of text to text: an item's own column values, and a list's own status colours. */
const textMap=z.record(z.string(),z.string().max(200));
const longKey=(map:Record<string,string>|undefined)=>Object.keys(map??{}).some(key=>key.length>40);
export const taskSubtaskSchema=z.object({
 id:identifier.optional(),title:z.string().min(1).max(300),checked:z.boolean().default(false),
 status:z.string().min(1).max(40).optional(),description:z.string().max(2000).optional(),detail:z.string().max(TASK_DETAIL_MAX).optional(),
}).strict();
export type TaskSubtask=z.infer<typeof taskSubtaskSchema>;
export const taskItemSchema=z.object({
 id:identifier.optional(),
 number:z.number().int().min(1).optional(),
 title:z.string().min(1).max(300),
 reference:z.string().max(200).optional(),
 subtasks:z.array(taskSubtaskSchema).max(100).optional().describe('Up to100 stable subtasks; the parent with all detail is bounded to64KiB, the saved list to2MiB.'),
 subtaskProgress:z.object({total:z.number().int().nonnegative(),done:z.number().int().nonnegative()}).optional(),
 summary:z.string().max(500).optional(),
 detail:z.string().max(TASK_DETAIL_MAX).optional(),
 source:z.string().max(500).optional(),
 checked:z.boolean().default(false),
 status:z.string().min(1).max(40).optional(),
 tags:z.array(z.string().min(1).max(30)).max(8).optional(),
 fields:textMap.optional(),
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
const filterValues=z.array(z.string().max(40)).max(12);
/** A filter on an own column is plain text, column=value ("owner=Anna"): entries for the same column are
 * alternatives, different columns must all match. Undefined when the text is not of that form. */
export const fieldFilter=(entry:string):[string,string]|undefined=>{const at=entry.indexOf('=');return at>0&&at<entry.length-1?[entry.slice(0,at).trim(),entry.slice(at+1).trim()]:undefined;};
const filterSchema=z.object({status:filterValues.optional(),tags:z.array(z.string().max(30)).max(12).optional(),fields:filterValues.optional(),done:z.boolean().optional()}).strict();
export const taskListDataSchema=z.object({
 taskListId:identifier.optional(),
 taskListRevision:z.number().int().nonnegative().optional(),
 columns:z.array(taskColumnSchema).max(6).optional(),
 statusPalette:z.enum(['traffic','testing','workflow']).optional(),
 colors:textMap.optional(),
 items:z.array(taskItemSchema).max(TASK_LIST_MAX_ITEMS),
 expanded:z.array(identifier).max(TASK_LIST_MAX_ITEMS).optional().describe("Expanded item ids; omitted opens the highlight, empty collapses all."),
 expansionRevision:z.number().int().nonnegative().optional(),
 highlight:identifier.optional(),
 highlightSubtask:identifier.optional(),
 showNumber:z.boolean().optional().describe('Default true; permanent task numbers remain unchanged when hidden.'),
 showReference:z.boolean().optional().describe('Default false; shows plain-text reference metadata independently of permanent numbers.'),
 sort:sortSchema.optional(),filter:filterSchema.optional(),
 doneLast:z.boolean().optional().describe('true moves checked items to the bottom. Default: every item stays where it was written.'),
}).strict().superRefine((data,ctx)=>{
 const ids=new Set<string>(),numbers=new Set<number>();
 if(new TextEncoder().encode(JSON.stringify(data)).byteLength>TASK_LIST_MAX_BYTES)ctx.addIssue({code:'custom',path:['items'],message:'Saved task list exceeds its 2 MiB byte limit.'});
 if(data.colors&&(Object.keys(data.colors).length>STATUS_COLOURS_MAX||longKey(data.colors)||Object.entries(data.colors).some(([value,colour])=>!value.trim()||!/^#[0-9a-fA-F]{6}$/.test(colour))))ctx.addIssue({code:'custom',path:['colors'],message:`colors maps up to ${STATUS_COLOURS_MAX} status values to #rrggbb colours, e.g. {"waiting":"#d9a441"}.`});
 for(const [index,entry] of (data.filter?.fields??[]).entries())if(!fieldFilter(entry))ctx.addIssue({code:'custom',path:['filter','fields',index],message:'A column filter is written column=value, e.g. "owner=Anna".'});
 data.items.forEach((item,index)=>{
  if(item.subtasks?.length&&new TextEncoder().encode(JSON.stringify(item)).byteLength>TASK_ITEM_MAX_BYTES)ctx.addIssue({code:'custom',path:['items',index,'subtasks'],message:'Parent task and subtask detail exceed the 64 KiB read budget.'});
  const subIds=(item.subtasks??[]).flatMap(s=>s.id?[s.id]:[]);
  if(new Set(subIds).size!==subIds.length)ctx.addIssue({code:'custom',path:['items',index,'subtasks'],message:'Subtask ids must be unique within their parent.'});
  if(longKey(item.fields))ctx.addIssue({code:'custom',path:['items',index,'fields'],message:'A column key has at most 40 characters.'});
  if(item.id){if(ids.has(item.id))ctx.addIssue({code:'custom',path:['items',index,'id'],message:'Task ids must be unique.'});ids.add(item.id);}
  if(item.number!==undefined){if(numbers.has(item.number))ctx.addIssue({code:'custom',path:['items',index,'number'],message:'Task numbers must be unique.'});numbers.add(item.number);}
 });
});
export type TaskListData=z.infer<typeof taskListDataSchema>;
export type TaskItem=z.infer<typeof taskItemSchema>;
const same=(a:string|undefined,b:string|undefined)=>(a??'').trim().toLocaleLowerCase()===(b??'').trim().toLocaleLowerCase();
/** Colour of a status pill: the list's own colours first, then its ready-made
 * palette. Matching ignores case. Any other value is a neutral pill. */
export function statusColor(palette:TaskListData['statusPalette'],status:string|undefined,own?:TaskListData['colors']):string|undefined{
 if(!status)return undefined;
 const custom=own?Object.entries(own).find(([value])=>same(value,status))?.[1]:undefined;
 if(custom||!palette)return custom;
 const map:Record<string,string>=STATUS_PALETTES[palette];
 return Object.entries(map).find(([value])=>same(value,status))?.[1];
}
/** Deterministic filter and sort over stored items: the same function runs on
 * the server (reads) and in the browser (display). Stable; ties keep stored
 * order. Items keep their written order whether done or not, unless the list
 * asks for doneLast. Nothing is dropped silently:
 * the caller reports how many items the filter hides. */
export function projectTasks<T extends Pick<TaskItem,'checked'|'status'|'tags'|'title'|'number'|'fields'>>(items:readonly T[],view:{sort?:TaskListData['sort'];filter?:TaskListData['filter'];doneLast?:boolean}={}):{items:T[];hidden:number}{
 const filter=view.filter;
 const kept=items.filter(item=>{
  if(filter?.done!==undefined&&Boolean(item.checked)!==filter.done)return false;
  if(filter?.status?.length&&!filter.status.some(value=>same(value,item.status)))return false;
  if(filter?.tags?.length&&!filter.tags.some(tag=>(item.tags??[]).some(own=>same(own,tag))))return false;
  if(filter?.fields?.length){const wanted=new Map<string,string[]>();for(const entry of filter.fields){const pair=fieldFilter(entry);if(pair)wanted.set(pair[0],[...(wanted.get(pair[0])??[]),pair[1]]);}
   for(const [column,values] of wanted)if(!values.some(value=>same(value,item.fields?.[column])))return false;}
  return true;
 });
 const indexed=kept.map((item,index)=>({item,index}));
 const by=view.sort?.by,direction=view.sort?.direction==='desc'?-1:1;
 const value=(item:T):string|number=>by==='number'?item.number??0:by==='title'?item.title.toLocaleLowerCase():by==='status'?(item.status??'￿').toLocaleLowerCase():by==='tag'?((item.tags??[])[0]??'￿').toLocaleLowerCase():by&&by!=='position'?(item.fields?.[by]??'￿').toLocaleLowerCase():0;
 indexed.sort((a,b)=>{
  if(view.doneLast===true&&Boolean(a.item.checked)!==Boolean(b.item.checked))return a.item.checked?1:-1;
  if(by&&by!=='position'){const x=value(a.item),y=value(b.item);if(x!==y)return (x<y?-1:1)*direction;}
  return a.index-b.index;
 });
 return {items:indexed.map(x=>x.item),hidden:items.length-kept.length};
}
