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
import { test } from './support';
import { expect } from './support';
import { register } from './support';
import { login } from './support';
import { createSession } from './support';
import { createDisplay } from './support';
import { openViewer } from './support';
import { publishPrepared } from './support';
import { waitForDisplay } from './support';
import { sessionApi } from './support';
import { sessionDetail } from './support';
import { isolatedContext } from './support';
import { validateView } from '../../src/shared/view-schemas';
import { samples } from '../../src/shared/template-examples';
import { gameExample } from '../../src/shared/game';
import { emailRuntime } from './email-oauth-fixture';
import { beginEmailConnector } from './email-oauth-fixture';
import { operationId } from '../../src/server/mcp/operations';

test.describe("split screen coverage 1", () => {


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

test('actual inbox, cards and integration-pane scrolling is acknowledged from the moving browser',async({page,baseURL},info)=>{
  const a=await setup(page,info,baseURL!);try{
    const cases:{view:ViewSpec;selector:string}[]=[
      {view:{version:1,template:'inbox',data:{items:Array.from({length:70},(_,i)=>({id:`mail${i}`,from:`Sender ${i}`,subject:`Original message ${i}`,snippet:'An exact supplied preview with enough context to read. 1.2300',timestamp:'17 Sep 2026',unread:i===0}))}},selector:'.inbox-list'},
      {view:{version:1,template:'cards',data:{items:Array.from({length:70},(_,i)=>({id:`card${i}`,title:`A meaningful sentence about source card ${i}`,description:'This longer description stays attached to its original record and keeps the full value 9007199254740993.001.'}))}},selector:'.record-grid'},
      {view:{version:1,template:'tool-inventory',data:{groups:[{name:'Integration A',tools:Array.from({length:46},(_,i)=>({name:`operation_${i}`,description:'Source tool description with supplied details. '.repeat(3)}))},{name:'Integration B',tools:[{name:'last_operation',description:'Another real supplied tool'}]}]}},selector:'.inventory[data-navigation-scroll]'}
    ];
    for(const {view,selector} of cases){const before=await a.show(view),scroll=a.v.locator(`.viewer-candidate ${selector}`);await expect.poll(()=>scroll.evaluate(e=>e.scrollHeight-e.clientHeight)).toBeGreaterThan(50);
      await a.nav({action:'scroll',y:1});await expect.poll(()=>scroll.evaluate(e=>e.scrollTop/Math.max(1,e.scrollHeight-e.clientHeight))).toBeGreaterThan(.98);
      await expect.poll(async()=>{const r=await a.call('kanvas_inspect','navigation.read',{sessionId:a.s,displayId:a.d.id});return r.viewers.some((v:any)=>v.status==='applied'&&v.scroll?.maxY>50&&v.scroll?.y>.98);}).toBe(true);
      const after=await a.current();expect(after.view).toEqual(before.view);expect(after.revision).toBe(before.revision);
      await a.nav({action:'scroll',y:0});await expect.poll(()=>scroll.evaluate(e=>e.scrollTop)).toBeLessThan(2);
    }
    await a.v.getByRole('button',{name:'Integration B'}).click();await expect(a.v.locator('.inventory[data-navigation-scroll]')).toContainText('last_operation');await expect(a.v.getByRole('navigation',{name:'Integrations'})).toContainText('Integration A');
    await a.nav({action:'page',page:1});await expect(a.v.locator('.inventory[data-navigation-scroll]')).toContainText('operation_0');await photo(a.v,info,'integration-rail');
    await a.show({version:1,template:'inbox',data:{items:Array.from({length:50},(_,i)=>({id:`i${i}`,from:'Source',subject:`Message ${i}`,snippet:'Read only, no implicit message open.'}))}});
    await expect(a.v.locator('.inbox-message button,.inbox-message a')).toHaveCount(0);await a.v.locator('.inbox-list').focus();await a.v.keyboard.press('PageDown');await expect.poll(()=>a.v.locator('.inbox-list').evaluate(e=>e.scrollTop)).toBeGreaterThan(20);await photo(a.v,info,'inbox-reader');
  }finally{await a.client.close();}
});
});

test.describe("split screen coverage 2", () => {

const quiet=async(page:Page)=>{for(const button of await page.locator('.viewer-toast button').all())await button.click();};
const fact=(text:string)=>({version:1 as const,template:'fact' as const,data:{text}});

test('split panes use real local viewports and retain sibling DOM state across single-pane patch',async({page},info)=>{
 await register(page);const s=await createSession(page,'Split panes'),d=await createDisplay(page,s,'Split'),viewer=await openViewer(page,s,d.id);
 await viewer.setViewportSize({width:1440,height:900});
 const panes=[{id:'left',view:fact('First pane')},{id:'right',view:validateView({template:'document',data:{text:'Notes\n\n'+('Readable text.\n\n'.repeat(100))}})}];
 await publishPrepared(page,s,[d.id],{version:1,template:'split-screen',data:{panes}});const left=viewer.frameLocator('iframe[title="Pane left"]'),right=viewer.frameLocator('iframe[title="Pane right"]');await expect(left.getByText('First pane',{exact:true})).toBeVisible();await expect(right.locator('.document-content')).toBeVisible();
 const localWidth=await right.locator('body').evaluate(()=>innerWidth);expect(localWidth).toBeLessThan(800);expect(localWidth).toBeGreaterThan(400);
 await right.locator('body').evaluate(el=>{el.dataset.siblingSentinel='retained';});
 const current=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!;
 const result=await sessionApi(page,`/api/sessions/${s}/displays/${d.id}/patch`,'POST',{requestId:randomUUID(),expectedRevision:current.revision,operations:[{op:'set',path:'/data/panes/0/view',value:fact('Updated pane')}]});expect(result.status).toBe(200);await expect(left.getByText('Updated pane',{exact:true})).toBeVisible();expect(await right.locator('body').getAttribute('data-sibling-sentinel')).toBe('retained');
 await quiet(viewer);await viewer.screenshot({path:info.outputPath('split-two.png')});
 await publishPrepared(page,s,[d.id],{version:1,template:'split-screen',data:{direction:'horizontal',panes}});await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision);const frames=await viewer.locator('.viewer-candidate .split-pane').evaluateAll(es=>es.map(e=>({top:e.getBoundingClientRect().top,width:e.getBoundingClientRect().width})));expect(frames[1].top).toBeGreaterThan(frames[0].top);expect(frames[0].width).toBeGreaterThan(1000);await quiet(viewer);await viewer.screenshot({path:info.outputPath('split-horizontal.png')});
 for(const count of [4,6]){await publishPrepared(page,s,[d.id],{version:1,template:'split-screen',data:{panes:Array.from({length:count},(_,i)=>({id:'p'+i,view:[samples.chart,samples.table,{version:1 as const,template:'game-board' as const,data:gameExample('chess')},validateView({template:'weather',data:{condition:'rain',display:{visualOnly:true}}}),validateView({template:'qr',data:{content:'https://example.com/',title:'Scan'}}),fact('Pane 5')][i]}))}});await expect(viewer.locator('.viewer-candidate .split-pane')).toHaveCount(count);await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision);const inheritedColor=await viewer.locator('.viewer-candidate').evaluate(e=>getComputedStyle(e).color);expect(await viewer.frameLocator('iframe[title="Pane p1"]').locator('td').first().evaluate(e=>getComputedStyle(e).color)).toBe(inheritedColor);await quiet(viewer);await viewer.screenshot({path:info.outputPath(`split-${count}.png`)});}
 for(const theme of ['light','dark']){const detail=await sessionDetail(page,s);expect((await sessionApi(page,`/api/sessions/${s}/config`,'PATCH',{expectedRevision:detail.session.configRevision,config:{theme}})).status).toBe(200);await expect(viewer.locator('.viewer-shell')).toHaveClass(new RegExp('theme-'+theme));await expect.poll(async()=>{const parent=await viewer.locator('.viewer-candidate').evaluate(e=>getComputedStyle(e).color);const pane=await viewer.frameLocator('iframe[title="Pane p1"]').locator('td').first().evaluate(e=>getComputedStyle(e).color);return {parent,pane};}).toEqual({parent:theme==='light'?'rgb(58, 58, 58)':'rgb(237, 237, 237)',pane:theme==='light'?'rgb(58, 58, 58)':'rgb(237, 237, 237)'});}
 await viewer.setViewportSize({width:390,height:844});/* 0.38.0 (a3523838): a phone shows the authored panes, not tabs. */await expect(viewer.locator('.viewer-candidate .split-screen>nav')).toHaveCount(0);await expect(viewer.locator('.viewer-candidate .split-pane')).toHaveCount(6);await expect(viewer.frameLocator('iframe[title="Pane p5"]').getByText('Pane 5',{exact:true})).toBeVisible();await quiet(viewer);await viewer.screenshot({path:info.outputPath('split-phone.png')});
});
});

test.describe("split screen coverage 3", () => {


const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({version:1,template,data,...extra} as never) as ViewSpec;
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov14 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov14-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,canonical:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId:operationId(canonical),arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const fact=(text:string)=>({version:1,template:'fact',data:{text}});
const pane=(id:string,inner:Record<string,unknown>=fact(id))=>({id,view:inner});
const pie=(kind:'pie'|'donut')=>({version:1,template:'chart',data:{kind,series:[{name:'Share',points:[{x:'Alpha',y:40},{x:'Beta',y:30},{x:'Gamma',y:20},{x:'Delta',y:10}]}]}});

test('split screen shows the authored grid on every screen, nests once, and takes a divider (a3523838, 4e78197e)',async({page,diagnostics})=>{
 const {s,d,viewer}=await setup(page,'Split grids');diagnostics.allowHttp(page,`/api/sessions/${s}/submit`,400);
 const grid=()=>viewer.locator('.viewer-candidate .split-screen>.split-grid');
 const boxes=async()=>(await viewer.locator('.viewer-candidate .split-leaf').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {id:(el as HTMLElement).dataset.paneId,x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};})));
 // Three columns: refused in 0.37, and a phone used to get tabs.
 await shown(page,viewer,s,d.id,view('split-screen',{rows:1,columns:3,panes:[pane('a'),pane('b'),pane('c')]}));
 await expect(viewer.locator('.viewer-candidate iframe.split-pane')).toHaveCount(3);
 await expect(viewer.locator('.viewer-candidate .split-screen nav')).toHaveCount(0);
 let layout=await boxes();
 expect(new Set(layout.map(b=>b.y)).size).toBe(1);expect(layout[0].x).toBeLessThan(layout[1].x);expect(layout[1].x).toBeLessThan(layout[2].x);
 for(const box of layout){expect(box.w).toBeGreaterThan(60);expect(box.h).toBeGreaterThan(200);}
 for(const id of ['a','b','c'])await expect(viewer.frameLocator(`[data-pane-id="${id}"] iframe.split-pane`).locator('.render-surface')).toContainText(id);
 // Default divider is the 0.37 one: 6 px gap, 1 px border.
 expect(await grid().evaluate(el=>getComputedStyle(el).columnGap)).toBe('6px');
 expect(await viewer.locator('.viewer-candidate .split-leaf').first().evaluate(el=>getComputedStyle(el).borderTopWidth)).toBe('1px');
 // Left half one pane, right half four rows.
 await shown(page,viewer,s,d.id,view('split-screen',{columns:2,divider:'none',panes:[pane('main'),{id:'side',rows:4,columns:1,panes:[pane('r1'),pane('r2'),pane('r3'),pane('r4')]}]}));
 await expect(viewer.locator('.viewer-candidate iframe.split-pane')).toHaveCount(5);
 layout=await boxes();const main=layout.find(b=>b.id==='main')!,rights=layout.filter(b=>b.id!=='main');
 expect(rights.every(b=>b.x>=main.x+main.w-1)).toBe(true);expect(new Set(rights.map(b=>b.y)).size).toBe(4);expect(Math.abs(rights.reduce((sum,b)=>sum+b.h,0)-main.h)).toBeLessThan(8);
 expect(await grid().evaluate(el=>getComputedStyle(el).columnGap)).toBe('0px');
 expect(await viewer.locator('.viewer-candidate .split-leaf').first().evaluate(el=>getComputedStyle(el).borderTopWidth)).toBe('0px');
 // Authored gap, border and colour, also inside the nested grid.
 await shown(page,viewer,s,d.id,view('split-screen',{columns:2,divider:{gap:20,borderWidth:3,borderColor:'#ff8800'},panes:[pane('main'),{id:'side',rows:2,columns:1,panes:[pane('r1'),pane('r2')]}]}));
 expect(await grid().evaluate(el=>getComputedStyle(el).columnGap)).toBe('20px');
 expect(await viewer.locator('.viewer-candidate .split-nested>.split-grid').evaluate(el=>getComputedStyle(el).rowGap)).toBe('20px');
 expect(await viewer.locator('.viewer-candidate [data-pane-id="r2"]').evaluate(el=>[getComputedStyle(el).borderTopWidth,getComputedStyle(el).borderTopColor])).toEqual(['3px','rgb(255, 136, 0)']);
 // Sixteen panes render; a seventeenth is refused by the server.
 await shown(page,viewer,s,d.id,view('split-screen',{rows:4,columns:4,panes:Array.from({length:16},(_,i)=>pane(`p${i}`))}));
 await expect(viewer.locator('.viewer-candidate iframe.split-pane')).toHaveCount(16);
 const refused=await sessionApi(page,`/api/sessions/${s}/submit`,'POST',{requestId:'seventeen',displayIds:[d.id],view:{version:1,template:'split-screen',data:{rows:4,columns:4,panes:[...Array.from({length:15},(_,i)=>pane(`p${i}`)),{id:'g',rows:1,columns:2,panes:[pane('x'),pane('y')]}]}}});
 expect(refused.status).toBeGreaterThanOrEqual(400);
});
});

test.describe("split screen coverage 4", () => {


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

test('split panels and before/after diff navigation target the exact independent pane',async({page,baseURL},info)=>{
 const a=await setup(page,info,baseURL!);try{
  const lines=Array.from({length:320},(_,i)=>`const source${i+1} = ${i+1};`).join('\n');
  await a.show({version:1,template:'code',data:{kind:'split',panels:[{id:'caller',kind:'code',path:'caller.ts',code:lines,language:'typescript'},{id:'definition',kind:'diff',path:'definition.ts',before:lines,after:lines.replace('source230 = 230','source230 = 231'),language:'typescript'}]}});
  await expect(a.v.locator('.viewer-candidate [data-code-panel]')).toHaveCount(2);
  await a.nav({action:'gotoLine',panelId:'definition',side:'before',line:230});
  await expect.poll(async()=>{const r=await a.call('kanvas_inspect','navigation.read',{sessionId:a.s,displayId:a.d.id});return r.viewers.some((v:any)=>v.status==='applied'&&v.matches===1);}).toBe(true);
  await expect(a.v.locator('.viewer-candidate [data-code-panel="definition"] [data-code-before="230"]')).toHaveClass(/highlighted/);
  const previousScroll=await a.v.locator('.viewer-candidate [data-code-panel="definition"] .code-scroll').evaluate(e=>e.scrollTop);
  await a.nav({action:'gotoLine',panelId:'caller',line:280});
  await expect(a.v.locator('.viewer-candidate [data-code-panel="caller"] [data-code-line="280"]')).toHaveClass(/highlighted/);expect(await a.v.locator('.viewer-candidate [data-code-panel="definition"] .code-scroll').evaluate(e=>e.scrollTop)).toBe(previousScroll);await photo(a.v,info,'split-code');
 }finally{await a.client.close();}
});
});
