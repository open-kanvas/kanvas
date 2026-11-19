import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {writeFile} from 'node:fs/promises';
import {test,expect,register,createSession,createDisplay,openViewer,publishPrepared,sessionApi,sessionDetail,waitForDisplay} from './support';
test('isolated snapshots apply session scale and bundled bold fonts without inheriting window zoom',async({page,baseURL},info)=>{
 await register(page);const s=await createSession(page,'Snapshot rendering'),d=await createDisplay(page,s,'Capture'),viewer=await openViewer(page,s,d.id);
 await viewer.setViewportSize({width:1280,height:800});
 await publishPrepared(page,s,[d.id],{version:1,template:'code',data:{kind:'code',language:'javascript',code:'// Snapshot text scale\nconst amount = 42;\nfunction total(value) {\n  return value * 2;\n}\nconsole.log(total(amount));'}});
 await waitForDisplay(page,s,d.id,x=>x.revision>0&&x.appliedRevision===x.revision);
 await viewer.evaluate(()=>document.fonts.ready);expect(await viewer.evaluate(()=>document.fonts.check('700 32px Inter'))).toBe(true);
 const token=(await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Capture render fixture',scopes:['read','publish']})).data!.token;
 const client=new Client({name:'capture-rendering',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token}}}));
 try{
  const captures:Buffer[]=[];let imageUrl='';
  for(const textSize of [100,140]){
   const detail=await sessionDetail(page,s);const configured=await sessionApi(page,'/api/sessions/'+s+'/config','PATCH',{expectedRevision:detail.session.configRevision,config:{textSize}});
   expect(configured.status).toBe(200);
   await expect(viewer.locator('.viewer-candidate .render-surface')).toHaveAttribute('data-text-scale',String(textSize/100));
   const result=await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.display.snapshot',arguments:{sessionId:s,displayId:d.id,width:1280,height:800}}});
   expect(result.isError).not.toBe(true);const data=(result.structuredContent as any).data;expect(data.readiness).toBe('ready');expect(data.appliedTextScale).toBe(textSize/100);expect(data.bundledFontReady).toBe(true);
   imageUrl='/api/assets/'+data.assetId;const response=await page.request.get(imageUrl);expect(response.ok()).toBe(true);const bytes=await response.body();captures.push(bytes);await writeFile(info.outputPath('snapshot-'+textSize+'.jpg'),bytes);
   await writeFile(info.outputPath('snapshot-'+textSize+'.json'),JSON.stringify(data,null,2));
   await viewer.screenshot({path:info.outputPath('live-'+textSize+'.png'),animations:'disabled'});
  }
  expect(captures[0].equals(captures[1])).toBe(false);
  await publishPrepared(page,s,[d.id],{version:1,template:'html',data:{html:'<article><h1>Bold Inter 800</h1><p>Visible positioned HTML in the actual server capture</p></article>',css:'article{position:fixed;inset:0;padding:48px;background:#123456;color:white}h1{font:800 56px Inter,sans-serif}p{font:400 24px Inter,sans-serif}',description:'Bold HTML capture proof'}});
  await expect(viewer.frameLocator('.viewer-candidate iframe.custom-visual').getByRole('heading',{name:'Bold Inter 800'})).toBeVisible();
  await waitForDisplay(page,s,d.id,x=>x.view?.template==='html'&&x.appliedRevision===x.revision);
  const htmlResult=await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.display.snapshot',arguments:{sessionId:s,displayId:d.id,width:1280,height:800}}});
  expect(htmlResult.isError).not.toBe(true);const htmlData=(htmlResult.structuredContent as any).data;expect(htmlData.readiness).toBe('ready');expect(htmlData.bundledFontReady).toBe(true);
  await writeFile(info.outputPath('actual-bold-html.jpg'),await (await page.request.get('/api/assets/'+htmlData.assetId)).body());
  await writeFile(info.outputPath('bold-html-metadata.json'),JSON.stringify(htmlData,null,2));await viewer.screenshot({path:info.outputPath('live-bold-html.png'),animations:'disabled'});
  await publishPrepared(page,s,[d.id],{version:1,template:'image',data:{images:[{url:imageUrl,alt:'Full snapshot frame'}]}});
  const img=viewer.locator('.viewer-candidate .image-grid img');await expect(img).toBeVisible();
  const raised=await img.boundingBox(),detail=await sessionDetail(page,s);
  expect((await sessionApi(page,'/api/sessions/'+s+'/config','PATCH',{expectedRevision:detail.session.configRevision,config:{textSize:100}})).status).toBe(200);
  await expect(viewer.locator('.viewer-candidate .render-surface')).toHaveAttribute('data-text-scale','1');
  const normal=await img.boundingBox();expect(Math.abs(raised!.width-normal!.width)).toBeLessThan(1);expect(Math.abs(raised!.height-normal!.height)).toBeLessThan(1);
  await viewer.screenshot({path:info.outputPath('image-fit-independent-of-text-scale.png'),animations:'disabled'});
 }finally{await client.close();}
});
