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
export const iconRefSchema=z.object({set:z.enum(ICON_SET_IDS),name:iconNameSchema.describe('Exact icon name in that set, as returned by kanvas.icons.search.'),variant:iconVariantSchema.optional().describe('Style of that set, e.g. outline, solid, bold, duotone, filled. Omit for the set default.'),label:z.string().max(60).optional()}).strict();
export type IconRef=z.infer<typeof iconRefSchema>;
/** The address a browser uses. Built from validated parts only. */
export const iconUrl=(icon:Pick<IconRef,'set'|'name'|'variant'>)=>`/api/picker/icons/${icon.set}/${icon.variant??ICON_SETS[icon.set].defaultVariant}/${icon.name}.svg`;
export const iconId=(icon:Pick<IconRef,'set'|'name'|'variant'>)=>`${icon.set}:${icon.name}${icon.variant&&icon.variant!==ICON_SETS[icon.set].defaultVariant?`/${icon.variant}`:''}`;
export const iconPickerDataSchema=z.object({
 mode:z.enum(['candidates','sets','variants','context']).default('candidates').describe('candidates: numbered options for one concept. sets: the same concept across sets. variants: one icon in each style of its set. context: the icons at real sizes in a button, a menu row and a list.'),
 concept:z.string().max(80).optional().describe('What the icon is for, shown as a quiet caption.'),
 icons:z.array(iconRefSchema).min(1).max(24),
 selected:z.number().int().min(1).max(24).optional().describe('Number of the chosen option, marked on screen.'),
}).strict();
export type IconPickerData=z.infer<typeof iconPickerDataSchema>;

/** Curated starter families: open licences (OFL-1.1 or Apache-2.0), Latin
 * subset including Nordic letters. Any other open-licence family id from the
 * same source may be named; the server checks its licence before serving. */
export const FONT_FAMILIES={
 inter:{name:'Inter',category:'sans',weights:[100,200,300,400,500,600,700,800,900]},
 roboto:{name:'Roboto',category:'sans',weights:[100,300,400,500,700,900]},
 'open-sans':{name:'Open Sans',category:'sans',weights:[300,400,500,600,700,800]},
 lato:{name:'Lato',category:'sans',weights:[100,300,400,700,900]},
 montserrat:{name:'Montserrat',category:'sans',weights:[100,200,300,400,500,600,700,800,900]},
 poppins:{name:'Poppins',category:'sans',weights:[100,200,300,400,500,600,700,800,900]},
 'dm-sans':{name:'DM Sans',category:'sans',weights:[400,500,700]},
 'work-sans':{name:'Work Sans',category:'sans',weights:[100,200,300,400,500,600,700,800,900]},
 'source-sans-3':{name:'Source Sans 3',category:'sans',weights:[200,300,400,500,600,700,800,900]},
 nunito:{name:'Nunito',category:'sans',weights:[200,300,400,500,600,700,800,900]},
 'playfair-display':{name:'Playfair Display',category:'serif',weights:[400,500,600,700,800,900]},
 merriweather:{name:'Merriweather',category:'serif',weights:[300,400,700,900]},
 lora:{name:'Lora',category:'serif',weights:[400,500,600,700]},
 'source-serif-4':{name:'Source Serif 4',category:'serif',weights:[200,300,400,500,600,700,800,900]},
 'eb-garamond':{name:'EB Garamond',category:'serif',weights:[400,500,600,700,800]},
 'libre-baskerville':{name:'Libre Baskerville',category:'serif',weights:[400,700]},
 'jetbrains-mono':{name:'JetBrains Mono',category:'mono',weights:[100,200,300,400,500,600,700,800]},
 'fira-code':{name:'Fira Code',category:'mono',weights:[300,400,500,600,700]},
 'ibm-plex-mono':{name:'IBM Plex Mono',category:'mono',weights:[100,200,300,400,500,600,700]},
 'source-code-pro':{name:'Source Code Pro',category:'mono',weights:[200,300,400,500,600,700,800,900]},
 'bebas-neue':{name:'Bebas Neue',category:'display',weights:[400]},
 oswald:{name:'Oswald',category:'display',weights:[200,300,400,500,600,700]},
 'space-grotesk':{name:'Space Grotesk',category:'display',weights:[300,400,500,600,700]},
 'archivo-black':{name:'Archivo Black',category:'display',weights:[400]},
 caveat:{name:'Caveat',category:'handwriting',weights:[400,500,600,700]},
 'dancing-script':{name:'Dancing Script',category:'handwriting',weights:[400,500,600,700]},
 pacifico:{name:'Pacifico',category:'handwriting',weights:[400]},
 lobster:{name:'Lobster',category:'handwriting',weights:[400]},
} as const;
export type CuratedFontId=keyof typeof FONT_FAMILIES;
export const FONT_LICENCES=['OFL-1.1','Apache-2.0','UFL-1.0','MIT'] as const;
export const fontIdSchema=z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(48).describe('Family id in lower case with hyphens, e.g. inter, playfair-display. kanvas.fonts.list returns the curated ids and their weights.');
export const fontWeightSchema=z.union([z.literal(100),z.literal(200),z.literal(300),z.literal(400),z.literal(500),z.literal(600),z.literal(700),z.literal(800),z.literal(900)]);
export const fontRefSchema=z.object({family:fontIdSchema,weight:fontWeightSchema.default(400),label:z.string().max(60).optional()}).strict();
export type FontRef=z.infer<typeof fontRefSchema>;
export const fontUrl=(family:string,weight:number)=>`/api/picker/fonts/${family}/${weight}.woff2`;
export const fontDisplayName=(family:string)=>Object.hasOwn(FONT_FAMILIES,family)?FONT_FAMILIES[family as CuratedFontId].name:family.split('-').map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(' ');
/** CSS family name used only inside picker views, so it never collides with an installed font. */
export const fontCssName=(family:string)=>`kanvas-pick-${family}`;
export const fontPickerDataSchema=z.object({
 mode:z.enum(['samples','pairings','weights','context']).default('samples').describe('samples: the same text in each font. pairings: heading and body pairs. weights: every listed weight of one family. context: each font as a title, a paragraph and a button.'),
 text:z.string().min(1).max(160).default('The quick brown fox jumps over the lazy dog').describe('Sample text supplied by the agent or the person.'),
 body:z.string().max(400).optional().describe('Paragraph text for pairings and context.'),
 fonts:z.array(fontRefSchema).max(12).default([]),
 pairings:z.array(z.object({heading:fontRefSchema,body:fontRefSchema,label:z.string().max(60).optional()}).strict()).max(6).default([]),
 family:fontIdSchema.optional().describe('weights mode: the family whose weights are shown.'),
 weights:z.array(fontWeightSchema).max(9).optional(),
 selected:z.number().int().min(1).max(12).optional(),
}).strict().superRefine((data,ctx)=>{
 if(data.mode==='pairings'&&!data.pairings.length)ctx.addIssue({code:'custom',path:['pairings'],message:'pairings mode needs at least one heading and body pair.'});
 if(data.mode==='weights'&&!data.family)ctx.addIssue({code:'custom',path:['family'],message:'weights mode needs family.'});
 if((data.mode==='samples'||data.mode==='context')&&!data.fonts.length)ctx.addIssue({code:'custom',path:['fonts'],message:'This mode needs at least one font in fonts.'});
});
export type FontPickerData=z.infer<typeof fontPickerDataSchema>;
