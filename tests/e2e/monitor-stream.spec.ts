import type { Page } from '@playwright/test';
import { createDisplay } from './support';
import { createSession } from './support';
import { expect } from './support';
import { openViewer } from './support';
import { publishPrepared } from './support';
import { register } from './support';
import { sessionApi } from './support';
import { test } from './support';
import { waitForDisplay } from './support';
import { validateView } from '../../src/shared/view-schemas';
import { operationId } from '../../src/server/mcp/operations';
import type { ViewSpec } from '../../src/shared/types';

test.describe("monitor stream coverage 1", () => {


const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({version:1,template,data,...extra} as never) as ViewSpec;
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov14 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov14-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,canonical:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId:operationId(canonical),arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const fact=(text:string)=>({version:1,template:'fact',data:{text}});
const pane=(id:string,inner:Record<string,unknown>=fact(id))=>({id,view:inner});
const pie=(kind:'pie'|'donut')=>({version:1,template:'chart',data:{kind,series:[{name:'Share',points:[{x:'Alpha',y:40},{x:'Beta',y:30},{x:'Gamma',y:20},{x:'Delta',y:10}]}]}});

test('a display bound to a monitor stream follows it, pairs calls, redacts and reports its end (5dc1b2f7)',async({page,baseURL})=>{
 const {s,d,viewer}=await setup(page,'Live stream');const client=await mcp(page,baseURL!);
 try{
  const stream=(await use(client,'kanvas_monitor_stream_create',{sessionId:s,name:'Build agents',requestId:'e2e-stream'})).structured.data;
  const send=(body:Record<string,unknown>)=>page.request.post(stream.postUrl,{data:body,headers:{'user-agent':'Python-urllib/3.12'}});
  const published=await shown(page,viewer,s,d.id,view('monitor-stream',{streamId:stream.streamId,title:'Agents at work'}));
  const root=viewer.locator('.viewer-candidate .monitor-stream');
  await expect(root).toHaveAttribute('data-stream-state','active');await expect(root.locator('.monitor-stream-state')).toHaveText('Live');await expect(root).toContainText('Waiting for the first event');
  // Events arrive from outside. Nothing is republished: the revision does not move.
  expect((await send({source:'agent-1',event:'PreToolUse',tool:'Bash',target:'sleep 2',callId:'c1'})).status()).toBe(202);
  await expect(root.locator('.stream-row')).toHaveCount(1);await expect(root.locator('.stream-row').first()).toHaveAttribute('data-row-status','running');
  expect((await send({source:'agent-1',event:'PostToolUse',tool:'Bash',target:'sleep 2',callId:'c1'})).status()).toBe(202);
  await expect(root.locator('.stream-row').first()).toHaveAttribute('data-row-status','completed');await expect(root.locator('.stream-row')).toHaveCount(1);
  expect((await send({source:'agent-1',event:'PreToolUse',tool:'Bash',target:'pytest',callId:'c2'})).status()).toBe(202);
  expect((await send({source:'agent-2',event:'Stop',note:`posted to ${stream.postUrl}`})).status()).toBe(202);
  expect((await send({source:'agent-1',event:'Stop'})).status()).toBe(202);
  await expect(root.locator('.stream-row')).toHaveCount(4);
  await expect(root.locator('.stream-row[data-row-status="unknown"]')).toHaveCount(1);await expect(root.locator('.stream-row[data-row-status="unknown"]')).toContainText('no result');
  await expect(root.locator('[data-counter="received"]')).toHaveText('5');
  await expect(root).toContainText('/in/[redacted]');expect(await root.innerText()).not.toContain(new URL(stream.postUrl).pathname.split('/').pop()!);
  await expect(root.locator('.monitor-stream-sources li')).toHaveCount(2);
  expect((await waitForDisplay(page,s,d.id,x=>x.revision>0)).revision).toBe(published.revision);
  // The agent filters with the normal selection and annotates; rows still come from the stream.
  await shown(page,viewer,s,d.id,view('monitor-stream',{streamId:stream.streamId,note:'Nightly build'},{selection:{where:[{field:'source',op:'eq',value:'agent-2'}]}}));
  await expect(root.locator('.stream-row')).toHaveCount(1);await expect(root.locator('.monitor-stream-note')).toHaveText('Nightly build');
  // Revocation is said on screen.
  await use(client,'kanvas_monitor_stream_revoke',{sessionId:s,streamId:stream.streamId});
  await expect(root).toHaveAttribute('data-stream-state','revoked');await expect(root.locator('.monitor-stream-ended')).toContainText('revoked');await expect(root.locator('.stream-row')).toHaveCount(0);
  expect((await send({source:'agent-1',event:'late'})).status()).toBe(410);
 }finally{await client.close();}
});
});
