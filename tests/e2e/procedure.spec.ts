import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createDisplay } from './support';
import { createSession } from './support';
import { expect } from './support';
import { login } from './support';
import { openViewer } from './support';
import { publishPrepared } from './support';
import { register } from './support';
import { sessionApi } from './support';
import { sessionDetail } from './support';
import { test } from './support';
import { viewerPath } from './support';
import { waitForDisplay } from './support';
import { validateView } from '../../src/shared/view-schemas';
import { samples } from '../../src/shared/template-examples';
import { Store } from '../../src/server/store';
import { testDatabase } from '../postgres';
import type { ViewSpec } from '../../src/shared/types';

test.describe("procedure coverage 1", () => {


const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({template,data,...extra} as never) as ViewSpec;
/** Publish and wait until this window has painted that revision: a measurement taken while the previous
 * view is being replaced reads an element that is already detached (empty computed style, no box). */
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov10 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov10-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const inside=(inner:{x:number;y:number;width:number;height:number},outer:{x:number;y:number;width:number;height:number},slack=1.5)=>inner.x>=outer.x-slack&&inner.y>=outer.y-slack&&inner.x+inner.width<=outer.x+outer.width+slack&&inner.y+inner.height<=outer.y+outer.height+slack;

test('procedure shows content and nothing to click unless controls are asked for (341c9d9b)',async({page},info)=>{
 const {s,d,viewer}=await setup(page,'Procedure');
 const data={name:'Set up the display',description:'Three steps.',steps:['Unpack the stick.','Plug it into the screen.','Open kanvas.host.']};
 await publishPrepared(page,s,[d.id],view('procedure',data));await expect(viewer.locator('.viewer-candidate .procedure-content')).toBeVisible();
 await expect(viewer.locator('.viewer-candidate .procedure-content button')).toHaveCount(0);await expect(viewer.locator('.viewer-candidate .procedure-controls')).toHaveCount(0);
 await viewer.screenshot({path:info.outputPath('procedure-no-chrome.png')});
 await publishPrepared(page,s,[d.id],view('procedure',data,{showControls:true}));await expect(viewer.locator('.viewer-candidate .procedure-controls button')).toHaveCount(2);
 await publishPrepared(page,s,[d.id],view('recipe',{name:'Waffles',materials:['Flour'],steps:['Mix.','Bake.']}));await expect(viewer.locator('.viewer-candidate .recipe-content')).toBeVisible();await expect(viewer.locator('.viewer-candidate .recipe-start')).toHaveCount(0);
});
});
