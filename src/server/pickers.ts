import {z} from 'zod';
import {readFile} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import type {Express,Request,Response} from 'express';
import type {KanvasService} from './domain.js';
import type {AuthPrincipal} from './auth.js';
import {AppError} from './store.js';
import type {Definition} from './mcp/canonical.js';
import {FONT_FAMILIES,FONT_LICENCES,ICONIFY_CORE_DUPLICATES,ICONIFY_LICENCES,ICONIFY_SET,ICON_SETS,ICON_SET_IDS,fontDisplayName,fontIdSchema,fontVariableRange,fontWeightSchema,iconId,iconNameSchema,iconUrl,iconVariantSchema,iconifyCollectionSchema,type IconSetId} from '../shared/pickers.js';

/** Kanvas-side source for picker assets. Viewers' browsers talk only to
 * Kanvas, so no third party sees their address.
 *
 * SSRF boundary: every outbound address is built here from a fixed HTTPS host,
 * an allowlisted package at a pinned version and path parts that passed a
 * strict pattern. Nothing a view, an agent or a browser supplies is used as a
 * host, a scheme, a port or a free path. Redirects are refused, responses are
 * size-capped and type-checked, SVG is sanitised, and the cache is bounded.
 * The proxy can be switched off; then only the pre-cache directory is served.
 *
 * The broader catalogue is an Iconify API the operator runs (KANVAS_ICONIFY_API).
 * Its address is installation configuration; requests to it are built from the
 * same validated parts and pass the same size, time, redirect and SVG checks.
 * Only collections whose declared licence is permissive are listed or served. */
export const PICKER_CDN='https://cdn.jsdelivr.net/npm/',PICKER_LISTING='https://data.jsdelivr.com/v1/packages/npm/';
const CDN=PICKER_CDN,LISTING=PICKER_LISTING;
/** Where each asset comes from and where it sits in the pre-cache directory. One
 * definition for the server and the pre-cache script, so both use the same allowlist. */
export const iconSource=(set:IconSetId,variant:string,name:string)=>{const definition=ICON_SETS[set],template=(definition.variants as Record<string,string>)[variant];if(!template)return undefined;const path=template.replace('{name}',name);return {url:`${CDN}${definition.package}@${definition.version}/${path}`,local:join('icons',set,path)};};
export const iconListingSource=(set:IconSetId)=>({url:`${LISTING}${ICON_SETS[set].package}@${ICON_SETS[set].version}?structure=flat`,local:join('icons',set,'index.json')});
export const lucideTagsSource=()=>({url:`${CDN}${ICON_SETS.lucide.package}@${ICON_SETS.lucide.version}/tags.json`,local:join('icons','lucide','tags.json')});
export const fontSource=(family:string,weight:number|'variable')=>{const scope=weight==='variable'?'@fontsource-variable':'@fontsource',file=weight==='variable'?`${family}-latin-wght-normal.woff2`:`${family}-latin-${weight}-normal.woff2`;return {url:`${CDN}${scope}/${family}@5/files/${file}`,local:join('fonts',family,file),licenceUrl:`${CDN}${scope}/${family}@5/package.json`,licenceLocal:join('fonts',family,'LICENCE.txt')};};
/** Reads a response body without ever holding more than maxBytes of it. A declared length above the limit is refused
 * before reading. The body is then read chunk by chunk and the stream is cancelled the moment the limit is passed, so
 * a chunked answer without a length, or one whose declared length is untrue, cannot make the server buffer more than
 * the limit plus one chunk. Undefined means "too large". */
export async function readCapped(response:globalThis.Response,maxBytes:number):Promise<Buffer|undefined>{
 const declared=Number(response.headers.get('content-length')??0);
 if(declared>maxBytes){await response.body?.cancel().catch(()=>{});return undefined;}
 if(!response.body)return Buffer.alloc(0);
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   total+=value.byteLength;
   if(total>maxBytes){await reader.cancel().catch(()=>{});return undefined;}
   chunks.push(value);
  }
 }catch(error){await reader.cancel().catch(()=>{});throw error;}
 return Buffer.concat(chunks,total);
}
export const isWoff2=(body:Buffer|undefined):body is Buffer=>Boolean(body&&body.length>=8&&body.subarray(0,4).toString('latin1')==='wOF2');
/** The operator's Iconify API base address, or undefined when it is unset or not a plain http(s) address. */
export function iconifyBase(value:string|undefined):string|undefined{
 if(!value?.trim())return undefined;
 try{const url=new URL(value.trim());if(!/^https?:$/.test(url.protocol)||url.username||url.password||url.search||url.hash)return undefined;return url.origin+url.pathname.replace(/\/+$/,'');}catch{return undefined;}
}
export const PICKER_ICONIFY_SEARCH=64,PICKER_ICONIFY_COLLECTIONS_MS=10*60_000;
interface IconifyCollection {title:string;licence:string;total:number}
export const PICKER_ICON_BYTES=64*1024,PICKER_FONT_BYTES=400*1024,PICKER_CACHE_BYTES=48*1024*1024,PICKER_TIMEOUT_MS=8000;
const identifier=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const iconsSearchSchema=z.strictObject({query:z.string().trim().min(1).max(60),sets:z.array(z.enum([...ICON_SET_IDS,ICONIFY_SET])).max(6).optional(),limit:z.number().int().min(1).max(24).default(12),sessionId:identifier.optional()});
export const fontsListSchema=z.strictObject({category:z.enum(['sans','serif','mono','display','handwriting']).optional(),family:fontIdSchema.optional()});
export const pickerTools: Definition[] = [
    {
        name: "kanvas.icons.search", summary: "Find icons by concept across supported open-source sets when selecting exact identifiers for visual content.", schema: iconsSearchSchema, readOnly: true, description: 'Find icons by concept in open-source sets (Lucide, Heroicons, Phosphor, Tabler, Material Symbols; iconify where configured). Returns exact ids and a ready icon-picker view.',
        domain: "template",
        requiredScope: "read",
        discovery: {"group":"guidance","hint":"Find icons by concept across open-source sets; returns exact set:name ids and a ready icon-picker view.","examples":[{"query":"settings","limit":8}]},
        searchAliases: ["kanvas.icons.search"]
    },
    {
        name: "kanvas.fonts.list", summary: "Browse curated open-licence fonts and weights when choosing typography or checking a known font family.", schema: fontsListSchema, readOnly: true, description: 'List curated open-licence font families with ids and weights for the font-picker template, or check one family id.',
        domain: "template",
        requiredScope: "read",
        discovery: {"group":"guidance","hint":"Curated open-licence font families with ids and weights for the font-picker template.","examples":[{"category":"serif"}]},
        searchAliases: ["kanvas.fonts.list"]
    },
];
interface Entry {body:Buffer;type:string;bytes:number}
export function sanitizeSvg(source:string):string|undefined{
 if(source.length>PICKER_ICON_BYTES||!/<svg[\s>]/i.test(source))return undefined;
 let svg=source.replace(/<!--[\s\S]*?-->/g,'').replace(/<\?[\s\S]*?\?>/g,'').replace(/<!DOCTYPE[\s\S]*?>/gi,'');
 // Icons are paths and shapes. Anything that can run, load or reference is refused outright.
 if(/<\s*(script|foreignObject|iframe|object|embed|image|use|a|style|link|animate|set|handler|audio|video)\b/i.test(svg))return undefined;
 if(/\son[a-z]+\s*=|(?:href|src)\s*=|url\s*\(|javascript:|data:|@import|<!ENTITY/i.test(svg))return undefined;
 svg=svg.trim();
 return svg.startsWith('<svg')&&svg.endsWith('</svg>')?svg:undefined;
}
export class Pickers{
 private cache=new Map<string,Entry>();
 private cacheBytes=0;
 private indexes=new Map<IconSetId,Promise<Map<string,Set<string>>>>();
 private tags?:Promise<Record<string,string[]>>;
 private licences=new Map<string,Promise<string|undefined>>();
 private catalogue?:{at:number;collections:Promise<Map<string,IconifyCollection>>};
 /** Base address of the operator's own Iconify API; the wider catalogue exists only when this is set. */
 readonly iconify=iconifyBase(process.env.KANVAS_ICONIFY_API);
 readonly proxy=process.env.KANVAS_PICKER_PROXY!=='false';
 readonly precache=process.env.KANVAS_PICKER_CACHE_DIR?resolve(process.env.KANVAS_PICKER_CACHE_DIR):undefined;
 /** Replaced in tests; the default only ever receives addresses built here. */
 fetcher:(url:string,signal:AbortSignal)=>Promise<globalThis.Response>=(url,signal)=>fetch(url,{redirect:'error',signal,headers:{Accept:'*/*'}});
 constructor(private service:KanvasService){}
 private remember(key:string,entry:Entry){
  const old=this.cache.get(key);if(old){this.cacheBytes-=old.bytes;this.cache.delete(key);}
  this.cache.set(key,entry);this.cacheBytes+=entry.bytes;
  while(this.cacheBytes>PICKER_CACHE_BYTES&&this.cache.size>1){const [first,value]=this.cache.entries().next().value!;this.cache.delete(first);this.cacheBytes-=value.bytes;}
 }
 private async local(relative:string):Promise<Buffer|undefined>{
  if(!this.precache)return undefined;
  const path=resolve(join(this.precache,relative));
  if(!path.startsWith(this.precache+sep))return undefined;
  try{return await readFile(path);}catch{return undefined;}
 }
 private async remote(url:string,maxBytes:number):Promise<Buffer|undefined>{
  if(!this.proxy)return undefined;
  if(!url.startsWith(CDN)&&!url.startsWith(LISTING))throw new Error('Picker source outside the allowlist.');
  return this.capped(url,maxBytes);
 }
 /** A request to the operator's Iconify API. The path is built by this class from validated parts. */
 private async catalogueRequest(path:string,maxBytes:number):Promise<Buffer|undefined>{
  if(!this.iconify||!path.startsWith('/'))return undefined;
  return this.capped(this.iconify+path,maxBytes);
 }
 private async capped(url:string,maxBytes:number):Promise<Buffer|undefined>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),PICKER_TIMEOUT_MS);
  try{
   const response=await this.fetcher(url,controller.signal);
   if(!response.ok||response.redirected){await response.body?.cancel();return undefined;}
   // The timer stays armed while the body is read: a slow body is cut off by the same deadline as a slow answer.
   return await readCapped(response,maxBytes);
  }catch{return undefined;}finally{clearTimeout(timer);}
 }
 /** Permissively licensed, single-colour collections of the operator's Iconify API. Refreshed every ten minutes; a failure is not remembered. */
 private collections():Promise<Map<string,IconifyCollection>>{
  if(!this.iconify)return Promise.reject(new Error('unavailable'));
  if(!this.catalogue||Date.now()-this.catalogue.at>PICKER_ICONIFY_COLLECTIONS_MS){
   const collections=(async()=>{
    const body=await this.catalogueRequest('/collections',4*1024*1024);if(!body)throw new Error('unavailable');
    const listed=JSON.parse(body.toString('utf8')) as Record<string,{name?:unknown;total?:unknown;palette?:unknown;license?:{spdx?:unknown}}>,allowed=new Map<string,IconifyCollection>();
    for(const [prefix,info] of Object.entries(listed)){
     const licence=typeof info?.license?.spdx==='string'?info.license.spdx:'';
     // Icons are painted as one-colour shapes, so multi-colour collections are left out with the restrictively licensed ones.
     if(!iconifyCollectionSchema.safeParse(prefix).success||ICONIFY_CORE_DUPLICATES.test(prefix)||info.palette===true||!(ICONIFY_LICENCES as readonly string[]).includes(licence))continue;
     allowed.set(prefix,{title:String(info.name??prefix).slice(0,80),licence,total:Number(info.total)||0});
    }
    return allowed;
   })();
   const entry={at:Date.now(),collections};this.catalogue=entry;
   collections.catch(()=>{if(this.catalogue===entry)this.catalogue=undefined;});
  }
  return this.catalogue.collections;
 }
 private async catalogueIcon(collection:string,name:string):Promise<Entry|undefined>{
  if(!this.iconify||!iconifyCollectionSchema.safeParse(collection).success||!iconNameSchema.safeParse(name).success)return undefined;
  const key=`icon:${ICONIFY_SET}:${collection}:${name}`,hit=this.cache.get(key);if(hit)return hit;
  let allowed:Map<string,IconifyCollection>;try{allowed=await this.collections();}catch{return undefined;}
  if(!allowed.has(collection))return undefined;
  const source=await this.catalogueRequest(`/${collection}/${name}.svg`,PICKER_ICON_BYTES),svg=source?sanitizeSvg(source.toString('utf8')):undefined;
  if(!svg)return undefined;
  const entry={body:Buffer.from(svg),type:'image/svg+xml; charset=utf-8',bytes:svg.length};this.remember(key,entry);return entry;
 }
 async icon(set:string,variant:string,name:string):Promise<Entry|undefined>{
  // For the catalogue the middle part of the address is the collection prefix.
  if(set===ICONIFY_SET)return this.catalogueIcon(variant,name);
  if(!Object.hasOwn(ICON_SETS,set)||!iconVariantSchema.safeParse(variant).success||!iconNameSchema.safeParse(name).success)return undefined;
  const from=iconSource(set as IconSetId,variant,name);
  if(!from)return undefined;
  const key=`icon:${set}:${variant}:${name}`,hit=this.cache.get(key);if(hit)return hit;
  const source=await this.local(from.local)??await this.remote(from.url,PICKER_ICON_BYTES);
  const svg=source?sanitizeSvg(source.toString('utf8')):undefined;
  if(!svg)return undefined;
  const entry={body:Buffer.from(svg),type:'image/svg+xml; charset=utf-8',bytes:svg.length};this.remember(key,entry);return entry;
 }
 /** A family is served only when its package declares an open licence. */
 async fontLicence(family:string,variable=false):Promise<string|undefined>{
  if(!fontIdSchema.safeParse(family).success)return undefined;
  const key=variable?`${family}:variable`:family,from=fontSource(family,variable?'variable':400);
  if(!this.licences.has(key))this.licences.set(key,(async()=>{
   const local=await this.local(from.licenceLocal);if(local){const value=local.toString('utf8').trim().slice(0,40);return (FONT_LICENCES as readonly string[]).includes(value)?value:undefined;}
   const body=await this.remote(from.licenceUrl,64*1024);if(!body)return undefined;
   try{const licence=String(JSON.parse(body.toString('utf8')).license??'');return (FONT_LICENCES as readonly string[]).includes(licence)?licence:undefined;}catch{return undefined;}
  })());
  if(this.licences.size>400)this.licences.delete(this.licences.keys().next().value!);
  const licence=await this.licences.get(key);
  if(!licence)this.licences.delete(key);
  return licence;
 }
 async font(family:string,weight:number|'variable'):Promise<Entry|undefined>{
  if(!fontIdSchema.safeParse(family).success)return undefined;
  // The variable file exists only for curated families known to publish one; any other request names one static weight.
  if(weight==='variable'?!fontVariableRange(family):!fontWeightSchema.safeParse(weight).success)return undefined;
  const key=`font:${family}:${weight}`,hit=this.cache.get(key);if(hit)return hit;
  if(!await this.fontLicence(family,weight==='variable'))return undefined;
  const from=fontSource(family,weight);
  const body=await this.local(from.local)??await this.remote(from.url,PICKER_FONT_BYTES);
  // WOFF2 signature: the file is what it claims to be, not an error page.
  if(!isWoff2(body))return undefined;
  const entry={body,type:'font/woff2',bytes:body.length};this.remember(key,entry);return entry;
 }
 private index(set:IconSetId):Promise<Map<string,Set<string>>>{
  if(!this.indexes.has(set))this.indexes.set(set,(async()=>{
   const definition=ICON_SETS[set],names=new Map<string,Set<string>>();
   const from=iconListingSource(set),local=await this.local(from.local);
   const body=local??await this.remote(from.url,6*1024*1024);
   if(!body)throw new Error('unavailable');
   const files:string[]=local?JSON.parse(body.toString('utf8')):(JSON.parse(body.toString('utf8')).files as {name:string}[]).map(file=>file.name.replace(/^\//,''));
   for(const [variant,template] of Object.entries(definition.variants)){
    const [prefix,suffix]=template.split('{name}');
    for(const file of files)if(file.startsWith(prefix)&&file.endsWith(suffix)){const name=file.slice(prefix.length,file.length-suffix.length);if(!name.includes('/')&&iconNameSchema.safeParse(name).success&&!(variant==='outlined'||variant==='rounded'||variant==='sharp'?name.endsWith('-fill'):false)&&!(set==='phosphor'&&variant==='regular'&&/-(thin|light|bold|fill|duotone)$/.test(name)))names.set(name,(names.get(name)??new Set()).add(variant));}
   }
   return names;
  })().catch(error=>{this.indexes.delete(set);throw error;}));
  return this.indexes.get(set)!;
 }
 private lucideTags():Promise<Record<string,string[]>>{
  return this.tags??=(async()=>{const from=lucideTagsSource(),body=await this.local(from.local)??await this.remote(from.url,2*1024*1024);try{return body?JSON.parse(body.toString('utf8')) as Record<string,string[]>:{};}catch{return {};}})();
 }
 /** Catalogue hits for a query, in the order the Iconify API ranks them. Only allowed collections pass. */
 private async catalogueSearch(query:string,only:readonly string[]|undefined):Promise<{collection:string;name:string;info:IconifyCollection}[]>{
  const allowed=await this.collections(),prefixes=only?.filter(prefix=>allowed.has(prefix));
  if(only&&!prefixes!.length)return [];
  const body=await this.catalogueRequest(`/search?query=${encodeURIComponent(query)}&limit=${PICKER_ICONIFY_SEARCH}${prefixes?`&prefixes=${prefixes.join(',')}`:''}`,512*1024);
  if(!body)throw new Error('unavailable');
  const listed=(JSON.parse(body.toString('utf8')) as {icons?:unknown}).icons,hits:{collection:string;name:string;info:IconifyCollection}[]=[];
  for(const value of Array.isArray(listed)?listed.slice(0,PICKER_ICONIFY_SEARCH):[]){
   const [collection,name,...rest]=String(value).split(':'),info=allowed.get(collection);
   if(info&&!rest.length&&iconNameSchema.safeParse(name).success&&(!prefixes||prefixes.includes(collection)))hits.push({collection,name,info});
  }
  return hits;
 }
 async searchIcons(p:AuthPrincipal,raw:unknown){
  const a=iconsSearchSchema.parse(raw);await this.service.fullAccount(p);
  // "mdi: settings" or "mdi,carbon: arrow left" asks the catalogue for those collections only. With no sets named,
  // every core set is searched and the catalogue too where one is configured.
  const scoped=/^([a-z0-9-]+(?:,[a-z0-9-]+){0,9}):\s*(\S.*)$/.exec(a.query.toLowerCase()),only=scoped?.[1].split(','),query=scoped?scoped[2]:a.query;
  const requested=only?[ICONIFY_SET]:a.sets?.length?[...new Set(a.sets)]:[...ICON_SET_IDS,...(this.iconify?[ICONIFY_SET]:[])];
  const sets=requested.filter((set):set is IconSetId=>set!==ICONIFY_SET),wide=requested.includes(ICONIFY_SET);
  const words=query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const tags=sets.includes('lucide')?await this.lucideTags():{};
  const found:{set:IconSetId|typeof ICONIFY_SET;collection?:string;name:string;variants:string[];licence:string;score:number}[]=[],unavailable:string[]=[],reasons:string[]=[];
  for(const set of sets){
   let names:Map<string,Set<string>>;
   try{names=await this.index(set);}catch{unavailable.push(set);continue;}
   for(const [name,variants] of names){
    const parts=name.split(/[-_]/),related=set==='lucide'?(tags[name]??[]).join(' ').toLowerCase():'';
    let score=0;
    for(const word of words){if(parts.includes(word))score+=10;else if(name.includes(word))score+=5;else if(related.includes(word))score+=3;else{score=0;break;}}
    if(score>0)found.push({set,name,variants:[...variants],licence:ICON_SETS[set].licence,score:score-name.length/100});
   }
  }
  if(unavailable.length)reasons.push(this.proxy?'The core sets named could not be listed right now.':'The picker proxy is disabled on this installation and these sets are not pre-cached.');
  const collections=new Map<string,IconifyCollection>();
  if(wide){
   if(!this.iconify){unavailable.push(ICONIFY_SET);reasons.push('No Iconify API is configured on this installation, so the wider catalogue is not available.');}
   else try{(await this.catalogueSearch(query,only)).forEach((hit,index)=>{collections.set(hit.collection,hit.info);found.push({set:ICONIFY_SET,collection:hit.collection,name:`${hit.collection}:${hit.name}`,variants:[],licence:hit.info.licence,score:1000-index});});}
   catch{unavailable.push(ICONIFY_SET);reasons.push('The Iconify catalogue could not be reached right now.');}
  }
  // Interleave sets so one large set does not crowd out the others.
  const perSet=new Map<string,typeof found>();for(const item of found.sort((x,y)=>y.score-x.score))perSet.set(item.set,[...(perSet.get(item.set)??[]),item]);
  const ordered:typeof found=[];for(let round=0;ordered.length<a.limit&&[...perSet.values()].some(list=>list.length>round);round++)for(const list of perSet.values())if(list[round]&&ordered.length<a.limit)ordered.push(list[round]);
  const icons=ordered.map(item=>({id:iconId(item),set:item.set,...(item.collection?{collection:item.collection,collectionTitle:collections.get(item.collection)!.title}:{}),name:item.name,variants:item.variants,licence:item.licence,image:iconUrl(item)}));
  return {query:a.query,icons,total:found.length,...(unavailable.length?{unavailableSets:unavailable,unavailableReason:reasons.join(' ')}:{}),
   sets:Object.fromEntries([...sets.map(set=>[set,{title:ICON_SETS[set].title,licence:ICON_SETS[set].licence,variants:Object.keys(ICON_SETS[set].variants)}] as const),
    ...(wide&&this.iconify&&!unavailable.includes(ICONIFY_SET)?[[ICONIFY_SET,{title:'Iconify catalogue',licences:'Permissive only: '+ICONIFY_LICENCES.join(', ')+'. Single-colour collections.',collections:Object.fromEntries([...collections].map(([prefix,info])=>[prefix,{title:info.title,licence:info.licence}]))}] as const]:[])]),
   ...(icons.length?{view:{version:1,template:'icon-picker',data:{mode:'candidates',concept:a.query,icons:icons.map(icon=>({set:icon.set,name:icon.name}))}}}:{}),
   next:'Publish view so the person can pick by number. Use the id as the exact name in code: set:name for a core set, collection:name for the iconify catalogue. Narrow the catalogue in the query: "mdi: settings".'};
 }
 async listFonts(p:AuthPrincipal,raw:unknown){
  const a=fontsListSchema.parse(raw);await this.service.fullAccount(p);
  const variable=(family:string)=>{const range=fontVariableRange(family);return range?{variable:true,weightRange:range}:{variable:false};};
  if(a.family){const curated=Object.hasOwn(FONT_FAMILIES,a.family),licence=await this.fontLicence(a.family,Boolean(fontVariableRange(a.family)));return {family:a.family,name:fontDisplayName(a.family),curated,available:Boolean(licence),...(licence?{licence}:{reason:this.proxy?'No open-licence package was found for this family id.':'The picker proxy is disabled and this family is not pre-cached.'}),...(curated?{weights:FONT_FAMILIES[a.family].weights,...variable(a.family)}:{})};}
  const families=Object.entries(FONT_FAMILIES).filter(([,font])=>!a.category||font.category===a.category).map(([id,font])=>({id,name:font.name,category:font.category,weights:font.weights,...variable(id)}));
  return {families,total:families.length,proxy:this.proxy,subset:'Latin, including Nordic letters',variableFonts:'A family marked variable is one font file covering its whole weightRange; the others are published as static weights only.',licences:'Each family is OFL-1.1 or Apache-2.0; the server checks the licence before serving any family.',other:'Any other open-licence family id from the same source can be named (lower case with hyphens); check it with family.',
   view:{version:1,template:'font-picker',data:{mode:'samples',text:'The quick brown fox jumps over the lazy dog',fonts:families.slice(0,6).map(font=>({family:font.id,weight:400}))}}};
 }
 mount(app:Express,browser:(req:Request)=>Promise<AuthPrincipal>,limit:(key:string)=>void){
  const send=(res:Response,entry:Entry|undefined)=>{
   if(!entry){res.status(404).set('Cache-Control','no-store').json({error:{code:'NOT_FOUND',message:'This picker asset is unavailable.'}});return;}
   res.status(200).set({'Content-Type':entry.type,'Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox",'Cross-Origin-Resource-Policy':'same-origin'}).send(entry.body);
  };
  // Signed-in browsers only: this is a picker for people using Kanvas, not an open proxy.
  app.get('/api/picker/icons/:set/:variant/:file',async(req,res)=>{const p=await browser(req);limit(`picker:${p.browserId??p.userId}`);const file=String(req.params.file);send(res,file.endsWith('.svg')?await this.icon(String(req.params.set),String(req.params.variant),file.slice(0,-4)):undefined);});
  app.get('/api/picker/fonts/:family/:file',async(req,res)=>{const p=await browser(req);limit(`picker:${p.browserId??p.userId}`);const file=String(req.params.file),match=/^([1-9]00)\.woff2$/.exec(file);send(res,file==='variable.woff2'?await this.font(String(req.params.family),'variable'):match?await this.font(String(req.params.family),Number(match[1])):undefined);});
 }
}
export {AppError as PickerError};
