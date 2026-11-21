import { z } from 'zod';

export const topologyDataSchema=z.object({
  layout:z.enum(['connections','map']).default('connections'),
  density:z.enum(['comfortable','compact']).default('comfortable'),
  groupBy:z.enum(['all','people','devices','displays']).default('all').describe('Agent-selected view: all shows displays, people, devices and windows together. No on-screen grouping controls.'),
  includeOffline:z.boolean().default(true),
  includeLocation:z.boolean().default(false).describe('Owner-authorized display of approximate IP-derived country/region/city, never GPS or precise addresses.'),
  expectedCountries:z.array(z.string().regex(/^[A-Z]{2}$/)).max(32).default([]),
}).strict();
export type TopologyData=z.infer<typeof topologyDataSchema>;

export interface JsonNode {path:string;key:string;kind:'object'|'array'|'string'|'number'|'boolean'|'null';raw:string;value?:string;children?:JsonNode[]}
/** Token-preserving parser: integers and decimals are never rounded through
 * Number, duplicate keys stay separate, and even reserved keys remain inert. */
export function parseJsonTree(source:string):JsonNode{
  if(source.length>262144)throw new Error('JSON text is limited to 262144 characters.');
  let position=0,nodes=0;
  const whitespace=()=>{while(/[\x20\t\r\n]/.test(source[position]??'\0'))position++;};
  const string=()=>{const start=position++;let escaped=false;
    while(position<source.length){const c=source[position++];if(!escaped&&c==='"'){const raw=source.slice(start,position);return {raw,value:JSON.parse(raw) as string};}if(!escaped&&c==='\\')escaped=true;else escaped=false;}
    throw new Error('Unterminated JSON string.');
  };
  const read=(path:string,key:string,depth:number):JsonNode=>{
    whitespace();if(++nodes>12000||depth>64)throw new Error('JSON exceeds 12000 nodes or 64 nested levels.');
    const start=position,c=source[position];
    if(c==='{'||c==='['){position++;const object=c==='{',end=object?'}':']',children:JsonNode[]=[];whitespace();
      if(source[position]!==end)while(true){let childKey=String(children.length);if(object){if(source[position]!=='"')throw new Error('Expected an object key.');childKey=string().value;whitespace();if(source[position++]!==':')throw new Error('Expected a colon.');}
        children.push(read(`${path}/${childKey.replaceAll('~','~0').replaceAll('/','~1')}`,childKey,depth+1));whitespace();if(source[position]===end)break;if(source[position++]!==',')throw new Error('Expected a comma.');whitespace();}
      if(source[position++]!==end)throw new Error('Unclosed JSON container.');
      return {path,key,kind:object?'object':'array',raw:source.slice(start,position),children};
    }
    if(c==='"'){const s=string();return {path,key,kind:'string',...s};}
    const match=/^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(source.slice(position));
    if(!match)throw new Error('Expected a JSON value.');position+=match[0].length;const raw=match[0];return {path,key,kind:raw==='null'?'null':raw==='true'||raw==='false'?'boolean':'number',raw,value:raw};
  };
  const root=read('','$',0);whitespace();if(position!==source.length)throw new Error('Unexpected text after JSON.');return root;
}
const jsonPaths=z.array(z.string().max(2048).regex(/^(?:\/(?:[^~]|~[01])*)?$/,'Use a JSON Pointer, or an empty string for the root.')).max(128);
export const jsonDataSchema=z.object({
  json:z.string().min(1).max(262144).refine(value=>{try{parseJsonTree(value);return true;}catch{return false;}},'Supply valid JSON with at most 12000 nodes and 64 nested levels.').describe('Exact JSON source text, including original decimal/integer tokens. Not a stringified tool argument.'),
  expandedDepth:z.number().int().min(0).max(64).default(2).describe('Agent-controlled expansion depth; 64 expands all supported levels.'),
  expandedPaths:jsonPaths.optional(),
  collapsedPaths:jsonPaths.optional(),
  query:z.string().max(200).optional().describe('Agent-controlled key/value search. Matching nodes and ancestors are shown; the complete original JSON is retained.'),
  view:z.enum(['raw','tree']).default('raw').describe('raw: pretty-printed text with line numbers. tree: collapsible tree.'),
}).strict();
export type JsonData=z.input<typeof jsonDataSchema>;

/** Re-indent JSON source without parsing its values: every string, number and
 * literal is copied token for token, so large integers and exact decimals
 * survive. Only whitespace between tokens changes. Input must be valid JSON. */
export function prettyJson(source:string,indent=2):string{
 let out='',depth=0,i=0;const pad=()=>'\n'+' '.repeat(depth*indent);
 const length=source.length;
 while(i<length){
  const c=source[i];
  if(c==='"'){let j=i+1;while(j<length&&source[j]!=='"'){if(source[j]==='\\')j++;j++;}out+=source.slice(i,j+1);i=j+1;continue;}
  if(c==='{'||c==='['){let j=i+1;while(j<length&&/\s/.test(source[j]))j++;const close=c==='{'?'}':']';if(source[j]===close){out+=c+close;i=j+1;continue;}depth++;out+=c+pad();i++;continue;}
  if(c==='}'||c===']'){depth=Math.max(0,depth-1);out+=pad()+c;i++;continue;}
  if(c===','){out+=','+pad();i++;continue;}
  if(c===':'){out+=': ';i++;continue;}
  if(/\s/.test(c)){i++;continue;}
  let j=i;while(j<length&&!/[\s,:{}\[\]"]/.test(source[j]))j++;
  out+=source.slice(i,j);i=j;
 }
 return out;
}
/** Line (1-based) on which a JSON path starts in prettyJson output, for
 * highlighting. Paths look like $.items[0].start or $["odd key"]. */
export function jsonPathLine(pretty:string,path:string):number|undefined{
 if(path==='$')return 1;
 const parts:(string|number)[]=[],frames:{array:boolean;index:number;named:boolean}[]=[];
 const render=(extra?:string|number)=>'$'+[...parts,...(extra===undefined?[]:[extra])].map(part=>typeof part==='number'?`[${part}]`:/^[A-Za-z_$][\w$-]*$/.test(part)?`.${part}`:`[${JSON.stringify(part)}]`).join('');
 const lines=pretty.split('\n');
 for(let n=0;n<lines.length;n++){
  const line=lines[n].trim().replace(/,$/,'');
  if(line==='}'||line===']'){const frame=frames.pop();if(frame?.named)parts.pop();continue;}
  const top=frames[frames.length-1];
  let part:string|number|undefined,rest=line;
  if(top&&!top.array){const key=/^("(?:[^"\\]|\\.)*")\s*:\s*([\s\S]*)$/.exec(line);if(!key)continue;try{part=JSON.parse(key[1]) as string;}catch{continue;}rest=key[2];}
  else if(top)part=top.index++;
  if(part!==undefined&&render(part)===path)return n+1;
  if(rest==='{'||rest==='['){frames.push({array:rest==='[',index:0,named:part!==undefined});if(part!==undefined)parts.push(part);}
 }
 return undefined;
}
