// Run against isolated Vite, not application server or live data.
// WEATHER_TEST_URL=http://127.0.0.1:8804 WEATHER_EVIDENCE_DIR=... node tests/rendering/weather/verify.mjs
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const evidence=process.env.WEATHER_EVIDENCE_DIR;
if(evidence)await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[];
try {
 for(const phone of [false,true]){
  const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1440,height:900},isMobile:phone,hasTouch:phone,deviceScaleFactor:phone?2:1});
  console.log('Starting '+(phone?'phone':'desktop'));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.drawCount=0;window.sunSamples=[];
   const draw=WebGLRenderingContext.prototype.drawArrays;
   WebGLRenderingContext.prototype.drawArrays=function(...a){window.drawCount++;return draw.apply(this,a)};
   const uniform=WebGLRenderingContext.prototype.uniform2f;
   WebGLRenderingContext.prototype.uniform2f=function(loc,x,y){if(x>=0&&x<=1&&y>=0&&y<=1)window.sunSamples.push([x,y]);return uniform.call(this,loc,x,y)};
  });
  await page.goto((process.env.WEATHER_TEST_URL??'http://127.0.0.1:8804')+'/tests/rendering/weather/');
  await page.waitForSelector('canvas[data-atmosphere="volumetric"]');
  await page.getByRole('button',{name:'Pause forecast scenes'}).click();
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const [time,x,y] of [['6:00',.08,.68],['12:00',.5,.15],['18:00',.92,.68]]){
   await page.locator('.weather-time-strip ol button').filter({has:page.locator('time',{hasText:new RegExp('^'+time+'$')})}).click();
   await page.waitForTimeout(1200);
   const sample=await page.evaluate(()=>window.sunSamples.at(-1));
   assert(Math.abs(sample[0]-x)<.001 && Math.abs(sample[1]-y)<.001,JSON.stringify(sample));
   if(evidence)await page.screenshot({path:evidence+'/'+(phone?'phone':'desktop')+'-sun-'+time.replace(':','')+'.png'});
  }
  const before=await page.evaluate(()=>window.drawCount);await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(()=>window.drawCount),before,'reduced motion should not continuously redraw');
  await page.getByRole('button',{name:'Play forecast scenes'}).click();
  const reducedIndex=await page.locator('.weather-cinema').getAttribute('data-weather-moment');
  await page.waitForTimeout(3200);assert.equal(await page.locator('.weather-cinema').getAttribute('data-weather-moment'),reducedIndex);
  await page.getByRole('button',{name:'Pause forecast scenes'}).click();
  await page.emulateMedia({reducedMotion:'no-preference'});
  for(const condition of ['rain','snow','storm']){
   console.log('Precipitation '+(phone?'phone':'desktop')+' '+condition);
   await page.evaluate(c=>window.renderWeather(c),condition);
   await page.waitForTimeout(500);
   const start=await page.evaluate(()=>window.drawCount),t=Date.now();
   await page.waitForTimeout(3000);
   const count=await page.evaluate(()=>window.drawCount)-start,elapsed=Date.now()-t;
   assert(count>0&&count<=Math.ceil(elapsed/1000*25),'draws bounded to 24fps');
   const canvas=await page.locator('canvas').evaluate(el=>({width:el.width,height:el.height,mode:el.dataset.performanceMode}));
   assert(canvas.width<=1100);results.push({phone,condition,draws:count,elapsedMs:elapsed,canvas});
   if(evidence)await page.screenshot({path:evidence+'/'+(phone?'phone':'desktop')+'-'+condition+'.png'});
  }
  // Dwell checked on actual interval boundaries; leave margin for software GPU scheduling.
  await page.evaluate(()=>window.renderWeather('clear'));
  await page.waitForTimeout(200);
  if(await page.getByRole('button',{name:'Pause forecast scenes'}).count())await page.getByRole('button',{name:'Pause forecast scenes'}).click();
  await page.locator('.weather-time-strip ol button').first().click();
  await page.getByRole('button',{name:'Play forecast scenes'}).click();
  await page.waitForTimeout(2300);assert.equal(await page.locator('.weather-cinema').getAttribute('data-weather-moment'),'-1');
  await page.waitForFunction(()=>document.querySelector('.weather-cinema')?.getAttribute('data-weather-moment')==='0',null,{timeout:1800});
  // WebGL context loss must retain a working canvas fallback.
  await page.locator('canvas').evaluate(el=>el.getContext('webgl').getExtension('WEBGL_lose_context').loseContext());
  await page.waitForSelector('canvas[data-atmosphere="canvas-fallback"]');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForTimeout(1700);
  if(evidence)await page.screenshot({path:evidence+'/'+(phone?'phone':'desktop')+'-fallback.png'});
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log(JSON.stringify({passed:true,results},null,2));
 if(evidence)await writeFile(evidence+'/browser-results.json',JSON.stringify({passed:true,results},null,2));
}finally{await browser.close()}
