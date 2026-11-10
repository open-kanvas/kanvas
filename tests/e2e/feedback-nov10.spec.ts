import type {Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createDisplay,createSession,expect,login,openViewer,publishPrepared,register,sessionApi,sessionDetail,test,viewerPath,waitForDisplay} from './support';
import {validateView} from '../../src/shared/view-schemas';
import {samples} from '../../src/shared/template-examples';
import {Store} from '../../src/server/store';
import {testDatabase} from '../postgres';
import type {ViewSpec} from '../../src/shared/types';

const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({template,data,...extra} as never) as ViewSpec;
/** Publish and wait until this window has painted that revision: a measurement taken while the previous
 * view is being replaced reads an element that is already detached (empty computed style, no box). */
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov10 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov10-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const inside=(inner:{x:number;y:number;width:number;height:number},outer:{x:number;y:number;width:number;height:number},slack=1.5)=>inner.x>=outer.x-slack&&inner.y>=outer.y-slack&&inner.x+inner.width<=outer.x+outer.width+slack&&inner.y+inner.height<=outer.y+outer.height+slack;

test('connector identity files are public, typed and not redirected (8f4962dc, e2573eca)',async({request})=>{
 for(const [path,type] of [['/icons/kanvas-512.png','image/png'],['/icons/kanvas-192.png','image/png'],['/favicon-48.png','image/png'],['/favicon-32.png','image/png'],['/favicon.svg','image/svg+xml'],['/favicon.ico','image/']] as const){
  const response=await request.get(`${path}?v=0.37.0`,{maxRedirects:0,headers:{cookie:''}});
  expect(response.status(),path).toBe(200);expect(response.headers()['content-type'],path).toContain(type);expect((await response.body()).length,path).toBeGreaterThan(100);
 }
 const metadata=await (await request.get('/.well-known/oauth-protected-resource/mcp')).json();expect(metadata.resource_documentation).toBe('https://open-kanvas.ai');
 expect(await (await request.get('/')).text()).toContain('name="kanvas-version" content="0.37.0"');
});

test('weather text block sits low, clear of the place and time, and never scrolls (20722a0f, aca837d4)',async({page},info)=>{
 const {s,d,viewer}=await setup(page,'Weather layout');
 const details=Array.from({length:6},(_,i)=>({label:['Wind','Humidity','Pressure','Visibility','UV index','Feels like'][i],value:['6 m/s SW','78 %','1012 hPa','18 km','1','7°'][i]}));
 const forecast=Array.from({length:12},(_,i)=>({time:`${String(8+i).padStart(2,'0')}:00`,temperature:`${6+i%4}°`,condition:i%3?'cloudy':'rain'}));
 const check=async(label:string)=>{
  const reading=viewer.locator('.viewer-candidate .weather-scene-reading');await expect(reading).toBeVisible();
  await expect.poll(async()=>reading.evaluate(el=>(el as HTMLElement).dataset.weatherFit??'')).not.toBe('');
  const geometry=await viewer.locator('.viewer-candidate .weather-cinema').evaluate(root=>{const box=root.getBoundingClientRect(),reading=root.querySelector('.weather-scene-reading')!,heading=root.querySelector('.weather-scene-heading')!,strip=root.querySelector('.weather-time-strip');const r=reading.getBoundingClientRect(),h=heading.getBoundingClientRect(),style=getComputedStyle(reading);return {height:box.height,top:box.top,readingTop:r.top,readingBottom:r.bottom,headingBottom:h.bottom,headingHasText:Boolean(heading.textContent?.trim()),stripTop:strip?strip.getBoundingClientRect().top:null,overflowY:style.overflowY,scrollable:reading.scrollHeight>reading.clientHeight+1&&['auto','scroll'].includes(style.overflowY),clipped:(reading as HTMLElement).dataset.weatherClipped==='true'};});
  expect(geometry.overflowY,label).toBe('hidden');expect(geometry.scrollable,label).toBe(false);
  if(geometry.headingHasText)expect(geometry.readingTop,`${label}: below the place and time`).toBeGreaterThanOrEqual(geometry.headingBottom-1);
  if(geometry.stripTop!==null)expect(geometry.readingBottom,`${label}: above the timeline`).toBeLessThanOrEqual(geometry.stripTop+1);
  if(geometry.height>451){
   // Bottom edge rests on the horizon (73% down) and the block is in the lower part of its space, not under the header.
   expect((geometry.readingBottom-geometry.top)/geometry.height,`${label}: above the horizon`).toBeLessThanOrEqual(.74);
   expect((geometry.readingBottom-geometry.top)/geometry.height,`${label}: low on the screen`).toBeGreaterThan(.55);
  }
  await viewer.screenshot({path:info.outputPath(`weather-${label}.png`)});
 };
 await shown(page,viewer,s,d.id,view('weather',{place:'Arendal',timeLabel:'Sat 18:00',condition:'cloudy',temperature:'7°',high:'9°',low:'3°',description:'Cloudy through the evening with a light breeze from the south-west. Some drizzle is possible after eight. Clearing slowly towards midnight.',details,forecast}));
 await check('rich');
 await shown(page,viewer,s,d.id,view('weather',{place:'Arendal',timeLabel:'Sat 18:00',condition:'cloudy',temperature:'7°',display:{description:false,details:false,timeline:false}}));
 await check('temperature-only');
 await shown(page,viewer,s,d.id,view('weather',{place:'Arendal',condition:'rain',temperature:'-12°',high:'-9°',low:'-15°',description:'x '.repeat(190).trim(),details:Array.from({length:8},(_,i)=>({label:`Detail ${i+1}`,value:`Value ${i+1} with a longer text`})),forecast}));
 await check('maximum');
});

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

test('dismissing a toast dismisses it for the whole account, at once and after reopening (1559c2fd, b4c5d005, e6ae1605)',async({page,baseURL,browser},info)=>{
 const account=await register(page);const s=await createSession(page,'Account notices'),d=await createDisplay(page,s,'Display'),laptop=await openViewer(page,s,d.id);
 const phoneContext=await browser.newContext({baseURL:baseURL!,viewport:{width:390,height:844}}),phone=await phoneContext.newPage();
 const client=await mcp(page,baseURL!);
 try{
  await login(phone,account,viewerPath(s,d.id));await expect(phone.locator('.viewer-shell')).toBeVisible();
  expect((await use(client,'kanvas.toast',{sessionId:s,displayIds:[d.id],title:'New mail',description:'Handled once, gone everywhere',type:'email',sticky:true})).isError).toBe(false);
  expect((await use(client,'kanvas.toast',{sessionId:s,displayIds:[d.id],text:'Plain notice',sticky:true})).isError).toBe(false);
  // Join notices may also be on screen; count the two notifications under test by their text.
  for(const window of [laptop,phone])for(const text of ['New mail','Plain notice'])await expect(window.locator('.viewer-toast').filter({hasText:text})).toHaveCount(1,{timeout:8000});
  await expect(laptop.locator('.viewer-toast [data-toast-icon=email]')).toHaveCount(1);await expect(laptop.locator('.viewer-toast').filter({hasText:'Plain notice'}).locator('svg')).toHaveCount(0);
  await laptop.screenshot({path:info.outputPath('toast-icons.png')});
  await laptop.locator('.viewer-toast').filter({hasText:'New mail'}).getByRole('button',{name:'Dismiss notification'}).click();
  // The other device of the same account loses it without waiting for its next poll.
  await expect(phone.locator('.viewer-toast').filter({hasText:'New mail'})).toHaveCount(0,{timeout:3500});await expect(phone.locator('.viewer-toast').filter({hasText:'Plain notice'})).toHaveCount(1);
  // Reload ("restart the app") on both devices, and a brand-new window: it stays dismissed.
  await phone.reload();await expect(phone.locator('.viewer-shell')).toBeVisible();await laptop.reload();await expect(laptop.locator('.viewer-shell')).toBeVisible();
  const fresh=await openViewer(page,s,d.id);
  for(const window of [laptop,phone,fresh]){await expect(window.locator('.viewer-toast').filter({hasText:'Plain notice'})).toHaveCount(1,{timeout:8000});await expect(window.locator('.viewer-toast').filter({hasText:'New mail'})).toHaveCount(0);}
  // Found in the complete run of 2026-11-10: an answer the server computed just before a dismissal was saved listed the
  // notification again, so it flashed back on the window where it had just been closed. Slow answers make that certain here.
  for(const text of ['First of two','Second of two'])expect((await use(client,'kanvas.toast',{sessionId:s,displayIds:[d.id],text,sticky:true})).isError).toBe(false);
  for(const text of ['First of two','Second of two'])await expect(laptop.locator('.viewer-toast').filter({hasText:text})).toHaveCount(1,{timeout:8000});
  await laptop.route('**/observe',async route=>{const response=await route.fetch();await new Promise(done=>setTimeout(done,500));await route.fulfill({response});});
  await laptop.evaluate(()=>{const back:string[]=[];(window as unknown as {toastsBack:string[]}).toastsBack=back;new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof HTMLElement&&/of two/.test(node.textContent??''))back.push(node.textContent??'');}).observe(document.body,{childList:true,subtree:true});});
  for(const text of ['First of two','Second of two'])await laptop.locator('.viewer-toast').filter({hasText:text}).getByRole('button',{name:'Dismiss notification'}).click();
  await laptop.waitForTimeout(3000);
  expect(await laptop.evaluate(()=>(window as unknown as {toastsBack:string[]}).toastsBack)).toEqual([]);
  await expect(laptop.locator('.viewer-toast').filter({hasText:'of two'})).toHaveCount(0);await laptop.unroute('**/observe');
 }finally{await client.close();await phoneContext.close();}
});

test('chess: White is at the bottom on ranks 1 and 2; a flip turns pieces and labels together (955403f7)',async({page},info)=>{
 const {s,d,viewer}=await setup(page,'Chess orientation');
 const pieces={wk:{cell:'E1',symbol:'king',side:'first'},wq:{cell:'D1',symbol:'queen',side:'first'},wp:{cell:'E2',symbol:'pawn',side:'first'},bk:{cell:'E8',symbol:'king',side:'second'},bp:{cell:'E7',symbol:'pawn',side:'second'}};
 const read=async()=>viewer.locator('.viewer-candidate .game-surface').evaluate(surface=>{const board=surface.querySelector('.game-board')!,box=board.getBoundingClientRect(),at=(id:string)=>{const piece=board.querySelector(`[data-game-piece="${id}"]`)!,r=piece.getBoundingClientRect();return {y:(r.top+r.height/2-box.top)/box.height,x:(r.left+r.width/2-box.left)/box.width,white:piece.classList.contains('color-white'),black:piece.classList.contains('color-black')};};const rows=[...surface.querySelectorAll('.game-row-labels span')].map(e=>e.textContent),columns=[...surface.querySelectorAll('.game-column-labels span')].map(e=>e.textContent);return {wk:at('wk'),bk:at('bk'),wp:at('wp'),rows,columns};});
 await publishPrepared(page,s,[d.id],view('game-board',{preset:'chess',pieces}));await expect(viewer.locator('.viewer-candidate [data-game-piece=wk]')).toBeVisible();
 const normal=await read();
 expect(normal.wk.white).toBe(true);expect(normal.bk.black).toBe(true);expect(normal.wk.y).toBeGreaterThan(.85);expect(normal.wp.y).toBeGreaterThan(.7);expect(normal.bk.y).toBeLessThan(.15);
 expect(normal.rows[0]).toBe('8');expect(normal.rows.at(-1)).toBe('1');expect(normal.columns[0]).toBe('A');expect(Math.abs(normal.wk.x-4.5/8)).toBeLessThan(.03);
 await viewer.screenshot({path:info.outputPath('chess-default.png')});
 await publishPrepared(page,s,[d.id],view('game-board',{preset:'chess',orientation:'flipped',pieces}));await expect.poll(async()=>(await read()).rows[0]).toBe('1');
 const flipped=await read();
 // Rotated 180 degrees: White at the top, still on the square labelled E1.
 expect(flipped.wk.white).toBe(true);expect(flipped.wk.y).toBeLessThan(.15);expect(flipped.bk.y).toBeGreaterThan(.85);expect(flipped.columns[0]).toBe('H');expect(Math.abs(flipped.wk.x-3.5/8)).toBeLessThan(.03);
 await viewer.screenshot({path:info.outputPath('chess-flipped.png')});
});

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

test('procedure shows content and nothing to click unless controls are asked for (341c9d9b)',async({page},info)=>{
 const {s,d,viewer}=await setup(page,'Procedure');
 const data={name:'Set up the display',description:'Three steps.',steps:['Unpack the stick.','Plug it into the screen.','Open kanvas.host.']};
 await publishPrepared(page,s,[d.id],view('procedure',data));await expect(viewer.locator('.viewer-candidate .procedure-content')).toBeVisible();
 await expect(viewer.locator('.viewer-candidate .procedure-content button')).toHaveCount(0);await expect(viewer.locator('.viewer-candidate .procedure-controls')).toHaveCount(0);
 await viewer.screenshot({path:info.outputPath('procedure-no-chrome.png')});
 await publishPrepared(page,s,[d.id],view('procedure',data,{showControls:true}));await expect(viewer.locator('.viewer-candidate .procedure-controls button')).toHaveCount(2);
 await publishPrepared(page,s,[d.id],view('recipe',{name:'Waffles',materials:['Flour'],steps:['Mix.','Bake.']}));await expect(viewer.locator('.viewer-candidate .recipe-content')).toBeVisible();await expect(viewer.locator('.viewer-candidate .recipe-start')).toHaveCount(0);
});

test('diagram zoom enlarges, text scale grows the whole diagram, a small diagram fills the screen (32b32d20)',async({page},info)=>{
 const {s,d,viewer}=await setup(page,'Diagram zoom');
 const nodes=Array.from({length:6},(_,i)=>({id:`n${i}`,label:`Service ${i+1}`,detail:'Handles one job',type:'service'})),edges=Array.from({length:5},(_,i)=>({from:`n${i}`,to:`n${i+1}`}));
 // While one view replaces another the diagram is briefly absent; a poll then reads 0 and tries again.
 const width=async()=>(await viewer.locator('.viewer-candidate .relationship-diagram').boundingBox().catch(()=>null))?.width??0;
 await publishPrepared(page,s,[d.id],view('architecture',{layout:'left-right',nodes,edges}));await expect(viewer.locator('.viewer-candidate .relationship-diagram')).toBeVisible();await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision);
 const fitted=await width();
 const store=new Store(testDatabase(process.env.KANVAS_E2E_RUN_ID!));let tab:string;try{await store.ready;await expect.poll(async()=>(await store.list<{displayId:string;tabId:string}>('viewer',s)).some(v=>v.displayId===d.id),{timeout:10000}).toBe(true);tab=(await store.list<{displayId:string;tabId:string}>('viewer',s)).find(v=>v.displayId===d.id)!.tabId;}finally{await store.close();}
 const revision=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!.revision;
 for(const scale of [1.4,2.5]){
  expect((await sessionApi(page,`/api/sessions/${s}/displays/${d.id}/navigation`,'POST',{tabId:tab,requestId:randomUUID(),expectedRevision:revision,navigation:{action:'zoom',scale}})).status).toBe(200);
  await expect.poll(async()=>(await width())/fitted,{timeout:8000,message:`zoom ${scale} enlarges the diagram`}).toBeGreaterThan(scale*.8);
 }
 await viewer.screenshot({path:info.outputPath('architecture-zoomed.png')});
 expect((await sessionApi(page,`/api/sessions/${s}/displays/${d.id}/navigation`,'POST',{tabId:tab,requestId:randomUUID(),expectedRevision:revision,navigation:{action:'zoom',scale:1}})).status).toBe(200);
 await expect.poll(async()=>Math.abs((await width())/fitted-1)).toBeLessThan(.05);
 await shown(page,viewer,s,d.id,view('architecture',{layout:'left-right',textScale:1.8,nodes,edges}));
 await expect.poll(async()=>(await width())/fitted,{timeout:8000}).toBeGreaterThan(1.6);
 // Two nodes on a large screen: enlarged beyond natural size so labels read from a distance.
 if(!info.project.name.startsWith('phone')){await shown(page,viewer,s,d.id,view('architecture',{layout:'left-right',nodes:nodes.slice(0,2),edges:edges.slice(0,1)}));await expect.poll(async()=>Number(await viewer.locator('.viewer-candidate .diagram-scroll').getAttribute('data-diagram-scale')),{timeout:8000}).toBeGreaterThan(1.2);}
});

test('choropleth scale stays inside a short landscape screen (b2640923)',async({page},info)=>{
 const {s,d,viewer}=await setup(page,'Choropleth');
 const codes=['US','CA','MX','BR','AR','GB','FR','DE','NO','SE','ES','IT','RU','CN','IN','JP','AU','ZA','EG','HK'];
 await publishPrepared(page,s,[d.id],view('chart',{kind:'choropleth',regions:codes.map((countryCode,i)=>({id:countryCode,countryCode,value:(i+1)*7}))}));
 for(const size of info.project.name.startsWith('phone')?[{width:844,height:390},{width:390,height:844}]:[{width:960,height:540},{width:905,height:395},{width:1440,height:900}]){
  await viewer.setViewportSize(size);const scale=viewer.locator('.viewer-candidate .advanced-color-scale');await expect(scale).toBeVisible();
  await expect.poll(async()=>{const box=await scale.boundingBox();return box?box.y+box.height:Infinity;},{timeout:8000,message:`scale inside ${size.width}x${size.height}`}).toBeLessThanOrEqual(size.height+1);
  await expect(viewer.locator('.viewer-candidate .choropleth-warning')).toHaveCount(0);
  await viewer.screenshot({path:info.outputPath(`choropleth-${size.width}x${size.height}.png`)});
 }
});

test('planner weather points are one row with icon first and no empty values; tool detail fits a phone (bebc556b, 7e7fb1b1)',async({page},info)=>{
 const {s,d,viewer}=await setup(page,'Planner and tool detail');
 const day='2026-11-14',weather=[9,12,15,18].map((hour,i)=>({time:`${day}T${String(hour).padStart(2,'0')}:00:00+01:00`,condition:i%2?'cloudy':'rain',temperature:6+i,unit:'C',precipitationChance:i===1?0:40,...(i===2?{}:{wind:{direction:'SW',speed:i===3?0:5,unit:'m/s'}})}));
 await publishPrepared(page,s,[d.id],view('planner',{view:'day',anchorDate:day,timeZone:'Europe/Oslo',items:[{id:'a',title:'Walk',start:`${day}T10:00:00+01:00`,end:`${day}T11:00:00+01:00`}],weather}));
 const points=viewer.locator('.viewer-candidate .weather-point');await expect(points).toHaveCount(4);
 const rows=await points.evaluateAll(list=>list.map(point=>{const icon=point.querySelector('.weather-icon')!.getBoundingClientRect(),values=point.querySelector('.weather-values')!.getBoundingClientRect();return {iconLeftOfValues:icon.right<=values.left+1,sameRow:Math.abs((icon.top+icon.height/2)-(values.top+values.height/2))<icon.height,precipitation:point.querySelectorAll('.weather-precipitation').length,wind:point.querySelectorAll('.weather-wind').length};}));
 expect(rows.every(row=>row.iconLeftOfValues&&row.sameRow)).toBe(true);expect(rows.map(row=>row.precipitation)).toEqual([1,0,1,1]);expect(rows.map(row=>row.wind)).toEqual([1,1,0,0]);
 await viewer.screenshot({path:info.outputPath('planner-weather.png')});
 await publishPrepared(page,s,[d.id],view('tool-detail',{name:'kanvas.update.status',integration:'Kanvas',description:'Read whether a publication was prepared and whether a receiving browser applied it.',parameters:[{name:'sessionId',type:'string',required:true,description:'The session that holds the update.'},{name:'updateId',type:'string (UUID) | undefined',required:false,description:'One update; omit for the most recent update of the session, which is what a voice agent normally wants right after publishing.'},{name:'requestId',type:'string matching ^[A-Za-z0-9_.:-]{1,128}$',required:false,description:'Find the update by the request ID that created it.'}],returns:'Status, revisions and per-display delivery.'}));
 const detail=viewer.locator('.viewer-candidate .tool-detail');await expect(detail.locator('tbody tr')).toHaveCount(3);
 const fit=await detail.evaluate(el=>({horizontal:el.scrollWidth>el.clientWidth+1,rows:[...el.querySelectorAll('tbody tr')].map(row=>{const r=row.getBoundingClientRect(),box=el.getBoundingClientRect();return r.left>=box.left-1&&r.right<=box.right+1;}),stacked:getComputedStyle(el.querySelector('tbody tr')!).display==='grid'}));
 expect(fit.horizontal).toBe(false);expect(fit.rows.every(Boolean)).toBe(true);expect(fit.stacked).toBe(info.project.name.startsWith('phone'));
 await expect(detail.locator('.parameter-need.is-required')).toHaveCount(1);await viewer.screenshot({path:info.outputPath('tool-detail.png')});
});

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
 const fits=async(selector:string,label:string)=>{const root=viewer.locator(`.viewer-candidate ${selector}`);await expect(root,label).toBeVisible();const shell=(await viewer.locator('.viewer-shell').boundingBox())!,box=(await root.boundingBox())!;expect(inside(box,shell,2),`${label} inside the screen`).toBe(true);expect(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1),`${label}: page does not scroll`).toBe(true);await expect(viewer.locator(`.viewer-candidate ${selector} button, .viewer-candidate ${selector} input, .viewer-candidate ${selector} nav`),`${label}: no controls`).toHaveCount(0);await viewer.screenshot({path:info.outputPath(`${label}.png`)});};
 await publishPrepared(page,s,[d.id],view('json',{json:'{"exact":9007199254740993,"items":[{"id":"t4","checked":true}],"note":"raw is the default"}'}));await fits('.json-raw','json-raw');await expect(viewer.locator('.viewer-candidate .json-raw li')).toHaveCount(10);await expect(viewer.locator('.viewer-candidate .json-raw')).toContainText('9007199254740993');
 await publishPrepared(page,s,[d.id],view('json',{json:'{"a":{"b":1}}',view:'tree'}));await expect(viewer.locator('.viewer-candidate .json-raw')).toHaveCount(0);
 await publishPrepared(page,s,[d.id],validateView(samples['tool-call-details']));await fits('.tool-call-details','tool-call-details');
 const panes=await viewer.locator('.viewer-candidate .tool-call-pane').evaluateAll(list=>list.map(pane=>pane.getBoundingClientRect()).map(r=>({x:r.x,y:r.y})));
 if(info.project.name.startsWith('phone'))expect(panes[1].y).toBeGreaterThan(panes[0].y+20);else expect(panes[1].x).toBeGreaterThan(panes[0].x+100);
 await publishPrepared(page,s,[d.id],validateView(samples['task-list']));await fits('.task-list','task-list');await expect(viewer.locator('.viewer-candidate .task-list tr.is-current .task-detail')).toBeVisible();
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

test('the session overview names the agent that created a session, and only that session (d630abcc)',async({page,baseURL})=>{
 await register(page);const client=await mcp(page,baseURL!);
 try{
  // One session made by the connected agent and one made by hand.
  const created=await use(client,'kanvas.session.create',{name:'Made by an agent'});expect(created.isError,JSON.stringify(created.structured)).toBe(false);
  await createSession(page,'Made by hand');
  await page.goto('/');
  const card=(name:string)=>page.locator('.overview-session').filter({has:page.getByRole('link',{name,exact:true})});
  await expect(card('Made by an agent').locator('.overview-created-by')).toHaveText('Created by nov10-fixture');
  await expect(card('Made by hand')).toBeVisible();await expect(card('Made by hand').locator('.overview-created-by')).toHaveCount(0);
 }finally{await client.close();}
});

test('custom HTML follows the theme through tokens; older HTML keeps its page (2444dc0d)',async({page},info)=>{
 const {s,d,viewer}=await setup(page,'Theme tokens');
 await publishPrepared(page,s,[d.id],view('html',{description:'Themed',html:'<main><h1>Option B</h1></main>',css:'main{min-height:100vh;display:grid;place-content:center;background:var(--kanvas-bg);color:var(--kanvas-fg);font-family:var(--kanvas-font)}h1{font-size:12vw;color:var(--kanvas-accent)}'}));
 const frame=viewer.locator('.viewer-candidate iframe.custom-visual');await expect(frame).toBeVisible();
 const doc=await frame.getAttribute('srcdoc');expect(doc).toContain('--kanvas-bg:');expect(doc).toContain('--kanvas-accent:');expect(doc).toContain('background:var(--kanvas-bg)');expect(await frame.getAttribute('sandbox')).toBe('');
 await expect(viewer.locator('.viewer-candidate .custom-visual-host')).toHaveAttribute('data-themed','true');
 const size=await frame.boundingBox(),shell=await viewer.locator('.viewer-shell').boundingBox();expect(size!.height).toBeGreaterThan(shell!.height*.6);
 await publishPrepared(page,s,[d.id],view('html',{description:'Legacy',html:'<p>Plain</p>',css:'p{font-size:8vw}'}));
 await expect.poll(async()=>await viewer.locator('.viewer-candidate iframe.custom-visual').getAttribute('srcdoc')).toContain('background:#151515');
 await viewer.screenshot({path:info.outputPath('html-tokens.png')});
});

test('first-time ready screen invites; the sign-in code can be copied (aa19719e, 510011ae)',async({page,browser,baseURL},info)=>{
 const {viewer}=await setup(page,'First session');
 await expect(viewer.locator('.viewer-empty')).toHaveAttribute('data-ready-screen','invitation');await expect(viewer.locator('.viewer-empty .welcome-view h2')).toHaveText('Your agent can show things here while you talk.');await expect(viewer.locator('.viewer-empty .welcome-view li')).toHaveCount(3);
 await viewer.screenshot({path:info.outputPath('ready-invitation.png')});
 // A returning account (a second session exists) keeps the quiet screen.
 const second=await createSession(page,'Second session'),display=await createDisplay(page,second,'Display'),quiet=await openViewer(page,second,display.id);
 await expect(quiet.locator('.viewer-empty')).toHaveAttribute('data-ready-screen','quiet');await expect(quiet.getByRole('heading',{name:'Ready when you are.'})).toBeVisible();
 const context=await browser.newContext({baseURL:baseURL!,permissions:['clipboard-read','clipboard-write']}),signedOut=await context.newPage();
 try{
  await signedOut.goto('/');await expect(signedOut.locator('.login-letters strong')).toHaveCount(6);
  const code=signedOut.locator('.login-code-text'),letters=(await signedOut.locator('.login-letters strong').allTextContents()).join('');
  await expect(code).toHaveText(letters);expect(await code.evaluate(el=>getComputedStyle(el).userSelect)).toBe('all');
  await signedOut.getByRole('button',{name:'Copy code'}).click();await expect(signedOut.getByRole('button',{name:'Code copied'})).toBeVisible();
  expect(await signedOut.evaluate(()=>navigator.clipboard.readText())).toBe(letters);await signedOut.screenshot({path:info.outputPath('copy-code.png')});
  expect(await signedOut.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }finally{await context.close();}
});
