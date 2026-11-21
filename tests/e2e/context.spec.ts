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

test.describe("context coverage 1", () => {


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

test('location is announced to the agent and late permission callbacks cannot undo withdrawal',async({page,context},info)=>{
  const {s,d,viewer}=await setup(page,info);await publishPrepared(page,s,[d.id],{version:1,template:'weather',data:{place:'Illustrative location',temperature:'18°',condition:'clear'}});await ready(page,s,d.id,'weather');
  await viewer.getByRole('button',{name:'Display controls',exact:true}).click();await viewer.getByRole('button',{name:'Screen options',exact:true}).click();await viewer.getByLabel('Share timezone and language with the session agent').check();
  await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:58.461234,longitude:8.771234});await viewer.getByRole('button',{name:'Share my location',exact:true}).click();await expect(viewer.getByRole('status').filter({hasText:'Location: granted'})).toBeVisible();
  await expect.poll(async()=>{const detail=await sessionDetail(page,s);return detail.interactions.some(x=>x.actionId==='viewer.context'&&(x.value as {locationAvailable?:boolean}).locationAvailable);}).toBe(true);
  const notices=(await sessionDetail(page,s)).interactions.filter(x=>x.actionId==='viewer.context');expect(JSON.stringify(notices)).not.toMatch(/latitude|longitude|58\.461234|8\.771234/);
  await viewer.getByRole('button',{name:'Stop sharing location',exact:true}).click();
  await viewer.evaluate(()=>{navigator.geolocation.getCurrentPosition=callback=>{(window as unknown as {finishLocation:()=>void}).finishLocation=()=>callback({coords:{latitude:1,longitude:2,accuracy:3},timestamp:Date.now()} as GeolocationPosition);};});
  await viewer.getByRole('button',{name:'Share my location',exact:true}).click();await expect(viewer.getByRole('status').filter({hasText:'Location: requesting'})).toBeVisible();await viewer.getByLabel('Share timezone and language with the session agent').uncheck();await viewer.getByLabel('Share timezone and language with the session agent').check();
  await viewer.evaluate(()=>(window as unknown as {finishLocation:()=>void}).finishLocation());await expect(viewer.getByRole('status').filter({hasText:'Location: not-requested'})).toBeVisible();
});
});
