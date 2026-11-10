import {z} from 'zod';
import {CSS_NAMED,OPEN_COLOR,RADIX_DARK,RADIX_LIGHT,TAILWIND,TAILWIND_SHADES} from './colour-palettes.js';
/** Colour template: pick colours by looking and by voice. Every swatch has a
 * speakable label and an exact value. Palette values are the published ones
 * and every derived colour (variations, harmonies, tonal scales, contrast) is
 * computed here in OKLCH, so an agent names a palette or a base colour and
 * never invents a hex value. Pure functions: the server validates with them
 * and the browser renders with them. */
export type Rgb=[number,number,number];
const clamp01=(x:number)=>Math.min(1,Math.max(0,x));
export const HEX=/^#[0-9a-fA-F]{6}$/;
export function hexToRgb(hex:string):Rgb{const n=parseInt(hex.slice(1),16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];}
export function rgbToHex([r,g,b]:Rgb):string{return '#'+[r,g,b].map(v=>Math.round(clamp01(v)*255).toString(16).padStart(2,'0')).join('');}
const toLinear=(v:number)=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4,toGamma=(v:number)=>v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055;
/** OKLab (Björn Ottosson). */
export function rgbToOklab([r,g,b]:Rgb):[number,number,number]{
 const lr=toLinear(r),lg=toLinear(g),lb=toLinear(b);
 const l=Math.cbrt(.4122214708*lr+.5363325363*lg+.0514459929*lb),m=Math.cbrt(.2119034982*lr+.6806995451*lg+.1073969566*lb),s=Math.cbrt(.0883024619*lr+.2817188376*lg+.6299787005*lb);
 return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
}
function oklabToLinear([L,a,b]:[number,number,number]):Rgb{
 const l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.291485548*b)**3;
 return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s];
}
export interface Oklch {l:number;c:number;h:number}
export function hexToOklch(hex:string):Oklch{const [L,a,b]=rgbToOklab(hexToRgb(hex));return {l:L,c:Math.hypot(a,b),h:(Math.atan2(b,a)*180/Math.PI+360)%360};}
/** OKLCH to the nearest in-gamut sRGB hex: lightness and hue are kept, chroma is reduced. */
export function oklchToHex(input:Oklch):string{
 const l=clamp01(input.l),h=((input.h%360)+360)%360*Math.PI/180;
 const at=(c:number)=>oklabToLinear([l,c*Math.cos(h),c*Math.sin(h)]);
 const inGamut=(rgb:Rgb)=>rgb.every(v=>v>=-1e-4&&v<=1+1e-4);
 let c=Math.max(0,input.c);
 if(!inGamut(at(c))){let low=0,high=c;for(let i=0;i<24;i++){const mid=(low+high)/2;if(inGamut(at(mid)))low=mid;else high=mid;}c=low;}
 const [r,g,b]=at(c);return rgbToHex([toGamma(clamp01(r)),toGamma(clamp01(g)),toGamma(clamp01(b))]);
}
/** WCAG 2.x relative luminance and contrast ratio. */
export function luminance(hex:string):number{const [r,g,b]=hexToRgb(hex).map(toLinear);return .2126*r+.7152*g+.0722*b;}
export function contrastRatio(a:string,b:string):number{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export type ContrastGrade='AAA'|'AA'|'large only'|'fail';
export function contrastGrade(ratio:number):ContrastGrade{return ratio>=7?'AAA':ratio>=4.5?'AA':ratio>=3?'large only':'fail';}
/** Black or white, whichever reads better on this colour. */
export const readableOn=(hex:string)=>contrastRatio(hex,'#000000')>=contrastRatio(hex,'#ffffff')?'#000000':'#ffffff';

export const PALETTES={
 tailwind:{title:'Tailwind CSS',families:TAILWIND,shades:TAILWIND_SHADES as readonly string[]},
 radix:{title:'Radix Colors (light)',families:RADIX_LIGHT,shades:['1','2','3','4','5','6','7','8','9','10','11','12'] as readonly string[]},
 'radix-dark':{title:'Radix Colors (dark)',families:RADIX_DARK,shades:['1','2','3','4','5','6','7','8','9','10','11','12'] as readonly string[]},
 'open-color':{title:'Open Color',families:OPEN_COLOR,shades:['0','1','2','3','4','5','6','7','8','9'] as readonly string[]},
} as const;
export type PaletteId=keyof typeof PALETTES;
export const PALETTE_IDS=Object.keys(PALETTES) as [PaletteId,...PaletteId[]];
/** A colour is a hex value, a CSS colour name, or a palette reference such as
 * tailwind:amber-400, radix:blue-9, radix-dark:blue-9 or open-color:blue-6. */
export function resolveColour(value:string):string|undefined{
 const text=value.trim().toLowerCase();
 if(HEX.test(text))return text;
 if(Object.hasOwn(CSS_NAMED,text))return CSS_NAMED[text];
 const match=/^(tailwind|radix-dark|radix|open-color):([a-z]+)-(\d{1,3})$/.exec(text);
 if(!match)return undefined;
 const palette=PALETTES[match[1] as PaletteId],family=Object.hasOwn(palette.families,match[2])?palette.families[match[2]]:undefined,index=palette.shades.indexOf(match[3]);
 return family&&index>=0?family[index]:undefined;
}
const colourValue=z.string().min(3).max(40).refine(value=>resolveColour(value)!==undefined,'Use #rrggbb, a CSS colour name, or a palette reference such as tailwind:amber-400.');
export const NAMED_GROUPS=['reds','oranges','yellows','greens','cyans','blues','purples','pinks','browns','greys','whites'] as const;
export type NamedGroup=typeof NAMED_GROUPS[number];
/** Deterministic family of a CSS named colour, from its OKLCH coordinates. */
export function namedGroup(hex:string):NamedGroup{
 const {l,c,h}=hexToOklch(hex);
 if(c<.035)return l>.93?'whites':'greys';
 if(l>.95&&c<.06)return 'whites';
 if(h>=20&&h<90&&l<.62&&c<.16)return 'browns';
 if(h<20||h>=345)return l>.72?'pinks':'reds';
 if(h<65)return 'oranges';
 if(h<112)return 'yellows';
 if(h<170)return 'greens';
 if(h<215)return 'cyans';
 if(h<285)return 'blues';
 if(h<325)return 'purples';
 return 'pinks';
}
export const namedColours=(group:NamedGroup)=>Object.entries(CSS_NAMED).filter(([,hex])=>namedGroup(hex)===group).sort((a,b)=>hexToOklch(b[1]).l-hexToOklch(a[1]).l).map(([name,hex])=>({name,hex}));
export const ROLE_JOBS=['App background','Subtle background','Element background','Hovered element','Selected element','Subtle border','Element border','Hovered border','Solid background','Hovered solid','Low-contrast text','High-contrast text'] as const;
export const TONES=[0,10,20,30,40,50,60,70,80,90,95,100] as const;
const swatch=z.object({value:colourValue,label:z.string().max(24).optional(),name:z.string().max(40).optional()}).strict();
export const COLOUR_MODES=['options','variations','shades','named','harmony','contrast','roles','theme'] as const;
export type ColourMode=typeof COLOUR_MODES[number];
/** Which fields each mode uses. One flat object keeps the published schema
 * small; the rules below keep the contract exactly as strict as a union. */
const MODE_FIELDS:Record<ColourMode,{needs:readonly string[];allows:readonly string[]}>={
 options:{needs:['options'],allows:[]},variations:{needs:['base'],allows:[]},harmony:{needs:['base'],allows:[]},
 shades:{needs:[],allows:['palette','families','custom','cellLabels']},named:{needs:['group'],allows:[]},
 contrast:{needs:['backgrounds','texts'],allows:['sample']},roles:{needs:[],allows:['scale','steps']},theme:{needs:['seed'],allows:[]},
};
const MODE_SPECIFIC=['options','base','palette','families','custom','cellLabels','group','backgrounds','texts','sample','scale','steps','seed'] as const;
export const colourDataSchema=z.object({
 mode:z.enum(COLOUR_MODES).describe('options: 2-8 candidates. variations: around base. shades: palette or custom families. named: CSS names by group. harmony: from base. contrast: backgrounds by texts. roles: 12-step scale. theme: from seed.'),
 options:z.array(swatch).min(2).max(8).optional(),
 base:colourValue.optional(),
 palette:z.enum(PALETTE_IDS).optional(),
 families:z.array(z.string().max(20)).max(31).optional(),
 custom:z.array(z.object({name:z.string().max(24),shades:z.array(swatch).min(2).max(13)}).strict()).max(12).optional(),
 cellLabels:z.enum(['none','shade','hex']).optional().describe('Shade grid: what each cell prints. shade (default for custom families) or hex (shade and value); none keeps labels on the axes (default for a built-in palette).'),
 group:z.enum(NAMED_GROUPS).optional(),
 backgrounds:z.array(colourValue).min(1).max(6).optional(),
 texts:z.array(colourValue).min(1).max(6).optional(),
 sample:z.string().max(40).optional(),
 scale:z.string().regex(/^(radix|radix-dark):[a-z]+$/).optional().describe('e.g. radix:blue'),
 steps:z.array(colourValue).length(12).optional(),
 seed:colourValue.optional(),
 selected:z.array(z.string().max(40)).max(8).optional().describe('Labels of chosen swatches.'),
}).strict().superRefine((data,ctx)=>{
 const rule=MODE_FIELDS[data.mode],present=(field:string)=>(data as Record<string,unknown>)[field]!==undefined;
 for(const field of rule.needs)if(!present(field))ctx.addIssue({code:'custom',path:[field],message:`mode "${data.mode}" needs ${field}.`});
 for(const field of MODE_SPECIFIC)if(present(field)&&!rule.needs.includes(field)&&!rule.allows.includes(field))ctx.addIssue({code:'custom',path:[field],message:`Not used by mode "${data.mode}".`});
 if(data.mode==='shades'){
  if(!data.palette&&!data.custom?.length)ctx.addIssue({code:'custom',path:['palette'],message:`Name a palette (${PALETTE_IDS.join(', ')}) or supply custom families.`});
  if(data.palette)for(const [index,family] of (data.families??[]).entries())if(!Object.hasOwn(PALETTES[data.palette].families,family))ctx.addIssue({code:'custom',path:['families',index],message:`Not a family of this palette. Families: ${Object.keys(PALETTES[data.palette].families).join(', ')}.`});
 }
 if(data.mode==='roles'){
  if(!data.scale&&!data.steps)ctx.addIssue({code:'custom',path:['scale'],message:'Name a scale such as radix:blue, or supply 12 steps.'});
  if(data.scale){const [palette,family]=data.scale.split(':');if(!Object.hasOwn(PALETTES[palette as 'radix'].families,family))ctx.addIssue({code:'custom',path:['scale'],message:`Unknown scale. Radix scales: ${Object.keys(RADIX_LIGHT).join(', ')}.`});}
 }
});
export type ColourData=z.infer<typeof colourDataSchema>;
export interface Swatch {label:string;hex:string;name?:string;role?:string;original?:boolean}
const letter=(index:number)=>String.fromCharCode(65+index);
export function variations(baseHex:string):Swatch[]{
 const base=hexToOklch(baseHex);
 const toward=(target:number,amount:number)=>{const delta=((target-base.h+540)%360)-180;return base.h+Math.sign(delta)*Math.min(Math.abs(delta),amount);};
 return [
  {label:'lighter',hex:oklchToHex({...base,l:Math.min(.97,base.l+.12)})},
  {label:'darker',hex:oklchToHex({...base,l:Math.max(.08,base.l-.12)})},
  {label:'warmer',hex:oklchToHex({...base,h:toward(55,25)})},
  {label:'original',hex:baseHex.toLowerCase(),original:true},
  {label:'cooler',hex:oklchToHex({...base,h:toward(250,25)})},
  {label:'muted',hex:oklchToHex({...base,c:base.c*.5})},
  {label:'vivid',hex:oklchToHex({...base,c:base.c*1.35+.02})},
 ];
}
export function harmonies(baseHex:string):{name:string;swatches:Swatch[]}[]{
 const base=hexToOklch(baseHex),turn=(degrees:number,label:string):Swatch=>({label,hex:oklchToHex({...base,h:base.h+degrees})});
 const original:Swatch={label:'base',hex:baseHex.toLowerCase(),original:true};
 return [
  {name:'Complementary',swatches:[original,turn(180,'complement')]},
  {name:'Analogous',swatches:[turn(-30,'analogous 1'),original,turn(30,'analogous 2')]},
  {name:'Triadic',swatches:[original,turn(120,'triad 1'),turn(240,'triad 2')]},
  {name:'Split complementary',swatches:[original,turn(150,'split 1'),turn(210,'split 2')]},
  {name:'Tetradic',swatches:[original,turn(90,'tetrad 1'),turn(180,'tetrad 2'),turn(270,'tetrad 3')]},
 ];
}
/** Tonal palette: one hue and chroma across tones 0 to 100 (tone = OKLCH lightness x 100). */
export function tonalPalette(hue:number,chroma:number):Swatch[]{return TONES.map(tone=>({label:String(tone),hex:tone===0?'#000000':tone===100?'#ffffff':oklchToHex({l:tone/100,c:chroma,h:hue})}));}
export function seedTheme(seedHex:string){
 const seed=hexToOklch(seedHex);
 const palettes={primary:tonalPalette(seed.h,Math.max(.1,seed.c)),secondary:tonalPalette(seed.h,Math.max(.03,seed.c/3)),tertiary:tonalPalette(seed.h+60,Math.max(.06,seed.c/2)),neutral:tonalPalette(seed.h,Math.min(.012,seed.c/12+.004)),error:tonalPalette(27,.19)};
 const tone=(name:keyof typeof palettes,value:number)=>palettes[name].find(s=>s.label===String(value))!.hex;
 const scheme=(dark:boolean)=>({background:tone('neutral',dark?10:95),surface:tone('neutral',dark?20:100),text:tone('neutral',dark?90:10),primary:tone('primary',dark?80:40),onPrimary:tone('primary',dark?20:100),secondary:tone('secondary',dark?80:40),tertiary:tone('tertiary',dark?80:40),error:tone('error',dark?80:40),outline:tone('neutral',dark?60:50)});
 return {palettes,light:scheme(false),dark:scheme(true)};
}
/** A shade grid. Every cell knows its own shade label, so a grid of the
 * agent's own families can print a speakable label in each cell: custom
 * families need not share one set of column names. A built-in palette has the
 * same shades in every row and is labelled on the axes unless asked otherwise. */
export type ShadeCell=Swatch&{shade:string};
export function shadeGrid(data:ColourData):{title:string;columns:string[];rows:{name:string;cells:ShadeCell[]}[];cellLabels:'none'|'shade'|'hex';chars:number;shadeChars:number}{
 const shadeLabel=(s:{label?:string},index:number)=>s.label??String(index+1);
 const own=(data.custom??[]).map(family=>({name:family.name,cells:family.shades.map((s,index)=>({label:`${family.name} ${shadeLabel(s,index)}`,shade:shadeLabel(s,index),hex:resolveColour(s.value)!}))}));
 const cellLabels=data.cellLabels??(own.length?'shade':'none');
 const result=(title:string,columns:string[],rows:{name:string;cells:ShadeCell[]}[])=>{const shadeChars=Math.max(1,...rows.flatMap(row=>row.cells.map(cell=>cell.shade.length)));return {title,columns,rows,cellLabels,shadeChars,chars:Math.max(cellLabels==='hex'?7:1,shadeChars)};};
 if(own.length&&!data.palette)return result('Custom',data.custom![0].shades.map(shadeLabel),own);
 const palette=PALETTES[data.palette!],names=data.families?.length?data.families:Object.keys(palette.families);
 const rows:{name:string;cells:ShadeCell[]}[]=names.map(name=>({name,cells:palette.families[name].map((hex,index)=>({label:`${name} ${palette.shades[index]}`,shade:palette.shades[index],hex}))}));
 return result(palette.title,[...palette.shades],[...rows,...own]);
}
export const optionSwatches=(data:ColourData):Swatch[]=>(data.options??[]).map((option,index)=>({label:option.label??letter(index),hex:resolveColour(option.value)!,name:option.name??(HEX.test(option.value.trim())?undefined:option.value.trim().toLowerCase())}));
export function roleSteps(data:ColourData):Swatch[]{
 const steps=data.steps?data.steps.map(value=>resolveColour(value)!):(()=>{const [palette,family]=data.scale!.split(':');return [...PALETTES[palette as 'radix'].families[family]];})();
 return steps.map((hex,index)=>({label:String(index+1),hex,role:ROLE_JOBS[index]}));
}
export function contrastMatrix(data:ColourData){
 const backgrounds=(data.backgrounds??[]).map((value,index)=>({label:letter(index),hex:resolveColour(value)!})),texts=(data.texts??[]).map((value,index)=>({label:String(index+1),hex:resolveColour(value)!}));
 return {backgrounds,texts,cells:backgrounds.map(background=>texts.map(text=>{const ratio=contrastRatio(background.hex,text.hex);return {label:`${background.label}${text.label}`,background:background.hex,text:text.hex,ratio:Math.round(ratio*100)/100,grade:contrastGrade(ratio)};}))};
}
/** Name and hex of every swatch a view shows: the token list an agent reads back. */
export function colourTokens(data:ColourData):{name:string;hex:string}[]{
 switch(data.mode){
  case 'options':return optionSwatches(data).map(s=>({name:s.label,hex:s.hex}));
  case 'variations':return variations(resolveColour(data.base!)!).map(s=>({name:s.label,hex:s.hex}));
  case 'shades':return shadeGrid(data).rows.flatMap(row=>row.cells.map(s=>({name:s.label,hex:s.hex})));
  case 'named':return namedColours(data.group!);
  case 'harmony':return harmonies(resolveColour(data.base!)!).flatMap(group=>group.swatches.filter(s=>!s.original).map(s=>({name:s.label,hex:s.hex})));
  case 'contrast':{const matrix=contrastMatrix(data);return [...matrix.backgrounds,...matrix.texts].map(s=>({name:s.label,hex:s.hex}));}
  case 'roles':return roleSteps(data).map(s=>({name:`step ${s.label}`,hex:s.hex}));
  case 'theme':{const theme=seedTheme(resolveColour(data.seed!)!);return Object.entries(theme.palettes).flatMap(([name,tones])=>tones.map(s=>({name:`${name} ${s.label}`,hex:s.hex})));}
 }
}
