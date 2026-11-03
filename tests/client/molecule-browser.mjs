import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push(m.text());});
 await page.goto('http://127.0.0.1:8809/tests/fixtures/molecule.html');
 await page.locator('[data-atom-id="a0"]').waitFor();
 for(const viewport of [{width:1280,height:800},{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(viewport);
  for(const id of await page.evaluate(()=>Object.keys(window.molecules))){
   await page.evaluate(id=>window.showMolecule({libraryId:id}),id);
   await page.waitForFunction(id=>document.querySelector('figcaption strong')?.textContent===window.molecules[id].name,id);
   const metrics=await page.evaluate(()=>{
    const svg=document.querySelector('svg'),r=svg.getBoundingClientRect();
    const boxes=[...svg.querySelectorAll('[data-atom-id]')].map(a=>a.getBoundingClientRect());
    return {overflow:document.documentElement.scrollWidth>innerWidth,outside:boxes.some(b=>b.left<r.left-1||b.right>r.right+1||b.top<r.top-1||b.bottom>r.bottom+1),height:r.height};
   });
   assert.equal(metrics.overflow,false,id);assert.equal(metrics.outside,false,id);assert.ok(metrics.height>200,id);
  }
  await page.evaluate(()=>window.showMolecule({libraryId:'ethanol-v1',highlightAtoms:['a2','a3'],highlightBonds:['b2']}));
  await page.locator('[data-atom-id="a2"].is-highlighted').waitFor();
  assert.equal(await page.locator('[data-bond-id="b2"].is-highlighted').count(),1);
  await page.screenshot({path:'/home/deploy/kanvas-20261102-evidence/h/ethanol-'+viewport.width+'.png'});
 }
 await page.evaluate(()=>{window.atomBefore=document.querySelector('[data-atom-id="a0"]');window.showMolecule({libraryId:'ethanol-v1',highlightAtoms:['a1'],viewport:{zoom:1,focusAtoms:['a1','a2']}});});
 await page.locator('[data-atom-id="a1"].is-highlighted').waitFor();
 assert.equal(await page.evaluate(()=>window.atomBefore===document.querySelector('[data-atom-id="a0"]')),true,'incremental changes preserve stable DOM atom identity');
 await page.evaluate(()=>window.showMolecule({structure:{name:'Supplied test ion',provenance:{source:'Test fixture supplied externally',identity:'Fixture ion',license:'CC0-1.0',accuracy:'Schematic test only'},atoms:[{id:'ion',element:'Na',charge:1,x:12,y:20}],bonds:[]}}));
 await page.locator('[data-atom-id="ion"]').waitFor();
 assert.equal(await page.locator('[data-atom-id]').count(),1);
 assert.deepEqual(errors,[]);
 console.log('PASS: 25 seeds x 3 viewports; no clipping/overflow; OH highlights; stable DOM update; external structure; no browser errors');
}finally{await browser.close();}
