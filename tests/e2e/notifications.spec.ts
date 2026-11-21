import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { test } from './support';
import { expect } from './support';
import { register } from './support';
import { createSession } from './support';
import { createDisplay } from './support';
import { publishPrepared } from './support';
import { sessionApi } from './support';
import { sessionDetail } from './support';
import type { Page } from '@playwright/test';
import { openViewer } from './support';
import { waitForDisplay } from './support';
import { SEAT_LAYOUTS } from '../../src/shared/venue';
import { SIGN_TYPES } from '../../src/shared/venue';
import type { TestInfo } from '@playwright/test';

test.describe("notifications coverage 1", () => {

const evidence=()=>test.info().outputPath("screenshots");
async function clientFor(page:Page){const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable November acceptance',scopes:['read','publish']});const client=new Client({name:'november-acceptance',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',page.url()),{requestInit:{headers:{Authorization:'Bearer '+issued.data!.token}}}));return {client,call:async(operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});expect(result.isError).not.toBe(true);return (result.structuredContent as any).data;}};}
async function setup(page:Page){await register(page);const s=await createSession(page,'November acceptance'),d=await createDisplay(page,s,'Target');return {s,d};}
test('notification destination navigates authenticated root to exact non-default display',async({page})=>{
 await page.addInitScript(()=>{const original=window.matchMedia.bind(window);window.matchMedia=(query:string)=>query==='(display-mode: standalone)'?{...original(query),matches:true} as MediaQueryList:original(query);Object.defineProperty(window,'launchQueue',{configurable:true,value:{setConsumer:(callback:Function)=>(window as any).__launch=callback}});});
 const {s,d}=await setup(page),second=await createDisplay(page,s,'Second destination');await publishPrepared(page,s,[d.id],{version:1,template:'fact',data:{text:'Wrong display'}});await publishPrepared(page,s,[second.id],{version:1,template:'fact',data:{text:'Exact notified content'}});await page.goto('/');await expect(page.locator('main.account-overview')).toBeVisible();await page.evaluate(targetURL=>(window as any).__launch({targetURL}),new URL(`/view/${s}/${second.id}`,page.url()).href);await expect(page.locator('.viewer-candidate')).toContainText('Exact notified content');await page.evaluate(()=>sessionStorage.clear());await page.reload();await expect(page.locator('.viewer-candidate')).toContainText('Exact notified content');await page.evaluate(targetURL=>(window as any).__launch({targetURL}),page.url());await expect(page.locator('.viewer-candidate')).toContainText('Exact notified content');await expect(page).toHaveURL(new RegExp(`/view/${s}/${second.id}$`));
});
});

test.describe("notifications coverage 2", () => {

async function setup(page:Page,baseURL:string){
 await register(page);const sessionId=await createSession(page,'October 17 acceptance'),display=await createDisplay(page,sessionId,'Feature screen'),viewer=await openViewer(page,sessionId,display.id);
 const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable feature test',scopes:['read','publish']});
 const client=new Client({name:'feedback-acceptance',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+issued.data!.token}}}));
 const call=async(operationId:string,args:Record<string,unknown>={})=>{const r=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});expect(r.isError,JSON.stringify(r.structuredContent)).not.toBe(true);return (r.structuredContent as any).data;};
 const update=(operationId:string,args:Record<string,unknown>)=>call(operationId,{sessionId,displayId:display.id,...args});
 const current=()=>waitForDisplay(page,sessionId,display.id,d=>d.revision>0&&d.appliedRevision===d.revision);
 const show=async(template:any,data:Record<string,unknown>)=>{await publishPrepared(page,sessionId,[display.id],{version:1,template,data});return current();};
 return {sessionId,display,viewer,client,call,update,current,show};
}
async function photo(v:Page,info:TestInfo,name:string){for(let i=0;i<5&&await v.getByRole('button',{name:'Dismiss notification',exact:true}).count();i++)await v.getByRole('button',{name:'Dismiss notification',exact:true}).first().click();await v.locator('.viewer-candidate .render-surface').first().screenshot({path:info.outputPath(name+'.png'),animations:'disabled'});expect(await v.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);}

async function fit(v:Page){
 await expect(v.locator('.fit-display')).toHaveAttribute('data-fit-scale',/^[0-9.]+$/);
 await v.waitForTimeout(200);
 const bounds=await v.locator('.fit-display').evaluate(box=>{const outer=box.getBoundingClientRect(),inner=box.firstElementChild!.getBoundingClientRect();const descendants=[...box.querySelectorAll<HTMLElement>('.seat,.menu-item,.menu-group article,.opening-hours>div,.sign-content')];return {scale:Number((box as HTMLElement).dataset.fitScale),fits:descendants.every(n=>{const b=n.getBoundingClientRect();return b.bottom<=outer.bottom+2&&b.right<=outer.right+2&&b.top>=outer.top-2&&b.left>=outer.left-2;}),height:inner.height,width:outer.width};});
 expect(bounds.scale).toBeGreaterThan(0);expect(bounds.scale).toBeLessThanOrEqual(1);
 // October26 supersedes shrinking menu text indefinitely: retain the font floor and expose scroll.
 if(!bounds.fits&&await v.locator('.menu-board').count()){
  const readable=await v.locator('.fit-display').evaluate(box=>({scrollable:getComputedStyle(box).overflow==='auto'&&box.scrollHeight>box.clientHeight,font:parseFloat(getComputedStyle(box.querySelector('.menu-item h3')!).fontSize)*Number((box as HTMLElement).dataset.fitScale)}));
  expect(readable.scrollable).toBe(true);expect(readable.font).toBeGreaterThanOrEqual(19.9);
 }else expect(bounds.fits,JSON.stringify(bounds)).toBe(true);
}
test('manifest launches root while standalone cold deep links retain their destination',async({page})=>{
 await page.addInitScript(()=>{const original=window.matchMedia.bind(window);window.matchMedia=(query:string)=>query==='(display-mode: standalone)'?{...original(query),matches:true} as MediaQueryList:original(query);});
 await page.goto('/start');await expect.poll(()=>new URL(page.url()).pathname).toBe('/start');
 const manifest=await page.evaluate(async()=>fetch('/manifest.webmanifest').then(r=>r.json()));expect(manifest.start_url).toBe('/');expect(manifest.launch_handler.client_mode).toBe('navigate-existing');await page.goto(manifest.start_url);await expect(page.getByRole('heading',{name:'Sign in on this screen',exact:true})).toBeVisible();await expect.poll(()=>new URL(page.url()).pathname).toBe('/');
});
});
