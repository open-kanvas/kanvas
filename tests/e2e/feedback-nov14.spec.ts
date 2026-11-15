import type {Page} from '@playwright/test';
import {createDisplay,createSession,expect,openViewer,publishPrepared,register,sessionApi,test,waitForDisplay} from './support';
import {validateView} from '../../src/shared/view-schemas';
import {operationId} from '../../src/server/mcp/operations';
import type {ViewSpec} from '../../src/shared/types';

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

test('pie and donut fit a pane without scrolling (4b998939)',async({page})=>{
 const {s,d,viewer}=await setup(page,'Charts in panes');
 await shown(page,viewer,s,d.id,view('split-screen',{rows:2,columns:3,panes:[pane('bar',{version:1,template:'chart',data:{kind:'bar',series:[{name:'A',points:[{x:'Q1',y:3},{x:'Q2',y:5}]}]}}),pane('pie',pie('pie')),pane('donut',pie('donut')),pane('f1'),pane('f2'),pane('f3')]}));
 for(const id of ['pie','donut']){
  const body=viewer.frameLocator(`[data-pane-id="${id}"] iframe.split-pane`).locator('.advanced-chart-body');
  await expect(body.locator('svg path[data-chart-proportion]').first()).toBeVisible();
  await expect.poll(async()=>body.evaluate(el=>({overflowY:el.scrollHeight-el.clientHeight,overflowX:el.scrollWidth-el.clientWidth})),{message:`${id} pane must not scroll`}).toEqual({overflowY:expect.any(Number),overflowX:expect.any(Number)});
  const fit=await body.evaluate(el=>({y:el.scrollHeight-el.clientHeight,x:el.scrollWidth-el.clientWidth,layout:el.querySelector<HTMLElement>('.advanced-plot-with-key')?.dataset.keyLayout,svg:el.querySelector('svg')!.getBoundingClientRect().height,height:el.clientHeight}));
  expect(fit.y,`${id}: vertical overflow`).toBeLessThanOrEqual(1);expect(fit.x,`${id}: horizontal overflow`).toBeLessThanOrEqual(1);expect(fit.svg).toBeLessThanOrEqual(fit.height+1);expect(['side','stacked']).toContain(fit.layout);
 }
});

test('a display bound to a monitor stream follows it, pairs calls, redacts and reports its end (5dc1b2f7)',async({page,baseURL})=>{
 const {s,d,viewer}=await setup(page,'Live stream');const client=await mcp(page,baseURL!);
 try{
  const stream=(await use(client,'kanvas_monitor_stream_create',{sessionId:s,name:'Build agents',requestId:'e2e-stream'})).structured.data;
  const send=(body:Record<string,unknown>)=>page.request.post(stream.postUrl,{data:body,headers:{'user-agent':'Python-urllib/3.12'}});
  const published=await shown(page,viewer,s,d.id,view('monitor-stream',{streamId:stream.streamId,title:'Agents at work'}));
  const root=viewer.locator('.viewer-candidate .monitor-stream');
  await expect(root).toHaveAttribute('data-stream-state','active');await expect(root.locator('.monitor-stream-state')).toHaveText('Live');await expect(root).toContainText('Waiting for the first event');
  // Events arrive from outside. Nothing is republished: the revision does not move.
  expect((await send({source:'agent-1',event:'PreToolUse',tool:'Bash',target:'sleep 2',callId:'c1'})).status()).toBe(202);
  await expect(root.locator('.stream-row')).toHaveCount(1);await expect(root.locator('.stream-row').first()).toHaveAttribute('data-row-status','running');
  expect((await send({source:'agent-1',event:'PostToolUse',tool:'Bash',target:'sleep 2',callId:'c1'})).status()).toBe(202);
  await expect(root.locator('.stream-row').first()).toHaveAttribute('data-row-status','completed');await expect(root.locator('.stream-row')).toHaveCount(1);
  expect((await send({source:'agent-1',event:'PreToolUse',tool:'Bash',target:'pytest',callId:'c2'})).status()).toBe(202);
  expect((await send({source:'agent-2',event:'Stop',note:`posted to ${stream.postUrl}`})).status()).toBe(202);
  expect((await send({source:'agent-1',event:'Stop'})).status()).toBe(202);
  await expect(root.locator('.stream-row')).toHaveCount(4);
  await expect(root.locator('.stream-row[data-row-status="unknown"]')).toHaveCount(1);await expect(root.locator('.stream-row[data-row-status="unknown"]')).toContainText('no result');
  await expect(root.locator('[data-counter="received"]')).toHaveText('5');
  await expect(root).toContainText('/in/[redacted]');expect(await root.innerText()).not.toContain(new URL(stream.postUrl).pathname.split('/').pop()!);
  await expect(root.locator('.monitor-stream-sources li')).toHaveCount(2);
  expect((await waitForDisplay(page,s,d.id,x=>x.revision>0)).revision).toBe(published.revision);
  // The agent filters with the normal selection and annotates; rows still come from the stream.
  await shown(page,viewer,s,d.id,view('monitor-stream',{streamId:stream.streamId,note:'Nightly build'},{selection:{where:[{field:'source',op:'eq',value:'agent-2'}]}}));
  await expect(root.locator('.stream-row')).toHaveCount(1);await expect(root.locator('.monitor-stream-note')).toHaveText('Nightly build');
  // Revocation is said on screen.
  await use(client,'kanvas_monitor_stream_revoke',{sessionId:s,streamId:stream.streamId});
  await expect(root).toHaveAttribute('data-stream-state','revoked');await expect(root.locator('.monitor-stream-ended')).toContainText('revoked');await expect(root.locator('.stream-row')).toHaveCount(0);
  expect((await send({source:'agent-1',event:'late'})).status()).toBe(410);
 }finally{await client.close();}
});

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

test('text size applies to every template and survives a reload; fit shows a whole diagram (0448f65b, 363457fe)',async({page,baseURL})=>{
 const {s,d,viewer}=await setup(page,'Text size');const client=await mcp(page,baseURL!);
 try{
  await shown(page,viewer,s,d.id,view('task-list',{items:[{title:'First task'},{title:'Second task'}]}));
  const title=viewer.locator('.viewer-candidate .task-item strong').first(),surface=viewer.locator('.viewer-candidate .render-surface');
  const before=(await title.boundingBox())!.height;
  const state=(await use(client,'kanvas_session_state',{sessionId:s})).structured.data;
  const set=await use(client,'kanvas_config_update',{sessionId:s,expectedRevision:state.session?.configRevision??state.configRevision??0,config:{textSize:150}});
  expect(set.isError,JSON.stringify(set.structured).slice(0,300)).toBe(false);
  await expect(surface).toHaveAttribute('data-text-scale','1.5');await expect(surface).toHaveAttribute('data-text-mode','content');
  await expect.poll(async()=>(await title.boundingBox())!.height/before).toBeGreaterThan(1.35);
  // The enlarged list still occupies exactly its area and scrolls inside it.
  expect(await viewer.locator('.viewer-candidate .render-body').evaluate(el=>{const body=el.getBoundingClientRect(),surface=el.closest('.render-surface')!.getBoundingClientRect();return body.right<=surface.right+1&&body.bottom<=surface.bottom+1;})).toBe(true);
  // Other templates honour it too, and it is a saved setting.
  await shown(page,viewer,s,d.id,view('fact',{text:'One idea'}));
  await expect(viewer.locator('.viewer-candidate .render-surface')).toHaveAttribute('data-text-mode','viewport');
  expect(await viewer.locator('.viewer-candidate .render-surface').evaluate(el=>(el as HTMLElement).style.zoom)).toBe('1.5');
  await shown(page,viewer,s,d.id,view('font-picker',{fonts:[{family:'inter',weight:400},{family:'inter',weight:700}],text:'Sample'}));
  await expect(viewer.locator('.viewer-candidate .render-surface')).toHaveAttribute('data-text-mode','content');
  const sample=viewer.locator('.viewer-candidate .font-sample').first(),large=parseFloat(await sample.evaluate(el=>getComputedStyle(el).fontSize))*1.5;
  await shown(page,viewer,s,d.id,view('font-picker',{fonts:[{family:'inter',weight:400},{family:'inter',weight:700}],text:'Sample',sampleSize:18}));
  expect(parseFloat(await viewer.locator('.viewer-candidate .font-sample').first().evaluate(el=>getComputedStyle(el).fontSize))).toBe(18);expect(large).toBeGreaterThan(18);
  await shown(page,viewer,s,d.id,view('table',{columns:['A','B'],rows:[['one','two']]}));
  await expect(viewer.locator('.viewer-candidate .render-surface')).toHaveAttribute('data-text-scale','1.5');
  await viewer.reload();await expect(viewer.locator('.viewer-candidate .render-surface')).toHaveAttribute('data-text-scale','1.5');
  // The enlarged surface still fits its window: no page-level overflow.
  expect(await viewer.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const reset=(await use(client,'kanvas_session_state',{sessionId:s})).structured.data;
  await use(client,'kanvas_config_update',{sessionId:s,expectedRevision:reset.session?.configRevision??reset.configRevision??1,config:{textSize:100}});
  await expect(viewer.locator('.viewer-candidate .render-surface')).toHaveAttribute('data-text-scale','1');
  // Diagram that overflows because of its own textScale.
  const nodes=Array.from({length:13},(_,i)=>({id:`n${i}`,label:`Service number ${i}`,type:'service'})),edges=Array.from({length:12},(_,i)=>({from:`n${i}`,to:`n${i+1}`}));
  const diagram=await shown(page,viewer,s,d.id,view('architecture',{layout:'left-right',textScale:1.5,nodes,edges}));
  const scroll=viewer.locator('.viewer-candidate .diagram-scroll');
  await expect.poll(async()=>scroll.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeGreaterThan(20);
  const fitted=await use(client,'kanvas_navigation_control',{sessionId:s,displayId:d.id,requestId:'fit-1',expectedRevision:diagram.revision,navigation:{action:'fit'}});
  expect(fitted.isError,JSON.stringify(fitted.structured).slice(0,300)).toBe(false);
  await expect(scroll).toHaveAttribute('data-diagram-fitted','true');
  await expect.poll(async()=>scroll.evaluate(el=>({x:el.scrollWidth-el.clientWidth,y:el.scrollHeight-el.clientHeight}))).toEqual({x:0,y:0});
  const svg=(await scroll.locator('svg.relationship-diagram').boundingBox())!,frame=(await scroll.boundingBox())!;
  expect(svg.width).toBeLessThanOrEqual(frame.width+1);expect(svg.height).toBeLessThanOrEqual(frame.height+1);
 }finally{await client.close();}
});

test('checked tasks stay in place and the highlighted task is kept in view (08d22167, 1c0ebe3f)',async({page,baseURL})=>{
 const {s,d,viewer}=await setup(page,'Task order');const client=await mcp(page,baseURL!);
 try{
  await shown(page,viewer,s,d.id,view('task-list',{columns:[{key:'number',label:'#'},{key:'item',label:'Item'},{key:'status',label:'Status'},{key:'tags',label:'Tags'},{key:'owner',label:'Owner'}],items:Array.from({length:30},(_,i)=>({title:`Task ${i+1}`,status:'untested',tags:['t']}))}));
  const rows=viewer.locator('.viewer-candidate .task-list tbody tr');await expect(rows).toHaveCount(30);
  // Built-in keys add no columns; an own column without values takes no room.
  await expect(viewer.locator('.viewer-candidate .task-list thead th')).toHaveCount(5);
  const lists=(await use(client,'kanvas_tasklist_read',{sessionId:s})).structured.data,taskListId=lists.taskLists[0].id;
  const scroller=viewer.locator('.viewer-candidate .task-list-scroll');
  await use(client,'kanvas_tasklist_update',{sessionId:s,taskListId,requestId:'t-1',check:[1],highlight:2});
  await expect(rows.nth(0)).toHaveClass(/is-done/);await expect(rows.nth(0)).toHaveAttribute('data-task-number','1');await expect(rows.nth(1)).toHaveAttribute('aria-current','true');
  expect(await rows.evaluateAll(els=>els.map(el=>Number((el as HTMLElement).dataset.taskNumber)))).toEqual(Array.from({length:30},(_,i)=>i+1));
  // Early in the list nothing scrolls.
  expect(await scroller.evaluate(el=>el.scrollTop)).toBeLessThanOrEqual(1);
  await use(client,'kanvas_tasklist_update',{sessionId:s,taskListId,requestId:'t-2',check:[2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17],highlight:18});
  await expect(rows.nth(17)).toHaveAttribute('aria-current','true');
  await expect.poll(async()=>{const frame=(await scroller.boundingBox())!,row=(await rows.nth(17).boundingBox())!;return Math.abs(row.y+row.height/2-(frame.y+frame.height/2))/frame.height;}).toBeLessThan(.3);
  expect(await rows.evaluateAll(els=>els.map(el=>Number((el as HTMLElement).dataset.taskNumber)))).toEqual(Array.from({length:30},(_,i)=>i+1));
  await expect(rows.nth(16)).toHaveClass(/is-done/);
  const updated=await use(client,'kanvas_tasklist_update',{sessionId:s,taskListId,requestId:'t-3',columns:[{key:'number',label:'#'},{key:'owner',label:'Owner'}],items:[{item:18,fields:{owner:'Ada'}}]});
  expect(updated.structured.data.ignoredColumns).toEqual(['number']);
  await expect(viewer.locator('.viewer-candidate .task-list thead th')).toHaveCount(6);
 }finally{await client.close();}
});

test('a toast takes an icon id and draws it in the text colour (5b62fba5, 95a83b8c)',async({page,baseURL})=>{
 const {s,d,viewer}=await setup(page,'Toast icons');const client=await mcp(page,baseURL!);
 try{
  await shown(page,viewer,s,d.id,view('fact',{text:'Toast'}));
  const sent=await use(client,'kanvas_toast',{sessionId:s,displayIds:[d.id],text:'You have mail',icon:'lucide:mail-dot',sticky:true});
  expect(sent.isError,JSON.stringify(sent.structured).slice(0,300)).toBe(false);
  const glyph=viewer.locator('.viewer-toast .viewer-toast-glyph');await expect(glyph).toBeVisible();
  const style=await glyph.evaluate(el=>{const own=getComputedStyle(el),toast=getComputedStyle(el.closest('.viewer-toast')!);return {background:own.backgroundColor,text:toast.color,mask:own.maskImage||(own as unknown as {webkitMaskImage:string}).webkitMaskImage,width:el.getBoundingClientRect().width};});
  expect(style.background).toBe(style.text);expect(style.mask).toContain('/api/picker/icons/lucide/outline/mail-dot.svg');expect(style.width).toBeGreaterThan(20);
  await expect(viewer.locator('.viewer-toast img.viewer-toast-icon')).toHaveCount(0);
 }finally{await client.close();}
});

test('weather strip follows the active step; choropleth fills the height without credit text; sign label sits under its pictogram (04dc0e65, 8bfdf7b0, f430f4e8, 99ba310f)',async({page})=>{
 const {s,d,viewer}=await setup(page,'Weather map sign');
 const forecast=Array.from({length:24},(_,i)=>({time:`2026-11-12T${String(i).padStart(2,'0')}:00:00+01:00`,temperature:`${5+i%6}°`,condition:i%3?'cloudy':'rain'}));
 await shown(page,viewer,s,d.id,view('weather',{place:'Oslo',temperature:'6°',condition:'cloudy',forecast}));
 const strip=viewer.locator('.viewer-candidate .weather-time-strip ol');await expect(strip.locator('li')).toHaveCount(25);
 await viewer.locator('.viewer-candidate .weather-play').click();
 const visible=async()=>strip.evaluate(el=>{const active=el.querySelector('[aria-current="step"]')?.closest('li');if(!active)return null;const a=active.getBoundingClientRect(),b=el.getBoundingClientRect();return {inside:a.left>=b.left-1&&a.right<=b.right+1,index:[...el.children].indexOf(active)};});
 for(const index of [14,22,3]){
  await strip.locator('li').nth(index).locator('button').evaluate(el=>(el as HTMLButtonElement).click());
  await expect.poll(visible,{message:`step ${index} is shown on the strip`}).toEqual({inside:true,index});
 }
 // World choropleth with everything off.
 const world=['US','CA','MX','BR','AR','GB','FR','DE','ES','IT','NO','SE','FI','RU','CN','IN','JP','AU','NZ','ZA','EG','NG','KE','SA','TR','ID','KZ','MN','CL','PE','GL'].map((code,i)=>({id:code,countryCode:code,value:i+1}));
 await shown(page,viewer,s,d.id,view('chart',{kind:'choropleth',series:[],regions:[...world,{id:'SG',countryCode:'SG',value:9}]}));
 const body=viewer.locator('.viewer-candidate .advanced-chart-body');await expect(body.locator('path[data-chart-region]').first()).toBeVisible();
 await expect(viewer.locator('.viewer-candidate')).not.toContainText('Natural Earth');await expect(viewer.locator('.viewer-candidate')).not.toContainText('Dots mark');
 await expect(viewer.locator('.viewer-candidate .advanced-color-scale')).toBeVisible();
 const fill=await body.evaluate(el=>{const svg=el.querySelector('svg')!.getBoundingClientRect();return {share:svg.height/el.clientHeight,overflow:el.scrollHeight-el.clientHeight};});
 expect(fill.share).toBeGreaterThan(.85);expect(fill.overflow).toBeLessThanOrEqual(1);
 await shown(page,viewer,s,d.id,view('chart',{kind:'choropleth',series:[],territoryNote:true,regions:[...world,{id:'SG',countryCode:'SG',value:9}]}));
 await expect(viewer.locator('.viewer-candidate .choropleth-territory-note')).toBeVisible();
 // Signage with an arrow.
 await shown(page,viewer,s,d.id,view('signage',{region:'no',items:[{id:'wc',type:'restroom',direction:'right',label:'Restrooms'}]}));
 const card=viewer.locator('.viewer-candidate .signage-card');await expect(card.locator('h2')).toHaveText('Restrooms');
 await expect.poll(async()=>card.evaluate(el=>{const art=el.querySelector('.sign-reviewed-composition')!.getBoundingClientRect(),label=el.querySelector('h2')!,range=document.createRange();range.selectNodeContents(label);const text=range.getBoundingClientRect();return Math.abs(art.left+art.width/2-(text.left+text.width/2));})).toBeLessThan(6);
 expect(await card.evaluate(el=>{const box=el.getBoundingClientRect(),label=el.querySelector('h2')!.getBoundingClientRect();return label.left>=box.left-1&&label.right<=box.right+1;})).toBe(true);
});

test('the sessions overview shows one sharing level per session (22eccdda)',async({page})=>{
 await register(page);const privateSession=await createSession(page,'Just me'),publicSession=await createSession(page,'Open house');
 const made=await sessionApi(page,`/api/sessions/${publicSession}/public-access`,'POST',{enabled:true,confirm:true});expect(made.status).toBeLessThan(300);
 await page.goto('/');
 const card=(name:string)=>page.locator('.overview-session',{hasText:name});
 await expect(card('Just me').locator('.overview-sharing')).toHaveAttribute('data-sharing','private');await expect(card('Just me').locator('.overview-sharing')).toHaveText('Private');
 await expect(card('Open house').locator('.overview-sharing')).toHaveAttribute('data-sharing','public');await expect(card('Open house').locator('.overview-sharing svg')).toBeVisible();
 expect(privateSession).not.toBe(publicSession);
});

test('no view draws a source footer or a Source & info control (5134662f, 3f65409f)',async({page,diagnostics})=>{
 const {s,d,viewer}=await setup(page,'No source');diagnostics.allowHttp(page,`/api/sessions/${s}/submit`,400);
 const refused=await sessionApi(page,`/api/sessions/${s}/submit`,'POST',{requestId:'with-source',displayIds:[d.id],view:{version:1,template:'fact',data:{text:'x'},source:{title:'Somewhere'},showSource:true}});
 expect(refused.status).toBeGreaterThanOrEqual(400);
 const forecast=[{time:'2026-11-12T08:00:00+01:00',temperature:'6°',condition:'cloudy'}];
 for(const spec of [view('weather',{place:'Oslo',temperature:'6°',condition:'cloudy',forecast}),view('chart',{kind:'bar',series:[{name:'A',points:[{x:'Q1',y:3},{x:'Q2',y:5}]}]},{showControls:true,showCaption:true}),view('table',{columns:['A'],rows:[['one']]},{showControls:true})]){
  await shown(page,viewer,s,d.id,spec);
  await expect(viewer.locator('.view-information')).toHaveCount(0);await expect(viewer.getByText('Source & info')).toHaveCount(0);await expect(viewer.getByText('About this view')).toHaveCount(0);
 }
});
