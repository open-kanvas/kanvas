import { operationRequest } from '../mcp/requests.js';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Page } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import type { ViewSpec } from '../../src/shared/types';
import { createDisplay } from './support';
import { createSession } from './support';
import { expect } from './support';
import { isolatedContext } from './support';
import { openViewer } from './support';
import { publishPrepared } from './support';
import { register } from './support';
import { sessionApi } from './support';
import { sessionDetail } from './support';
import { tab } from './support';
import { test } from './support';
import { viewerPath } from './support';
import { waitForDisplay } from './support';
import { publicReference } from '../../src/server/mcp/operations';
import type { DisplayRecord } from '../../src/shared/types';
import type { InteractionRecord } from '../../src/shared/types';
import type { UpdateRecord } from '../../src/shared/types';
import { validateView } from '../../src/shared/view-schemas';
import { operationId } from '../../src/server/mcp/operations';

test.describe("overview coverage 1", () => {


async function setup(page:Page,info:TestInfo,baseURL:string){
  await register(page);const sessionId=await createSession(page,'Afternoon release acceptance'),display=await createDisplay(page,sessionId,'Receiving screen'),viewer=await openViewer(page,sessionId,display.id);
  const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable release client',scopes:['read','publish']});expect(issued.status).toBe(201);
  const options={requestInit:{headers:{Authorization:`Bearer ${issued.data!.token}`}}},client=info.project.name.startsWith('phone')?new LegacyClient({name:'afternoon-legacy',version:'1'}):new Client({name:'afternoon-modern',version:'1'});
  if(client instanceof Client)await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),options));else await client.connect(new LegacyTransport(new URL('/mcp',baseURL),options));
  const call=async<T=any>(tool:string,operation:string,args:Record<string,unknown>={})=>{const result=await client.callTool(operationRequest({name:tool,arguments:{operation,...args}}));expect(result.isError,`${tool} ${operation} succeeds`).not.toBe(true);return (result.structuredContent as {data:T}).data;};
  const current=()=>waitForDisplay(page,sessionId,display.id,d=>d.revision>0&&d.appliedRevision===d.revision);
  const show=async(view:ViewSpec)=>{await publishPrepared(page,sessionId,[display.id],view);return current();};
  const nav=async(navigation:unknown)=>{const d=await current();return call('kanvas_control','navigation.control',{sessionId,displayId:display.id,requestId:randomUUID(),expectedRevision:d.revision,navigation});};
  return {sessionId,display,viewer,client,call,current,show,nav};
}
async function photo(page:Page,info:TestInfo,name:string){const directory=info.outputPath('visuals');await mkdir(directory,{recursive:true});await page.screenshot({path:`${directory}/${info.project.name}-${name}.png`,animations:'disabled'});}

test('overview displays responsive retained previews and website grid offers labelled static fallback without claiming remote verification',async({page,baseURL,context},info)=>{
  const s=await setup(page,info,baseURL!);
  try{
    for(let i=1;i<=4;i++)await s.show({version:1,template:'fact',title:`Retained view ${i}`,data:{text:`Exact content ${i}`}});
    await s.show({version:1,template:'overview',data:{showPreviews:true,showMetadata:true}});await expect(s.viewer.locator('.retained-overview-grid>article')).toHaveCount(4);
    const geometry=await s.viewer.locator('.retained-overview-grid').evaluate(el=>({columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,rows:getComputedStyle(el).gridTemplateRows.split(' ').length,height:el.getBoundingClientRect().height,viewport:innerHeight}));expect(geometry.columns).toBeGreaterThanOrEqual(1);expect(geometry.rows).toBe(Math.ceil(4/geometry.columns));expect(geometry.height).toBeGreaterThan(geometry.viewport*.6);
    await expect(s.viewer.locator('.overview-card-caption')).toHaveCount(4);await expect(s.viewer.getByRole('checkbox',{name:'Show overview metadata'})).toHaveCount(0);await s.show({version:1,template:'overview',data:{showPreviews:true,showMetadata:false}});await expect(s.viewer.locator('.overview-card-caption>span,.overview-card-caption>time')).toHaveCount(0);await expect(s.viewer.locator('.retained-preview')).toHaveCount(4);await photo(s.viewer,info,'overview');
    await context.route('https://example.com/grid-fixture/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><h1>Public grid page ${new URL(route.request().url()).pathname.split('/').at(-1)}</h1>`}));
    // Browser UX fixture. Enforced-policy detection and an actual isolated
    // Chromium capture are tested separately in core/website-preview.test.ts.
    await context.route('**/website-preview',route=>route.fulfill({json:{data:route.request().postDataJSON().page===2?{status:'static',imageUrl:'/test-static-preview.svg',capturedAt:'2026-09-16T14:00:00Z',remoteContentVerified:false,reason:'The publisher blocks framing; showing an anonymous static screenshot.'}:{status:'interactive',remoteContentVerified:false}}}));
    await context.route('**/test-static-preview.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480"><rect width="720" height="480" fill="#123"/><text x="30" y="80" fill="white" font-size="28">Static public page fixture</text></svg>'}));
    const original=await s.show({version:1,template:'iframe',data:{layout:'grid',pages:Array.from({length:4},(_,i)=>({title:`Website ${i+1}`,url:`https://example.com/grid-fixture/${i+1}`}))}});await expect(s.viewer.locator('.iframe-cell')).toHaveCount(4);await expect(s.viewer.locator('.iframe-grid')).toBeVisible();await expect(s.viewer.locator('.iframe-static')).toContainText('not interactive');await expect(s.viewer.locator('.iframe-static img')).toBeVisible();expect(original.remoteContent?.verified).toBe(false);await photo(s.viewer,info,'website-grid');
    await expect(s.viewer.getByRole('navigation',{name:'Website navigation'})).toHaveCount(0);const paged=await s.show({...original.view!,data:{...original.view!.data,layout:'paged'}});await expect(s.viewer.locator('.iframe-cell')).toHaveCount(1);await s.nav({action:'page',page:2});await expect(s.viewer.frameLocator('.iframe-stage iframe').getByRole('heading',{name:'Public grid page 2'})).toBeVisible();expect((await s.current()).view).toEqual(paged.view);
  }finally{await s.client.close();}
});
});

test.describe("overview coverage 2", () => {


async function setup(page:Page,info:TestInfo){await register(page);const s=await createSession(page,'Evening feedback verification'),d=await createDisplay(page,s,'Test surface'),viewer=await openViewer(page,s,d.id);if(info.project.name.startsWith('phone'))await viewer.setViewportSize({width:443,height:823});await viewer.bringToFront();return {s,d,viewer};}
async function connect(page:Page,baseURL:string,s:string){const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable evening acceptance',scopes:['read','publish'],sessionIds:[s]});expect(issued.status).toBe(201);const client=new Client({name:'evening-acceptance',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${issued.data!.token}`}}}));return client;}
async function call<T=unknown>(client:Client,name:string,args:Record<string,unknown>):Promise<T>{const ref=publicReference(name);if(!ref)throw new Error('Missing public mapping');const result=await client.callTool(operationRequest({name:ref.tool,arguments:{operation:ref.operation,...args}}));expect(result.isError,`${name} succeeds`).not.toBe(true);return (result.structuredContent as {data:T}).data;}
async function ready(page:Page,s:string,d:string,template?:string){return waitForDisplay(page,s,d,x=>(!template||x.view?.template===template)&&x.revision>0&&x.appliedRevision===x.revision);}
async function photo(viewer:Page,info:TestInfo,label:string){
  // Text exists before a staged candidate becomes the visible painted frame.
  // Capture the settled screen, not that deliberately hidden preparation stage.
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status','ready');
  await expect.poll(()=>viewer.locator('.viewer-shell').evaluate(el=>el.getAttribute('data-revision')===el.getAttribute('data-rendered-revision'))).toBe(true);
  await expect(viewer.locator('.viewer-candidate')).toBeVisible();
  if(label==='procedure')await expect(viewer.locator('.viewer-candidate .procedure-instruction')).toBeInViewport();
  await viewer.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await mkdir(info.outputPath('visuals'),{recursive:true});await viewer.screenshot({path:`${info.outputPath('visuals')}/${info.project.name}-${label}.png`,animations:'disabled'});
}

test('the overview shows actual retained template miniatures and complete long titles',async({page,baseURL},info)=>{
  const {s,d,viewer}=await setup(page,info),client=await connect(page,baseURL!,s);
  try{
    const source=await call<DisplayRecord>(client,'kanvas_display_register',{sessionId:s,name:'Source history',width:1280,height:800});
    const title='An intentionally long retained view title that remains fully readable on the portrait display';
    await publishPrepared(page,s,[source.id],{version:1,template:'fact',title,data:{text:'The actual retained idea.'}});await waitForDisplay(page,s,source.id,x=>x.revision===1);
    await publishPrepared(page,s,[source.id],{version:1,template:'number',title:'An exact retained number',data:{value:'123456789.0001'}});await waitForDisplay(page,s,source.id,x=>x.revision===2);
    await publishPrepared(page,s,[d.id],{version:1,template:'overview',data:{displayIds:[source.id]}});await ready(page,s,d.id,'overview');await expect(viewer.locator('.retained-preview .fact-text')).toHaveText('The actual retained idea.');await expect(viewer.locator('.overview-card-caption h3').filter({hasText:title})).toHaveText(`1. ${title}`);
    const h=viewer.locator('.overview-card-caption h3').filter({hasText:title});await expect(h.getByLabel('View number',{exact:true})).toHaveText('1.');expect(await h.evaluate(el=>el.scrollHeight<=el.clientHeight+1&&el.scrollWidth<=el.clientWidth+1)).toBe(true);await photo(viewer,info,'overview');
    await viewer.getByRole('button',{name:new RegExp('Show An intentionally long retained')}).click();await waitForDisplay(page,s,source.id,x=>x.revision>2&&x.view?.data.text==='The actual retained idea.');
  }finally{await client.close();}
});
});

test.describe("overview coverage 3", () => {


const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({version:1,template,data,...extra} as never) as ViewSpec;
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov14 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov14-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,canonical:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId:operationId(canonical),arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const fact=(text:string)=>({version:1,template:'fact',data:{text}});
const pane=(id:string,inner:Record<string,unknown>=fact(id))=>({id,view:inner});
const pie=(kind:'pie'|'donut')=>({version:1,template:'chart',data:{kind,series:[{name:'Share',points:[{x:'Alpha',y:40},{x:'Beta',y:30},{x:'Gamma',y:20},{x:'Delta',y:10}]}]}});

test('the sessions overview shows one sharing level per session (22eccdda)',async({page})=>{
 await register(page);const privateSession=await createSession(page,'Just me'),publicSession=await createSession(page,'Open house');
 const made=await sessionApi(page,`/api/sessions/${publicSession}/public-access`,'POST',{enabled:true,confirm:true});expect(made.status).toBeLessThan(300);
 await page.goto('/');
 const card=(name:string)=>page.locator('.overview-session',{hasText:name});
 await expect(card('Just me').locator('.overview-sharing')).toHaveAttribute('data-sharing','private');await expect(card('Just me').locator('.overview-sharing')).toHaveText('Private');
 await expect(card('Open house').locator('.overview-sharing')).toHaveAttribute('data-sharing','public');await expect(card('Open house').locator('.overview-sharing svg')).toBeVisible();
 expect(privateSession).not.toBe(publicSession);
});
});
