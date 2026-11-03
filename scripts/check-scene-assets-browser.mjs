import {chromium} from '@playwright/test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.KANVAS_SCENE_BASE??'http://127.0.0.1:8810',out=process.env.KANVAS_SCENE_EVIDENCE??'/home/deploy/kanvas-20261102-evidence/i',catalog=JSON.parse(readFileSync('public/scene-assets/manifest.json','utf8'));
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();const errors=[],requests=[];page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>requests.push(r.url()));
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.goto(base+'/tests/client/scene3d-browser.html');await page.locator('[data-scene-object]').first().waitFor();assert.equal(await page.locator('html').getAttribute('data-scene-fixture'),'scene3d-assets-v1','Correct isolated source fixture');
  for(const asset of catalog){
   const start=Date.now();const factor=5/Math.max(...asset.sourceBounds.size),size=asset.sourceBounds.size.map(n=>n*factor);await page.evaluate(({id,size})=>window.showScene({objects:{model:{label:id,assetId:id,size}},camera:{position:[6,4,7],target:[0,0,0],focus:{objectId:'model'}}}),{id:asset.id,size});
   await page.locator('[data-asset-status="Ready"]').waitFor();await page.waitForTimeout(100);assert(await page.evaluate(()=>window.sceneReady&&!window.sceneFailed),'Delivery readiness follows actual rendered frame');
   assert(await page.locator('canvas').count()===1);assert.equal(Number(await page.locator('canvas').getAttribute('data-rendered-triangles')),asset.triangles,'Every source model triangle must be submitted, not just loaded');console.log(JSON.stringify({asset:asset.id,width,loadAndRenderMs:Date.now()-start,bytes:asset.bytes}));
   await page.screenshot({path:`${out}/${asset.id}-${width}.png`});
  }
  await page.evaluate(()=>window.showScene({objects:{car:{label:'Sedan',assetId:'kenney-sedan',size:[1.8,1.5,4.2],parts:{'wheel-front-left':{highlight:true},body:{visible:false}}}},camera:{focus:{objectId:'car',part:'wheel-front-left'},position:[6,4,7],target:[0,0,0]}}));
  await page.locator('[data-asset-status="Ready"]').waitFor();await page.waitForTimeout(100);assert(await page.evaluate(()=>window.sceneReady&&!window.sceneFailed),'Delivery readiness follows actual rendered frame');await page.screenshot({path:`${out}/parts-focused-${width}.png`});
  await page.evaluate(()=>{window.previousCanvas=document.querySelector('canvas');window.showScene({objects:{car:{label:'Sedan',assetId:'kenney-sedan',size:[1.8,1.5,4.2],parts:{'wheel-front-left':{highlight:true}}}},camera:{mode:'overhead',span:7,target:[0,0,0]}});});
  await page.locator('[data-asset-status="Ready"]').waitFor();await page.waitForTimeout(100);assert(await page.evaluate(()=>window.sceneReady&&!window.sceneFailed),'Delivery readiness follows actual rendered frame');assert(await page.evaluate(()=>window.previousCanvas===document.querySelector('canvas')));await page.screenshot({path:`${out}/asset-overhead-${width}.png`});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 await page.reload();await page.locator('[data-scene-object]').first().waitFor();
 await page.route('**/scene-assets/sedan.glb',route=>route.fulfill({status:503,body:'Unavailable'}));
 await page.evaluate(()=>window.showScene({objects:{car:{label:'Sedan',assetId:'kenney-sedan',size:[1.8,1.5,4.2]}}}));
 await page.waitForFunction(()=>window.sceneFailed===true);assert(await page.evaluate(()=>window.sceneReady===false),'Failed model must not acknowledge ready');
 await page.unroute('**/scene-assets/sedan.glb');await page.reload();await page.locator('[data-scene-object]').first().waitFor();
 await page.evaluate(()=>window.showScene({objects:{car:{label:'Sedan',assetId:'kenney-sedan',size:[1.8,1.5,4.2]}}}));await page.locator('[data-asset-status="Ready"]').waitFor();
 await page.evaluate(()=>document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());await page.waitForFunction(()=>window.sceneFailed===true);
 assert.deepEqual(errors,[]);assert(requests.filter(u=>/^https?:/.test(u)).every(u=>u.startsWith(base)),'No live third-party asset requests');console.log('PASS: eight real models, two sizes, verified parts/focus, overhead, stable canvas, local-only requests, failed-load readiness and context-loss reporting.');
}finally{await browser.close();}
