import {createDisplay,createSession,expect,publishPrepared,register,sessionApi,test} from './support';
test('root has safe nested previews and the same live tab can return from a display to overview',async({page})=>{
 await register(page);const s=await createSession(page,'Overview acceptance'),d=await createDisplay(page,s,'Current display');
 await publishPrepared(page,s,[d.id],{version:1,template:'fact',title:'A current preview',data:{text:'42 · Current answer'}});
 await page.goto('/');await expect(page.getByRole('heading',{name:'Your sessions',exact:true})).toBeVisible();await expect(page.locator('.overview-preview').getByText('A current preview',{exact:true})).toBeVisible();await expect(page.getByText('This window is ready for your agent.')).toBeVisible();
 const sessionsBefore=(await sessionApi<any>(page,'/api/sessions')).data.length;
 await page.getByRole('link',{name:'Open Current display in Overview acceptance'}).click();await expect(page.locator('.viewer-shell')).toBeVisible();
 const inventory=()=>sessionApi<any>(page,'/api/devices');
 await expect.poll(async()=>{const devices=(await inventory()).data.devices;return devices.some((device:any)=>device.windows.some((w:any)=>w.connected&&w.current?.displayId===d.id));}).toBe(true);
 const devices=(await inventory()).data.devices,device=devices.find((device:any)=>device.windows.some((w:any)=>w.current?.displayId===d.id)),window=device.windows.find((w:any)=>w.current?.displayId===d.id);
 const path=`/api/devices/${device.id}/windows/${window.id}/overview`,response=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST');
 const navigating=sessionApi<any>(page,path,'POST',{expectedVersion:window.version,requestId:crypto.randomUUID()}).catch(error=>{if(!/Execution context was destroyed/.test(String(error)))throw error;});expect((await response).status()).toBe(200);await navigating;
 await expect(page).toHaveURL(/\/$/);await expect(page.getByRole('heading',{name:'Your sessions',exact:true})).toBeVisible();
 await expect.poll(async()=>{const current=(await inventory()).data.devices.find((x:any)=>x.id===device.id).windows.find((x:any)=>x.id===window.id);return current.command?.status;}).toBe('applied');
 const current=(await inventory()).data.devices.find((x:any)=>x.id===device.id).windows.find((x:any)=>x.id===window.id);expect(current.current).toBeUndefined();expect((await sessionApi<any>(page,'/api/sessions')).data.length).toBe(sessionsBefore);
 await publishPrepared(page,s,[d.id],{version:1,template:'table',title:'Live table preview',data:{columns:['Name','Value'],rows:[['Alpha','42'],['Beta','43']]}});await page.reload();await expect(page.getByRole('table',{name:'Current table excerpt'})).toContainText('Alpha');await expect(page.getByRole('table',{name:'Current table excerpt'})).toContainText('42');
 await page.screenshot({path:`/home/deploy/kanvas-feedback-20261014-visuals/${test.info().project.name}-overview-table.png`});
 await publishPrepared(page,s,[d.id],{version:1,template:'flowchart',title:'Live diagram preview',data:{nodes:[{id:'one',label:'Begin',shape:'terminal'},{id:'two',label:'Decide',shape:'decision'}],edges:[{from:'one',to:'two'}]}});await page.reload();await expect(page.locator('.overview-diagram')).toContainText('Begin');await expect(page.locator('.overview-diagram .decision')).toHaveText('Decide');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:`/home/deploy/kanvas-feedback-20261014-visuals/${test.info().project.name}-overview.png`});
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
 await page.goto('/?overview=1');await expect(page.locator('.account-overview')).toBeVisible();await expect(page.getByRole('heading',{name:'Your sessions',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Give your conversation a canvas.'})).toBeVisible();await page.unrouteAll({behavior:'wait'});
});
