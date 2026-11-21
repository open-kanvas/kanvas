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
import { login } from './support';
import { publicReference } from '../../src/server/mcp/operations';
import type { DisplayRecord } from '../../src/shared/types';
import { extendedExamples } from '../../src/shared/extended-templates';
import type { Browser } from '@playwright/test';
import { advancedChartExamples } from '../../src/shared/advanced-chart-examples';
import { samples } from '../../src/shared/template-examples';

test.describe("device coverage 1", () => {


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

test('named requests still need approval while actual signed-in and paired connections drive owner notices and counts',async({page,baseURL,browser},info)=>{
  const s=await setup(page,info,baseURL!),guestContext=await isolatedContext(browser,info,baseURL!),guest=await guestContext.newPage();
  try{
    await s.show({version:1,template:'fact',data:{text:'Private receiving source'}});
    const address=await s.call('kanvas_session','address.get',{sessionId:s.sessionId,displayId:s.display.id});expect(/\/s\/[abcdefghjkmnpqrstuvwxyz23456789]{4}$/.test(address.shortUrl??address.url??address.viewerUrl)).toBe(true);
    const viewers=()=>s.call<any[]>('kanvas_inspect','viewers.read',{sessionId:s.sessionId,displayId:s.display.id});await expect.poll(async()=>(await viewers()).filter(v=>v.connected).length).toBe(1);
    await guest.goto(viewerPath(s.sessionId,s.display.id));await guest.getByRole('button',{name:'Pair this screen'}).click();await expect(guest.getByRole('button',{name:'Add my name'})).toBeVisible();await guest.getByLabel('Your name (optional)').fill('Invited reading screen');await expect(guest.getByLabel('Your name (optional)')).toHaveValue('Invited reading screen');const nameSaved=guest.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname.endsWith('/details'));await guest.getByRole('button',{name:'Add my name'}).click();const named=await nameSaved;expect(named.status()).toBe(200);expect((await named.json()).data.selfName).toBe('Invited reading screen');await expect(guest.getByText('Private receiving source',{exact:true})).toHaveCount(0);
    await expect(page.getByRole('complementary',{name:'Connection notifications'})).toContainText('request');
    await tab(page,'People & access');const request=page.locator('.sharing-requests article').filter({hasText:'Invited reading screen'});await expect(request).toContainText('self-identified');await expect(request).toContainText(/Chrome|Chromium|Safari/);await request.getByRole('button',{name:'Approve view only',exact:true}).click();
    await expect(guest.locator('.viewer-shell')).toBeVisible();await expect(guest.getByText('Private receiving source',{exact:true})).toBeVisible();await expect.poll(async()=>(await viewers()).filter(v=>v.connected).length).toBe(2);
    await expect(page.getByRole('region',{name:'Active viewers'})).toContainText('2 connected');expect((await viewers()).filter(v=>v.connected).map(v=>v.connectionMethod).sort()).toEqual(['account','paired']);
    await guest.close();await expect.poll(async()=>(await viewers()).filter(v=>v.connected).length).toBe(1);await expect(page.getByRole('complementary',{name:'Connection notifications'})).toContainText('disconnected');
  }finally{await guestContext.close();await s.client.close();}
});
});

test.describe("device coverage 2", () => {


async function setup(page:Page,info:TestInfo,baseURL:string){
  const account=await register(page),s=await createSession(page,'Evening acceptance'),d=await createDisplay(page,s,'Retained content'),v=await openViewer(page,s,d.id);
  const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable evening checks',scopes:['read','publish']});expect(issued.status).toBe(201);
  const headers={Authorization:`Bearer ${issued.data!.token}`},client=info.project.name.startsWith('phone')?new LegacyClient({name:'evening-legacy',version:'1'}):new Client({name:'evening-current',version:'1'});
  if(client instanceof LegacyClient)await client.connect(new LegacyTransport(new URL('/mcp',baseURL),{requestInit:{headers}}));else await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers}}));
  const call=async<T=any>(name:string,operation:string,args:Record<string,unknown>={})=>{const r=await client.callTool(operationRequest({name,arguments:{operation,...args}}));expect(r.isError,`${name} ${operation}: ${JSON.stringify((r.structuredContent as any)?.error??{}).slice(0,600)}`).not.toBe(true);return(r.structuredContent as {data:T}).data;};
  const current=()=>waitForDisplay(page,s,d.id,x=>x.revision>0&&x.appliedRevision===x.revision),show=async(view:ViewSpec)=>{await publishPrepared(page,s,[d.id],view);return current();};
  const nav=async(navigation:unknown)=>{const before=await current();return call('kanvas_control','navigation.control',{sessionId:s,displayId:d.id,expectedRevision:before.revision,requestId:randomUUID(),navigation});};
  return {account,s,d,v,call,client,current,show,nav};
}
async function photo(page:Page,info:TestInfo,name:string){await expect(page.locator('.viewer-toast')).toHaveCount(0,{timeout:15000});await page.evaluate(()=>document.fonts.ready);await mkdir(info.outputPath('visuals'),{recursive:true});await page.screenshot({path:`${info.outputPath('visuals')}/${info.project.name}-${name}.png`,animations:'disabled'});}

test('a delayed device paint report cannot overwrite a newer receiving revision or emit a browser error',async({page,baseURL},info)=>{
  const a=await setup(page,info,baseURL!);let release=()=>{},arrive=()=>{},armed=true;
  const gate=new Promise<void>(resolve=>{release=resolve;}),arrived=new Promise<void>(resolve=>{arrive=resolve;});
  try{
    const initial=await a.show({version:1,template:'fact',data:{text:'Initial device frame'}}),olderRevision=initial.revision+1;
    await a.v.route('**/api/devices/**/report',async route=>{const body=route.request().postDataJSON();if(armed&&body.displayId===a.d.id&&body.renderedRevision===olderRevision){armed=false;arrive();await gate;}await route.continue();});
    await a.show({version:1,template:'fact',data:{text:'Delayed painted frame'}});await arrived;
    const current=await a.show({version:1,template:'fact',data:{text:'Newer visible device frame'}});
    // With an idle console sibling, device-wide current is deliberately absent; inspect the receiving window.
    await expect.poll(async()=>{const r=await a.call('kanvas_inspect','devices.read');return r.devices.some((d:any)=>d.windows.some((w:any)=>w.current?.displayId===a.d.id&&w.renderedRevision===current.revision));}).toBe(true);
    const response=a.v.waitForResponse(r=>r.url().includes('/api/devices/')&&r.url().endsWith('/report')&&r.request().postDataJSON()?.renderedRevision===olderRevision);release();const discarded=await response;
    expect(discarded.status()).toBe(200);expect((await discarded.json()).data).toEqual({recorded:false,reason:'STALE_OBSERVATION'});
    await expect(a.v.locator('.viewer-candidate')).toContainText('Newer visible device frame');expect((await a.current()).revision).toBe(current.revision);
    expect((await a.call('kanvas_inspect','devices.read')).devices.some((d:any)=>d.windows.some((w:any)=>w.current?.displayId===a.d.id&&w.renderedRevision===current.revision))).toBe(true);
  }finally{release();await a.v.unrouteAll({behavior:'wait'});await a.client.close();}
});
});

test.describe("device coverage 3", () => {

test('signed-in root registers a receiver and opens the ready default display without a prior join',async({page})=>{
 await register(page);await page.goto('/');await expect(page.locator('.account-overview')).toBeVisible();
 let device:any,window:any;
 await expect.poll(async()=>{const result:any=await sessionApi(page,'/api/devices');device=result.data?.devices?.find((d:any)=>d.windows.some((w:any)=>w.connected));window=device?.windows.find((w:any)=>w.connected);return Boolean(window);}).toBe(true);
 const created:any=await sessionApi(page,'/api/sessions','POST',{name:'Immediate ready screen'});expect(created.status).toBe(200);expect(created.data.displays).toHaveLength(1);const display=created.data.displays[0];
 // Present intentionally navigates this same page; observe HTTP success
 // outside its old JavaScript context and never resend the mutation.
 const path=`/api/devices/${device.id}/windows/${window.id}/present`,response=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST');
 const presenting=sessionApi(page,path,'POST',{sessionId:created.data.id,displayId:display.id,expectedVersion:window.version,requestId:randomUUID()}).catch(error=>{if(!/Execution context was destroyed/.test(String(error)))throw error;});
 expect((await response).status()).toBe(200);await presenting;
 await expect(page).toHaveURL(new RegExp(`/view/${created.data.id}/${display.id}$`));await expect(page.locator('.viewer-shell')).toBeVisible();
});
});

test.describe("device coverage 4", () => {


const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
async function connect(page:Page,baseURL:string,sessionId?:string){
  const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable September acceptance',scopes:['read','publish'],...(sessionId?{sessionIds:[sessionId]}:{})});
  expect(issued.status).toBe(201);const client=new Client({name:'september-acceptance',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${issued.data!.token}`}}}));return client;
}
async function call<T=unknown>(client:Client,name:string,args:Record<string,unknown>):Promise<T>{const ref=publicReference(name);if(!ref)throw new Error('Missing public mapping');const result=await client.callTool(operationRequest({name:ref.tool,arguments:{operation:ref.operation,...args}}));expect(result.isError,`${name} succeeds`).not.toBe(true);return (result.structuredContent as {data:T}).data;}
async function setup(page:Page){await register(page);const sessionId=await createSession(page,'September display lab'),display=await createDisplay(page,sessionId,'Receiving screen');return {sessionId,display};}
async function painted(page:Page,sessionId:string,displayId:string,template:string){return waitForDisplay(page,sessionId,displayId,d=>d.view?.template===template&&d.appliedRevision===d.revision&&d.revision>0);}

test('browser inspection reports changed receiving DOM and explicit per-viewer context, not stored source',async({page,baseURL,context})=>{
  const {sessionId,display}=await setup(page),client=await connect(page,baseURL!,sessionId);const viewer=await openViewer(page,sessionId,display.id);await viewer.bringToFront();
  try{
    await publishPrepared(page,sessionId,[display.id],{version:1,template:'fact',data:{text:'Authoritative stored source'}});await painted(page,sessionId,display.id,'fact');
    await viewer.locator('.fact-text').evaluate(el=>{el.textContent='Actual browser DOM, deliberately different';});
    const inspect=await call<{source:string;observations:{description:string;context:unknown;fresh:boolean}[]}>(client,'kanvas_display_inspect',{sessionId,displayId:display.id});
    expect(inspect.source).toBe('receiving-browser-dom');expect(inspect.observations.some(x=>x.description.includes('Actual browser DOM, deliberately different')&&x.fresh)).toBe(true);expect(inspect.observations.every(x=>x.context===null)).toBe(true);
    const stored=await call<DisplayRecord>(client,'kanvas_display_current',{sessionId,displayId:display.id});expect(stored.view?.data.text).toBe('Authoritative stored source');
    await viewer.getByRole('button',{name:'Display controls',exact:true}).click();await viewer.getByRole('button',{name:'Screen options',exact:true}).click();await viewer.getByLabel('Share timezone and language with the session agent').check();
    await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:59.91,longitude:10.75});await viewer.getByRole('button',{name:'Share my location',exact:true}).click();
    await expect.poll(async()=>{const data=await call<{context?:{location?:{latitude:number}}}[]>(client,'kanvas_viewers_read',{sessionId});return data.some(x=>x.context?.location?.latitude===59.91);}).toBe(true);
    const second=await openViewer(page,sessionId,display.id);await second.bringToFront();
    await expect.poll(async()=>{const data=await call<{context:unknown}[]>(client,'kanvas_viewers_read',{sessionId});return data.length===2&&data.filter(x=>x.context).length===1;}).toBe(true);
    await viewer.getByLabel('Share timezone and language with the session agent').uncheck();
    await expect.poll(async()=>{const data=await call<{context:unknown}[]>(client,'kanvas_viewers_read',{sessionId});return data.every(x=>!x.context);}).toBe(true);
  }finally{await client.close();}
});
});

test.describe("device coverage 5", () => {


async function setup(page:Page,info:TestInfo,baseURL:string){
  await register(page);const s=await createSession(page,'September 23 feedback'),d=await createDisplay(page,s,'Acceptance screen'),v=await openViewer(page,s,d.id);
  const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable September acceptance',scopes:['read','publish']});expect(issued.status).toBe(201);
  const headers={Authorization:`Bearer ${issued.data!.token}`},client=info.project.name.startsWith('phone')?new LegacyClient({name:'september-legacy',version:'1'}):new Client({name:'september-current',version:'1'});
  if(client instanceof LegacyClient)await client.connect(new LegacyTransport(new URL('/mcp',baseURL),{requestInit:{headers}}));else await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers}}));
  const call=async(name:string,operation:string,args:Record<string,unknown>={})=>{const r=await client.callTool(operationRequest({name,arguments:{operation,...args}}));expect(r.isError,`${name}/${operation}: ${JSON.stringify(r.isError?r.content:[])}`).not.toBe(true);expect((r.structuredContent as any).truncated).not.toBe(true);return(r.structuredContent as any).data;};
  const current=async()=>{const r=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!;return r;};
  const painted=async(revision:number)=>{await expect(v.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(revision));await expect(v.locator('.viewer-shell')).toHaveAttribute('data-render-status','ready');};
  const show=async(view:ViewSpec)=>{const before=await current();await publishPrepared(page,s,[d.id],view);const next=await waitForDisplay(page,s,d.id,x=>x.revision>before.revision&&x.appliedRevision===x.revision);await painted(next.revision);return next;};
  const nav=async(navigation:unknown)=>call('kanvas_control','navigation.control',{sessionId:s,displayId:d.id,expectedRevision:(await current()).revision,requestId:randomUUID(),navigation});
  return{s,d,v,client,call,current,painted,show,nav};
}
type Fixture=Awaited<ReturnType<typeof setup>>;
test.setTimeout(180_000);

async function stable(page:Page,selector:string){
  const sizes=await page.locator(selector).evaluate(async el=>{const values:string[]=[];for(let i=0;i<65;i++){await new Promise(requestAnimationFrame);const r=el.getBoundingClientRect();if(i>=20)values.push([r.width,r.height,el.scrollWidth,el.scrollHeight].map(x=>Math.round(x*2)/2).join(':'));}return [...new Set(values)];});
  expect(sizes,'Settled chart geometry must not oscillate between scrollbar sizes').toHaveLength(1);
}
async function contained(page:Page,selector:string){
  expect(await page.locator(selector).evaluate(el=>({horizontal:el.scrollWidth-el.clientWidth,vertical:el.scrollHeight-el.clientHeight}))).toEqual({horizontal:0,vertical:0});
}

test('authenticated producers push all six live kinds without content regeneration and the receiver acknowledges each',async({page,baseURL},info)=>{
 const a=await setup(page,info,baseURL!);try{
  for(const kind of ['number','gauge','line','area','bar','heatmap']){
   const view:ViewSpec=kind==='number'?{version:1,template:'number',data:{value:'1.2300',label:'Sensor'}}:{version:1,template:'chart',data:kind==='gauge'?{kind,gauge:{min:0,max:100},series:[{name:'Sensor',points:[{x:'Now',y:12}]}]}:{kind,series:[{name:'Sensor',points:[{x:'T1',y:12,...(kind==='heatmap'?{value:12}:{})},{x:'T2',y:18,...(kind==='heatmap'?{value:18}:{})}]}]}};
   const before=await a.show(view),data=structuredClone(before.view!.data);if(kind==='number')data.value='9007199254740993';else{(data.series as any)[0].points[0].y=23;if(kind==='heatmap')(data.series as any)[0].points[0].value=23;}
   const pushed=await a.call('kanvas_monitor','push',{sessionId:a.s,displayId:a.d.id,requestId:randomUUID(),expectedRevision:before.revision,data});await a.painted(before.revision+1);expect((await a.current()).view!.data).toEqual(data);
  }await photo(a.v,info,'live-push');
 }finally{await a.client.close();}
});
async function photo(page:Page,info:TestInfo,name:string){for(const notice of await page.getByRole('button',{name:'Dismiss notification',exact:true}).all())await notice.click();await page.evaluate(()=>document.fonts.ready);await mkdir(info.outputPath('visuals'),{recursive:true});await page.screenshot({path:`${info.outputPath('visuals')}/${info.project.name}-${name}.png`,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);}
async function asset(a:Fixture,color='#267f9f',w=240,h=120){return a.call('kanvas_import','asset.import',{sessionId:a.s,name:'Acceptance logo.svg',mimeType:'image/svg+xml',base64:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect x="1" y="1" width="${w-2}" height="${h-2}" fill="${color}" stroke="#ffffff" stroke-width="2"/><circle cx="${w/2}" cy="${h/2}" r="${h/3}" fill="#ffffff"/><text x="${w/2}" y="${h/2+5}" text-anchor="middle" fill="${color}" font-size="16">K</text></svg>`).toString('base64')});}
});
