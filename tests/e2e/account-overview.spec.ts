import {createDisplay,createSession,expect,publishPrepared,register,sessionApi,test} from './support';
test('root has safe nested previews and the same live tab can return from a display to overview',async({page})=>{
 await register(page);const s=await createSession(page,'Overview acceptance'),d=await createDisplay(page,s,'Current display');
 await publishPrepared(page,s,[d.id],{version:1,template:'fact',title:'A current preview',data:{text:'42 · Current answer'}});
 await page.goto('/');await expect(page.getByRole('heading',{name:'Your sessions',exact:true})).toBeAttached();await expect(page.locator('.overview-preview').getByText('A current preview',{exact:true})).toBeVisible();await expect(page.getByText('This window is ready for your agent.')).toHaveCount(0);
 const sessionsBefore=(await sessionApi<any>(page,'/api/sessions')).data.length;
 await page.getByRole('link',{name:'Open Current display in Overview acceptance'}).click();await expect(page.locator('.viewer-shell')).toBeVisible();
 const inventory=()=>sessionApi<any>(page,'/api/devices');
 await expect.poll(async()=>{const devices=(await inventory()).data.devices;return devices.some((device:any)=>device.windows.some((w:any)=>w.connected&&w.current?.displayId===d.id));}).toBe(true);
 const devices=(await inventory()).data.devices,device=devices.find((device:any)=>device.windows.some((w:any)=>w.current?.displayId===d.id)),window=device.windows.find((w:any)=>w.current?.displayId===d.id);
 const path=`/api/devices/${device.id}/windows/${window.id}/overview`,response=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST');
 const navigating=sessionApi<any>(page,path,'POST',{expectedVersion:window.version,requestId:crypto.randomUUID()}).catch(error=>{if(!/Execution context was destroyed/.test(String(error)))throw error;});expect((await response).status()).toBe(200);await navigating;
 await expect(page).toHaveURL(/\/$/);await expect(page.getByRole('heading',{name:'Your sessions',exact:true})).toBeAttached();
 await expect.poll(async()=>{const current=(await inventory()).data.devices.find((x:any)=>x.id===device.id).windows.find((x:any)=>x.id===window.id);return current.command?.status;}).toBe('applied');
 const current=(await inventory()).data.devices.find((x:any)=>x.id===device.id).windows.find((x:any)=>x.id===window.id);expect(current.current).toBeUndefined();expect((await sessionApi<any>(page,'/api/sessions')).data.length).toBe(sessionsBefore);
 await publishPrepared(page,s,[d.id],{version:1,template:'table',title:'Live table preview',data:{columns:['Name','Value'],rows:[['Alpha','42'],['Beta','43']]}});await page.reload();await expect(page.getByRole('table',{name:'Current table excerpt'})).toContainText('Alpha');await expect(page.getByRole('table',{name:'Current table excerpt'})).toContainText('42');
 await page.screenshot({path:`/home/deploy/kanvas-root-feedback-20261016-visuals/${test.info().project.name}-overview-table.png`});
 await publishPrepared(page,s,[d.id],{version:1,template:'flowchart',title:'Live diagram preview',data:{nodes:[{id:'one',label:'Begin',shape:'terminal'},{id:'two',label:'Decide',shape:'decision'}],edges:[{from:'one',to:'two'}]}});await page.reload();await expect(page.locator('.overview-diagram')).toContainText('Begin');await expect(page.locator('.overview-diagram .decision')).toHaveText('Decide');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:`/home/deploy/kanvas-root-feedback-20261016-visuals/${test.info().project.name}-overview.png`});
 await page.goto('/console');await expect(page.locator('.workspace')).toBeVisible();
});
test('empty overview is agent-first and never loads executable preview content',async({page})=>{
 await register(page);await page.goto('/');await expect(page.getByRole('heading',{name:'Give your conversation a canvas.'})).toBeVisible();await expect(page.getByRole('link',{name:'Connect your agent'})).toBeVisible();
 await page.goto('/console');await expect(page.locator('.workspace')).toBeVisible();
 const s=await createSession(page,'Untrusted title'),d=await createDisplay(page,s,'Safe display');await publishPrepared(page,s,[d.id],{version:1,template:'fact',title:'<img src=x onerror=alert(1)>',data:{text:'<script>bad()</script>'}});
 await page.goto('/');await expect(page.locator('.overview-preview').getByText('<img src=x onerror=alert(1)>',{exact:true})).toBeVisible();await expect(page.locator('.overview-preview img,.overview-preview script,.overview-preview iframe')).toHaveCount(0);
});
test('legacy console host root stays workspace while explicit overview keeps the same origin',async({page})=>{
 await register(page);
 await page.route('**/api/start?offset=*',async route=>{const response=await route.fetch(),body=await response.json();body.data.consoleUrl=new URL('/',route.request().url()).href;await route.fulfill({response,json:body});});
 await page.goto('/');await expect(page.locator('.workspace')).toBeVisible();
 await page.goto('/?overview=1');await expect(page.locator('.account-overview')).toBeVisible();await expect(page.getByRole('heading',{name:'Your sessions',exact:true})).toBeAttached();await expect(page.getByRole('heading',{name:'Give your conversation a canvas.'})).toBeVisible();await page.unrouteAll({behavior:'wait'});
});

test('compact root cards paginate 51 sessions, preserve extra display links and refresh automatically',async({page})=>{
 await register(page);
 for(let i=0;i<51;i++)await createSession(page,`Root feedback session ${String(i).padStart(2,'0')}`);
 const all=(await sessionApi<any>(page,'/api/start')).data;
 const s=all.sessions[0].id;
 const extra=await createDisplay(page,s,'Secondary display');
 const d=await createDisplay(page,s,'Primary display');
 await publishPrepared(page,s,[d.id],{version:1,template:'fact',title:'Recognizable preview',data:{text:'A current visual'}});
 await page.goto('/');
 await expect(page.locator('.overview-session')).toHaveCount(50);
 await expect(page.getByRole('navigation',{name:'Session pages'})).toContainText('1–50 of 51');
 await expect(page.getByRole('button',{name:'Previous',exact:true})).toBeDisabled();
 await expect(page.locator('.overview-intro, .account-overview>footer')).toHaveCount(0);
 const card=page.locator('.overview-session').filter({has:page.getByRole('heading',{name:all.sessions[0].name,exact:true})});
 await expect(card.getByRole('link',{name:'Secondary display',exact:true})).toHaveAttribute('href',new RegExp(`/view/${s}/${extra.id}$`));
 const primary=card.getByRole('link',{name:`Open Primary display in ${all.sessions[0].name}`,exact:true});
 await expect(primary).toHaveAttribute('href',new RegExp(`/view/${s}/${d.id}$`));
 const layout=await page.locator('.overview-session').evaluateAll(cards=>cards.slice(0,2).map(card=>{const r=card.getBoundingClientRect();const head=card.querySelector('header')!.getBoundingClientRect();const preview=card.querySelector('.overview-displays')!.getBoundingClientRect();return {x:r.x,y:r.y,headX:head.x,previewX:preview.x};}));
 expect(layout[0].headX).toBeGreaterThan(layout[0].previewX);
 if(page.viewportSize()!.width>760){expect(layout[0].y).toBe(layout[1].y);expect(layout[1].x).toBeGreaterThan(layout[0].x);}else{expect(layout[0].x).toBe(layout[1].x);expect(layout[1].y).toBeGreaterThan(layout[0].y);}
 expect((await card.locator('.overview-preview').boundingBox())!.height).toBe(90);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:`/home/deploy/kanvas-root-feedback-20261016-visuals/${test.info().project.name}-50-sessions.png`});
 await primary.click();await expect(page.locator('.viewer-shell')).toBeVisible();
 await page.goto('/');await page.getByRole('button',{name:'Next',exact:true}).click();
 await expect(page.locator('.overview-session')).toHaveCount(1);await expect(page.getByRole('navigation',{name:'Session pages'})).toContainText('51–51 of 51');await expect(page.getByRole('button',{name:'Next',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Previous',exact:true}).click();await expect(page.locator('.overview-session')).toHaveCount(50);
 await page.clock.install();
 await publishPrepared(page,s,[d.id],{version:1,template:'fact',title:'Refreshed without footer',data:{text:'New current content'}});
 const refresh=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/start');
 await page.clock.fastForward(30001);await refresh;
 await expect(page.locator('.overview-preview').getByText('Refreshed without footer',{exact:true})).toBeVisible();
});
