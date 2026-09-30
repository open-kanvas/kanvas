import { z } from 'zod';

export const topologyDataSchema=z.object({
  layout:z.enum(['connections','map']).default('connections'),
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
}).strict();
export type JsonData=z.input<typeof jsonDataSchema>;
