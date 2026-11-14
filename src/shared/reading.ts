import { z } from 'zod';
export const READING_DEFAULTS={fontSize:30,wpm:220,zoom:1,playing:false} as const;
export const READING_SPEEDS=[120,160,190,220,260,320] as const;
/** Session or account text size for every template, as a percentage of the standard size. */
export const TEXT_SIZE={min:50,max:250,default:100} as const;
export const textScale=(config?:{textSize?:number}|null)=>{const v=config?.textSize;return typeof v==='number'&&Number.isFinite(v)?Math.min(TEXT_SIZE.max,Math.max(TEXT_SIZE.min,v))/100:1;};
export const readingFields={
  textSize:z.number().int().min(TEXT_SIZE.min).max(TEXT_SIZE.max).optional().describe('Text size for every view of the session, percent of standard (100). Lists, tables, logs, documents and pickers scale and lay out again; views composed to fill the screen scale their fixed-size text and keep filling the screen. Persisted; unlike kanvas.navigation.control zoom, which is one window, not saved.'),
  readingFontSize:z.number().int().min(16).max(40).optional().describe('Default document text size; only documents using the reading layout. For every template use textSize (session-wide, saved) or kanvas.navigation.control zoom (one window, not saved).'),
  readingWpm:z.number().int().min(120).max(320).optional().describe('Default document playback speed; only documents using the reading layout. For every template use textSize (session-wide, saved) or kanvas.navigation.control zoom (one window, not saved).'),
  readingZoom:z.number().min(.75).max(1.75).optional().describe('Default document reading zoom; only documents using the reading layout. For every template use textSize (session-wide, saved) or kanvas.navigation.control zoom (one window, not saved).'),
};
export interface ReadingState {fontSize:number;wpm:number;zoom:number;playing:boolean}
export const readingActionSchema=z.object({
  action:z.literal('reading'),command:z.enum(['start','pause','resume','slower','faster','configure']).default('configure'),
  fontSize:z.number().int().min(16).max(40).optional(),wpm:z.number().int().min(120).max(320).optional(),zoom:z.number().min(.75).max(1.75).optional(),
  position:z.number().min(0).max(1).optional(),saveDefaults:z.boolean().default(false),
}).strict();
export function readingDefaults(config:{readingFontSize?:number;readingWpm?:number;readingZoom?:number}):ReadingState{
  return {fontSize:config.readingFontSize??READING_DEFAULTS.fontSize,wpm:config.readingWpm??220,zoom:config.readingZoom??1,playing:false};
}
