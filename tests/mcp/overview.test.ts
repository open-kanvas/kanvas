import {afterEach, describe, expect, it} from 'vitest';
import Ajv from 'ajv';
import {harness} from './harness.js';
import {discoveryResult, discoveryToolDefinitions, parseDiscoveryRequest, operationCatalog, templateCatalog, DiscoveryCatalog} from '../../src/server/mcp/discovery.js';
import {parseCanonicalArguments} from '../../src/server/mcp/canonical.js';
import {PUBLISH_RECIPE, OVERVIEW_POINTER} from '../../src/server/mcp/overview.js';
const servers: Awaited<ReturnType<typeof harness>>[]=[];
afterEach(async()=>{for(const server of servers.splice(0))await server.close();});
const data=(result:any)=>{expect(result.isError,JSON.stringify(result)).not.toBe(true);return result.structuredContent.data;};
describe('conversation overview',()=>{
 it('accepts no arguments and explicit overview without requiring catalog or action',()=>{
  for(const args of [{},{action:'overview'}]) {
   expect(parseDiscoveryRequest('kanvas_discover',args).action).toBe('overview');
   expect(parseDiscoveryRequest('kanvas_call',{operationId:'kanvas.discover',arguments:args}).action).toBe('overview');
  }
  const tools=discoveryToolDefinitions();
  expect(tools).toHaveLength(2);
  expect(tools[0].description.startsWith('Start here. Once per conversation')).toBe(true);
  expect(tools[1].description.startsWith('Run one Kanvas operation.')).toBe(true);
  expect(tools[0].inputSchema.required).toEqual([]);
  const ajv=new Ajv({strict:false});const validate=ajv.compile(tools[0].inputSchema);
  expect(validate({}),JSON.stringify(validate.errors)).toBe(true);
  expect(validate({action:'overview'}),JSON.stringify(validate.errors)).toBe(true);
  expect(validate({catalog:'tools',action:'list'})).toBe(false);
 });
 it('assembles all registry entries in order without truncation, and validates the publish recipe',()=>{
  parseCanonicalArguments('kanvas.publish',PUBLISH_RECIPE.arguments.arguments);
  const result=data(discoveryResult('kanvas_discover',{}, {principal:{userId:'owner'},serviceAdmin:true}));
  expect(Object.keys(result)).toEqual(['orientation','publishRecipe','rules','operations','templates','screens','recentSessions','savedGuidance','serverVersion','reminder']);
  expect(result.operations.map((x:any)=>x.id)).toEqual(operationCatalog().map(x=>x.id).sort((a,b)=>a.localeCompare(b,'en')));
  expect(result.templates).toHaveLength(templateCatalog().length);
  for(const entry of [...result.operations,...result.templates]){expect(entry.description.length).toBeGreaterThan(10);expect(entry.description).not.toMatch(/…|\[preview\]/);}
  expect(result.templates.some((x:any)=>x.id==='kanvas.template.devops')).toBe(true);
  expect(result.templates.some((x:any)=>x.id==='kanvas.template.operations')).toBe(false);
  expect(result.reminder).toContain('unless it is lost');
 });
 it('honors explicit example omission without mutating cached full contracts',()=>{
  const context={principal:{userId:'owner'}};
  const request={catalog:'operations',action:'get',id:'kanvas.tasklist.update'};
  expect(data(discoveryResult('kanvas_discover',{...request,examples:false},context)).entry.examples).toBeUndefined();
  expect(data(discoveryResult('kanvas_discover',{...request,examples:true},context)).entry.examples.length).toBeGreaterThan(0);
  const search=data(discoveryResult('kanvas_discover',{catalog:'operations',action:'search',query:'tasklist',examples:false},context));
  expect(search.results.every((row:any)=>!Object.hasOwn(row,'example'))).toBe(true);
 });
 it('finds the primary publish operation for everyday display wording',()=>{
  const result=new DiscoveryCatalog().query('tool','search',{query:'publish a view to a display',limit:5},{principal:{userId:'owner'}});
  expect((result.results as {id:string}[]).map(row=>row.id)).toContain('kanvas.publish');
 });
 it('filters administrator-only operations before listing, search and exact retrieval',()=>{
  const catalog=new DiscoveryCatalog(),regular={principal:{userId:'owner'}},admin={...regular,serviceAdmin:true};
  const id='kanvas.friction.read';
  expect(catalog.list('tool',regular).some(x=>x.id===id)).toBe(false);
  expect(catalog.list('tool',admin).some(x=>x.id===id)).toBe(true);
  expect(()=>catalog.query('tool','get',{id},regular)).toThrow();
  expect(JSON.stringify(catalog.query('tool','search',{query:'friction'},regular))).not.toContain(id);
 });
 it.each(['modern','legacy'] as const)('%s exposes matching direct and wrapped noarg/get examples contracts',async era=>{
  const h=await harness();servers.push(h);const {client}=await h[era](h.service.issue('owner'));
  const schema=(await client.listTools()).tools.find(x=>x.name==='kanvas_discover')!.inputSchema;
  const validate=new Ajv({strict:false}).compile(schema);
  const examples=[{}, {action:'overview'}, {catalog:'operations',action:'get',id:'kanvas.tasklist.update',examples:true}];
  for(const args of examples){
   expect(validate(args),JSON.stringify(validate.errors)).toBe(true);
   const direct=await client.callTool({name:'kanvas_discover',arguments:args});
   const wrapped=await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.discover',arguments:args}});
   expect(data(direct)).toEqual(data(wrapped));
   expect(JSON.stringify(direct)).not.toContain('firstContact');
   if(args.action==='get')expect(JSON.stringify(direct)).toContain(OVERVIEW_POINTER);
  }
  for(const args of [{catalog:'tools',action:'list'},{catalog:'operations',action:'get',id:'kanvas.tasklist.update',unexpected:true}])expect((await client.callTool({name:'kanvas_discover',arguments:args})).isError).toBe(true);
  expect(h.service.calls).toHaveLength(0);
 });
});
