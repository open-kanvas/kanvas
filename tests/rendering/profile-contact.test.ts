import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { vi } from 'vitest';
import { createInterpreter } from '../../src/server/rendering/interpreter.js';
import { input } from './helpers.js';
import { z } from 'zod';
import { templateViewSchema } from '../../src/shared/view-schemas.js';
import { compactSchemaReferences } from '../../src/shared/json-schema.js';
import { MAX_TOOL_RESULT_BYTES } from '../../src/server/mcp/results.js';
import { Ajv2020 } from 'ajv/dist/2020.js';

describe("profile contact coverage 1", () => {


function expandLocalReferences(value: unknown, root: Record<string, unknown>, ancestors = new Set<string>()): unknown {
  if (Array.isArray(value)) return value.map(child => expandLocalReferences(child, root, ancestors));
  if (!value || typeof value !== 'object') return value;
  const { $defs: _definitions, $anchor: _anchor, description: _description, title: _title, default: _default, examples: _examples, deprecated: _deprecated, readOnly: _readOnly, writeOnly: _writeOnly, ...node } = value as Record<string, unknown>;
  let expanded:Record<string,unknown>;
  if (typeof node.$ref === 'string' && node.$ref.startsWith('#')) {
    const pointer = node.$ref;
    if (ancestors.has(pointer)) throw new Error('Unexpected recursive presentation schema');
    const target = !pointer.startsWith('#/') ? Object.values(root.$defs as Record<string,any>).find(value=>value.$anchor===pointer.slice(1)) : pointer.slice(2).split('/').reduce<unknown>((object, key) => (object as Record<string, unknown>)?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], root);
    if (!target || typeof target !== 'object') throw new Error('Unresolved published schema reference');
    const { $ref: _reference, ...siblings } = node;
    // The reference is an ancestor only while traversing its target. Sibling
    // constraints are independent: e.g. a shared object-type ref at a parent
    // and again in its properties is reuse, not a recursive schema. Expand
    // both independently, then normalize their merged complete constraints.
    const referenced=expandLocalReferences(target,root,new Set([...ancestors,pointer])) as Record<string,unknown>;
    const adjacent=expandLocalReferences(siblings,root,ancestors) as Record<string,unknown>;
    expanded={...referenced,...adjacent};
  }else expanded=Object.fromEntries(Object.entries(node).map(([key, child]) => [key, expandLocalReferences(child, root, ancestors)]));
  const keyword=Array.isArray(expanded.anyOf)?'anyOf':Array.isArray(expanded.oneOf)?'oneOf':undefined;
  if(keyword&&expanded.type==='object'&&expanded.properties){
    const branches=expanded[keyword] as Record<string,unknown>[];
    if(branches.every(branch=>branch.type===undefined&&branch.properties)){
      // Restore the exact original placement of common constraints, then
      // compare every field and validation bound, not merely a few valid examples.
      const shared=expanded.properties as Record<string,unknown>;
      for(const branch of branches){
        const props=branch.properties as Record<string,unknown>;
        for(const [key,value]of Object.entries(shared)){
          if(expanded.unevaluatedProperties===false&&props[key]!==undefined){
            // A shared array upper bound intersects a tighter per-branch bound.
            const {maxItems:branchLimit,...branchSchema}=props[key] as Record<string,unknown>;
            const {maxItems:sharedLimit,...sharedSchema}=value as Record<string,unknown>;
            expect(branchSchema).toEqual(sharedSchema);expect(typeof branchLimit).toBe('number');expect(typeof sharedLimit).toBe('number');
            expect(branchLimit as number).toBeLessThanOrEqual(sharedLimit as number);
          }else{expect(props[key]).toEqual(expanded.unevaluatedProperties===false?undefined:{});props[key]=value;}
        }
        if(expanded.unevaluatedProperties===false)branch.additionalProperties=false;
        branch.type='object';if(expanded.required!==undefined)branch.required=expanded.required;
      }
      delete expanded.properties;delete expanded.type;delete expanded.required;delete expanded.unevaluatedProperties;
    }
  }
  // Scalar const/enum already impose type; canonicalize this redundant keyword
  // on BOTH schemas before comparing every bound, annotation and default.
  const values=Object.hasOwn(expanded,'const')?[expanded.const]:Array.isArray(expanded.enum)?expanded.enum:undefined;
  if(values?.length&&['string','number','integer','boolean','null'].includes(String(expanded.type))&&values.every(value=>expanded.type==='null'?value===null:expanded.type==='integer'?typeof value==='number'&&Number.isInteger(value):typeof value===expanded.type))delete expanded.type;
  return expanded;
}

describe("profile contact contracts", () => {

  it('keeps supplied contact identities and literal action values after an explicit profile selection', async () => {
    const data = { name: 'Supplied person', role: 'Source role', description: 'Biography remains exactly as provided.', details: [{ label: 'Call', value: '+47 400 00 001', type: 'phone' }, { label: 'Email', value: 'person+test@example.com', type: 'email' }, { label: 'Address', value: 'One supplied street\nArendal', type: 'address' }, { label: 'Source identifier', value: '000001.2300' }], links: [{ label: 'Website', url: 'https://example.com/about' }] };
    const interpreter = createInterpreter();
    const base = input();
    const literal = await interpreter.interpret({ ...base, submission: { ...base.submission, templateHint: 'profile', data } });
    expect(literal.view).toMatchObject({ template: 'profile', data });
    const selected = await interpreter.interpret({ ...base, submission: { ...base.submission, templateHint: 'profile', data } });
    expect(selected.view?.data).toEqual(literal.view?.data);
  });});
});
