import { profileInstructions } from '../../src/server/mcp/profile-guidance.js';
import { FIRST_DISPLAY_LINK_GUIDANCE } from '../../src/server/mcp/viewer-link-guidance.js';
import { describe } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { operationCatalog } from '../../src/server/mcp/discovery.js';
import { templateCatalog } from '../../src/server/mcp/discovery.js';
import { helpCatalog } from '../../src/server/mcp/discovery.js';
import { discoveryCatalog } from '../../src/server/mcp/discovery.js';
import { discoveryToolDefinitions } from '../../src/server/mcp/discovery.js';
import { workflowIds } from '../../src/server/mcp/workflow-guidance.js';
import { toolSuccess } from '../../src/server/mcp/results.js';
import { toolFailure } from '../../src/server/mcp/results.js';
import { resolveToolCall } from '../../src/server/mcp/catalog.js';
import { InputError } from '../../src/server/input-errors.js';
import { afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { startHarness } from '../core/harness.js';
import { success } from '../core/harness.js';
import type { Harness } from '../core/harness.js';
import { BOARD_MAPPING } from './operation-fixtures.js';
import { operationId } from '../../src/server/mcp/operations.js';
import { BOARD_DISCLOSURE } from '../../src/shared/message-board.js';

describe("pointing coverage 1", () => {
    const context = { principal: { userId: 'test-account', scopes: ['read', 'publish'] } };
    describe('contextual discovery and first contact', () => {
        
        it('invalid submit returns an exact operation pointer and bounded usable shape without copying submitted private fields', () => {
            const bad = resolveToolCall('discovery', 'kanvas_call', { operationId: 'kanvas.submit', arguments: { displayId: 'PRIVATE_SCREEN_SECRET', template: 'table', data: { title: 'PRIVATE_TITLE_SECRET' } } });
            const failed = toolFailure(bad.error, undefined, 'discovery', bad.canonicalName);
            expect(failed.isError).toBe(true);
            expect(failed.structuredContent).toMatchObject({ error: { schemaTool: 'kanvas_discover', schemaArguments: { catalog: 'tools', action: 'get', id: 'kanvas.submit' } } });
            expect(failed.structuredContent).toMatchObject({ recovery: { operationId: 'kanvas.submit', shape: expect.stringContaining('title belongs beside') } });
            expect(JSON.stringify(failed)).not.toMatch(/PRIVATE_SCREEN_SECRET|PRIVATE_TITLE_SECRET/);
            expect(toolFailure(new InputError([{ path: 'view.data', problem: 'Unsupported fields' }], 'table'), undefined, 'discovery', "kanvas.submit").structuredContent).toMatchObject({ recovery: { template: { arguments: { id: 'kanvas.template.table' } } } });
        });
    });
});

describe("pointing coverage 2", () => {


describe("pointing contracts",()=>{
 let h!:Harness,client:Client|undefined;
 afterEach(async()=>{await client?.close().catch(()=>{});client=undefined;await h?.close();});
 const connect=async()=>{h=await startHarness({mcpProfile:'discovery'});const owner=await h.account(),{value}=await h.runtime.auth.issueToken(owner.user!.id,'Nov14 contract',['read','publish']);
  client=new Client({name:'nov14-contract',version:'9.9.9'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers:{Authorization:`Bearer ${value}`}}}));return {owner,bearer:value};};
 const use=async(id:string,args:Record<string,unknown>)=>{const result=await client!.callTool({name:'kanvas_call',arguments:{operationId:id,arguments:args}});return {error:result.isError===true,body:result.structuredContent as Record<string,any>};};
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
 });});
});
