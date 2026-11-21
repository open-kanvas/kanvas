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
import { SEAT_LAYOUTS } from '../../src/shared/venue';
import { SIGN_TYPES } from '../../src/shared/venue';
import type { TestInfo } from '@playwright/test';

test.describe("signage coverage 1", () => {


test('reviewed sign artwork loads with direction/prohibition layers and remains region-aware',async({page},info)=>{
 await register(page);const s=await createSession(page,'Reviewed signage'),d=await createDisplay(page,s,'Signs'),viewer=await openViewer(page,s,d.id);
 await publishPrepared(page,s,[d.id],validateView({template:'signage',data:{region:'no',items:[{id:'toilet',type:'restroom',direction:'left'},{id:'phone',type:'no-phones'},{id:'information',type:'information',direction:'right'}]}}));
 await waitForDisplay(page,s,d.id,v=>v.appliedRevision===v.revision);
 const images=viewer.locator('.viewer-candidate .sign-reviewed-art');await expect(images).toHaveCount(3);
 expect(await images.evaluateAll(elements=>elements.every(e=>(e as HTMLImageElement).complete&&(e as HTMLImageElement).naturalWidth>0))).toBe(true);
 await expect(viewer.locator('.viewer-candidate .sign-reviewed-prohibition')).toHaveCount(1);
 await expect(viewer.locator('.viewer-candidate .sign-arrow')).toHaveCount(2);
 await viewer.screenshot({path:info.outputPath('nov05-signage.png')});
});
});

test.describe("signage coverage 2", () => {


const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({template,data,...extra} as never) as ViewSpec;
/** Publish and wait until this window has painted that revision: a measurement taken while the previous
 * view is being replaced reads an element that is already detached (empty computed style, no box). */
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov10 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov10-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const inside=(inner:{x:number;y:number;width:number;height:number},outer:{x:number;y:number;width:number;height:number},slack=1.5)=>inner.x>=outer.x-slack&&inner.y>=outer.y-slack&&inner.x+inner.width<=outer.x+outer.width+slack&&inner.y+inner.height<=outer.y+outer.height+slack;

test('signs: the arrow sits where it points and artwork keeps its share of the sign (c079dde2)',async({page},info)=>{
 const {s,d,viewer}=await setup(page,'Signage');
 const sign=async(type:string,direction?:string)=>{await publishPrepared(page,s,[d.id],view('signage',{items:[{id:'one',type,...(direction?{direction}:{})}]}));await expect(viewer.locator(`.viewer-candidate [data-sign-type="${type}"]`)).toBeVisible();if(direction)await expect(viewer.locator('.viewer-candidate .sign-arrow')).toHaveAttribute('aria-label',direction);};
 const layout=()=>viewer.locator('.viewer-candidate .signage-visual').evaluate(visual=>{const art=visual.querySelector('.sign-reviewed-composition')?.getBoundingClientRect(),arrow=visual.querySelector('.sign-arrow')?.getBoundingClientRect(),box=visual.getBoundingClientRect();return {art:art&&{x:art.x+art.width/2,y:art.y+art.height/2,width:art.width,height:art.height},arrow:arrow&&{x:arrow.x+arrow.width/2,y:arrow.y+arrow.height/2,width:arrow.width,height:arrow.height},box:{width:box.width,height:box.height},polygons:visual.querySelectorAll('.sign-arrow polygon').length,paths:visual.querySelectorAll('.sign-arrow path').length};});
 const types=(samples.signage.data.items as {type:string}[]);const base=types[0]?.type??'restroom';
 for(const [direction,side] of [['left','left'],['right','right'],['up','top'],['down','bottom'],['turn-left-up','left'],['down-right','right']] as const){
  await sign(base,direction);const g=await layout();expect(g.polygons,direction).toBe(1);expect(g.paths,direction).toBe(0);expect(g.arrow!.width,direction).toBeGreaterThan(20);
  if(g.art){if(side==='left')expect(g.arrow!.x,direction).toBeLessThan(g.art.x);if(side==='right')expect(g.arrow!.x,direction).toBeGreaterThan(g.art.x);if(side==='top')expect(g.arrow!.y,direction).toBeLessThan(g.art.y);if(side==='bottom')expect(g.arrow!.y,direction).toBeGreaterThan(g.art.y);}
 }
 await viewer.screenshot({path:info.outputPath('sign-arrow.png')});
 // The figure is a share of the sign at any window width.
 const ratios:number[]=[];
 for(const width of info.project.name.startsWith('phone')?[390,700]:[700,1440,1900]){
  await viewer.setViewportSize({width,height:info.project.name.startsWith('phone')?844:900});await sign('no-phones');
  const g=await layout();expect(g.art,'reviewed artwork is present').toBeTruthy();expect(Math.abs(g.art!.width-g.art!.height),`square at ${width}`).toBeLessThanOrEqual(2);
  const inner=await viewer.locator('.viewer-candidate .sign-reviewed-art').evaluate(img=>{const style=getComputedStyle(img),r=img.getBoundingClientRect();return (r.width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight))/r.width;});
  ratios.push(inner);expect(inner,`figure share at ${width}`).toBeGreaterThan(.5);
 }
 expect(Math.max(...ratios)-Math.min(...ratios)).toBeLessThan(.02);
 await viewer.screenshot({path:info.outputPath('sign-artwork-wide.png')});
});
});

test.describe("signage coverage 3", () => {

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
async function photo(v:Page,info:TestInfo,name:string){await v.locator('.viewer-candidate .render-surface').first().screenshot({path:info.outputPath(name+'.png'),animations:'disabled'});expect(await v.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);}
test('restaurant presets and all shop signs have readable portrait and landscape content',async({page,baseURL},info)=>{
 const a=await setup(page,baseURL!);try{
 for(const preset of ['bold','fine-dining','cafe','chalkboard','modern']){await a.show('menu-board',{preset,currency:'NOK',locale:'nb-NO',title:'Lunch at the counter',sections:[{id:'m',name:'Mains',items:[{id:'burger',name:'House burger',price:169,description:'Grilled vegetables, local cheese',badges:['Popular']},{id:'soup',name:'Soup of the day',price:99,allergens:'Contains celery'}]}],footer:'Ask us about allergens'});await expect(a.viewer.locator('.menu-board')).toContainText('House burger');}
 await a.update('kanvas.menu.update',{action:'price',itemId:'burger',price:189});await a.update('kanvas.menu.update',{action:'availability',itemId:'soup',availability:'sold-out'});await a.current();await expect(a.viewer.locator('.sold-out-label')).toBeVisible();await photo(a.viewer,info,'menu-board');
 await a.show('todays-special',{preset:'bold',currency:'NOK',item:{name:'Today’s special',price:129,description:'Freshly made, while it lasts',badges:['Vegan']}});await photo(a.viewer,info,'special');
 for(const template of SIGN_TYPES){await a.update('kanvas.signage.update',{action:'set',template,data:{message:template==='back-at'?'Back in 15 minutes':'Welcome to our neighborhood',hours:[{day:'Mon–Fri',opens:'09:00',closes:'17:00'},{day:'Saturday',opens:'10:00',closes:'14:00'},{day:'Sunday',closed:true}],role:template==='hiring'?'Weekend barista':undefined,apply:template==='hiring'?'Ask inside':undefined}});await a.current();await expect(a.viewer.locator('.shop-sign')).toContainText(template==='back-at'?'Back in 15 minutes':'Welcome to our neighborhood');if(['opening-hours','hiring','sale-poster'].includes(template))await photo(a.viewer,info,template);}
 await a.update('kanvas.signage.update',{action:'clear'});await a.current();await expect(a.viewer.locator('.special')).toBeVisible();
 }finally{await a.client.close();}
});
});

test.describe("signage coverage 4", () => {

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
test('signage fits where possible and menus preserve readable minimum text with accessible overflow',async({page,baseURL},info)=>{
 const a=await setup(page,baseURL!);try{
 const items=Array.from({length:4},(_,i)=>({name:'Lunch item '+i,description:'Fresh local vegetables and herbs',price:'129 kr'}));
 const image=await a.call('kanvas.asset.import',{sessionId:a.sessionId,name:'menu-photo.png',mimeType:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII='});
 await a.show('menu',{image:{url:image.url,alt:'Menu photo'},groups:Array.from({length:4},(_,i)=>({title:'Section '+i,items}))});await fit(a.viewer);if((a.viewer.viewportSize()?.width??0)>1000)expect(Number(await a.viewer.locator('.fit-display').getAttribute('data-fit-scale'))).toBeGreaterThan(.7);await photo(a.viewer,info,'menu-16');
 await a.show('menu-board',{title:'Lunch and dinner',sections:Array.from({length:4},(_,i)=>({name:'Section '+i,items})),preset:'chalkboard'});await fit(a.viewer);if((a.viewer.viewportSize()?.width??0)>1000)expect(Number(await a.viewer.locator('.fit-display').getAttribute('data-fit-scale'))).toBeGreaterThan(.45);await photo(a.viewer,info,'menu-board-16');
 await a.show('opening-hours',{heading:'Åpningstider',hours:Array.from({length:7},(_,i)=>({day:['Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag','Søndag'][i],opens:'09:00',closes:'17:00',closed:i===6})),closedDayLabel:'Stengt',preset:'chalkboard'});await fit(a.viewer);await expect(a.viewer.locator('.opening-hours')).toContainText('Stengt');expect(await a.viewer.locator('.shop-sign').evaluate(el=>getComputedStyle(el).fontFamily)).toContain('KanvasChalk');await photo(a.viewer,info,'hours-seven');
 await a.show('closed-sign',{heading:'Velkommen tilbake',openNow:false,closedLabel:'Stengt',message:'Vi åpner igjen i morgen'});await fit(a.viewer);await expect(a.viewer.locator('.open-status')).toHaveText('Stengt');
 await a.show('menu',{groups:Array.from({length:4},(_,i)=>({title:'Section '+i,items:Array.from({length:25},(_,j)=>({name:'Dish '+j,price:'99'}))}))});await fit(a.viewer);expect(await a.viewer.locator('.menu-group article').count()).toBe(100);
 }finally{await a.client.close();}
});
});

test.describe("signage coverage 5", () => {

async function navigation(page:any,s:string,d:string,revision:number,action:unknown){const tabId=await page.evaluate(()=>sessionStorage.getItem('kanvas-viewer-tab'));return sessionApi(page,`/api/sessions/${s}/displays/${d}/navigation`,'POST',{tabId:tabId??'feedback26',requestId:crypto.randomUUID(),expectedRevision:revision,navigation:action});}
test('root honors account theme and previews every returned display; signage and chord pages are real',async({page})=>{
 await register(page);const s=await createSession(page,'Multi display'),d=await createDisplay(page,s,'Chords'),other=await createDisplay(page,s,'Menu');
 await page.evaluate(async()=>{const auth=(await(await fetch('/api/auth/me')).json()).data;const pref=(await(await fetch('/api/preferences')).json()).data;await fetch('/api/preferences',{method:'PATCH',headers:{'Content-Type':'application/json','X-Kanvas-CSRF':auth.csrfToken},body:JSON.stringify({expectedRevision:pref.revision,config:{theme:'dark'}})});});
 const song=await publishPrepared(page,s,[d.id],{version:1,template:'sing-along',showControls:true,data:{pages:[{lines:[{lyrics:'First verse',chords:[{at:0,chord:'C'}]}]},{lines:[{lyrics:'Second verse',chords:[{at:0,chord:'G'}]}]}]}});
 await publishPrepared(page,s,[other.id],{version:1,template:'menu-board',data:{columns:2,sectionColor:'#ffffff',accent:'#ff8c00',sections:[{name:'Coffee',items:Array.from({length:16},(_,i)=>({name:`Coffee ${i+1}`,price:4}))}]}});
 await page.goto('/');await expect(page.locator('main.account-overview')).toHaveClass(/theme-dark/);const card=page.locator('.overview-session').filter({has:page.getByRole('heading',{name:'Multi display'})});await expect(card.locator('.overview-preview')).toHaveCount(3);
 await page.goto(`/view/${s}/${d.id}`);await expect(page.locator('.song-lines')).toContainText('First verse');await page.getByRole('button',{name:'Next page',exact:true}).click();await expect(page.locator('.song-lines')).toContainText('Second verse');
 await page.goto(`/view/${s}/${other.id}`);await expect(page.locator('.menu-board')).toBeVisible();const styles=await page.locator('.menu-board').evaluate(el=>({columns:getComputedStyle(el.querySelector('.menu-sections')!).columnCount,heading:getComputedStyle(el.querySelector('.menu-sections>section>h3')!).color,price:getComputedStyle(el.querySelector('.menu-price')!).color}));expect(styles).toEqual({columns:'2',heading:'rgb(255, 255, 255)',price:'rgb(255, 140, 0)'});expect(await page.locator('.render-surface').evaluate(el=>getComputedStyle(el).padding)).toBe('0px');
});
});
