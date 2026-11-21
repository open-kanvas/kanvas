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

test.describe("recipe coverage 1", () => {


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

test('recipe steps stay pre-staged and advance from both the screen and MCP voice-style commands',async({page,baseURL},info)=>{
  const {s,d,viewer}=await setup(page,info),client=await connect(page,baseURL!,s),steps=['Measure the supplied ingredients.','Mix the dry ingredients in a bowl.','Add the liquid slowly.','Whisk until smooth.','Let the batter rest.','Warm the iron.','Cook until golden.','Serve and enjoy.'];
  try{
    await publishPrepared(page,s,[d.id],{version:1,template:'recipe',showControls:true,data:{name:'Illustrative waffle guide',materials:['A bowl','A whisk','Supplied ingredients'],steps}});await ready(page,s,d.id,'recipe');await viewer.getByRole('button',{name:'Start step-by-step',exact:false}).click();
    await expect(viewer.locator('.viewer-candidate .procedure-instruction')).toHaveText(steps[0]);await ready(page,s,d.id);await viewer.getByRole('button',{name:'Next step',exact:false}).click();await expect(viewer.locator('.viewer-candidate .procedure-instruction')).toHaveText(steps[1]);
    const current=await ready(page,s,d.id);await call(client,'kanvas_procedure_control',{sessionId:s,displayId:d.id,requestId:randomUUID(),expectedRevision:current.revision,action:'next'});await expect(viewer.locator('.viewer-candidate .procedure-instruction')).toHaveText(steps[2]);await ready(page,s,d.id);
    await viewer.getByRole('button',{name:'Back',exact:true}).click();await expect(viewer.locator('.viewer-candidate .procedure-instruction')).toHaveText(steps[1]);expect((await sessionDetail(page,s)).displays.find(item => item.id === d.id)!.view?.data.steps).toEqual(steps);await photo(viewer,info,'procedure');
  }finally{await client.close();}
});
});
