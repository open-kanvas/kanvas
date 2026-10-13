import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {Client as LegacyClient} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport as LegacyTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {afterEach,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {startHarness,success,type Harness} from '../core/harness';
let h:Harness,client:Client|LegacyClient;
afterEach(async()=>{await client?.close();await h?.close();});
it.each(['modern','legacy'])('%s advertises only two tools and executes flashcard voice operations and diagnostics',async era=>{
 h=await startHarness({mcpProfile:'twelve'});const owner=await h.account(),s=await owner.session(),d=await owner.display(s.id),second=await owner.display(s.id);
 const token=await h.runtime.auth.issueToken(owner.user!.id,'Disposable feedback regression',['read','publish']),headers={Authorization:'Bearer '+token.value};
 if(era==='modern'){client=new Client({name:'feedback-current',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers}}));}
 else{client=new LegacyClient({name:'feedback-legacy',version:'1'});await client.connect(new LegacyTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers}}));}
 expect((await client.listTools()).tools.map(t=>t.name).sort()).toEqual(['kanvas_call','kanvas_discover']);
 const call=async(operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});expect(result.isError,JSON.stringify(result.structuredContent)).not.toBe(true);return(result.structuredContent as {data:any}).data;};
 const discovery=await client.callTool({name:'kanvas_discover',arguments:{catalog:'templates',action:'get',id:'kanvas.template.flashcards'}});expect(discovery.isError).not.toBe(true);expect(JSON.stringify(discovery)).toContain('acceptedAnswers');
 await owner.submit(s.id,[d.id],{version:1,template:'flashcards',data:{mode:'test',cards:[{id:'hola',prompt:'Translate hola',answer:'hello'}]}});
 const list=await call('kanvas.flashcards.read',{sessionId:s.id}),key=list.decks[0].id;
 const read=await call('kanvas.flashcards.read',{sessionId:s.id,deckId:key});
 const answered=await call('kanvas.flashcards.control',{sessionId:s.id,deckId:key,displayId:d.id,expectedRevision:1,expectedDeckRevision:read.revision,requestId:'voice',cardId:'hola',action:'answer',response:'hello'});
 expect(answered.deck.view.data.responses[0].result).toBe('correct');
 await call('kanvas.flashcards.show',{sessionId:s.id,deckId:key,displayId:second.id,expectedRevision:0,requestId:'show'});
 expect((await owner.detail(s.id)).displays.find(x=>x.id===second.id)!.view!.data.revealed).toBe(true);
 const supportRef=randomUUID();success(await owner.request('POST','/api/diagnostics',{supportRef,windowId:randomUUID(),events:[{event:'startup'}]}));
 expect((await call('kanvas.diagnostics.read',{supportRef})).timeline).toHaveLength(1);
},30000);
