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
import { operationRequest } from '../mcp/requests.js';
import { publicReference } from '../../src/server/mcp/operations';
import { mkdir } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { DisplayRecord } from '../../src/shared/types';
import {templateExampleData} from '../../src/shared/template-examples';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { TestInfo } from '@playwright/test';
import { isolatedContext } from './support';

test.describe("map coverage 1", () => {


const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({template,data,...extra} as never) as ViewSpec;
/** Publish and wait until this window has painted that revision: a measurement taken while the previous
 * view is being replaced reads an element that is already detached (empty computed style, no box). */
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov10 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov10-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const inside=(inner:{x:number;y:number;width:number;height:number},outer:{x:number;y:number;width:number;height:number},slack=1.5)=>inner.x>=outer.x-slack&&inner.y>=outer.y-slack&&inner.x+inner.width<=outer.x+outer.width+slack&&inner.y+inner.height<=outer.y+outer.height+slack;

test('choropleth scale stays inside a short landscape screen (b2640923)',async({page},info)=>{
 const {s,d,viewer}=await setup(page,'Choropleth');
 const codes=['US','CA','MX','BR','AR','GB','FR','DE','NO','SE','ES','IT','RU','CN','IN','JP','AU','ZA','EG','HK'];
 await publishPrepared(page,s,[d.id],view('chart',{kind:'choropleth',regions:codes.map((countryCode,i)=>({id:countryCode,countryCode,value:(i+1)*7}))}));
 for(const size of info.project.name.startsWith('phone')?[{width:844,height:390},{width:390,height:844}]:[{width:960,height:540},{width:905,height:395},{width:1440,height:900}]){
  await viewer.setViewportSize(size);const scale=viewer.locator('.viewer-candidate .advanced-color-scale');await expect(scale).toBeVisible();
  await expect.poll(async()=>{const box=await scale.boundingBox();return box?box.y+box.height:Infinity;},{timeout:8000,message:`scale inside ${size.width}x${size.height}`}).toBeLessThanOrEqual(size.height+1);
  await expect(viewer.locator('.viewer-candidate .choropleth-warning')).toHaveCount(0);
  await viewer.screenshot({path:info.outputPath(`choropleth-${size.width}x${size.height}.png`)});
 }
});
});

test.describe("map coverage 2", () => {

const photo='https://example.com/feedback-photo.png';
const image='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#c9e4f0"/><path d="M0 160L95 35L185 150L260 50L320 155Z" fill="#36745b"/><rect y="150" width="320" height="30" fill="#2986b2"/><text x="12" y="24" font-family="sans-serif" font-size="16" fill="#173849">Synthetic image fixture</text></svg>';
async function setup(page:Page){await page.context().route('https://example.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:image}));await page.context().route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/svg+xml',body:image}));await register(page);const sessionId=await createSession(page,'Synthetic feedback acceptance'),display=await createDisplay(page,sessionId,'Feedback');const viewer=await openViewer(page,sessionId,display.id);return{sessionId,display,viewer};}
async function show(page:Page,viewer:Page,sessionId:string,id:string,view:ViewSpec){const before=(await sessionDetail(page,sessionId)).displays.find(d=>d.id===id)!.revision;await publishPrepared(page,sessionId,[id],view);const current=await waitForDisplay(page,sessionId,id,d=>d.revision>before&&d.appliedRevision===d.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));await viewer.evaluate(()=>document.fonts.ready.then(()=>undefined));}
const v=(template:ViewSpec['template'],data:Record<string,unknown>):ViewSpec=>({version:1,template,data});
test('Cartesian emphasis, reference targets and built-in geography render actual geometry',async({page},info)=>{const{sessionId,display,viewer}=await setup(page);const surface=viewer.locator('.viewer-candidate');await show(page,viewer,sessionId,display.id,v('chart',{kind:'bar',series:[{name:'Bookings',points:[{x:'Fri',y:20},{x:'Sat',y:32},{x:'Sun',y:15}]}],emphasis:[{series:'Bookings',point:1,color:'#ff8800'}],referenceLines:[{value:40,label:'Target'}]}));await expect(surface.locator('[data-emphasis=true]')).toHaveCount(1);await expect(surface.getByText('Target')).toBeVisible();await viewer.screenshot({animations:'disabled',path:info.outputPath('chart-emphasis.png')});await show(page,viewer,sessionId,display.id,v('chart',{kind:'choropleth',regions:[{id:'NO',countryCode:'NO',value:30},{id:'SWE',countryCode:'SWE',value:45},{id:'FIN',countryCode:'FIN',value:25}]}));await expect(surface.locator('[data-chart-region]')).toHaveCount(3);await expect(surface.getByText(/Natural Earth/)).toHaveCount(0);expect((await surface.locator('[data-chart-region=NO]').getAttribute('d'))!.length).toBeGreaterThan(100);await viewer.screenshot({animations:'disabled',path:info.outputPath('country-geography.png')});
});
test('map marker rich popup is inert and itinerary days retain visible detail and images',async({page},info)=>{const{sessionId,display,viewer}=await setup(page),surface=viewer.locator('.viewer-candidate');await show(page,viewer,sessionId,display.id,v('map',{markers:[{lat:59.9,lng:10.7,label:'Oslo',iconUrl:photo,color:'#ff8800',popupHtml:'<b>Supplied stats</b><p>Visitors: 42</p><img src=x onerror="window.popupInjected=true"><script>window.popupInjected=true</script><a href="javascript:alert(1)">Unsafe link</a>'}]}));await surface.locator('.leaflet-marker-icon').click();await expect(surface.locator('.leaflet-popup-content b')).toHaveText('Supplied stats');await expect(surface.locator('.leaflet-popup-content script,.leaflet-popup-content img,.leaflet-popup-content [onerror],.leaflet-popup-content a[href]')).toHaveCount(0);expect(await viewer.evaluate(()=>Boolean((window as unknown as Record<string,unknown>).popupInjected))).toBe(false);await expect(surface.locator('.leaflet-popup-content b')).toBeVisible();await viewer.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await viewer.screenshot({animations:'disabled',path:info.outputPath('safe-map-popup.png')});
 const days=[{date:'2026-10-01',title:'Oslo to Bergen',items:[{time:'09:00',title:'Flight Oslo → Bergen',category:'flight',place:'Oslo airport',description:'Exact departure details',coordinates:{lat:60.19,lng:11.1}},{time:'12:00',title:'Waterfront stroll',category:'walk',place:'Bergen',description:'Scenic highlight',coordinates:{lat:60.39,lng:5.32},image:{url:photo,alt:'Bergen waterfront'}}]},{date:'2026-10-02',title:'Fjord day',items:[{time:'10:00',title:'Fjord cruise',category:'boat',description:'Full day two detail',coordinates:{lat:60.5,lng:6.8}}]}];await show(page,viewer,sessionId,display.id,v('itinerary',{layout:'list',days}));await expect(surface.locator('.itinerary-detail h3 .category-icon')).toHaveCount(0);await expect(surface.getByAltText('Bergen waterfront')).toHaveCount(1);await viewer.screenshot({animations:'disabled',path:info.outputPath('itinerary-list.png')});/* 2026-11-10 (341c9d9b): day buttons are opt-in on-screen navigation. */await show(page,viewer,sessionId,display.id,{...v('itinerary',{layout:'map',days}),showControls:true});await expect(surface.getByText('Exact departure details')).toHaveCount(1);await surface.getByRole('button',{name:'Day 2 · 2026-10-02'}).click();await expect(surface.locator('.itinerary-content section')).toHaveCount(1);await expect(surface.getByText('Full day two detail')).toHaveCount(1);await surface.getByRole('button',{name:'Whole trip'}).click();await expect(surface.locator('.itinerary-content section')).toHaveCount(2);await expect(surface.locator('.leaflet-tooltip')).toHaveCount(3);await viewer.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await viewer.screenshot({animations:'disabled',path:info.outputPath('itinerary-map.png')});
});
});

test.describe("map coverage 3", () => {


const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
async function connect(page:Page,baseURL:string,sessionId?:string){
  const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable September acceptance',scopes:['read','publish'],...(sessionId?{sessionIds:[sessionId]}:{})});
  expect(issued.status).toBe(201);const client=new Client({name:'september-acceptance',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${issued.data!.token}`}}}));return client;
}
async function call<T=unknown>(client:Client,name:string,args:Record<string,unknown>):Promise<T>{const ref=publicReference(name);if(!ref)throw new Error('Missing public mapping');const result=await client.callTool(operationRequest({name:ref.tool,arguments:{operation:ref.operation,...args}}));expect(result.isError,`${name} succeeds`).not.toBe(true);return (result.structuredContent as {data:T}).data;}
async function setup(page:Page){await register(page);const sessionId=await createSession(page,'September display lab'),display=await createDisplay(page,sessionId,'Receiving screen');return {sessionId,display};}
async function painted(page:Page,sessionId:string,displayId:string,template:string){return waitForDisplay(page,sessionId,displayId,d=>d.view?.template===template&&d.appliedRevision===d.revision&&d.revision>0);}

test('maps use browser identification, occupy the screen edge, and bind marks geographically',async({page,baseURL})=>{
  const {sessionId,display}=await setup(page),viewer=await openViewer(page,sessionId,display.id),client=await connect(page,baseURL!,sessionId),refs:string[]=[];await viewer.bringToFront();
  await viewer.route('https://tile.openstreetmap.org/**',route=>{refs.push(route.request().headers().referer??'');return route.fulfill({contentType:'image/png',body:PNG});});
  try{
    await publishPrepared(page,sessionId,[display.id],{version:1,template:'map',data:{center:{lat:59.91,lng:10.75},zoom:12,markers:[{lat:59.91,lng:10.75,label:'Supplied marker'}]}});await painted(page,sessionId,display.id,'map');
    expect(refs.length).toBeGreaterThan(0);expect(refs.every(x=>x===new URL(baseURL!).origin+'/')).toBe(true);
    const box=await viewer.locator('.map-surface').boundingBox(),size=viewer.viewportSize()!;expect(box!.x).toBeLessThanOrEqual(1);expect(box!.width).toBeGreaterThanOrEqual(size.width-2);
    await viewer.getByRole('button',{name:'Display controls',exact:true}).click();await viewer.getByRole('button',{name:'Screen options'}).click();await viewer.getByLabel('Annotate this view').check();await viewer.getByRole('button',{name:'Close screen options',exact:true}).click();await viewer.mouse.click(box!.x+box!.width/2,box!.y+box!.height/2);
    await expect.poll(async()=>{const inbox=await call<{interactions:{value:{target?:{type:string;locations?:{lat:number;lng:number}[]}}}[]}>(client,'kanvas_interactions_read',{sessionId});const target=inbox.interactions.find(x=>x.value.target?.type==='map')?.value.target;return Boolean(target?.locations?.some(x=>Math.abs(x.lat-59.91)<.02&&Math.abs(x.lng-10.75)<.02));}).toBe(true);
  }finally{await client.close();}
});
});

test.describe("map coverage 4", () => {


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
test('safe rich permanent map tooltip and remotely selected itinerary days',async({page,baseURL},info)=>{
 const unwanted:string[]=[];page.context().on('request',r=>{if(r.url().includes('evil.test'))unwanted.push(r.url());});
 await page.context().route('https://tile.openstreetmap.org/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e0e7e0"/></svg>'}));
 const a=await setup(page,info,baseURL!);try{
  await a.show({version:1,template:'map',data:{contentDisplay:'permanent',markers:[{lat:59.9,lng:10.7,popupHtml:'<div style="display:flex;gap:8px;background-color:#abcdef;position:fixed"><strong>Safe heading</strong><span style="color:#123456;background-image:url(https://evil.test/css)">42</span><script>window.untrustedExecuted=true</script><img src="https://evil.test/pixel"><iframe src="https://evil.test/frame"></iframe><style>body{display:none}</style></div>'}]}});
  const tooltip=a.v.locator('.viewer-candidate .map-permanent-content');await expect(tooltip).toBeVisible();await expect(tooltip.locator('strong')).toHaveText('Safe heading');await expect(tooltip.locator('.safe-map-content>div')).toHaveCSS('display','flex');expect(await tooltip.locator('script,img,iframe,style')).toHaveCount(0);expect(await tooltip.locator('.safe-map-content>div').evaluate(e=>(e as HTMLElement).style.position)).toBe('');expect(unwanted).toEqual([]);
  const geometry=async()=>tooltip.evaluate(e=>{const box=e.getBoundingClientRect(),map=e.closest('.map-surface')!.getBoundingClientRect(),heading=e.querySelector('strong,h3')!,range=document.createRange();range.selectNodeContents(heading);return {width:box.width,left:box.left,right:box.right,mapWidth:map.width,mapLeft:map.left,mapRight:map.right,headingLines:range.getClientRects().length};});
  const fit=await geometry();expect(fit.width).toBeGreaterThan(100);expect(fit.width).toBeLessThanOrEqual(Math.min(340,fit.mapWidth-32)+1);expect(fit.headingLines).toBe(1);expect(fit.left).toBeGreaterThanOrEqual(fit.mapLeft);expect(fit.right).toBeLessThanOrEqual(fit.mapRight);await photo(a.v,info,'map-tooltip');
  await a.show({version:1,template:'map',data:{contentDisplay:'permanent',markers:[{lat:59.9,lng:10.7,popupHtml:`<div><h3>Regional report</h3><table><tr><th>Metric</th><td>42</td></tr></table><p>${'LongReference'.repeat(30)}</p></div>`}]}});
  await expect(tooltip.locator('h3')).toHaveText('Regional report');const longFit=await geometry();expect(longFit.width).toBeLessThanOrEqual(Math.min(340,longFit.mapWidth-32)+1);expect(longFit.headingLines).toBe(1);expect(longFit.left).toBeGreaterThanOrEqual(longFit.mapLeft);expect(longFit.right).toBeLessThanOrEqual(longFit.mapRight);expect(await tooltip.locator('.safe-map-content').evaluate(e=>e.scrollWidth<=e.clientWidth+2)).toBe(true);await photo(a.v,info,'map-tooltip-long');
  /* 2026-11-10 (341c9d9b): day buttons are on-screen navigation and now opt-in; the agent's selectDay works either way. */await a.show({version:1,template:'itinerary',showControls:true,data:{layout:'map',days:[{date:'2026-10-03',items:[{title:'First place',coordinates:{lat:59.9,lng:10.7}}]},{date:'2026-10-04',items:[{title:'Second place',coordinates:{lat:60.4,lng:5.3}}]}]}});
  await a.nav({action:'selectDay',day:2});await expect(a.v.getByRole('button',{name:/Day 2/})).toHaveAttribute('aria-pressed','true');await expect(a.v.locator('.viewer-candidate .itinerary-content')).toContainText('Second place');await expect(a.v.locator('.viewer-candidate .itinerary-content')).not.toContainText('First place');
  await a.nav({action:'selectDay',day:'all'});await expect(a.v.getByRole('button',{name:'Whole trip'})).toHaveAttribute('aria-pressed','true');await expect(a.v.locator('.viewer-candidate .itinerary-content')).toContainText('First place');await photo(a.v,info,'itinerary-day');
 }finally{await a.client.close();}
});
test('small country points, graceful exclusions and inline leg maps render',async({page,baseURL},info)=>{
 const a=await setup(page,info,baseURL!);try{
  await a.show({version:1,template:'chart',data:{kind:'choropleth',regions:[{id:'no',countryCode:'NO',value:4},{id:'sg',countryCode:'SG',value:2},{id:'mt',countryCode:'MT',value:3},{id:'unknown',countryCode:'XX',value:8}]}});
  await expect(a.v.locator('.viewer-candidate [data-chart-region]')).toHaveCount(3);await expect(a.v.locator('.viewer-candidate .choropleth-warning')).toContainText('unknown (XX)');await photo(a.v,info,'small-territories');
  await a.show({version:1,template:'itinerary',data:{days:[{date:'2026-10-03',items:[{title:'Local rail leg',inlineMap:{points:[{lat:38.71,lng:-9.14,label:'Station A'},{lat:38.80,lng:-9.38,label:'Station B'}]}}]}]}});await expect(a.v.locator('.viewer-candidate .itinerary-inline-map svg')).toBeVisible();await expect(a.v.locator('.viewer-candidate .itinerary-inline-map')).toContainText('Station A');await photo(a.v,info,'inline-map');
  const nodes=[{id:'root',label:'Root'},{id:'a',label:'Branch A',parentId:'root'},{id:'b',label:'Branch B',parentId:'root'},{id:'a1',label:'Member A1',parentId:'a'},{id:'a2',label:'Member A2',parentId:'a'},{id:'b1',label:'Member B1',parentId:'b'}];
  await a.show({version:1,template:'org-chart',data:{nodes}});const node=a.v.locator('.viewer-candidate [data-node-id="a1"]'),before=await node.getAttribute('transform');
  await a.show({version:1,template:'org-chart',data:{nodes:nodes.map(n=>n.id==='a1'?{...n,parentId:'b'}:n)}});expect(await node.getAttribute('transform')).not.toBe(before);await photo(a.v,info,'org-reparent');
 }finally{await a.client.close();}
});
});

test.describe("map coverage 5", () => {


test('marker tables retain rich safe content in popup and permanent modes',async({page},info)=>{
 const unwanted:string[]=[];page.context().on('request',r=>{if(r.url().includes('evil.test'))unwanted.push(r.url());});
 await page.context().route('https://tile.openstreetmap.org/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e0e7e0"/></svg>'}));
 await register(page);const s=await createSession(page,'Synthetic map'),d=await createDisplay(page,s,'Map'),v=await openViewer(page,s,d.id);
 const html='<strong>Regional transport</strong><table><tr><td>Daily departures</td><td>310</td></tr><tr><td>Connections</td><td>48</td></tr></table><script>window.untrustedExecuted=true</script><img src="https://evil.test/pixel"><a href="javascript:alert(1)" onclick="alert(1)">Safe text</a>';
 for(const permanent of [false,true]){
  await publishPrepared(page,s,[d.id],{version:1,template:'map',data:{markers:[{lat:59.9,lng:10.7,label:'Plain fallback',popupHtml:html,contentDisplay:permanent?'permanent':'popup'}]}});
  await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision&&x.revision>0);
  await expect(v.locator('.viewer-candidate .leaflet-interactive').first()).toBeVisible();
  if(!permanent)await v.locator('.viewer-candidate .leaflet-interactive').first().click();
  const box=v.locator(permanent?'.viewer-candidate .map-permanent-content':'.viewer-candidate .map-rich-popup');
  // Leaflet redraws may briefly retain the previous fading tooltip. Assert
  // the complete unique, sanitized and contained result after that transition.
  await expect(async()=>{
    await expect(box).toHaveCount(1);await expect(box.locator('strong')).toHaveText('Regional transport');await expect(box.locator('table')).toBeVisible();await expect(box).not.toContainText('Plain fallback');
    await expect(box.locator('script,img,[onclick],a[href^="javascript:"]')).toHaveCount(0);expect(unwanted).toEqual([]);
    const geometry=await box.evaluate(e=>{const cells=e.querySelectorAll('td'),a=cells[0].getBoundingClientRect(),b=cells[1].getBoundingClientRect(),r=e.getBoundingClientRect(),map=e.closest('.map-surface')!.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(cells[0]);return{width:r.width,left:r.left,right:r.right,mapLeft:map.left,mapRight:map.right,lines:range.getClientRects().length,cellWidth:a.width,secondLeft:b.left,firstRight:a.right};});
    expect(geometry.cellWidth).toBeGreaterThan(100);expect(geometry.lines).toBeLessThanOrEqual(2);expect(geometry.secondLeft).toBeGreaterThanOrEqual(geometry.firstRight-1);expect(geometry.left).toBeGreaterThanOrEqual(geometry.mapLeft);expect(geometry.right).toBeLessThanOrEqual(geometry.mapRight);
  }).toPass({timeout:10000});
  await v.screenshot({path:info.outputPath(permanent?'permanent-table.png':'popup-table.png'),animations:'disabled'});
 }
});
});
