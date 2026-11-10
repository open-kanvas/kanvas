import {test,expect,register,createSession,createDisplay,publishPrepared,sessionApi,sessionDetail} from './support';
import {Store} from '../../src/server/store';
import {testDatabase} from '../postgres';
async function navigation(page:any,s:string,d:string,revision:number,action:unknown){const tabId=await page.evaluate(()=>sessionStorage.getItem('kanvas-viewer-tab'));return sessionApi(page,`/api/sessions/${s}/displays/${d}/navigation`,'POST',{tabId:tabId??'feedback26',requestId:crypto.randomUUID(),expectedRevision:revision,navigation:action});}
test('zoom fills the physical viewport, reading stays readable, and actual DOM inspection is bounded',async({page})=>{
 await register(page);const s=await createSession(page,'Zoom inspection'),d=await createDisplay(page,s,'Reading');
 await sessionApi(page,`/api/sessions/${s}/config`,'PATCH',{config:{theme:'dark'}});
 await publishPrepared(page,s,[d.id],{version:1,template:'document',data:{layout:'reading',text:'Read this document comfortably. '.repeat(100)}});
 const revision=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!.revision;
 await page.goto(`/view/${s}/${d.id}`);await expect(page.locator('.viewer-candidate .document-content')).toBeVisible();
 // A broadcast navigation uses a real connected viewer tab identity.
 const tabId=await page.evaluate(()=>{const entry=Object.keys(sessionStorage).find(k=>k.includes('window'));return entry?sessionStorage.getItem(entry):null;});
 const observation=await sessionApi<any>(page,`/api/sessions/${s}/viewers`);expect(observation.status).toBe(200);
 // Browser controls use the page's own exported UI, avoiding artificial tab IDs.
 for(const scale of [1.6,2,2.5,1]){

  // Use a persisted real observation's tab ID through the isolated test DB, never credentials.
  const store=new Store(testDatabase(process.env.KANVAS_E2E_RUN_ID!));let tab:string;try{await store.ready;const viewers=await store.list<any>('viewer',s);tab=viewers.find(v=>v.displayId===d.id)!.tabId;}finally{await store.close();}
  const result=await sessionApi<any>(page,`/api/sessions/${s}/displays/${d.id}/navigation`,'POST',{tabId:tab,requestId:crypto.randomUUID(),expectedRevision:revision,navigation:{action:'zoom',scale}});expect(result.status).toBe(200);
  await expect.poll(async()=>page.locator('.viewer-candidate .render-surface').evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,zoom:getComputedStyle(el).zoom}))).toMatchObject({zoom:String(scale)});
  const box=await page.locator('.viewer-candidate .render-surface').boundingBox(),viewport=page.viewportSize()!;expect(box!.width).toBeGreaterThan(viewport.width*.95);expect(box!.height).toBeGreaterThan(viewport.height*.85);
 }
 const inspected=await sessionApi<any>(page,`/api/sessions/${s}/displays/${d.id}/inspect`,'POST',{detail:'dom',maxNodes:8,maxDepth:3});expect(inspected.status).toBe(200);const dom=inspected.data.observations.find((x:any)=>x.domAvailable)?.dom;expect(dom).toBeTruthy();expect(dom.theme).toBe('dark');expect(dom.elements.length).toBeLessThanOrEqual(8);expect(dom.css).toContain('font-size');expect(dom.html).not.toContain('csrf');expect(dom.truncated).toBe(true);
 const store=new Store(testDatabase(process.env.KANVAS_E2E_RUN_ID!));try{await store.ready;await expect.poll(async()=> (await store.list<any>('delivery-paint',s)).length).toBeGreaterThan(0);const rows=await store.list<any>('delivery-paint',s);expect(rows[0]).toMatchObject({revision:revision,paintConfirmed:true,request:expect.any(Object)});expect(rows[0].receiveToPaintMs).toBeGreaterThanOrEqual(0);}finally{await store.close();}
});
test('root honors account theme and previews every returned display; signage and chord pages are real',async({page})=>{
 await register(page);const s=await createSession(page,'Multi display'),d=await createDisplay(page,s,'Chords'),other=await createDisplay(page,s,'Menu');
 await page.evaluate(async()=>{const auth=(await(await fetch('/api/auth/me')).json()).data;const pref=(await(await fetch('/api/preferences')).json()).data;await fetch('/api/preferences',{method:'PATCH',headers:{'Content-Type':'application/json','X-Kanvas-CSRF':auth.csrfToken},body:JSON.stringify({expectedRevision:pref.revision,config:{theme:'dark'}})});});
 const song=await publishPrepared(page,s,[d.id],{version:1,template:'sing-along',showControls:true,data:{pages:[{lines:[{lyrics:'First verse',chords:[{at:0,chord:'C'}]}]},{lines:[{lyrics:'Second verse',chords:[{at:0,chord:'G'}]}]}]}});
 await publishPrepared(page,s,[other.id],{version:1,template:'menu-board',data:{columns:2,sectionColor:'#ffffff',accent:'#ff8c00',sections:[{name:'Coffee',items:Array.from({length:16},(_,i)=>({name:`Coffee ${i+1}`,price:4}))}]}});
 await page.goto('/');await expect(page.locator('main.account-overview')).toHaveClass(/theme-dark/);const card=page.locator('.overview-session').filter({has:page.getByRole('heading',{name:'Multi display'})});await expect(card.locator('.overview-preview')).toHaveCount(3);
 await page.goto(`/view/${s}/${d.id}`);await expect(page.locator('.song-lines')).toContainText('First verse');await page.getByRole('button',{name:'Next page',exact:true}).click();await expect(page.locator('.song-lines')).toContainText('Second verse');
 await page.goto(`/view/${s}/${other.id}`);await expect(page.locator('.menu-board')).toBeVisible();const styles=await page.locator('.menu-board').evaluate(el=>({columns:getComputedStyle(el.querySelector('.menu-sections')!).columnCount,heading:getComputedStyle(el.querySelector('.menu-sections>section>h3')!).color,price:getComputedStyle(el.querySelector('.menu-price')!).color}));expect(styles).toEqual({columns:'2',heading:'rgb(255, 255, 255)',price:'rgb(255, 140, 0)'});expect(await page.locator('.render-surface').evaluate(el=>getComputedStyle(el).padding)).toBe('0px');
});
test('keyboardless UI claims only after explicit approval on another signed-in device',async({page,browser})=>{
 await register(page);const screen=await browser.newContext({baseURL:new URL(page.url()).origin,viewport:page.viewportSize()!}),receiver=await screen.newPage();try{await receiver.goto('/');const pending=await receiver.evaluate(async()=> (await(await fetch('/api/screens/request',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json()).data);const {code,label}=pending;await page.goto(`/connect?screen_code=${code}`);await page.getByRole('button',{name:'Review screen',exact:true}).click();await expect(page.getByRole('heading',{name:label,exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Approve screen',exact:true})).toBeDisabled();await page.getByLabel('I am looking at this screen and its code and label match.').check();await page.getByRole('button',{name:'Approve screen',exact:true}).click();await expect(page.getByText('Decision saved. Return to the screen.',{exact:true})).toBeVisible();const claimed=await receiver.evaluate(async()=> (await(await fetch('/api/screens/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json()).data);await receiver.goto(claimed.viewerUrl);await expect(receiver).toHaveURL(/\/view\//);await expect(receiver.locator('.viewer-shell')).toBeVisible();const me=await receiver.evaluate(async()=> (await(await fetch('/api/auth/me')).json()).data);expect(me.viewOnly).toBe(true);expect(me.receiverDeviceId).toBeTruthy();}finally{await screen.close();}
});

test('stacked columns show real segment totals and combo charts keep a labeled secondary scale',async({page})=>{
 await register(page);const s=await createSession(page,'Charts'),d=await createDisplay(page,s,'Chart');
 await publishPrepared(page,s,[d.id],{version:1,template:'chart',data:{kind:'bar',stacking:'stacked',showValues:true,showTotals:true,series:[{name:'First',color:'#5599dd',points:[{x:'A',y:20},{x:'B',y:15}]},{name:'Second',color:'#eeaa66',points:[{x:'A',y:30},{x:'B',y:25}]}]}});await page.goto(`/view/${s}/${d.id}`);await expect(page.locator('.composable-chart')).toBeVisible();await expect(page.locator('[data-stack-total="50"]')).toHaveText('50');await expect(page.locator('rect[data-chart-series="Second"][data-chart-x="A"]')).toHaveAttribute('data-stack-start','20');
 await publishPrepared(page,s,[d.id],{version:1,template:'chart',data:{kind:'bar',secondaryLabel:'Rate',series:[{name:'Count',kind:'bar',points:[{x:'A',y:100}]},{name:'Rate',kind:'line',axis:'secondary',points:[{x:'A',y:2}]}]}});await expect(page.locator('.composable-chart svg')).toContainText('Rate');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

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

test('live registry catalogs fit without controls and device metadata stays readable',async({page})=>{
 await register(page);const s=await createSession(page,'Registry and devices'),d=await createDisplay(page,s,'Catalog');
 const result=await sessionApi<any>(page,`/api/sessions/${s}/catalog`,'POST',{displayIds:[d.id],requestId:crypto.randomUUID(),catalog:'operations'});expect(result.status).toBe(200);
 await page.goto(`/view/${s}/${d.id}`);// Historical153 was already stale at main490b8f9(166 canonical minus3 catalog-only helpers). B1 adds window.viewport,
 // November5 adds device.lock/device.unlock/display.lockdown:175 canonical minus3 catalog-only helpers =172 visible.
 // November 10 adds eleven operations (NOV10_MAPPING): 186 canonical minus 3 catalog-only helpers = 183 visible.
 const labels=page.locator('.viewer-candidate .catalog-list span');await expect(labels).toHaveCount(183);
 const catalogView=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!.view!;
 expect(catalogView.template).toBe('catalog-list');expect(catalogView.data.items).toHaveLength(172);
 expect(catalogView.data.items).toEqual(expect.arrayContaining(['window.viewport','guidance.suggestions.list','guidance.suggestions.save','guidance.suggestions.delete','guidance.suggestions.import','satisfaction.read','device.lock','device.unlock','display.lockdown']));
 await expect(labels).toHaveText(catalogView.data.items as string[]);
 const bounds=await page.locator('.viewer-candidate .catalog-list').evaluate(root=>{const r=root.getBoundingClientRect();return [...root.querySelectorAll('span')].every(el=>{const b=el.getBoundingClientRect();return b.right<=r.right+1&&b.bottom<=r.bottom+1;});});expect(bounds).toBe(true);await expect(page.locator('.catalog-list button,.catalog-list a,.catalog-list input')).toHaveCount(0);
 const devices=Array.from({length:10},(_,i)=>({name:`Office laptop Chrome number ${i+1}`,device:'Windows computer',browser:'Chrome',location:'Office',role:'Dashboard',tags:['work'],connected:true,windows:[{name:'Main',connected:true,sessionId:'shared',sessionName:'Planning'}]}));
 await publishPrepared(page,s,[d.id],{version:1,template:'devices',data:{devices}});await expect(page.locator('.viewer-candidate .devices-card')).toHaveCount(10);
 expect(await page.locator('.viewer-candidate .devices-card h2').evaluateAll(headings=>headings.every(h=>h.scrollWidth<=h.clientWidth+1))).toBe(true);await expect(page.locator('.viewer-candidate .devices-key')).toContainText('Matching colors');await expect(page.locator('.viewer-candidate .devices-metadata').first()).toHaveText('Office · Dashboard');
});
