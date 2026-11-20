import {test,expect,register,createSession,createDisplay,openViewer,publishPrepared,sessionApi,sessionDetail,waitForDisplay} from './support';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import type {Page} from '@playwright/test';
import type {ViewSpec} from '../../src/shared/types';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=';
async function asset(page:Page,s:string){const result=await sessionApi<{url:string}>(page,'/api/sessions/'+s+'/assets','POST',{name:'fixture.png',mimeType:'image/png',base64:png.split(',')[1]});expect(result.status).toBe(201);return result.data!.url;}
async function setup(page:Page){await register(page);const s=await createSession(page,'Visual controls'),d=await createDisplay(page,s,'Main'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};}
async function show(page:Page,viewer:Page,s:string,d:string,view:ViewSpec){const before=(await sessionDetail(page,s)).displays.find(x=>x.id===d)!.revision;await publishPrepared(page,s,[d],view);await waitForDisplay(page,s,d,x=>x.revision>before&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status','ready');}
test('custom HTML repaints consecutive normal, fixed and absolute roots without reload',async({page},info)=>{
 const {s,d,viewer}=await setup(page);
 for(const [index,position] of ['normal','fixed','absolute','normal'].entries()){
  await show(page,viewer,s,d.id,{version:1,template:'html',data:{html:'<article><h1>Painted '+index+'</h1><p>Visible content</p></article>',css:'html,body{height:100%;background:#123456;color:white}article{'+(position==='normal'?'min-height:100%;':'position:'+position+';inset:0;')+'padding:30px;background:#123456}h1{font:700 36px Inter,sans-serif}',description:'HTML painting proof'}});
  const frame=viewer.frameLocator('.viewer-candidate iframe.custom-visual');
  await expect(frame.getByRole('heading',{name:'Painted '+index})).toBeVisible();
  const box=await viewer.locator('.viewer-candidate iframe.custom-visual').boundingBox();expect(box!.height).toBeGreaterThan(200);
  await expect(frame.locator('body')).toHaveCSS('background-color','rgb(18, 52, 86)');
  await viewer.screenshot({path:info.outputPath('html-'+position+'-'+index+'.png'),animations:'disabled'});
 }
 await show(page,viewer,s,d.id,{version:1,template:'split-screen',data:{panes:[{id:'one',view:{version:1,template:'html',data:{html:'<h1>Nested painted content</h1>',css:'h1{color:white;font-size:32px}',description:'Nested visual'}}},{id:'two',view:{version:1,template:'fact',data:{text:'Beside HTML'}}}]}});
 await expect(viewer.frameLocator('.viewer-candidate iframe[title="Pane one"]').frameLocator('iframe.custom-visual').getByRole('heading',{name:'Nested painted content'})).toBeVisible();
 await viewer.screenshot({path:info.outputPath('html-split.png'),animations:'disabled'});
});
test('gallery captions are centred with images and the full 256-image 16-column contract renders',async({page},info)=>{
 const {s,d,viewer}=await setup(page),url=await asset(page,s);
 await show(page,viewer,s,d.id,{version:1,template:'image-gallery',data:{columns:2,images:Array.from({length:4},(_,i)=>({url,title:'Image '+i,caption:'Caption '+i,showTitle:true,showCaption:true}))}});
 const root=viewer.locator('.viewer-candidate .multi-image-gallery');await expect(root.locator('figcaption')).toHaveCount(4);await expect(root.locator('figcaption').first()).toHaveCSS('text-align','center');
 await viewer.screenshot({path:info.outputPath('gallery-captions.png'),animations:'disabled'});
 await show(page,viewer,s,d.id,{version:1,template:'image-gallery',data:{columns:16,images:Array.from({length:256},()=>({url,caption:'Hidden by default'}))}});
 await expect(root.locator('figure')).toHaveCount(256);await expect(root.locator('figcaption')).toHaveCount(0);
 expect(await root.locator('.gallery-frames').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length)).toBe(16);
 await viewer.screenshot({path:info.outputPath('gallery-256.png'),animations:'disabled'});
});
test('task references hide numbers independently and subtasks expand and collapse with detail',async({page,baseURL},info)=>{
 const {s,d,viewer}=await setup(page);
 await show(page,viewer,s,d.id,{version:1,template:'task-list',data:{showNumber:false,showReference:true,items:[{title:'Charts',reference:'JIRA-42',detail:'Parent detail',subtasks:[{title:'Bars',checked:true},{id:'lines',title:'Lines',checked:false,status:'doing',description:'Exact observations'}]},{title:'Other',subtasks:[{title:'Other child',checked:false}]}]}});
 const root=viewer.locator('.viewer-candidate .task-list');await expect(root.locator('.task-number')).toHaveCount(0);await expect(root.getByText('JIRA-42')).toBeVisible();await expect(root.getByText('Bars',{exact:true})).toHaveCount(0);
 await root.getByRole('button',{name:'Charts'}).click();await expect(root.getByText('Bars',{exact:true})).toBeVisible();await expect(root.getByText('Other child')).toHaveCount(0);
 await expect(root.getByText('Parent detail')).toBeVisible();await viewer.screenshot({path:info.outputPath('subtasks-expanded.png'),animations:'disabled'});
 const detail=await sessionDetail(page,s),taskListId=detail.displays.find(x=>x.id===d.id)!.view!.data.taskListId;
 const token=(await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Subtask delta fixture',scopes:['read','publish']})).data!.token;
 const client=new Client({name:'subtask-delta',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token}}}));
 try{const result=await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.tasklist.update',arguments:{sessionId:s,taskListId,requestId:'update-open-detail',subtasks:[{item:1,items:[{id:'lines',description:'Updated while open'}],check:['lines']}]}}});expect(result.isError).not.toBe(true);await expect(root.getByText('Updated while open')).toBeVisible();await expect(root.locator('[data-subtask-id=lines] [aria-label=Done]')).toBeVisible();}finally{await client.close();}
 await root.getByRole('button',{name:'Charts'}).click();await expect(root.getByText('Bars',{exact:true})).toHaveCount(0);
});
test('view theme is temporary and countdown precision omits seconds',async({page},info)=>{
 const {s,d,viewer}=await setup(page),before=(await sessionDetail(page,s)).session.config;
 await show(page,viewer,s,d.id,{version:1,template:'countdown',theme:'light',data:{endsAt:'2030-01-01T12:00:00Z',pausedRemainingSeconds:3599,precision:'minutes',label:'Next session'}});
 await expect(viewer.locator('.viewer-shell')).toHaveClass(/theme-light/);await expect(viewer.locator('.viewer-candidate [data-unit=seconds]')).toHaveCount(0);await expect(viewer.locator('.viewer-candidate .countdown-digits')).toHaveAttribute('data-duration','01:00');
 await viewer.screenshot({path:info.outputPath('countdown-light-minutes.png'),animations:'disabled'});
 await show(page,viewer,s,d.id,{version:1,template:'fact',data:{text:'Session theme restored'}});
 expect((await sessionDetail(page,s)).session.config).toEqual(before);await expect(viewer.locator('.viewer-shell')).toHaveClass(/theme-dark/);
});
test('menu headings align, sold-out prices strike through and special photo can sit beside text',async({page},info)=>{
 const {s,d,viewer}=await setup(page),url=await asset(page,s);if(info.project.name==='desktop-chromium')await viewer.setViewportSize({width:1920,height:1080});
 await show(page,viewer,s,d.id,{version:1,template:'menu-board',data:{preset:'cafe',columns:4,sections:['Coffee','Tea','Bakery','Lunch'].map((name,i)=>({name,items:[{name:'Choice '+i,price:3.75,availability:i===2?'sold-out':'available'}]}))}});
 const headings=viewer.locator('.viewer-candidate .menu-sections>section>h3');
 if(info.project.name==='desktop-chromium'){const ys=await headings.evaluateAll(es=>es.map(e=>e.getBoundingClientRect().y));expect(Math.max(...ys)-Math.min(...ys)).toBeLessThan(2);}
 await expect(viewer.locator('.viewer-candidate .sold-out .menu-price')).toHaveCSS('text-decoration-line','line-through');
 await viewer.screenshot({path:info.outputPath('menu-columns.png'),animations:'disabled'});
 await show(page,viewer,s,d.id,{version:1,template:'todays-special',data:{imagePosition:'right',accent:'#fb923c',item:{name:'Lasagna',price:12.5,image:url,badges:["Chef’s pick",'Homemade'],description:'Freshly made'}}});
 await expect(viewer.locator('.viewer-candidate .special')).toHaveClass(/image-right/);await expect(viewer.locator('.viewer-candidate .venue-tags span').first()).toHaveCSS('background-color','rgba(21, 21, 21, 0.9)');
 await viewer.screenshot({path:info.outputPath('special-side-image.png'),animations:'disabled'});
 await show(page,viewer,s,d.id,{version:1,template:'scoreboard',data:{sides:[{id:'home',name:'Home',score:87},{id:'away',name:'Away',score:84}],period:'4th quarter',clock:'1:42',interactive:false}});
 if(info.project.name==='desktop-chromium')expect(await viewer.locator('.viewer-candidate .scoreboard-score').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThan(200);
 await viewer.screenshot({path:info.outputPath('scoreboard-distance.png'),animations:'disabled'});
});
test('chart text scales independently and dense financial observations fit the frame',async({page},info)=>{
 const {s,d,viewer}=await setup(page);if(info.project.name==='desktop-chromium')await viewer.setViewportSize({width:1920,height:1080});
 const series=[{name:'Price',points:Array.from({length:50},(_,i)=>({x:new Date(Date.UTC(2026,9,i+1)).toISOString().slice(0,10),y:102+i,open:100+i,close:102+i,high:105+i,low:98+i}))}];
 await show(page,viewer,s,d.id,{version:1,template:'chart',data:{kind:'candlestick',series,unit:'USD',textScale:1.75}});
 const root=viewer.locator('.viewer-candidate .advanced-chart-body');
 await expect(root.locator('[data-chart-part="open-close-body"]')).toHaveCount(50);
 expect(await root.evaluate(e=>e.scrollWidth<=e.clientWidth+2)).toBe(true);
 await expect(root.locator('.advanced-axis text').first()).toHaveCSS('font-size','28px');
 const dates=root.locator('.advanced-label[aria-label]');
 await expect(dates.first()).toHaveAttribute('aria-label',series[0].points[0].x);await expect(dates.last()).toHaveAttribute('aria-label',series[0].points.at(-1)!.x);
 const dateBounds=await dates.evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};})),frame=(await root.boundingBox())!;
 expect(dateBounds.every(b=>b.left>=frame.x-1&&b.right<=frame.x+frame.width+1&&b.top>=frame.y-1&&b.bottom<=frame.y+frame.height+1)).toBe(true);
 expect(dateBounds.every((b,i)=>i===0||dateBounds[i-1].right<=b.left+1)).toBe(true);
 await viewer.screenshot({path:info.outputPath('financial-text-scale.png'),animations:'disabled'});
 const fonts:number[]=[];for(const textScale of [1,2]){
  await show(page,viewer,s,d.id,{version:1,template:'chart',data:{kind:'bar',stacking:'stacked',textScale,xLabel:'Category',yLabel:'Units',series:[{name:'First',points:[{x:'A',y:20},{x:'B',y:40}]},{name:'Second',points:[{x:'A',y:15},{x:'B',y:25}]}]}});
  fonts.push(await viewer.locator('.viewer-candidate .composable-chart .chart-axis text').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)));
  await expect(viewer.locator('.viewer-candidate .chart-legend')).toHaveCSS('font-size',String(16*textScale)+'px');
 }expect(fonts[1]/fonts[0]).toBe(2);
 await viewer.screenshot({path:info.outputPath('stacked-chart-text-scale.png'),animations:'disabled'});
});
test('scaled chart labels fit measured gutters and wrapped text stays inside its SVG',async({page},info)=>{
 const {s,d,viewer}=await setup(page);
 const views:ViewSpec[]=[
  ...(['vertical','horizontal'] as const).map(orientation=>({version:1 as const,template:'chart',data:{kind:'bar',orientation,stacking:'stacked',textScale:2,numberFormat:{notation:'standard'},yLabel:'Revenue',unit:'USD',xLabel:'Period',series:[{name:'First',points:[{x:'Alpha',y:1000},{x:'Beta',y:1500}]},{name:'Second',points:[{x:'Alpha',y:500},{x:'Beta',y:500}]}]}})),
  {version:1,template:'chart',data:{kind:'waterfall',textScale:2,unit:'USD',series:[{name:'Balance',points:[{x:'Opening balance carried forward',y:2000,total:true},{x:'Customer onboarding and deployment review',y:500},{x:'Closing balance',y:2500,total:true}]}]}},
  {version:1,template:'chart',data:{kind:'line',textScale:2,legend:false,yLabel:'Density',unit:'USD',xLabel:'Value',distribution:{ranges:[],bands:[]},series:[{name:'Supplied',points:[{x:0.0001,y:10000},{x:0.0003,y:30000},{x:0.0006,y:15000}]}]}}
 ];
 for(const [index,view] of views.entries()){
  await show(page,viewer,s,d.id,view);await viewer.evaluate(()=>document.fonts.ready.then(()=>undefined));
  const svg=viewer.locator('.viewer-candidate .chart-svg,.viewer-candidate .distribution-chart svg').first();await expect(svg).toBeVisible();
  const box=(await svg.boundingBox())!,labels=await svg.locator('text').evaluateAll(nodes=>nodes.filter(n=>n.textContent?.trim()).map(n=>{const r=n.getBoundingClientRect();return {text:n.getAttribute('aria-label')??n.textContent,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};}));
  expect(labels.length).toBeGreaterThan(2);
  expect(labels.filter(b=>b.width<=0||b.height<=0||b.left<box.x-1||b.right>box.x+box.width+1||b.top<box.y-1||b.bottom>box.y+box.height+1)).toEqual([]);
  expect(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await viewer.screenshot({path:info.outputPath('scaled-label-gutters-'+index+'.png'),animations:'disabled'});
 }
});
test('form file selection and viewer drop create private session assets and notify the agent',async({page},info)=>{
 const {s,d,viewer}=await setup(page),buffer=Buffer.from(png.split(',')[1],'base64');
 await show(page,viewer,s,d.id,{version:1,template:'form',data:{fields:[{id:'photo',label:'Photo',type:'file',required:true,accept:['image/png'],maxCount:2,maxSize:1024}]}});
 await viewer.locator('.viewer-candidate input[type=file]').setInputFiles({name:'map.png',mimeType:'image/png',buffer});
 await expect(viewer.locator('.viewer-candidate .file-field')).toContainText('1 uploaded');
 await viewer.getByRole('button',{name:'Submit response',exact:true}).click();await expect(viewer.getByText('Response sent',{exact:true})).toBeVisible();
 const detail=await sessionDetail(page,s);expect(detail.assets).toHaveLength(1);expect(detail.interactions.some(i=>i.actionId==='assets.upload')).toBe(true);
 await viewer.screenshot({path:info.outputPath('form-file-upload.png'),animations:'disabled'});
 await viewer.evaluate(base64=>{const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),dt=new DataTransfer();dt.items.add(new File([bytes],'dropped.png',{type:'image/png'}));window.dispatchEvent(new DragEvent('dragenter',{dataTransfer:dt,bubbles:true}));window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));},png.split(',')[1]);
 await expect(viewer.getByRole('status').filter({hasText:'1 files sent to the session'})).toBeVisible();expect((await sessionDetail(page,s)).assets).toHaveLength(2);
});
