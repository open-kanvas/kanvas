import {createDisplay,createSession,expect,openViewer,publishPrepared,register,sessionDetail,test,waitForDisplay} from './support';
const pixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=';
test('failed individual image remains a visible placeholder without losing the new view',async({page},info)=>{
 await register(page);const sessionId=await createSession(page,'Image fallback acceptance'),d=await createDisplay(page,sessionId,'Images'),viewer=await openViewer(page,sessionId,d.id);
 await viewer.context().route('https://images.example.test/**',route=>route.fulfill({status:200,contentType:'image/png',body:route.request().url().includes('good')?Buffer.from(pixel,'base64'):Buffer.from('not an image')}));
 await viewer.route('**/image-fallback',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{status:'unavailable',message:'Synthetic source unavailable'}})}));
 await publishPrepared(page,sessionId,[d.id],{version:1,template:'fact',data:{text:'Previous unrelated content'}});
 await waitForDisplay(page,sessionId,d.id,x=>x.appliedRevision===x.revision&&x.revision>0);
 await publishPrepared(page,sessionId,[d.id],{version:1,template:'comparison',data:{items:[{name:'Option One',values:{Price:'10'},image:{url:'https://images.example.test/good.png',alt:'Available photo'}},{name:'Option Two',values:{Price:'20'},image:{url:'https://images.example.test/bad.png',alt:'Unavailable photo'}}],criteria:['Price'],commentary:{Price:'Both options remain visible'}}});
 await expect(viewer.locator('.viewer-candidate .media-unavailable')).toBeVisible();
 await waitForDisplay(page,sessionId,d.id,x=>x.appliedRevision===x.revision&&x.revision>1);
 await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status','ready');
 await expect(viewer.locator('.viewer-candidate')).toContainText('Option One');await expect(viewer.locator('.viewer-candidate')).toContainText('Option Two');
 await expect(viewer.locator('.viewer-last-good')).toHaveCount(0);
 await viewer.screenshot({path:info.outputPath('image-degraded-ready.png'),animations:'disabled'});
});
