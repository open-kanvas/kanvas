import { z } from 'zod';
import { isSafeUrl } from './urls.js';

export const iframeUrlSchema = z.string().max(2048).refine(value => isSafeUrl(value) && value.startsWith('https://'), 'Supply a public HTTPS website URL without credentials. Local/private addresses and executable URLs cannot be framed.');
export const iframeDataSchema = z.object({
  pages: z.array(z.object({ url: iframeUrlSchema, title: z.string().max(300).optional(), viewport:z.enum(['desktop','mobile']).default('desktop') }).strict()).min(1, 'Supply at least one website page.').max(16, 'At most 16 website pages can be browsed in one view.'),
  layout: z.enum(['paged','grid']).default('grid'),
  screenshotFallback: z.boolean().default(true),
  index: z.number().int().nonnegative().max(15).default(0),
}).strict().refine(value => value.index < value.pages.length, 'Selected index must address a supplied page.');

export const listDataSchema = z.object({
  items: z.array(z.union([z.string().min(1).max(4000), z.object({ text: z.string().min(1).max(4000), detail: z.string().max(4000).optional() }).strict()])).min(1).max(1000),
  ordered: z.boolean().default(false), start: z.number().int().min(1).max(1000000).default(1),
  pageSize: z.number().int().min(1).max(1000).default(1000),
}).strict();
export type IframeData = z.infer<typeof iframeDataSchema>;
export type ListData = z.infer<typeof listDataSchema>;
