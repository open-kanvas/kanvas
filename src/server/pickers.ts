import {z} from 'zod';
import {readFile} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import type {Express,Request,Response} from 'express';
import type {KanvasService} from './domain.js';
import type {AuthPrincipal} from './auth.js';
import {AppError} from './store.js';
import type {Definition} from './mcp/canonical.js';
import {FONT_FAMILIES,FONT_LICENCES,ICON_SETS,ICON_SET_IDS,fontDisplayName,fontIdSchema,fontWeightSchema,iconId,iconNameSchema,iconUrl,iconVariantSchema,type IconSetId} from '../shared/pickers.js';

/** Kanvas-side source for picker assets. Viewers' browsers talk only to
 * Kanvas, so no third party sees their address.
 *
 * SSRF boundary: every outbound address is built here from a fixed HTTPS host,
 * an allowlisted package at a pinned version and path parts that passed a
 * strict pattern. Nothing a view, an agent or a browser supplies is used as a
 * host, a scheme, a port or a free path. Redirects are refused, responses are
 * size-capped and type-checked, SVG is sanitised, and the cache is bounded.
 * The proxy can be switched off; then only the pre-cache directory is served. */
const CDN='https://cdn.jsdelivr.net/npm/',LISTING='https://data.jsdelivr.com/v1/packages/npm/';
export const PICKER_ICON_BYTES=64*1024,PICKER_FONT_BYTES=400*1024,PICKER_CACHE_BYTES=48*1024*1024,PICKER_TIMEOUT_MS=8000;
const identifier=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const iconsSearchSchema=z.strictObject({query:z.string().trim().min(1).max(60).describe('A concept or part of an icon name, e.g. settings, arrow left, user.'),sets:z.array(z.enum(ICON_SET_IDS)).max(5).optional(),limit:z.number().int().min(1).max(24).default(12),sessionId:identifier.optional()});
export const fontsListSchema=z.strictObject({category:z.enum(['sans','serif','mono','display','handwriting']).optional(),family:fontIdSchema.optional().describe('Check one family id (curated or not) and its licence.')});
export const pickerTools:Definition[]=[
 {name:'kanvas_icons_search',schema:iconsSearchSchema,readOnly:true,description:'Find icons by concept across open-source sets (Lucide, Heroicons, Phosphor, Tabler, Material Symbols). Returns exact set:name ids to use in code and a ready icon-picker view to show the candidates. Kanvas serves the images itself; no URL is accepted.'},
 {name:'kanvas_fonts_list',schema:fontsListSchema,readOnly:true,description:'List the curated open-licence font families with their ids, categories and weights, or check one family id and its licence. Use the ids in a font-picker view; Kanvas serves the font files itself.'},
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
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),PICKER_TIMEOUT_MS);
  try{
   const response=await this.fetcher(url,controller.signal);
   if(!response.ok||response.redirected){await response.body?.cancel();return undefined;}
   const declared=Number(response.headers.get('content-length')??0);
   if(declared>maxBytes){await response.body?.cancel();return undefined;}
   const body=Buffer.from(await response.arrayBuffer());
   return body.length<=maxBytes?body:undefined;
  }catch{return undefined;}finally{clearTimeout(timer);}
 }
 async icon(set:string,variant:string,name:string):Promise<Entry|undefined>{
  if(!Object.hasOwn(ICON_SETS,set)||!iconVariantSchema.safeParse(variant).success||!iconNameSchema.safeParse(name).success)return undefined;
  const definition=ICON_SETS[set as IconSetId],template=(definition.variants as Record<string,string>)[variant];
  if(!template)return undefined;
  const key=`icon:${set}:${variant}:${name}`,hit=this.cache.get(key);if(hit)return hit;
  const path=template.replace('{name}',name);
  const source=await this.local(join('icons',set,path))??await this.remote(`${CDN}${definition.package}@${definition.version}/${path}`,PICKER_ICON_BYTES);
  const svg=source?sanitizeSvg(source.toString('utf8')):undefined;
  if(!svg)return undefined;
  const entry={body:Buffer.from(svg),type:'image/svg+xml; charset=utf-8',bytes:svg.length};this.remember(key,entry);return entry;
 }
 /** A family is served only when its package declares an open licence. */
 async fontLicence(family:string):Promise<string|undefined>{
  if(!fontIdSchema.safeParse(family).success)return undefined;
  if(!this.licences.has(family))this.licences.set(family,(async()=>{
   const local=await this.local(join('fonts',family,'LICENCE.txt'));if(local){const value=local.toString('utf8').trim().slice(0,40);return (FONT_LICENCES as readonly string[]).includes(value)?value:undefined;}
   const body=await this.remote(`${CDN}@fontsource/${family}@5/package.json`,64*1024);if(!body)return undefined;
   try{const licence=String(JSON.parse(body.toString('utf8')).license??'');return (FONT_LICENCES as readonly string[]).includes(licence)?licence:undefined;}catch{return undefined;}
  })());
  if(this.licences.size>400)this.licences.delete(this.licences.keys().next().value!);
  const licence=await this.licences.get(family);
  if(!licence)this.licences.delete(family);
  return licence;
 }
 async font(family:string,weight:number):Promise<Entry|undefined>{
  if(!fontIdSchema.safeParse(family).success||!fontWeightSchema.safeParse(weight).success)return undefined;
  const key=`font:${family}:${weight}`,hit=this.cache.get(key);if(hit)return hit;
  if(!await this.fontLicence(family))return undefined;
  const file=`${family}-latin-${weight}-normal.woff2`;
  const body=await this.local(join('fonts',family,file))??await this.remote(`${CDN}@fontsource/${family}@5/files/${file}`,PICKER_FONT_BYTES);
  // WOFF2 signature: the file is what it claims to be, not an error page.
  if(!body||body.length<8||body.subarray(0,4).toString('latin1')!=='wOF2')return undefined;
  const entry={body,type:'font/woff2',bytes:body.length};this.remember(key,entry);return entry;
 }
 private index(set:IconSetId):Promise<Map<string,Set<string>>>{
  if(!this.indexes.has(set))this.indexes.set(set,(async()=>{
   const definition=ICON_SETS[set],names=new Map<string,Set<string>>();
   const local=await this.local(join('icons',set,'index.json'));
   const body=local??await this.remote(`${LISTING}${definition.package}@${definition.version}?structure=flat`,6*1024*1024);
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
  return this.tags??=(async()=>{const body=await this.local(join('icons','lucide','tags.json'))??await this.remote(`${CDN}${ICON_SETS.lucide.package}@${ICON_SETS.lucide.version}/tags.json`,2*1024*1024);try{return body?JSON.parse(body.toString('utf8')) as Record<string,string[]>:{};}catch{return {};}})();
 }
 async searchIcons(p:AuthPrincipal,raw:unknown){
  const a=iconsSearchSchema.parse(raw);await this.service.fullAccount(p);
  const words=a.query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),sets=a.sets?.length?a.sets:[...ICON_SET_IDS];
  const tags=sets.includes('lucide')?await this.lucideTags():{};
  const found:{set:IconSetId;name:string;variants:string[];score:number}[]=[],unavailable:string[]=[];
  for(const set of sets){
   let names:Map<string,Set<string>>;
   try{names=await this.index(set);}catch{unavailable.push(set);continue;}
   for(const [name,variants] of names){
    const parts=name.split(/[-_]/),related=set==='lucide'?(tags[name]??[]).join(' ').toLowerCase():'';
    let score=0;
    for(const word of words){if(parts.includes(word))score+=10;else if(name.includes(word))score+=5;else if(related.includes(word))score+=3;else{score=0;break;}}
    if(score>0)found.push({set,name,variants:[...variants],score:score-name.length/100});
   }
  }
  // Interleave sets so one large set does not crowd out the others.
  const perSet=new Map<IconSetId,typeof found>();for(const item of found.sort((x,y)=>y.score-x.score))perSet.set(item.set,[...(perSet.get(item.set)??[]),item]);
  const ordered:typeof found=[];for(let round=0;ordered.length<a.limit&&[...perSet.values()].some(list=>list.length>round);round++)for(const list of perSet.values())if(list[round]&&ordered.length<a.limit)ordered.push(list[round]);
  const icons=ordered.map(item=>({id:iconId(item),set:item.set,name:item.name,variants:item.variants,licence:ICON_SETS[item.set].licence,image:iconUrl(item)}));
  return {query:a.query,icons,total:found.length,...(unavailable.length?{unavailableSets:unavailable,unavailableReason:this.proxy?'These sets could not be listed right now.':'The picker proxy is disabled on this installation and these sets are not pre-cached.'}:{}),
   sets:Object.fromEntries(sets.map(set=>[set,{title:ICON_SETS[set].title,licence:ICON_SETS[set].licence,variants:Object.keys(ICON_SETS[set].variants)}])),
   ...(icons.length?{view:{version:1,template:'icon-picker',data:{mode:'candidates',concept:a.query,icons:icons.map(icon=>({set:icon.set,name:icon.name}))}}}:{}),
   next:'Publish view so the person can pick by number. Use the id (set:name) as the exact name in code.'};
 }
 async listFonts(p:AuthPrincipal,raw:unknown){
  const a=fontsListSchema.parse(raw);await this.service.fullAccount(p);
  if(a.family){const curated=Object.hasOwn(FONT_FAMILIES,a.family),licence=await this.fontLicence(a.family);return {family:a.family,name:fontDisplayName(a.family),curated,available:Boolean(licence),...(licence?{licence}:{reason:this.proxy?'No open-licence package was found for this family id.':'The picker proxy is disabled and this family is not pre-cached.'}),...(curated?{weights:FONT_FAMILIES[a.family as keyof typeof FONT_FAMILIES].weights}:{})};}
  const families=Object.entries(FONT_FAMILIES).filter(([,font])=>!a.category||font.category===a.category).map(([id,font])=>({id,name:font.name,category:font.category,weights:font.weights}));
  return {families,total:families.length,proxy:this.proxy,subset:'Latin, including Nordic letters',licences:'Each family is OFL-1.1 or Apache-2.0; the server checks the licence before serving any family.',other:'Any other open-licence family id from the same source can be named (lower case with hyphens); check it with family.',
   view:{version:1,template:'font-picker',data:{mode:'samples',text:'The quick brown fox jumps over the lazy dog',fonts:families.slice(0,6).map(font=>({family:font.id,weight:400}))}}};
 }
 mount(app:Express,browser:(req:Request)=>Promise<AuthPrincipal>,limit:(key:string)=>void){
  const send=(res:Response,entry:Entry|undefined)=>{
   if(!entry){res.status(404).set('Cache-Control','no-store').json({error:{code:'NOT_FOUND',message:'This picker asset is unavailable.'}});return;}
   res.status(200).set({'Content-Type':entry.type,'Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox",'Cross-Origin-Resource-Policy':'same-origin'}).send(entry.body);
  };
  // Signed-in browsers only: this is a picker for people using Kanvas, not an open proxy.
  app.get('/api/picker/icons/:set/:variant/:file',async(req,res)=>{const p=await browser(req);limit(`picker:${p.browserId??p.userId}`);const file=String(req.params.file);send(res,file.endsWith('.svg')?await this.icon(String(req.params.set),String(req.params.variant),file.slice(0,-4)):undefined);});
  app.get('/api/picker/fonts/:family/:file',async(req,res)=>{const p=await browser(req);limit(`picker:${p.browserId??p.userId}`);const match=/^([1-9]00)\.woff2$/.exec(String(req.params.file));send(res,match?await this.font(String(req.params.family),Number(match[1])):undefined);});
 }
}
export {AppError as PickerError};
