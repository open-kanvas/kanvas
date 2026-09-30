import Ajv from 'ajv/dist/2020.js';
import { z } from 'zod';
import { expect,it } from 'vitest';
import { compactSchemaReferences } from '../../src/shared/json-schema.js';
import { templateViewSchema } from '../../src/shared/view-schemas.js';
import { samples } from '../../src/shared/template-examples.js';

it('compacted presentation schema preserves valid leaves and rejection boundaries',()=>{
  const raw=z.toJSONSchema(templateViewSchema('presentation'),{io:'input',unrepresentable:'any',reused:'ref'});
  const compact=compactSchemaReferences(raw),ajv=new Ajv({strict:false,validateFormats:false});
  const original=ajv.compile(raw),converted=ajv.compile(compact);
  expect(Buffer.byteLength(JSON.stringify(compact))).toBeLessThan(64*1024);
  for(const sample of Object.values(samples).filter(v=>v.template!=='presentation')){
    const deck=(leaf:unknown)=>({version:1,template:'presentation',data:{slides:[leaf],index:0}});
    const missing={...sample} as Record<string,unknown>;delete missing.data;
    for(const candidate of [sample,missing,{...sample,version:7},{...sample,unknownField:true},{...sample,data:{...sample.data,unknownField:true}},{...sample,data:null}]){
      const value=deck(candidate);expect(converted(value),sample.template+' '+JSON.stringify(candidate)).toBe(original(value));
    }
    expect(converted(deck(sample)),sample.template).toBe(sample.template!=='web');
  }
});

it('schema reference rewriting never touches literal source/default objects',()=>{
  const literal={$ref:'#/$defs/example',properties:{x:{$ref:'#/$defs/example'}}};
  const schema={$schema:'https://json-schema.org/draft/2020-12/schema',type:'object',properties:{value:{$ref:'#/$defs/example'}},$defs:{example:{type:'object',default:literal,examples:[literal],const:literal}},description:'fixture '.repeat(7000)};
  const compact=compactSchemaReferences(schema);const encoded=JSON.stringify(compact);
  expect(encoded).toContain(JSON.stringify(literal));expect(schema.$defs.example.default).toEqual(literal);
});
