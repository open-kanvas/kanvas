import {z} from 'zod';
import {isSafeUrl} from './urls.js';

const text = z.string().min(1).max(4000), label = z.string().min(1).max(240);

const url = z.string().max(4000).refine(value => (/^\/api\/assets\/[A-Za-z0-9_-]{1,128}$/.test(value) || isSafeUrl(value)), 'Expected a safe public URL or protected asset URL');

const image = z.object({ url, alt: label }).strict().optional();
export const leaderboardDataSchema = z.object({ items: z.array(z.object({ rank: label, name: label, value: label, change: label.optional(), image }).strict()).min(1).max(100) }).strict();
