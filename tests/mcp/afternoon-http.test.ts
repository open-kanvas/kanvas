import { OPERATION_ENTRIES } from '../../src/server/mcp/operations.js';
import {randomUUID} from 'node:crypto';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {Client as LegacyClient} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport as LegacyTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {expect,it,vi} from 'vitest';
import {startHarness,success,type Browser} from '../core/harness.js';
import {AFTERNOON_MAPPING} from './afternoon-mapping.js';
import {MAX_TOOL_RESULT_BYTES} from '../../src/server/mcp/results.js';

it.each(['modern','legacy'] as const)('exercises every new operation through the actual %s client with separate player identities and preserved scope',async(era)=>{
  const h=await startHarness({mcpProfile:'twelve',}),clients:Array<Client|LegacyClient>=[],seen=new Set<string>();
  const connect=async(browser:Browser,scopes=['read','publish'])=>{
    const token=success(await browser.request<{token:string}>('POST','/api/tokens',{name:'Ephemeral integration client',scopes}));
    const client=era==='modern'?new Client({name:'round-acceptance',version:'1'}):new LegacyClient({name:'round-acceptance',version:'1'});clients.push(client);
    const options={requestInit:{headers:{Authorization:`Bearer ${token.token}`}}};
    if(client instanceof Client)await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',h.baseUrl),options));else await client.connect(new LegacyTransport(new URL('/mcp',h.baseUrl),options));return client;
  };
  try{
    const owner=await h.account(),guest=await h.account(),s=(await owner.session()).id,d=(await owner.display(s)).id;
    const host=await connect(owner),other=await connect(guest),reader=await connect(owner,['read']);
    const call=async<T>(tool:string,operation:string,args:Record<string,unknown>={},client:Client|LegacyClient=host):Promise<T>=>{const result=await client.callTool({name:tool,arguments:{operation,...args}});expect(result.isError,JSON.stringify(result.structuredContent)).not.toBe(true);seen.add(`${tool}:${operation}`);return (result.structuredContent as {data:T}).data;};
    const catalog=await host.listTools();expect(catalog.tools).toHaveLength(12);expect(catalog.tools.flatMap(t=>t.inputSchema.oneOf as unknown[])).toHaveLength(OPERATION_ENTRIES.length);
    const composite=await host.callTool({name:'kanvas_inspect',arguments:{operation:'template.get',template:'presentation'}});
    expect(composite.isError).not.toBe(true);expect(composite.structuredContent).not.toHaveProperty('truncated');
    expect((composite.structuredContent as {data:{schema:unknown;example:unknown}}).data.example).toBeDefined();
    expect(JSON.stringify((composite.structuredContent as {data:{schema:unknown}}).data.schema)).toContain('progress');
    expect(Buffer.byteLength((composite.content as {text:string}[])[0].text)).toBeLessThanOrEqual(MAX_TOOL_RESULT_BYTES);
    expect(catalog.tools.some(t=>t.name==='kanvas_games')).toBe(false);
    await call('kanvas_publish','show',{sessionId:s,displayIds:[d],requestId:'progress-seed',view:{version:1,template:'progress',data:{task:'Verify exact source',events:[]}}});await owner.settle(s,'progress-seed');
    await call('kanvas_publish','progress.append',{sessionId:s,displayId:d,expectedRevision:1,requestId:'append-1',event:{id:'source',title:'Source checked',description:'9007199254740993.001',status:'completed'}});
    expect((await owner.detail(s)).displays[0].revision).toBe(2);
    (await h.runtime.store.put('address-entitlement',{id:owner.user!.id,customAddresses:true,expiresAt:Date.now()+60000}));
    expect(await call('kanvas_session','address.customize',{sessionId:s,displayId:d,alias:'testworkshop'})).toMatchObject({alias:'testworkshop',access:'locator-only'});
    const invitation=await call<{sent:boolean}>('kanvas_access','invite.create',{requestId:'welcome-invite'});expect(invitation.sent).toBe(false);
    expect([...seen].filter(x=>AFTERNOON_MAPPING.some(([,tool,op])=>x===`${tool}:${op}`)).sort()).toEqual(AFTERNOON_MAPPING.map(([,tool,op])=>`${tool}:${op}`).sort());
    expect((await guest.request('GET',`/api/sessions/${s}`)).status).toBe(404);
  }finally{await Promise.all(clients.map(c=>c.close()));await h.close();}
},20000);
