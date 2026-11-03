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
  const account=await register(page),s=await createSession(page,'Evening acceptance'),d=await createDisplay(page,s,'Retained content'),v=await openViewer(page,s,d.id);
  const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable evening checks',scopes:['read','publish']});expect(issued.status).toBe(201);
  const headers={Authorization:`Bearer ${issued.data!.token}`},client=info.project.name.startsWith('phone')?new LegacyClient({name:'evening-legacy',version:'1'}):new Client({name:'evening-current',version:'1'});
  if(client instanceof LegacyClient)await client.connect(new LegacyTransport(new URL('/mcp',baseURL),{requestInit:{headers}}));else await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers}}));
  const call=async<T=any>(name:string,operation:string,args:Record<string,unknown>={})=>{const r=await client.callTool(operationRequest({name,arguments:{operation,...args}}));expect(r.isError,`${name} ${operation}`).not.toBe(true);return(r.structuredContent as {data:T}).data;};
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

test('content-aware cards/bookmarks fit the viewport, keep per-item new tabs and preserve preview',async({page,context,baseURL},info)=>{
  const a=await setup(page,info,baseURL!);try{
    await a.v.setViewportSize({width:1900,height:1000});const columns=async(selector:string)=>a.v.locator(selector).evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);
    await a.show({version:1,template:'cards',data:{items:Array.from({length:6},(_,i)=>({id:`s${i}`,title:`Label ${i}`}))}});const short=await columns('.record-grid');expect(short).toBeGreaterThanOrEqual(6);
    await a.show({version:1,template:'cards',data:{items:Array.from({length:6},(_,i)=>({id:`s${i}`,title:`A considerably longer descriptive title for meaningful source item ${i}`,description:'This complete contextual paragraph should get an appropriately wide readable card instead of six tightly packed columns. '.repeat(2)}))}});expect(await columns('.record-grid')).toBeLessThan(short);
    await a.v.setViewportSize(info.project.use.viewport as {width:number;height:number});await photo(a.v,info,'content-aware-cards');
    await context.route('https://example.com/evening/**',route=>route.fulfill({contentType:'text/html',body:'<html><body><h1>Original source page</h1></body></html>'}));await context.route('**/website-preview',route=>route.fulfill({json:{data:{status:'interactive',remoteContentVerified:false}}}));
    await a.show({version:1,template:'bookmarks',data:{items:Array.from({length:6},(_,i)=>({id:`b${i}`,title:`A descriptive research reference with full source context ${i}`,url:`https://example.com/evening/${i}`}))}});
    await expect(a.v.getByRole('link',{name:'Open in new tab'})).toHaveCount(6);await photo(a.v,info,'bookmark-card-containment');const overlaps=await a.v.locator('.bookmark-card').evaluateAll(cards=>cards.map((card,i)=>{const r=card.getBoundingClientRect(),preview=card.querySelector('.bookmark-preview')!.getBoundingClientRect(),link=card.querySelector('a')!.getBoundingClientRect();return {i,inside:r.bottom-link.bottom,separation:link.top-preview.bottom};}).filter(g=>g.inside<5||g.separation<5));expect(overlaps,'Every new-tab link stays inside its card and clear of the preview').toEqual([]);const popupPromise=a.v.waitForEvent('popup');await a.v.getByRole('link',{name:'Open in new tab'}).first().click();const popup=await popupPromise;await expect(popup.getByRole('heading',{name:'Original source page'})).toBeVisible();await popup.close();
    await a.v.getByRole('button',{name:/Preview A descriptive research reference/}).first().click();await expect(a.v.frameLocator('iframe').getByRole('heading',{name:'Original source page'})).toBeVisible();await a.v.getByRole('button',{name:'← Bookmarks'}).click();await photo(a.v,info,'bookmark-actions');
  }finally{await a.client.close();}
});

test('parameter types stay whole, generic chat context is readable and messages have no reply controls',async({page,baseURL},info)=>{
  const a=await setup(page,info,baseURL!);try{
    await a.show({version:1,template:'tool-detail',data:{name:'source.read',parameters:['string','integer','object'].map((type,i)=>({name:`field_${i}`,type,required:true,description:'A supplied parameter description.'}))}});
    const cells=a.v.locator('td.parameter-type');expect(await cells.evaluateAll(els=>els.every(e=>getComputedStyle(e).whiteSpace==='nowrap'&&e.scrollWidth<=e.clientWidth+1))).toBe(true);await photo(a.v,info,'parameter-types');
    await a.show({version:1,template:'chat',data:{contextLabel:'Research workspace',conversationLabel:'#release-review',participants:['Ada','Bo','Casey'],messages:[{id:'first',sender:'Ada',text:'Preserve the exact value 1.2300.'},{id:'second',sender:'Bo',text:'The agent handles replies in the real messaging system.'}]}});
    await expect(a.v.locator('.chat-context')).toContainText('Research workspace');await expect(a.v.locator('.chat-context')).toContainText('#release-review');await expect(a.v.getByLabel('Conversation participants')).toContainText('Ada · Bo · Casey');await expect(a.v.locator('.render-actions,input,textarea')).toHaveCount(0);await photo(a.v,info,'chat-context');
  }finally{await a.client.close();}
});

test('long progress timelines alternate around a centered axis without overlap and preserve one-sided choice',async({page,baseURL},info)=>{
  const a=await setup(page,info,baseURL!);try{
    for(const orientation of ['horizontal','vertical']){const view:ViewSpec={version:1,template:'progress',data:{task:'Verified release milestones',orientation,layout:'alternating',events:Array.from({length:8},(_,i)=>({id:`e${i}`,title:`Milestone ${i+1}`,timestamp:`2026-09-17T${String(10+i).padStart(2,'0')}:00:00Z`,status:i===7?'running':'completed',description:i%3===0?'A longer supplied description that must fit without crossing the timeline or another card.':'Verified source step.'}))}};await a.show(view);
      await expect(a.v.locator('[data-progress-layout]')).toHaveAttribute('data-progress-layout','alternating');await expect.poll(()=>a.v.locator('.spine-connector').count()).toBe(8);
      const geometry=await a.v.locator('.spine-content').evaluate((root,orientation)=>{const axis=root.querySelector('.spine-line')!,line=Number(axis.getAttribute(orientation==='horizontal'?'y1':'x1')),box=root.getBoundingClientRect();return [...root.querySelectorAll('.spine-card')].map((e,i)=>{const r=e.getBoundingClientRect();return {before:orientation==='horizontal'?r.bottom-box.top<line:r.right-box.left<line,after:orientation==='horizontal'?r.top-box.top>line:r.left-box.left>line,i};});},orientation);
      geometry.forEach(({before,after,i})=>expect(i%2===0?before:after).toBe(true));await photo(a.v,info,`alternating-${orientation}`);
      await a.show({...view,data:{...view.data,layout:'single'}});await expect(a.v.locator('[data-progress-layout]')).toHaveAttribute('data-progress-layout','single');
    }
  }finally{await a.client.close();}
});

test('positional arrows page inward then move across retained views, keep another viewer unchanged and show thumbnail overview',async({page,baseURL},info)=>{
  const a=await setup(page,info,baseURL!);try{
    await a.show({version:1,template:'fact',title:'First frame',data:{text:'First retained view'}});
    await a.show({version:1,template:'table',title:'Paged source',data:{columns:['Row'],rows:[['Row one'],['Row two'],['Row three']],pageSize:1}});
    const last=await a.show({version:1,template:'fact',title:'Last frame',data:{text:'Last retained view'}}),peer=await openViewer(page,a.s,a.d.id);
    const history=await a.call('kanvas_inspect','display.history',{sessionId:a.s,displayId:a.d.id});
    await expect.poll(async()=>{const r=await sessionApi<any>(page,`/api/sessions/${a.s}/displays/${a.d.id}/filmstrip`);return r.data.frames.length;}).toBe(3);
    await a.v.locator('.viewer-candidate').click({position:{x:20,y:20}});await a.v.keyboard.press('ArrowLeft');await expect(a.v.locator('tbody')).toContainText('Row three');await a.v.keyboard.press('ArrowLeft');await expect(a.v.locator('tbody')).toContainText('Row two');await a.v.keyboard.press('ArrowLeft');await expect(a.v.locator('tbody')).toContainText('Row one');await a.v.keyboard.press('ArrowLeft');await expect(a.v.locator('.viewer-candidate')).toContainText('First retained view');
    await a.v.keyboard.press('End');await expect(a.v.locator('.viewer-candidate')).toContainText('Last retained view');// Home opens the session overview; choosing a retained frame remains private.
    await a.v.keyboard.press('Home');await expect(a.v.getByRole('region',{name:'Session filmstrip'})).toBeVisible();await expect(a.v.locator('.filmstrip-card')).toHaveCount(3);await expect(peer.locator('.viewer-candidate')).toContainText('Last retained view');
    await a.v.getByRole('button',{name:'Open First frame at position 1',exact:true}).click();await expect(a.v.locator('.viewer-candidate')).toContainText('First retained view');await expect(peer.locator('.viewer-candidate')).toContainText('Last retained view');
    await a.v.keyboard.press('Escape');await expect(a.v.getByRole('region',{name:'Session filmstrip'})).toHaveCount(0);await a.v.getByRole('button',{name:'Display controls',exact:true}).click();await a.v.getByRole('button',{name:'Session overview',exact:true}).click();await expect(a.v.getByRole('region',{name:'Session filmstrip'})).toBeVisible();await expect(a.v.locator('.filmstrip-card')).toHaveCount(3);await photo(a.v,info,'filmstrip-overview');await a.v.getByRole('button',{name:'Open Paged source at position 2'}).click();await expect(a.v.locator('tbody')).toContainText('Row one');
    expect((await a.current()).revision).toBe(last.revision);expect(await a.call('kanvas_inspect','display.history',{sessionId:a.s,displayId:a.d.id})).toEqual(history);
    await peer.close();await publishPrepared(page,a.s,[a.d.id],{version:1,template:'fact',title:'New live frame',data:{text:'New live content while privately browsing'}});
    // A new authorized shared revision returns private history browsing to live.
    await expect(a.v.locator('.viewer-candidate')).toContainText('New live content while privately browsing');
    const current=await a.current();expect(current.revision).toBe(last.revision+1);expect(current.appliedRevision).toBe(current.revision);
  }finally{await a.client.close();}
});

test('touch swipes step positionally while vertical gestures keep reading scroll',async({page,baseURL},info)=>{
  const a=await setup(page,info,baseURL!);try{
    await a.show({version:1,template:'fact',data:{text:'Swipe first'}});await a.show({version:1,template:'fact',data:{text:'Swipe second'}});
    await a.v.locator('.viewer-candidate .browsing-root').evaluate(root=>{const dispatch=(type:string,x:number,y:number)=>{const t=new Touch({identifier:1,target:root,clientX:x,clientY:y});root.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[t],changedTouches:[t]}));};dispatch('touchstart',70,180);dispatch('touchend',240,185);});
    await expect(a.v.locator('.viewer-candidate')).toContainText('Swipe first');await a.v.locator('.viewer-candidate .browsing-root').evaluate(root=>{const t=new Touch({identifier:1,target:root,clientX:150,clientY:350});root.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[t],changedTouches:[t]}));const end=new Touch({identifier:1,target:root,clientX:145,clientY:100});root.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],changedTouches:[end]}));});await expect(a.v.locator('.viewer-candidate')).toContainText('Swipe first');
  }finally{await a.client.close();}
});

test('Home is live, registered PC and TV route independently, and system theme follows each operating system',async({page,browser,baseURL},info)=>{
  const a=await setup(page,info,baseURL!),tvContext=await isolatedContext(browser,info,baseURL!);try{
    const pc=await page.context().newPage();await pc.goto('/start');await expect(pc.getByRole('region',{name:'Your sessions'})).toBeVisible();await expect(pc.getByRole('button',{name:/Evening acceptance/})).toBeVisible();const pcHome=new URL(pc.url()).pathname.split('/').at(-1)!;
    const tv=await tvContext.newPage();await login(tv,a.account,'/admin');await tv.goto('/start');await expect(tv.getByRole('region',{name:'Your sessions'})).toBeVisible();const tvHome=new URL(tv.url()).pathname.split('/').at(-1)!;expect(tvHome).not.toBe(pcHome);
    await expect.poll(async()=>{const r=await a.call('kanvas_inspect','devices.read');return r.devices.filter((d:any)=>[pcHome,tvHome].includes(d.home.displayId)&&d.connected).length;}).toBe(2);
    const devices=(await a.call('kanvas_inspect','devices.read')).devices,pcDevice=devices.find((d:any)=>d.home.displayId===pcHome),tvDevice=devices.find((d:any)=>d.home.displayId===tvHome);
    const other=await sessionApi<{id:string}>(page,`/api/sessions/${a.s}/displays`,'POST',{name:'TV source',width:1200,height:800,pixelRatio:1});expect(other.status).toBe(200);await a.show({version:1,template:'fact',data:{text:'PC-specific content'}});await publishPrepared(page,a.s,[other.data!.id],{version:1,template:'fact',data:{text:'TV-specific content'}});
    await a.call('kanvas_control','device.present',{deviceId:pcDevice.id,sessionId:a.s,displayId:a.d.id,expectedVersion:pcDevice.version,requestId:randomUUID()});await a.call('kanvas_control','device.present',{deviceId:tvDevice.id,sessionId:a.s,displayId:other.data!.id,expectedVersion:tvDevice.version,requestId:randomUUID()});
    await expect(pc.locator('.viewer-candidate')).toContainText('PC-specific content');await expect(tv.locator('.viewer-candidate')).toContainText('TV-specific content');await expect.poll(async()=>{const d=(await a.call('kanvas_inspect','devices.read')).devices;return d.filter((x:any)=>[pcDevice.id,tvDevice.id].includes(x.id)&&x.command?.status==='applied').length;}).toBe(2);
    const participants=await a.call('kanvas_inspect','participants.read',{sessionId:a.s});expect(participants.registeredDevices.map((d:any)=>d.id)).toEqual(expect.arrayContaining([pcDevice.id,tvDevice.id]));
    const preferences=await a.call('kanvas_inspect','preferences.get');await a.call('kanvas_configure','preferences.update',{expectedRevision:preferences.revision,config:{theme:'system'}});const detail=await sessionDetail(page,a.s);await a.call('kanvas_configure','session.update',{sessionId:a.s,expectedRevision:detail.session.configRevision,config:{theme:'system'}});
    await pc.emulateMedia({colorScheme:'dark'});await tv.emulateMedia({colorScheme:'light'});await expect(pc.locator('.viewer-shell')).toHaveClass(/theme-dark/);await expect(tv.locator('.viewer-shell')).toHaveClass(/theme-light/);await pc.emulateMedia({colorScheme:'light'});await expect(pc.locator('.viewer-shell')).toHaveClass(/theme-light/);await photo(tv,info,'device-tv-system-theme');
    await tvContext.close();await expect.poll(async()=>{const d=(await a.call('kanvas_inspect','devices.read')).devices.find((d:any)=>d.id===tvDevice.id);return d.connected;}).toBe(false);
    await pc.goto('/start');await expect(pc.getByRole('region',{name:'Your sessions'})).toBeVisible();await expect(pc.locator('.workspace')).toHaveCount(0);await photo(pc,info,'live-home');await pc.close();
  }finally{await tvContext.close();await a.client.close();}
});

test('a delayed device paint report cannot overwrite a newer receiving revision or emit a browser error',async({page,baseURL},info)=>{
  const a=await setup(page,info,baseURL!);let release=()=>{},arrive=()=>{},armed=true;
  const gate=new Promise<void>(resolve=>{release=resolve;}),arrived=new Promise<void>(resolve=>{arrive=resolve;});
  try{
    const initial=await a.show({version:1,template:'fact',data:{text:'Initial device frame'}}),olderRevision=initial.revision+1;
    await a.v.route('**/api/devices/**/report',async route=>{const body=route.request().postDataJSON();if(armed&&body.displayId===a.d.id&&body.renderedRevision===olderRevision){armed=false;arrive();await gate;}await route.continue();});
    await a.show({version:1,template:'fact',data:{text:'Delayed painted frame'}});await arrived;
    const current=await a.show({version:1,template:'fact',data:{text:'Newer visible device frame'}});
    // With an idle console sibling, device-wide current is deliberately absent; inspect the receiving window.
    await expect.poll(async()=>{const r=await a.call('kanvas_inspect','devices.read');return r.devices.some((d:any)=>d.windows.some((w:any)=>w.current?.displayId===a.d.id&&w.renderedRevision===current.revision));}).toBe(true);
    const response=a.v.waitForResponse(r=>r.url().includes('/api/devices/')&&r.url().endsWith('/report')&&r.request().postDataJSON()?.renderedRevision===olderRevision);release();const discarded=await response;
    expect(discarded.status()).toBe(200);expect((await discarded.json()).data).toEqual({recorded:false,reason:'STALE_OBSERVATION'});
    await expect(a.v.locator('.viewer-candidate')).toContainText('Newer visible device frame');expect((await a.current()).revision).toBe(current.revision);
    expect((await a.call('kanvas_inspect','devices.read')).devices.some((d:any)=>d.windows.some((w:any)=>w.current?.displayId===a.d.id&&w.renderedRevision===current.revision))).toBe(true);
  }finally{release();await a.v.unrouteAll({behavior:'wait'});await a.client.close();}
});
