import {z} from 'zod';
/** Icon and font pickers. The agent shows labelled options, the person picks
 * by voice, the agent uses the exact name. Assets come only from the Kanvas
 * server, which serves an allowlist of permissively licensed open-source
 * packages at pinned versions. A view can name a set and an icon; it can never
 * name a URL. */
export const ICON_SETS={
 lucide:{title:'Lucide',package:'lucide-static',version:'1.70.0',licence:'ISC',variants:{outline:'icons/{name}.svg'},defaultVariant:'outline'},
 heroicons:{title:'Heroicons',package:'heroicons',version:'2.2.0',licence:'MIT',variants:{outline:'24/outline/{name}.svg',solid:'24/solid/{name}.svg',mini:'20/solid/{name}.svg',micro:'16/solid/{name}.svg'},defaultVariant:'outline'},
 phosphor:{title:'Phosphor',package:'@phosphor-icons/core',version:'2.1.1',licence:'MIT',variants:{regular:'assets/regular/{name}.svg',thin:'assets/thin/{name}-thin.svg',light:'assets/light/{name}-light.svg',bold:'assets/bold/{name}-bold.svg',fill:'assets/fill/{name}-fill.svg',duotone:'assets/duotone/{name}-duotone.svg'},defaultVariant:'regular'},
 tabler:{title:'Tabler',package:'@tabler/icons',version:'3.51.0',licence:'MIT',variants:{outline:'icons/outline/{name}.svg',filled:'icons/filled/{name}.svg'},defaultVariant:'outline'},
 material:{title:'Material Symbols',package:'@material-symbols/svg-400',version:'0.48.3',licence:'Apache-2.0',variants:{outlined:'outlined/{name}.svg',rounded:'rounded/{name}.svg',sharp:'sharp/{name}.svg','outlined-fill':'outlined/{name}-fill.svg','rounded-fill':'rounded/{name}-fill.svg','sharp-fill':'sharp/{name}-fill.svg'},defaultVariant:'outlined'},
} as const;
export type IconSetId=keyof typeof ICON_SETS;
export const ICON_SET_IDS=Object.keys(ICON_SETS) as [IconSetId,...IconSetId[]];
export const iconNameSchema=z.string().regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/).max(64);
export const iconVariantSchema=z.string().regex(/^[a-z]+(?:-[a-z]+)?$/).max(24);
/** The broader catalogue: any permissively licensed, single-colour collection
 * of an Iconify API the operator runs. A reference names a collection prefix
 * and an icon; the server address is configuration, never part of a view. */
export const ICONIFY_SET='iconify';
export const iconifyCollectionSchema=z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(40);
/** Licences a catalogue collection may carry. Attribution-required (CC-BY),
 * copyleft and non-commercial collections are never served. */
export const ICONIFY_LICENCES=['MIT','ISC','Apache-2.0','CC0-1.0','Unlicense','BSD-2-Clause','BSD-3-Clause','0BSD','MIT-0'] as const;
/** Collections that repeat a core set under another name. */
export const ICONIFY_CORE_DUPLICATES=/^(lucide|lucide-lab|heroicons|heroicons-outline|heroicons-solid|ph|tabler|material-symbols|material-symbols-light)$/;
/** In a view a catalogue icon is written the way Iconify writes it: {"set":"iconify","name":"mdi:cog-outline"}. */
export const iconRefNameSchema=z.string().regex(/^[a-z0-9]+(?:[-_:][a-z0-9]+)*$/).max(99);
/** Collection prefix and icon name of a catalogue icon, or undefined when the name is not exactly prefix:name. */
export const iconifyParts=(name:string):[string,string]|undefined=>{const parts=name.split(':');return parts.length===2&&iconifyCollectionSchema.safeParse(parts[0]).success&&iconNameSchema.safeParse(parts[1]).success?[parts[0],parts[1]]:undefined;};
export const iconRefSchema=z.object({set:z.enum([...ICON_SET_IDS,ICONIFY_SET]),name:iconRefNameSchema,variant:iconVariantSchema.optional()}).strict().superRefine((icon,ctx)=>{
 if(icon.set===ICONIFY_SET){
  if(!iconifyParts(icon.name))ctx.addIssue({code:'custom',path:['name'],message:'An iconify icon is named collection:icon, e.g. {"set":"iconify","name":"mdi:cog-outline"}.'});
  if(icon.variant)ctx.addIssue({code:'custom',path:['variant'],message:'Catalogue icons have no variants; a style is part of the icon name or the collection.'});
 }else if(!iconNameSchema.safeParse(icon.name).success)ctx.addIssue({code:'custom',path:['name'],message:'A core-set icon name has lower-case letters, digits and hyphens only; collection:icon names need set "iconify".'});
});
export type IconRef=z.infer<typeof iconRefSchema>;
type IconParts=Pick<IconRef,'set'|'name'|'variant'>;
const core=(icon:IconParts)=>ICON_SETS[icon.set as IconSetId];
/** The address a browser uses. Built from validated parts only. */
export const iconUrl=(icon:IconParts)=>icon.set===ICONIFY_SET?`/api/picker/icons/${ICONIFY_SET}/${icon.name.replace(':','/')}.svg`:`/api/picker/icons/${icon.set}/${icon.variant??core(icon).defaultVariant}/${icon.name}.svg`;
/** The exact name an agent uses in code: set:name for a core set, the Iconify name (collection:name) for the catalogue. */
export const iconId=(icon:IconParts)=>icon.set===ICONIFY_SET?icon.name:`${icon.set}:${icon.name}${icon.variant&&icon.variant!==core(icon).defaultVariant?`/${icon.variant}`:''}`;
export const iconSetTitle=(icon:IconParts)=>icon.set===ICONIFY_SET?`Iconify ${icon.name.split(':')[0]}`:core(icon).title;
export const iconVariants=(icon:IconParts):string[]=>icon.set===ICONIFY_SET?[]:Object.keys(core(icon).variants);
/** One written form everywhere an icon can be given: the id kanvas.icons.search returns. A core set is
 * set:name or set:name/variant ("lucide:mail-dot", "heroicons:envelope/solid"); a catalogue icon is collection:name. */
export function parseIconId(value:string):IconRef|undefined{
 const [head,variant,...extra]=value.trim().split('/');if(extra.length)return undefined;
 const at=head.indexOf(':');if(at<1)return undefined;
 const set=head.slice(0,at),name=head.slice(at+1);
 const candidate=Object.hasOwn(ICON_SETS,set)?{set:set as IconSetId,name,...(variant?{variant}:{})}:variant?undefined:{set:ICONIFY_SET,name:head} as const;
 if(!candidate)return undefined;
 const parsed=iconRefSchema.safeParse(candidate);if(!parsed.success)return undefined;
 if(parsed.data.set!==ICONIFY_SET&&parsed.data.variant&&!Object.hasOwn(ICON_SETS[parsed.data.set as IconSetId].variants,parsed.data.variant))return undefined;
 return parsed.data;
}
export const ICON_PATH_PREFIX='/api/picker/icons/';
/** True for an icon served by this Kanvas: single-colour artwork that can take the text colour. */
export function isPickerIconUrl(value:string,origin?:string):boolean{
 try{const url=new URL(value,origin??'http://kanvas.invalid');return url.pathname.startsWith(ICON_PATH_PREFIX)&&url.pathname.endsWith('.svg')&&(value.startsWith('/')||(!!origin&&url.origin===new URL(origin).origin));}catch{return false;}
}
export const iconIdSchema=z.string().max(120).refine(value=>Boolean(parseIconId(value)),'Use an icon id from kanvas.icons.search, e.g. "lucide:mail-dot".');
/** Either written form of the same reference. */
export const iconRefOf=(icon:IconRef|string):IconRef=>typeof icon==='string'?parseIconId(icon)!:icon;
export const iconPickerDataSchema=z.object({
 mode:z.enum(['candidates','sets','variants','context']).default('candidates'),
 concept:z.string().max(80).optional(),
 icons:z.array(z.union([iconRefSchema,iconIdSchema])).min(1).max(24).describe('Each icon is {set,name,variant?} or the id string from kanvas.icons.search ("lucide:mail-dot").'),
 selected:z.number().int().min(1).max(24).optional(),
}).strict();
export type IconPickerData=z.infer<typeof iconPickerDataSchema>;

/** Curated starter families: open licences (OFL-1.1 or Apache-2.0), Latin
 * subset including Nordic letters. Any other open-licence family id from the
 * same source may be named; the server checks its licence before serving.
 * `variable` is the weight axis of the family's variable font file: one file
 * serves every weight in the range. Families without it are published as
 * static files only and are served one weight per file. */
export const FONT_FAMILIES:Record<string,{readonly name:string;readonly category:'sans'|'serif'|'mono'|'display'|'handwriting';readonly weights:readonly number[];readonly variable?:readonly [number,number]}>={
 inter:{name:'Inter',category:'sans',weights:[100,200,300,400,500,600,700,800,900],variable:[100,900]},
 roboto:{name:'Roboto',category:'sans',weights:[100,200,300,400,500,600,700,800,900],variable:[100,900]},
 'open-sans':{name:'Open Sans',category:'sans',weights:[300,400,500,600,700,800],variable:[300,800]},
 lato:{name:'Lato',category:'sans',weights:[100,300,400,700,900]},
 montserrat:{name:'Montserrat',category:'sans',weights:[100,200,300,400,500,600,700,800,900],variable:[100,900]},
 poppins:{name:'Poppins',category:'sans',weights:[100,200,300,400,500,600,700,800,900]},
 'dm-sans':{name:'DM Sans',category:'sans',weights:[100,200,300,400,500,600,700,800,900],variable:[100,900]},
 'work-sans':{name:'Work Sans',category:'sans',weights:[100,200,300,400,500,600,700,800,900],variable:[100,900]},
 'source-sans-3':{name:'Source Sans 3',category:'sans',weights:[200,300,400,500,600,700,800,900],variable:[200,900]},
 nunito:{name:'Nunito',category:'sans',weights:[200,300,400,500,600,700,800,900],variable:[200,900]},
 'playfair-display':{name:'Playfair Display',category:'serif',weights:[400,500,600,700,800,900],variable:[400,900]},
 merriweather:{name:'Merriweather',category:'serif',weights:[300,400,500,600,700,800,900],variable:[300,900]},
 lora:{name:'Lora',category:'serif',weights:[400,500,600,700],variable:[400,700]},
 'source-serif-4':{name:'Source Serif 4',category:'serif',weights:[200,300,400,500,600,700,800,900],variable:[200,900]},
 'eb-garamond':{name:'EB Garamond',category:'serif',weights:[400,500,600,700,800],variable:[400,800]},
 'libre-baskerville':{name:'Libre Baskerville',category:'serif',weights:[400,500,600,700],variable:[400,700]},
 'jetbrains-mono':{name:'JetBrains Mono',category:'mono',weights:[100,200,300,400,500,600,700,800],variable:[100,800]},
 'fira-code':{name:'Fira Code',category:'mono',weights:[300,400,500,600,700],variable:[300,700]},
 'ibm-plex-mono':{name:'IBM Plex Mono',category:'mono',weights:[100,200,300,400,500,600,700]},
 'source-code-pro':{name:'Source Code Pro',category:'mono',weights:[200,300,400,500,600,700,800,900],variable:[200,900]},
 'bebas-neue':{name:'Bebas Neue',category:'display',weights:[400]},
 oswald:{name:'Oswald',category:'display',weights:[200,300,400,500,600,700],variable:[200,700]},
 'space-grotesk':{name:'Space Grotesk',category:'display',weights:[300,400,500,600,700],variable:[300,700]},
 'archivo-black':{name:'Archivo Black',category:'display',weights:[400]},
 caveat:{name:'Caveat',category:'handwriting',weights:[400,500,600,700],variable:[400,700]},
 'dancing-script':{name:'Dancing Script',category:'handwriting',weights:[400,500,600,700],variable:[400,700]},
 pacifico:{name:'Pacifico',category:'handwriting',weights:[400]},
 lobster:{name:'Lobster',category:'handwriting',weights:[400]},
};
export type CuratedFontId=string;
export const FONT_LICENCES=['OFL-1.1','Apache-2.0','UFL-1.0','MIT'] as const;
export const fontIdSchema=z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(48).describe('Lower-case family id, e.g. inter.');
export const fontWeightSchema=z.number().int().min(100).max(900).multipleOf(100);
export const fontRefSchema=z.object({family:fontIdSchema,weight:fontWeightSchema.default(400)}).strict();
export type FontRef=z.infer<typeof fontRefSchema>;
/** Weight axis of a curated variable family, or undefined for static families and families outside the curated list. */
export const fontVariableRange=(family:string):readonly [number,number]|undefined=>Object.hasOwn(FONT_FAMILIES,family)?FONT_FAMILIES[family].variable:undefined;
export const fontUrl=(family:string,weight:number)=>fontVariableRange(family)?`/api/picker/fonts/${family}/variable.woff2`:`/api/picker/fonts/${family}/${weight}.woff2`;
export const fontDisplayName=(family:string)=>Object.hasOwn(FONT_FAMILIES,family)?FONT_FAMILIES[family].name:family.split('-').map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(' ');
/** CSS family name used only inside picker views, so it never collides with an installed font. */
export const fontCssName=(family:string)=>`kanvas-pick-${family}`;
export const fontPickerDataSchema=z.object({
 mode:z.enum(['samples','pairings','weights','context']).default('samples').describe('pairings: fonts two at a time, heading then body. weights: of the first family.'),
 text:z.string().min(1).max(160).default('The quick brown fox jumps over the lazy dog'),
 fonts:z.array(fontRefSchema).min(1).max(12),
 selected:z.number().int().min(1).max(12).optional(),
 sampleSize:z.number().int().min(10).max(96).optional().describe('Sample text size in CSS px, e.g. 18. Omit to size samples to the screen.'),
}).strict().superRefine((data,ctx)=>{
 if(data.mode==='pairings'&&data.fonts.length%2)ctx.addIssue({code:'custom',path:['fonts'],message:'pairings mode takes fonts two at a time: heading, then body.'});
});
export type FontPickerData=z.infer<typeof fontPickerDataSchema>;
