import assert from 'node:assert/strict';import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true});try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
await page.goto('http://127.0.0.1:8813/tests/fixtures/satisfaction.html');await page.getByRole('button',{name:'Happy',exact:true}).waitFor();
for(const width of [390,700,1280]){await page.setViewportSize({width,height:800});for(const levels of [3,5]){await page.evaluate(levels=>window.showSurvey({surveyId:'q',levels,thankYouSeconds:.5}),levels);await page.waitForFunction(n=>document.querySelectorAll('button').length===n,levels);assert.equal(await page.locator('button').count(),levels);for(const b of await page.locator('button').all()){const box=await b.boundingBox();assert.ok(box.width>=44&&box.height>=44&&box.x>=0&&box.x+box.width<=width);}}}
await page.getByRole('button',{name:'Happy',exact:true}).click();await page.getByRole('status').waitFor();assert.equal(await page.evaluate(()=>window.ratingCalls.length),1);await page.getByRole('button',{name:'Sad',exact:true}).waitFor();await page.getByRole('button',{name:'Sad',exact:true}).click();assert.equal(await page.evaluate(()=>window.ratingCalls.length),2);
await page.evaluate(()=>window.showSurvey({surveyId:'closed',closed:true}));assert.equal(await page.locator('button:enabled').count(),0);
await page.route('**/api/**',route=>route.fulfill({json:{data:{user:{id:'owner',username:'owner'},viewOnly:false,csrfToken:'fixture'}}}));await page.evaluate(()=>window.showKiosk());await page.getByText('Kiosk unavailable',{exact:true}).waitFor();assert.equal(await page.locator('button,a,nav').count(),0);assert.deepEqual(errors,[]);
for(const mode of ['interactive','readonly','wrong-display']){
 const screen=await browser.newPage();const screenErrors=[];screen.on('pageerror',e=>screenErrors.push(String(e)));
 await screen.addInitScript(()=>{window.EventSource=class{constructor(){setTimeout(()=>this.onopen?.({}),20);}addEventListener(){}close(){}};});
 await screen.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;
 const data=path==='/api/auth/me'?{user:{id:'viewer',username:'viewer'},viewOnly:true,interactive:mode!=='readonly',sessionId:'s',displayId:mode==='wrong-display'?'other':'d',csrfToken:'fixture'}:path==='/api/sessions/s'?{session:{id:'s',name:'Fixture'},displays:[{id:'d',sessionId:'s',revision:1,view:{version:1,template:'satisfaction',data:{surveyId:'q'}}}],updates:[],members:[],interactions:[],datasets:[],assets:[]}:{ok:true};return route.fulfill({json:{data}});});
 await screen.goto('http://127.0.0.1:8813/tests/fixtures/satisfaction.html');await screen.waitForFunction(()=>!!window.showKiosk);await screen.evaluate(()=>window.showKiosk());
 if(mode==='interactive'){await screen.getByRole('button',{name:'Happy',exact:true}).waitFor();await screen.getByRole('button',{name:'Happy',exact:true}).click();await screen.getByRole('status').waitFor();assert.equal(await screen.locator('nav,a').count(),0);}else{await screen.getByText('Kiosk unavailable',{exact:true}).waitFor();assert.equal(await screen.locator('button,a,nav').count(),0);}
 assert.deepEqual(screenErrors,[]);await screen.close();
}
console.log('PASS three/five faces at3sizes,44px targets,repeated taps/thanks,closed disabled,full-account/read-only/wrong-display kiosk denied, interactive scoped kiosk tap (mock auth/SSE fixture),no navigation,no page errors');
}finally{await browser.close();}
