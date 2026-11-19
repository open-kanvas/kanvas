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

test.describe("game coverage 1", () => {


test('all game presets fit both axes and keep readable labels and card-table positions',async({page},info)=>{
 test.setTimeout(240000);
 await register(page);const s=await createSession(page,'Board geometry'),d=await createDisplay(page,s,'Game screen'),viewer=await openViewer(page,s,d.id);
 for(const preset of GAME_PRESETS){
  const data=gameExample(preset);
  if(preset==='solitaire'){
   for(let col=1;col<=7;col++)for(let row=0;row<col;row++)data.cards[`deal${col}_${row}`]={face:'back',zone:`column${col}`,order:row,emphasis:'none'};
   data.cards.last={face:'up',zone:'column7',order:7,rank:'K',suit:'hearts',emphasis:'none'};
  }
  const update=await publishPrepared(page,s,[d.id],{version:1,template:'game-board',data});
  try{await waitForDisplay(page,s,d.id,v=>v.appliedRevision===v.revision&&v.view?.data.preset===preset);}catch(error){const detail=await sessionDetail(page,s);console.log('game qualification failure',preset,JSON.stringify({displays:detail.displays.map(d=>({revision:d.revision,appliedRevision:d.appliedRevision,preset:d.view?.data.preset,delivery:d.delivery})),updates:detail.updates.slice(-2)}));await viewer.screenshot({path:info.outputPath('failed-game.png')});throw error;}
  for(const [width,height] of [[390,844],[844,390],[1440,900],[1920,1054]]){
   await viewer.setViewportSize({width,height});
   await expect.poll(()=>viewer.locator('.viewer-shell').evaluate(e=>Math.round(e.getBoundingClientRect().height)),{message:'Viewport resize is applied before geometry measurements'}).toBe(height);
   const root=viewer.locator('.viewer-candidate .game-surface');await expect(root).toBeVisible();
   const board=root.locator('.game-board,.game-table');
   await expect.poll(async()=>{const b=await board.boundingBox();return !!b&&b.width>100&&b.height>100&&b.x>=-1&&b.y>=-1&&b.x+b.width<=width+1&&b.y+b.height<=height+1;},{message:`${preset} fits ${width}x${height}`}).toBe(true);
   if(!['poker','blackjack','solitaire','backgammon'].includes(preset))await expect(root.locator('.game-column-labels')).toBeVisible();
   if(preset==='blackjack'){const dealer=await root.locator('.zone-dealer').boundingBox(),player=await root.locator('.game-zone:not(.zone-dealer)').first().boundingBox();expect(dealer!.y).toBeLessThan(player!.y);expect(player!.x).toBeGreaterThanOrEqual(0);expect(player!.x+player!.width).toBeLessThanOrEqual(width);const hand=await root.locator('.game-zone:not(.zone-dealer) .game-hand').first().boundingBox();expect(hand!.width).toBeGreaterThan(50);}
   if(preset==='solitaire'){
    const columns=await root.locator('.zone-tableau').all();expect(columns).toHaveLength(7);
    const rects=await Promise.all(columns.map(c=>c.boundingBox()));expect(Math.max(...rects.map(r=>r!.y))-Math.min(...rects.map(r=>r!.y))).toBeLessThan(2);
    const last=await root.locator('[data-game-card=last]').boundingBox();expect(last!.y+last!.height).toBeLessThanOrEqual(height);
    const first=await root.locator('[data-game-card=deal7_0]').boundingBox(),second=await root.locator('[data-game-card=deal7_1]').boundingBox();expect(second!.y).toBeGreaterThan(first!.y);expect(second!.y).toBeLessThan(first!.y+first!.height);
   }
  }
  if(['poker','blackjack','solitaire','chess','connect-four','backgammon'].includes(preset))await viewer.screenshot({path:info.outputPath(`nov05-${preset}.png`)});
 }
});
});

test.describe("game coverage 2", () => {

const quiet=async(page:Page)=>{for(const button of await page.locator('.viewer-toast button').all())await button.click();};
const fact=(text:string)=>({version:1 as const,template:'fact' as const,data:{text}});

test('both neutral Connect Four discs differ from empty slots and face-up corner indices survive overlap',async({page},info)=>{
 await register(page);const s=await createSession(page,'Game readability'),d=await createDisplay(page,s,'Board'),viewer=await openViewer(page,s,d.id);
 const board=gameExample('connect-four');board.pieces={a:{cell:'r6c3',symbol:'disc',side:'first',emphasis:'none'},b:{cell:'r6c4',symbol:'disc',side:'second',emphasis:'none'}};
 await publishPrepared(page,s,[d.id],{version:1,template:'game-board',data:board});await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision);
 for(const theme of ['dark','light']){const detail=await sessionDetail(page,s);expect((await sessionApi(page,`/api/sessions/${s}/config`,'PATCH',{expectedRevision:detail.session.configRevision,config:{theme}})).status).toBe(200);await expect(viewer.locator('.viewer-shell')).toHaveClass(new RegExp('theme-'+theme));
 const colors=await viewer.locator('.viewer-candidate').evaluate(root=>({empty:getComputedStyle(root.querySelector('.game-cell')!).backgroundColor,discs:[...root.querySelectorAll('.game-piece')].map(e=>getComputedStyle(e,'::before').backgroundColor)}));expect(new Set([colors.empty,...colors.discs]).size).toBe(3);
 await quiet(viewer);await viewer.screenshot({path:info.outputPath(`connect-four-${theme}.png`)});}
 await publishPrepared(page,s,[d.id],{version:1,template:'game-board',data:gameExample('solitaire')});const cards=viewer.locator('.viewer-candidate .game-card');await expect(cards.locator('.game-card-index')).toHaveCount(4);await expect(viewer.locator('.viewer-candidate .game-card.is-back .game-card-index')).toHaveCount(0);await expect(viewer.locator('.viewer-candidate [data-game-card="c"] .game-card-index')).toHaveText('Q♥');await quiet(viewer);await viewer.screenshot({path:info.outputPath('solitaire-corners.png')});
});

test('flipping chess keeps coordinates stable and root hides console link without removing account recovery',async({page},info)=>{
 await register(page);await page.goto('/');await expect(page.locator('.account-overview')).toBeVisible();await expect(page.getByRole('link',{name:'Account & console'})).toHaveCount(0);await expect(page.locator('meta[name="kanvas-version"]')).toHaveAttribute('content','0.40.0');await page.goto('/console?account=sessions');await expect(page.getByRole('heading',{name:'Signed-in browsers',exact:true})).toBeVisible();
 const s=await createSession(page,'Board orientation'),d=await createDisplay(page,s,'Chess'),viewer=await openViewer(page,s,d.id);const board=gameExample('chess');board.pieces={king:{cell:'E2',symbol:'king',color:'white',emphasis:'none'}};
 for(const orientation of ['default','flipped'] as const){await publishPrepared(page,s,[d.id],validateView({template:'game-board',data:{...board,orientation}}));await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision);const piece=viewer.locator('.viewer-candidate [data-game-piece="king"]');await expect(piece).toHaveAttribute('title','E2 (r7c5)');const view=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!.view!;expect((view.data.pieces as any).king.coordinate).toBe('E2');await expect(viewer.locator('.viewer-candidate .game-column-labels span').first()).toHaveText(orientation==='default'?'A':'H');await quiet(viewer);await viewer.screenshot({path:info.outputPath(`chess-${orientation}.png`)});}
});
});

test.describe("game coverage 3", () => {


const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({template,data,...extra} as never) as ViewSpec;
/** Publish and wait until this window has painted that revision: a measurement taken while the previous
 * view is being replaced reads an element that is already detached (empty computed style, no box). */
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov10 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov10-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const inside=(inner:{x:number;y:number;width:number;height:number},outer:{x:number;y:number;width:number;height:number},slack=1.5)=>inner.x>=outer.x-slack&&inner.y>=outer.y-slack&&inner.x+inner.width<=outer.x+outer.width+slack&&inner.y+inner.height<=outer.y+outer.height+slack;

test('solitaire piles show every card without scrolling inside a pile (ffdb2cec)',async({page},info)=>{
 const {s,d,viewer}=await setup(page,'Solitaire');
 const zones:Record<string,{label:string}>={stock:{label:'Stock'},waste:{label:'Waste'},f1:{label:'Foundation 1'},f2:{label:'Foundation 2'},t1:{label:'Tableau 1'},t2:{label:'Tableau 2'},t3:{label:'Tableau 3'},t4:{label:'Tableau 4'}},cards:Record<string,unknown>={};
 const add=(zone:string,count:number)=>{for(let i=0;i<count;i++)cards[`${zone}-${i}`]={zone,order:i,rank:['A','2','3','4','5','6','7','8','9','10','J','Q','K'][i%13],suit:['hearts','spades','diamonds','clubs'][i%4],face:'up'};};
 add('stock',1);add('waste',2);add('f1',1);add('f2',2);add('t1',7);add('t2',4);add('t3',13);add('t4',1);
 await publishPrepared(page,s,[d.id],view('game-board',{preset:'solitaire',zones,cards}));await expect(viewer.locator('.viewer-candidate .game-card')).toHaveCount(31);
 const result=await viewer.locator('.viewer-candidate .game-table').evaluate(table=>{const box=table.getBoundingClientRect();const hands=[...table.querySelectorAll('.game-hand')].map(hand=>{const style=getComputedStyle(hand);return {scrolls:['auto','scroll'].includes(style.overflowY)&&hand.scrollHeight>hand.clientHeight+1,overflow:style.overflowY};});const cards=[...table.querySelectorAll('.game-card')].map(card=>{const r=card.getBoundingClientRect();return {inside:r.top>=box.top-1.5&&r.bottom<=box.bottom+1.5&&r.left>=box.left-1.5&&r.right<=box.right+1.5,height:r.height,width:r.width,top:r.top,zone:card.closest('[data-game-zone]')!.getAttribute('data-game-zone')};});return {hands,cards,tableScrolls:table.scrollHeight>table.clientHeight+1&&getComputedStyle(table).overflowY!=='hidden'};});
 expect(result.hands.some(hand=>hand.scrolls)).toBe(false);expect(result.cards.every(card=>card.inside),'every card fully on the table').toBe(true);
 expect(new Set(result.cards.map(card=>Math.round(card.height))).size).toBe(1);
 const long=result.cards.filter(card=>card.zone==='t3').map(card=>card.top).sort((a,b)=>a-b);
 for(let i=1;i<long.length;i++)expect(long[i]-long[i-1],'each corner index has its own strip').toBeGreaterThanOrEqual(8);
 await viewer.screenshot({path:info.outputPath('solitaire.png')});
});
});
