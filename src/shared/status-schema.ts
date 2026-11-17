import {z} from 'zod';

const text = z.string().min(1).max(4000), label = z.string().min(1).max(240);
export const statusDataSchema = z.object({ asOf: label.optional(), items: z.array(z.object({ name: label, status: z.enum(['ok', 'warning', 'down', 'unknown']), label: label.optional(), note: text.optional() }).strict()).min(1).max(100) }).strict();
