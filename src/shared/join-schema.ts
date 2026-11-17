import {z} from 'zod';
import {isSafeUrl} from './urls.js';

const text = z.string().min(1).max(4000), label = z.string().min(1).max(240);

const url = z.string().max(4000).refine(value => (/^\/api\/assets\/[A-Za-z0-9_-]{1,128}$/.test(value) || isSafeUrl(value)), 'Expected a safe public URL or protected asset URL');
export const joinDataSchema = z.object({ url: z.union([url,z.string().regex(/^\/s\/[A-Za-z0-9_-]{1,128}$/)]), qr: z.object({url,alt:label}).strict(), expiresAt: z.string().datetime(), label: label.default('Join this display'), description: text.optional() }).strict();
