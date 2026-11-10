import type {ViewSpec} from './types.js';
/** A short label for a view that has no title, so history and pins can be
 * scanned: the template name and the first meaningful text of the view, e.g.
 * "poll: Which tempo matters most?". Deterministic; no model. */
const FIELDS=['question','text','headline','name','label','place','tool','team','purpose','line','concept','json'] as const;
export const VIEW_LABEL_LENGTH=40;
export function derivedViewLabel(view:Pick<ViewSpec,'template'|'data'|'title'>|null|undefined):string|undefined{
 if(!view||view.title?.trim())return undefined;
 const data=(view.data??{}) as Record<string,unknown>;
 const first=(value:unknown):string|undefined=>{
  if(typeof value==='string'&&value.trim())return value;
  if(Array.isArray(value))for(const item of value.slice(0,3)){const found=typeof item==='string'?first(item):item&&typeof item==='object'?pick(item as Record<string,unknown>):undefined;if(found)return found;}
  return undefined;
 };
 const pick=(record:Record<string,unknown>):string|undefined=>{for(const field of [...FIELDS,'title','message','summary'])if(Object.hasOwn(record,field)){const found=first(record[field]);if(found)return found;}return undefined;};
 const text=pick(data)??first(data.items)??first(data.steps)??first(data.options)??first(data.messages)??first(data.entries)??first(data.slides);
 if(!text)return undefined;
 const line=text.split(/\r?\n/).map(part=>part.trim()).find(Boolean)??'';
 if(!line)return undefined;
 return `${view.template}: ${line.length>VIEW_LABEL_LENGTH?`${line.slice(0,VIEW_LABEL_LENGTH-1).trimEnd()}…`:line}`;
}
