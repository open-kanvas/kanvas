import {z} from 'zod';
import {isSafeUrl} from './urls.js';

const text = z.string().min(1).max(4000), label = z.string().min(1).max(240);

const url = z.string().max(4000).refine(value => (/^\/api\/assets\/[A-Za-z0-9_-]{1,128}$/.test(value) || isSafeUrl(value)), 'Expected a safe public URL or protected asset URL');

const image = z.object({ url, alt: label }).strict().optional();

const procedureFields = { name: label, description: text.optional(), materials: z.array(text).max(100).default([]), steps: z.array(text).min(1).max(100), index: z.number().int().min(0).max(99).default(0), stage: z.enum(['intro','step','complete']).default('intro'), completion: text.optional() };

const validStep = (v:{steps:string[];index:number}) => v.index < v.steps.length;

export const RECIPE_ACTIONS=['mix','pour','add','heat','bake','fry','chill','cut','serve','wait'] as const;
export const recipeDataSchema = z.object({ ...procedureFields, image, stepDetails:z.array(z.object({index:z.number().int().min(0).max(99),action:z.enum(RECIPE_ACTIONS).optional(),image}).strict()).max(100).optional(), duration: label.optional(), yield: label.optional(), mode: z.enum(['overview','steps']).default('overview') }).strict().refine(validStep, 'Step index must refer to a supplied step').refine(d=>!d.stepDetails||(new Set(d.stepDetails.map(x=>x.index)).size===d.stepDetails.length&&d.stepDetails.every(x=>x.index<d.steps.length)),'Step details must refer to distinct supplied step indices.');
