import {z} from 'zod';
import {isSafeUrl} from './urls.js';

const text = z.string().min(1).max(4000), label = z.string().min(1).max(240);

const url = z.string().max(4000).refine(value => (/^\/api\/assets\/[A-Za-z0-9_-]{1,128}$/.test(value) || isSafeUrl(value)), 'Expected a safe public URL or protected asset URL');

const image = z.object({ url, alt: label }).strict().optional();
export const quoteDataSchema = z.object({ text: z.string().min(1).max(8000), attribution: label, role: label.optional(), image, url: url.optional() }).strict();
