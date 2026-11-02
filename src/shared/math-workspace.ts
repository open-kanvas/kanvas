import {z} from 'zod';
const id=z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/).refine(v=>!['constructor','prototype','__proto__'].includes(v),'Reserved ID');
const latex=z.string().min(1).max(8000);
export const mathTermSchema=z.object({latex,emphasis:z.enum(['none','box','underline','color']).default('none'),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#e6ad37')}).strict();
export const mathExpressionSchema=z.object({latex,label:z.string().max(120).optional(),display:z.boolean().default(true),terms:z.record(id,mathTermSchema).default({})}).strict().superRefine((v,c)=>{
 const refs=[...v.latex.matchAll(/\\term\{([a-zA-Z][a-zA-Z0-9_-]{0,63})\}/g)].map(m=>m[1]);
 if(Object.keys(v.terms).length>32||refs.some(k=>!Object.hasOwn(v.terms,k))||Object.keys(v.terms).some(k=>!refs.includes(k)))c.addIssue({code:'custom',message:'At most 32 explicit terms; every term must be referenced by \\term{id}, and every reference must exist.'});
 if(expressionLatex(v).length>16000)c.addIssue({code:'custom',message:'Expanded expression exceeds 16000 characters.'});
 if(Object.values(v.terms).some(t=>t.latex.includes('\\term')))c.addIssue({code:'custom',message:'Nested term references are not supported.'});
});
export const mathWorkspaceSchema=z.object({layout:z.enum(['single','derivation','alternatives']).default('derivation'),expressions:z.record(id,mathExpressionSchema),order:z.array(id).min(1).max(32),focus:id.optional()}).strict().superRefine((v,c)=>{
 if(Object.keys(v.expressions).length>32||new Set(v.order).size!==v.order.length||v.order.length!==Object.keys(v.expressions).length||v.order.some(k=>!Object.hasOwn(v.expressions,k))||v.focus&&!v.order.includes(v.focus)||v.layout==='single'&&v.order.length!==1)c.addIssue({code:'custom',message:'Order must list each expression exactly once; focus must exist; single layout has one expression.'});
 if(JSON.stringify(v).length>64000)c.addIssue({code:'custom',message:'Math workspace exceeds 64000 characters.'});
});
export type MathWorkspace=z.infer<typeof mathWorkspaceSchema>;
export function expressionLatex(expression:z.infer<typeof mathExpressionSchema>):string {
 return expression.latex.replace(/\\term\{([a-zA-Z][a-zA-Z0-9_-]{0,63})\}/g,(_,id:string)=>{
 const term=expression.terms[id]; if(!term)return '';
 const content='{'+term.latex+'}';
 if(term.emphasis==='box')return '\\boxed{'+content+'}';
 if(term.emphasis==='underline')return '\\underline{'+content+'}';
 if(term.emphasis==='color')return '{\\color{'+term.color+'}'+content+'}';
 return content;
 });
}
export const mathExample={layout:'derivation',expressions:{integral:{latex:'I = \\int_0^1 \\frac{x^2}{\\term{denominator}}\\,dx',terms:{denominator:{latex:'1+x^2',emphasis:'box'}}},matrix:{latex:'A = \\begin{pmatrix}1 & 2 \\\\ 3 & 4\\end{pmatrix}'}},order:['integral','matrix']};
