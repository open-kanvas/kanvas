import {z} from 'zod';
const name=z.string().min(1).max(128);
const endpoint=z.object({schema:name.optional(),table:name,column:name}).strict();
export const databaseSchemaDataSchema=z.object({
 layout:z.enum(['related','grid']).default('related'),
 columns:z.array(z.object({schema:name.optional(),table:name,column:name,type:z.string().min(1).max(160),nullable:z.boolean(),primaryKey:z.boolean().optional(),foreignKey:z.boolean().optional(),default:z.string().max(500).optional()}).strict()).min(1).max(500),
 relationships:z.array(z.object({from:endpoint,to:endpoint,kind:z.enum(['declared','inferred']),label:z.string().max(160).optional()}).strict()).max(100).default([])
}).strict().superRefine((data,ctx)=>{
 const key=(x:{schema?:string;table:string;column:string})=>JSON.stringify([x.schema??'',x.table,x.column]);
 const keys=new Set<string>();for(const [i,c] of data.columns.entries()){if(keys.has(key(c)))ctx.addIssue({code:'custom',path:['columns',i],message:'Duplicate column in this table'});keys.add(key(c));}
 if(new Set(data.columns.map(c=>JSON.stringify([c.schema??'',c.table]))).size>40)ctx.addIssue({code:'custom',path:['columns'],message:'Show at most 40 tables; choose a subset explicitly.'});
 for(const [i,r] of data.relationships.entries())for(const side of ['from','to'] as const)if(!keys.has(key(r[side])))ctx.addIssue({code:'custom',path:['relationships',i,side],message:'Relationship endpoint must name a supplied column.'});
});
export type DatabaseSchemaData=z.infer<typeof databaseSchemaDataSchema>;
