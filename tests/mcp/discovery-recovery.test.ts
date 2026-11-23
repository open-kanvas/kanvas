import {afterEach,describe,expect,it,vi} from 'vitest';
import {z} from 'zod';
import {Ajv2020} from 'ajv/dist/2020.js';
import {harness} from './harness.js';
import {discoverSchema,discoveryToolDefinitions,parseDiscoveryInput} from '../../src/server/mcp/discovery.js';
import {guidanceContext} from '../../src/server/mcp/active-context.js';
import {resolveIntent} from '../../src/server/mcp/intent-resolve.js';
import type {McpService} from '../../src/server/mcp/types.js';
const running: Awaited<ReturnType<typeof harness>>[]=[];
afterEach(async()=>{for(const h of running.splice(0))await h.close();});
const unwrap=(result:any)=>{expect(result.isError,JSON.stringify(result.structuredContent)).not.toBe(true);return result.structuredContent.data;};
const fallback=(client:any,args:object)=>client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.discover',arguments:args}});

describe('discovery visibility and bounded recovery regression',()=>{
 it('projects the Zod union root without weakening action-specific validation',()=>{
  const original=z.toJSONSchema(discoverSchema,{io:'input'}) as any;
  expect(original.properties).toBeUndefined(); // Root cause: fields only under oneOf.
  const schema=discoveryToolDefinitions()[0].inputSchema;
  const validate=new Ajv2020({strict:false,validateFormats:false}).compile(schema);
  for(const input of [
   {catalog:'tools',action:'get',id:'kanvas.tasklist.update'},
   {catalog:'tools',action:'resolve',query:'scroll to the bottom',sessionId:'s',displayId:'d',parameters:{}},
   {catalog:'help',action:'search',query:'start'},
   {catalog:'templates',action:'list',examples:true},
  ]) {expect(validate(input),JSON.stringify(validate.errors)).toBe(true);expect(()=>parseDiscoveryInput('kanvas_discover',input)).not.toThrow();}
  for(const input of [{},{catalog:'tools',action:'get'},{catalog:'tools',action:'get',id:'x',query:'no'},{catalog:'help',action:'resolve',query:'no'},{catalog:'tools',action:'list',injected:true}]){
   expect(validate(input)).toBe(false);expect(()=>parseDiscoveryInput('kanvas_discover',input)).toThrow();
  }
  expect(JSON.stringify(discoveryToolDefinitions()).length).toBeLessThan(9000);
 });
 it.each(['modern','legacy'] as const)('%s actual tools/list exposes fields and supports direct/fallback discovery with auth parity',async era=>{
  const h=await harness();running.push(h);
  const service=h.service as typeof h.service & Pick<McpService,'resolveIntent'|'customTemplateCatalog'>;
  service.resolveIntent=vi.fn(async(p,input)=>{
   h.service.getSession(input.sessionId,p);
   return {status:'ready',operationId:'kanvas.navigation.control'};
  });
  service.customTemplateCatalog=async p=>[{id:'account.template.private-'+p.userId,provider:'account',title:'Private',summary:'Private template',detail:()=>({id:'account.template.private-'+p.userId})}];
  const token=h.service.issue('owner','reader',['read']);const {client}=await h[era](token);
  const defs=(await client.listTools()).tools;
  const schema=defs.find(t=>t.name==='kanvas_discover')!.inputSchema;
  expect(Object.keys(schema.properties??{})).toEqual(expect.arrayContaining(['catalog','action','id','query','sessionId','displayId','parameters','cursor','activeContext']));
  expect(schema.properties?.action).toMatchObject({type:'string',enum:['resolve','list','search','get']});
  expect(schema.required).toEqual(['catalog','action']);
  expect(schema).toEqual(discoveryToolDefinitions()[0].inputSchema); // Both SDK eras preserve the projected contract.
  const validate=new Ajv2020({strict:false,validateFormats:false}).compile(schema);
  expect(validate({catalog:'tools',action:'get',id:'kanvas.tasklist.update'})).toBe(true);
  const input={catalog:'tools',action:'get',id:'kanvas.tasklist.update'};
  const direct=unwrap(await client.callTool({name:'kanvas_discover',arguments:input}));
  expect(unwrap(await fallback(client,input))).toEqual(direct);
  expect(direct.entry.inputSchema.properties).toHaveProperty('subtasks');
  for(const action of ['list','search'] as const){const args={catalog:'tools',action,...(action==='search'?{query:'scroll'}:{prefix:'kanvas.tasklist.'})};expect((await fallback(client,args)).isError).not.toBe(true);}
  expect(unwrap(await fallback(client,{catalog:'templates',action:'get',id:'kanvas.template.task-list'})).entry.relatedOperations.map((x:any)=>x.id)).toEqual(expect.arrayContaining(['kanvas.tasklist.update','kanvas.tasklist.show','kanvas.navigation.control']));
  expect(unwrap(await fallback(client,{catalog:'templates',action:'get',id:'account.template.private-owner'})).entry.id).toBe('account.template.private-owner');
  expect((await fallback(client,{catalog:'templates',action:'get',id:'account.template.private-other'})).isError).toBe(true);
  expect(unwrap(await fallback(client,{catalog:'tools',action:'resolve',query:'scroll to the bottom',sessionId:'alpha'})).operationId).toBe('kanvas.navigation.control');
  expect((await fallback(client,{catalog:'tools',action:'resolve',query:'scroll to the bottom',sessionId:'beta'})).isError).toBe(true);
  for(const args of [{operationId:'kanvas.discover',arguments:input},{catalog:'tools',action:'get',id:'kanvas.tasklist.update',extra:true}])expect((await fallback(client,args)).isError).toBe(true);
  expect((await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.discover',arguments:input,injected:true}})).isError).toBe(true);
  expect(h.service.calls).toHaveLength(0);
  h.service.tokens.delete(token);
  await expect(fallback(client,input)).rejects.toThrow();
 },30000);
 it.each(['modern','legacy'] as const)('%s returns bounded examples and allowed fields without echoing submitted private data',async era=>{
  const h=await harness();running.push(h);const {client}=await h[era](h.service.issue('owner'));
  const unknown=await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.view.scroll',arguments:{private:'DO_NOT_ECHO'}}});
  expect(unknown.isError).toBe(true);const r=unknown.structuredContent as any;
  expect(r.recovery.suggestions.length).toBeGreaterThan(0);expect(r.recovery.suggestions.length).toBeLessThanOrEqual(3);
  expect(r.recovery.suggestions.map((x:any)=>x.operationId)).toContain('kanvas.navigation.control');
  expect(r.recovery.suggestions.some((x:any)=>x.example)).toBe(true);
  expect(Buffer.byteLength(JSON.stringify(r.recovery))).toBeLessThan(9000);
  expect(JSON.stringify(unknown)).not.toContain('DO_NOT_ECHO');
  const invalid=await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.tasklist.update',arguments:{check:['example-subtask']}}});
  expect(invalid.isError).toBe(true);expect((invalid.structuredContent as any).error.allowedFields).toContain('subtasks');
  expect((invalid.structuredContent as any).recovery.fallback.arguments.operationId).toBe('kanvas.discover');
  expect(JSON.stringify((invalid.structuredContent as any).recovery)).not.toContain('inputSchema');
  const wrong=await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.submit',arguments:{requestId:'wrong',view:{version:1,template:'tasklist',data:{}}}}});
  expect(wrong.isError).toBe(true);const suggestions=(wrong.structuredContent as any).recovery.suggestions;
  expect(suggestions.map((x:any)=>x.id)).toContain('kanvas.template.task-list');
  expect(suggestions.find((x:any)=>x.id==='kanvas.template.task-list').example.template).toBe('task-list');
  expect(h.service.calls).toHaveLength(0);
 },30000);
 it('preserves explicit invalid targets and nested null on fallback guidance',()=>{
  expect(guidanceContext('kanvas_call',{operationId:'kanvas.discover',activeContext:{sessionId:'other'},arguments:{catalog:'tools',action:'resolve',sessionId:null}})).toEqual({sessionId:null});
  expect(guidanceContext('kanvas_call',{operationId:'kanvas.discover',activeContext:{sessionId:'other'},arguments:{activeContext:null}})).toBeUndefined();
 });
 it('runs the actual resolver read-only and rejects unauthorized context before reading a display',async()=>{
  const display=vi.fn(async()=>({id:'d',revision:7,view:{version:1,template:'fact',data:{text:'source'}}}));
  const service={experience:{viewers:vi.fn(async()=>[])},fullAccount:vi.fn(),access:vi.fn(async(_p:any,s:string)=>{if(s!=='alpha')throw Error('denied');}),store:{list:vi.fn(async()=>[{id:'d',name:'Display'}])},display};
  const result=await resolveIntent(service as any,{userId:'owner'} as any,{catalog:'tools',action:'resolve',query:'scroll to the bottom',sessionId:'alpha',displayId:'d'});
  expect(result.operationId).toBe('kanvas.navigation.control');expect(result.inputSchema).toBeDefined();
  await expect(resolveIntent(service as any,{userId:'owner'} as any,{catalog:'tools',action:'resolve',query:'scroll to the bottom',sessionId:'foreign',displayId:'d'})).rejects.toThrow('denied');
  expect(display).toHaveBeenCalledTimes(1);
 });

 it('keeps contextual discovery and schema lookup separate from write authorization',async()=>{
  const h=await harness();running.push(h);const token=h.service.issue('owner','read-only',['read']);const {client}=await h.modern(token);
  const got=unwrap(await fallback(client,{catalog:'tools',action:'get',id:'kanvas.session.create'}));expect(got.entry.annotations.readOnlyHint).toBe(false);
  const denied=await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.session.create',arguments:{name:'Not authorized'}}});
  expect(denied.isError).toBe(true);expect(h.service.sessions.size).toBe(2);
  const response=await fetch(h.url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'kanvas_call',arguments:{operationId:'kanvas.discover',arguments:{catalog:'tools',action:'list'}}}})});
  expect(response.status).toBe(401);
 });

 it('offers compact in-band recovery for missing discovery arguments',async()=>{
  const h=await harness();running.push(h);const {client}=await h.modern(h.service.issue('owner'));
  const missing=await client.callTool({name:'kanvas_discover',arguments:{}});
  expect(missing.isError).toBe(true);const body=missing.structuredContent as any;
  expect(body.recovery.discovery.get.arguments.id).toBe('kanvas.tasklist.update');
  expect(body.recovery.discovery.resolve.arguments.query).toBe('scroll to the bottom');
  expect(body.firstContact.discovery.fallback.arguments.operationId).toBe('kanvas.discover');
  expect(unwrap(await client.callTool({name:body.recovery.discovery.fallback.tool,arguments:body.recovery.discovery.fallback.arguments})).entry.inputSchema.properties.subtasks).toBeDefined();
 });

 it('keeps hold and editor checks in the shared resolver rather than executing a suggested call',async()=>{
  const display=vi.fn(async()=>({id:'d',revision:7,held:true,view:{version:1,template:'fact',data:{text:'source'}}}));
  const access=vi.fn(async()=>{});
  const service={fullAccount:vi.fn(),access,store:{list:vi.fn(async()=>[{id:'d',name:'Display'}])},display};
  const result=await resolveIntent(service as any,{userId:'owner'} as any,{catalog:'tools',action:'resolve',query:'edit current view',sessionId:'alpha',displayId:'d',parameters:{operations:[{op:'appendText',path:'/data/text',value:' addition'}]}});
  expect(access).toHaveBeenCalledWith(expect.anything(),'alpha','editor');
  expect(result.status).toBe('needs_input');expect(result.call).toBeUndefined();expect(result.missingFields).toContain('display (held; host must resolve hold explicitly)');
 });

 it.each(['kanvas.scroll','kanvas.view.navigate','kanvas.feedback.create'])('suggests a real operation for reported near miss %s',async operationId=>{
  const h=await harness();running.push(h);const {client}=await h.modern(h.service.issue('owner'));
  const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:{}}});
  const suggestions=(result.structuredContent as any).recovery.suggestions;
  const expected=operationId.includes('feedback')?'kanvas.feedback.submit':'kanvas.navigation.control';
  expect(suggestions.map((x:any)=>x.operationId)).toContain(expected);
 });

 it('retains connection-scoped first contact and guidance repetition on discovery fallback',async()=>{
  const h=await harness();running.push(h);
  const service=h.service as typeof h.service & Pick<McpService,'agentGuidance'>;
  service.agentGuidance=async()=>({levels:[{scope:'user',id:'owner',revision:1,text:'User guidance stays unchanged'}]});
  const token=h.service.issue('owner');const a=(await h.legacy(token)).client,b=(await h.legacy(token)).client;
  const args={catalog:'tools',action:'get',id:'kanvas.tasklist.update'};
  const first=await fallback(a,args),second=await fallback(a,args),other=await fallback(b,args);
  expect((first.structuredContent as any).firstContact.discovery).toBeDefined();
  expect((second.structuredContent as any).firstContact).toBeUndefined();
  expect((other.structuredContent as any).firstContact.discovery).toBeDefined();
  expect((second.structuredContent as any).agentGuidance.levels[0].text).toBe('User guidance stays unchanged');
 });

 it.each(['modern','legacy'] as const)('%s validates then runs the real resolver through the fallback adapter',async era=>{
  const h=await harness();running.push(h);
  const display=vi.fn(async()=>({id:'d',revision:7,view:{version:1,template:'fact',data:{text:'source'}}}));
  const backing={fullAccount:vi.fn(),access:vi.fn(async(_p:any,s:string)=>{if(s!=='alpha')throw Object.assign(Error('private'),{status:403});}),store:{list:vi.fn(async()=>[{id:'d',name:'Display'}])},display,experience:{viewers:vi.fn(async()=>[])}};
  (h.service as typeof h.service & Pick<McpService,'resolveIntent'>).resolveIntent=(p,input)=>resolveIntent(backing as any,p as any,input);
  const {client}=await h[era](h.service.issue('owner'));
  const args={catalog:'tools',action:'resolve',query:'scroll to the bottom',sessionId:'alpha',displayId:'d'};
  const result=unwrap(await fallback(client,args));expect(result.operationId).toBe('kanvas.navigation.control');expect(result.inputSchema.properties.navigation).toBeDefined();
  expect(result.arguments.expectedRevision).toBe(7);expect(result.arguments.navigation).toEqual({action:'scroll',y:1});
  expect((await fallback(client,{...args,sessionId:'foreign'})).isError).toBe(true);
  expect(h.service.calls).toHaveLength(0);expect(display).toHaveBeenCalledTimes(1);
 });
});
