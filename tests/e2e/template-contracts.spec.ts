import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { operationRequest } from '../mcp/requests.js';
import { gameExample } from '../../src/shared/game';
import { GAME_PRESETS } from '../../src/shared/game';
import { validateView } from '../../src/shared/view-schemas';
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
import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { login } from './support';
import { viewerPath } from './support';
import { samples } from '../../src/shared/template-examples';
import { Store } from '../../src/server/store';
import { testDatabase } from '../postgres';
import type { ViewSpec } from '../../src/shared/types';
import { mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import QRCode from 'qrcode';
import type { TestInfo } from '@playwright/test';
import { TEMPLATE_IDS } from '../../src/shared/types';
import type { AssetRecord } from '../../src/shared/types';
import { showViewHeading } from '../../src/shared/display-guidance';
import type { ReportPage } from '../../src/shared/reports';
import { tab } from './support';

test.describe("template contracts coverage 1", () => {


test('generic QR preserves arbitrary payload with plain supporting text and no table widgets',async({page},info)=>{
 await register(page);const s=await createSession(page,'QR display'),d=await createDisplay(page,s,'QR screen'),viewer=await openViewer(page,s,d.id);
 const payload='WIFI:T:WPA;S:Acceptance network;P:synthetic-only;;';
 await publishPrepared(page,s,[d.id],validateView({template:'qr',data:{content:payload,title:'Connect here',text:'Scan using your camera'}}));
 await waitForDisplay(page,s,d.id,v=>v.appliedRevision===v.revision);
 const qr=viewer.locator('.viewer-candidate .qr-code img');await expect(qr).toBeVisible();expect(await qr.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
 await expect(viewer.getByRole('heading',{name:'Connect here'})).toBeVisible();
 await qr.screenshot({path:info.outputPath('nov05-qr.png')});
 // Supporting media participates in readiness, not only the generated QR.
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=32;c.height=32;c.getContext('2d')!.fillRect(0,0,32,32);return c.toDataURL().split(',')[1];});
 let received!:()=>void,release!:()=>void;const requested=new Promise<void>(resolve=>{received=resolve;}),held=new Promise<void>(resolve=>{release=resolve;});
 await viewer.route('https://example.com/nov05-qr-support.png',async route=>{received();await held;await route.fulfill({status:200,contentType:'image/png',body:Buffer.from(png,'base64')});});
 await publishPrepared(page,s,[d.id],validateView({template:'qr',data:{content:'Updated plain text payload',title:'With image',image:{url:'https://example.com/nov05-qr-support.png',alt:'Supporting illustration'}}}));
 try{
  await requested;await expect.poll(()=>viewer.locator('.qr-code img').last().evaluate((e:HTMLImageElement)=>e.naturalWidth)).toBeGreaterThan(0);
  const pending=(await sessionDetail(page,s)).displays.find(v=>v.id===d.id)!;expect(pending.appliedRevision).toBeLessThan(pending.revision);
 }finally{release();}
 await waitForDisplay(page,s,d.id,v=>v.appliedRevision===v.revision&&v.view?.data.content==='Updated plain text payload');
 await expect(viewer.locator('.viewer-candidate .qr-logo img')).toBeVisible();

 await publishPrepared(page,s,[d.id],validateView({template:'table',showControls:true,data:{columns:['Source'],rows:[{Source:'Preserved'}]}}));
 await expect(viewer.locator('.viewer-candidate .table-surface')).toContainText('Preserved');await expect(viewer.locator('.table-toolbar')).toHaveCount(0);
});
});

test.describe("template contracts coverage 2", () => {


const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({template,data,...extra} as never) as ViewSpec;
/** Publish and wait until this window has painted that revision: a measurement taken while the previous
 * view is being replaced reads an element that is already detached (empty computed style, no box). */
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov10 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov10-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const inside=(inner:{x:number;y:number;width:number;height:number},outer:{x:number;y:number;width:number;height:number},slack=1.5)=>inner.x>=outer.x-slack&&inner.y>=outer.y-slack&&inner.x+inner.width<=outer.x+outer.width+slack&&inner.y+inner.height<=outer.y+outer.height+slack;

test('new templates paint on desktop and phone without overflow or page chrome',async({page,diagnostics},info)=>{
 const {s,d,viewer}=await setup(page,'New templates');
 // Picker assets come from the Kanvas server only; the test supplies them so no outside network is needed.
 // The console page beside the viewer draws the same view, so the answers are given to every page of the test.
 await viewer.context().route('**/api/picker/icons/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>'}));
 // Font files are not fetched from outside in tests: the three requests are answered as unavailable, and expected.
 await viewer.context().route('**/api/picker/fonts/**',route=>route.fulfill({status:404,contentType:'application/json',body:'{}'}));
 // All three sample families publish a variable edition, so each is asked for as one file (e011b35b).
 for(const path of ['/api/picker/fonts/inter/variable.woff2','/api/picker/fonts/playfair-display/variable.woff2','/api/picker/fonts/jetbrains-mono/variable.woff2'])for(const window of [viewer,page])diagnostics.allowHttp(window,path,404);
 const external:string[]=[];viewer.on('request',request=>{const url=new URL(request.url());if(!['127.0.0.1','localhost'].includes(url.hostname)&&!['data:','blob:','about:'].includes(url.protocol))external.push(request.url());});
 const fits=async(selector:string,label:string)=>{const root=viewer.locator(`.viewer-candidate ${selector}`);await expect(root,label).toBeVisible();const shell=(await viewer.locator('.viewer-shell').boundingBox())!,box=(await root.boundingBox())!;expect(inside(box,shell,2),`${label} inside the screen`).toBe(true);expect(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1),`${label}: page does not scroll`).toBe(true);await expect(root.locator(selector==='.task-list'?'button:not(.task-detail-toggle),input,nav':'button,input,nav'),`${label}: no unrelated controls`).toHaveCount(0);await viewer.screenshot({path:info.outputPath(`${label}.png`)});};
 await publishPrepared(page,s,[d.id],view('json',{json:'{"exact":9007199254740993,"items":[{"id":"t4","checked":true}],"note":"raw is the default"}'}));await fits('.json-raw','json-raw');await expect(viewer.locator('.viewer-candidate .json-raw li')).toHaveCount(10);await expect(viewer.locator('.viewer-candidate .json-raw')).toContainText('9007199254740993');
 await publishPrepared(page,s,[d.id],view('json',{json:'{"a":{"b":1}}',view:'tree'}));await expect(viewer.locator('.viewer-candidate .json-raw')).toHaveCount(0);
 await publishPrepared(page,s,[d.id],validateView(samples['tool-call-details']));await fits('.tool-call-details','tool-call-details');
 const panes=await viewer.locator('.viewer-candidate .tool-call-pane').evaluateAll(list=>list.map(pane=>pane.getBoundingClientRect()).map(r=>({x:r.x,y:r.y})));
 if(info.project.name.startsWith('phone'))expect(panes[1].y).toBeGreaterThan(panes[0].y+20);else expect(panes[1].x).toBeGreaterThan(panes[0].x+100);
 await publishPrepared(page,s,[d.id],validateView(samples['task-list']));await fits('.task-list','task-list');await expect(viewer.locator('.viewer-candidate .task-list .task-detail-toggle')).toHaveCount(1);await expect(viewer.locator('.viewer-candidate .task-list .task-detail-toggle')).toHaveAttribute('aria-expanded','true');await expect(viewer.locator('.viewer-candidate .task-list tr.is-current .task-detail')).toBeVisible();
 for(const data of [{mode:'options',options:[{value:'tailwind:amber-400'},{value:'tailwind:sky-500'},{value:'#4f46e5'},{value:'tailwind:emerald-500'}]},{mode:'shades',palette:'tailwind'},{mode:'harmony',base:'#0090ff'},{mode:'contrast',backgrounds:['#ffffff','#111111','tailwind:amber-100'],texts:['#111111','#ffffff','tailwind:sky-700']},{mode:'roles',scale:'radix:blue'},{mode:'theme',seed:'#6750a4'},{mode:'variations',base:'tailwind:rose-500'},{mode:'named',group:'blues'},
  // ebebd25c: the agent's own families print a speakable label in every cell; hex can be asked for on any grid.
  {mode:'shades',custom:[{name:'Brand',shades:[{value:'#fef3c7',label:'lightest'},{value:'#fde68a',label:'light'},{value:'#f59e0b',label:'base'},{value:'#b45309',label:'dark'},{value:'#78350f',label:'deepest'}]},{name:'Ink',shades:[{value:'#f3f4f6'},{value:'#d1d5db'},{value:'#6b7280'},{value:'#374151'},{value:'#111827'}]}]},
  {mode:'shades',palette:'tailwind',families:['amber','sky','rose'],hex:true}] as Record<string,unknown>[]){
  await publishPrepared(page,s,[d.id],view('colour',data));await fits(`.colour-view[data-colour-mode="${data.mode}"]`,`colour-${data.mode}`);
  // Labels never wrap mid-word or spill out of their swatch.
  const spill=await viewer.locator(`.viewer-candidate .colour-view[data-colour-mode="${data.mode}"]`).evaluate(root=>[...root.querySelectorAll<HTMLElement>('.colour-chip b,.colour-shade-row>b,.colour-shade-head b')].filter(el=>el.scrollWidth>el.clientWidth+1&&getComputedStyle(el).textOverflow!=='ellipsis').length);expect(spill,`colour ${data.mode} labels`).toBe(0);
  if(data.custom||data.hex){
   // Every printed cell label lies inside its own cell, on one line, in a size a person can read.
   const cells=await viewer.locator('.viewer-candidate .colour-shades [role=cell]').evaluateAll(list=>list.map(cell=>{const outer=cell.getBoundingClientRect();return [...cell.querySelectorAll<HTMLElement>('b,code')].filter(label=>getComputedStyle(label).display!=='none').map(label=>{const box=label.getBoundingClientRect();return {text:label.textContent,inside:box.left>=outer.left-1&&box.right<=outer.right+1&&box.top>=outer.top-1&&box.bottom<=outer.bottom+1,oneLine:box.height<=parseFloat(getComputedStyle(label).fontSize)*1.4,size:parseFloat(getComputedStyle(label).fontSize)};});}));
   expect(cells.length).toBe(data.custom?10:33);// Hex is printed where a cell is wide enough to print it legibly; an upright phone showing eleven shades prints the shade alone.
   const phone=info.project.name.startsWith('phone');expect(cells.map(labels=>labels.length),'every cell is labelled').toEqual(cells.map(()=>data.hex&&!phone?2:1));
   expect(cells.flat().filter(label=>!label.inside||!label.oneLine)).toEqual([]);
   if(data.custom){expect(cells[2][0].text).toBe('base');expect(cells[9][0].text).toBe('5');expect(Math.min(...cells.flat().map(label=>label.size)),'own shade labels are readable').toBeGreaterThanOrEqual(phone?8:11);}
   else{expect(cells[4].map(label=>label.text)).toEqual(phone?['400']:['400','#fbbf24']);expect(Math.min(...cells.flat().map(label=>label.size)),'printed labels are readable').toBeGreaterThanOrEqual(phone?8:10);}
  }
 }
 // e2ba79e1: a list's own status colours paint the pill; an own column filters on the display exactly as on the server.
 await publishPrepared(page,s,[d.id],view('task-list',{colors:{waiting:'#d9a441'},columns:[{key:'owner',label:'Owner'}],filter:{fields:['owner=ada']},items:[{title:'Sign in',status:'Waiting',fields:{owner:'Ada'}},{title:'Dismiss a toast',status:'other value',fields:{owner:'Bo'}},{title:'Reopen the app',status:'waiting',fields:{owner:'ADA'}}]}));
 await fits('.task-list','task-list-own-colours');await expect(viewer.locator('.viewer-candidate .task-list tbody tr')).toHaveCount(2);await expect(viewer.locator('.viewer-candidate .task-list-hidden')).toHaveText('1 hidden by filter');
 expect(await viewer.locator('.viewer-candidate .task-list .task-pill').first().evaluate(pill=>getComputedStyle(pill).getPropertyValue('--pill').trim())).toBe('#d9a441');
 await publishPrepared(page,s,[d.id],validateView(samples['icon-picker']));await fits('.icon-picker','icon-picker');await expect(viewer.locator('.viewer-candidate .icon-picker .picker-label').first()).toHaveText('lucide:settings');
 // e011b35b: a catalogue icon is drawn through the Kanvas server too and prints its exact Iconify name.
 const catalogue:string[]=[];viewer.on('request',request=>{const path=new URL(request.url()).pathname;if(path.startsWith('/api/picker/icons/iconify/'))catalogue.push(path);});
 await publishPrepared(page,s,[d.id],view('icon-picker',{mode:'sets',concept:'settings',icons:[{set:'lucide',name:'settings'},{set:'iconify',name:'mdi:cog-outline'},{set:'iconify',name:'carbon:settings'}]}));await fits('.icon-picker.mode-sets','icon-picker-catalogue');
 await expect(viewer.locator('.viewer-candidate .icon-picker .picker-label')).toHaveText(['lucide:settings','mdi:cog-outline','carbon:settings']);await expect.poll(()=>catalogue.sort()).toEqual(['/api/picker/icons/iconify/carbon/settings.svg','/api/picker/icons/iconify/mdi/cog-outline.svg']);
 await publishPrepared(page,s,[d.id],validateView(samples['font-picker']));await fits('.font-picker','font-picker');await expect(viewer.locator('.viewer-candidate .font-picker .picker-label').first()).toHaveText('Inter 400');
 await publishPrepared(page,s,[d.id],validateView(samples.agents));await fits('.agents-view','agents');
 await publishPrepared(page,s,[d.id],validateView(samples.welcome));await fits('.welcome-view','welcome');await expect(viewer.locator('.viewer-candidate .welcome-view li')).toHaveCount(3);
 expect(external,'viewers contact only the Kanvas server').toEqual([]);
});
});

test.describe("template contracts coverage 3", () => {


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

test('quiet surfaces keep requested source information and exact supporting text available',async({page},info)=>{
  const {s,d,viewer}=await setup(page),text='Bring a raincoat.';
  const view=validateView({version:1,template:'fact',showControls:true,title:'A redundant generated heading',data:{text,subtitle:'Morning rain; clearer later.',items:['Exact source 9007199254740993.0000','No claims are omitted from the saved source.']}});
  await show(page,viewer,s,d.id,view);await expect(viewer.locator('.view-heading')).toHaveCount(0);await expect(viewer.locator('.fact-text')).toHaveText(text);
  await expect(viewer.locator('.view-information')).toHaveCount(0);await expect(viewer.getByText('Source & info')).toHaveCount(0);
  await expect(viewer.getByText('Exact source 9007199254740993.0000',{exact:true})).not.toBeVisible();
  await viewer.getByText('Supporting details · 2',{exact:true}).click();await expect(viewer.getByText('Exact source 9007199254740993.0000',{exact:true})).toBeVisible();
  await photo(viewer,info,'no-source-information');
  await show(page,viewer,s,d.id,{...view,showTitle:true});await expect(viewer.locator('.view-heading h1')).toHaveText('A redundant generated heading');
  expect((await sessionDetail(page,s)).displays.find(item => item.id === d.id)!.view?.data).toEqual(view.data);
});

test('all current templates retain a settled full-screen visual without default information controls',async({page},info)=>{
  test.setTimeout(360000);let {s,d,viewer}=await setup(page);
  const prepareViewer=async()=>{
    await viewer.route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/png',body:PNG}));
    await viewer.route('https://**/*',route=>route.request().isNavigationRequest()&&route.request().frame()!==viewer.mainFrame()?route.fulfill({contentType:'text/html',body:'<!doctype html><h1>Supplied website fixture</h1>'}):route.fallback());
  };await prepareViewer();
  // Deterministic, explicitly synthetic source media; no outside image/video hosts.
  const image=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;const c=canvas.getContext('2d')!;const sky=c.createLinearGradient(0,0,0,800);sky.addColorStop(0,'#244863');sky.addColorStop(1,'#accccd');c.fillStyle=sky;c.fillRect(0,0,1200,800);c.fillStyle='#f4dca4';c.beginPath();c.arc(900,190,90,0,Math.PI*2);c.fill();c.fillStyle='#264b55';c.beginPath();c.moveTo(0,650);c.lineTo(410,180);c.lineTo(790,750);c.lineTo(1200,460);c.lineTo(1200,800);c.lineTo(0,800);c.fill();return canvas.toDataURL('image/png').split(',')[1];});
  async function asset(name:string,mimeType:string,base64:string){const result=await sessionApi<AssetRecord>(page,`/api/sessions/${s}/assets`,'POST',{name,mimeType,base64});expect(result.status).toBe(201);return result.data!;}
  const loadAssets=async()=>({landscape:await asset('Synthetic landscape.png','image/png',image),video:await asset('Supplied test video.mp4','video/mp4',(await readFile(new URL('../rendering/fixtures/sample.mp4',import.meta.url))).toString('base64')),qr:await asset('Illustrative join code.png','image/png',(await QRCode.toBuffer('https://example.com/join',{width:512,margin:2})).toString('base64'))});
  let {landscape,video,qr}=await loadAssets();
  const audit:unknown[]=[];
  for(const template of TEMPLATE_IDS){
    // A monitor-stream view needs a real stream of the session; its live rendering is covered in feedback-nov14.spec.ts.
    if(template==='monitor-stream')continue;
    // Bound each visual fixture session while covering every real template; the product cap is1000.
    if(audit.length>0&&audit.length%40===0){await viewer.close();s=await createSession(page,'Remaining template acceptance');d=await createDisplay(page,s,'Remaining source templates');viewer=await openViewer(page,s,d.id);await prepareViewer();({landscape,video,qr}=await loadAssets());}
    const input=structuredClone(samples[template]);
    if(template==='image')input.data={images:[{url:landscape.url,alt:'Synthetic landscape',caption:'A supplied image, given the surface.'}]};
    if(template==='image-gallery')input.data={mode:'grid',images:[{url:landscape.url,alt:'Synthetic landscape one'},{url:landscape.url,alt:'Synthetic landscape two'}]};
    if(template==='now-playing')input.data={...input.data,artwork:{url:landscape.url,alt:'Synthetic supplied album artwork'}};
    if(template==='video')input.data={url:video.url,muted:true,loop:true};
    if(template==='join')input.data={...input.data,qr:{url:qr.url,alt:'Illustrative join code'}};
    if(template==='countdown')input.data={...input.data,endsAt:new Date(Date.now()+600000).toISOString()};
    const view=validateView(input);await show(page,viewer,s,d.id,view);
    const surface=viewer.locator('.viewer-candidate>.browsing-root>.render-surface');await expect(surface).toBeVisible();
    await expect(surface.locator(':scope>.view-heading')).toHaveCount(showViewHeading(view)?1:0);
    await expect(surface.locator('.view-information>summary').filter({visible:true})).toHaveCount(0);
    if(template==='chart'){
      await expect.poll(()=>surface.locator('.chart-axis text,.chart-tick').evaluateAll(elements=>Math.min(...elements.map(el=>{const matrix=(el as SVGGraphicsElement).getScreenCTM()!;return parseFloat(getComputedStyle(el).fontSize)*Math.hypot(matrix.a,matrix.b);}))),{message:'Chart labels remain 16 CSS pixels after SVG scaling'}).toBeGreaterThanOrEqual(15.9);
    }
    const metrics=await surface.evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,viewportWidth:innerWidth,viewportHeight:innerHeight,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,bodyHeight:el.querySelector(':scope>.render-body')!.getBoundingClientRect().height,smallVisible:[...el.querySelectorAll('p,span,dt,label,small,summary,button')].filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight&&!n.classList.contains('sr-only')&&parseFloat(getComputedStyle(n).fontSize)<14;}).map(n=>({class:n.className,font:getComputedStyle(n).fontSize,text:n.textContent?.slice(0,80)})).slice(0,15)}));
    expect(metrics.documentWidth,`${template}: no page-wide overflow`).toBeLessThanOrEqual(metrics.viewportWidth+2);expect(metrics.documentHeight,`${template}: only intentional inner reading scroll`).toBeLessThanOrEqual(metrics.viewportHeight+2);expect(metrics.bodyHeight).toBeGreaterThan(120);
    audit.push({template,...metrics});await photo(viewer,info,template);
  }
  // A stale grid poll must not expose grid data after this display changes
  // template. Diagnostics require both the earlier grid and painted replacement.
  const retiredGrid = await viewer.evaluate(async path => {
    const response = await fetch(path); return { status: response.status, payload: await response.json() };
  }, `/api/sessions/${s}/displays/${d.id}/grid`);
  expect(retiredGrid.status).toBe(409);expect(retiredGrid.payload.error.code).toBe('INVALID_VIEW');
  expect(retiredGrid.payload.data).toBeUndefined();
  await writeFile(`${info.outputPath('visuals')}/${info.project.name}-audit.json`,JSON.stringify(audit,null,2));
});
});
