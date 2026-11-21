import { afterEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { startHarness } from '../core/harness.js';
import type { Harness } from '../core/harness.js';
import { TASK_MAPPING } from './operation-fixtures.js';
import { CANONICAL_TOOLS } from '../../src/server/mcp/canonical.js';
import { operationId } from '../../src/server/mcp/operations.js';
import { AGENT_CONDUCT } from '../../src/shared/philosophy.js';
import { RHYTHM_NUDGE } from '../../src/shared/philosophy.js';
import { KANVAS_VERSION } from '../../src/shared/version.js';

describe("template contracts coverage 1", () => {


describe("template contracts contracts",()=>{
 let h!:Harness,client:Client|undefined;
 afterEach(async()=>{await client?.close().catch(()=>{});client=undefined;await h?.close();});
 const connect=async()=>{h=await startHarness({mcpProfile:'discovery'});const owner=await h.account(),{value}=await h.runtime.auth.issueToken(owner.user!.id,'Nov10 contract',['read','publish']);
  client=new Client({name:'nov10-contract',version:'9.9.9'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers:{Authorization:`Bearer ${value}`}}}));return owner;};
 const use=async(id:string,args:Record<string,unknown>)=>{const result=await client!.callTool({name:'kanvas_call',arguments:{operationId:id,arguments:args}});return {error:result.isError===true,body:result.structuredContent as Record<string,any>};};
 it('a failed publish explains itself, and limit and needs_template answers are structured',async()=>{
  const owner=await connect(),session=await owner.session('Errors'),display=await owner.display(session.id);
  const wrong=await use('kanvas.submit',{requestId:'wrong-list',sessionId:session.id,displayIds:[display.id],view:{version:1,template:'list',data:{items:[{title:'A',text:'B'}]}}});
  expect(wrong.error).toBe(true);expect(wrong.body.error.issues[0]).toMatchObject({problem:'Unsupported field.',allowedFields:expect.arrayContaining(['text'])});expect(wrong.body.error.example).toBeTruthy();
  const loose=await use('kanvas.submit',{requestId:'loose',sessionId:session.id,displayIds:[display.id],intent:'compare the three options',context:'Option A costs 100 and takes two days. Option B costs 80 and takes four days. Option C costs 140 and takes one day. The team prefers speed but the budget is tight this quarter.'});
  expect(loose.error).toBe(false);expect(loose.body.data.status).toBe('needs_template');expect(loose.body.data.candidates).toHaveLength(3);
  const search=await client!.callTool({name:'kanvas_discover',arguments:{catalog:'templates',action:'search',query:'who sits where at the wedding dinner'}});
  const hits=(search.structuredContent as {data:{results:{id:string;example?:unknown}[]}}).data.results;expect(hits[0].id).toBe('kanvas.template.seat-map');expect(hits[0].example).toBeTruthy();
  const listed=await client!.callTool({name:'kanvas_discover',arguments:{catalog:'tools',action:'list',prefix:'kanvas.display.'}});expect(JSON.stringify(listed.content)).toContain('kanvas.display.register');
 },30000);});
});
