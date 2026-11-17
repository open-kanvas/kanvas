import type { Page } from '@playwright/test';
import { createDisplay } from './support';
import { createSession } from './support';
import { expect } from './support';
import { openViewer } from './support';
import { publishPrepared } from './support';
import { register } from './support';
import { sessionApi } from './support';
import { test } from './support';
import { waitForDisplay } from './support';
import { validateView } from '../../src/shared/view-schemas';
import { operationId } from '../../src/server/mcp/operations';
import type { ViewSpec } from '../../src/shared/types';
import { operationRequest } from '../mcp/requests.js';
import { randomUUID } from 'node:crypto';
import { publicReference } from '../../src/server/mcp/operations';
import { mkdir } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { DisplayRecord } from '../../src/shared/types';
import { extendedExamples } from '../../src/shared/extended-templates';
import { sessionDetail } from './support';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { TestInfo } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { samples } from '../../src/shared/template-examples';
import { tab } from './support';

test.describe("pointing coverage 1", () => {


const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({version:1,template,data,...extra} as never) as ViewSpec;
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov14 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov14-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,canonical:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId:operationId(canonical),arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const fact=(text:string)=>({version:1,template:'fact',data:{text}});
const pane=(id:string,inner:Record<string,unknown>=fact(id))=>({id,view:inner});
const pie=(kind:'pie'|'donut')=>({version:1,template:'chart',data:{kind,series:[{name:'Share',points:[{x:'Alpha',y:40},{x:'Beta',y:30},{x:'Gamma',y:20},{x:'Delta',y:10}]}]}});

test('pointing needs no button: a tap fades, a double tap pins, and the agent hears about it on its next call (b0be5612)',async({page,baseURL})=>{
 const {s,d,viewer}=await setup(page,'Pointing');const client=await mcp(page,baseURL!);
 try{
  await use(client,'kanvas_session_state',{sessionId:s});
  await shown(page,viewer,s,d.id,view('table',{columns:['Quarter','Revenue'],rows:[['Q1',61],['Q2',72],['Q3',84]]}));
  await expect(viewer.locator('.pointing-tools')).toHaveCount(0);
  const cell=viewer.locator('.viewer-candidate tr[data-source-row] td').nth(5);await expect(cell).toHaveText('84');
  await cell.click();
  const mark=viewer.locator('.pointing-overlay [data-pointer-kind="cell"]');
  await expect(mark).toHaveCount(1);await expect(mark).toHaveAttribute('data-pointer-pinned','false');
  // Ephemeral: gone by itself.
  await expect(mark).toHaveCount(0,{timeout:9000});
  const heard=await use(client,'kanvas_fonts_list',{category:'mono'});
  expect(heard.structured.pointing.events).toHaveLength(1);
  expect(heard.structured.pointing.events[0]).toMatchObject({displayId:d.id,pinned:false,anchor:{kind:'cell',row:2,column:'Revenue'},target:{label:'84'}});
  expect(heard.structured.pointing.events[0].point.x).toBeGreaterThan(0);
  expect((await use(client,'kanvas_session_state',{sessionId:s})).structured.pointing).toBeUndefined();
  // Deliberate: a double tap pins.
  await cell.dblclick();
  await expect(mark).toHaveAttribute('data-pointer-pinned','true');
  await page.waitForTimeout(5500);await expect(mark).toHaveCount(1);
  expect((await use(client,'kanvas_session_state',{sessionId:s})).structured.pointing.events.at(-1)).toMatchObject({pinned:true});
  // The author's next tap replaces the pin with a fading mark.
  await viewer.locator('.viewer-candidate tr[data-source-row] td').nth(0).click();
  await expect(viewer.locator('.pointing-overlay [data-pointer-pinned="true"]')).toHaveCount(0);
  await expect(viewer.locator('.pointing-overlay .semantic-pointer')).toHaveCount(0,{timeout:9000});
  // Content without a semantic target: a place in the view.
  await shown(page,viewer,s,d.id,view('qr',{content:'https://example.com'}));
  const stage=viewer.locator('.viewer-candidate');const box=(await stage.boundingBox())!;
  await viewer.mouse.click(box.x+box.width*.1,box.y+box.height*.9);
  await expect(viewer.locator('.pointing-overlay [data-pointer-kind="point"]')).toHaveCount(1);
  const place=(await use(client,'kanvas_session_state',{sessionId:s})).structured.pointing.events.at(-1);
  expect(place.anchor.kind).toBe('point');expect(place.anchor.x).toBeGreaterThan(.02);expect(place.anchor.x).toBeLessThan(.25);expect(place.anchor.y).toBeGreaterThan(.75);
 }finally{await client.close();}
});
});

test.describe("pointing coverage 2", () => {


const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
async function connect(page:Page,baseURL:string,sessionId?:string){
  const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable September acceptance',scopes:['read','publish'],...(sessionId?{sessionIds:[sessionId]}:{})});
  expect(issued.status).toBe(201);const client=new Client({name:'september-acceptance',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${issued.data!.token}`}}}));return client;
}
async function call<T=unknown>(client:Client,name:string,args:Record<string,unknown>):Promise<T>{const ref=publicReference(name);if(!ref)throw new Error('Missing public mapping');const result=await client.callTool(operationRequest({name:ref.tool,arguments:{operation:ref.operation,...args}}));expect(result.isError,`${name} succeeds`).not.toBe(true);return (result.structuredContent as {data:T}).data;}
async function setup(page:Page){await register(page);const sessionId=await createSession(page,'September display lab'),display=await createDisplay(page,sessionId,'Receiving screen');return {sessionId,display};}
async function painted(page:Page,sessionId:string,displayId:string,template:string){return waitForDisplay(page,sessionId,displayId,d=>d.view?.template===template&&d.appliedRevision===d.revision&&d.revision>0);}

test('annotations return source-image coordinates and actual chart identities through the interaction inbox',async({page,baseURL})=>{
  const {sessionId,display}=await setup(page),viewer=await openViewer(page,sessionId,display.id),client=await connect(page,baseURL!,sessionId);await viewer.bringToFront();
  try{
    const asset=await sessionApi<{url:string}>(page,`/api/sessions/${sessionId}/assets`,'POST',{name:'Annotation source.png',mimeType:'image/png',base64:PNG.toString('base64')});expect(asset.status).toBe(201);
    await publishPrepared(page,sessionId,[display.id],{version:1,template:'image',data:{images:[{url:asset.data!.url,alt:'Source coordinate image'}]}});await painted(page,sessionId,display.id,'image');
    await viewer.getByRole('button',{name:'Display controls',exact:true}).click();await viewer.getByRole('button',{name:'Screen options'}).click();await viewer.getByLabel('Annotate this view').check();await viewer.getByLabel('Annotation note').fill('Inspect this pixel region');await viewer.getByRole('button',{name:'Close screen options',exact:true}).click();
    const b=await viewer.getByRole('img',{name:'Source coordinate image'}).boundingBox();expect(Boolean(b)).toBe(true);await viewer.mouse.click(b!.x+b!.width/2,b!.y+b!.height/2);
    await expect.poll(async()=>{const inbox=await call<{interactions:{actionId:string;value:Record<string,unknown>}[]}>(client,'kanvas_interactions_read',{sessionId});return inbox.interactions.some(x=>x.actionId==='viewer.annotation'&&(x.value.target as {type:string}).type==='image');}).toBe(true);
    await publishPrepared(page,sessionId,[display.id],{version:1,template:'chart',data:{kind:'line',series:[{name:'Revenue',points:[{x:'March',y:42},{x:'April',y:55}]}]}});await painted(page,sessionId,display.id,'chart');
    await viewer.getByRole('button',{name:'Display controls',exact:true}).click();await viewer.getByRole('button',{name:'Screen options'}).click();await viewer.getByLabel('Annotate this view').check();await viewer.getByRole('button',{name:'Close screen options',exact:true}).click();
    const mark=viewer.locator('[data-chart-series="Revenue"][data-chart-x="March"]').first(),r=await mark.boundingBox();expect(Boolean(r)).toBe(true);await viewer.mouse.click(r!.x+r!.width/2,r!.y+r!.height/2);
    await expect.poll(async()=>{const inbox=await call<{interactions:{value:{target?:{type:string;series?:string;x?:string}}}[]}>(client,'kanvas_interactions_read',{sessionId});return inbox.interactions.some(x=>x.value.target?.type==='chart'&&x.value.target.series==='Revenue'&&x.value.target.x==='March');}).toBe(true);
  }finally{await client.close();}
});
});

test.describe("pointing coverage 3", () => {


async function setup(page:Page,info:TestInfo,baseURL:string){
  await register(page);const s=await createSession(page,'September improvements'),d=await createDisplay(page,s,'Acceptance screen'),v=await openViewer(page,s,d.id);
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
async function photo(page:Page,info:TestInfo,name:string){for(const notice of await page.getByRole('button',{name:'Dismiss notification',exact:true}).all())await notice.click();await page.evaluate(()=>document.fonts.ready);await mkdir(info.outputPath('visuals'),{recursive:true});await page.screenshot({path:`${info.outputPath('visuals')}/${info.project.name}-${name}.png`,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);}
async function asset(a:Fixture,color='#267f9f',w=240,h=120){return a.call('kanvas_import','asset.import',{sessionId:a.s,name:'Acceptance logo.svg',mimeType:'image/svg+xml',base64:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect x="1" y="1" width="${w-2}" height="${h-2}" fill="${color}" stroke="#ffffff" stroke-width="2"/><circle cx="${w/2}" cy="${h/2}" r="${h/3}" fill="#ffffff"/><text x="${w/2}" y="${h/2+5}" text-anchor="middle" fill="${color}" font-size="16">K</text></svg>`).toString('base64')});}
async function counterpart(a:Fixture,page:Page,browser:Browser,info:TestInfo,baseURL:string){
  const context=await browser.newContext({baseURL,viewport:info.project.name.startsWith('phone')?{width:1440,height:900}:{width:390,height:844},colorScheme:'dark',reducedMotion:'reduce'}),peer=await context.newPage(),account=await register(peer);
  await a.call('kanvas_configure','profile.update',{expectedRevision:0,displayName:'Alex · host'});
  expect((await sessionApi(page,`/api/sessions/${a.s}/members`,'POST',{username:account.username,role:'viewer'})).status).toBe(200);
  await peer.goto(`/view/${a.s}/${a.d.id}`);await expect(peer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String((await a.current()).revision));
  return {context,peer};
}
async function word(page:Page,selector:string,needle:string){return page.locator(selector).evaluate((el,text)=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);for(let n=walker.nextNode();n;n=walker.nextNode()){const at=n.textContent!.indexOf(text);if(at<0)continue;const range=document.createRange();range.setStart(n,at);range.setEnd(n,at+text.length);const r=range.getClientRects()[0];return {x:r.left+r.width/2,y:r.top+r.height/2,left:r.left,top:r.top,width:r.width,height:r.height};}throw new Error('Word is not rendered');},needle);}
async function pointAt(page:Page,selector:string){const r=await page.locator(selector).boundingBox();expect(r).not.toBeNull();await page.mouse.click(r!.x+r!.width/2,r!.y+r!.height/2);}

test('named shared word/span pointers resolve across desktop-phone reflow and do not change source or history',async({page,baseURL,browser,diagnostics},info)=>{
  const a=await setup(page,info,baseURL!);let peer:Awaited<ReturnType<typeof counterpart>>|undefined;try{
    const text='Shared pointing follows the exact source through different screen sizes. Every participant sees the selected word lighthouse in their own layout, without moving the page or rewriting this sentence.';const original=await a.show({version:1,template:'fact',data:{text}});
    await expect(a.v.getByRole('button',{name:'Point together'})).toHaveCount(0);peer=await counterpart(a,page,browser,info,baseURL!);diagnostics.watch(peer.peer);
    await a.call('kanvas_access','pointing.configure',{sessionId:a.s,enabled:true,tools:true,expectedRevision:0,confirm:true});await a.v.getByRole('button',{name:'Point together'}).click();const target=await word(a.v,'.fact-text','lighthouse');await a.v.mouse.click(target.x,target.y);
    await expect(peer.peer.locator('.semantic-pointer-name')).toHaveText('Alex · host');const other=await word(peer.peer,'.fact-text','lighthouse');await expect.poll(()=>peer!.peer.locator('.semantic-pointer-mark').first().evaluate((e,b)=>{const r=e.getBoundingClientRect();return Math.abs(r.left-b.left)<4&&Math.abs(r.top-b.top)<4&&Math.abs(r.width-b.width)<4;},other)).toBe(true);
    await peer.peer.getByRole('button',{name:'Point together'}).click();const p=await word(peer.peer,'.fact-text','source');await peer.peer.mouse.click(p.x,p.y);await expect(a.v.locator('.semantic-pointer-name')).toHaveCount(2);await expect(a.v.locator('.semantic-pointer-name')).toContainText(['Alex · host','Browser acceptance']);
    const first=await word(a.v,'.fact-text','Every'),last=await word(a.v,'.fact-text','lighthouse');await a.v.mouse.move(first.x,first.y);await a.v.mouse.down();await a.v.mouse.move(last.x,last.y,{steps:6});await a.v.mouse.up();await expect.poll(async()=>{const s=await a.call('kanvas_inspect','pointing.read',{sessionId:a.s,displayId:a.d.id});const p=s.pointers.find((p:any)=>p.name==='Alex · host');return p?.anchor.end-p?.anchor.start;}).toBeGreaterThan(20);
    await photo(a.v,info,'semantic-pointing');await photo(peer.peer,info,'semantic-pointing-peer');expect((await a.current()).view).toEqual(original.view);expect((await a.current()).revision).toBe(original.revision);
    await expect(peer.peer.getByRole('button',{name:'Disable shared pointing',exact:true})).toHaveCount(0);await a.v.getByRole('button',{name:'Disable shared pointing',exact:true}).click();await expect(peer.peer.locator('.pointing-overlay,.pointing-tools')).toHaveCount(0);await expect(a.v.locator('.pointing-overlay,.pointing-tools')).toHaveCount(0);
  }finally{await peer?.context.close();await a.client.close();}
});

test('shared pointers address original cells, chart data and uncropped image pixels; local actions are only intercepted in pointing mode',async({page,baseURL,browser,diagnostics},info)=>{
  const a=await setup(page,info,baseURL!);let peer:Awaited<ReturnType<typeof counterpart>>|undefined;try{
    await a.show({version:1,template:'table',data:{columns:['Name','Value'],rows:[{Name:'North',Value:'1.2300'},{Name:'South',Value:'9007199254740993'}]}});peer=await counterpart(a,page,browser,info,baseURL!);diagnostics.watch(peer.peer);await a.call('kanvas_access','pointing.configure',{sessionId:a.s,enabled:true,tools:true,expectedRevision:0,confirm:true});
    await a.v.getByRole('button',{name:'Point together'}).click();await pointAt(a.v,'tr[data-source-row="1"] td:nth-child(2)');await expect(peer.peer.locator('[data-pointer-kind="cell"] .semantic-pointer-mark')).toBeVisible();const pointers=await a.call('kanvas_inspect','pointing.read',{sessionId:a.s,displayId:a.d.id});expect(pointers.pointers[0].anchor).toEqual({kind:'cell',row:1,column:'Value'});
    const chart=await a.show(samples.chart);await expect(peer.peer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(chart.revision));await expect(peer.peer.locator('.semantic-pointer-mark')).toHaveCount(0);await a.v.getByRole('button',{name:'Point together'}).click();await pointAt(a.v,'[data-chart-series="This year"][data-chart-x="Mar"][data-chart-y="45"]');await expect(peer.peer.locator('[data-pointer-kind="chart"] .semantic-pointer-mark')).toBeVisible();
    const img=await asset(a),image=await a.show({version:1,template:'image-gallery',data:{mode:'grid',images:[{url:img.url,alt:'Complete source'}]}});await expect(peer.peer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(image.revision));await a.v.getByRole('button',{name:'Point together'}).click();await pointAt(a.v,'.gallery-frames img');await expect(peer.peer.locator('[data-pointer-kind="image"] .semantic-pointer-mark')).toBeVisible();const mark=await a.call('kanvas_inspect','pointing.read',{sessionId:a.s,displayId:a.d.id});expect(mark.pointers[0].anchor.x).toBeCloseTo(.5,1);expect(mark.pointers[0].anchor.y).toBeCloseTo(.5,1);
    await a.show({version:1,template:'scoreboard',data:{sides:[{id:'a',name:'One',score:1},{id:'b',name:'Two',score:2}]}});await a.v.getByRole('button',{name:'Point together'}).click();await a.v.getByRole('button',{name:'Increase One',exact:true}).click();await expect(a.v.locator('.scoreboard-score').first()).toHaveText('1');await a.v.getByRole('button',{name:'Stop pointing'}).click();await a.v.getByRole('button',{name:'Increase One',exact:true}).click();await expect(a.v.locator('.scoreboard-score').first()).toHaveText('2');
  }finally{await peer?.context.close();await a.client.close();}
});
});
