import { operationRequest } from '../mcp/requests.js';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {Client as LegacyClient} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport as LegacyTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {Page,TestInfo} from '@playwright/test';
import type {ViewSpec} from '../../src/shared/types';
import {test,expect,register,login,createSession,createDisplay,openViewer,publishPrepared,waitForDisplay,sessionApi,sessionDetail,isolatedContext} from './support';

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
test('compact viewports and commerce details stay visible on both receiver sizes',async({page,baseURL},info)=>{
 const a=await setup(page,info,baseURL!);try{
  const data={description:'Responsive sample',html:'<h1>Sample</h1>',viewports:['small-phone','iphone','pixel','tablet','laptop','desktop']};
  await a.show({version:1,template:'device-preview',data:{...data,gridSize:'standard'}});const count=()=>a.v.locator('.viewer-candidate .device-preview-grid').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),standard=await count();
  await a.show({version:1,template:'device-preview',data:{...data,gridSize:'compact'}});if(info.project.name.startsWith('phone'))expect(await count()).toBeGreaterThanOrEqual(standard);else expect(await count()).toBeGreaterThan(standard);expect(await a.v.locator('.viewer-candidate iframe').nth(1).evaluate(e=>(e as HTMLIFrameElement).clientWidth)).toBe(390);await photo(a.v,info,'compact-previews');
  await a.show({version:1,template:'product',data:{name:'Reference headset',description:'Supplied description',layout:'multi-vendor',attributes:[{key:'battery',label:'Battery'}],offers:[{vendor:'Shop A',price:'USD 99',availability:'In stock',shipping:'Two days',attributes:{battery:'30h'}},{vendor:'Shop B',price:'USD 109',availability:'Backorder',shipping:'One week'}]}});
  for(const value of ['Reference headset','USD 99','In stock','Two days','30h'])await expect(a.v.locator('.viewer-candidate .product-comparison')).toContainText(value);await photo(a.v,info,'vendor-details');
  await a.show({version:1,template:'comparison',data:{criteria:['Cost'],items:[{name:'A',values:{Cost:1}},{name:'B',values:{Cost:2}}],commentary:{Cost:'Different costs'}}});const cell=a.v.locator('.viewer-candidate td.comparison-commentary');expect(await cell.evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');await photo(a.v,info,'comparison-summary');
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
