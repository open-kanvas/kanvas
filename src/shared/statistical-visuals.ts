import {z} from 'zod';
const id=z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
const label=z.string().min(1).max(100);
const color=z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const vennRegionIds=['outside','A','B','AB','C','AC','BC','ABC'] as const;
export const vennSchema=z.object({sets:z.array(z.object({label,color:color.optional()}).strict()).min(2).max(3),regions:z.partialRecord(z.enum(vennRegionIds),z.object({label:label.optional(),value:z.union([z.string().max(100),z.number().finite()]).optional(),members:z.array(z.string().max(100)).max(30).optional()}).strict()).default({}),emphasis:z.array(z.enum(vennRegionIds)).max(8).default([]),universeLabel:label.optional()}).strict().superRefine((v,c)=>{
 if(v.sets.length===2&&[...Object.keys(v.regions),...v.emphasis].some(k=>k.includes('C')))c.addIssue({code:'custom',message:'C regions require three sets.'});
 if(new Set(v.emphasis).size!==v.emphasis.length)c.addIssue({code:'custom',message:'Emphasis IDs must be unique.'});
});
export type VennData=z.infer<typeof vennSchema>;
export const distributionSchema=z.object({ranges:z.array(z.object({id,series:label,from:z.number().finite(),to:z.number().finite(),label:label.optional(),color:color.optional()}).strict().refine(v=>v.from<v.to,'Range end must exceed start')).max(32).default([]),bands:z.array(z.object({id,series:label,label:label.optional(),color:color.optional(),points:z.array(z.object({x:z.number().finite(),low:z.number().finite(),high:z.number().finite()}).strict().refine(v=>v.low<=v.high,'low must not exceed high')).min(2).max(5000)}).strict()).max(16).default([])}).strict();
export const vennExample={sets:[{label:'A'},{label:'B'}],regions:{A:{value:12},AB:{value:5},B:{value:9},outside:{value:3}},emphasis:['AB']};
