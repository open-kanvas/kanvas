import {expect,test,register,sessionApi,openViewer,publishPrepared,waitForDisplay} from './support';
import {randomUUID} from 'node:crypto';
test('signed-in root registers a receiver and opens the ready default display without a prior join',async({page})=>{
 await register(page);await page.goto('/');await expect(page.locator('.workspace')).toBeVisible();
 let device:any,window:any;
 await expect.poll(async()=>{const result:any=await sessionApi(page,'/api/devices');device=result.data?.devices?.find((d:any)=>d.windows.some((w:any)=>w.connected));window=device?.windows.find((w:any)=>w.connected);return Boolean(window);}).toBe(true);
 const created:any=await sessionApi(page,'/api/sessions','POST',{name:'Immediate ready screen'});expect(created.status).toBe(200);expect(created.data.displays).toHaveLength(1);const display=created.data.displays[0];
 // Present intentionally navigates this same page; observe HTTP success
 // outside its old JavaScript context and never resend the mutation.
 const path=`/api/devices/${device.id}/windows/${window.id}/present`,response=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST');
 const presenting=sessionApi(page,path,'POST',{sessionId:created.data.id,displayId:display.id,expectedVersion:window.version,requestId:randomUUID()}).catch(error=>{if(!/Execution context was destroyed/.test(String(error)))throw error;});
 expect((await response).status()).toBe(200);await presenting;
 await expect(page).toHaveURL(new RegExp(`/view/${created.data.id}/${display.id}$`));await expect(page.locator('.viewer-shell')).toBeVisible();
});
test('checked items persist after other content, then recall on another display with account details recipe',async({page},info)=>{
 await register(page);const created:any=await sessionApi(page,'/api/sessions','POST',{name:'Checklist memory'}),sessionId=created.data.id,display=created.data.displays[0],viewer=await openViewer(page,sessionId,display.id);
 await publishPrepared(page,sessionId,[display.id],{version:1,template:'checklist',title:'Release work',showTitle:true,data:{items:[{id:'a',text:'Review the release',checked:false},{id:'b',text:'Run tests',checked:false}]}});
 await expect(viewer.getByRole('checkbox',{name:'Review the release'})).toBeVisible();await viewer.getByRole('checkbox',{name:'Review the release'}).click();await expect(viewer.getByRole('checkbox',{name:'Review the release'})).toBeChecked();
 const checked=await waitForDisplay(page,sessionId,display.id,d=>(d.view?.data.items as any[])?.[0]?.checked===true),key=checked.view!.data.checklistId;
 await publishPrepared(page,sessionId,[display.id],{version:1,template:'fact',data:{text:'A different topic'}});await expect(viewer.getByText('A different topic',{exact:true})).toBeVisible();
 const second:any=await sessionApi(page,`/api/sessions/${sessionId}/displays`,'POST',{name:'Second',width:1000,height:700}),saved:any=await sessionApi(page,`/api/sessions/${sessionId}/checklists/${key}`);expect(saved.data.view.data.items[0].checked).toBe(true);
 const shown=await sessionApi(page,`/api/sessions/${sessionId}/checklists/${key}/show`,'POST',{displayId:second.data.id,expectedRevision:0,requestId:randomUUID()});expect(shown.status).toBe(200);
 const secondViewer=await openViewer(page,sessionId,second.data.id);await expect(secondViewer.getByRole('checkbox',{name:'Review the release'})).toBeChecked();await secondViewer.reload();await expect(secondViewer.getByRole('checkbox',{name:'Review the release'})).toBeChecked();
 await secondViewer.screenshot({path:info.outputPath('persistent-checklist.png'),animations:'disabled'});
 const account:any=await sessionApi(page,'/api/account/details');expect(account.data.tier).toBe('trial');await publishPrepared(page,sessionId,[second.data.id],account.data.publishRecipe.view);await expect(secondViewer.getByText('Your Kanvas account',{exact:true})).toBeVisible();await expect(secondViewer.getByText('Plan / quota tier',{exact:true})).toBeVisible();
 await secondViewer.screenshot({path:info.outputPath('account-details.png'),animations:'disabled'});
});
