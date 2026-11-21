import {z} from 'zod';

const text = z.string().min(1).max(4000), label = z.string().min(1).max(240);

const procedureFields = { name: label, description: text.optional(), materials: z.array(text).max(100).default([]), steps: z.array(text).min(1).max(100), index: z.number().int().min(0).max(99).default(0), stage: z.enum(['intro','step','complete']).default('intro'), completion: text.optional() };

const validStep = (v:{steps:string[];index:number}) => v.index < v.steps.length;
export const procedureDataSchema = z.object(procedureFields).strict().refine(validStep, 'Step index must refer to a supplied step');
