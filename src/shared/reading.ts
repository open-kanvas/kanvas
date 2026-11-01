import { z } from 'zod';
export const READING_DEFAULTS={fontSize:30,wpm:220,zoom:1,playing:false} as const;
export const READING_SPEEDS=[120,160,190,220,260,320] as const;
export const readingFields={
  readingFontSize:z.number().int().min(16).max(40).optional().describe('Default document text size; only documents using the reading layout. To enlarge or shrink the current view on any template use kanvas.navigation.control with navigation:{action:zoom,scale:1.5}, not session reading settings.'),
  readingWpm:z.number().int().min(120).max(320).optional().describe('Default document playback speed; only documents using the reading layout. To enlarge or shrink the current view on any template use kanvas.navigation.control with navigation:{action:zoom,scale:1.5}, not session reading settings.'),
  readingZoom:z.number().min(.75).max(1.75).optional().describe('Default document reading zoom; only documents using the reading layout. To enlarge or shrink the current view on any template use kanvas.navigation.control with navigation:{action:zoom,scale:1.5}, not session reading settings.'),
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
