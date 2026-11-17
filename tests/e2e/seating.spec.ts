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
import { validateView } from '../../src/shared/view-schemas';
import { gameExample } from '../../src/shared/game';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { SEAT_LAYOUTS } from '../../src/shared/venue';
import { SIGN_TYPES } from '../../src/shared/venue';
import type { Page } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import { Store } from '../../src/server/store';
import { testDatabase } from '../postgres';

test.describe("seating coverage 1", () => {


test('a full poker table keeps ten seats, attached bets and community cards inside the felt',async({page},info)=>{
 await register(page);const s=await createSession(page,'Full table'),d=await createDisplay(page,s,'Poker'),viewer=await openViewer(page,s,d.id),data=gameExample('poker');
 data.zones={community:{label:'Community',role:'community'}};data.cards={};
 for(let i=0;i<10;i++){const zone='seat'+i;data.zones[zone]={label:'Seat '+(i+1),role:'seat',bet:'40',counter:'Chips 200'};for(let n=0;n<2;n++)data.cards[zone+'card'+n]={face:'back',zone,order:n,emphasis:'none'};}
 for(let i=0;i<5;i++)data.cards['board'+i]={face:'up',zone:'community',order:i,rank:(['A','K','Q','J','10'] as const)[i],suit:'hearts',emphasis:'none'};
 await publishPrepared(page,s,[d.id],{version:1,template:'game-board',data});await waitForDisplay(page,s,d.id,v=>v.appliedRevision===v.revision);
 for(const close of await viewer.locator('.viewer-toast button').all())await close.click();
 for(const [width,height] of [[1440,900],[390,844],[844,390]]){
  await viewer.setViewportSize({width,height});await expect.poll(()=>viewer.locator('.viewer-shell').evaluate(e=>Math.round(e.getBoundingClientRect().height))).toBe(height);
  const root=viewer.locator('.viewer-candidate .game-table');await expect(root.locator('.zone-seat')).toHaveCount(10);
  const state=await root.evaluate(root=>{const box=(e:Element)=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};return{table:box(root),zones:[...root.querySelectorAll('.game-zone')].map(box),cards:[...root.querySelectorAll('.game-card')].map(box)};});
  for(const rect of [...state.zones,...state.cards]){expect(rect.x).toBeGreaterThanOrEqual(state.table.x);expect(rect.right).toBeLessThanOrEqual(state.table.right);expect(rect.y).toBeGreaterThanOrEqual(state.table.y);expect(rect.bottom).toBeLessThanOrEqual(state.table.bottom);}
  for(let i=0;i<state.zones.length;i++)for(let j=i+1;j<state.zones.length;j++){const a=state.zones[i],b=state.zones[j],overlap=Math.min(a.right,b.right)-Math.max(a.x,b.x)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>2;expect(overlap,`Seats ${i}/${j} overlap at ${width}x${height}`).toBe(false);}
  // Rectangles alone miss clipping by the rounded felt. Check painted text
  // at its actual text bounds against browser hit-testing too.
  const clipped=await root.evaluate(root=>[...root.querySelectorAll('h3,p')].flatMap(el=>{
   const range=document.createRange();range.selectNodeContents(el);const r=range.getBoundingClientRect();
   if(!r.width||!r.height)return [];
   const points=[[r.left+1,r.top+1],[r.right-1,r.top+1],[r.left+1,r.bottom-1],[r.right-1,r.bottom-1]];
   return points.every(([x,y])=>root.contains(document.elementFromPoint(x,y)))?[]:[el.textContent];
  }));expect(clipped,'Seat labels/counters must be painted inside rounded felt').toEqual([]);
  await viewer.screenshot({path:info.outputPath(`poker-ten-${width}x${height}.png`)});
 }
});
});

test.describe("seating coverage 2", () => {

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
test('fourteen seat presets, live swaps, unseated pool and large event render',async({page,baseURL},info)=>{
 const a=await setup(page,baseURL!);try{
 for(const layout of SEAT_LAYOUTS){await a.show('seat-map',{layout,tableCount:4,seatsPerTable:8,people:[{id:'p',name:'Peter',tags:['Family']},{id:'k',name:'Karen'}]});await expect(a.viewer.locator('.seat-room')).toHaveClass(new RegExp('layout-'+layout));await expect(a.viewer.locator('.unseated')).toContainText('Peter');if(['round-tables','classroom-pods','hollow-square'].includes(layout))await photo(a.viewer,info,'seats-'+layout);}
 await a.update('kanvas.seat.map.update',{action:'place',personId:'p',seatId:'seat-1'});await a.update('kanvas.seat.map.update',{action:'place',personId:'k',seatId:'seat-2'});await a.update('kanvas.seat.map.update',{action:'move',personId:'p',seatId:'seat-2'});await a.current();await expect(a.viewer.locator('.seat[title="seat-1"]')).toContainText('Karen');
 const result=await a.client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.seat.map.update',arguments:{sessionId:a.sessionId,displayId:a.display.id,action:'clear-seat',seatId:'seat-1',expectedRevision:'wrong'}}});expect(result.isError).toBe(true);expect((result.structuredContent as any).error.currentRevision).toBeGreaterThan(0);
 const historyGuard=await a.client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.display.navigate',arguments:{sessionId:a.sessionId,displayIds:[a.display.id],direction:'back',expectedRevisions:{[a.display.id]:'wrong'}}}});expect(historyGuard.isError).toBe(true);expect((historyGuard.structuredContent as any).error.currentRevision).toBe((result.structuredContent as any).error.currentRevision);
 await a.show('seat-map',{layout:'round-tables',tableCount:50,seatsPerTable:10,people:Array.from({length:500},(_,i)=>({id:'g'+i,name:'Guest '+(i+1)}))});await expect(a.viewer.locator('.seat')).toHaveCount(500);await expect(a.viewer.locator('.unseated')).toContainText('500');await photo(a.viewer,info,'large-event');
 }finally{await a.client.close();}
});
});

test.describe("seating coverage 3", () => {

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
test('compact seating fits, explicit 2x2 and continuous horseshoe geometry',async({page,baseURL},info)=>{
 const a=await setup(page,baseURL!);try{
 await a.show('seat-map',{layout:'round-tables',tableCount:4,seatsPerTable:8,tableColumns:2});await expect(a.viewer.locator('.seat')).toHaveCount(32);await expect(a.viewer.locator('.seating')).not.toContainText('Open');await fit(a.viewer);
 const boxes=await a.viewer.locator('.seat-group').evaluateAll(ns=>ns.map(n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y};}));expect(Math.abs(boxes[0].y-boxes[1].y)).toBeLessThan(2);expect(boxes[2].y).toBeGreaterThan(boxes[0].y);await photo(a.viewer,info,'seats-2x2');
 await a.show('seat-map',{layout:'cocktail-rounds',tableCount:6,seatsPerTable:4});await fit(a.viewer);await photo(a.viewer,info,'cocktail-24');
 for(const layout of ['horseshoe','hollow-square']){await a.show('seat-map',{layout,seatsPerTable:16});await fit(a.viewer);await photo(a.viewer,info,layout);const seats=a.viewer.locator('.seat-group').first().locator('.seat');const b=await seats.evaluateAll(ns=>ns.slice(0,2).map(n=>{const box=n.getBoundingClientRect();return box.y+box.height/2;}));const table=await a.viewer.locator('.seat-group').first().locator('.seat-table').boundingBox();expect(Math.min(...b)).toBeLessThan(table!.y+table!.height/2);expect(Math.max(...b)).toBeGreaterThan(table!.y+table!.height/2);}
 await a.show('seat-map',{layout:'theater',tableCount:3,seatsPerTable:8});await expect(a.viewer.locator('.seat-group h3').first()).toHaveText('Row 1');
 }finally{await a.client.close();}
});
});

test.describe("seating coverage 4", () => {

async function navigation(page:any,s:string,d:string,revision:number,action:unknown){const tabId=await page.evaluate(()=>sessionStorage.getItem('kanvas-viewer-tab'));return sessionApi(page,`/api/sessions/${s}/displays/${d}/navigation`,'POST',{tabId:tabId??'feedback26',requestId:crypto.randomUUID(),expectedRevision:revision,navigation:action});}

test('seat axes and explicit seating match the drawn tables; classroom grouping respects controls',async({page})=>{
 await register(page);const s=await createSession(page,'Seating axes'),d=await createDisplay(page,s,'Seats');
 for(const layout of ['horseshoe','hollow-square','head-and-guests']){
  await publishPrepared(page,s,[d.id],{version:1,template:'seat-map',data:{layout,seatsPerTable:6,seating:'both'}});
  await page.goto('/view/'+s+'/'+d.id);await expect(page.locator('.seat-room')).toBeVisible();
  const head=await page.locator('.table-horizontal .seat-table').first().boundingBox();expect(head!.width).toBeGreaterThan(head!.height);
  if(layout!=='head-and-guests'){const side=await page.locator('.table-vertical .seat-table').first().boundingBox();expect(side!.height).toBeGreaterThan(side!.width);}
 }
 await publishPrepared(page,s,[d.id],{version:1,template:'seat-map',data:{layout:'classroom-pods',tableCount:6,clusterSize:2}});await expect(page.locator('.seat-group')).toHaveCount(6);await expect(page.locator('.seat')).toHaveCount(12);
 await publishPrepared(page,s,[d.id],{version:1,template:'seat-map',data:{layout:'classroom-grid',sections:1,seatsPerTable:20}});await expect(page.locator('.seat-group')).toHaveCount(1);await expect(page.locator('.seat')).toHaveCount(20);
});
});
