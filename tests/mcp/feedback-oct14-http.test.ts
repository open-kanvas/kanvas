import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {Client as LegacyClient} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport as LegacyTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {afterEach,expect,it} from 'vitest';
import {startHarness,type Harness} from '../core/harness';
let h:Harness,client:Client|LegacyClient;
afterEach(async()=>{await client?.close();await h?.close();});
it.each(['modern','legacy'])('%s repeats authorized distinct guidance on catalog and successful/failing calls without leaking another session',async era=>{
 h=await startHarness();const owner=await h.account(),other=await h.account(),s=await owner.session(),foreign=await other.session();
 const p={userId:owner.user!.id};await h.runtime.service.guidance.mutate(p,{scope:'session',sessionId:s.id,text:'Only publish when I ask in this session.',expectedRevision:0,requestId:'scope'},'set');
 await h.runtime.service.guidance.mutate({userId:other.user!.id},{scope:'session',sessionId:foreign.id,text:'PRIVATE FOREIGN GUIDANCE',expectedRevision:0,requestId:'foreign'},'set');
 const token=await h.runtime.auth.issueToken(owner.user!.id,'Disposable guidance regression',['read','publish']),headers={Authorization:'Bearer '+token.value};
 if(era==='modern'){client=new Client({name:'guidance-current',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers}}));}
 else{client=new LegacyClient({name:'guidance-legacy',version:'1'});await client.connect(new LegacyTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers}}));}
 for(const args of [{catalog:'tools',action:'list'},{catalog:'tools',action:'search',query:'guidance'},{catalog:'tools',action:'get',id:'kanvas.guidance.read'},{catalog:'tools',action:'get',id:'nonexistent'}]){
  const result=await client.callTool({name:'kanvas_discover',arguments:args});expect(JSON.stringify(result)).toContain('agentGuidance');expect(JSON.stringify(result)).toContain('Be proactive with Kanvas');
 }
 for(const [sessionId,expected] of [[s.id,true],[foreign.id,false]] as const){const result=await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.session.state',arguments:{sessionId}}});expect(JSON.stringify(result).includes('Only publish when I ask')).toBe(expected);expect(JSON.stringify(result)).not.toContain('PRIVATE FOREIGN GUIDANCE');expect(JSON.stringify(result)).toContain('Be proactive with Kanvas');}
 const malformed=await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.flashcards.control',arguments:{sessionId:s.id}}});expect(malformed.isError).toBe(true);expect(JSON.stringify(malformed)).toContain('Only publish when I ask');
 const detail=(malformed.content as {text:string}[]).find(item=>item.text?.startsWith('{'));
 expect(detail).toBeDefined();expect(JSON.parse(detail!.text)).toEqual(malformed.structuredContent);
},30000);
