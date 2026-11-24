import {afterEach,describe,expect,it} from 'vitest';
import {harness} from './harness.js';
const running:Awaited<ReturnType<typeof harness>>[]=[];
afterEach(async()=>{for(const h of running.splice(0))await h.close();});
const pointer='If you have not loaded the overview in this conversation, call discover with no arguments once to get every operation and template name.';
describe('f1ffebf8 transport validation recovery',()=>{
 it.each(['modern','legacy'] as const)('%s reports safe typo paths, correct route fields, overview and no mutation',async era=>{
  const h=await harness();running.push(h);const {client}=await h[era](h.service.issue('owner'));
  for(const [operation,args,key,field] of [
   ['kanvas.tasklist.read',{sessionId:'alpha',taskListId:'private-list',itm:3},'itm','item'],
   ['kanvas.tasklist.update',{sessionId:'alpha',taskListId:'private-list',requestId:'private-request',chek:[4]},'chek','check'],
  ] as const){
   const response=await client.callTool({name:'kanvas_call',arguments:{operationId:operation,arguments:args}});
   expect(response.isError).toBe(true);const body=response.structuredContent as any;
   expect(body.overview).toBe(pointer);expect(body.error.validateTool).toBeUndefined();expect(body.error.validateArguments).toBeUndefined();
   expect(body.error.issues).toContainEqual(expect.objectContaining({path:'input.'+key,hint:'Did you mean '+field+'?'}));
   expect(JSON.stringify(response)).not.toMatch(/private-list|private-request/);
  }
  for(const wrapped of [false,true]){
   const input={catalog:'operations',action:'get',id:'kanvas.tasklist.read',examples:true,extraUnsupported:true};
   const response=await client.callTool(wrapped?{name:'kanvas_call',arguments:{operationId:'kanvas.discover',arguments:input}}:{name:'kanvas_discover',arguments:input});
   expect(response.isError).toBe(true);const body=response.structuredContent as any;
   expect(body.overview).toBe(pointer);expect(body.error.validateArguments).toBeUndefined();
   const unsupported=body.error.issues.find((issue:any)=>issue.problem==='Unsupported field.');
   expect(unsupported.allowedFields).toEqual(expect.arrayContaining(['catalog','action','id','examples']));
   expect(unsupported.allowedFields).not.toContain('query');
  }
  for(const operation of ['kanvas.tasklist.reed','kanvas.tasklist.show']){
   const response=await client.callTool({name:'kanvas_call',arguments:{operationId:operation,arguments:{sessionId:'alpha',privateSecret:'do-not-echo'}}});
   expect(response.isError).toBe(true);const body=response.structuredContent as any;expect(body.overview).toBe(pointer);
   expect(body.error.validateTool).toBeUndefined();expect(body.error.validateArguments).toBeUndefined();expect(JSON.stringify(response)).not.toMatch(/do-not-echo|privateSecret/);
  }
  expect(h.service.calls).toHaveLength(0);
 },30000);
});

