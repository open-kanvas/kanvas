import {z} from 'zod';

const text = z.string().min(1).max(4000), label = z.string().min(1).max(240);
export const kpiDataSchema = z.object({ items: z.array(z.object({ label, value: label, delta: label.optional(), trend: z.enum(['up', 'down', 'flat']).optional(), note: text.optional() }).strict()).min(1).max(8) }).strict();
