import assert from 'node:assert/strict';import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true}),errors=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
 await page.goto('http://127.0.0.1:8813/tests/fixtures/signage.html');await page.locator('[data-sign-id]').waitFor();
 let count=0;
 for(const size of [{width:1280,height:800},{width:390,height:844},{width:700,height:700}]){
  await page.setViewportSize(size);
  for(const type of await page.evaluate(()=>window.signCatalog.map(x=>x.id))){
   await page.evaluate(type=>window.showSigns({items:[{id:'one',type}]}),type);await page.waitForFunction(type=>document.querySelector('[data-sign-type]')?.getAttribute('data-sign-type')===type,type);
   const fit=await page.evaluate(()=>{const card=document.querySelector('.signage-card');return {overflow:card.scrollHeight>card.clientHeight+2||card.scrollWidth>card.clientWidth+2,page:document.documentElement.scrollWidth>innerWidth};});
   assert.equal(fit.overflow,false,type);assert.equal(fit.page,false,type);count++;
  }
  await page.evaluate(()=>window.showSigns({text:'none',items:['restroom-men','restroom-women','restroom-unisex','restroom-accessible','baby-care','restroom'].map((type,i)=>({id:'i'+i,type,direction:window.signDirections[i]}))}));
  await page.waitForFunction(()=>document.querySelectorAll('[data-sign-id]').length===6);
  assert.equal(await page.locator('.signage-card h2').count(),0);
  await page.screenshot({path:'/home/deploy/kanvas-20261102-evidence/k/k1-group-'+size.width+'.png'});
 }
 for(const direction of await page.evaluate(()=>window.signDirections)){
  await page.evaluate(direction=>window.showSigns({items:[{id:'one',type:'exit',direction}]}),direction);await page.locator('.sign-arrow[aria-label="'+direction+'"]').waitFor();
 }
 await page.evaluate(()=>{window.oldSign=document.querySelector('[data-sign-id="one"]');window.showSigns({items:[{id:'one',type:'exit',direction:'left',caption:'Supplied live caption'}]});});await page.getByText('Supplied live caption').waitFor();
 assert.equal(await page.evaluate(()=>window.oldSign===document.querySelector('[data-sign-id="one"]')),true);
 assert.deepEqual(errors,[]);console.log('PASS',count,'single sign/viewport cases, 3 grouped visual-only layouts,13 arrows, incremental stable-ID update, no console errors');
}finally{await browser.close();}
