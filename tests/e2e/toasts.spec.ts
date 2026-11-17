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
import { operationId } from '../../src/server/mcp/operations';
import { operationRequest } from '../mcp/requests.js';
import { publicReference } from '../../src/server/mcp/operations';
import { mkdir } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { DisplayRecord } from '../../src/shared/types';
import {templateExampleData} from '../../src/shared/template-examples';

test.describe("toasts coverage 1", () => {


const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({template,data,...extra} as never) as ViewSpec;
/** Publish and wait until this window has painted that revision: a measurement taken while the previous
 * view is being replaced reads an element that is already detached (empty computed style, no box). */
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov10 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov10-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const inside=(inner:{x:number;y:number;width:number;height:number},outer:{x:number;y:number;width:number;height:number},slack=1.5)=>inner.x>=outer.x-slack&&inner.y>=outer.y-slack&&inner.x+inner.width<=outer.x+outer.width+slack&&inner.y+inner.height<=outer.y+outer.height+slack;

test('dismissing a toast dismisses it for the whole account, at once and after reopening (1559c2fd, b4c5d005, e6ae1605)',async({page,baseURL,browser},info)=>{
 const account=await register(page);const s=await createSession(page,'Account notices'),d=await createDisplay(page,s,'Display'),laptop=await openViewer(page,s,d.id);
 const phoneContext=await browser.newContext({baseURL:baseURL!,viewport:{width:390,height:844}}),phone=await phoneContext.newPage();
 const client=await mcp(page,baseURL!);
 try{
  await login(phone,account,viewerPath(s,d.id));await expect(phone.locator('.viewer-shell')).toBeVisible();
  expect((await use(client,'kanvas.toast',{sessionId:s,displayIds:[d.id],title:'New mail',description:'Handled once, gone everywhere',type:'email',sticky:true})).isError).toBe(false);
  expect((await use(client,'kanvas.toast',{sessionId:s,displayIds:[d.id],text:'Plain notice',sticky:true})).isError).toBe(false);
  // Join notices may also be on screen; count the two notifications under test by their text.
  for(const window of [laptop,phone])for(const text of ['New mail','Plain notice'])await expect(window.locator('.viewer-toast').filter({hasText:text})).toHaveCount(1,{timeout:8000});
  await expect(laptop.locator('.viewer-toast [data-toast-icon=email]')).toHaveCount(1);await expect(laptop.locator('.viewer-toast').filter({hasText:'Plain notice'}).locator('svg')).toHaveCount(0);
  await laptop.screenshot({path:info.outputPath('toast-icons.png')});
  await laptop.locator('.viewer-toast').filter({hasText:'New mail'}).getByRole('button',{name:'Dismiss notification'}).click();
  // The other device of the same account loses it without waiting for its next poll.
  await expect(phone.locator('.viewer-toast').filter({hasText:'New mail'})).toHaveCount(0,{timeout:3500});await expect(phone.locator('.viewer-toast').filter({hasText:'Plain notice'})).toHaveCount(1);
  // Reload ("restart the app") on both devices, and a brand-new window: it stays dismissed.
  await phone.reload();await expect(phone.locator('.viewer-shell')).toBeVisible();await laptop.reload();await expect(laptop.locator('.viewer-shell')).toBeVisible();
  const fresh=await openViewer(page,s,d.id);
  for(const window of [laptop,phone,fresh]){await expect(window.locator('.viewer-toast').filter({hasText:'Plain notice'})).toHaveCount(1,{timeout:8000});await expect(window.locator('.viewer-toast').filter({hasText:'New mail'})).toHaveCount(0);}
  // Found in the complete run of 2026-11-10: an answer the server computed just before a dismissal was saved listed the
  // notification again, so it flashed back on the window where it had just been closed. Slow answers make that certain here.
  for(const text of ['First of two','Second of two'])expect((await use(client,'kanvas.toast',{sessionId:s,displayIds:[d.id],text,sticky:true})).isError).toBe(false);
  for(const text of ['First of two','Second of two'])await expect(laptop.locator('.viewer-toast').filter({hasText:text})).toHaveCount(1,{timeout:8000});
  await laptop.route('**/observe',async route=>{const response=await route.fetch();await new Promise(done=>setTimeout(done,500));await route.fulfill({response});});
  await laptop.evaluate(()=>{const back:string[]=[];(window as unknown as {toastsBack:string[]}).toastsBack=back;new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof HTMLElement&&/of two/.test(node.textContent??''))back.push(node.textContent??'');}).observe(document.body,{childList:true,subtree:true});});
  for(const text of ['First of two','Second of two'])await laptop.locator('.viewer-toast').filter({hasText:text}).getByRole('button',{name:'Dismiss notification'}).click();
  await laptop.waitForTimeout(3000);
  expect(await laptop.evaluate(()=>(window as unknown as {toastsBack:string[]}).toastsBack)).toEqual([]);
  await expect(laptop.locator('.viewer-toast').filter({hasText:'of two'})).toHaveCount(0);await laptop.unroute('**/observe');
 }finally{await client.close();await phoneContext.close();}
});
});

test.describe("toasts coverage 2", () => {


const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({version:1,template,data,...extra} as never) as ViewSpec;
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov14 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov14-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,canonical:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId:operationId(canonical),arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const fact=(text:string)=>({version:1,template:'fact',data:{text}});
const pane=(id:string,inner:Record<string,unknown>=fact(id))=>({id,view:inner});
const pie=(kind:'pie'|'donut')=>({version:1,template:'chart',data:{kind,series:[{name:'Share',points:[{x:'Alpha',y:40},{x:'Beta',y:30},{x:'Gamma',y:20},{x:'Delta',y:10}]}]}});

test('a toast takes an icon id and draws it in the text colour (5b62fba5, 95a83b8c)',async({page,baseURL})=>{
 const {s,d,viewer}=await setup(page,'Toast icons');const client=await mcp(page,baseURL!);
 try{
  await shown(page,viewer,s,d.id,view('fact',{text:'Toast'}));
  const sent=await use(client,'kanvas_toast',{sessionId:s,displayIds:[d.id],text:'You have mail',icon:'lucide:mail-dot',sticky:true});
  expect(sent.isError,JSON.stringify(sent.structured).slice(0,300)).toBe(false);
  const glyph=viewer.locator('.viewer-toast .viewer-toast-glyph');await expect(glyph).toBeVisible();
  const style=await glyph.evaluate(el=>{const own=getComputedStyle(el),toast=getComputedStyle(el.closest('.viewer-toast')!);return {background:own.backgroundColor,text:toast.color,mask:own.maskImage||(own as unknown as {webkitMaskImage:string}).webkitMaskImage,width:el.getBoundingClientRect().width};});
  expect(style.background).toBe(style.text);expect(style.mask).toContain('/api/picker/icons/lucide/outline/mail-dot.svg');expect(style.width).toBeGreaterThan(20);
  await expect(viewer.locator('.viewer-toast img.viewer-toast-icon')).toHaveCount(0);
 }finally{await client.close();}
});
});

test.describe("toasts coverage 3", () => {


const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
async function connect(page:Page,baseURL:string,sessionId?:string){
  const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable September acceptance',scopes:['read','publish'],...(sessionId?{sessionIds:[sessionId]}:{})});
  expect(issued.status).toBe(201);const client=new Client({name:'september-acceptance',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${issued.data!.token}`}}}));return client;
}
async function call<T=unknown>(client:Client,name:string,args:Record<string,unknown>):Promise<T>{const ref=publicReference(name);if(!ref)throw new Error('Missing public mapping');const result=await client.callTool(operationRequest({name:ref.tool,arguments:{operation:ref.operation,...args}}));expect(result.isError,`${name} succeeds`).not.toBe(true);return (result.structuredContent as {data:T}).data;}
async function setup(page:Page){await register(page);const sessionId=await createSession(page,'September display lab'),display=await createDisplay(page,sessionId,'Receiving screen');return {sessionId,display};}
async function painted(page:Page,sessionId:string,displayId:string,template:string){return waitForDisplay(page,sessionId,displayId,d=>d.view?.template===template&&d.appliedRevision===d.revision&&d.revision>0);}

test('notifications stack and dismiss without replacing content or history',async({page,baseURL})=>{
  const {sessionId,display}=await setup(page),viewer=await openViewer(page,sessionId,display.id),client=await connect(page,baseURL!,sessionId);await viewer.bringToFront();
  try{
    await publishPrepared(page,sessionId,[display.id],{version:1,template:'fact',data:{text:'Keep the actual view'}});const before=await painted(page,sessionId,display.id,'fact');
    const history=await call(client,'kanvas_display_history',{sessionId,displayId:display.id});
    await call(client,'kanvas_toast',{sessionId,displayIds:[display.id],text:'Task completed',severity:'success',sticky:true});await call(client,'kanvas_toast',{sessionId,displayIds:[display.id],text:'A second notice',severity:'warning',durationMs:10000});
    await expect(viewer.locator('.viewer-toast')).toHaveCount(2);await viewer.locator('.viewer-toast').filter({hasText:'Task completed'}).getByRole('button',{name:'Dismiss notification'}).click();await expect(viewer.locator('.viewer-toast')).toHaveCount(1);
    expect((await sessionDetail(page,sessionId)).displays.find(item => item.id === display.id)!.revision).toBe(before.revision);expect(await call(client,'kanvas_display_history',{sessionId,displayId:display.id})).toEqual(history);await expect(viewer.locator('.fact-text')).toHaveText('Keep the actual view');
  }finally{await client.close();}
});
});
