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
import { validateView } from '../../src/shared/view-schemas';
import { samples } from '../../src/shared/template-examples';
import { gameExample } from '../../src/shared/game';
import { emailRuntime } from './email-oauth-fixture';
import { beginEmailConnector } from './email-oauth-fixture';
import { login } from './support';
import { viewerPath } from './support';
import { Store } from '../../src/server/store';
import { testDatabase } from '../postgres';
import type { ViewSpec } from '../../src/shared/types';
import { operationId } from '../../src/server/mcp/operations';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createHash } from 'node:crypto';
import { createApp } from '../../src/server/app';
import { removeTestDatabase } from '../postgres';
import { operationRequest } from '../mcp/requests.js';
import { publicReference } from '../../src/server/mcp/operations';
import { mkdir } from 'node:fs/promises';
import type { DisplayRecord } from '../../src/shared/types';
import { extendedExamples } from '../../src/shared/extended-templates';
import { readFile } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import QRCode from 'qrcode';
import type { TestInfo } from '@playwright/test';
import { TEMPLATE_IDS } from '../../src/shared/types';
import type { AssetRecord } from '../../src/shared/types';
import { showViewHeading } from '../../src/shared/display-guidance';
import type { ReportPage } from '../../src/shared/reports';
import { tab } from './support';

test.describe("weather coverage 1", () => {

const evidence='/home/deploy/kanvas-feedback-20261101-evidence';
async function clientFor(page:Page){const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable November acceptance',scopes:['read','publish']});const client=new Client({name:'november-acceptance',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',page.url()),{requestInit:{headers:{Authorization:'Bearer '+issued.data!.token}}}));return {client,call:async(operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});expect(result.isError).not.toBe(true);return (result.structuredContent as any).data;}};}
async function setup(page:Page){await register(page);const s=await createSession(page,'November acceptance'),d=await createDisplay(page,s,'Target');return {s,d};}
test('weather fills light-theme phone/desktop, no temperature scroll, daily and hourly three-second play',async({page})=>{
 const {s,d}=await setup(page);for(const times of [['Tomorrow','Day three'],['14:00','15:00']]){await publishPrepared(page,s,[d.id],{version:1,template:'weather',title:'Weather heading',showTitle:true,data:{place:'Illustrative Arendal',temperature:'12°C',condition:'storm',period:'night',details:[{label:'Wind',value:'5 m/s'},{label:'Precipitation',value:'2 mm'}],forecast:times.map(time=>({time,temperature:'10°C',condition:'rain',period:'day'}))}});await page.goto(`/view/${s}/${d.id}`);await expect(page.locator('.weather-cinema')).toBeVisible();await page.evaluate(()=>{document.querySelector('.viewer-shell')?.classList.remove('theme-dark');document.querySelector('.viewer-shell')?.classList.add('theme-light');});const bounds=await page.locator('.weather-cinema').evaluate(el=>{const r=el.getBoundingClientRect(),reading=document.querySelector('.weather-scene-reading')!;return {top:r.top,bottom:r.bottom,height:innerHeight,overflow:getComputedStyle(reading).overflowY,readBottom:reading.getBoundingClientRect().bottom,footer:document.querySelector('.weather-time-strip')!.getBoundingClientRect().top};});expect(bounds.top).toBeLessThanOrEqual(1);expect(bounds.bottom).toBeGreaterThanOrEqual(bounds.height-1);/* 2026-11-10 (aca837d4): the text block never scrolls; it shrinks in steps and is cut off instead. */expect(bounds.overflow).toBe('hidden');expect(bounds.readBottom).toBeLessThan(bounds.footer);await expect(page.locator('.weather-lightning')).toBeHidden();for(const close of await page.locator('.viewer-toast button').all())await close.click();await page.screenshot({path:`${evidence}/${test.info().project.name}-weather-${times[0]}.png`});// Restart playback deliberately so overview and both forecast transitions have a known timer origin.
 await page.locator('.weather-time-strip ol li').first().getByRole('button').click();
 await expect(page.locator('.weather-cinema')).toHaveAttribute('data-weather-moment','-1');
 await page.emulateMedia({reducedMotion:'no-preference'});
 const transitions=await page.locator('.weather-cinema').evaluate(el=>new Promise<{moment:string|null,elapsed:number}[]>((resolve,reject)=>{
  const observed:{moment:string|null,elapsed:number}[]=[],start=performance.now();
  const timeout=setTimeout(()=>{observer.disconnect();reject(new Error('Forecast did not advance twice within 9 seconds'));},9000);
  const observer=new MutationObserver(()=>{observed.push({moment:el.getAttribute('data-weather-moment'),elapsed:performance.now()-start});if(observed.length===2){clearTimeout(timeout);observer.disconnect();resolve(observed);}});
  observer.observe(el,{attributes:true,attributeFilter:['data-weather-moment']});
  (el.querySelector('.weather-play') as HTMLButtonElement).click();
 }));
 expect(transitions.map(x=>x.moment)).toEqual(['0','1']);
 // Compare absolute deadlines: a late paint must not make the following 3s interval look short.
 // Both deadlines still reject the former 2s cadence; allow 100ms clock tolerance and 1.5s late paint.
 for(const [i,transition] of transitions.entries()){expect(transition.elapsed).toBeGreaterThanOrEqual((i+1)*3000-100);expect(transition.elapsed).toBeLessThanOrEqual((i+1)*3000+1500);}
 await page.emulateMedia({reducedMotion:'reduce'});const index=await page.locator('.weather-cinema').getAttribute('data-weather-moment');await page.waitForTimeout(3300);await expect(page.locator('.weather-cinema')).toHaveAttribute('data-weather-moment',index!);}
});
});

test.describe("weather coverage 2", () => {

const quiet=async(page:Page)=>{for(const button of await page.locator('.viewer-toast button').all())await button.click();};
const fact=(text:string)=>({version:1 as const,template:'fact' as const,data:{text}});

test('weather visual-only suppresses all prose while preserving optional data and eight-detail layout',async({page},info)=>{
 await register(page);const s=await createSession(page,'Weather options'),d=await createDisplay(page,s,'Weather'),viewer=await openViewer(page,s,d.id);
 const data={condition:'rain',place:'Arendal',description:'Rain showers',details:Array.from({length:8},(_,i)=>({label:'Detail '+i,value:'Value '+i})),forecast:[{time:'16:00',condition:'storm'}]};
 await publishPrepared(page,s,[d.id],validateView({template:'weather',data:{...data,display:{visualOnly:true}}}));const root=viewer.locator('.viewer-candidate .weather-cinema');await expect(root).toBeVisible();await expect(root).not.toContainText('Arendal');await expect(root).not.toContainText('Rain showers');await expect(root.locator('.weather-time-strip')).toHaveCount(0);await quiet(viewer);await viewer.screenshot({path:info.outputPath('weather-visual-only.png')});
 await publishPrepared(page,s,[d.id],validateView({template:'weather',data}));await expect(root.locator('dl>div')).toHaveCount(8);const bounds=await root.evaluate(e=>{const r=e.getBoundingClientRect(),b=e.querySelector('.weather-scene-reading')!.getBoundingClientRect();return {bottom:b.bottom,limit:r.top+r.height*.75};});expect(bounds.bottom).toBeLessThanOrEqual(bounds.limit+2);await quiet(viewer);await viewer.screenshot({path:info.outputPath('weather-eight.png')});
});
});

test.describe("weather coverage 3", () => {


const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({template,data,...extra} as never) as ViewSpec;
/** Publish and wait until this window has painted that revision: a measurement taken while the previous
 * view is being replaced reads an element that is already detached (empty computed style, no box). */
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov10 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov10-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const inside=(inner:{x:number;y:number;width:number;height:number},outer:{x:number;y:number;width:number;height:number},slack=1.5)=>inner.x>=outer.x-slack&&inner.y>=outer.y-slack&&inner.x+inner.width<=outer.x+outer.width+slack&&inner.y+inner.height<=outer.y+outer.height+slack;

test('weather text block sits low, clear of the place and time, and never scrolls (20722a0f, aca837d4)',async({page},info)=>{
 const {s,d,viewer}=await setup(page,'Weather layout');
 const details=Array.from({length:6},(_,i)=>({label:['Wind','Humidity','Pressure','Visibility','UV index','Feels like'][i],value:['6 m/s SW','78 %','1012 hPa','18 km','1','7°'][i]}));
 const forecast=Array.from({length:12},(_,i)=>({time:`${String(8+i).padStart(2,'0')}:00`,temperature:`${6+i%4}°`,condition:i%3?'cloudy':'rain'}));
 const check=async(label:string)=>{
  const reading=viewer.locator('.viewer-candidate .weather-scene-reading');await expect(reading).toBeVisible();
  await expect.poll(async()=>reading.evaluate(el=>(el as HTMLElement).dataset.weatherFit??'')).not.toBe('');
  const geometry=await viewer.locator('.viewer-candidate .weather-cinema').evaluate(root=>{const box=root.getBoundingClientRect(),reading=root.querySelector('.weather-scene-reading')!,heading=root.querySelector('.weather-scene-heading')!,strip=root.querySelector('.weather-time-strip');const r=reading.getBoundingClientRect(),h=heading.getBoundingClientRect(),style=getComputedStyle(reading);return {height:box.height,top:box.top,readingTop:r.top,readingBottom:r.bottom,headingBottom:h.bottom,headingHasText:Boolean(heading.textContent?.trim()),stripTop:strip?strip.getBoundingClientRect().top:null,overflowY:style.overflowY,scrollable:reading.scrollHeight>reading.clientHeight+1&&['auto','scroll'].includes(style.overflowY),clipped:(reading as HTMLElement).dataset.weatherClipped==='true'};});
  expect(geometry.overflowY,label).toBe('hidden');expect(geometry.scrollable,label).toBe(false);
  if(geometry.headingHasText)expect(geometry.readingTop,`${label}: below the place and time`).toBeGreaterThanOrEqual(geometry.headingBottom-1);
  if(geometry.stripTop!==null)expect(geometry.readingBottom,`${label}: above the timeline`).toBeLessThanOrEqual(geometry.stripTop+1);
  if(geometry.height>451){
   // Bottom edge rests on the horizon (73% down) and the block is in the lower part of its space, not under the header.
   expect((geometry.readingBottom-geometry.top)/geometry.height,`${label}: above the horizon`).toBeLessThanOrEqual(.74);
   expect((geometry.readingBottom-geometry.top)/geometry.height,`${label}: low on the screen`).toBeGreaterThan(.55);
  }
  await viewer.screenshot({path:info.outputPath(`weather-${label}.png`)});
 };
 await shown(page,viewer,s,d.id,view('weather',{place:'Arendal',timeLabel:'Sat 18:00',condition:'cloudy',temperature:'7°',high:'9°',low:'3°',description:'Cloudy through the evening with a light breeze from the south-west. Some drizzle is possible after eight. Clearing slowly towards midnight.',details,forecast}));
 await check('rich');
 await shown(page,viewer,s,d.id,view('weather',{place:'Arendal',timeLabel:'Sat 18:00',condition:'cloudy',temperature:'7°',display:{description:false,details:false,timeline:false}}));
 await check('temperature-only');
 await shown(page,viewer,s,d.id,view('weather',{place:'Arendal',condition:'rain',temperature:'-12°',high:'-9°',low:'-15°',description:'x '.repeat(190).trim(),details:Array.from({length:8},(_,i)=>({label:`Detail ${i+1}`,value:`Value ${i+1} with a longer text`})),forecast}));
 await check('maximum');
});
});

test.describe("weather coverage 4", () => {


const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({version:1,template,data,...extra} as never) as ViewSpec;
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov14 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov14-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,canonical:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId:operationId(canonical),arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const fact=(text:string)=>({version:1,template:'fact',data:{text}});
const pane=(id:string,inner:Record<string,unknown>=fact(id))=>({id,view:inner});
const pie=(kind:'pie'|'donut')=>({version:1,template:'chart',data:{kind,series:[{name:'Share',points:[{x:'Alpha',y:40},{x:'Beta',y:30},{x:'Gamma',y:20},{x:'Delta',y:10}]}]}});

test('weather strip follows the active step; choropleth fills the height without credit text; sign label sits under its pictogram (04dc0e65, 8bfdf7b0, f430f4e8, 99ba310f)',async({page})=>{
 const {s,d,viewer}=await setup(page,'Weather map sign');
 const forecast=Array.from({length:24},(_,i)=>({time:`2026-11-12T${String(i).padStart(2,'0')}:00:00+01:00`,temperature:`${5+i%6}°`,condition:i%3?'cloudy':'rain'}));
 await shown(page,viewer,s,d.id,view('weather',{place:'Oslo',temperature:'6°',condition:'cloudy',forecast}));
 const strip=viewer.locator('.viewer-candidate .weather-time-strip ol');await expect(strip.locator('li')).toHaveCount(25);
 await viewer.locator('.viewer-candidate .weather-play').click();
 const visible=async()=>strip.evaluate(el=>{const active=el.querySelector('[aria-current="step"]')?.closest('li');if(!active)return null;const a=active.getBoundingClientRect(),b=el.getBoundingClientRect();return {inside:a.left>=b.left-1&&a.right<=b.right+1,index:[...el.children].indexOf(active)};});
 for(const index of [14,22,3]){
  await strip.locator('li').nth(index).locator('button').evaluate(el=>(el as HTMLButtonElement).click());
  await expect.poll(visible,{message:`step ${index} is shown on the strip`}).toEqual({inside:true,index});
 }
 // World choropleth with everything off.
 const world=['US','CA','MX','BR','AR','GB','FR','DE','ES','IT','NO','SE','FI','RU','CN','IN','JP','AU','NZ','ZA','EG','NG','KE','SA','TR','ID','KZ','MN','CL','PE','GL'].map((code,i)=>({id:code,countryCode:code,value:i+1}));
 await shown(page,viewer,s,d.id,view('chart',{kind:'choropleth',series:[],regions:[...world,{id:'SG',countryCode:'SG',value:9}]}));
 const body=viewer.locator('.viewer-candidate .advanced-chart-body');await expect(body.locator('path[data-chart-region]').first()).toBeVisible();
 await expect(viewer.locator('.viewer-candidate')).not.toContainText('Natural Earth');await expect(viewer.locator('.viewer-candidate')).not.toContainText('Dots mark');
 await expect(viewer.locator('.viewer-candidate .advanced-color-scale')).toBeVisible();
 const fill=await body.evaluate(el=>{const svg=el.querySelector('svg')!.getBoundingClientRect();return {share:svg.height/el.clientHeight,overflow:el.scrollHeight-el.clientHeight};});
 expect(fill.share).toBeGreaterThan(.85);expect(fill.overflow).toBeLessThanOrEqual(1);
 await shown(page,viewer,s,d.id,view('chart',{kind:'choropleth',series:[],territoryNote:true,regions:[...world,{id:'SG',countryCode:'SG',value:9}]}));
 await expect(viewer.locator('.viewer-candidate .choropleth-territory-note')).toBeVisible();
 // Signage with an arrow.
 await shown(page,viewer,s,d.id,view('signage',{region:'no',items:[{id:'wc',type:'restroom',direction:'right',label:'Restrooms'}]}));
 const card=viewer.locator('.viewer-candidate .signage-card');await expect(card.locator('h2')).toHaveText('Restrooms');
 await expect.poll(async()=>card.evaluate(el=>{const art=el.querySelector('.sign-reviewed-composition')!.getBoundingClientRect(),label=el.querySelector('h2')!,range=document.createRange();range.selectNodeContents(label);const text=range.getBoundingClientRect();return Math.abs(art.left+art.width/2-(text.left+text.width/2));})).toBeLessThan(6);
 expect(await card.evaluate(el=>{const box=el.getBoundingClientRect(),label=el.querySelector('h2')!.getBoundingClientRect();return label.left>=box.left-1&&label.right<=box.right+1;})).toBe(true);
});
});

test.describe("weather coverage 5", () => {

const evidence='/home/deploy/kanvas-feedback-20261029-evidence';
async function clientFor(page:Page){const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable feedback acceptance',scopes:['read','publish']});expect(issued.status).toBe(201);const client=new Client({name:'feedback-acceptance',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',page.url()),{requestInit:{headers:{Authorization:'Bearer '+issued.data!.token}}}));return {client,call:async(operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});expect(result.isError).not.toBe(true);return (result.structuredContent as any).data;}};}
test('procedural forecast scenes preserve data across conditions and a selectable time axis',async({page})=>{
 await register(page);const s=await createSession(page,'Weather visual acceptance'),d=await createDisplay(page,s,'Weather');
 for(const [condition,period] of [['clear','day'],['partly-cloudy','sunset'],['rain','day'],['snow','night'],['storm','night'],['fog','sunrise']] as const){await publishPrepared(page,s,[d.id],{version:1,template:'weather',data:{place:'Illustrative atmosphere',temperature:'12°C',condition,period,intensity:.8,details:[{label:'Wind',value:'5 m/s'},{label:'Precipitation',value:'2 mm'}],forecast:[{time:'14:00',temperature:'10°C',condition:'rain',intensity:.9},{time:'Tomorrow',temperature:'2°C',condition:'snow',period:'night'}]}});await page.goto(`/view/${s}/${d.id}`);await expect(page.locator('.weather-scene')).toBeVisible();await expect(page.locator('.weather-scene-reading')).toContainText('5 m/s');for(const close of await page.locator('.viewer-toast button').all())await close.click();await page.waitForTimeout(200);await page.screenshot({path:`${evidence}/${test.info().project.name}-weather-${condition}.png`});expect(await page.locator('.weather-scene').evaluate((el:HTMLCanvasElement)=>el.width>100&&el.height>100)).toBe(true);}
 await page.getByRole('button',{name:/Tomorrow/}).click();await expect(page.locator('.weather-cinema')).toHaveAttribute('data-weather-moment','1');await expect(page.locator('.weather-scene-reading')).toContainText('Snow');await expect(page.locator('.weather-scene-reading')).not.toContainText('5 m/s');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});
test('weather animation obeys reduced motion and visibility with local WebGL fallback',async({page})=>{
 await page.addInitScript(()=>{const original=WebGLRenderingContext.prototype.drawArrays;WebGLRenderingContext.prototype.drawArrays=function(...args:Parameters<typeof original>){(window as any).__weatherFrames=((window as any).__weatherFrames??0)+1;return original.apply(this,args);};});
 await register(page);const s=await createSession(page,'Motion policy'),d=await createDisplay(page,s,'Weather');await publishPrepared(page,s,[d.id],{version:1,template:'weather',data:{place:'Motion acceptance',temperature:'8°C',condition:'rain',period:'day',forecast:[{time:'Later',temperature:'1°C',condition:'snow',period:'night'}]}});await page.goto(`/view/${s}/${d.id}`);await expect(page.locator('[data-atmosphere="volumetric"]')).toBeVisible();await page.waitForTimeout(1200);const frames=()=>page.evaluate(()=>(window as any).__weatherFrames as number),staticFrames=await frames();await page.waitForTimeout(1100);expect(await frames()).toBe(staticFrames);
 await page.emulateMedia({reducedMotion:'no-preference'});await expect.poll(frames).toBeGreaterThan(staticFrames+2);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});const hidden=await frames();await page.waitForTimeout(500);expect(await frames()).toBe(hidden);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await expect.poll(frames).toBeGreaterThan(hidden);
 await page.emulateMedia({reducedMotion:'reduce'});const retainedConditions=await page.locator('.weather-scene-reading').innerText();expect(retainedConditions).toMatch(/(?:8|1)°C/);await page.locator('.weather-scene').evaluate((el:HTMLCanvasElement)=>el.getContext('webgl')!.getExtension('WEBGL_lose_context')!.loseContext());await expect(page.locator('[data-atmosphere="volumetric"]')).toHaveCount(0);await expect(page.locator('.weather-scene')).toBeVisible();await expect(page.locator('.weather-scene-reading')).toHaveText(retainedConditions,{useInnerText:true});
});
});

test.describe("weather coverage 6", () => {


const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
async function connect(page:Page,baseURL:string,sessionId?:string){
  const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable September acceptance',scopes:['read','publish'],...(sessionId?{sessionIds:[sessionId]}:{})});
  expect(issued.status).toBe(201);const client=new Client({name:'september-acceptance',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${issued.data!.token}`}}}));return client;
}
async function call<T=unknown>(client:Client,name:string,args:Record<string,unknown>):Promise<T>{const ref=publicReference(name);if(!ref)throw new Error('Missing public mapping');const result=await client.callTool(operationRequest({name:ref.tool,arguments:{operation:ref.operation,...args}}));expect(result.isError,`${name} succeeds`).not.toBe(true);return (result.structuredContent as {data:T}).data;}
async function setup(page:Page){await register(page);const sessionId=await createSession(page,'September display lab'),display=await createDisplay(page,sessionId,'Receiving screen');return {sessionId,display};}
async function painted(page:Page,sessionId:string,displayId:string,template:string){return waitForDisplay(page,sessionId,displayId,d=>d.view?.template===template&&d.appliedRevision===d.revision&&d.revision>0);}

test('weather atmosphere changes with supplied conditions without fetching forecasts',async({page})=>{
  const {sessionId,display}=await setup(page),viewer=await openViewer(page,sessionId,display.id);await viewer.bringToFront();const external:string[]=[];
  viewer.on('request',request=>{if(!request.url().startsWith(new URL(page.url()).origin))external.push(new URL(request.url()).host);});
  for(const condition of ['clear','partly-cloudy','cloudy','rain','snow','storm','fog']){
    const period=condition==='clear'?'sunset':'night';await publishPrepared(page,sessionId,[display.id],{version:1,template:'weather',data:{place:'Supplied location',temperature:'12.00°',condition,period,forecast:[{time:'18:00',temperature:'11.5°',condition}]}});await painted(page,sessionId,display.id,'weather');
    await expect(viewer.locator(`.weather-${condition}.weather-period-${period}`)).toBeVisible();await expect(viewer.locator('.weather-temperature')).toHaveText('12.00°');
  }
  expect(external).toEqual([]);
});
});

test.describe("weather coverage 7", () => {


const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
async function setup(page:Page){await register(page);const s=await createSession(page,'September 13 visual review'),d=await createDisplay(page,s,'Receiving screen'),viewer=await openViewer(page,s,d.id);await viewer.bringToFront();return {s,d,viewer};}
async function show(page:Page,viewer:Page,s:string,d:string,view:ViewSpec){
  const before=(await sessionDetail(page,s)).displays.find(x=>x.id===d)!.revision;
  await publishPrepared(page,s,[d],view);
  // The full-template sweep's overview decodes fifty retained previews on this capped VM.
  const current=await waitForDisplay(page,s,d,x=>x.revision>before&&x.view?.template===view.template&&x.appliedRevision===x.revision,view.template==='overview'?{timeout:30_000,message:'Retained overview completes real painted delivery'}:{});
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status','ready');
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));
  await expect(viewer.locator('.viewer-candidate')).toBeVisible();
  await viewer.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
}
async function photo(viewer:Page,info:TestInfo,name:string){await mkdir(info.outputPath('visuals'),{recursive:true});await viewer.screenshot({path:`${info.outputPath('visuals')}/${info.project.name}-${name}.png`,animations:'disabled'});}

test('weather gives conditions and explicit highs/lows the surface, with full details on demand',async({page},info)=>{
  const {s,d,viewer}=await setup(page);
  const external:string[]=[];viewer.on('request',r=>{if(new URL(r.url()).origin!==new URL(page.url()).origin)external.push(new URL(r.url()).host);});
  const original=validateView({version:1,template:'weather',title:'Arendal, Norway Tomorrow',data:{place:'Arendal, Norway',temperature:'19C / 12C',condition:'rain',period:'day',description:'Morning rain and drizzle clearing later, light winds.'}});
  await show(page,viewer,s,d.id,original);await expect(viewer.locator('.weather-scene')).toBeVisible();await expect(viewer.locator('.weather-temperature')).toHaveText('19C / 12C');await expect(viewer.locator('.weather-temperature')).toBeInViewport();await photo(viewer,info,'weather-reported-payload');
  const explicit=validateView({version:1,template:'weather',showControls:true,data:{place:'Arendal, Norway',timeLabel:'Tomorrow',high:'19°C',low:'12°C',condition:'rain',description:'Morning rain, clearer later.',forecast:[{time:'08:00',temperature:'12.00°C',condition:'rain'},{time:'14:00',temperature:'19.00°C',condition:'partly-cloudy'}],details:[{label:'Wind',value:'4.000 m/s'}]}});
  await show(page,viewer,s,d.id,explicit);
  await expect(viewer.locator('.weather-scene')).toBeInViewport();
  await expect(viewer.locator('.weather-scene-reading')).toContainText('High 19°C');await expect(viewer.locator('.weather-scene-reading')).toContainText('Low 12°C');await expect(viewer.locator('.weather-temperature')).toHaveCount(0);
  await expect(viewer.getByText('4.000 m/s',{exact:true})).toBeVisible();await photo(viewer,info,'weather-range');
  await viewer.getByRole('button',{name:/14:00/}).click();await expect(viewer.locator('.weather-scene-reading')).toContainText('19.00°C');await expect(viewer.locator('.weather-scene-reading')).not.toContainText('4.000 m/s');
  await expect(viewer.getByLabel('About this view',{exact:true})).toHaveCount(0);await expect(viewer.locator('.view-information')).toHaveCount(0);
  expect(external).toEqual([]);expect((await sessionDetail(page,s)).displays.find(item => item.id === d.id)!.view?.data).toEqual(explicit.data);
});

test('weather variants stay recognizable and legible on the actual receiving screen',async({page},info)=>{
  test.setTimeout(150000);const {s,d,viewer}=await setup(page);
  for(const condition of ['clear','partly-cloudy','cloudy','rain','snow','storm','fog'] as const){
    const period=condition==='clear'?'night':'day';await show(page,viewer,s,d.id,validateView({version:1,template:'weather',data:{place:'Supplied location',temperature:'12.00°',condition,period}}));
    await expect(viewer.locator('.weather-scene')).toBeInViewport();await expect(viewer.locator('.weather-temperature')).toBeInViewport();await expect(viewer.locator('.weather-scene-reading h2')).toBeInViewport();await viewer.waitForTimeout(1100);
    expect(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await photo(viewer,info,`weather-${condition}`);
  }
});
});
