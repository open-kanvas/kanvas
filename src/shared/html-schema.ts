import {z} from 'zod';

const text = z.string().min(1).max(4000), label = z.string().min(1).max(240);

export const STATIC_HTML_RULE = 'Return a body fragment in html and optional separate css. Omit script, iframe, object, embed, base, meta and form tags, including viewport metadata. KANVAS supplies the document wrapper and viewport. Only static HTML/CSS is supported.';
export const htmlDataSchema = z.object({ html: z.string().min(1).max(150_000).refine(value => !/<\s*\/?\s*(?:script|iframe|object|embed|base|meta|form)\b/i.test(value), STATIC_HTML_RULE).describe(STATIC_HTML_RULE), css: z.string().max(50_000).optional(), description: text }).strict();
