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
import { Store } from '../../src/server/store';
import { testDatabase } from '../postgres';

test.describe("guidance coverage 1", () => {


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

test('Kanvas Help opens focused public guidance without publishing over the empty display',async({page},info)=>{
  const {s,d,viewer}=await setup(page,info);await expect(viewer.getByRole('link',{name:'Kanvas Help',exact:true})).toBeVisible();
  const popup=viewer.waitForEvent('popup');await viewer.getByRole('link',{name:'Kanvas Help',exact:true}).click();const help=await popup;
  await expect(help.getByRole('heading',{name:'Kanvas Help',exact:true})).toBeVisible();await expect(help.getByRole('link',{name:'Navigate, restore history and autoplay prepared views',exact:true})).toBeVisible();
  expect((await sessionDetail(page,s)).displays.find(x=>x.id===d.id)?.view).toBeNull();await help.close();
});
});

test.describe("guidance coverage 2", () => {

const evidence=()=>test.info().outputPath("screenshots");
test('richer charts stay fixed across orientations labels stacking and secondary axes',async({page})=>{
 await register(page);const s=await createSession(page,'Stable chart sizing'),d=await createDisplay(page,s,'Charts');const series=[{name:'First',points:[{x:'A',y:20},{x:'B',y:30},{x:'C',y:10}]},{name:'Second',points:[{x:'A',y:30},{x:'B',y:10},{x:'C',y:20}]}];
 for(const options of [{kind:'bar',orientation:'horizontal',series:series.slice(0,1)},{kind:'bar',stacking:'stacked',legend:false,series},{kind:'bar',showValues:true,legend:true,series},{kind:'line',showValues:true,series:series.slice(0,1)},{kind:'area',stacking:'percent',showValues:true,series},{kind:'bar',secondaryLabel:'Rate',series:[series[0],{...series[1],kind:'line',axis:'secondary'}]}]){
 await publishPrepared(page,s,[d.id],{version:1,template:'chart',data:options});await page.goto(`/view/${s}/${d.id}`);await expect(page.locator('.viewer-candidate .composable-chart')).toBeVisible();const sizes=[];for(let i=0;i<6;i++){await page.waitForTimeout(500);sizes.push(await page.locator('.viewer-candidate .composable-chart').evaluate(el=>({height:el.getBoundingClientRect().height,svg:el.querySelector('svg')!.getBoundingClientRect().height,scroll:document.documentElement.scrollHeight})));}expect(Math.max(...sizes.map(x=>x.height))-Math.min(...sizes.map(x=>x.height))).toBeLessThan(2);expect(Math.max(...sizes.map(x=>x.svg))-Math.min(...sizes.map(x=>x.svg))).toBeLessThan(2);expect(sizes.at(-1)!.height).toBeLessThan(page.viewportSize()!.height+1);expect(sizes.at(-1)!.scroll).toBeLessThan(page.viewportSize()!.height+1);
 }
 await page.screenshot({path:`${evidence()}/${test.info().project.name}-chart.png`});
});
});
