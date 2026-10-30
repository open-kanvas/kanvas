import { mkdir,readFile,writeFile } from 'node:fs/promises';
import QRCode from 'qrcode';
import type { Page,TestInfo } from '@playwright/test';
import { TEMPLATE_IDS,type AssetRecord,type ViewSpec } from '../../src/shared/types';
import { samples } from '../../src/shared/template-examples';
import { validateView } from '../../src/shared/view-schemas';
import { showViewHeading } from '../../src/shared/display-guidance';
import type { ReportPage } from '../../src/shared/reports';
import { createDisplay,createSession,expect,openViewer,publishPrepared,register,sessionApi,sessionDetail,tab,test,waitForDisplay } from './support';

const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
async function setup(page:Page){await register(page);const s=await createSession(page,'September 13 visual review'),d=await createDisplay(page,s,'Receiving screen'),viewer=await openViewer(page,s,d.id);await viewer.bringToFront();return {s,d,viewer};}
async function show(page:Page,viewer:Page,s:string,d:string,view:ViewSpec){
  const before=(await sessionDetail(page,s)).displays.find(x=>x.id===d)!.revision;
  await publishPrepared(page,s,[d],view);
  // The full-template sweep's overview decodes fifty retained previews on this capped VM.
  const current=await waitForDisplay(page,s,d,x=>x.revision>before&&x.view?.template===view.template&&x.appliedRevision===x.revision,view.template==='overview'?{timeout:30_000,message:'Retained overview completes real painted delivery'}:{});
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status','ready');
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));
  await expect(viewer.locator('.viewer-candidate')).toBeVisible();
  await viewer.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
}
async function photo(viewer:Page,info:TestInfo,name:string){await mkdir(info.outputPath('visuals'),{recursive:true});await viewer.screenshot({path:`${info.outputPath('visuals')}/${info.project.name}-${name}.png`,animations:'disabled'});}

test('weather gives conditions and explicit highs/lows the surface, with full details on demand',async({page},info)=>{
  const {s,d,viewer}=await setup(page);
  const external:string[]=[];viewer.on('request',r=>{if(new URL(r.url()).origin!==new URL(page.url()).origin)external.push(new URL(r.url()).host);});
  const original=validateView({version:1,template:'weather',title:'Arendal, Norway Tomorrow',data:{place:'Arendal, Norway',temperature:'19C / 12C',condition:'rain',period:'day',description:'Morning rain and drizzle clearing later, light winds.'}});
  await show(page,viewer,s,d.id,original);await expect(viewer.locator('.weather-scene')).toBeVisible();await expect(viewer.locator('.weather-temperature')).toHaveText('19C / 12C');await expect(viewer.locator('.weather-temperature')).toBeInViewport();await photo(viewer,info,'weather-reported-payload');
  const explicit=validateView({version:1,template:'weather',showControls:true,showSource:true,data:{place:'Arendal, Norway',timeLabel:'Tomorrow',high:'19°C',low:'12°C',condition:'rain',description:'Morning rain, clearer later.',forecast:[{time:'08:00',temperature:'12.00°C',condition:'rain'},{time:'14:00',temperature:'19.00°C',condition:'partly-cloudy'}],details:[{label:'Wind',value:'4.000 m/s'}]},source:{title:'Synthetic acceptance forecast'}});
  await show(page,viewer,s,d.id,explicit);
  await expect(viewer.locator('.weather-scene')).toBeInViewport();
  await expect(viewer.locator('.weather-scene-reading')).toContainText('High 19°C');await expect(viewer.locator('.weather-scene-reading')).toContainText('Low 12°C');await expect(viewer.locator('.weather-temperature')).toHaveCount(0);
  await expect(viewer.getByText('4.000 m/s',{exact:true})).toBeVisible();await photo(viewer,info,'weather-range');
  await viewer.getByRole('button',{name:/14:00/}).click();await expect(viewer.locator('.weather-scene-reading')).toContainText('19.00°C');await expect(viewer.locator('.weather-scene-reading')).not.toContainText('4.000 m/s');
  await viewer.getByLabel('About this view',{exact:true}).click();await expect(viewer.getByRole('region',{name:'View information'})).toContainText('Synthetic acceptance forecast');await viewer.getByRole('button',{name:'Close view information',exact:true}).click();
  expect(external).toEqual([]);expect((await sessionDetail(page,s)).displays.find(item => item.id === d.id)!.view?.data).toEqual(explicit.data);
});

test('weather variants stay recognizable and legible on the actual receiving screen',async({page},info)=>{
  test.setTimeout(150000);const {s,d,viewer}=await setup(page);
  for(const condition of ['clear','partly-cloudy','cloudy','rain','snow','storm','fog'] as const){
    const period=condition==='clear'?'night':'day';await show(page,viewer,s,d.id,validateView({version:1,template:'weather',data:{place:'Supplied location',temperature:'12.00°',condition,period}}));
    await expect(viewer.locator('.weather-scene')).toBeInViewport();await expect(viewer.locator('.weather-temperature')).toBeInViewport();await expect(viewer.locator('.weather-scene-reading h2')).toBeInViewport();await viewer.waitForTimeout(1100);
    expect(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await photo(viewer,info,`weather-${condition}`);
  }
});

test('quiet surfaces keep requested source information and exact supporting text available',async({page},info)=>{
  const {s,d,viewer}=await setup(page),text='Bring a raincoat.';
  const view=validateView({version:1,template:'fact',showControls:true,showSource:true,title:'A redundant generated heading',data:{text,subtitle:'Morning rain; clearer later.',items:['Exact source 9007199254740993.0000','No claims are omitted from the saved source.']},source:{title:'Original supplied source',url:'https://example.com/source'}});
  await show(page,viewer,s,d.id,view);await expect(viewer.locator('.view-heading')).toHaveCount(0);await expect(viewer.locator('.fact-text')).toHaveText(text);
  const information=viewer.locator('.view-information>summary');await expect(information).not.toContainText('Illustrative data');await expect(information).toBeInViewport();expect(await information.evaluate(x=>parseFloat(getComputedStyle(x).fontSize))).toBeGreaterThanOrEqual(16);
  await expect(information.locator('.illustrative-label')).toHaveCount(0);await expect(information).toContainText('Source & info');
  await expect(viewer.getByText('Exact source 9007199254740993.0000',{exact:true})).not.toBeVisible();
  await viewer.getByText('Supporting details · 2',{exact:true}).click();await expect(viewer.getByText('Exact source 9007199254740993.0000',{exact:true})).toBeVisible();
  await information.click();await expect(viewer.getByRole('region',{name:'View information'})).toContainText('A redundant generated heading');await expect(viewer.getByRole('link',{name:'Original supplied source ↗',exact:true})).toHaveAttribute('href','https://example.com/source');await photo(viewer,info,'source-information');
  await viewer.keyboard.press('Escape');await show(page,viewer,s,d.id,{...view,showTitle:true});await expect(viewer.locator('.view-heading h1')).toHaveText('A redundant generated heading');
  expect((await sessionDetail(page,s)).displays.find(item => item.id === d.id)!.view?.data).toEqual(view.data);
});

test('long browser feedback has an accurate counter and survives save/reload as complete text',async({page})=>{
  await register(page);const s=await createSession(page,'Richer feedback');await tab(page,'Activity');await page.getByRole('button',{name:'Reports',exact:true}).click();await page.getByRole('button',{name:'Write a report',exact:true}).click();
  await page.getByLabel('Report title',{exact:true}).fill('Detailed browser finding');const input=page.getByLabel('What happened or could be better?',{exact:true});await expect(input).toHaveAttribute('maxlength','12000');
  const description='A detailed finding.\n'+'漢'.repeat(9000);await input.fill(description);await expect(page.getByText(`${description.length} / 12000 characters.`,{exact:false})).toBeVisible();await page.getByRole('button',{name:'Submit report',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Report saved.');await page.reload();await tab(page,'Activity');await page.getByRole('button',{name:'Reports',exact:true}).click();await expect(page.getByRole('article',{name:'Report: Detailed browser finding'}).locator('.report-text').first()).toHaveText(description);
  const saved=await sessionApi<ReportPage>(page,`/api/sessions/${s}/reports`);expect(saved.data?.reports[0].description).toBe(description);
});

test('all current templates retain a settled full-screen visual without default information controls',async({page},info)=>{
  test.setTimeout(360000);let {s,d,viewer}=await setup(page);
  const prepareViewer=async()=>{
    await viewer.route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/png',body:PNG}));
    await viewer.route('https://**/*',route=>route.request().isNavigationRequest()&&route.request().frame()!==viewer.mainFrame()?route.fulfill({contentType:'text/html',body:'<!doctype html><h1>Supplied website fixture</h1>'}):route.fallback());
  };await prepareViewer();
  // Deterministic, explicitly synthetic source media; no outside image/video hosts.
  const image=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;const c=canvas.getContext('2d')!;const sky=c.createLinearGradient(0,0,0,800);sky.addColorStop(0,'#244863');sky.addColorStop(1,'#accccd');c.fillStyle=sky;c.fillRect(0,0,1200,800);c.fillStyle='#f4dca4';c.beginPath();c.arc(900,190,90,0,Math.PI*2);c.fill();c.fillStyle='#264b55';c.beginPath();c.moveTo(0,650);c.lineTo(410,180);c.lineTo(790,750);c.lineTo(1200,460);c.lineTo(1200,800);c.lineTo(0,800);c.fill();return canvas.toDataURL('image/png').split(',')[1];});
  async function asset(name:string,mimeType:string,base64:string){const result=await sessionApi<AssetRecord>(page,`/api/sessions/${s}/assets`,'POST',{name,mimeType,base64});expect(result.status).toBe(201);return result.data!;}
  const loadAssets=async()=>({landscape:await asset('Synthetic landscape.png','image/png',image),video:await asset('Supplied test video.mp4','video/mp4',(await readFile(new URL('../rendering/fixtures/sample.mp4',import.meta.url))).toString('base64')),qr:await asset('Illustrative join code.png','image/png',(await QRCode.toBuffer('https://example.com/join',{width:512,margin:2})).toString('base64'))});
  let {landscape,video,qr}=await loadAssets();
  const audit:unknown[]=[];
  for(const template of TEMPLATE_IDS){
    // Cover every real template without bypassing the trial's 50-view quota.
    if(audit.length===40){await viewer.close();s=await createSession(page,'Remaining template acceptance');d=await createDisplay(page,s,'Remaining source templates');viewer=await openViewer(page,s,d.id);await prepareViewer();({landscape,video,qr}=await loadAssets());}
    const input=structuredClone(samples[template]);
    if(template==='image')input.data={images:[{url:landscape.url,alt:'Synthetic landscape',caption:'A supplied image, given the surface.'}]};
    if(template==='image-gallery')input.data={mode:'grid',images:[{url:landscape.url,alt:'Synthetic landscape one'},{url:landscape.url,alt:'Synthetic landscape two'}]};
    if(template==='now-playing')input.data={...input.data,artwork:{url:landscape.url,alt:'Synthetic supplied album artwork'}};
    if(template==='video')input.data={url:video.url,muted:true,loop:true};
    if(template==='join')input.data={...input.data,qr:{url:qr.url,alt:'Illustrative join code'}};
    if(template==='countdown')input.data={...input.data,endsAt:new Date(Date.now()+600000).toISOString()};
    const view=validateView(input);await show(page,viewer,s,d.id,view);
    const surface=viewer.locator('.viewer-candidate>.browsing-root>.render-surface');await expect(surface).toBeVisible();
    await expect(surface.locator(':scope>.view-heading')).toHaveCount(showViewHeading(view)?1:0);
    await expect(surface.locator('.view-information>summary').filter({visible:true})).toHaveCount(0);
    if(template==='chart'){
      await expect.poll(()=>surface.locator('.chart-axis text,.chart-tick').evaluateAll(elements=>Math.min(...elements.map(el=>{const matrix=(el as SVGGraphicsElement).getScreenCTM()!;return parseFloat(getComputedStyle(el).fontSize)*Math.hypot(matrix.a,matrix.b);}))),{message:'Chart labels remain 16 CSS pixels after SVG scaling'}).toBeGreaterThanOrEqual(15.9);
    }
    const metrics=await surface.evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,viewportWidth:innerWidth,viewportHeight:innerHeight,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,bodyHeight:el.querySelector(':scope>.render-body')!.getBoundingClientRect().height,smallVisible:[...el.querySelectorAll('p,span,dt,label,small,summary,button')].filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight&&!n.classList.contains('sr-only')&&parseFloat(getComputedStyle(n).fontSize)<14;}).map(n=>({class:n.className,font:getComputedStyle(n).fontSize,text:n.textContent?.slice(0,80)})).slice(0,15)}));
    expect(metrics.documentWidth,`${template}: no page-wide overflow`).toBeLessThanOrEqual(metrics.viewportWidth+2);expect(metrics.documentHeight,`${template}: only intentional inner reading scroll`).toBeLessThanOrEqual(metrics.viewportHeight+2);expect(metrics.bodyHeight).toBeGreaterThan(120);
    audit.push({template,...metrics});await photo(viewer,info,template);
  }
  // A stale grid poll must not expose grid data after this display changes
  // template. Diagnostics require both the earlier grid and painted replacement.
  const retiredGrid = await viewer.evaluate(async path => {
    const response = await fetch(path); return { status: response.status, payload: await response.json() };
  }, `/api/sessions/${s}/displays/${d.id}/grid`);
  expect(retiredGrid.status).toBe(409);expect(retiredGrid.payload.error.code).toBe('INVALID_VIEW');
  expect(retiredGrid.payload.data).toBeUndefined();
  await writeFile(`${info.outputPath('visuals')}/${info.project.name}-audit.json`,JSON.stringify(audit,null,2));
});

test('whiteboard starts on the supplied diagram and preserves a chosen camera through updates',async({page})=>{
  const {s,d,viewer}=await setup(page);
  async function expectClearBoardControls(){
    const styles=await viewer.locator('.viewer-candidate .board-style').boundingBox(),zoom=await viewer.locator('.viewer-candidate .board-zoom').boundingBox(),menu=await viewer.getByRole('button',{name:'Display controls',exact:true}).boundingBox();
    expect(styles).not.toBeNull();expect(zoom).not.toBeNull();expect(menu).not.toBeNull();
    const separate=(a:{x:number;y:number;width:number;height:number},b:{x:number;y:number;width:number;height:number})=>a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y;
    expect(separate(styles!,zoom!),'Drawing style and zoom have separate hit areas').toBe(true);
    expect(separate(styles!,menu!),'Display controls do not cover drawing style').toBe(true);
    expect(separate(zoom!,menu!),'Display controls do not cover the zoom or Fit targets').toBe(true);
    for(const name of ['Zoom out','Zoom in','Fit board to screen']){
      const button=viewer.getByRole('button',{name,exact:true});await expect(button).toBeInViewport({ratio:1});
      const target=await button.evaluate(el=>{
        const r=el.getBoundingClientRect();
        return {width:r.width,height:r.height,clear:[[.5,.5],[.1,.1],[.9,.1],[.1,.9],[.9,.9]].every(([x,y])=>{const hit=document.elementFromPoint(r.x+r.width*x,r.y+r.height*y);return hit!==null&&(hit===el||el.contains(hit));})};
      });
      expect(target.width,`${name}: touch-target width`).toBeGreaterThanOrEqual(44);expect(target.height,`${name}: touch-target height`).toBeGreaterThanOrEqual(44);
      expect(target.clear,`${name}: center and inset corners receive real pointer events`).toBe(true);
    }
  }
  const view=validateView({version:1,template:'whiteboard',showControls:true,data:{elements:[{id:'first',type:'rect',x:1600,y:1800,width:360,height:120,text:'Supplied starting point'},{id:'second',type:'rect',x:1600,y:2030,width:360,height:120,text:'Supplied next step'}]}});
  await show(page,viewer,s,d.id,view);
  await expect(viewer.locator('[data-element-id="first"]')).toBeInViewport();await expect(viewer.locator('[data-element-id="second"]')).toBeInViewport();
  await expectClearBoardControls();
  const svg=viewer.locator('.board-surface'),initial=await svg.getAttribute('viewBox');
  await viewer.getByRole('button',{name:'Zoom in',exact:true}).click();await expect(svg).not.toHaveAttribute('viewBox',initial!);
  const chosen=await svg.getAttribute('viewBox');
  await show(page,viewer,s,d.id,{...view,data:{elements:[...(view.data.elements as object[]),{id:'third',type:'text',x:2800,y:2100,text:'Later supplied note'}]}});
  await expect(svg).toHaveAttribute('viewBox',chosen!);await expectClearBoardControls();await viewer.getByRole('button',{name:'Fit board to screen',exact:true}).click();await expect(viewer.locator('[data-element-id="third"]')).toBeInViewport();
});
