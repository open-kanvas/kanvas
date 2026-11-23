import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {Client as LegacyClient} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport as LegacyTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {afterEach,expect,it} from 'vitest';
import {startHarness,type Harness} from '../core/harness';
import {guidanceConnectionId} from '../../src/server/mcp/connection-identity';
import type {Request} from 'express';
import {DEFAULT_AGENT_GUIDANCE} from '../../src/server/agent-guidance';
let h:Harness;let clients:(Client|LegacyClient)[]=[];
afterEach(async()=>{await Promise.all(clients.map(c=>c.close()));clients=[];await h?.close();});
it.each(['legacy','modern-header','modern-meta'])('%s isolates repetition between connections with the same account, token and agent',async era=>{
 h=await startHarness();const owner=await h.account(),s=await owner.session(),s2=await owner.session(),p={userId:owner.user!.id};
 const token=await h.runtime.auth.issueToken(p.userId,'Shared agent',['read','publish']);
 const make=async()=>{const id=randomUUID(),headers:Record<string,string>={Authorization:'Bearer '+token.value};if(era==='modern-header')headers['Kanvas-Connection-Id']=id;
  const c=era==='legacy'?new LegacyClient({name:'same-agent',version:'1'}):new Client({name:'same-agent',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});clients.push(c);
  if(era==='legacy')await (c as LegacyClient).connect(new LegacyTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers}}));else await (c as Client).connect(new StreamableHTTPClientTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers}}));
  return async(operationId:string,args:Record<string,unknown>={sessionId:s.id})=>{const r=await c.callTool({name:'kanvas_call',arguments:{operationId,arguments:args},...(era==='modern-meta'?{_meta:{'kanvas/connectionId':id}}:{})});expect(r.isError,JSON.stringify(r)).not.toBe(true);return r as any;};};
 const a=await make(),b=await make();
 const state=(call:Awaited<ReturnType<typeof make>>,sessionId=s.id)=>call('kanvas.session.state',{sessionId});
 const first=await state(a),second=await state(a);expect(first.structuredContent.firstContact).toBeDefined();expect(second.structuredContent.firstContact).toBeUndefined();
 expect(second.structuredContent.agentGuidance.levels[0].text).toBe(DEFAULT_AGENT_GUIDANCE);expect(second.structuredContent.data).not.toHaveProperty('mode');
 expect((await state(b)).structuredContent.firstContact).toBeDefined();
 const saved=await h.runtime.service.guidance.read(p,{scope:'user'});
 await a('kanvas.client.context.update',{sessionId:s.id,clientDetails:{guidance:'concise'}});
 const reduced=await state(a);expect(reduced.structuredContent.agentGuidance).toMatchObject({unchanged:true});
 expect((await state(b)).structuredContent.agentGuidance.levels[0].text).toBe(DEFAULT_AGENT_GUIDANCE);
 expect(await h.runtime.service.guidance.read(p,{scope:'user'})).toEqual(saved);
 const savedPace=await a('kanvas.guidance.set',{scope:'session',sessionId:s.id,text:'Stop putting things up unless I ask.',expectedRevision:0,requestId:'requested-pace'});expect(savedPace.structuredContent.agentGuidance).toMatchObject({changed:true,levels:expect.arrayContaining([expect.objectContaining({text:'Stop putting things up unless I ask.'})])});
 const after=await state(a);expect(after.structuredContent.agentGuidance.unchanged).toBe(true);
 expect((await state(b)).structuredContent.agentGuidance.levels).toEqual(expect.arrayContaining([expect.objectContaining({scope:'session',text:'Stop putting things up unless I ask.'})]));
 const changed=await state(a,s2.id);expect(changed.structuredContent.agentGuidance.changed).toBe(true);expect(changed.structuredContent.agentGuidance.levels).toHaveLength(1);
 expect((await state(a,s2.id)).structuredContent.agentGuidance.unchanged).toBe(true);
 await a('kanvas.client.context.update',{sessionId:s.id,clientDetails:{guidance:'full'}});
 expect((await state(a)).structuredContent.agentGuidance.levels).toHaveLength(2);
 expect((await state(a)).structuredContent.agentGuidance.levels).toHaveLength(2);
 const c=await make();expect((await state(c)).structuredContent.agentGuidance.levels).toHaveLength(2);expect((await state(c)).structuredContent.agentGuidance.levels).toHaveLength(2);
 const texts=(r:any)=>r.content.filter((x:any)=>x.type==='text').map((x:any)=>x.text).join('\n');
 expect(JSON.parse(texts(reduced))).toEqual(reduced.structuredContent);
 if(process.env.KANVAS_GUIDANCE_EVIDENCE_DIR){const fullText=texts(second),conciseText=texts(reduced);writeFileSync(process.env.KANVAS_GUIDANCE_EVIDENCE_DIR+'/'+era+'-responses.json',JSON.stringify({full:{text:fullText,characters:fullText.length,utf8Bytes:Buffer.byteLength(fullText),approxTokens:Math.ceil(fullText.length/4)},concise:{text:conciseText,characters:conciseText.length,utf8Bytes:Buffer.byteLength(conciseText),approxTokens:Math.ceil(conciseText.length/4)},tokenMethod:'Approximation: ceil(characters/4); no model-specific tokenizer or inference used.'},null,2));}
},30000);
it('anonymous stateless connections cannot suppress another caller and saved text stays unchanged',async()=>{
 h=await startHarness();const owner=await h.account(),s=await owner.session(),token=await h.runtime.auth.issueToken(owner.user!.id,'Same stateless agent',['read','publish']);
 const client=new Client({name:'anonymous',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});clients.push(client);await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers:{Authorization:'Bearer '+token.value}}}));
 const call=async(operationId:string,args:Record<string,unknown>)=>await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}}) as any;
 const beforeSessions=await h.runtime.service.sessions({userId:owner.user!.id});
 const noCreate=await call('kanvas.session.create',{name:'Must not create',clientDetails:{guidance:'concise'}});expect(noCreate.isError).toBe(true);expect(await h.runtime.service.sessions({userId:owner.user!.id})).toEqual(beforeSessions);
 const original=await h.runtime.service.guidance.read({userId:owner.user!.id},{scope:'user'});
 const denied=await call('kanvas.client.context.update',{sessionId:s.id,clientDetails:{guidance:'concise'}});expect(denied.isError).toBe(true);expect(denied.structuredContent.error.code).toBe('CONNECTION_ID_REQUIRED');expect(denied.structuredContent.error.message).toContain('Kanvas-Connection-Id');
 for(let n=0;n<2;n++){const r=await call('kanvas.session.state',{sessionId:s.id});expect(r.structuredContent.agentGuidance.levels[0].text).toBe(DEFAULT_AGENT_GUIDANCE);}
 expect(await h.runtime.service.guidance.read({userId:owner.user!.id},{scope:'user'})).toEqual(original);
 expect(await h.runtime.store.list('guidance-preference')).toHaveLength(0);
 expect(await h.runtime.store.list('agent-connection')).toHaveLength(0);
},30000);


it('connection identity accepts bounded host ids, separates namespaces and never falls back to account or agent',()=>{
 const request=(headers:Record<string,string>)=>({get:(name:string)=>headers[name.toLowerCase()]}) as Request;
 expect(guidanceConnectionId(request({}),undefined,'one')).toBe('request:one');
 expect(guidanceConnectionId(request({}),undefined,'two')).toBe('request:two');
 for(const value of ['short','x'.repeat(129),'contains whitespace id',42])expect(guidanceConnectionId(request({}),{'kanvas/connectionId':value},'one')).toBe('request:one');
 expect(guidanceConnectionId(request({'kanvas-connection-id':'valid-connection-one'}),undefined,'one')).toBe('client:valid-connection-one');
 expect(guidanceConnectionId(request({}),{'kanvas/connectionId':'valid-connection-two'},'one')).toBe('client:valid-connection-two');
 expect(guidanceConnectionId(request({'mcp-session-id':'session-id','kanvas-connection-id':'valid-connection-one'}),undefined,'one')).toBe('mcp:session-id');
});
