import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.KANVAS_SCENE_BASE??'http://127.0.0.1:8810',out=process.env.KANVAS_SCENE_EVIDENCE??'/home/deploy/kanvas-20261102-evidence/i';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.goto(base+'/tests/client/scene3d-browser.html');await page.locator('[data-scene-object="C1"]').first().waitFor();
  for(const name of ['room','soccer','harbor'])for(const mode of ['perspective','overhead']){
   await page.evaluate(({name,mode})=>{const d=structuredClone(window.sceneReferences[name]);d.camera.mode=mode;window.showScene(d);},{name,mode});
   await page.waitForTimeout(80);assert(await page.locator('polygon').count()>0);assert(!/NaN|Infinity/.test(await page.locator('svg').innerHTML()));
   await page.screenshot({path:`${out}/${name}-${mode}-${width}.png`});
  }
  await page.evaluate(()=>window.showScene(window.sceneReferences.room));await page.waitForTimeout(80);
  await page.evaluate(()=>{window.retainedFace=document.querySelector('[data-scene-object="C2"]');const d=structuredClone(window.sceneReferences.room);d.objects.C1.position=[2,.4,1];d.objects.C1.rotation=[0,90,0];window.showScene(d);});await page.waitForTimeout(80);
  assert(await page.evaluate(()=>window.retainedFace===document.querySelector('[data-scene-object="C2"]')),'Unchanged object DOM survives a narrow update');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page overflow');
 }
 assert.deepEqual(errors,[]);console.log('PASS: 3 reference scenes × 2 cameras × 2 sizes; stable sibling DOM; no errors/overflow.');
}finally{await browser.close();}
