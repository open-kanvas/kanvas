/** Fills the picker pre-cache directory (KANVAS_PICKER_CACHE_DIR).
 *
 * An installation that sets KANVAS_PICKER_PROXY=false makes no outbound
 * requests; its icon and font pickers then serve only what is in this
 * directory. Run this once on a machine that may reach the package CDN and
 * copy the directory, or run it on the server before switching the proxy off.
 *
 *   node dist/server/picker-precache.js <directory> [--icons=lucide,heroicons|all] [--variants=all] [--no-fonts] [--concurrency=8]
 *
 * Fonts: every curated family (one variable file where the family publishes
 * one, otherwise each static weight) with its licence. Icons: only the sets
 * named; by default each set's default style, with --variants=all every style.
 * The same allowlist, pinned versions, size limits, SVG sanitiser, font
 * signature and licence check as the running server apply; nothing else is
 * written. */
import {mkdir,rename,writeFile} from 'node:fs/promises';
import {dirname,join,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FONT_FAMILIES,FONT_LICENCES,ICON_SETS,ICON_SET_IDS,iconNameSchema,type IconSetId} from '../src/shared/pickers.js';
import {PICKER_FONT_BYTES,PICKER_ICON_BYTES,PICKER_CDN,PICKER_LISTING,fontSource,iconListingSource,iconSource,isWoff2,lucideTagsSource,sanitizeSvg} from '../src/server/pickers.js';

export interface PrecacheOptions {
 directory:string;
 icons?:readonly IconSetId[];
 allVariants?:boolean;
 fonts?:boolean;
 concurrency?:number;
 fetcher?:(url:string,signal:AbortSignal)=>Promise<Response>;
 log?:(line:string)=>void;
}
export interface PrecacheReport {directory:string;fonts:{families:number;files:number;bytes:number;skipped:string[]};icons:Record<string,{files:number;bytes:number;skipped:number}>}

export async function precachePickers(options:PrecacheOptions):Promise<PrecacheReport>{
 const directory=resolve(options.directory),log=options.log??(()=>{}),concurrency=Math.min(16,Math.max(1,options.concurrency??8));
 const fetcher=options.fetcher??((url:string,signal:AbortSignal)=>fetch(url,{redirect:'error',signal,headers:{Accept:'*/*'}}));
 const get=async(url:string,maxBytes:number):Promise<Buffer|undefined>=>{
  if(!url.startsWith(PICKER_CDN)&&!url.startsWith(PICKER_LISTING))throw new Error('Picker source outside the allowlist.');
  for(let attempt=0;attempt<3;attempt++){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20_000);
   try{
    const response=await fetcher(url,controller.signal);
    if(response.status===404){await response.body?.cancel();return undefined;}
    if(response.ok&&!response.redirected){const body=Buffer.from(await response.arrayBuffer());return body.length<=maxBytes?body:undefined;}
    await response.body?.cancel();
   }catch{/* retried below */}finally{clearTimeout(timer);}
   await new Promise(done=>setTimeout(done,300*2**attempt));
  }
  return undefined;
 };
 const put=async(relative:string,body:Buffer|string)=>{
  const path=resolve(join(directory,relative));if(!path.startsWith(directory+sep))throw new Error('Path outside the pre-cache directory.');
  await mkdir(dirname(path),{recursive:true});await writeFile(path+'.part',body);await rename(path+'.part',path);
 };
 const pool=async<T>(items:readonly T[],work:(item:T)=>Promise<void>)=>{let next=0;await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{while(next<items.length)await work(items[next++]);}));};
 const report:PrecacheReport={directory,fonts:{families:0,files:0,bytes:0,skipped:[]},icons:{}};
 if(options.fonts!==false){
  await pool(Object.entries(FONT_FAMILIES),async([family,font])=>{
   const weights:(number|'variable')[]=font.variable?['variable']:[...font.weights],first=fontSource(family,weights[0]);
   const manifest=await get(first.licenceUrl,64*1024);let licence='';
   try{licence=String(JSON.parse(manifest?.toString('utf8')??'{}').license??'');}catch{/* refused below */}
   if(!(FONT_LICENCES as readonly string[]).includes(licence)){report.fonts.skipped.push(`${family}: no open licence declared`);return;}
   let stored=0;
   for(const weight of weights){
    const from=fontSource(family,weight),body=await get(from.url,PICKER_FONT_BYTES);
    if(!isWoff2(body)){report.fonts.skipped.push(`${family} ${weight}: not available as a WOFF2 file`);continue;}
    await put(from.local,body);stored++;report.fonts.files++;report.fonts.bytes+=body.length;
   }
   if(stored){await put(first.licenceLocal,licence+'\n');report.fonts.families++;log(`font ${family}: ${stored} file${stored===1?'':'s'} (${licence})`);}
  });
 }
 for(const set of options.icons??[]){
  const definition=ICON_SETS[set],listing=await get(iconListingSource(set).url,6*1024*1024),result={files:0,bytes:0,skipped:0};report.icons[set]=result;
  if(!listing){log(`icons ${set}: the file listing is unavailable; nothing stored`);continue;}
  const files=(JSON.parse(listing.toString('utf8')).files as {name:string}[]).map(file=>file.name.replace(/^\//,'')),wanted:{variant:string;name:string}[]=[];
  const variants=options.allVariants?Object.keys(definition.variants):[definition.defaultVariant];
  for(const variant of variants){
   const [prefix,suffix]=(definition.variants as Record<string,string>)[variant].split('{name}');
   for(const file of files)if(file.startsWith(prefix)&&file.endsWith(suffix)){const name=file.slice(prefix.length,file.length-suffix.length);if(!name.includes('/')&&iconNameSchema.safeParse(name).success)wanted.push({variant,name});}
  }
  const stored:string[]=[];
  await pool(wanted,async({variant,name})=>{
   const from=iconSource(set,variant,name)!,body=await get(from.url,PICKER_ICON_BYTES),svg=body?sanitizeSvg(body.toString('utf8')):undefined;
   if(!svg){result.skipped++;return;}
   await put(from.local,svg);stored.push(from.local.slice(join('icons',set).length+1));result.files++;result.bytes+=svg.length;
  });
  // The index lists only what was stored, so an offline search never offers an icon it cannot draw.
  await put(iconListingSource(set).local,JSON.stringify(stored.sort()));
  if(set==='lucide'){const tags=await get(lucideTagsSource().url,2*1024*1024);if(tags)try{JSON.parse(tags.toString('utf8'));await put(lucideTagsSource().local,tags);}catch{/* optional */}}
  log(`icons ${set}: ${result.files} stored, ${result.skipped} skipped`);
 }
 return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),directory=args.find(arg=>!arg.startsWith('--')),flag=(name:string)=>args.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
 const named=flag('icons'),icons=named==='all'?[...ICON_SET_IDS]:(named??'').split(',').filter(Boolean);
 const unknown=icons.filter(set=>!(ICON_SET_IDS as readonly string[]).includes(set));
 if(!directory||unknown.length){console.error(unknown.length?`Unknown icon set: ${unknown.join(', ')}. Sets: ${ICON_SET_IDS.join(', ')}.`:'Usage: picker-precache <directory> [--icons=lucide,heroicons|all] [--variants=all] [--no-fonts] [--concurrency=8]');process.exit(2);}
 const report=await precachePickers({directory,icons:icons as IconSetId[],allVariants:flag('variants')==='all',fonts:!args.includes('--no-fonts'),concurrency:Number(flag('concurrency'))||undefined,log:line=>console.log(line)});
 console.log(JSON.stringify(report,null,2));
}
