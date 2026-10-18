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
test('restaurant presets and all shop signs have readable portrait and landscape content',async({page,baseURL},info)=>{
 const a=await setup(page,baseURL!);try{
 for(const preset of ['bold','fine-dining','cafe','chalkboard','modern']){await a.show('menu-board',{preset,currency:'NOK',locale:'nb-NO',title:'Lunch at the counter',sections:[{id:'m',name:'Mains',items:[{id:'burger',name:'House burger',price:169,description:'Grilled vegetables, local cheese',badges:['Popular']},{id:'soup',name:'Soup of the day',price:99,allergens:'Contains celery'}]}],footer:'Ask us about allergens'});await expect(a.viewer.locator('.menu-board')).toContainText('House burger');}
 await a.update('kanvas.menu.update',{action:'price',itemId:'burger',price:189});await a.update('kanvas.menu.update',{action:'availability',itemId:'soup',availability:'sold-out'});await a.current();await expect(a.viewer.locator('.sold-out-label')).toBeVisible();await photo(a.viewer,info,'menu-board');
 await a.show('todays-special',{preset:'bold',currency:'NOK',item:{name:'Today’s special',price:129,description:'Freshly made, while it lasts',badges:['Vegan']}});await photo(a.viewer,info,'special');
 for(const template of SIGN_TYPES){await a.update('kanvas.signage.update',{action:'set',template,data:{message:template==='back-at'?'Back in 15 minutes':'Welcome to our neighborhood',hours:[{day:'Mon–Fri',opens:'09:00',closes:'17:00'},{day:'Saturday',opens:'10:00',closes:'14:00'},{day:'Sunday',closed:true}],role:template==='hiring'?'Weekend barista':undefined,apply:template==='hiring'?'Ask inside':undefined}});await a.current();await expect(a.viewer.locator('.shop-sign')).toContainText(template==='back-at'?'Back in 15 minutes':'Welcome to our neighborhood');if(['opening-hours','hiring','sale-poster'].includes(template))await photo(a.viewer,info,template);}
 await a.update('kanvas.signage.update',{action:'clear'});await a.current();await expect(a.viewer.locator('.special')).toBeVisible();
 }finally{await a.client.close();}
});
test('kanban live card movement and vocabulary relationships',async({page,baseURL},info)=>{
 const a=await setup(page,baseURL!);try{
 await a.show('kanban',{columns:[{id:'todo',name:'To Do',cards:[{id:'login',title:'Fix login bug',description:'Keep the session after refresh',assignee:'Alex',tags:['Customer issue'],dueDate:'Monday'}]},{id:'doing',name:'In Progress',wipLimit:2},{id:'done',name:'Done'}]});
 await a.update('kanvas.kanban.update',{action:'move-card',cardId:'login',columnId:'doing'});await a.current();await expect(a.viewer.locator('.kanban-board>section').nth(1)).toContainText('Fix login bug');await photo(a.viewer,info,'kanban');
 await a.show('vocabulary',{highlight:'Display'});await expect(a.viewer.locator('.vocab-displays>section')).toHaveCount(2);await expect(a.viewer.locator('.vocab-devices span')).toHaveCount(3);await expect(a.viewer.locator('.vocab-terms .highlight')).toContainText('named place');await photo(a.viewer,info,'vocabulary');
 }finally{await a.client.close();}
});
test('user media upload and private template publish/update work through browser and real MCP',async({page,baseURL},info)=>{
 const a=await setup(page,baseURL!);try{
 await page.goto('/admin?account');await page.getByRole('button',{name:'Media library',exact:true}).click();
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=','base64');
 await page.getByLabel('Tags (comma-separated)').fill('lunch, special');await page.getByLabel('Add images',{exact:true}).setInputFiles({name:'Lunch photo.png',mimeType:'image/png',buffer:png});await expect(page.getByRole('status')).toContainText('Uploaded');await page.screenshot({path:info.outputPath('media-library.png'),animations:'disabled'});
 const media=await a.call('kanvas.media.list',{query:'lunch'});expect(media.media).toHaveLength(1);
 await a.show('todays-special',{item:{image:media.media[0].url}});await expect(a.viewer.locator('.hero-image')).toBeVisible();expect(await a.viewer.locator('.hero-image').evaluate((x:HTMLImageElement)=>x.naturalWidth)).toBe(1);
 const t=await a.call('kanvas.account.templates.create',{name:'My weekly team list',schema:{type:'object',properties:{title:{type:'string'},items:{type:'array',items:{type:'object',properties:{name:{type:'string'}},required:['name']}}},required:['title','items']},html:'<main><h1>{{title}}</h1><ul>{{#each items}}<li>{{name}}</li>{{/each}}</ul></main>',css:'main{padding:30px}h1{font-size:48px}li{font-size:28px;line-height:2}'});
 const discover=await a.client.callTool({name:'kanvas_discover',arguments:{catalog:'templates',action:'search',query:'My weekly team list',limit:5}});expect(JSON.stringify(discover)).toContain(t.id);
 await a.call('kanvas.account.templates.publish',{templateId:t.id,values:{title:'Our week',items:[{name:'Peter'},{name:'Karen'}]},sessionId:a.sessionId,displayIds:[a.display.id]});await a.current();const frame=a.viewer.frameLocator('iframe[title="Custom template"]');await expect(frame.getByRole('heading',{name:'Our week'})).toBeVisible();await expect(frame.locator('li')).toHaveCount(2);await photo(a.viewer,info,'custom-template');
 await a.update('kanvas.view.patch',{operations:[{op:'set',path:'/data/values/title',value:'Updated live'}]});await a.current();await expect(frame.getByRole('heading',{name:'Updated live'})).toBeVisible();
 expect(await a.viewer.locator('iframe[title="Custom template"]').getAttribute('sandbox')).toBe('');
 }finally{await a.client.close();}
});
