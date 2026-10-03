import { describe, expect, it, vi } from 'vitest';
import { createInterpreter } from '../../src/server/rendering/interpreter.js';
import { input } from './helpers.js';
import { z } from 'zod';
import { templateViewSchema } from '../../src/shared/view-schemas.js';
import { compactSchemaReferences } from '../../src/shared/json-schema.js';
import { MAX_TOOL_RESULT_BYTES } from '../../src/server/mcp/results.js';
import { Ajv2020 } from 'ajv/dist/2020.js';

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

describe('September 14 source-preserving integration', () => {
  it('expands shared fragments in independent siblings without hiding actual reference cycles',()=>{
    const schema={$defs:{object:{$anchor:'object',type:'object'}},$ref:'#object',properties:{child:{$ref:'#object',properties:{value:{type:'integer',minimum:2}},required:['value'],additionalProperties:false}},required:['child'],additionalProperties:false};
    expect(expandLocalReferences(schema,schema)).toEqual({type:'object',properties:{child:{type:'object',properties:{value:{type:'integer',minimum:2}},required:['value'],additionalProperties:false}},required:['child'],additionalProperties:false});
    const direct={$defs:{a:{$anchor:'a',$ref:'#a'}},$ref:'#a'};
    const indirect={$defs:{a:{$anchor:'a',$ref:'#b'},b:{$anchor:'b',$ref:'#a'}},$ref:'#a'};
    for(const cycle of [direct,indirect])expect(()=>expandLocalReferences(cycle,cycle)).toThrow('Unexpected recursive presentation schema');
  });

  it('keeps supplied contact identities and literal action values after an explicit profile selection', async () => {
    const data = { name: 'Supplied person', role: 'Source role', description: 'Biography remains exactly as provided.', details: [{ label: 'Call', value: '+47 400 00 001', type: 'phone' }, { label: 'Email', value: 'person+test@example.com', type: 'email' }, { label: 'Address', value: 'One supplied street\nArendal', type: 'address' }, { label: 'Source identifier', value: '000001.2300' }], links: [{ label: 'Website', url: 'https://example.com/about' }] };
    const interpreter = createInterpreter();
    const base = input();
    const literal = await interpreter.interpret({ ...base, submission: { ...base.submission, templateHint: 'profile', data } });
    expect(literal.view).toMatchObject({ template: 'profile', data });
    const selected = await interpreter.interpret({ ...base, submission: { ...base.submission, templateHint: 'profile', data } });
    expect(selected.view?.data).toEqual(literal.view?.data);
  });
  it('binds passive playback to exact supplied state instead of invented progress or names', async () => {
    const data = { track: 'Original track', artist: 'Original artist', artwork: { url: 'https://example.com/cover.png', alt: 'Real supplied cover' }, state: 'paused', elapsedSeconds: 42.125, durationSeconds: 7200.25 };
    const interpreter = createInterpreter();
    const base = input();
    const explicit = await interpreter.interpret({ ...base, submission: { ...base.submission, templateHint: 'now-playing', data } });
    expect(explicit.view?.data).toEqual(data);
    const selected = await interpreter.interpret({ ...base, submission: { ...base.submission, templateHint: 'now-playing', data } });
    expect(selected.view?.data).toEqual(data);
  });
  it('requires real playback source before rendering and preserves explicit clock settings', async () => {
    const interpreter = createInterpreter();
    const base = input();
    await expect(interpreter.interpret({ ...base, submission: { ...base.submission, data: undefined, templateHint: 'now-playing', context: 'Show whatever music is playing.' } })).rejects.toMatchObject({ code: 'INVALID_PLAYBACK_SOURCE' });
    const data = { timeZone: 'Europe/Oslo', label: 'Supplied zone', showSeconds: true, zones: [{ timeZone: 'Asia/Tokyo', label: 'Tokyo' }] };
    const result = await interpreter.interpret({ ...base, submission: { ...base.submission, templateHint: 'clock', data } });
    expect(result.view).toMatchObject({ template: 'clock', data });
  });
  it('keeps the complete composite schema inspectable with identical constraints and MCP response headroom', () => {
    const original = z.toJSONSchema(templateViewSchema('presentation'), { unrepresentable: 'any', io: 'input', reused: 'ref' });
    const compact = compactSchemaReferences(original);
    expect(expandLocalReferences(compact, compact)).toEqual(expandLocalReferences(original, original));
    // The complete template.get envelope is checked through both real SDKs.
    // Keep this structural check tied to the actual transport budget, not a
    // historical size estimate that predates the progress and log templates.
    expect(Buffer.byteLength(JSON.stringify(compact))).toBeLessThan(MAX_TOOL_RESULT_BYTES);
  });
  it('validates compact presentation unions with a real 2020-12 validator without admitting extra fields or reply actions', () => {
    const original = z.toJSONSchema(templateViewSchema('presentation'), { unrepresentable: 'any', io: 'input', reused: 'ref' });
    const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
    const before = ajv.compile(original), after = ajv.compile(compactSchemaReferences(original));
    const fact = { version: 1, template: 'fact', data: { text: 'Exact 1.2300' } };
    const chat = { version: 1, template: 'chat', data: { contextLabel: 'Workspace', conversationLabel: 'Review', messages: [{ id: 'one', sender: 'Source', text: 'Literal record.' }] } };
    const candidates: [unknown, boolean][] = [
      [fact, true], [chat, true],
      [{ version: 1, template: 'table', data: { columns: ['Value'], rows: [['9007199254740993.001']] } }, true],
      [{ ...fact, unexpected: true }, false],
      [{ ...chat, actions: [{ id: 'reply', label: 'Reply', kind: 'input' }] }, false],
      [{ ...chat, data: { ...chat.data, text: 'A different template cannot authorize this field.' } }, false],
      [{ ...fact, data: {} }, false],
      [{ ...fact, template: 'not-a-template' }, false],
    ];
    for (const [slide, valid] of candidates) {
      const value = { version: 1, template: 'presentation', data: { slides: [slide], index: 0 } };
      expect(before(value)).toBe(valid); expect(after(value)).toBe(valid);
      expect(after({ ...value, unrelatedEnvelopeField: true })).toBe(false);
    }
  });
  it('renders literal draft text without a content rewrite, including whitespace and empty initial drafts', async () => {
    const interpreter = createInterpreter();
    for (const text of ['  Dear reader,\r\n\r\nKeep the 1.2300 value and the final line.\r\n', '']) {
      const base = input();
      const result = await interpreter.interpret({ ...base, submission: { ...base.submission, templateHint: 'drafting', data: { text } } });
      expect(result.view).toMatchObject({ template: 'drafting', data: { text, status: 'drafting', suggestions: [] } });
    }
    const base = input();
    const text = '  Exact draft sent in context.\nDo not paraphrase it.\n';
    const literal = await interpreter.interpret({ ...base, submission: { ...base.submission, data: undefined, templateHint: 'drafting', context: text } });
    expect(literal.view).toMatchObject({ template: 'drafting', data: { text } });
  });

  it('binds explicitly selected drafting to the submitted text and suggestion offsets, not regenerated content', async () => {
    const data = { text: 'Keep café and 😀 exactly.', status: 'reviewing', suggestions: [{ id: 'one', start: 5, end: 9, replacement: 'coffee' }] };
    const interpreter = createInterpreter();
    const base = input();
    const result = await interpreter.interpret({ ...base, submission: { ...base.submission, templateHint: 'drafting', data, intent: 'Use the drafting layout for the supplied text.' } });
    expect(result.view).toMatchObject({ template: 'drafting', data });
  });

  it('rejects invalid draft anchors before rendering, without echoing the draft', async () => {
    const interpreter = createInterpreter();
    const base = input();
    const result = await interpreter.interpret({ ...base, submission: { ...base.submission, templateHint: 'drafting', data: { text: 'Private source marker', suggestions: [{ id: 'bad', start: 999, end: 1000, replacement: 'replacement' }] } } }).catch(error => error);
    expect(result).toMatchObject({ code: 'INVALID_DRAFT_SOURCE' });
    expect(JSON.stringify(result)).not.toContain('Private source marker');
  });
});
