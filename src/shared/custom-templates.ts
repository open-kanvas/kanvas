import {z} from 'zod';
export const customDefinitionSchema=z.object({name:z.string().trim().min(1).max(100),schema:z.record(z.string(),z.unknown()).refine(v=>JSON.stringify(v).length<=65536,'Schema must fit 64 KiB.'),html:z.string().min(1).max(50000),css:z.string().max(20000).default('')}).strict();
export const customViewSchema=z.object({templateId:z.string().min(1).max(128),values:z.record(z.string(),z.unknown()),html:z.string().max(250000).optional(),css:z.string().max(20000).optional()}).strict();
export interface CustomTemplate {id:string;ownerId:string;name:string;schema:Record<string,unknown>;html:string;css:string;createdAt:string}
export function escapeBinding(v:unknown):string{return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
/** No eval, expressions, path traversal, prototype lookup or executable bindings. */
export function bindTemplate(html:string,values:Record<string,unknown>):string {
 let expansions=0;
 const lookup=(data:Record<string,unknown>,key:string)=>Object.hasOwn(data,key)?data[key]:undefined;
 const expand=(source:string,data:Record<string,unknown>,depth:number):string=>{
  if(depth>8)throw new Error('Repeating section nesting exceeds 8.');
  if(++expansions>10000)throw new Error('Template binding complexity exceeds 10000 expansions.');
  // A stack scanner supports nested repetitions, including repeated same-name keys.
  let output='',position=0;
  const tokens=/{{\s*(#each\s+([A-Za-z][A-Za-z0-9_]*)|\/each|([A-Za-z][A-Za-z0-9_]*))\s*}}/g;
  let match:RegExpExecArray|null;
  while((match=tokens.exec(source))){const literal=source.slice(position,match.index);if(/{{|}}/.test(literal))throw new Error('Unsupported binding.');output+=literal;position=tokens.lastIndex;
   if(match[2]){let nesting=1,close:RegExpExecArray|null=null;while((close=tokens.exec(source))){if(close[2])nesting++;else if(close[1]==='/each'&&--nesting===0)break;}if(!close)throw new Error('Unclosed each section.');const items=lookup(data,match[2])??[];if(!Array.isArray(items))throw new Error('Repeating binding requires an array.');const body=source.slice(position,close.index);for(const item of items){output+=expand(body,item&&typeof item==='object'&&!Array.isArray(item)?item as Record<string,unknown>:{value:item},depth+1);if(output.length>250000)throw new Error('Expanded template exceeds 250000 characters.');}position=tokens.lastIndex;
   }else if(match[1]==='/each')throw new Error('Unexpected each closing tag.');
   else output+=escapeBinding(lookup(data,match[3]));
   if(output.length>250000)throw new Error('Expanded template exceeds 250000 characters.');
  }
  const tail=source.slice(position);if(/{{|}}/.test(tail))throw new Error('Unsupported binding. Use {{field}} and {{#each items}}…{{/each}}.');output+=tail;if(output.length>250000)throw new Error('Expanded template exceeds 250000 characters.');return output;
 };
 return expand(html,values,0);
}
