import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
const output=process.env.KANVAS_GAME_EVIDENCE??'/tmp/kanvas-game-evidence';await mkdir(output,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--configLoader','runner','--config','scripts/games-vite.config.ts','--host','127.0.0.1','--port','8811','--strictPort'],{stdio:['ignore','pipe','pipe']});
server.stdout.on('data',chunk=>process.stdout.write(chunk));server.stderr.on('data',chunk=>process.stderr.write(chunk));
let browser;
try {
 const url='http://127.0.0.1:8811/tests/fixtures/games/';
 let ready=false;for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error(`Game fixture server exited ${server.exitCode}; check exclusive port8811`);try{const response=await fetch(url);if(response.ok&&(await response.text()).includes('kanvas-games-fixture-v1')){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}if(!ready)throw Error('Own game fixture server did not become ready');
 browser=await chromium.launch({headless:true});
 for(const [name,width,height] of [['desktop',1440,900],['phone',390,844]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('browser-error',e.message);});await page.goto(url);await page.waitForFunction(()=>window.presets);
  const presets=await page.evaluate(()=>window.presets);
  for(const preset of presets){await page.evaluate(p=>window.showGame(p),preset);await page.locator(`.game-${preset}`).waitFor();
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error(`${preset} horizontal overflow at ${name}`);
   if(preset==='chess'){await page.evaluate(()=>window.originalKnight=document.querySelector('[data-game-piece=knight]'));await page.evaluate(()=>window.moveKnight());await page.waitForFunction(()=>document.querySelector('[data-game-piece=knight]').getAttribute('aria-label').endsWith('r6c6'));if(!await page.evaluate(()=>window.originalKnight===document.querySelector('[data-game-piece=knight]')))throw Error('Knight DOM replaced');}
   await page.screenshot({path:`${output}/${name}-${preset}.png`});console.log(`${name} ${preset}: rendered, no horizontal overflow${preset==='chess'?', stable knight DOM':''}`);
  }
  if(errors.length)throw Error(errors.join('\n'));await page.close();
 }
}finally{await browser?.close();server.kill('SIGTERM');}
