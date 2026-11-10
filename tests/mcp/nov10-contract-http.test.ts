import {afterEach,describe,expect,it} from 'vitest';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {startHarness,type Harness} from '../core/harness.js';
import {NOV10_MAPPING} from './nov10-mapping.js';
import {CANONICAL_TOOLS} from '../../src/server/mcp/canonical.js';
import {operationId} from '../../src/server/mcp/operations.js';
import {AGENT_CONDUCT,RHYTHM_NUDGE} from '../../src/shared/philosophy.js';
import {KANVAS_VERSION} from '../../src/shared/version.js';

describe('2026-11-10 operations and response policy over real MCP',()=>{
 let h:Harness,client:Client|undefined;
 afterEach(async()=>{await client?.close().catch(()=>{});client=undefined;await h?.close();});
 const connect=async()=>{h=await startHarness({mcpProfile:'discovery'});const owner=await h.account(),{value}=await h.runtime.auth.issueToken(owner.user!.id,'Nov10 contract',['read','publish']);
  client=new Client({name:'nov10-contract',version:'9.9.9'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers:{Authorization:`Bearer ${value}`}}}));return owner;};
 const use=async(id:string,args:Record<string,unknown>)=>{const result=await client!.callTool({name:'kanvas_call',arguments:{operationId:id,arguments:args}});return {error:result.isError===true,body:result.structuredContent as Record<string,any>};};
 it('server information carries the real release, title, website and logo sizes; instructions open with the conduct',async()=>{
  await connect();const info=client!.getServerVersion() as Record<string,any>;
  expect(info).toMatchObject({name:'kanvas',title:'Kanvas',version:KANVAS_VERSION,websiteUrl:'https://open-kanvas.ai'});expect(info.version).not.toBe('1.0.0');
  expect(info.icons.map((icon:{sizes:string[]})=>icon.sizes[0])).toEqual(['48x48','192x192','512x512','any']);expect(String(info.description).length).toBeGreaterThan(20);
  expect(client!.getInstructions()?.startsWith(AGENT_CONDUCT)).toBe(true);
 });
 it('every new operation is discoverable by its id and callable; first contact is sent once',async()=>{
  const owner=await connect(),session=await owner.session('Contract'),display=await owner.display(session.id);
  const exercised=new Set<string>();
  const first=await use('kanvas.session.state',{sessionId:session.id});exercised.add('state');
  expect(first.error).toBe(false);expect(first.body.firstContact.purpose).toBe(AGENT_CONDUCT);expect(first.body.agentGuidance.levels.length).toBeGreaterThan(0);expect(first.body.data.mode.current).toBe('live');expect(first.body.data.manage.displays.change).toContain('kanvas.display.register');
  const firstBytes=JSON.stringify(first.body).length;
  const second=await use('kanvas.session.state',{sessionId:session.id});
  expect(second.body.firstContact).toBeUndefined();expect(second.body.agentGuidance).toMatchObject({unchanged:true});expect(second.body.orientation.help).toBe('kanvas.help.getting-started.steps');
  // A display connects: the receiver instructions are no longer repeated.
  const controller=new AbortController();await owner.raw(`/api/sessions/${session.id}/events?displayId=${display.id}&tabId=tv`,{}, {signal:controller.signal});
  const third=await use('kanvas.session.state',{sessionId:session.id});expect(third.body.orientation).toEqual({guide:third.body.orientation.guide,help:'kanvas.help.getting-started.steps'});expect(JSON.stringify(third.body).length).toBeLessThan(firstBytes*.75);
  const published=await use('kanvas.submit',{requestId:'contract-task-list',sessionId:session.id,displayIds:[display.id],view:{version:1,template:'task-list',data:{items:[{title:'One'},{title:'Two'}]}}});
  expect(published.error).toBe(false);expect(published.body.rhythm).toBe(RHYTHM_NUDGE);
  expect((await use('kanvas.submit',{requestId:'contract-fact',sessionId:session.id,displayIds:[display.id],view:{version:1,template:'fact',data:{text:'Second'}}})).body.rhythm).toBeUndefined();
  const lists=await use('kanvas.tasklist.read',{sessionId:session.id});const taskListId=lists.body.data.taskLists[0].id;
  const calls:Record<string,Record<string,unknown>>={
   kanvas_tasklist_read:{sessionId:session.id,taskListId,item:1},
   kanvas_tasklist_update:{sessionId:session.id,taskListId,requestId:'contract-check',check:[1]},
   kanvas_tasklist_show:{sessionId:session.id,taskListId,displayId:display.id,requestId:'contract-show'},
   kanvas_agents_read:{},
   kanvas_fonts_list:{category:'mono'},
   kanvas_monitor_stream_create:{sessionId:session.id,name:'Contract',requestId:'contract-stream'},
  };
  for(const [canonical,args] of Object.entries(calls)){const result=await use(operationId(canonical),args);expect(result.error,`${canonical}: ${JSON.stringify(result.body).slice(0,300)}`).toBe(false);exercised.add(canonical);calls[canonical]=result.body.data;}
  const streamId=(calls.kanvas_monitor_stream_create as {streamId:string}).streamId;
  for(const [canonical,args] of [['kanvas_monitor_stream_read',{sessionId:session.id,streamId}],['kanvas_monitor_stream_revoke',{sessionId:session.id,streamId}]] as const){const result=await use(operationId(canonical),args);expect(result.error,canonical).toBe(false);exercised.add(canonical);}
  const agents=calls.kanvas_agents_read as {agents:{agentId:string;thisConnection?:boolean;name:string}[]};expect(agents.agents.some(agent=>agent.thisConnection)).toBe(true);
  // Declared refusals are still the operation answering: own connection cannot be revoked, friction is for administrators,
  // and with no outside network in tests the icon search answers that its sets are unavailable.
  const revoke=await use('kanvas.agents.revoke',{agentId:agents.agents.find(agent=>agent.thisConnection)!.agentId,confirm:true});expect(revoke.error).toBe(true);expect(revoke.body.error.code).toBe('INVALID_ARGUMENT');exercised.add('kanvas_agents_revoke');
  const friction=await use('kanvas.friction.read',{kind:'validation'});expect(friction.error).toBe(true);expect(friction.body.error.code).toBe('FORBIDDEN');exercised.add('kanvas_friction_read');
  h.runtime.service.pickers.fetcher=async()=>{throw new Error('no outside network in tests');};
  const icons=await use('kanvas.icons.search',{query:'settings'});expect(icons.error).toBe(false);expect(icons.body.data.unavailableSets).toHaveLength(5);exercised.add('kanvas_icons_search');
  expect([...exercised].filter(name=>name.startsWith('kanvas_')).sort()).toEqual(NOV10_MAPPING.map(([name])=>name).sort());
  for(const [name] of NOV10_MAPPING)expect(CANONICAL_TOOLS.some(tool=>tool.name===name),name).toBe(true);
  controller.abort();
 },30000);
 it('a failed publish explains itself, and limit and needs_template answers are structured',async()=>{
  const owner=await connect(),session=await owner.session('Errors'),display=await owner.display(session.id);
  const wrong=await use('kanvas.submit',{requestId:'wrong-list',sessionId:session.id,displayIds:[display.id],view:{version:1,template:'list',data:{items:[{title:'A',text:'B'}]}}});
  expect(wrong.error).toBe(true);expect(wrong.body.error.issues[0]).toMatchObject({problem:'Unsupported field.',allowedFields:expect.arrayContaining(['text'])});expect(wrong.body.error.example).toBeTruthy();
  const loose=await use('kanvas.submit',{requestId:'loose',sessionId:session.id,displayIds:[display.id],intent:'compare the three options',context:'Option A costs 100 and takes two days. Option B costs 80 and takes four days. Option C costs 140 and takes one day. The team prefers speed but the budget is tight this quarter.'});
  expect(loose.error).toBe(false);expect(loose.body.data.status).toBe('needs_template');expect(loose.body.data.candidates).toHaveLength(3);
  const search=await client!.callTool({name:'kanvas_discover',arguments:{catalog:'templates',action:'search',query:'who sits where at the wedding dinner'}});
  const hits=(search.structuredContent as {data:{results:{id:string;example?:unknown}[]}}).data.results;expect(hits[0].id).toBe('kanvas.template.seat-map');expect(hits[0].example).toBeTruthy();
  const listed=await client!.callTool({name:'kanvas_discover',arguments:{catalog:'tools',action:'list',prefix:'kanvas.display.'}});expect(JSON.stringify(listed.content)).toContain('kanvas.display.register');
 },30000);
});
