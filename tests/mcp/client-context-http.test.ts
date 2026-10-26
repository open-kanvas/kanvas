import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {Client as LegacyClient} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport as LegacyTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {afterEach,expect,it} from 'vitest';
import {startHarness,type Harness} from '../core/harness';
let h:Harness,client:Client|LegacyClient;
afterEach(async()=>{await client?.close();await h?.close();});
it.each(['modern','legacy'])('%s preserves protocol hints separately from optional session client claims',async era=>{
 h=await startHarness();const owner=await h.account(),token=await h.runtime.auth.issueToken(owner.user!.id,'Context regression',['read','publish']);
 const headers={Authorization:'Bearer '+token.value,'User-Agent':'Kanvas-context-test/1'};
 if(era==='modern'){client=new Client({name:'context-current',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers}}));}
 else{client=new LegacyClient({name:'context-legacy',version:'1'});await client.connect(new LegacyTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers}}));}
 const result=await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.session.create',arguments:{name:'Client session',initialDisplay:false,clientDetails:{agent:'Claimed agent',interaction_mode:'voice'}}}});expect(result.isError).not.toBe(true);
 const sessions=await h.runtime.service.sessions({userId:owner.user!.id}),session=sessions.find(s=>s.name==='Client session')!,context=session.agentConnections![0];expect(context.selfReported).toMatchObject({agent:'Claimed agent',interaction_mode:'voice'});expect(context.inferred.userAgent).toBe('Kanvas-context-test/1');expect(context.verified).toBe(false);
 if(era==='legacy'){expect(context.inferred.clientName).toBe('context-legacy');expect(context.inferred.clientVersion).toBe('1');expect(context.conflicts).toHaveLength(1);}
 const update=await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.client.context.update',arguments:{sessionId:session.id,clientDetails:{model:'Self-reported model'}}}});expect(update.isError).not.toBe(true);expect((await h.runtime.service.detail({userId:owner.user!.id},session.id)).session.agentConnections).toHaveLength(1);
},30000);
