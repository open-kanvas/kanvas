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
  const first=await call('kanvas.submit',{sessionId,displayIds:[displayId],requestId:'ack-submit',view:{version:1,template:'fact',data:{text:'Real browser acknowledgement'}}});
  expect(first.data.delivery[displayId]).toMatchObject({status:'applied',revision:1});expect(first.rhythm).toMatch(/^On screen/);expect(first.firstContact).toBeUndefined();
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision','1');
  const patch=await call('kanvas.view.patch',{sessionId,displayId,requestId:'ack-patch',expectedRevision:1,operations:[{op:'set',path:'/data/text',value:'Confirmed patch'}]});
  expect(patch.data.delivery[displayId]).toMatchObject({status:'applied',revision:2});await expect(viewer.locator('.viewer-candidate')).toContainText('Confirmed patch');
  const tasks=await call('kanvas.submit',{sessionId,displayIds:[displayId],requestId:'ack-tasks',view:{version:1,template:'task-list',data:{items:[{id:'one',title:'Task one'}]}}});expect(tasks.data.delivery[displayId].status).toBe('applied');
  const lists=await call('kanvas.tasklist.read',{sessionId});const updated=await call('kanvas.tasklist.update',{sessionId,taskListId:lists.data.taskLists[0].id,requestId:'ack-check',check:['one']});
  expect(updated.data.delivery[displayId].status).toBe('applied');await expect(viewer.locator('tr[data-task-id="one"]')).toHaveClass(/is-done/);
  // Block only the ack request: visible pixels alone must not fabricate receipt success.
  await viewer.route('**/applied',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{}})}));
  const unconfirmed=await call('kanvas.submit',{sessionId,displayIds:[displayId],requestId:'ack-blocked',view:{version:1,template:'fact',data:{text:'Visible but ack blocked'}}});
  expect(unconfirmed.data.delivery[displayId].status).toBe('timed_out');expect(unconfirmed.rhythm).toBeUndefined();
  await expect(viewer.locator('.viewer-candidate')).toContainText('Visible but ack blocked');
 }finally{await client.close();await viewer.close();}
});
