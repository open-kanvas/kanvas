import {describe, expect, it, afterEach} from 'vitest';
import {z} from 'zod';
import {viewSchema} from '../../src/shared/view-schemas.js';
import {InputError, validationIssues} from '../../src/server/input-errors.js';
import {canonicalArgumentError, parseCanonicalArguments} from '../../src/server/mcp/canonical.js';
import {toolFailure} from '../../src/server/mcp/results.js';
import {parseDiscoveryInput} from '../../src/server/mcp/discovery.js';
import {AppError} from '../../src/server/store.js';
import {startHarness, type Harness} from './harness.js';

const pointer='If you have not loaded the overview in this conversation, call discover with no arguments once to get every operation and template name.';
const result=(error:unknown,operation?:string)=>toolFailure(error,undefined,'discovery',operation).structuredContent as any;
function issues(schema:z.ZodType,input:unknown){const parsed=schema.safeParse(input);if(parsed.success)throw Error('Expected rejection');return validationIssues(parsed.error,'input',input,false,schema);}
describe('f1ffebf8 precise secret-safe validation recovery',()=>{
  it.each([['kanvas.tasklist.read','itm','item',3],['kanvas.tasklist.update','chek','check',[1]],['kanvas.tasklist.update','cehck','check',[1]]])('names strict-object typo %s %s without values',(operation,key,correct,value)=>{
    const input={sessionId:'private-session',taskListId:'private-list',...(operation==='kanvas.tasklist.update'?{requestId:'private-request'}:{}),[key as string]:value};
    const error=canonicalArgumentError(operation as string,input)!;
    expect(error.issues).toContainEqual(expect.objectContaining({path:'input.'+key,problem:'Unsupported field.',hint:'Did you mean '+correct+'?',allowedFields:expect.arrayContaining([correct])}));
    const envelope=result(error,operation as string);expect(envelope.overview).toBe(pointer);
    expect(envelope.error.validateTool).toBeUndefined();expect(envelope.error.validateArguments).toBeUndefined();
    expect(envelope.recovery.get.arguments.catalog).toBe('operations');
    expect(JSON.stringify(envelope)).not.toMatch(/private-session|private-list|private-request/);
    expect(parseCanonicalArguments(operation as string,input)).toBeUndefined();
  });
  it('redacts arbitrary strict keys, credential-like strings, source text and nested record keys',()=>{
    const secretKeys=['privateFieldSecret','sk_live_private_123','https://private.example/token','/home/private/file','Bearer private-token','token','source private text'];
    const schema=z.strictObject({item:z.number().optional()});
    for(const key of secretKeys){const text=JSON.stringify(issues(schema,{[key]:'private-source-value'}));expect(text).not.toContain(key);expect(text).not.toContain('private-source-value');expect(text).toContain('<record-key>');}
    const dynamic=z.strictObject({records:z.record(z.string(),z.strictObject({item:z.number()}))});
    const text=JSON.stringify(issues(dynamic,{records:{itm:{item:1,itm:'private-source-value'}}}));
    expect(text).not.toContain('itm');expect(text).not.toContain('private-source-value');expect(text).toContain('<record-key>.<record-key>');
  });
  it('selects all discriminators before reporting allowed fields including get id/examples',()=>{
    const schema=z.union([
      z.strictObject({catalog:z.literal('operations'),action:z.literal('resolve'),query:z.string()}),
      z.strictObject({catalog:z.literal('operations'),action:z.literal('get'),id:z.string(),examples:z.boolean().optional(),expand:z.enum(['own','full']).optional()}),
    ]);
    // Use the branch's real strict-object issue with the complete route schema.
    const input={catalog:'operations',action:'get',id:'kanvas.tasklist.read',examples:true,exampels:true};
    const branch=schema.options[1].safeParse(input);expect(branch.success).toBe(false);if(branch.success)return;
    const found=validationIssues(branch.error,'arguments',input,false,schema)[0];
    expect(found.allowedFields).toEqual(['catalog','action','id','examples','expand']);expect(found.allowedFields).not.toContain('query');
  });
  it('omits irrelevant view validation for non-view and unknown-operation failures',()=>{
    const cases:[string,Record<string,unknown>][]=[['kanvas.tasklist.show',{sessionId:'s'}],['kanvas.discover',{catalog:'tool',action:'list'}],['kanvas.discover',{catalog:'operations',action:'get'}],['kanvas.discover',{catalog:'operations',action:'execute',id:'x'}]];
    for(const [operation,input]of cases){let error:unknown;try{if(operation==='kanvas.discover')parseDiscoveryInput('kanvas_discover',input);else error=canonicalArgumentError(operation,input);}catch(caught){error=caught;}expect(error).toBeDefined();const envelope=result(error,operation);expect(envelope.overview).toBe(pointer);expect(envelope.error.validateTool).toBeUndefined();expect(envelope.error.validateArguments).toBeUndefined();}
    for(const error of [new InputError([{path:'operationId',problem:'Unknown operation ID.'}]),new AppError('INVALID_ARGUMENT','Invalid operation.')]){const envelope=result(error);expect(envelope.overview).toBe(pointer);expect(envelope.error.validateArguments).toBeUndefined();}
  });
  it('offers only a nonempty schema-owned view example and never failed source data',()=>{
    const input={sessionId:'private-session',displayIds:['private-display'],requestId:'private-request',view:{version:1,template:'fact',data:{text:123,privateSecret:'private source text'}}};
    const parsed=viewSchema.safeParse(input.view);expect(parsed.success).toBe(false);if(parsed.success)return;
    const error=new InputError(validationIssues(parsed.error,'view',input.view,false,viewSchema),'fact');const envelope=result(error,'kanvas.publish');
    expect(envelope.overview).toBe(pointer);expect(envelope.error.validateTool).toBe('kanvas_call');
    expect(envelope.error.validateArguments.operationId).toBe('kanvas.view.validate');
    expect(parseCanonicalArguments('kanvas.view.validate',envelope.error.validateArguments.arguments)).toBeDefined();
    expect(envelope.error.validateNote).toMatch(/substitute.*complete prepared view/);
    expect(JSON.stringify(envelope)).not.toMatch(/private-session|private-display|private-request|privateSecret|private source text/);
  });
});

describe('f1ffebf8 invalid mutation preserves saved state',()=>{
  let h:Harness|undefined;afterEach(async()=>{await h?.close();});
  it('rejects chek before task list state or display revision changes',async()=>{
    h=await startHarness();const owner=await h.account(),session=(await owner.session()).id,display=(await owner.display(session)).id;
    const published=await owner.submit(session,[display],{version:1,template:'task-list',data:{items:[{title:'Keep unchanged'}]}} as never);
    const taskListId=String(published.detail.displays[0].view!.data.taskListId),principal={userId:owner.user!.id};
    const call=(operation:string,args:Record<string,unknown>)=>h!.runtime.service.execute(operation,args,principal) as Promise<any>;
    const before=await call('kanvas.tasklist.read',{sessionId:session,taskListId}),displayBefore=(await owner.detail(session)).displays;
    await expect(call('kanvas.tasklist.update',{sessionId:session,taskListId,requestId:'invalid-check',chek:[1]})).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
    expect(await call('kanvas.tasklist.read',{sessionId:session,taskListId})).toEqual(before);
    const stable=(displays:typeof displayBefore)=>displays.map(({serverNow: _clock,...display}:any)=>display);
    expect(stable((await owner.detail(session)).displays)).toEqual(stable(displayBefore));
  });
});


// Scalar alternatives must not hide strict-object field hints in nested unions.
it('preserves allowed fields for object items in scalar-or-object unions',()=>{
 const schema=z.object({items:z.array(z.union([z.string(),z.object({text:z.string()}).strict()]))}).strict();
 const input={items:[{text:'kept',title:'unsupported'}]};
 const parsed=schema.safeParse(input);expect(parsed.success).toBe(false);
 if(!parsed.success)expect(validationIssues(parsed.error,'arguments',input,false,schema)[0]).toMatchObject({path:'arguments.items[0].title',allowedFields:['text']});
});
