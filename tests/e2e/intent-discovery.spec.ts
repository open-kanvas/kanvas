import {writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {test,expect,register,createSession,createDisplay,publishPrepared,sessionApi} from './support';
test('intent discovery reduces measured filter round trips and paints the correct source rows',async({page},info)=>{
 await register(page);const sessionId=await createSession(page,'Intent discovery'),d=await createDisplay(page,sessionId,'Log');
 const view={version:1 as const,template:'log' as const,data:{entries:[{level:'info',message:'NORMAL_SOURCE_ROW'},{level:'error',message:'ERROR_SOURCE_ROW'}]}};
 await publishPrepared(page,sessionId,[d.id],view);await page.goto('/view/'+sessionId+'/'+d.id);
 const surface=page.locator('.viewer-candidate');await expect(surface).toContainText('NORMAL_SOURCE_ROW');await expect(surface).toContainText('ERROR_SOURCE_ROW');
 const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable discovery measurement',scopes:['read','publish']});expect(issued.status).toBe(201);
 const client=new Client({name:'discovery-paint-measurement',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',page.url()),{requestInit:{headers:{Authorization:'Bearer '+issued.data!.token}}}));
 const measurements:any[]=[];
 const dismissNotices=async()=>{for(const button of await page.locator('.viewer-toast button').all())await button.click();};
 await dismissNotices();
 try{
  for(const mode of ['get-search-state','resolve']){
   if(mode==='resolve'){await publishPrepared(page,sessionId,[d.id],view);await expect(surface).toContainText('NORMAL_SOURCE_ROW');}
   let discoveryCalls=0,executionCalls=0,validationFailures=0;
   const call=async(name:string,args:any)=>{if(name==='kanvas_discover')discoveryCalls++;else executionCalls++;const r=await client.callTool({name,arguments:args});if(r.isError)validationFailures++;expect(r.isError,JSON.stringify(r)).not.toBe(true);return (r.structuredContent as any)?.data;};
   await dismissNotices();
   const start=performance.now();let execution:any;
   if(mode==='resolve'){
    const resolved=await call('kanvas_discover',{catalog:'operations',action:'resolve',query:'show only errors in this log',activeContext:{sessionId},displayId:d.id});
    expect(resolved.status).toBe('ready');expect(resolved.operationId).toBe('kanvas.selection.set');execution=await call(resolved.call.tool,resolved.call.arguments);
   }else{
    const found=await call('kanvas_discover',{catalog:'operations',action:'search',query:'filter log errors'});expect(found.results.some((r:any)=>r.id==='kanvas.selection.set')).toBe(true);
    await call('kanvas_discover',{catalog:'operations',action:'get',id:'kanvas.selection.set'});
    const current=await call('kanvas_call',{operationId:'kanvas.display.current',arguments:{sessionId,displayId:d.id}});
    execution=await call('kanvas_call',{operationId:'kanvas.selection.set',arguments:{sessionId,displayId:d.id,expectedRevision:current.display?.revision??current.revision,requestId:randomUUID(),selection:{where:[{field:'level',op:'eq',value:'error'}]}}});
   }
   const acceptedMs=performance.now()-start;
   await expect(surface).toContainText('ERROR_SOURCE_ROW');await expect(surface).not.toContainText('NORMAL_SOURCE_ROW');
   await dismissNotices();await expect(page.locator('.viewer-shell')).toHaveAttribute('data-render-status','ready');await expect(surface.locator('.log-line pre')).toBeVisible();
   await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
   const paintedMs=performance.now()-start;
   expect(validationFailures).toBe(0);expect(discoveryCalls+executionCalls).toBe(mode==='resolve'?2:4);
   measurements.push({mode,discoveryCalls,executionCalls,validationFailures,acceptedMs,paintedMs,correctOperation:true,visibleErrorRow:true,hiddenInfoRow:true});
  }
  await dismissNotices();await page.screenshot({path:info.outputPath('resolved-filter.png')});
  const zoom=await client.callTool({name:'kanvas_discover',arguments:{catalog:'operations',action:'resolve',query:'zoom in',sessionId,displayId:d.id}});
  const resolvedZoom=(zoom.structuredContent as any).data;expect(resolvedZoom.status).toBe('ready');expect(resolvedZoom.arguments.viewerId).toBeTruthy();
  const appliedZoom=await client.callTool({name:resolvedZoom.call.tool,arguments:resolvedZoom.call.arguments});expect(appliedZoom.isError).not.toBe(true);
  await expect.poll(()=>page.locator('.render-surface').first().evaluate(el=>Number(getComputedStyle(el).zoom))).toBeGreaterThan(1);
  const sibling=await page.context().newPage();
  try{
   await sibling.goto(page.url());await expect(sibling.locator('.viewer-candidate')).toContainText('ERROR_SOURCE_ROW');
   await expect.poll(async()=>{const r=await client.callTool({name:'kanvas_discover',arguments:{catalog:'operations',action:'resolve',query:'zoom in',sessionId,displayId:d.id}});return (r.structuredContent as any).data.status;}).toBe('needs_input');
  }finally{await sibling.close();}
  await writeFile(info.outputPath('discovery-measurements.json'),JSON.stringify({project:info.project.name,measurements,note:'Single local sample per workflow; DOM verification plus two animation frames, not physical display measurement or statistical speed claim.'},null,2));
 }finally{await client.close();}
});

