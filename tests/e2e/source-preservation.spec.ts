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
import { operationRequest } from '../mcp/requests.js';
import { randomUUID } from 'node:crypto';
import { publicReference } from '../../src/server/mcp/operations';
import { mkdir } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { DisplayRecord } from '../../src/shared/types';
import { extendedExamples } from '../../src/shared/extended-templates';
import { sessionDetail } from './support';

test.describe("source preservation coverage 1", () => {


const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({version:1,template,data,...extra} as never) as ViewSpec;
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov14 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov14-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,canonical:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId:operationId(canonical),arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const fact=(text:string)=>({version:1,template:'fact',data:{text}});
const pane=(id:string,inner:Record<string,unknown>=fact(id))=>({id,view:inner});
const pie=(kind:'pie'|'donut')=>({version:1,template:'chart',data:{kind,series:[{name:'Share',points:[{x:'Alpha',y:40},{x:'Beta',y:30},{x:'Gamma',y:20},{x:'Delta',y:10}]}]}});

test('no view draws a source footer or a Source & info control (5134662f, 3f65409f)',async({page,diagnostics})=>{
 const {s,d,viewer}=await setup(page,'No source');diagnostics.allowHttp(page,`/api/sessions/${s}/submit`,400);
 const refused=await sessionApi(page,`/api/sessions/${s}/submit`,'POST',{requestId:'with-source',displayIds:[d.id],view:{version:1,template:'fact',data:{text:'x'},source:{title:'Somewhere'},showSource:true}});
 expect(refused.status).toBeGreaterThanOrEqual(400);
 const forecast=[{time:'2026-11-12T08:00:00+01:00',temperature:'6°',condition:'cloudy'}];
 for(const spec of [view('weather',{place:'Oslo',temperature:'6°',condition:'cloudy',forecast}),view('chart',{kind:'bar',series:[{name:'A',points:[{x:'Q1',y:3},{x:'Q2',y:5}]}]},{showControls:true,showCaption:true}),view('table',{columns:['A'],rows:[['one']]},{showControls:true})]){
  await shown(page,viewer,s,d.id,spec);
  await expect(viewer.locator('.view-information')).toHaveCount(0);await expect(viewer.getByText('Source & info')).toHaveCount(0);await expect(viewer.getByText('About this view')).toHaveCount(0);
 }
});
});

test.describe("source preservation coverage 2", () => {


const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
async function connect(page:Page,baseURL:string,sessionId?:string){
  const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable September acceptance',scopes:['read','publish'],...(sessionId?{sessionIds:[sessionId]}:{})});
  expect(issued.status).toBe(201);const client=new Client({name:'september-acceptance',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${issued.data!.token}`}}}));return client;
}
async function call<T=unknown>(client:Client,name:string,args:Record<string,unknown>):Promise<T>{const ref=publicReference(name);if(!ref)throw new Error('Missing public mapping');const result=await client.callTool(operationRequest({name:ref.tool,arguments:{operation:ref.operation,...args}}));expect(result.isError,`${name} succeeds`).not.toBe(true);return (result.structuredContent as {data:T}).data;}
async function setup(page:Page){await register(page);const sessionId=await createSession(page,'September display lab'),display=await createDisplay(page,sessionId,'Receiving screen');return {sessionId,display};}
async function painted(page:Page,sessionId:string,displayId:string,template:string){return waitForDisplay(page,sessionId,displayId,d=>d.view?.template===template&&d.appliedRevision===d.revision&&d.revision>0);}

test('new display-only layouts paint exact source data on both screen sizes',async({page},info)=>{
  test.setTimeout(180000);const {sessionId,display}=await setup(page),viewer=await openViewer(page,sessionId,display.id);await viewer.bringToFront();
  const templates=['timeline','itinerary','product','weather','profile','kpi','quote','recipe','menu','leaderboard','status'] as const;
  await mkdir(info.outputPath('visuals'),{recursive:true});
  for(const template of templates){
    const data=structuredClone(extendedExamples[template]);
    if(template==='kpi')data.items=[{label:'Exact source',value:'9007199254740993.123456789',delta:'+0.00001',trend:'up'},...(data.items as unknown[])];
    await publishPrepared(page,sessionId,[display.id],{version:1,template,title:`Source ${template}`,data});await painted(page,sessionId,display.id,template);
    await expect(viewer.locator(`.template-${template}`)).toBeVisible();
    const expectedText:Record<string,string>={product:'Studio headphones',menu:'Flat white',recipe:'Heat the water.',status:'All systems operational',itinerary:'Waterfront walk',weather:'18°'};if(expectedText[template])await expect(viewer.getByText(expectedText[template],{exact:true}).first()).toBeVisible();
    if(template==='kpi')await expect(viewer.locator('.kpi-content')).toContainText('9007199254740993.123456789');
    if(template==='leaderboard')expect(await viewer.locator('.leaderboard-content h2').allTextContents()).toEqual(['North','South']);
    const geometry=await viewer.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));expect(geometry.scroll).toBeLessThanOrEqual(geometry.width+2);
    await viewer.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    await viewer.screenshot({path:`${info.outputPath('visuals')}/${info.project.name}-${template}.png`});
  }
});
});
