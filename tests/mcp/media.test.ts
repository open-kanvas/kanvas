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

describe("media coverage 1", () => {


describe("media contracts",()=>{
 let h!:Harness,client:Client|undefined;
 afterEach(async()=>{await client?.close().catch(()=>{});client=undefined;await h?.close();});
 const connect=async()=>{h=await startHarness({mcpProfile:'discovery'});const owner=await h.account(),{value}=await h.runtime.auth.issueToken(owner.user!.id,'Nov10 contract',['read','publish']);
  client=new Client({name:'nov10-contract',version:'9.9.9'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers:{Authorization:`Bearer ${value}`}}}));return owner;};
 const use=async(id:string,args:Record<string,unknown>)=>{const result=await client!.callTool({name:'kanvas_call',arguments:{operationId:id,arguments:args}});return {error:result.isError===true,body:result.structuredContent as Record<string,any>};};
 it('server information carries the real release, title, website and logo sizes; instructions open with the conduct',async()=>{
  await connect();const info=client!.getServerVersion() as Record<string,any>;
  expect(info).toMatchObject({name:'kanvas',title:'Kanvas',version:KANVAS_VERSION,websiteUrl:'https://open-kanvas.ai'});expect(info.version).not.toBe('1.0.0');
  expect(info.icons.map((icon:{sizes:string[]})=>icon.sizes[0])).toEqual(['48x48','192x192','512x512','any']);expect(String(info.description).length).toBeGreaterThan(20);
  expect(client!.getInstructions()?.startsWith(AGENT_CONDUCT)).toBe(true);
 });});
});
