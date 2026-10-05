import { operationRequest } from './requests.js';
import { operationId } from '../../src/server/mcp/operations.js';
import {randomUUID} from 'node:crypto';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {Client as LegacyClient} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport as LegacyTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {afterEach,expect,it} from 'vitest';
import {ACCOUNT_MAPPING} from './account-mapping.js';
import {startHarness,type Harness} from '../core/harness.js';
import {validateView} from '../../src/shared/view-schemas.js';
let h:Harness,client:Client|LegacyClient;
afterEach(async()=>{await client?.close();await h?.close();});
it.each(['modern','legacy'])('%s MCP exposes and executes every account/history/topology operation under real authorization',async era=>{
  h=await startHarness({mcpProfile:'twelve'});const owner=await h.account(),person=await h.account(),s=await owner.session(),d=await owner.display(s.id);
  const token=(await h.runtime.auth.issueToken(owner.user!.id,'Disposable account checks',['read','publish']));
  const headers={Authorization:'Bearer '+token.value};
  if(era==='modern'){client=new Client({name:'account-current',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers}}));}
  else{client=new LegacyClient({name:'account-legacy',version:'1'});await client.connect(new LegacyTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers}}));}
  const seen=new Set<string>();
  const call=async(tool:string,operation:string,args:Record<string,unknown>={})=>{
    const result=await client.callTool(operationRequest({name:tool,arguments:{operation,...args}}));
    expect(result.isError,tool+' '+operation).not.toBe(true);
    seen.add(tool+':'+operation);return (result.structuredContent as {data:any}).data;
  };
  const catalog=await client.listTools();expect(catalog.tools).toHaveLength(2);
  for(const [canonical] of ACCOUNT_MAPPING){const found=await client.callTool({name: 'kanvas_discover', arguments: { catalog: 'tools', action: 'get', id:operationId(canonical)}});expect((found.structuredContent as any).data.entry.operationId).toBe(operationId(canonical));}
  const profile=await call('kanvas_inspect','profile.read');
  expect((await call('kanvas_configure','profile.update',{expectedRevision:profile.revision,displayName:'MCP profile'})).user.displayName).toBe('MCP profile');
  let group=await call('kanvas_access','group.create',{kind:'team',name:'MCP team',requestId:randomUUID()});
  expect((await call('kanvas_inspect','groups.list')).groups.some((g:any)=>g.id===group.id)).toBe(true);
  expect((await call('kanvas_inspect','group.read',{groupId:group.id})).name).toBe('MCP team');
  group=await call('kanvas_configure','group.update',{groupId:group.id,expectedRevision:group.revision,defaults:{theme:'light'},branding:{palette:['#225588']}});
  group=await call('kanvas_access','group.member.set',{groupId:group.id,expectedRevision:group.revision,username:person.user!.username,role:'member'});
  expect((await call('kanvas_inspect','group-access.read',{sessionId:s.id})).grants).toHaveLength(0);
  const grant=await call('kanvas_access','group-access.set',{sessionId:s.id,groupId:group.id,expectedRevision:0,role:'viewer'});
  expect((await person.detail(s.id)).session.role).toBe('viewer');
  const context=await call('kanvas_inspect','session-context.read',{sessionId:s.id});
  expect((await call('kanvas_configure','session-context.set',{sessionId:s.id,expectedRevision:context.context.revision,teamId:group.id})).effective.theme).toBe('light');
  const activity=await call('kanvas_inspect','activity.read',{sessionId:s.id});expect(activity.entries.some((e:any)=>e.type==='session.group-access.changed')).toBe(true);
  const analytics=await call('kanvas_inspect','analytics.read',{sessionId:s.id});expect(validateView(analytics.chart).template).toBe('chart');
  const topology=await call('kanvas_inspect','topology.read',{sessionId:s.id,includeLocation:true,expectedCountries:['NO']});expect(topology.counts.windows).toBe(0);expect(topology.displays[0].id).toBe(d.id);
  for(const template of ['json','session-topology','presentation']){const result=await call('kanvas_inspect','template.get',{template});expect(JSON.stringify(result)).toContain(template);expect(result.truncated).not.toBe(true);}
  const exact='{"amount":9007199254740993.001,"data":[true,null]}';
  await call('kanvas_publish','show',{sessionId:s.id,displayIds:[d.id],requestId:randomUUID(),view:{version:1,template:'json',data:{json:exact}}});
  await call('kanvas_access','group-access.set',{sessionId:s.id,groupId:group.id,expectedRevision:grant.revision,role:null});
  expect((await person.request('GET','/api/sessions/'+s.id)).status).toBe(404);
  const archived=await owner.session('Synthetic archive fixture');
  await call('kanvas_remove','archive.manage',{sessionId:archived.id,resource:'session'});
  expect((await call('kanvas_inspect','archive.list')).items.some((item:any)=>item.targetId===archived.id)).toBe(true);
  await call('kanvas_remove','archive.manage',{sessionId:archived.id,resource:'session',action:'restore'});
  expect(ACCOUNT_MAPPING.every(([,tool,operation])=>seen.has(tool+':'+operation))).toBe(true);
  const forbidden=await client.callTool(operationRequest({name:'kanvas_inspect',arguments:{operation:'analytics.read',scope:'service'}}));expect(forbidden.isError).toBe(true);expect(JSON.stringify(forbidden.structuredContent)).toContain('FORBIDDEN');
},30000);
