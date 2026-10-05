import { operationRequest } from '../mcp/requests.js';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {Client as LegacyClient} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport as LegacyTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {Page,TestInfo,Browser} from '@playwright/test';
import type {ViewSpec,DisplayRecord} from '../../src/shared/types';
import {advancedChartExamples} from '../../src/shared/advanced-chart-examples';
import {samples} from '../../src/shared/template-examples';
import {test,expect,register,createSession,createDisplay,openViewer,publishPrepared,waitForDisplay,sessionApi,sessionDetail,tab} from './support';

async function setup(page:Page,info:TestInfo,baseURL:string){
  await register(page);const s=await createSession(page,'September 23 feedback'),d=await createDisplay(page,s,'Acceptance screen'),v=await openViewer(page,s,d.id);
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
test.setTimeout(180_000);

async function stable(page:Page,selector:string){
  const sizes=await page.locator(selector).evaluate(async el=>{const values:string[]=[];for(let i=0;i<65;i++){await new Promise(requestAnimationFrame);const r=el.getBoundingClientRect();if(i>=20)values.push([r.width,r.height,el.scrollWidth,el.scrollHeight].map(x=>Math.round(x*2)/2).join(':'));}return [...new Set(values)];});
  expect(sizes,'Settled chart geometry must not oscillate between scrollbar sizes').toHaveLength(1);
}
async function contained(page:Page,selector:string){
  expect(await page.locator(selector).evaluate(el=>({horizontal:el.scrollWidth-el.clientWidth,vertical:el.scrollHeight-el.clientHeight}))).toEqual({horizontal:0,vertical:0});
}

test('windowed charts fit the measured viewport, use full funnel height and omit raw data by default',async({page,baseURL},info)=>{
 const a=await setup(page,info,baseURL!);try{
  const phone=info.project.name.startsWith('phone');if(!phone)await a.v.setViewportSize({width:1280,height:720});
  const tree:ViewSpec={version:1,template:'chart',data:{kind:'treemap',nodes:[{id:'root',label:'Budget',value:120},...Array.from({length:3},(_,g)=>({id:`g${g}`,parent:'root',label:`Group ${g+1}`,value:40})),...Array.from({length:9},(_,i)=>({id:`n${i}`,parent:`g${Math.floor(i/3)}`,label:`Work ${i+1}`,value:i%3?13:14}))]}};
  for(const view of [advancedChartExamples.gauge,tree]){await a.show(view);await stable(a.v,'.advanced-chart-body');await contained(a.v,'.advanced-chart-body');await expect(a.v.locator('.advanced-chart-key,.exact-data-table')).toHaveCount(0);await photo(a.v,info,String(view.data.kind));}
  for(const count of [3,5,10]){
   await a.show({version:1,template:'chart',data:{kind:'funnel',series:[{name:'Participants',points:Array.from({length:count},(_,i)=>({x:`Stage ${i+1}`,y:1000-i*80}))}]}});
   await stable(a.v,'.advanced-chart-body');await contained(a.v,'.advanced-chart-body');
   expect(await a.v.locator('.advanced-chart-body').evaluate(el=>el.querySelector('svg')!.getBoundingClientRect().height/el.clientHeight)).toBeGreaterThan(.85);
  }await photo(a.v,info,'funnel');
  const waterfall:ViewSpec={version:1,template:'chart',data:{kind:'waterfall',series:[{name:'Balance',points:Array.from({length:13},(_,i)=>({x:`Monthly financial period ${i+1}`,y:i===0?180:i%2?-12:24,...(i===0?{total:true}:{})}))}]}};
  await a.show(waterfall);await stable(a.v,'.advanced-chart-body');if(!phone)await contained(a.v,'.advanced-chart-body');await photo(a.v,info,'waterfall');
  for(const view of [samples.chart,{...samples.chart,data:{...samples.chart.data,kind:'bar'}},samples.timeline]){await a.show(view);const selector=view.template==='timeline'?'.spine-scroll':'.legacy-chart-plot';await stable(a.v,selector);}
  await photo(a.v,info,'timeline');
  if(!phone){await a.v.setViewportSize({width:1920,height:1080});await a.show(advancedChartExamples.gauge);await contained(a.v,'.advanced-chart-body');await stable(a.v,'.advanced-chart-body');await photo(a.v,info,'gauge-tv');}
  await a.show({...tree,showControls:true});await expect(a.v.locator('.advanced-chart-key')).toBeVisible();
 }finally{await a.client.close();}
});

test('records, status colours, stories, recipe pictures and icons preserve the supplied source',async({page,baseURL},info)=>{
 const a=await setup(page,info,baseURL!);try{
  const image=await asset(a),record:ViewSpec={version:1,template:'record-detail',data:{id:'INC-482',title:'Release approval',status:'Review',statusColor:'#39ad82',assignees:['Kim','Sam'],fields:{Exact:'1.2300',Contract:'9007199254740993'},description:'The complete supplied description.\n\nNo summaries or inferred fields.',activity:[{id:'a',author:'Kim',timestamp:'Yesterday (source)',text:'Original discussion text.'}],related:[{id:'D-1',type:'Deal',title:'Related contract'}]}};
  const original=await a.show(record);for(const text of ['INC-482','Kim, Sam','1.2300','9007199254740993','Original discussion text.','Related contract'])await expect(a.v.locator('.record-detail')).toContainText(text);expect((await a.current()).view).toEqual(original.view);await photo(a.v,info,'record-detail');
  await a.show({version:1,template:'cards',data:{items:[{id:'a',title:'Review',status:'Custom status',statusColor:'#123456',fields:{Exact:'1.2300'}}]}});await expect(a.v.locator('.record-state-dot')).toHaveCSS('background-color','rgb(18, 52, 86)');
  await a.show({version:1,template:'story-cards',data:{items:[{image:{url:image.url,alt:'Article picture'},headline:'A clear headline',summary:'The original short summary.'},{headline:'Text-only story',summary:'No placeholder picture.'}]}});await expect(a.v.locator('.story-card')).toHaveCount(2);await expect(a.v.locator('.story-card img')).toHaveCount(1);await photo(a.v,info,'story-cards');
  const recipe:ViewSpec={version:1,template:'recipe',data:{name:'Lemon cake',steps:['Mix the batter.','Bake for 20 minutes.'],image:{url:image.url,alt:'Finished cake'},stepDetails:[{index:0,action:'mix',image:{url:image.url,alt:'Mixing bowl'}},{index:1,action:'bake'}],mode:'overview'}};
  await a.show(recipe);await expect(a.v.getByRole('img',{name:'Finished cake'})).toBeVisible();await expect(a.v.getByRole('img',{name:'mix',exact:true})).toBeVisible();await photo(a.v,info,'recipe-overview');
  await a.show({...recipe,data:{...recipe.data,mode:'steps',stage:'step',index:0}});await expect(a.v.getByRole('img',{name:'Mixing bowl'})).toBeVisible();await expect(a.v.getByRole('img',{name:'mix',exact:true})).toBeVisible();await photo(a.v,info,'recipe-step');
  await a.show({version:1,template:'itinerary',data:{days:[{date:'2026-09-23',items:[{title:'Fly to Oslo',category:'flight'},{title:'Hotel check-in',category:'hotel'},{title:'Dinner',category:'food'}]}]}});for(const name of ['flight','hotel','food'])await expect(a.v.getByRole('img',{name,exact:true})).toBeVisible();
  await a.show({version:1,template:'scoreboard',data:{sides:[{id:'a',name:'North',score:2},{id:'b',name:'South',score:1}],event:{text:'Goal · Alex 42′',type:'goal',sideId:'a'}}});await expect(a.v.locator('.scoreboard-event')).toContainText('Goal · Alex 42′');await photo(a.v,info,'score-event');
 }finally{await a.client.close();}
});

test('balanced image grids expand and return, and public carousels follow broadcasts and reload position',async({page,baseURL,browser,diagnostics},info)=>{
 const a=await setup(page,info,baseURL!);let context:Awaited<ReturnType<Browser['newContext']>>|undefined;try{
  const image=await asset(a),images=Array.from({length:20},(_,i)=>({url:image.url,alt:`Image ${i+1}`,title:`Hidden ${i+1}`,caption:'Hidden caption'}));
  for(const count of [4,6,20]){
   await a.show({version:1,template:'image-gallery',data:{images:images.slice(0,count)}});await expect(a.v.locator('.gallery-frames>figure:visible')).toHaveCount(count);
   const columns=await a.v.locator('.gallery-frames').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);if(count===4)expect(columns).toBe(2);if(count===6)expect(columns).toBe(info.project.name.startsWith('phone')?2:3);
   await expect(a.v.locator('.gallery-frames h2,.gallery-frames figcaption')).toHaveCount(0);await a.v.getByRole('button',{name:'Enlarge Image 2',exact:true}).click();await expect(a.v.locator('.gallery-frames>figure:visible')).toHaveAttribute('data-image-index','1');await a.v.getByRole('button',{name:'Back to image grid'}).click();await expect(a.v.locator('.gallery-frames>figure:visible')).toHaveCount(count);
  }await photo(a.v,info,'gallery-twenty');
  await a.show({version:1,template:'image-gallery',data:{mode:'carousel',images:images.slice(0,4)}});
  const access=await a.call('kanvas_access','session.public',{sessionId:a.s,expectedRevision:0,enabled:true,confirm:true});expect(access).toBeTruthy();
  context=await browser.newContext({baseURL,viewport:info.project.use.viewport,hasTouch:true,colorScheme:'dark',reducedMotion:'reduce'});const publicPage=await context.newPage();diagnostics.watch(publicPage);await publicPage.goto(`/view/${a.s}/${a.d.id}`);await expect(publicPage.locator('.gallery-frames>figure:visible')).toHaveAttribute('data-image-index','0');
  await a.nav({action:'page',page:3});await expect(publicPage.locator('.gallery-frames>figure:visible')).toHaveAttribute('data-image-index','2');await publicPage.reload();await expect(publicPage.locator('.gallery-frames>figure:visible')).toHaveAttribute('data-image-index','2');
  const touch=await context.newCDPSession(publicPage);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:280,y:220}]});await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:90,y:224}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.detach();await expect(publicPage.locator('.gallery-frames>figure:visible')).toHaveAttribute('data-image-index','3');
  await expect(a.v.locator('.gallery-frames>figure:visible')).toHaveAttribute('data-image-index','2');await a.nav({action:'page',page:2});await expect(publicPage.locator('.gallery-frames>figure:visible')).toHaveAttribute('data-image-index','1');await photo(publicPage,info,'public-carousel');
 }finally{await context?.close();await a.client.close();}
});

test('session overview restores real retained thumbnails while account home remains a list',async({page,baseURL},info)=>{
 const a=await setup(page,info,baseURL!);try{
  await a.show({...samples.fact,title:'First retained frame'});await a.show({...samples.chart,title:'Chart frame'});await a.show({...samples.number,title:'Number frame'});
  await a.show({version:1,template:'overview',data:{}});await expect(a.v.locator('.retained-overview-grid')).toBeVisible();await expect(a.v.locator('.retained-preview .template-fact')).toBeVisible();await expect(a.v.locator('.retained-preview .template-chart')).toHaveCount(1);await expect.poll(()=>a.v.locator('.retained-overview-grid>article').evaluateAll(cards=>cards.every(card=>{
    const box=card.getBoundingClientRect(),caption=card.querySelector('.overview-card-caption')!.getBoundingClientRect();
    return caption.top>=box.top&&caption.bottom<=box.bottom+1;
  }))).toBe(true);
  expect(await a.v.locator('.retained-preview').first().evaluate(frame=>{
    const box=frame.getBoundingClientRect(),preview=frame.firstElementChild!.getBoundingClientRect();
    return Math.abs((box.left+box.right)-(preview.left+preview.right))<2&&preview.top>=box.top-1&&preview.bottom<=box.bottom+1;
  })).toBe(true);await photo(a.v,info,'session-thumbnails');
  await a.show({version:1,template:'overview',data:{layout:'list',showPreviews:false}});await expect(a.v.locator('.overview-list')).toBeVisible();await expect(a.v.locator('.retained-preview')).toHaveCount(0);
  await a.show({version:1,template:'overview',data:{scope:'account'}});await expect(a.v.locator('.retained-preview,.retained-overview-grid')).toHaveCount(0);await photo(a.v,info,'account-list');
 }finally{await a.client.close();}
});

test('authenticated producers push all six live kinds without content regeneration and the receiver acknowledges each',async({page,baseURL},info)=>{
 const a=await setup(page,info,baseURL!);try{
  for(const kind of ['number','gauge','line','area','bar','heatmap']){
   const view:ViewSpec=kind==='number'?{version:1,template:'number',data:{value:'1.2300',label:'Sensor'}}:{version:1,template:'chart',data:kind==='gauge'?{kind,gauge:{min:0,max:100},series:[{name:'Sensor',points:[{x:'Now',y:12}]}]}:{kind,series:[{name:'Sensor',points:[{x:'T1',y:12,...(kind==='heatmap'?{value:12}:{})},{x:'T2',y:18,...(kind==='heatmap'?{value:18}:{})}]}]}};
   const before=await a.show(view),data=structuredClone(before.view!.data);if(kind==='number')data.value='9007199254740993';else{(data.series as any)[0].points[0].y=23;if(kind==='heatmap')(data.series as any)[0].points[0].value=23;}
   const pushed=await a.call('kanvas_monitor','push',{sessionId:a.s,displayId:a.d.id,requestId:randomUUID(),expectedRevision:before.revision,data});await a.painted(before.revision+1);expect((await a.current()).view!.data).toEqual(data);
  }await photo(a.v,info,'live-push');
 }finally{await a.client.close();}
});

test('long list labels remain readable without horizontal overflow and tool logs use compact rows',async({page,baseURL},info)=>{
 const a=await setup(page,info,baseURL!);try{
  const items=['Line chart','Bar chart','Area chart','Pie chart','Donut chart','Gauge','Funnel','Waterfall','Heatmap','Radar','Treemap','Sankey flow','Bubble chart','Scatter plot','Histogram','Box-and-whisker chart','Network graph','Parallel coordinates','Geographic choropleth','Stacked area chart','Stacked bar chart'];
  await a.show({version:1,template:'list',data:{items}});await expect(a.v.locator('.plain-list li')).toHaveCount(21);expect(await a.v.locator('.plain-list-scroll').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);expect(await a.v.locator('.plain-list li').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(18);await photo(a.v,info,'long-list');
  await a.call('kanvas_publish','tool-log.append',{sessionId:a.s,channel:'acceptance',requestId:randomUUID(),events:[{id:'a',integration:'Fixture',tool:'Example tool',status:'completed',timestamp:'2026-09-23T10:00:00Z',durationMs:42,summary:'Completed source refresh.'}]});await a.show({version:1,template:'tool-call-log',data:{channel:'acceptance'}});await expect(a.v.locator('.tool-call-content')).toContainText('Example tool');expect(await a.v.locator('.tool-call-content>ol>li').first().evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(170);await photo(a.v,info,'compact-tool-log');
 }finally{await a.client.close();}
});
async function photo(page:Page,info:TestInfo,name:string){for(const notice of await page.getByRole('button',{name:'Dismiss notification',exact:true}).all())await notice.click();await page.evaluate(()=>document.fonts.ready);await mkdir(info.outputPath('visuals'),{recursive:true});await page.screenshot({path:`${info.outputPath('visuals')}/${info.project.name}-${name}.png`,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);}
async function asset(a:Fixture,color='#267f9f',w=240,h=120){return a.call('kanvas_import','asset.import',{sessionId:a.s,name:'Acceptance logo.svg',mimeType:'image/svg+xml',base64:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect x="1" y="1" width="${w-2}" height="${h-2}" fill="${color}" stroke="#ffffff" stroke-width="2"/><circle cx="${w/2}" cy="${h/2}" r="${h/3}" fill="#ffffff"/><text x="${w/2}" y="${h/2+5}" text-anchor="middle" fill="${color}" font-size="16">K</text></svg>`).toString('base64')});}
