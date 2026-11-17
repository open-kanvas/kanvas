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
import { samples } from '../../src/shared/template-examples';
import { emailRuntime } from './email-oauth-fixture';
import { beginEmailConnector } from './email-oauth-fixture';
import { login } from './support';
import { viewerPath } from './support';
import { Store } from '../../src/server/store';
import { testDatabase } from '../postgres';
import type { ViewSpec } from '../../src/shared/types';

test.describe("checklist coverage 1", () => {


test('checklist follows newly completed progress but respects deliberate scrolling',async({page})=>{
 await register(page);const s=await createSession(page,'Progress following'),d=await createDisplay(page,s,'Checklist screen'),viewer=await openViewer(page,s,d.id);
 const items=Array.from({length:90},(_,i)=>({id:'step'+i,text:`Task ${i+1}`,detail:'Original detailed task instructions. '.repeat(8),checked:false}));
 await publishPrepared(page,s,[d.id],validateView({template:'checklist',data:{items}}));
 await waitForDisplay(page,s,d.id,v=>v.appliedRevision===v.revision);
 const list=viewer.locator('.viewer-candidate .checklist-content ul');
 await expect.poll(()=>list.evaluate(e=>e.scrollHeight>e.clientHeight+100)).toBe(true);
 const patch=async(first:number,last:number)=>{
  const result=await sessionApi(page,`/api/sessions/${s}/displays/${d.id}/patch`,'POST',{requestId:crypto.randomUUID(),operations:Array.from({length:last-first},(_,n)=>({op:'checklist',itemId:'step'+(first+n),action:'update',value:{checked:true}}))});
  expect(result.status,JSON.stringify(result)).toBe(200);
 };
 await patch(0,20);await expect.poll(()=>list.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
 await list.evaluate(e=>{e.scrollTop=0;e.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true}));});
 // 2026-11-10 (47f4f4c5, d0e13f12): while the reader is scrolling by hand a change to an item still in view moves
 // nothing; an item that is completely out of sight is always fetched ("always be brought into view").
 const one=await sessionApi(page,`/api/sessions/${s}/displays/${d.id}/patch`,'POST',{requestId:crypto.randomUUID(),operations:[{op:'checklist',itemId:'step0',action:'update',value:{checked:false}}]});expect(one.status,JSON.stringify(one)).toBe(200);
 await expect(list.locator('li').nth(0)).not.toHaveClass(/checked/);await page.waitForTimeout(1500);
 expect(await list.evaluate(e=>e.scrollTop)).toBeLessThan(2);
 await list.evaluate(e=>{e.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true}));});
 await patch(60,61);await expect(list.locator('li').nth(60)).toHaveClass(/checked/);
 await expect.poll(()=>list.evaluate(e=>e.scrollTop)).toBeGreaterThan(100);
});
});

test.describe("checklist coverage 2", () => {

const quiet=async(page:Page)=>{for(const button of await page.locator('.viewer-toast button').all())await button.click();};
const fact=(text:string)=>({version:1 as const,template:'fact' as const,data:{text}});

test('rich stacked toasts and save-only checklist refresh reach multiple windows without replacing content',async({page,baseURL},info)=>{
 await register(page);const s=await createSession(page,'Checklist and notices'),d=await createDisplay(page,s,'Checklist'),viewer=await openViewer(page,s,d.id),second=await openViewer(page,s,d.id);
 await publishPrepared(page,s,[d.id],validateView({template:'checklist',data:{items:[{id:'one',text:'One',checked:false},{id:'two',text:'Two',checked:false}]}}));await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision);
 const current=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!,checklistId=String(current.view!.data.checklistId);
 const update=await sessionApi(page,`/api/sessions/${s}/checklists/${checklistId}`,'PATCH',{requestId:randomUUID(),items:[{id:'one',text:'One',checked:true},{id:'two',text:'Two',checked:false}]});expect(update.status).toBe(200);
 for(const window of [viewer,second])await expect(window.locator('.viewer-candidate .checklist-content [role=checkbox][aria-checked=true]')).toHaveCount(1);
 const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Toast fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'notice-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));
 try{
  await viewer.route('https://example.com/notice.png',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=','base64')}));await second.route('https://example.com/notice.png',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=','base64')}));
  for(const window of [viewer,second])await window.route('https://example.com/broken.png',r=>r.fulfill({contentType:'image/png',body:'Not an image'}));
  const revision=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!.revision;
  for(let i=0;i<3;i++){const r=await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.toast',arguments:{sessionId:s,displayIds:[d.id],title:'Notice '+i,description:'Supplied notification',icon:i===2?'https://example.com/broken.png':'https://example.com/notice.png',time:'2026-11-06T14:38:00Z',durationMs:60000}}});expect(r.isError).not.toBe(true);}
  await expect(viewer.locator('.viewer-toast-title')).toHaveCount(3);await expect(viewer.locator('.viewer-toast-icon[hidden]')).toHaveCount(1);await expect(viewer.locator('.viewer-toast time').first()).toHaveText(/^\d{2}:\d{2}$/);expect((await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!.revision).toBe(revision);await viewer.screenshot({path:info.outputPath('rich-toasts.png')});
  await publishPrepared(page,s,[d.id],fact('Keep this content'));await sessionApi(page,`/api/sessions/${s}/checklists/${checklistId}`,'PATCH',{requestId:randomUUID(),items:[{id:'one',text:'One',checked:false}]});await expect(viewer.locator('.viewer-candidate')).toContainText('Keep this content');
 }finally{await client.close();}
});
});

test.describe("checklist coverage 3", () => {


const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({template,data,...extra} as never) as ViewSpec;
/** Publish and wait until this window has painted that revision: a measurement taken while the previous
 * view is being replaced reads an element that is already detached (empty computed style, no box). */
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov10 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov10-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const inside=(inner:{x:number;y:number;width:number;height:number},outer:{x:number;y:number;width:number;height:number},slack=1.5)=>inner.x>=outer.x-slack&&inner.y>=outer.y-slack&&inner.x+inner.width<=outer.x+outer.width+slack&&inner.y+inner.height<=outer.y+outer.height+slack;

test('checklist updates by id keep the place, follow the changed item and mark a highlight (2a3bdc12, d0e13f12, 47f4f4c5, a38d9e45)',async({page},info)=>{
 const {s,d,viewer}=await setup(page,'Checklist by id');
 const items=Array.from({length:60},(_,i)=>({id:`t${i+1}`,text:`Acceptance item ${i+1}`,checked:false,detail:`Note for item ${i+1}: what was checked and what was seen on the screen.`}));
 await publishPrepared(page,s,[d.id],view('checklist',{items}));await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision);
 const checklistId=String((await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!.view!.data.checklistId);
 const patch=(body:Record<string,unknown>)=>sessionApi<Record<string,any>>(page,`/api/sessions/${s}/checklists/${checklistId}`,'PATCH',{requestId:randomUUID(),...body});
 const list=viewer.locator('.viewer-candidate .checklist-content ul');await expect(list.locator('li')).toHaveCount(60);
 const overflows=await list.evaluate(el=>el.scrollHeight>el.clientHeight+40);expect(overflows,'the list is taller than the screen').toBe(true);
 const visible=(id:string)=>list.evaluate((el,key)=>{const item=el.querySelector(`[data-item-id="${key}"]`)!.getBoundingClientRect(),box=el.getBoundingClientRect();return item.top>=box.top-1&&item.bottom<=box.bottom+1;},id);
 // Scroll to the middle; an update that changes a visible item must not move the list.
 await list.evaluate(el=>{el.scrollTop=Math.round((el.scrollHeight-el.clientHeight)/2);});
 const middle=await list.evaluate(el=>({top:el.scrollTop,first:[...el.children].find(c=>c.getBoundingClientRect().top>=el.getBoundingClientRect().top+el.clientHeight*.3&&c.getBoundingClientRect().bottom<=el.getBoundingClientRect().top+el.clientHeight*.6)?.getAttribute('data-item-id')}));
 expect(middle.top).toBeGreaterThan(0);expect(middle.first).toBeTruthy();
 const one=await patch({items:[{id:middle.first,checked:true}]});expect(one.status).toBe(200);expect(one.data!.counts).toMatchObject({changed:1,untouched:59});
 await expect(list.locator(`[data-item-id="${middle.first}"] [role=checkbox]`)).toHaveAttribute('aria-checked','true');
 await viewer.waitForTimeout(500);expect(Math.abs(await list.evaluate(el=>el.scrollTop)-middle.top),'scroll position kept').toBeLessThanOrEqual(2);
 // From the top, ticking an item below the fold brings it into view.
 await list.evaluate(el=>{el.scrollTop=0;});await viewer.waitForTimeout(6500);
 expect(await visible('t58')).toBe(false);
 expect((await patch({items:[{id:'t58',checked:true}]})).status).toBe(200);
 await expect(list).toHaveAttribute('data-checklist-focus','t58',{timeout:8000});
 await expect.poll(()=>visible('t58'),{timeout:8000}).toBe(true);expect(await list.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 // Highlight one item by id: marked, brought into view, content and order unchanged.
 expect((await patch({highlightId:'t2'})).data!.highlightId).toBe('t2');
 await expect(list.locator('li.is-current')).toHaveCount(1);await expect(list.locator('li.is-current')).toHaveAttribute('data-item-id','t2');await expect(list.locator('li[aria-current=true]')).toContainText('Acceptance item 2');
 await expect.poll(()=>visible('t2'),{timeout:8000}).toBe(true);
 expect((await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!.view!.data.items).toHaveLength(60);
 await viewer.screenshot({path:info.outputPath('checklist-highlight.png')});
});
});

test.describe("checklist coverage 4", () => {

const evidence=()=>test.info().outputPath("screenshots");
test('compact checklist content columns, clean document, custom menu background and actual image zoom',async({page})=>{
 await register(page);const s=await createSession(page,'Feedback layouts'),d=await createDisplay(page,s,'Layouts');await publishPrepared(page,s,[d.id],{version:1,template:'checklist',data:{items:Array.from({length:17},(_,i)=>({id:'i'+i,text:`Prepare item ${i+1}`,detail:'Check the supplied details before continuing.'}))}});await page.goto(`/view/${s}/${d.id}`);await expect(page.locator('.viewer-candidate .checklist-adaptive li')).toHaveCount(17);const columns=await page.locator('.viewer-candidate .checklist-adaptive ul').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);if(page.viewportSize()!.width<600)expect(columns).toBe(1);else expect(columns).toBeGreaterThanOrEqual(2);await page.screenshot({path:`${evidence()}/${test.info().project.name}-checklist.png`});
 await publishPrepared(page,s,[d.id],{version:1,template:'document',data:{layout:'reading',quote:false,text:'Only the supplied document belongs here. '.repeat(20)}});await expect(page.locator('.viewer-candidate .document-content')).toBeVisible();await expect(page.getByText('Interpretation',{exact:true})).toHaveCount(0);await expect(page.locator('.viewer-candidate .reading-controls')).toHaveCount(0);
 await publishPrepared(page,s,[d.id],{version:1,template:'menu-board',data:{backgroundColor:'#123456',sections:[{name:'Coffee',items:[{name:'Espresso',price:3}]}]}});await expect(page.locator('.viewer-candidate .menu-board')).toHaveCSS('background-color','rgb(18, 52, 86)');
 // A real session-owned image, with no external dependency.
 const asset=await sessionApi<any>(page,`/api/sessions/${s}/assets`,'POST',{name:'zoom.svg',mimeType:'image/svg+xml',base64:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#4488cc"/><circle cx="300" cy="200" r="100" fill="#fff"/></svg>').toString('base64')});expect(asset.status).toBe(201);
 await publishPrepared(page,s,[d.id],{version:1,template:'image',data:{images:[{url:`/api/assets/${asset.data.id}`,alt:'Kanvas mark'}]}});await expect(page.locator('.viewer-candidate .image-frame img')).toBeVisible();const before=await page.locator('.viewer-candidate .image-frame img').boundingBox();const store=new Store(testDatabase(process.env.KANVAS_E2E_RUN_ID!));let tab:string;try{await store.ready;tab=(await store.list<any>('viewer',s)).find(v=>v.displayId===d.id)!.tabId;}finally{await store.close();}
 const revision=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!.revision;for(const scale of [1.6,.5]){expect((await sessionApi(page,`/api/sessions/${s}/displays/${d.id}/navigation`,'POST',{tabId:tab,requestId:crypto.randomUUID(),expectedRevision:revision,navigation:{action:'zoom',scale}})).status).toBe(200);await expect.poll(async()=> (await page.locator('.viewer-candidate .image-frame img').boundingBox())!.width/before!.width).toBeCloseTo(scale,1);}
 await page.screenshot({path:`${evidence()}/${test.info().project.name}-image-zoom.png`});
});
test('same-window zoom persists across checklist updates and different content; song defaults adapt to phone widths',async({page})=>{
 await register(page);const s=await createSession(page,'Persistent view zoom'),d=await createDisplay(page,s,'Main');const items=Array.from({length:17},(_,i)=>({id:'item'+i,text:'Item '+(i+1),detail:'Supplied checklist detail'}));await publishPrepared(page,s,[d.id],{version:1,template:'checklist',data:{items}});await page.goto(`/view/${s}/${d.id}`);await expect(page.locator('.viewer-candidate .checklist-adaptive')).toBeVisible();let current=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!;const checklistId=current.view!.data.checklistId;
 const store=new Store(testDatabase(process.env.KANVAS_E2E_RUN_ID!));let tab:string;try{await store.ready;await expect.poll(async()=> (await store.list<any>('viewer',s)).filter(v=>v.displayId===d.id).length).toBeGreaterThan(0);tab=(await store.list<any>('viewer',s)).find(v=>v.displayId===d.id)!.tabId;}finally{await store.close();}
 expect((await sessionApi(page,`/api/sessions/${s}/displays/${d.id}/navigation`,'POST',{tabId:tab,requestId:crypto.randomUUID(),expectedRevision:current.revision,navigation:{action:'zoom',scale:.6}})).status).toBe(200);await expect(page.locator('.viewer-candidate .render-surface')).toHaveCSS('zoom','0.6');
 expect((await sessionApi(page,`/api/sessions/${s}/checklists/${checklistId}`,'PATCH',{requestId:crypto.randomUUID(),items:items.map((x,i)=>({...x,checked:i===0}))})).status).toBe(200);expect((await sessionApi(page,`/api/sessions/${s}/checklists/${checklistId}/show`,'POST',{requestId:crypto.randomUUID(),displayId:d.id})).status).toBe(200);await expect(page.locator('.viewer-candidate .render-surface')).toHaveCSS('zoom','0.6');
 await publishPrepared(page,s,[d.id],{version:1,template:'fact',data:{text:'An independent view'}});await expect(page.locator('.viewer-candidate')).toContainText('An independent view');await expect(page.locator('.viewer-candidate .render-surface')).toHaveCSS('zoom','0.6');await sessionApi(page,`/api/sessions/${s}/checklists/${checklistId}/show`,'POST',{requestId:crypto.randomUUID(),displayId:d.id});await expect(page.locator('.viewer-candidate .checklist-adaptive')).toBeVisible();await expect(page.locator('.viewer-candidate .render-surface')).toHaveCSS('zoom','0.6');
 // The following independent responsive-font assertion is at100% window zoom;
 // content replacement no longer resets this window's0.6 scale implicitly.
 const fontRevision=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!.revision;
 expect((await sessionApi(page,`/api/sessions/${s}/displays/${d.id}/navigation`,'POST',{tabId:tab,requestId:crypto.randomUUID(),expectedRevision:fontRevision,navigation:{action:'zoom',scale:1}})).status).toBe(200);await expect(page.locator('.viewer-candidate .render-surface')).toHaveCSS('zoom','1');
 await publishPrepared(page,s,[d.id],{version:1,template:'sing-along',data:{fontSize:40,pages:[{lines:[{lyrics:'Amazing grace, how sweet the sound',chords:[{at:0,chord:'C'},{at:15,chord:'G'}]}]}]}});await expect(page.locator('.viewer-candidate .song-lines')).toBeVisible();await expect(page.locator('.viewer-candidate .song-lines')).toHaveCSS('font-size',page.viewportSize()!.width<600?'30px':'40px');await page.screenshot({path:`${evidence()}/${test.info().project.name}-song.png`});
});
});

test.describe("checklist coverage 5", () => {

test('checked items persist after other content, then recall on another display with account details recipe',async({page},info)=>{
 await register(page);const created:any=await sessionApi(page,'/api/sessions','POST',{name:'Checklist memory'}),sessionId=created.data.id,display=created.data.displays[0],viewer=await openViewer(page,sessionId,display.id);
 await publishPrepared(page,sessionId,[display.id],{version:1,template:'checklist',title:'Release work',showTitle:true,data:{items:[{id:'a',text:'Review the release',checked:false},{id:'b',text:'Run tests',checked:false}]}});
 await expect(viewer.getByRole('checkbox',{name:'Review the release'})).toBeVisible();await viewer.getByRole('checkbox',{name:'Review the release'}).click();await expect(viewer.getByRole('checkbox',{name:'Review the release'})).toBeChecked();
 const checked=await waitForDisplay(page,sessionId,display.id,d=>(d.view?.data.items as any[])?.[0]?.checked===true),key=checked.view!.data.checklistId;
 await publishPrepared(page,sessionId,[display.id],{version:1,template:'fact',data:{text:'A different topic'}});await expect(viewer.getByText('A different topic',{exact:true})).toBeVisible();
 const second:any=await sessionApi(page,`/api/sessions/${sessionId}/displays`,'POST',{name:'Second',width:1000,height:700}),saved:any=await sessionApi(page,`/api/sessions/${sessionId}/checklists/${key}`);expect(saved.data.view.data.items[0].checked).toBe(true);
 const shown=await sessionApi(page,`/api/sessions/${sessionId}/checklists/${key}/show`,'POST',{displayId:second.data.id,expectedRevision:0,requestId:randomUUID()});expect(shown.status).toBe(200);
 const secondViewer=await openViewer(page,sessionId,second.data.id);await expect(secondViewer.getByRole('checkbox',{name:'Review the release'})).toBeChecked();await secondViewer.reload();await expect(secondViewer.getByRole('checkbox',{name:'Review the release'})).toBeChecked();
 await secondViewer.screenshot({path:info.outputPath('persistent-checklist.png'),animations:'disabled'});
 const account:any=await sessionApi(page,'/api/account/details');expect(account.data.tier).toBe('trial');await publishPrepared(page,sessionId,[second.data.id],account.data.publishRecipe.view);await expect(secondViewer.getByText('Your Kanvas account',{exact:true})).toBeVisible();await expect(secondViewer.getByText('Plan / quota tier',{exact:true})).toBeVisible();
 await secondViewer.screenshot({path:info.outputPath('account-details.png'),animations:'disabled'});
});
});
