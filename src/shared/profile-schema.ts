import {z} from 'zod';
import {isSafeUrl} from './urls.js';
import {PROFILE_DETAIL_TYPES,profileDetailError} from './profile-contact.js';

const text = z.string().min(1).max(4000), label = z.string().min(1).max(240);

const url = z.string().max(4000).refine(value => (/^\/api\/assets\/[A-Za-z0-9_-]{1,128}$/.test(value) || isSafeUrl(value)), 'Expected a safe public URL or protected asset URL');

const links = z.array(z.object({ label, url }).strict()).max(12).optional();

const image = z.object({ url, alt: label }).strict().optional();

const detail = z.object({ label, value: text }).strict();
export const profileDataSchema = z.object({ name: label, kind: z.enum(['person', 'organization']).default('person'), role: label.optional(), description: text.optional(), image, details: z.array(detail.extend({ type: z.enum(PROFILE_DETAIL_TYPES).optional().describe('Explicit contact type. Omit or use text to retain plain, non-actionable label/value text.') }).superRefine((value, ctx) => { const message = profileDetailError(value); if (message) ctx.addIssue({ code: 'custom', path: ['value'], message }); })).max(20).optional(), links }).strict();
