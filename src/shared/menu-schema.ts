import {z} from 'zod';
import {isSafeUrl} from './urls.js';

const text = z.string().min(1).max(4000), label = z.string().min(1).max(240);

const url = z.string().max(4000).refine(value => (/^\/api\/assets\/[A-Za-z0-9_-]{1,128}$/.test(value) || isSafeUrl(value)), 'Expected a safe public URL or protected asset URL');

const image = z.object({ url, alt: label }).strict().optional();
export const menuDataSchema = z.object({ image, groups: z.array(z.object({ title: label, image, items: z.array(z.object({ name: label, price: label.optional(), description: text.optional(), image, featured: z.boolean().default(false) }).strict()).min(1).max(100) }).strict()).min(1).max(20) }).strict();
