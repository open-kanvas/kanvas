import { z } from 'zod';
import { viewSchema, leafViewSchema } from '../shared/view-schemas.js';
import { feedbackSubmitSchema, errorReportSchema, reportsReadSchema, reportUpdateSchema } from '../shared/reports.js';
import { AppError } from './store.js';
import { COUNTDOWN_TARGET_TIME_RULE, timerValidationRule } from '../shared/timer.js';

export interface ValidationIssue { allowedFields?:string[]; hint?:string; expected?:string; received?:string; path: string; problem: string; maximum?: number; actual?: number; unit?: 'characters' | 'items' | 'bytes' }

// Only schema-defined property names may reach a diagnostic. Dynamic record
// keys, received values and Zod messages can contain private source material.
const publicFields = new Set(['arguments','operationId','source','requestId', 'sessionId', 'displayId', 'displayIds', 'context', 'intent', 'datasetId', 'assetIds', 'templateHint', 'view', 'config', 'expectedRevision', 'direction', 'revision', 'commandId', 'action', 'time', 'value', 'fullscreen', 'accessMode', 'topic']);
function fields(value: unknown, names = publicFields): void {
  if (!value || typeof value !== 'object') return;
  if ('properties' in value && value.properties && typeof value.properties === 'object') {
    for (const name of Object.keys(value.properties)) names.add(name);
  }
  for (const child of Object.values(value)) fields(child, names);
}
fields(z.toJSONSchema(viewSchema, { unrepresentable: 'any' }));
for (const schema of [feedbackSubmitSchema, errorReportSchema, reportsReadSchema, reportUpdateSchema]) fields(z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' }));

const toolFields = new WeakMap<z.ZodType, Set<string>>();
function fieldsFor(schema?: z.ZodType): Set<string> {
  if (!schema) return publicFields;
  let names = toolFields.get(schema);
  if (!names) {
    names = new Set(publicFields);
    fields(z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' }), names);
    toolFields.set(schema, names);
  }
  return names;
}

type Issue = z.ZodError['issues'][number];
const samePath = (left: readonly PropertyKey[], right: readonly PropertyKey[]) => left.length === right.length && left.every((part, index) => part === right[index]);
/** A size refinement after a type failure can describe an array bound as a
 * string bound in Zod. Report the type error, not that misleading refinement.
 * For a union, retain a uniquely type-compatible branch's useful errors. */
function relevantIssues(issues: readonly Issue[], depth = 0): Issue[] {
  const expanded = issues.flatMap(issue => {
    if (issue.code !== 'invalid_union' || depth >= 3) return [issue];
    // Zod's alternative paths are relative to the union's own path.
    const branches = issue.errors.map(branch => branch.map(child => ({ ...child, path: [...issue.path, ...child.path] })));
    const compatible = branches.filter(branch => !branch.some(child => child.code === 'invalid_type' && samePath(child.path, issue.path)));
    return compatible.length === 1 ? relevantIssues(compatible[0], depth + 1) : [issue];
  });
  const wrongTypes = expanded.filter(issue => issue.code === 'invalid_type');
  return expanded.filter(issue => issue.code === 'invalid_type' || !wrongTypes.some(parent => parent.path.every((part, index) => part === issue.path[index])));
}

const safeTypes = new Set(['record', 'array', 'object', 'string', 'number', 'boolean', 'int', 'null']);
export function validationIssues(error: z.ZodError, prefix = '', submitted?: unknown, trimStrings = false, schema?: z.ZodType): ValidationIssue[] {
  const names = fieldsFor(schema);
  // A discriminated union may report its error at the view object rather
  // than at the discriminator. Inspect only schema-known view locations.
  const candidates: {value:unknown;path:string}[]=[{value:submitted,path:prefix||'input'}];
  if(submitted&&typeof submitted==='object'&&'view' in submitted)candidates.push({value:(submitted as {view:unknown}).view,path:[prefix,'view'].filter(Boolean).join('.')});
  for(let i=0;i<candidates.length&&i<100;i++){const {value,path}=candidates[i];if(value&&typeof value==='object'&&'template' in value&&value.template==='presentation'&&'data' in value&&value.data&&typeof value.data==='object'&&'slides' in value.data&&Array.isArray(value.data.slides))value.data.slides.slice(0,64).forEach((slide,index)=>candidates.push({value:slide,path:`${path}.data.slides[${index}]`}));}
  const ids=[...leafViewSchema.options.map(option=>option.shape.template.value),'presentation'];
  for(const {value,path} of candidates)if(value&&typeof value==='object'&&'template' in value&&typeof value.template==='string'&&!ids.includes(value.template as typeof ids[number])){
    const candidateTemplate=value.template;const words=candidateTemplate.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const score=(id:string)=>{if(words.includes(id))return 0;const source=candidateTemplate.toLowerCase().slice(0,100),row=Array.from({length:id.length+1},(_,i)=>i);for(let i=1;i<=source.length;i++){let diagonal=row[0];row[0]=i;for(let j=1;j<=id.length;j++){const before=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,diagonal+(source[i-1]===id[j-1]?0:1));diagonal=before;}}return row[id.length];};
    const suggestions=ids.map(id=>({id,score:score(id)})).sort((a,b)=>a.score-b.score||a.id.localeCompare(b.id)).slice(0,3).map(x=>x.id);
    return [{path:path+'.template',problem:'Unknown template name.',hint:`${suggestions.length?`Closest valid template IDs: ${suggestions.join(', ')}. `:''}Use kanvas_discover to search templates and retrieve an exact template ID.`}];
  }

  return relevantIssues(error.issues).flatMap((issue): ValidationIssue[] => {
    let received = submitted;
    for (const part of issue.path) received = received && typeof received === 'object' && Object.hasOwn(received, part) ? (received as Record<PropertyKey, unknown>)[part] : undefined;
    const actual = typeof received === 'string' ? (trimStrings ? received.trim() : received).length : Array.isArray(received) ? received.length : undefined;
    const size = issue.code === 'too_big' && (issue.origin === 'string' || issue.origin === 'array') ? { maximum: Number(issue.maximum), ...(actual === undefined ? {} : { actual }), unit: issue.origin === 'string' ? 'characters' as const : 'items' as const } : undefined;
    const path = [prefix, ...issue.path.map(part => typeof part === 'number' ? `[${part}]` : names.has(String(part)) ? String(part) : '<record-key>')].filter(Boolean).join('.').replaceAll('.[','[') || 'input';
    if(issue.path[0]==='expectedRevisions')return [{path,problem:'Supply a map of display IDs to non-negative integer revisions, or omit this optional concurrency guard to apply to current state.'}];
    if(/^expected(?:Revision|Version|DeckRevision|DraftRevision)$/.test(String(issue.path.at(-1))))return [{path,problem:'Supply a non-negative integer revision/version, or omit this optional concurrency guard to apply to current state.'}];
    if (issue.path.at(-1)==='template' && typeof received==='string') {
      const ids=[...leafViewSchema.options.map(option=>option.shape.template.value),'presentation'];
      if(!ids.includes(received as typeof ids[number])) {
        // Only catalog IDs enter the reply; never echo arbitrary submitted text.
        const words=received.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        const suggestions=ids.filter(id=>words.includes(id)||words.some(word=>word.length>2&&id.includes(word))).slice(0,5);
        return [{path,problem:'Unknown template name.',hint:`${suggestions.length?`Closest valid template IDs: ${suggestions.join(', ')}. `:''}Use kanvas_discover to search templates and retrieve an exact template ID.`}];
      }
    }
    const expected = issue.code === 'invalid_type' && safeTypes.has(issue.expected) ? issue.expected : undefined;
    const unionTypes = issue.code === 'invalid_union' ? [...new Set(issue.errors.flatMap(branch => branch.flatMap(child => child.code === 'invalid_type' && child.path.length === 0 && safeTypes.has(child.expected) ? [child.expected] : [])))] : [];
    // One deliberately named, public alias is safe to explain. All other
    // unknown keys stay redacted, even when they contain source text.
    if (issue.code === 'unrecognized_keys' && issue.keys.includes('targetTime')) return [{ path: `${path}.targetTime`, problem: COUNTDOWN_TARGET_TIME_RULE }, ...(issue.keys.length > 1 ? [{ path, problem: 'Contains other unsupported fields. Use the documented tool or template schema.' }] : [])];
    if (issue.code === 'unrecognized_keys' && issue.keys.includes('displayId') && schema && Object.hasOwn((z.toJSONSchema(schema,{unrepresentable:'any',io:'input'}) as {properties?:object}).properties??{},'displayIds')) return [{path:'displayId',problem:'Unsupported singular field for this operation. Use displayIds: [the intended display ID], an array.'},...(issue.keys.length>1?[{path,problem:'Contains other unsupported fields. Use the documented tool schema.'}]:[])];
    if(issue.code==='unrecognized_keys'){
      // Schema-selected fields only; untrusted arbitrary record keys stay redacted.
      const selected=submitted&&typeof submitted==='object'&&'template' in submitted?leafViewSchema.options.find(option=>option.shape.template.value===submitted.template):undefined;
      const root=z.toJSONSchema(schema??selected??viewSchema,{unrepresentable:'any',io:'input'});
      const select=(node:any,value:any):any=>{const expand=(n:any):any[]=>(n?.oneOf??n?.anyOf)?.flatMap(expand)??[n];const choices=expand(node);if(choices.length===1)return node;return select(choices.find((c:any)=>Object.entries(c.properties??{}).some(([k,v]:[string,any])=>v.const!==undefined&&value?.[k]===v.const))??choices.find((c:any)=>c.type==='object')??choices[0],value);};
      let node:any=select(root,submitted),value:any=submitted;
      for(const part of issue.path){node=select(node,value);node=typeof part==='number'?node?.items:node?.properties?.[part];value=value?.[part];}
      node=select(node,value);const allowedFields=Object.keys(node?.properties??{});
      return issue.keys.map(key=>{const known=names.has(key),field=known?key:'<record-key>',misplaced=path.endsWith('.data')&&['title','showTitle','showCaption','showSource','showControls','source','actions'].includes(key);return {path:`${path}.${field}`,problem:'Unsupported field.',received:value?.[key]===null?'null':Array.isArray(value?.[key])?'array':typeof value?.[key],...(allowedFields.length?{allowedFields}:{}),...(misplaced?{hint:`${key} belongs beside template/data in view, not inside data.`}:{})};});
    }
    return [{
    path,...(expected?{expected,received:received===undefined?'missing':received===null?'null':Array.isArray(received)?'array':typeof received}:{}),
    problem: timerValidationRule(issue) ?? (issue.code === 'invalid_type' ? expected ? `${received === undefined ? 'Required' : 'Expected'} ${expected}${expected === 'boolean' ? ' (true or false)' : ''}; received ${received===undefined?'missing':received===null?'null':Array.isArray(received)?'array':typeof received}.` : 'A required field is missing or has the wrong type.'
      : issue.code === 'invalid_union' && unionTypes.length > 1 ? `Expected ${unionTypes.join(' or ')}.`
      : issue.code === 'too_big' ? `Maximum ${String(issue.maximum)}${issue.origin === 'string' ? ' characters' : issue.origin === 'array' ? ' items' : ''}${actual === undefined ? '' : `; submitted ${actual}`}.`
      : issue.code === 'too_small' ? `Is below the supported minimum (${String(issue.minimum)}${issue.origin === 'string' ? ' characters' : issue.origin === 'array' ? ' items' : ''}).`
      : issue.code === 'invalid_value' && issue.values.length === 1 && typeof issue.values[0] === 'boolean' ? `Must be ${String(issue.values[0])}${path === 'confirm' ? ' only after the owner confirms the intended browser' : ''}.`
      : issue.code === 'invalid_value' && issue.values.length <= 32 && issue.values.every(value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,80}$/.test(value)) ? `Choose one of: ${issue.values.join(', ')}.`
      : 'Does not match the documented format or template constraints.'),
    ...(size ?? {}),
  }]; });
}

/** Contains only server-selected guidance, never the original exception text. */
export class InputError extends AppError {
  constructor(public readonly issues: ValidationIssue[] = [], public readonly template?: string, public readonly guidance?: { schemaTool: 'kanvas_guide' | 'kanvas_template_get'; topic?: string }) {
    super('INVALID_ARGUMENT', issues.length ? `Invalid arguments: ${issues.slice(0, 3).map(issue => `${issue.path}: ${issue.problem}`).join(' ')}` : 'Invalid arguments. Check the tool schema and current state.');
  }
}
