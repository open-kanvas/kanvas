import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {Client as LegacyClient} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport as LegacyTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {afterEach,expect,it} from 'vitest';
import {startHarness,type Harness} from '../core/harness';
// 2026-11-10 (0875e953): guidance and orientation blocks are conditional by default. These tests verify the
// content and isolation of the full blocks, which are sent on every response under the declared 'full' preference.
process.env.KANVAS_GUIDANCE_DEFAULT='full';
let h:Harness,client:Client|LegacyClient;
afterEach(async()=>{await client?.close();await h?.close();});
it.each(['modern','legacy'])('%s isolates per-call guidance context, overrides, switches and clears',async era=>{
 h=await startHarness();const owner=await h.account(),other=await h.account(),a=await owner.session(),b=await owner.session(),foreign=await other.session();
 for(const [user,s,text] of [[owner,a,'SESSION_ALPHA'],[owner,b,'SESSION_BETA'],[other,foreign,'FOREIGN_SECRET']] as const)await h.runtime.service.guidance.mutate({userId:user.user!.id},{scope:'session',sessionId:s.id,text,expectedRevision:0,requestId:s.id},'set');
 const token=await h.runtime.auth.issueToken(owner.user!.id,'context test',['read','publish']),headers={Authorization:'Bearer '+token.value};
 if(era==='modern'){client=new Client({name:'context-test',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers}}));}
 else{client=new LegacyClient({name:'context-test',version:'1'});await client.connect(new LegacyTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers}}));}
 const call=(name:string,args:any)=>client.callTool({name,arguments:args});
 const verify=(result:any,expected?:string)=>{const text=JSON.stringify(result);expect(text).toContain('agentGuidance');expect(text).not.toContain('FOREIGN_SECRET');for(const s of ['SESSION_ALPHA','SESSION_BETA'])expect(text.includes(s)).toBe(s===expected);};
 for(const sessionId of [a.id,b.id]){
  const expected=sessionId===a.id?'SESSION_ALPHA':'SESSION_BETA',activeContext={sessionId};
  verify(await call('kanvas_discover',{catalog:'tools',action:'search',query:'guidance',activeContext}),expected);
  for(const operationId of ['kanvas.devices.read','kanvas.guidance.library.list']){const r=await call('kanvas_call',{operationId,arguments:{},activeContext});expect(r.isError).not.toBe(true);verify(r,expected);}
 }
 const results=await Promise.all([a,b,a,b].map(s=>call('kanvas_discover',{catalog:'tools',action:'get',id:'kanvas.guidance.read',activeContext:{sessionId:s.id}})));
 results.forEach((r,i)=>verify(r,i%2?'SESSION_BETA':'SESSION_ALPHA'));
 verify(await call('kanvas_call',{operationId:'kanvas.session.state',arguments:{sessionId:b.id},activeContext:{sessionId:a.id}}),'SESSION_BETA');
 verify(await call('kanvas_call',{operationId:'kanvas.session.state',arguments:{sessionId:foreign.id},activeContext:{sessionId:a.id}}));
 for(const activeContext of [null,undefined,{sessionId:foreign.id}])verify(await call('kanvas_discover',{catalog:'tools',action:'list',...(activeContext===undefined?{}:{activeContext})}));
 const missing=await call('kanvas_call',{operationId:'kanvas.session.state',arguments:{},activeContext:{sessionId:a.id}});expect(missing.isError).toBe(true);verify(missing,'SESSION_ALPHA');
 const malformed=await call('kanvas_discover',{catalog:'tools',action:'list',activeContext:{sessionId:a.id,extra:true}});expect(malformed.isError).toBe(true);verify(malformed);
},30000);

