import { z } from 'zod';
import { isSafeUrl } from './urls.js';

// Decorations refer to retained row positions, never replace source cells.
export const tableColorSchema=z.string().regex(/^#[0-9a-fA-F]{6}$/).describe('Any RGB hex colour, not a fixed status palette.');
const row=z.number().int().min(0).max(999),label=z.string().min(1).max(200);
export const tableIndicatorSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('dot'),label,color:tableColorSchema}).strict(),
  z.object({kind:z.literal('icon'),label,name:z.enum(['check','close','lock','globe','star','info','warning','clock','minus','arrow']),color:tableColorSchema.optional()}).strict(),
  z.object({kind:z.literal('image'),label,url:z.string().max(2048).refine(isSafeUrl,'Use a public image URL or authorized imported asset.')}).strict(),
]);
export const tableRowStyleSchema=z.object({row,background:tableColorSchema.optional(),color:tableColorSchema.optional()}).strict();
export const tableCellStyleSchema=tableRowStyleSchema.extend({column:label,indicator:tableIndicatorSchema.optional()}).strict();
export type TableRowStyle=z.infer<typeof tableRowStyleSchema>;
export type TableCellStyle=z.infer<typeof tableCellStyleSchema>;
export type TableIndicator=z.infer<typeof tableIndicatorSchema>;
export function tableForeground(background:string):string {
  const channels=[1,3,5].map(i=>parseInt(background.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
  const luminance=.2126*channels[0]+.7152*channels[1]+.0722*channels[2];
  return (luminance+.05)/.05>=1.05/(luminance+.05)?'#000000':'#ffffff';
}
