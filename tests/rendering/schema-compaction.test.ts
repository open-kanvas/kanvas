import Ajv from 'ajv/dist/2020.js';
import { z } from 'zod';
import { expect,it } from 'vitest';
import { compactSchemaReferences } from '../../src/shared/json-schema.js';
import { templateViewSchema } from '../../src/shared/view-schemas.js';
import { toolSuccess,MAX_TOOL_RESULT_BYTES } from '../../src/server/mcp/results.js';
import { TEMPLATE_DISPLAY_GUIDANCE } from '../../src/shared/display-guidance.js';
import { samples,templateNames } from '../../src/shared/template-examples.js';

it('compacted presentation schema preserves valid leaves and rejection boundaries', () => {
    const raw = z.toJSONSchema(templateViewSchema('presentation'), { io: 'input', unrepresentable: 'any', reused: 'ref' });
    const compact = compactSchemaReferences(raw), ajv = new Ajv({ strict: false, validateFormats: false });
    const original = ajv.compile(raw), converted = ajv.compile(compact);
    expect(Buffer.byteLength(JSON.stringify(compact))).toBeLessThan(MAX_TOOL_RESULT_BYTES);
    // Budget the actual MCP envelope, not only schema bytes. All profiles must
    // retain every validator; the bounded-preview fallback is never a contract.
    for (const profile of ['legacy', 'domains', 'twelve'] as const) {
        const result = toolSuccess({ template: 'presentation', name: templateNames.presentation, schema: compact, example: samples.presentation, displayGuidance: TEMPLATE_DISPLAY_GUIDANCE.presentation, note: 'Complete view schema, not submit arguments. Preserve supplied source values.' }, undefined, "kanvas.template.get", profile);
        expect((result.structuredContent as Record<string, unknown>)?.truncated, profile).not.toBe(true);
        const text = result.content.find(item => item.type === 'text');
        expect(text?.type).toBe('text');
        if (text?.type === 'text')
            expect(Buffer.byteLength(text.text), profile).toBeLessThanOrEqual(MAX_TOOL_RESULT_BYTES);
        expect(((result.structuredContent as Record<string, unknown>)?.data as {
            schema: unknown;
        }).schema).toEqual(compact);
    }
    for (const sample of Object.values(samples).filter(v => v.template !== 'presentation')) {
        const deck = (leaf: unknown) => ({ version: 1, template: 'presentation', data: { slides: [leaf], index: 0 } });
        const missing = { ...sample } as Record<string, unknown>;
        delete missing.data;
        for (const candidate of [sample, missing, { ...sample, version: 7 }, { ...sample, unknownField: true }, { ...sample, data: { ...sample.data, unknownField: true } }, { ...sample, data: null }]) {
            const value = deck(candidate);
            expect(converted(value), sample.template + ' ' + JSON.stringify(candidate)).toBe(original(value));
        }
        // 0.38.0: a live stream binding and the message-board snapshot are display views, not slides.
        expect(converted(deck(sample)), sample.template).toBe(!['web', 'split-screen', 'monitor-stream', 'message-board'].includes(sample.template));
        // Common action bounds may be lifted, but source-record branches must stay action-free.
        for (const count of [0, 1, 8, 9]) {
            const candidate = deck({ ...sample, actions: Array.from({ length: count }, (_, i) => ({ id: `a${i}`, label: 'Action', kind: 'button' })) });
            expect(converted(candidate), `${sample.template} action count ${count}`).toBe(original(candidate));
        }
    }
}, 60000); // Two AJV compiles plus exhaustive equivalence for the expanded catalog.
 // Two AJV compiles plus exhaustive equivalence for the expanded catalog.
// 2026-11-10: the time allowance was 20 s. With the 0.37.0 catalog this test took 15.2 to 17.7 s in five complete runs
// on the two-core qualification machine and 21.7 s in a sixth, which failed on the clock alone. The work grows with
// every template; the assertions are unchanged.

it('schema reference rewriting never touches literal source/default objects',()=>{
  const literal={$ref:'#/$defs/example',properties:{x:{$ref:'#/$defs/example'}}};
  const schema={$schema:'https://json-schema.org/draft/2020-12/schema',type:'object',properties:{value:{$ref:'#/$defs/example'}},$defs:{example:{type:'object',default:literal,examples:[literal],const:literal}},description:'fixture '.repeat(7000)};
  const compact=compactSchemaReferences(schema);const encoded=JSON.stringify(compact);
  expect(encoded).toContain(JSON.stringify(literal));expect(schema.$defs.example.default).toEqual(literal);
});

it('shares only independent constraints, retaining real description fields and object closure',()=>{
  // Large fixture activates composite compaction and repeats object/array
  // fragments with different field contracts; application literals stay data.
  const literal={description:'source value',required:['source literal'],type:'not a schema'};
  const properties=Object.fromEntries(Array.from({length:120},(_,i)=>[`entry${i}`,{type:'object',properties:{description:{type:'string',maxLength:100},value:{type:'array',minItems:1,maxItems:4,items:{type:'integer',minimum:i}},literal:{const:literal}},required:['description','value'],additionalProperties:false}]));
  const raw={$schema:'https://json-schema.org/draft/2020-12/schema',type:'object',properties:{template:{const:'presentation'},...properties},additionalProperties:false,$defs:{unused:{type:'string'}},description:'Composite schema fixture '.repeat(3000)};
  const compact=compactSchemaReferences(raw),ajv=new Ajv({strict:false,validateFormats:false}),before=ajv.compile(raw),after=ajv.compile(compact);
  expect(compact.type).toBe('object');
  for(const entry of [
    {description:'A',value:[20],literal},
    {value:[20]},
    {description:3,value:[20]},
    {description:'A',value:[]},
    {description:'A',value:[20,21,22,23,24]},
    {description:'A',value:[1]},
    {description:'A',value:[20],other:true},
  ]){const input={template:'presentation',entry10:entry};expect(after(input),JSON.stringify(entry)).toBe(before(input));}
  expect(after({template:'presentation',entry10:{description:'A',value:[20],literal}})).toBe(true);
  expect(JSON.stringify(compact)).toContain(JSON.stringify(literal));
});
