import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import type {Page,TestInfo} from '@playwright/test';
import {test,expect,register,login,createSession,createDisplay,openViewer,publishPrepared,waitForDisplay,sessionApi,sessionDetail,isolatedContext,tab} from './support';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGOQLLv0H4QZYAwAT3YJgeciwUwAAAAASUVORK5CYII=','base64');
async function accountSection(page:Page,name:string){
  const navigation=page.getByRole('button',{name:'Open navigation',exact:true});if(await navigation.isVisible()&&await navigation.getAttribute('aria-expanded')!=='true')await navigation.click();
  await page.getByRole('button',{name:'Account & teams',exact:true}).click();await page.getByRole('navigation',{name:'Account sections'}).getByRole('button',{name,exact:true}).click();
}
async function photo(page:Page,info:TestInfo,name:string){
  await page.evaluate(()=>document.fonts.ready);await mkdir(info.outputPath('visuals'),{recursive:true});
  for(let i=0;i<10&&await page.getByRole('button',{name:'Dismiss notification',exact:true}).count();i++)await page.getByRole('button',{name:'Dismiss notification',exact:true}).first().click();
  await expect(page.locator('.viewer-toast')).toHaveCount(0);
  await page.screenshot({path:info.outputPath('visuals')+'/'+info.project.name+'-'+name+'.png',animations:'disabled'});
}
async function groupRequest(page:Page,path:string,method='GET',body?:unknown){
  if(!/^\/api\/(groups(?:\/|$)|profile$|preferences$|activity(?:\?|$)|analytics(?:\?|$))/.test(path))throw new Error('Only bounded account business fixtures are allowed.');
  return page.evaluate(async({path,method,body})=>{const me=await(await fetch('/api/auth/me',{credentials:'same-origin'})).json();const r=await fetch(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Kanvas-CSRF':me.data.csrfToken},...(body===undefined?{}:{body:JSON.stringify(body)})});const result=await r.json();return {status:r.status,data:result.data,code:result.error?.code};},{path,method,body});
}

test('JSON is compact and agent-driven, retaining exact tokens and duplicate keys without chrome',async({page},info)=>{
  await register(page);const s=await createSession(page,'Structured JSON'),d=await createDisplay(page,s,'JSON explorer'),v=await openViewer(page,s,d.id);
  const source='{"large":9007199254740993,"decimal":1.2300,"same":1,"same":2,"nested":{"escaped/key":{"__proto__":"inert"}},"rows":['+Array.from({length:70},(_,i)=>'{"id":'+i+',"text":"Exact row '+i+'"}').join(',')+']}';
  const show=async(options:Record<string,unknown>)=>{await publishPrepared(page,s,[d.id],{version:1,template:'json',data:{json:source,...options}});const current=await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision&&x.revision>0);await expect(v.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
  await show({expandedDepth:1});await expect(v.locator('.json-tree')).toContainText('9007199254740993');await expect(v.locator('.json-tree')).toContainText('1.2300');expect(await v.locator('.json-key').filter({hasText:/^same$/}).count()).toBe(2);
  await expect(v.locator('.json-explorer input,.json-explorer button,.json-detail,.json-toolbar')).toHaveCount(0);
  const row=await v.getByRole('treeitem').first().boundingBox();expect(row!.height).toBeLessThanOrEqual(28);
  await show({expandedDepth:64});await expect(v.locator('.json-tree')).toContainText('Exact row 69');await v.locator('.json-tree').evaluate(e=>e.scrollTop=e.scrollHeight);await expect.poll(()=>v.locator('.json-tree').evaluate(e=>e.scrollTop)).toBeGreaterThan(50);
  await show({query:'__proto__'});await expect(v.locator('.json-tree')).toContainText('inert');await expect(v.locator('.json-tree .json-key').filter({hasText:'large'})).toHaveCount(0);
  await show({expandedDepth:0});await expect(v.getByRole('treeitem')).toHaveCount(1);
  await show({expandedDepth:0,expandedPaths:['/nested/escaped~1key']});await expect(v.locator('.json-tree')).toContainText('inert');
  const after=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!;expect(after.view?.data.json).toBe(source);
  await photo(v,info,'json-explorer');
});

test('profile, personal appearance, independent groups and live group grants work through administration',async({page,browser,baseURL,diagnostics},info)=>{
  const peerContext=await isolatedContext(browser,info,baseURL!);try{
    const peer=await peerContext.newPage();diagnostics.watch(peer);const person=await register(peer);
    await register(page);const s=await createSession(page,'Group-managed session'),shared=await createDisplay(page,s,'Shared board');await publishPrepared(page,s,[shared.id],{version:1,template:'fact',data:{text:'Visible through current team access only.'}});
    await accountSection(page,'Profile');await page.getByLabel('Display name',{exact:true}).fill('Research owner');
    await page.getByLabel('Profile photo (optional)',{exact:true}).setInputFiles({name:'avatar.png',mimeType:'image/png',buffer:png});
    await expect(page.getByAltText('Selected photo preview')).toBeVisible();await page.getByRole('button',{name:'Save profile',exact:true}).click();await expect(page.getByAltText('Current profile')).toBeVisible();
    await page.getByLabel('Personal theme').selectOption('system');await page.getByRole('button',{name:'Save personal appearance'}).click();await expect(page.getByText('Personal appearance saved.',{exact:true})).toBeVisible();
    await accountSection(page,'Organizations & teams');
    for(const name of ['Research North','Research South']){await page.getByLabel('Group kind',{exact:true}).selectOption('organization');await page.getByLabel('New group name',{exact:true}).fill(name);await page.getByRole('button',{name:'Create group',exact:true}).click();await expect(page.locator('.account-group-detail h3')).toHaveText(name);}
    await page.getByLabel('Group kind',{exact:true}).selectOption('team');await page.getByLabel('New group name',{exact:true}).fill('Cross-org team');await page.getByRole('button',{name:'Create group',exact:true}).click();await expect(page.locator('.account-group-detail h3')).toHaveText('Cross-org team');
    await page.getByLabel('Linked organizations').selectOption([{label:'Research North'},{label:'Research South'}]);await page.getByLabel('Default style',{exact:true}).selectOption('iris');await page.getByLabel('Brand palette (optional)').fill('#176d72, #ead3b0');await page.getByRole('button',{name:'Save group settings'}).click();
    await expect.poll(async()=>{const r=await groupRequest(page,'/api/groups');return r.data.groups.find((g:any)=>g.name==='Cross-org team')?.organizationIds.length;}).toBe(2);
    // Saving reloads the revision-keyed editor; wait for that UI transaction before filling its next form.
    await expect(page.getByRole('button',{name:'Save group settings'})).toBeEnabled();
    await page.getByLabel('Member email or username').fill(person.username);await page.getByRole('button',{name:'Add member',exact:true}).click();await expect(page.locator('.account-member-list')).toContainText(person.username);await photo(page,info,'cross-organization-team');
    const group=(await groupRequest(page,'/api/groups')).data.groups.find((g:any)=>g.name==='Cross-org team');
    const noAccess=await sessionApi(peer,'/api/sessions/'+s);diagnostics.allowHttp(peer,'/api/sessions/'+s,404);expect(noAccess.status).toBe(404);
    await page.goto('/admin?session='+s);await tab(page,'People & access');await page.getByLabel('Group to grant access').selectOption(group.id);await page.getByRole('button',{name:'Grant group access'}).click();await expect(page.locator('.session-group-access .account-member-list')).toContainText('Cross-org team');
    expect((await sessionDetail(peer,s)).session.role).toBe('viewer');const receiver=await openViewer(peer,s,shared.id);diagnostics.watch(receiver);await expect(receiver.getByText('Visible through current team access only.',{exact:true})).toBeVisible();
    await page.getByLabel('Access for Cross-org team').selectOption('editor');await expect.poll(async()=> (await sessionDetail(peer,s)).session.role).toBe('editor');
    await tab(page,'Settings');await page.getByLabel('Session team',{exact:true}).selectOption(group.id);await page.getByRole('button',{name:'Save inheritance',exact:true}).click();await expect(page.getByText('Session inheritance saved.',{exact:true})).toBeVisible();
    await tab(page,'Activity');await page.getByRole('button',{name:'History & access audit'}).click();await expect(page.locator('.account-event-list')).toContainText('session · group-access · changed');await expect(page.locator('.account-event-list')).toContainText('Research owner');await photo(page,info,'access-audit');
    await tab(page,'People & access');diagnostics.allowHttp(receiver,'/api/sessions/'+s,404);await page.getByRole('button',{name:'Revoke group access'}).click();await expect(page.locator('.session-group-access .account-member-list article')).toHaveCount(0);expect((await sessionApi(peer,'/api/sessions/'+s)).status).toBe(404);await expect(receiver.locator('.viewer-shell')).toHaveAttribute('data-render-status','unavailable');await expect(receiver.locator('.viewer-candidate,.viewer-last-good')).toHaveCount(0);await expect(receiver.getByText('Visible through current team access only.',{exact:true})).toHaveCount(0);
  }finally{await peerContext.close();}
});

test('live topology groups actual windows and distinct devices, shows browser logos and retains offline evidence',async({page,browser,baseURL,diagnostics},info)=>{
  const account=await register(page),s=await createSession(page,'Connection hierarchy'),d=await createDisplay(page,s,'Topology'),other=await createDisplay(page,s,'Another display');
  const context=await isolatedContext(browser,info,baseURL!);try{
    await context.setExtraHTTPHeaders({'User-Agent':'Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/537.36 Chrome/124.0 Safari/537.36'});
    const tv=await context.newPage();diagnostics.watch(tv);await login(tv,account);await tv.goto('/start');await expect(tv.locator('.viewer-shell')).toBeVisible();
    const v=await openViewer(page,s,d.id),second=await openViewer(page,s,other.id);await tv.goto('/view/'+s+'/'+d.id);
    await publishPrepared(page,s,[d.id],{version:1,template:'session-topology',data:{groupBy:'people',includeOffline:true}});
    await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision&&x.revision>0);
    await expect(v.locator('.session-topology')).toBeVisible();await expect.poll(()=>v.locator('.topology-window.is-connected').count()).toBeGreaterThanOrEqual(3);await expect(v.locator('.topology-person>header')).toHaveCount(1);
    await expect.poll(()=>v.locator('.topology-device').count()).toBeGreaterThanOrEqual(2);await expect(v.locator('.browser-logo').first()).toBeVisible();
    // Visibility precedes image decoding; verify every actual logo eventually loads, not just the first visible element.
    await expect.poll(()=>v.locator('.browser-logo').evaluateAll(images=>images.length>0&&images.every(i=>(i as HTMLImageElement).complete&&(i as HTMLImageElement).naturalWidth>0))).toBe(true);
    await expect(v.getByRole('img',{name:'tv',exact:true})).toBeVisible();await photo(v,info,'people-devices-windows');
    await expect(v.locator('.topology-controls,.session-topology select,.topology-toolbar button')).toHaveCount(0);
    await publishPrepared(page,s,[d.id],{version:1,template:'session-topology',data:{groupBy:'all',includeOffline:true}});await expect(v.locator('.session-topology')).toHaveAttribute('data-group-by','all');await expect(v.locator('.topology-display>header h2')).toHaveText(['Main display','Topology','Another display']);
    const displayIcon=await v.locator('.topology-display-icon').first().boundingBox(),deviceIcon=await v.locator('.topology-device>header>svg').first().boundingBox();expect(displayIcon!.width).toBeGreaterThan(deviceIcon!.width*1.5);await photo(v,info,'display-participants');
    await second.close();await expect.poll(()=>v.locator('.topology-window.is-offline').count(),{timeout:12000}).toBeGreaterThanOrEqual(1);
    const topology=await sessionApi<any>(page,'/api/sessions/'+s+'/topology');expect(topology.data.counts.windows).toBe(2);expect(topology.data.counts.offline).toBeGreaterThanOrEqual(1);
    expect(topology.data.displays.flatMap((x:any)=>x.connections).every((c:any)=>!c.location)).toBe(true);
  }finally{await context.close();}
});

test('participant map uses local GeoIP, makes unknown locations explicit and distinguishes review hints',async({page,browser,baseURL,diagnostics},info)=>{
  const account=await register(page),s=await createSession(page,'Approximate participant map'),d=await createDisplay(page,s,'Map');
  const locatedContext=await isolatedContext(browser,info,baseURL!);try{
    // Exercise the real local database at the trusted loopback ingress seam.
    await locatedContext.setExtraHTTPHeaders({'x-forwarded-for':'8.8.8.8'});
    await page.context().route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/png',body:png}));await locatedContext.route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/png',body:png}));
    const located=await locatedContext.newPage();diagnostics.watch(located);await login(located,account);await located.goto('/view/'+s+'/'+d.id);const v=await openViewer(page,s,d.id);
    await publishPrepared(page,s,[d.id],{version:1,template:'session-topology',data:{layout:'map',includeLocation:true,expectedCountries:['NO']}});
    await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision&&x.revision>0);
    await expect(v.locator('.topology-map .leaflet-container')).toBeVisible();await expect(v.locator('.topology-map-people')).toContainText('Location unavailable');
    await expect.poll(()=>v.locator('.topology-map-people .is-outlier').count()).toBe(1);await expect(v.locator('.topology-map path.leaflet-interactive').first()).toBeVisible();
    const data=(await sessionApi<any>(page,'/api/sessions/'+s+'/topology?displayId='+d.id)).data;expect(data.locationVisible).toBe(true);expect(data.counts.located).toBe(1);expect(data.counts.unknownLocation).toBe(1);expect(data.counts.outliers).toBe(1);
    await photo(v,info,'approximate-participant-map');await expect(v.locator('.topology-toolbar button')).toHaveCount(0);await publishPrepared(page,s,[d.id],{version:1,template:'session-topology',data:{layout:'connections',groupBy:'people',includeLocation:true,expectedCountries:['NO']}});await expect(v.locator('.topology-outlier')).toContainText('Outside expected countries');
  }finally{await locatedContext.close();}
});

test('approved guests have a separate silhouette, cannot read account history, and see only explicitly published topology',async({page,browser,baseURL,diagnostics},info)=>{
  await register(page);const s=await createSession(page,'Guest visibility'),d=await createDisplay(page,s,'Connection audience'),v=await openViewer(page,s,d.id);
  const current=(await groupRequest(page,'/api/profile')).data;await groupRequest(page,'/api/profile','PATCH',{expectedRevision:current.revision,displayName:'Registered host',avatar:{mimeType:'image/png',base64:png.toString('base64')}});
  await publishPrepared(page,s,[d.id],{version:1,template:'session-topology',data:{includeLocation:false}});
  const guestContext=await isolatedContext(browser,info,baseURL!);try{
    const guest=await guestContext.newPage();const guestDiagnosticUploads:string[]=[];guest.on('request',request=>{if(new URL(request.url()).pathname==='/api/diagnostics')guestDiagnosticUploads.push(request.method());});diagnostics.watch(guest);await guest.goto('/view/'+s+'/'+d.id);await guest.getByRole('button',{name:'Pair this screen'}).click();
    await expect(guest.getByText('Waiting for the owner.',{exact:true})).toBeVisible();await guest.getByLabel('Your name (optional)').fill('Visitor Ada');await guest.getByRole('button',{name:'Add my name'}).click();
    await tab(page,'People & access');await page.getByRole('button',{name:'Approve screen',exact:true}).click();await expect(guest.locator('.viewer-shell')).toBeVisible();
    await expect.poll(()=>v.locator('.topology-person>header').count()).toBe(2);await expect(v.locator('.topology-avatar.is-guest')).toHaveCount(1);await expect(v.locator('.topology-avatar:not(.is-guest) img')).toHaveCount(1);
    await expect(v.locator('.topology-person').filter({hasText:'Registered host'})).toHaveCount(1);await expect(v.locator('.topology-person').filter({hasText:'Visitor Ada'})).toHaveCount(1);await expect(guest.locator('.topology-avatar:not(.is-guest) img')).toBeVisible();
    expect(await guest.locator('.topology-avatar img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);await photo(v,info,'guest-and-account');
    diagnostics.allowHttp(guest,'/api/activity',403);const denied=await guest.evaluate(async()=>{const r=await fetch('/api/activity',{credentials:'same-origin'});return r.status;});expect(denied).toBe(403);
    await publishPrepared(page,s,[d.id],{version:1,template:'fact',data:{text:'The shared connection view is closed.'}});
    await expect(guest.locator('.viewer-candidate')).toContainText('The shared connection view is closed.');
    diagnostics.allowHttp(guest,'/api/sessions/'+s+'/topology',409);expect((await sessionApi(guest,'/api/sessions/'+s+'/topology?displayId='+d.id)).status).toBe(409);
    expect(guestDiagnosticUploads).toEqual([]);
  }finally{await guestContext.close();}
});
