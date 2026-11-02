import {randomUUID} from 'node:crypto';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {operationRequest} from '../mcp/requests.js';
import {createDisplay,createSession,expect,openViewer,publishPrepared,register,sessionApi,test,waitForDisplay} from './support';
test('one scheduled submission rolls, pauses, appends and reconnects without changing transcription',async({page,baseURL},info)=>{
 await register(page);const sessionId=await createSession(page,'Captions'),display=await createDisplay(page,sessionId,'Caption screen'),viewer=await openViewer(page,sessionId,display.id);
 const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Captions test',scopes:['read','publish']});expect(issued.status).toBe(201);
 const client=new Client({name:'captions-test',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${issued.data!.token}`}}}));
 const read=async()=>{const r=await client.callTool(operationRequest({name:'kanvas_inspect',arguments:{operation:'display.current',sessionId,displayId:display.id}}));expect(r.isError).not.toBe(true);return (r.structuredContent as any).data;};
 const patch=async(operations:unknown[])=>{const current=await read();const r=await client.callTool(operationRequest({name:'kanvas_publish',arguments:{operation:'patch',sessionId,displayId:display.id,expectedRevision:current.revision,requestId:randomUUID(),operations}}));expect(r.isError,JSON.stringify(r)).not.toBe(true);await waitForDisplay(page,sessionId,display.id,d=>d.appliedRevision===d.revision);};
 try {
 await publishPrepared(page,sessionId,[display.id],{version:1,template:'live-captions',data:{chunks:[{id:'one',text:'These words should be large enough to read from across the room.',durationMs:1500},{id:'two',text:'The next thought arrives without another network request.',durationMs:6000},{id:'three',text:'Recent words remain above for slower readers.',durationMs:2000}],playback:{state:'playing',positionMs:0,startedAt:new Date().toISOString()}}});
 const captions=viewer.locator('.live-captions');await expect(captions).toHaveAttribute('data-active-id','two');await expect(captions.locator('.caption-current')).toContainText('next thought');await expect(captions.locator('.caption-recent')).toContainText('across the room');
 expect(await captions.locator('.caption-current').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(28);
 await patch([{op:'sequence',action:'pause'}]);expect((await read()).sequenceStatus.phase).toBe('paused');await expect(captions).toHaveAttribute('data-phase','paused');
 await viewer.screenshot({path:info.outputPath('captions-paused.png')});await viewer.reload();await expect(captions).toHaveAttribute('data-active-id','two');
 await patch([{op:'sequence',action:'replace-future',chunks:[{id:'four',text:'A revised future thought.',durationMs:2000}]},{op:'sequence',action:'seek',positionMs:7500}]);await expect(captions).toHaveAttribute('data-active-id','four');
 await patch([{op:'sequence',action:'clear'}]);await expect(captions.locator('p')).toHaveCount(0);
 await publishPrepared(page,sessionId,[display.id],{version:1,template:'transcription',data:{segments:[{id:'archive',text:'Complete archive remains available.',speaker:'Reader'}],status:'complete'}});await expect(viewer.locator('.transcription-content')).toContainText('Complete archive');
 } finally {await client.close();}
});
