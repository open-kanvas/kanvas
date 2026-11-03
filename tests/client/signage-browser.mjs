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

 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>window.showSigns({items:[{id:'directory',type:'building-directory',directory:{layout:'building',entries:[{id:'dentist',name:'Dentist',floor:'2',room:'204',direction:'right'},{id:'studio',name:'Studio',floor:'3',room:'301',direction:'left'}]}}]}));
 await page.locator('[data-tenant-id="dentist"]').waitFor();assert.equal(await page.getByText('204',{exact:true}).count(),1);
 await page.screenshot({path:'/home/deploy/kanvas-20261102-evidence/k/k2-directory-phone.png'});
 await page.evaluate(()=>window.showSigns({items:[{id:'wifi',type:'wifi',wifi:{ssid:'Guest;room',security:'WPA',password:'fixture-only-password'}}]}));
 await page.locator('.sign-wifi img').waitFor();assert.equal(await page.getByText('fixture-only-password',{exact:true}).count(),0);
 assert.ok((await page.locator('.sign-wifi img').getAttribute('src')).startsWith('data:image/png'));
 await page.screenshot({path:'/home/deploy/kanvas-20261102-evidence/k/k2-wifi-phone.png'});
 await page.evaluate(()=>window.showSigns({items:[{id:'map',type:'you-are-here',map:{youAreHere:{x:50,y:80},areas:[{id:'room',label:'Room A',x:10,y:10,width:35,height:40}]}}]}));
 await page.locator('.you-are-here').waitFor();assert.equal(await page.locator('.sign-map rect').count(),1);
 await page.evaluate(()=>window.showSigns({items:[{id:'countdown',type:'live-countdown',endsAt:new Date(Date.now()+3000).toISOString()}]}));
 await page.waitForFunction(()=>document.querySelector('.sign-value')?.textContent==='0',{},{timeout:6000});
 assert.deepEqual(errors,[]);console.log('PASS rich directory/Wi-Fi/map/countdown; ',count,'single sign/viewport cases, 3 grouped visual-only layouts,13 arrows, incremental stable-ID update, no console errors');
}finally{await browser.close();}
