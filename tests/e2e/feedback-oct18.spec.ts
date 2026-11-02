import {test,expect,register,createSession,createDisplay,openViewer,publishPrepared,waitForDisplay,sessionApi} from './support';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {SEAT_LAYOUTS,SIGN_TYPES} from '../../src/shared/venue';
import type {Page,TestInfo} from '@playwright/test';
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
test('signage fits where possible and menus preserve readable minimum text with accessible overflow',async({page,baseURL},info)=>{
 const a=await setup(page,baseURL!);try{
 const items=Array.from({length:4},(_,i)=>({name:'Lunch item '+i,description:'Fresh local vegetables and herbs',price:'129 kr'}));
 const image=await a.call('kanvas.asset.import',{sessionId:a.sessionId,name:'menu-photo.png',mimeType:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII='});
 await a.show('menu',{image:{url:image.url,alt:'Menu photo'},groups:Array.from({length:4},(_,i)=>({title:'Section '+i,items}))});await fit(a.viewer);if((a.viewer.viewportSize()?.width??0)>1000)expect(Number(await a.viewer.locator('.fit-display').getAttribute('data-fit-scale'))).toBeGreaterThan(.7);await photo(a.viewer,info,'menu-16');
 await a.show('menu-board',{title:'Lunch and dinner',sections:Array.from({length:4},(_,i)=>({name:'Section '+i,items})),preset:'chalkboard'});await fit(a.viewer);if((a.viewer.viewportSize()?.width??0)>1000)expect(Number(await a.viewer.locator('.fit-display').getAttribute('data-fit-scale'))).toBeGreaterThan(.45);await photo(a.viewer,info,'menu-board-16');
 await a.show('opening-hours',{heading:'Åpningstider',hours:Array.from({length:7},(_,i)=>({day:['Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag','Søndag'][i],opens:'09:00',closes:'17:00',closed:i===6})),closedDayLabel:'Stengt',preset:'chalkboard'});await fit(a.viewer);await expect(a.viewer.locator('.opening-hours')).toContainText('Stengt');expect(await a.viewer.locator('.shop-sign').evaluate(el=>getComputedStyle(el).fontFamily)).toContain('KanvasChalk');await photo(a.viewer,info,'hours-seven');
 await a.show('closed-sign',{heading:'Velkommen tilbake',openNow:false,closedLabel:'Stengt',message:'Vi åpner igjen i morgen'});await fit(a.viewer);await expect(a.viewer.locator('.open-status')).toHaveText('Stengt');
 await a.show('menu',{groups:Array.from({length:4},(_,i)=>({title:'Section '+i,items:Array.from({length:25},(_,j)=>({name:'Dish '+j,price:'99'}))}))});await fit(a.viewer);expect(await a.viewer.locator('.menu-group article').count()).toBe(100);
 }finally{await a.client.close();}
});
test('reusable imported media paints in image renderer; failures surface to MCP',async({page,baseURL,diagnostics},info)=>{
 const a=await setup(page,baseURL!);try{
 const asset=await a.call('kanvas.asset.import',{sessionId:a.sessionId,name:'Reusable.png',mimeType:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII='});
 const media=await a.call('kanvas.media.import',{sessionId:a.sessionId,assetId:asset.id,tags:['reuse']});expect((await a.call('kanvas.media.list',{query:'Reusable'})).media).toHaveLength(1);
 for(const url of [asset.url,media.url]){await a.show('image',{images:[{url,alt:'Uploaded image'}]});await expect.poll(()=>a.viewer.locator('.image-frame img').evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBe(1);}
 await page.goto('/admin?account=media');await expect(page.getByRole('heading',{name:'Your media library'})).toBeVisible();await photo(a.viewer,info,'image-library');
 diagnostics.allowHttp(a.viewer,asset.url,404);
 await a.viewer.route('**'+asset.url,route=>route.fulfill({status:404,body:'Missing'}));
 // Failure must be inspected without waiting for successful delivery acknowledgement.
 await publishPrepared(page,a.sessionId,[a.display.id],{version:1,template:'image',data:{images:[{url:asset.url}]}});await expect(a.viewer.getByText('Image unavailable',{exact:true})).toBeVisible();
 await expect.poll(async()=>{const s=await a.call('kanvas.session.state',{sessionId:a.sessionId});return JSON.stringify(s);}).toContain('HTTP_404');
 }finally{await a.client.close();}
});
test('platform zoom applies through real MCP without changing source revision',async({page,baseURL},info)=>{
 const a=await setup(page,baseURL!);try{
 const d=await a.show('kanban',{columns:Array.from({length:5},(_,i)=>({id:'c'+i,name:'Column '+i,cards:Array.from({length:6},(_,j)=>({id:i+'-'+j,title:'Task '+j,description:'Detailed work to complete'}))}))});
 await a.update('kanvas.navigation.control',{requestId:'zoom-out',expectedRevision:d.revision,navigation:{action:'zoom',scale:.5}});
 await expect.poll(()=>a.viewer.locator('.viewer-candidate .render-surface').first().evaluate(el=>(el as HTMLElement).style.zoom)).toBe('0.5');expect((await a.current()).revision).toBe(d.revision);await photo(a.viewer,info,'zoom-kanban');
 }finally{await a.client.close();}
});

test('unchecked consent gives actionable feedback and never submits',async({page})=>{
 let consumed=0;await page.route('**/api/auth/email/inspect',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({data:{email:'test@example.test',originatingDevice:{code:'123456',device:'Your test device',createdAt:new Date().toISOString(),expiresAt:Date.now()+600000}}})}));
 await page.route('**/api/auth/email/consume',route=>{consumed++;return route.fulfill({contentType:'application/json',body:JSON.stringify({data:{approved:true}})});});
 await page.goto('/#email-signin='+ 'a'.repeat(43));await page.getByRole('button',{name:'Approve requesting device'}).click();await expect(page.getByRole('alert')).toContainText('Accept the Terms');expect(consumed).toBe(0);
 await page.getByRole('checkbox').first().check();await page.getByRole('button',{name:'Approve requesting device'}).click();await expect(page.getByRole('alert')).toContainText('code matches');expect(consumed).toBe(0);
 await page.getByRole('checkbox').nth(1).check();await page.getByRole('button',{name:'Approve requesting device'}).click();await expect(page.getByRole('status')).toContainText('requesting device is approved');expect(consumed).toBe(1);
});
test('manifest launches root while standalone cold deep links retain their destination',async({page})=>{
 await page.addInitScript(()=>{const original=window.matchMedia.bind(window);window.matchMedia=(query:string)=>query==='(display-mode: standalone)'?{...original(query),matches:true} as MediaQueryList:original(query);});
 await page.goto('/start');await expect.poll(()=>new URL(page.url()).pathname).toBe('/start');
 const manifest=await page.evaluate(async()=>fetch('/manifest.webmanifest').then(r=>r.json()));expect(manifest.start_url).toBe('/');expect(manifest.launch_handler.client_mode).toBe('navigate-existing');await page.goto(manifest.start_url);await expect(page.getByRole('heading',{name:'Sign in on this screen',exact:true})).toBeVisible();await expect.poll(()=>new URL(page.url()).pathname).toBe('/');
});
