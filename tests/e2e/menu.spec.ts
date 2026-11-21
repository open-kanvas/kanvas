import { operationRequest } from '../mcp/requests.js';
import { randomUUID } from 'node:crypto';
import { publicReference } from '../../src/server/mcp/operations';
import { mkdir } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { Page } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import type { DisplayRecord } from '../../src/shared/types';
import type { InteractionRecord } from '../../src/shared/types';
import type { UpdateRecord } from '../../src/shared/types';
import type { ViewSpec } from '../../src/shared/types';
import { createDisplay } from './support';
import { createSession } from './support';
import { expect } from './support';
import { openViewer } from './support';
import { publishPrepared } from './support';
import { register } from './support';
import { sessionApi } from './support';
import { sessionDetail } from './support';
import { test } from './support';
import { waitForDisplay } from './support';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { login } from './support';
import { isolatedContext } from './support';

test.describe("menu coverage 1", () => {


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

test('menu images load from protected source assets and text stays glanceable without them',async({page},info)=>{
  const {s,d,viewer}=await setup(page,info),asset=await sessionApi<{url:string}>(page,`/api/sessions/${s}/assets`,'POST',{name:'Supplied menu image',mimeType:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII='});expect(asset.status).toBe(201);
  const data={groups:[{title:'Pizza tonight',items:[{name:'Margherita',price:'159.00 NOK',description:'Tomato, mozzarella and basil.',featured:true,image:{url:asset.data!.url,alt:'Supplied Margherita image'}},{name:'Classic mushroom',price:'179.00 NOK',description:'Mushrooms, herbs and cheese.'}]}]};
  await publishPrepared(page,s,[d.id],{version:1,template:'menu',data});await ready(page,s,d.id,'menu');await expect(viewer.getByRole('img',{name:'Supplied Margherita image'})).toBeVisible();expect(await viewer.locator('.menu-content h3').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(20);await expect(viewer.locator('.is-featured')).toContainText('159.00 NOK');expect(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await photo(viewer,info,'menu');
});
});

test.describe("menu coverage 2", () => {


async function setup(page:Page,info:TestInfo,baseURL:string){
  const account=await register(page),s=await createSession(page,'Spatial acceptance'),d=await createDisplay(page,s,'Retained content'),v=await openViewer(page,s,d.id);
  const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable evening checks',scopes:['read','publish']});expect(issued.status).toBe(201);
  const headers={Authorization:`Bearer ${issued.data!.token}`},client=info.project.name.startsWith('phone')?new LegacyClient({name:'evening-legacy',version:'1'}):new Client({name:'evening-current',version:'1'});
  if(client instanceof LegacyClient)await client.connect(new LegacyTransport(new URL('/mcp',baseURL),{requestInit:{headers}}));else await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers}}));
  const call=async<T=any>(name:string,operation:string,args:Record<string,unknown>={})=>{const r=await client.callTool(operationRequest({name,arguments:{operation,...args}}));expect(r.isError,`${name} ${operation}`).not.toBe(true);return(r.structuredContent as {data:T}).data;};
  const current=()=>waitForDisplay(page,s,d.id,x=>x.revision>0&&x.appliedRevision===x.revision),show=async(view:ViewSpec)=>{await publishPrepared(page,s,[d.id],view);return current();};
  const nav=async(navigation:unknown)=>{const before=await current();return call('kanvas_control','navigation.control',{sessionId:s,displayId:d.id,expectedRevision:before.revision,requestId:randomUUID(),navigation});};
  return {account,s,d,v,call,client,current,show,nav};
}
async function photo(page:Page,info:TestInfo,name:string){await expect(page.locator('.viewer-toast')).toHaveCount(0,{timeout:15000});await page.evaluate(()=>document.fonts.ready);await mkdir(info.outputPath('visuals'),{recursive:true});await page.screenshot({path:`${info.outputPath('visuals')}/${info.project.name}-${name}.png`,animations:'disabled'});}
test('compact viewports and commerce details stay visible on both receiver sizes',async({page,baseURL},info)=>{
 const a=await setup(page,info,baseURL!);try{
  const data={description:'Responsive sample',html:'<h1>Sample</h1>',viewports:['small-phone','iphone','pixel','tablet','laptop','desktop']};
  await a.show({version:1,template:'device-preview',data:{...data,gridSize:'standard'}});const count=()=>a.v.locator('.viewer-candidate .device-preview-grid').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),standard=await count();
  await a.show({version:1,template:'device-preview',data:{...data,gridSize:'compact'}});if(info.project.name.startsWith('phone'))expect(await count()).toBeGreaterThanOrEqual(standard);else expect(await count()).toBeGreaterThan(standard);expect(await a.v.locator('.viewer-candidate iframe').nth(1).evaluate(e=>(e as HTMLIFrameElement).clientWidth)).toBe(390);await photo(a.v,info,'compact-previews');
  await a.show({version:1,template:'product',data:{name:'Reference headset',description:'Supplied description',layout:'multi-vendor',attributes:[{key:'battery',label:'Battery'}],offers:[{vendor:'Shop A',price:'USD 99',availability:'In stock',shipping:'Two days',attributes:{battery:'30h'}},{vendor:'Shop B',price:'USD 109',availability:'Backorder',shipping:'One week'}]}});
  for(const value of ['Reference headset','USD 99','In stock','Two days','30h'])await expect(a.v.locator('.viewer-candidate .product-comparison')).toContainText(value);await photo(a.v,info,'vendor-details');
  await a.show({version:1,template:'comparison',data:{criteria:['Cost'],items:[{name:'A',values:{Cost:1}},{name:'B',values:{Cost:2}}],commentary:{Cost:'Different costs'}}});const cell=a.v.locator('.viewer-candidate td.comparison-commentary');expect(await cell.evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');await photo(a.v,info,'comparison-summary');
 }finally{await a.client.close();}
});
});
