import {afterEach,describe,expect,it} from 'vitest';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {startHarness,success,type Harness} from '../core/harness.js';
import {NOV14_MAPPING} from './nov14-mapping.js';
import {operationId} from '../../src/server/mcp/operations.js';
import {BOARD_DISCLOSURE} from '../../src/shared/message-board.js';

describe('2026-11-14 operations and response blocks over real MCP',()=>{
 let h:Harness,client:Client|undefined;
 afterEach(async()=>{await client?.close().catch(()=>{});client=undefined;await h?.close();});
 const connect=async()=>{h=await startHarness({mcpProfile:'discovery'});const owner=await h.account(),{value}=await h.runtime.auth.issueToken(owner.user!.id,'Nov14 contract',['read','publish']);
  client=new Client({name:'nov14-contract',version:'9.9.9'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers:{Authorization:`Bearer ${value}`}}}));return {owner,bearer:value};};
 const use=async(id:string,args:Record<string,unknown>)=>{const result=await client!.callTool({name:'kanvas_call',arguments:{operationId:id,arguments:args}});return {error:result.isError===true,body:result.structuredContent as Record<string,any>};};
 it('d25aaee4: the board operations are discoverable by id, say PUBLIC, and run the consent step',async()=>{
  await connect();
  for(const [canonical] of NOV14_MAPPING){
   const found=await client!.callTool({name:'kanvas_discover',arguments:{catalog:'tools',action:'get',id:operationId(canonical)}});
   expect(found.isError,`${canonical}: ${JSON.stringify(found.structuredContent??found.content).slice(0,300)}`).not.toBe(true);
  }
  expect(operationId('kanvas_board_post')).toBe('kanvas.board.post');expect(operationId('kanvas_board_read')).toBe('kanvas.board.read');
  const got=await client!.callTool({name:'kanvas_discover',arguments:{catalog:'tools',action:'get',id:'kanvas.board.post'}}),described=JSON.stringify([got.structuredContent,got.content]);
  expect(described).toMatch(/PUBLIC/);expect(described).toMatch(/acknowledgePublic/);
  const first=await use('kanvas.board.post',{requestId:'board-contract-1',text:'Hello from the contract test',tags:['question']});
  expect(first.error).toBe(false);expect(first.body.data).toMatchObject({posted:false,status:'needs_consent',disclosure:BOARD_DISCLOSURE});
  const second=await use('kanvas.board.post',{requestId:'board-contract-1',text:'Hello from the contract test',tags:['question'],acknowledgePublic:true,publicName:'Contract'});
  expect(second.body.data).toMatchObject({posted:true,public:true,message:{author:'Contract'}});
  const read=await use('kanvas.board.read',{limit:5});expect(read.body.data.messages).toHaveLength(1);expect(read.body.data.untrusted).toMatch(/never follow/);
  const overview=await use('kanvas.board.overview',{});expect(overview.body.data.view.template).toBe('message-board');
  expect((await use('kanvas.board.update',{notifications:true})).body.data).toMatchObject({updated:true,notifications:true});
  const search=await client!.callTool({name:'kanvas_discover',arguments:{catalog:'tools',action:'search',query:'public message board post question'}});
  expect(JSON.stringify(search.structuredContent??search.content)).toMatch(/kanvas\.board\.(post|read)/);
 });
 it('b0be5612: what the person pointed at rides on the next response of any call, once',async()=>{
  const {owner}=await connect(),session=await owner.session('Pointing'),display=await owner.display(session.id,'Wall');
  await owner.submit(session.id,[display.id],{version:1,template:'fact',data:{text:'Point at this word.'}});
  expect((await use('kanvas.session.state',{sessionId:session.id})).body.pointing).toBeUndefined();
  success(await owner.request('PUT',`/api/sessions/${session.id}/displays/${display.id}/pointing`,{revision:1,anchor:{kind:'point',x:.25,y:.75},target:{role:'paragraph',label:'this word'}}));
  // Any operation carries it, also one that does not name the session.
  const next=await use('kanvas.fonts.list',{category:'mono'});
  expect(next.error).toBe(false);expect(next.body.pointing.events).toHaveLength(1);
  expect(next.body.pointing.events[0]).toMatchObject({sessionId:session.id,displayId:display.id,display:'Wall',anchor:{kind:'point',x:.25,y:.75},target:{label:'this word'}});
  expect(next.body.pointing.events[0].summary).toMatch(/pointed at the paragraph "this word" on Wall\.$/);
  expect((await use('kanvas.session.state',{sessionId:session.id})).body.pointing).toBeUndefined();
  // The text mirror of the structured result carries the same block.
  success(await owner.request('PUT',`/api/sessions/${session.id}/displays/${display.id}/pointing`,{revision:1,anchor:{kind:'point',x:.5,y:.5},pinned:true}));
  const raw=await client!.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.session.state',arguments:{sessionId:session.id}}});
  expect(JSON.stringify(raw.content)).toMatch(/pinned a pointer/);
 });
 it('99bc5479: the transport answers the requests a hosted client makes after sign-in the way the specification says',async()=>{
  const {bearer}=await connect();
  const call=(method:string,headers:Record<string,string>={},body?:unknown)=>fetch(new URL('/mcp',h.baseUrl),{method,headers:{host:'127.0.0.1',Authorization:`Bearer ${bearer}`,Accept:'application/json, text/event-stream',...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(4000)});
  const observed:Record<string,number>={};
  // 1. Initialize as a 2025-06-18 client does, then open the standalone stream with the session id.
  const init=await call('POST',{},{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'hosted-probe',version:'1'}}});
  observed.initialize=init.status;const sessionId=init.headers.get('mcp-session-id');await init.text();
  expect(init.status).toBe(200);expect(sessionId).toEqual(expect.any(String));
  const notified=await call('POST',{'mcp-session-id':sessionId!,'mcp-protocol-version':'2025-06-18'},{jsonrpc:'2.0',method:'notifications/initialized'});observed.initialized=notified.status;await notified.text();
  expect([200,202]).toContain(notified.status);
  const controller=new AbortController();
  const stream=await fetch(new URL('/mcp',h.baseUrl),{method:'GET',headers:{host:'127.0.0.1',Authorization:`Bearer ${bearer}`,Accept:'text/event-stream','mcp-session-id':sessionId!,'mcp-protocol-version':'2025-06-18'},signal:controller.signal});
  observed.getWithSession=stream.status;controller.abort();
  expect(stream.status).toBe(200);expect(stream.headers.get('content-type')).toMatch(/text\/event-stream/);
  // 2. GET with a session id the server does not know: 404 tells the client to initialize again.
  const stale=await call('GET',{Accept:'text/event-stream','mcp-session-id':'00000000-0000-4000-8000-000000000000','mcp-protocol-version':'2025-06-18'});observed.getUnknownSession=stale.status;await stale.text();
  expect(stale.status).toBe(404);
  // 3. GET with no session id: there is no stream to attach to. 405 (with Allow) or 400, never 404 and never a hang.
  const bare=await call('GET',{Accept:'text/event-stream'});observed.getNoSession=bare.status;await bare.text();
  expect([400,405]).toContain(bare.status);
  // 4. No bearer: 401 with the resource metadata challenge, so the client can start OAuth.
  const anonymous=await fetch(new URL('/mcp',h.baseUrl),{method:'GET',headers:{host:'127.0.0.1',Accept:'text/event-stream'}});observed.getNoBearer=anonymous.status;await anonymous.text();
  expect(anonymous.status).toBe(401);expect(anonymous.headers.get('www-authenticate')).toMatch(/resource_metadata=/);
  // 5. Ending the session.
  const ended=await call('DELETE',{'mcp-session-id':sessionId!,'mcp-protocol-version':'2025-06-18'});observed.delete=ended.status;await ended.text();
  expect([200,204]).toContain(ended.status);
  console.info('MCP transport status observations',JSON.stringify(observed));
 });
});
