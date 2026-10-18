import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {startHarness,success,PNG,type Harness,type Browser} from './harness';
import {SEAT_LAYOUTS,materializeSeats,VOCABULARY,venueSchemas} from '../../src/shared/venue';
import {validateStatic,validateCustomSchema} from '../../src/server/custom-templates';
import {bindTemplate} from '../../src/shared/custom-templates';
import {DiscoveryCatalog} from '../../src/server/mcp/discovery';
import {safeError} from '../../src/server/mcp/results';
import {CANONICAL_TOOLS} from '../../src/server/mcp/canonical';
import {z} from 'zod';
describe('October 17 full feedback families',()=>{
 let h:Harness,o:Browser,s:string,d:string,p:{userId:string};
 beforeEach(async()=>{h=await startHarness();o=await h.account();s=(await o.session()).id;d=(await o.display(s)).id;p={userId:o.user!.id};});
 afterEach(async()=>{await h?.close();});
 const call=(name:string,args:Record<string,unknown>={})=>h.runtime.service.execute(name,args,p) as Promise<any>;
 const update=(name:string,args:Record<string,unknown>)=>call(name,{sessionId:s,displayId:d,...args});
 const publish=async(template:any,data:any)=>{const result=await o.submit(s,[d],{version:1,template,data});expect(result.update.status).toBe('prepared');return result.detail.displays.find(x=>x.id===d)!;};
 const current=async()=> (await o.detail(s)).displays.find(x=>x.id===d)!;
 it('all fourteen seat presets materialize unique bounded seats including large events',()=>{
  for(const layout of SEAT_LAYOUTS){const data=materializeSeats({layout,tableCount:50,seatsPerTable:10});expect(data.seats.length).toBeGreaterThan(0);expect(data.seats.length).toBeLessThanOrEqual(1000);expect(new Set(data.seats.map(s=>s.id)).size).toBe(data.seats.length);}
  expect(materializeSeats({tableCount:100,seatsPerTable:10}).seats).toHaveLength(1000);
  expect(()=>materializeSeats({tableCount:100,seatsPerTable:11})).toThrow();
 });
 it('place/move occupied auto-swap, explicit swap, clear/remove preserve people, retry dedupe and stale guard',async()=>{
  await publish('seat-map',{layout:'long-table',seatsPerTable:4,people:[{id:'p',name:'Peter',tags:['family']},{id:'k',name:'Karen'},{id:'r',name:'Ryan'}]});
  await update('kanvas_seat_map_update',{action:'place',personId:'p',seatId:'seat-1'});
  await update('kanvas_seat_map_update',{action:'place',personId:'k',seatId:'seat-2'});
  const a={action:'move',personId:'p',seatId:'seat-2',requestId:'move-once'};
  const result=await update('kanvas_seat_map_update',a);expect(await update('kanvas_seat_map_update',a)).toEqual(result);
  expect((await current()).view!.data.seats).toEqual(expect.arrayContaining([expect.objectContaining({id:'seat-1',personId:'k'}),expect.objectContaining({id:'seat-2',personId:'p'})]));
  await update('kanvas_seat_map_update',{action:'swap',personId:'p',otherPersonId:'r'});
  await update('kanvas_seat_map_update',{action:'clear-seat',seatId:'seat-1'});
  await update('kanvas_seat_map_update',{action:'remove-seat',seatId:'seat-2'});
  await update('kanvas_seat_map_update',{action:'add-seat',seat:{id:'extra',tableId:'table-1'}});
  const display=await current();expect(display.view!.data.people).toHaveLength(3);
  await expect(update('kanvas_seat_map_update',{action:'clear-seat',seatId:'seat-1',expectedRevision:0})).rejects.toMatchObject({code:'REVISION_CONFLICT',currentRevision:display.revision});
 });
 it('menu optional combinations, price narrow update, availability, items and quick styling',async()=>{
  for(const item of [{},{price:189},{name:'Lunch'},{image:'https://example.org/dish.jpg'},{description:'Fresh today'}])expect(venueSchemas['todays-special'].safeParse({item}).success).toBe(true);
  await publish('menu-board',{sections:[{id:'m',name:'Mains',items:[{id:'burger',name:'Burger',price:169}]}],currency:'NOK',locale:'nb-NO'});
  await update('kanvas_menu_update',{action:'price',itemId:'burger',price:189});
  await update('kanvas_menu_update',{action:'availability',itemId:'burger',availability:'sold-out'});
  await update('kanvas_menu_update',{action:'add-item',sectionId:'m',item:{id:'soup',price:99}});
  await update('kanvas_menu_update',{action:'remove-item',sectionId:'m',itemId:'soup'});
  await update('kanvas_menu_update',{action:'style',style:{preset:'bold',showPrice:false}});
  const data:any=(await current()).view!.data;expect(data.sections[0].items[0]).toMatchObject({price:189,availability:'sold-out'});expect(data).toMatchObject({preset:'bold',showPrice:false});
  await publish('todays-special',{item:{name:'Old'}});await update('kanvas_menu_update',{action:'swap-special',item:{name:'Today',price:129}});expect((await current()).view!.data.item).toMatchObject({name:'Today'});
 });
 it('shop switches preserve return view, day updates and custom poster security',async()=>{
  await publish('fact',{text:'Welcome'});
  for(const template of ['back-at','closed-sign','hiring','sale-poster','health-notice','custom-sign'])await update('kanvas_signage_update',{action:'set',template,data:{message:'Hello'}});
  await update('kanvas_signage_update',{action:'set-hours',data:{hours:[{day:'Monday',opens:'09:00',closes:'17:00'}]}});
  await update('kanvas_signage_update',{action:'set-day',day:{day:'Monday',closed:true}});
  expect((await current()).view!.data.hours).toEqual([{day:'Monday',closed:true}]);
  await update('kanvas_signage_update',{action:'clear'});expect((await current()).view).toMatchObject({template:'fact',data:{text:'Welcome'}});
  await expect(update('kanvas_signage_update',{action:'set',template:'sale-poster',data:{html:'<img src="x" onerror="alert(1)"/>'}})).rejects.toThrow();
 });
 it('kanban moves, edits, WIP remains advisory, column reordering and duplicate validation',async()=>{
  await publish('kanban',{columns:[{id:'todo',name:'To Do',cards:[{id:'bug',title:'Fix login bug'}]},{id:'doing',name:'In Progress',wipLimit:1}]});
  await update('kanvas_kanban_update',{action:'move-card',cardId:'bug',columnId:'doing'});
  await update('kanvas_kanban_update',{action:'add-card',columnId:'doing',card:{id:'docs',title:'Write docs'}});
  await update('kanvas_kanban_update',{action:'edit-card',cardId:'bug',patch:{assignee:'Alex',tags:['urgent'],dueDate:'2026-11-01'}});
  await update('kanvas_kanban_update',{action:'reorder-columns',columnIds:['doing','todo']});
  const cols:any=(await current()).view!.data.columns;expect(cols[0].cards).toHaveLength(2);expect(cols[0].cards[0]).toMatchObject({assignee:'Alex'});
  await expect(update('kanvas_kanban_update',{action:'add-card',columnId:'doing',card:{id:'bug',title:'Duplicate'}})).rejects.toThrow();
  await update('kanvas_kanban_update',{action:'remove-card',cardId:'docs'});expect(((await current()).view!.data.columns as any[])[0].cards).toHaveLength(1);
 });
 it('browser upload enforces CSRF/raster validation and account/session isolation with stable references',async()=>{
  expect((await o.request('POST','/api/media-library',{name:'dish.png',mimeType:'image/png',base64:PNG},{csrf:null})).status).toBe(403);
  const media=success(await o.request<any>('POST','/api/media-library',{name:'dish.png',mimeType:'image/png',base64:PNG,tags:['lunch']}));
  expect((await call('kanvas_media_list',{query:'lunch'})).media).toHaveLength(1);
  const stranger=await h.account();expect((await stranger.raw(media.url)).status).toBe(404);
  expect((await o.raw(media.url)).status).toBe(200);
  const token=await h.runtime.auth.issueToken(p.userId,'Selected',['read','publish'],[s]);
  const stored=(await h.runtime.store.list<any>('token')).find(t=>t.name==='Selected')!;
  const restricted={userId:p.userId,tokenId:stored.id};
  await expect(h.runtime.service.mediaLibrary.list(restricted)).rejects.toMatchObject({code:'FORBIDDEN'});
  expect(await h.runtime.service.customTemplateCatalog(restricted)).toEqual([]);
  await publish('todays-special',{item:{image:media.url}});
  expect((await current()).view!.data.item).toMatchObject({image:media.url});
  await expect(h.runtime.service.mediaLibrary.own({userId:stranger.user!.id},media.id)).rejects.toMatchObject({code:'NOT_FOUND'});
  const bad=await o.request('POST','/api/media-library',{name:'bad.png',mimeType:'image/png',base64:Buffer.from('<script>bad</script>').toString('base64')});expect(bad.status).toBeGreaterThanOrEqual(400);
 });
 const definition={name:'Team list',schema:{type:'object',properties:{title:{type:'string'},items:{type:'array',items:{type:'object',properties:{name:{type:'string'}},required:['name']}}},required:['title','items']},html:'<article><h1>{{title}}</h1><ul>{{#each items}}<li>{{name}}</li>{{/each}}</ul></article>',css:'article {padding: 24px; color: white;} h1 {font-size: 48px;}'};
 it('private templates repeat escaped data, normal replacement/patch works and discovery never leaks accounts',async()=>{
  const t=await call('kanvas_account_templates_create',definition);
  const published=await call('kanvas_account_templates_publish',{templateId:t.id,values:{title:'Team <one>',items:[{name:'Alex'},{name:'<script>alert(1)</script>'}]},sessionId:s,displayIds:[d]});
  await o.settle(s,published.requestId);
  const before=await current();expect(before.view!.data.html).toContain('&lt;script&gt;');expect(before.view!.data.html).toContain('<li>Alex</li>');
  await update('kanvas_display_edit',{data:{templateId:t.id,values:{title:'Updated',items:[]}}});
  expect((await current()).view!.data.html).toContain('<h1>Updated</h1>');
  await update('kanvas_view_patch',{operations:[{op:'set',path:'/data/values/title',value:'Patched'}]});
  expect((await current()).view!.data.html).toContain('<h1>Patched</h1>');
  const privateTemplates=await h.runtime.service.customTemplateCatalog(p);
  const catalog=new DiscoveryCatalog();const own:any=catalog.query('template','search',{query:'Team list',limit:20},{principal:p,privateTemplates});expect(JSON.stringify(own)).toContain(t.id);
  const outsider=await h.account(),other={userId:outsider.user!.id};expect(await h.runtime.service.customTemplateCatalog(other)).toEqual([]);
  await expect(h.runtime.service.customTemplates.get(other,t.id)).rejects.toMatchObject({code:'NOT_FOUND'});
  const sameName=await h.runtime.service.execute('kanvas_account_templates_create',definition,other) as any;expect(sameName.id).not.toBe(t.id);
  await call('kanvas_account_templates_delete',{templateId:t.id});expect((await current()).view!.data.html).toContain('Patched');
  await expect(update('kanvas_display_edit',{data:{templateId:t.id,values:{title:'No',items:[]}}})).rejects.toMatchObject({code:'NOT_FOUND'});
 });
 it('rejects scripts, event handlers, URL/CSS exfiltration, parser tricks and invalid schemas',()=>{
  for(const html of ['<script>alert(1)</script>','<p onclick="x">x</p>','<svg onload="x"/>','<a href="javascript:alert(1)">x</a>','<iframe/>','<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><p>&e;</p>','<style>body{}</style>','<p style="background:url(https://evil.example)">x</p>'])expect(()=>validateStatic(html,'')).toThrow();
  for(const css of ['@import "https://evil.example";','p{background:url(https://evil.example)}','p{background:u\\72l(x)}','</style><script>x</script>','p{behavior:x}'])expect(()=>validateStatic('<p>OK</p>',css)).toThrow();
  expect(()=>validateCustomSchema({type:'object',properties:{x:{$ref:'https://evil.example'}}})).toThrow();
  expect(bindTemplate('<p>{{name}}</p>',{name:'" <script>'})).toBe('<p>&quot; &lt;script&gt;</p>');
  expect(()=>bindTemplate('{{#each items}}x', {items:[]})).toThrow();
 });
 it('revision omission is valid across all advertised numeric revision/version guards; stale errors include retry value',async()=>{
  for(const tool of CANONICAL_TOOLS){const schema=z.toJSONSchema(tool.schema,{unrepresentable:'any',io:'input'}) as any;for(const key of ['expectedRevision','expectedVersion'])if(schema.properties?.[key])expect(schema.required??[],tool.name+' '+key).not.toContain(key);}
  await publish('checklist',{items:[{id:'a',text:'Task',checked:false}]});const display=await current(),checklistId=display.view!.data.checklistId;
  await call('kanvas_checklist_update',{sessionId:s,checklistId,items:[{id:'a',text:'Task',checked:true}]});
  let conflict:unknown;try{await call('kanvas_checklist_update',{sessionId:s,checklistId,expectedRevision:0,items:[]});}catch(e){conflict=e;}expect(safeError(conflict)).toMatchObject({code:'REVISION_CONFLICT',currentRevision:1});
 });
 it('narrow operations serialize concurrent writes and respect hold without losing state',async()=>{
  await publish('seat-map',{people:[{id:'a',name:'Alex'},{id:'b',name:'Blair'}]});
  await Promise.all([update('kanvas_seat_map_update',{action:'place',personId:'a',seatId:'seat-1'}),update('kanvas_seat_map_update',{action:'place',personId:'b',seatId:'seat-2'})]);
  const view=await current();expect((view.view!.data.seats as any[]).filter(s=>s.personId)).toHaveLength(2);
  await update('kanvas_display_update',{held:true});
  await expect(update('kanvas_seat_map_update',{action:'clear-seat',seatId:'seat-1'})).rejects.toMatchObject({code:'DISPLAY_HELD'});
  expect((await current()).view).toEqual(view.view);
 });
 it('media sharing is only granted after successful publication and revocation is immediate',async()=>{
  const media=await h.runtime.service.mediaLibrary.upload(p,{name:'photo.png',mimeType:'image/png',base64:PNG});
  const guest=await h.account();await call('kanvas_member_add',{sessionId:s,username:guest.user!.username,role:'viewer'});
  await expect(h.runtime.service.verifyView(p,s,{version:1,template:'todays-special',data:{item:{image:media.url,price:{invalid:true}}}})).rejects.toThrow();
  expect((await guest.raw(media.url)).status).toBe(404);
  await publish('todays-special',{item:{image:media.url}});
  expect((await guest.raw(media.url)).status).toBe(200);
  await call('kanvas_member_remove',{sessionId:s,userId:guest.user!.id});
  expect((await guest.raw(media.url)).status).toBe(404);
 });
 it('malformed guards include current state after authorization, without leaking other accounts',async()=>{
  await publish('kanban',{columns:[{id:'todo',name:'To do'}]});
  let error:unknown;try{await update('kanvas_kanban_update',{action:'reorder-columns',columnIds:['todo'],expectedRevision:'bad'});}catch(e){error=e;}
  expect(safeError(error)).toMatchObject({code:'INVALID_ARGUMENT',currentRevision:1});
  const stranger=await h.account();
  await expect(h.runtime.service.execute('kanvas_kanban_update',{sessionId:s,displayId:d,action:'reorder-columns',columnIds:['todo'],expectedRevision:'bad'},{userId:stranger.user!.id})).rejects.not.toHaveProperty('currentRevision');
 });
 it('signage can set and clear a previously blank display',async()=>{
  await update('kanvas_signage_update',{action:'set',template:'back-at',data:{time:'14:30'}});
  expect((await current()).view!.template).toBe('back-at');
  await update('kanvas_signage_update',{action:'clear'});expect((await current()).view).toBeNull();
 });
 it('autoplay and settings apply without preflight revision reads, while explicit guards still reject stale writes',async()=>{
  await publish('presentation',{slides:[{version:1,template:'fact',data:{text:'One'}},{version:1,template:'fact',data:{text:'Two'}}]});
  const started=await update('kanvas_autoplay_control',{action:'start',intervalSeconds:60});
  expect(started.status).toBe('running');
  const paused=await update('kanvas_autoplay_control',{action:'pause'});expect(paused.status).toBe('paused');
  await expect(update('kanvas_autoplay_control',{action:'resume',expectedVersion:started.version})).rejects.toMatchObject({code:'REVISION_CONFLICT',currentRevision:paused.version});
  await update('kanvas_autoplay_control',{action:'stop'});
  await call('kanvas_config_update',{sessionId:s,config:{theme:'light'}});
  expect((await o.detail(s)).session.config.theme).toBe('light');
 });
 it('vocabulary help shares definitions with visual source',async()=>{const result=await call('kanvas_help',{topic:'vocabulary'});expect(JSON.stringify(result)).toContain(VOCABULARY[1].definition);await publish('vocabulary',{highlight:'Display'});});
});
