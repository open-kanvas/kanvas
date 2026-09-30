import { z } from 'zod';
import { isSafeUrl } from './urls.js';
export const imageReferenceSchema=z.object({url:z.string().max(4000).refine(v=>isSafeUrl(v),'Use a safe image URL or an imported asset URL'),alt:z.string().max(500).optional()}).strict();
export const galleryDataSchema=z.object({
  mode:z.enum(['grid','carousel']).default('grid'),columns:z.number().int().min(1).max(8).optional(),
  images:z.array(imageReferenceSchema.extend({title:z.string().max(300).optional(),caption:z.string().max(2000).optional(),source:z.object({title:z.string().max(300),url:z.string().max(4000).refine(v=>isSafeUrl(v)).optional()}).strict().optional(),showTitle:z.boolean().default(false),showCaption:z.boolean().default(false),showSource:z.boolean().default(false)})).min(1).max(20),
}).strict();
export type GalleryData=z.infer<typeof galleryDataSchema>;
export const boardBackgroundSchema=imageReferenceSchema.extend({x:z.number().finite().min(-100000).max(100000).default(0),y:z.number().finite().min(-100000).max(100000).default(0),width:z.number().finite().positive().max(20000).default(1000),height:z.number().finite().positive().max(20000).default(600)});
