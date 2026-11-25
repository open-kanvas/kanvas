import {test,expect,register,createSession,createDisplay,openViewer,sessionApi,waitForDisplay} from './support';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';

test('publish, patch and narrow task updates return actual browser acknowledgements',async({page,baseURL})=>{
 await register(page);const sessionId=await createSession(page,'Bounded ack'),display=await createDisplay(page,sessionId,'Receiver'),displayId=display.id;
 const viewer=await openViewer(page,sessionId,displayId);
 await waitForDisplay(page,sessionId,displayId,d=>d.online);
 const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Ack fixture',scopes:['read','publish']});
 const client=new Client({name:'bounded-ack-fixture',version:'1'});
 await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));
 const call=async(operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});expect(result.isError).not.toBe(true);return result.structuredContent as any;};
 try{
  const first=await call('kanvas.publish',{sessionId,displayIds:[displayId],requestId:'ack-submit',view:{version:1,template:'fact',data:{text:'Real browser acknowledgement'}}});
  expect(first.data.delivery[displayId]).toMatchObject({status:'applied',revision:1});expect(first.rhythm).toMatch(/^On screen/);expect(first.firstContact).toBeUndefined();expect(first.orientation).toBeUndefined();
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision','1');
  const patch=await call('kanvas.view.patch',{sessionId,displayId,requestId:'ack-patch',expectedRevision:1,operations:[{op:'set',path:'/data/text',value:'Confirmed patch'}]});
  expect(patch.data.delivery[displayId]).toMatchObject({status:'applied',revision:2});await expect(viewer.locator('.viewer-candidate')).toContainText('Confirmed patch');
  const tasks=await call('kanvas.publish',{sessionId,displayIds:[displayId],requestId:'ack-tasks',view:{version:1,template:'task-list',data:{items:[{id:'one',title:'Task one'}]}}});expect(tasks.data.delivery[displayId].status).toBe('applied');
  const lists=await call('kanvas.tasklist.read',{sessionId});const updated=await call('kanvas.tasklist.update',{sessionId,taskListId:lists.data.taskLists[0].id,requestId:'ack-check',check:['one']});
  expect(updated.data.delivery[displayId].status).toBe('applied');await expect(viewer.locator('tr[data-task-id="one"]')).toHaveClass(/is-done/);
  const status=await call('kanvas.update.status',{sessionId,requestId:'ack-check'});expect(status.data.id).toBe(updated.data.updateId);expect(status.data.delivery[displayId].status).toBe('applied');
  const table=await call('kanvas.publish',{sessionId,displayIds:[displayId],requestId:'nav-table',view:{version:1,template:'table',data:{columns:['Name'],rows:Array.from({length:40},(_,i)=>({Name:'Row '+i})),pageSize:20}}});
  const revision=table.data.revisions[displayId];
  const nav=await call('kanvas.navigation.control',{sessionId,displayId,requestId:'nav-page',expectedRevision:revision,navigation:{action:'page',page:2}});
  expect(nav.data.viewers.length).toBeGreaterThan(0);expect(nav.data.viewers.every((v:any)=>v.status==='applied')).toBe(true);
  await expect(viewer.locator('.viewer-candidate')).toContainText('Row 20');
  await viewer.route('**/navigation/ack',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{ignored:false}})}));
  const blockedNav=await call('kanvas.navigation.control',{sessionId,displayId,requestId:'nav-blocked',expectedRevision:revision,navigation:{action:'page',page:1}});
  expect(blockedNav.data.viewers.every((v:any)=>v.status==='unconfirmed')).toBe(true);expect(blockedNav.rhythm).toBeUndefined();
  await expect(viewer.locator('.viewer-candidate')).toContainText('Row 0');
  await viewer.unroute('**/navigation/ack');

  const document=await call('kanvas.publish',{sessionId,displayIds:[displayId],requestId:'nav-scroll-document',view:{version:1,template:'document',data:{layout:'reading',text:Array.from({length:80},(_,i)=>'Paragraph '+i+'. A sufficiently long source paragraph that must genuinely scroll in this browser viewport.').join('\n\n')}}});
  const scroll=await call('kanvas.navigation.control',{sessionId,displayId,requestId:'nav-scroll',expectedRevision:document.data.revisions[displayId],navigation:{action:'scroll',y:0.6}});
  expect(scroll.data.viewers.length).toBeGreaterThan(0);expect(scroll.data.viewers.every((v:any)=>v.status==='applied')).toBe(true);
  await expect.poll(()=>viewer.getByRole('region',{name:'Document reader'}).evaluate(el=>el.scrollTop)).toBeGreaterThan(100);

  // Delay a real narrow-change acknowledgement beyond the budget, then release
  // that exact browser request. Status/log correlation must recover without republishing.
  await call('kanvas.publish',{sessionId,displayIds:[displayId],requestId:'late-checklist-seed',view:{version:1,template:'checklist',data:{items:[{id:'late',text:'Late genuine receipt',checked:false}]}}});
  const checklists=await call('kanvas.checklist.read',{sessionId});
  let releaseAck!:()=>void;const heldAck=new Promise<void>(resolve=>{releaseAck=resolve;});let observedAck=false;
  let ackContinued!:()=>void;const continuedAck=new Promise<void>(resolve=>{ackContinued=resolve;});
  await viewer.route('**/applied',async route=>{observedAck=true;await heldAck;await route.continue();ackContinued();});
  const late=await call('kanvas.checklist.update',{sessionId,checklistId:checklists.data.checklists[0].id,requestId:'late-checklist',items:[{id:'late',checked:true}]});
  expect(observedAck).toBe(true);expect(late.data.delivery[displayId].status).toBe('unconfirmed');expect(late.data.updateId).toBeTruthy();
  // Finish the held handler before unroute; removing an active route can handle it twice.
  releaseAck();await continuedAck;await viewer.unroute('**/applied');
  await expect.poll(async()=>{const status=await call('kanvas.update.status',{sessionId,requestId:'late-checklist'});expect(status.data.id).toBe(late.data.updateId);return status.data.delivery[displayId].status;}).toBe('applied');
  const log=await call('kanvas.session.log',{sessionId});
  expect(JSON.stringify(log.data)).toContain(late.data.updateId);expect(JSON.stringify(log.data)).toContain('late-checklist');expect(JSON.stringify(log.data)).toContain('viewer.acknowledged');

  // Block only the ack request: visible pixels alone must not fabricate receipt success.
  await viewer.route('**/applied',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{}})}));
  const unconfirmed=await call('kanvas.publish',{sessionId,displayIds:[displayId],requestId:'ack-blocked',view:{version:1,template:'fact',data:{text:'Visible but ack blocked'}}});
  expect(unconfirmed.data.delivery[displayId].status).toBe('unconfirmed');expect(unconfirmed.rhythm).toBeUndefined();
  await expect(viewer.locator('.viewer-candidate')).toContainText('Visible but ack blocked');
 }finally{await client.close();await viewer.close();}
});
