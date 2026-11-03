import { operationRequest } from '../mcp/requests.js';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {Client as LegacyClient} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport as LegacyTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {Page,TestInfo,Browser} from '@playwright/test';
import type {ViewSpec,DisplayRecord} from '../../src/shared/types';
import {samples} from '../../src/shared/template-examples';
import {test,expect,register,createSession,createDisplay,openViewer,publishPrepared,waitForDisplay,sessionApi,sessionDetail,tab} from './support';

async function setup(page:Page,info:TestInfo,baseURL:string){
  await register(page);const s=await createSession(page,'September improvements'),d=await createDisplay(page,s,'Acceptance screen'),v=await openViewer(page,s,d.id);
  const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable September acceptance',scopes:['read','publish']});expect(issued.status).toBe(201);
  const headers={Authorization:`Bearer ${issued.data!.token}`},client=info.project.name.startsWith('phone')?new LegacyClient({name:'september-legacy',version:'1'}):new Client({name:'september-current',version:'1'});
  if(client instanceof LegacyClient)await client.connect(new LegacyTransport(new URL('/mcp',baseURL),{requestInit:{headers}}));else await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers}}));
  const call=async(name:string,operation:string,args:Record<string,unknown>={})=>{const r=await client.callTool(operationRequest({name,arguments:{operation,...args}}));expect(r.isError,`${name}/${operation}: ${JSON.stringify(r.isError?r.content:[])}`).not.toBe(true);expect((r.structuredContent as any).truncated).not.toBe(true);return(r.structuredContent as any).data;};
  const current=async()=>{const r=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!;return r;};
  const painted=async(revision:number)=>{await expect(v.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(revision));await expect(v.locator('.viewer-shell')).toHaveAttribute('data-render-status','ready');};
  const show=async(view:ViewSpec)=>{const before=await current();await publishPrepared(page,s,[d.id],view);const next=await waitForDisplay(page,s,d.id,x=>x.revision>before.revision&&x.appliedRevision===x.revision);await painted(next.revision);return next;};
  const nav=async(navigation:unknown)=>call('kanvas_control','navigation.control',{sessionId:s,displayId:d.id,expectedRevision:(await current()).revision,requestId:randomUUID(),navigation});
  return{s,d,v,client,call,current,painted,show,nav};
}
type Fixture=Awaited<ReturnType<typeof setup>>;
async function photo(page:Page,info:TestInfo,name:string){for(const notice of await page.getByRole('button',{name:'Dismiss notification',exact:true}).all())await notice.click();await page.evaluate(()=>document.fonts.ready);await mkdir(info.outputPath('visuals'),{recursive:true});await page.screenshot({path:`${info.outputPath('visuals')}/${info.project.name}-${name}.png`,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);}
async function asset(a:Fixture,color='#267f9f',w=240,h=120){return a.call('kanvas_import','asset.import',{sessionId:a.s,name:'Acceptance logo.svg',mimeType:'image/svg+xml',base64:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect x="1" y="1" width="${w-2}" height="${h-2}" fill="${color}" stroke="#ffffff" stroke-width="2"/><circle cx="${w/2}" cy="${h/2}" r="${h/3}" fill="#ffffff"/><text x="${w/2}" y="${h/2+5}" text-anchor="middle" fill="${color}" font-size="16">K</text></svg>`).toString('base64')});}
async function counterpart(a:Fixture,page:Page,browser:Browser,info:TestInfo,baseURL:string){
  const context=await browser.newContext({baseURL,viewport:info.project.name.startsWith('phone')?{width:1440,height:900}:{width:390,height:844},colorScheme:'dark',reducedMotion:'reduce'}),peer=await context.newPage(),account=await register(peer);
  await a.call('kanvas_configure','profile.update',{expectedRevision:0,displayName:'Alex · host'});
  expect((await sessionApi(page,`/api/sessions/${a.s}/members`,'POST',{username:account.username,role:'viewer'})).status).toBe(200);
  await peer.goto(`/view/${a.s}/${a.d.id}`);await expect(peer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String((await a.current()).revision));
  return {context,peer};
}
async function word(page:Page,selector:string,needle:string){return page.locator(selector).evaluate((el,text)=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);for(let n=walker.nextNode();n;n=walker.nextNode()){const at=n.textContent!.indexOf(text);if(at<0)continue;const range=document.createRange();range.setStart(n,at);range.setEnd(n,at+text.length);const r=range.getClientRects()[0];return {x:r.left+r.width/2,y:r.top+r.height/2,left:r.left,top:r.top,width:r.width,height:r.height};}throw new Error('Word is not rendered');},needle);}
async function pointAt(page:Page,selector:string){const r=await page.locator(selector).boundingBox();expect(r).not.toBeNull();await page.mouse.click(r!.x+r!.width/2,r!.y+r!.height/2);}

test('all sixteen teams fit with loaded logos; exact standings and uncropped galleries retain optional metadata',async({page,baseURL},info)=>{
  const a=await setup(page,info,baseURL!);try{
    const blue=await asset(a),amber=await asset(a,'#925600',100,240);
    for(const count of [2,4,8,16]){
      await a.show({version:1,template:'scoreboard',data:{sides:Array.from({length:count},(_,i)=>({id:`team-${i}`,name:`Team ${i+1}`,score:i===2?'Winner':i*7,logo:{url:i%2?amber.url:blue.url,alt:`Team ${i+1} logo`}}))}});
      await expect(a.v.locator('.scoreboard-side')).toHaveCount(count);
      expect(await a.v.locator('.scoreboard-content').evaluate(el=>{const box=el.getBoundingClientRect();return el.scrollHeight<=el.clientHeight+2&&[...el.querySelectorAll('.scoreboard-side,.scoreboard-score,.scoreboard-side h2,img')].every(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=box.left-2&&r.right<=box.right+2&&r.top>=box.top-2&&r.bottom<=box.bottom+2;});})).toBe(true);
      expect(await a.v.locator('.scoreboard-logo img').evaluateAll(imgs=>imgs.every(i=>(i as HTMLImageElement).naturalWidth>0&&getComputedStyle(i).objectFit==='contain'))).toBe(true);
      expect(await a.v.locator('.scoreboard-side').evaluateAll(sides=>sides.every(el=>{const b=el.getBoundingClientRect();return [...el.querySelectorAll('h2,strong,button,img')].every(c=>{const r=c.getBoundingClientRect();return r.left>=b.left-2&&r.right<=b.right+2&&r.top>=b.top-2&&r.bottom<=b.bottom+2;});}))).toBe(true);
    }await photo(a.v,info,'sixteen-teams');
    await a.show({version:1,template:'standings',data:{columns:[{id:'points',label:'Points'}],groups:[{id:'g',rows:[{id:'a',name:'Amber',position:1,logo:{url:amber.url},values:{points:'9007199254740993.001'}},{id:'b',name:'Blue',position:2,logo:{url:blue.url},values:{points:'1.2300'}}]}]}});await expect(a.v.locator('.standings-content')).toContainText('9007199254740993.001');await expect(a.v.locator('.standings-logo img')).toHaveCount(2);await photo(a.v,info,'standings-logos');
    const images=Array.from({length:6},(_,i)=>({url:i%2?amber.url:blue.url,alt:`Complete image ${i}`,title:`Hidden title ${i}`,caption:`Hidden caption ${i}`,source:{title:`Source ${i}`}}));
    await a.show({version:1,template:'image-gallery',data:{mode:'grid',columns:2,images}});await expect(a.v.locator('.gallery-frames>figure:visible')).toHaveCount(6);await expect(a.v.locator('.gallery-frames h2,.gallery-frames figcaption')).toHaveCount(0);
    expect(await a.v.locator('.gallery-frames img').evaluateAll(imgs=>imgs.every(i=>(i as HTMLImageElement).naturalWidth>0&&getComputedStyle(i).objectFit==='contain'))).toBe(true);await photo(a.v,info,'image-grid');
    await a.show({version:1,template:'image-gallery',data:{mode:'carousel',images:images.map((x,i)=>i===1?{...x,showCaption:true,showSource:true}:x)}});await a.nav({action:'page',page:2});await expect(a.v.locator('.gallery-frames>figure:visible')).toContainText('Hidden caption 1');await expect(a.v.locator('.gallery-frames>figure:visible')).toContainText('Source 1');await expect(a.v.locator('.gallery-frames h2')).toHaveCount(0);await photo(a.v,info,'image-carousel');
    await a.v.getByRole('button',{name:'Next image',exact:true}).click();await expect(a.v.locator('.gallery-frames>figure:visible')).toHaveAttribute('data-image-index','2');
  }finally{await a.client.close();}
});

test('whiteboard background remains behind saved drawing elements and blank boards are unchanged',async({page,baseURL},info)=>{
  const a=await setup(page,info,baseURL!);try{
    const image=await asset(a),background={url:image.url,alt:'Supplied plan',x:50,y:-10,width:900,height:450};const before=await a.show({version:1,template:'whiteboard',data:{background,elements:[]}});
    await expect(a.v.locator('.board-surface image')).toHaveAttribute('href',image.url);await expect(a.v.locator('.board-empty')).toHaveCount(0);
    await a.v.getByRole('button',{name:'Rectangle (R)',exact:true}).click();const r=await a.v.locator('.board-surface').boundingBox();await a.v.mouse.move(r!.x+r!.width*.3,r!.y+r!.height*.3);await a.v.mouse.down();await a.v.mouse.move(r!.x+r!.width*.65,r!.y+r!.height*.62,{steps:8});await a.v.mouse.up();
    const saved=await waitForDisplay(page,a.s,a.d.id,d=>d.revision>before.revision&&(d.view?.data.elements as unknown[]).length===1);expect(saved.view?.data.background).toEqual(background);await a.painted(saved.revision);expect(await a.v.locator('.board-surface').evaluate(el=>{const children=[...el.children];return children.indexOf(el.querySelector('image')!)<children.indexOf(el.querySelector('[data-element-id]')!);})).toBe(true);await photo(a.v,info,'whiteboard-background');
    await a.v.reload();await expect(a.v.locator('.board-surface image')).toBeVisible();await expect(a.v.locator('.board-surface [data-element-id]')).toHaveCount(1);
    await a.show({version:1,template:'whiteboard',data:{elements:[]}});await expect(a.v.locator('.board-surface image')).toHaveCount(0);await expect(a.v.locator('.board-empty')).toBeVisible();
  }finally{await a.client.close();}
});

test('named shared word/span pointers resolve across desktop-phone reflow and do not change source or history',async({page,baseURL,browser,diagnostics},info)=>{
  const a=await setup(page,info,baseURL!);let peer:Awaited<ReturnType<typeof counterpart>>|undefined;try{
    const text='Shared pointing follows the exact source through different screen sizes. Every participant sees the selected word lighthouse in their own layout, without moving the page or rewriting this sentence.';const original=await a.show({version:1,template:'fact',data:{text}});
    await expect(a.v.getByRole('button',{name:'Point together'})).toHaveCount(0);peer=await counterpart(a,page,browser,info,baseURL!);diagnostics.watch(peer.peer);
    await a.call('kanvas_access','pointing.configure',{sessionId:a.s,enabled:true,expectedRevision:0,confirm:true});await a.v.getByRole('button',{name:'Point together'}).click();const target=await word(a.v,'.fact-text','lighthouse');await a.v.mouse.click(target.x,target.y);
    await expect(peer.peer.locator('.semantic-pointer-name')).toHaveText('Alex · host');const other=await word(peer.peer,'.fact-text','lighthouse');await expect.poll(()=>peer!.peer.locator('.semantic-pointer-mark').first().evaluate((e,b)=>{const r=e.getBoundingClientRect();return Math.abs(r.left-b.left)<4&&Math.abs(r.top-b.top)<4&&Math.abs(r.width-b.width)<4;},other)).toBe(true);
    await peer.peer.getByRole('button',{name:'Point together'}).click();const p=await word(peer.peer,'.fact-text','source');await peer.peer.mouse.click(p.x,p.y);await expect(a.v.locator('.semantic-pointer-name')).toHaveCount(2);await expect(a.v.locator('.semantic-pointer-name')).toContainText(['Alex · host','Browser acceptance']);
    const first=await word(a.v,'.fact-text','Every'),last=await word(a.v,'.fact-text','lighthouse');await a.v.mouse.move(first.x,first.y);await a.v.mouse.down();await a.v.mouse.move(last.x,last.y,{steps:6});await a.v.mouse.up();await expect.poll(async()=>{const s=await a.call('kanvas_inspect','pointing.read',{sessionId:a.s,displayId:a.d.id});const p=s.pointers.find((p:any)=>p.name==='Alex · host');return p?.anchor.end-p?.anchor.start;}).toBeGreaterThan(20);
    await photo(a.v,info,'semantic-pointing');await photo(peer.peer,info,'semantic-pointing-peer');expect((await a.current()).view).toEqual(original.view);expect((await a.current()).revision).toBe(original.revision);
    await a.call('kanvas_access','pointing.configure',{sessionId:a.s,enabled:false,expectedRevision:1,confirm:true});await expect(peer.peer.locator('.pointing-overlay,.pointing-tools')).toHaveCount(0);await expect(a.v.locator('.pointing-overlay,.pointing-tools')).toHaveCount(0);
  }finally{await peer?.context.close();await a.client.close();}
});

test('shared pointers address original cells, chart data and uncropped image pixels; local actions are only intercepted in pointing mode',async({page,baseURL,browser,diagnostics},info)=>{
  const a=await setup(page,info,baseURL!);let peer:Awaited<ReturnType<typeof counterpart>>|undefined;try{
    await a.show({version:1,template:'table',data:{columns:['Name','Value'],rows:[{Name:'North',Value:'1.2300'},{Name:'South',Value:'9007199254740993'}]}});peer=await counterpart(a,page,browser,info,baseURL!);diagnostics.watch(peer.peer);await a.call('kanvas_access','pointing.configure',{sessionId:a.s,enabled:true,expectedRevision:0,confirm:true});
    await a.v.getByRole('button',{name:'Point together'}).click();await pointAt(a.v,'tr[data-source-row="1"] td:nth-child(2)');await expect(peer.peer.locator('[data-pointer-kind="cell"] .semantic-pointer-mark')).toBeVisible();const pointers=await a.call('kanvas_inspect','pointing.read',{sessionId:a.s,displayId:a.d.id});expect(pointers.pointers[0].anchor).toEqual({kind:'cell',row:1,column:'Value'});
    const chart=await a.show(samples.chart);await expect(peer.peer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(chart.revision));await expect(peer.peer.locator('.semantic-pointer-mark')).toHaveCount(0);await a.v.getByRole('button',{name:'Point together'}).click();await pointAt(a.v,'[data-chart-series="This year"][data-chart-x="Mar"][data-chart-y="45"]');await expect(peer.peer.locator('[data-pointer-kind="chart"] .semantic-pointer-mark')).toBeVisible();
    const img=await asset(a),image=await a.show({version:1,template:'image-gallery',data:{mode:'grid',images:[{url:img.url,alt:'Complete source'}]}});await expect(peer.peer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(image.revision));await a.v.getByRole('button',{name:'Point together'}).click();await pointAt(a.v,'.gallery-frames img');await expect(peer.peer.locator('[data-pointer-kind="image"] .semantic-pointer-mark')).toBeVisible();const mark=await a.call('kanvas_inspect','pointing.read',{sessionId:a.s,displayId:a.d.id});expect(mark.pointers[0].anchor.x).toBeCloseTo(.5,1);expect(mark.pointers[0].anchor.y).toBeCloseTo(.5,1);
    await a.show({version:1,template:'scoreboard',data:{sides:[{id:'a',name:'One',score:1},{id:'b',name:'Two',score:2}]}});await a.v.getByRole('button',{name:'Point together'}).click();await a.v.getByRole('button',{name:'Increase One',exact:true}).click();await expect(a.v.locator('.scoreboard-score').first()).toHaveText('1');await a.v.getByRole('button',{name:'Stop pointing'}).click();await a.v.getByRole('button',{name:'Increase One',exact:true}).click();await expect(a.v.locator('.scoreboard-score').first()).toHaveText('2');
  }finally{await peer?.context.close();await a.client.close();}
});

test('manual scrolling survives polls and overscroll without validation errors in tables, logs and compact overview',async({page,baseURL},info)=>{
  const a=await setup(page,info,baseURL!);try{
    const settleScroll=async(selector:string,wait=1900)=>{const el=a.v.locator(selector);await expect.poll(()=>el.evaluate(e=>e.scrollHeight-e.clientHeight),{message:`Overflow in ${selector}`}).toBeGreaterThan(80);await el.evaluate(e=>{e.scrollTop=e.scrollHeight;});await expect.poll(()=>el.evaluate(e=>e.scrollTop)).toBeGreaterThan(70);const at=await el.evaluate(e=>e.scrollTop);await a.v.waitForTimeout(wait);expect(await el.evaluate(e=>e.scrollTop)).toBeGreaterThan(at-3);await expect(a.v.locator('.navigation-error')).toHaveCount(0);};
    const original=await a.show({version:1,template:'table',data:{columns:['Name','Value'],pageSize:100,rows:Array.from({length:70},(_,i)=>({Name:`Source row ${i}`,Value:'1.2300'}))}});await settleScroll('.table-scroll');expect((await a.current()).view).toEqual(original.view);
    await a.show({version:1,template:'log',data:{entries:Array.from({length:80},(_,i)=>({line:i+1,level:'info',message:`Exact source line ${i}`}))}});await settleScroll('[data-navigation-scroll]');
    for(let i=0;i<16;i++)await a.show({version:1,template:'fact',title:`Retained ${i}`,data:{text:`Frame ${i}`}});
    await a.show({version:1,template:'overview',data:{order:'oldest',showMetadata:true,layout:'list',showPreviews:false}});await expect(a.v.locator('.overview-list')).toBeVisible();expect(await a.v.locator('.overview-list article').first().evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(130);await expect(a.v.locator('.retained-preview,.retained-overview-grid')).toHaveCount(0);await expect(a.v.getByRole('button',{name:/^(Gallery|List)$/})).toHaveCount(0);await settleScroll('.overview-content>[data-navigation-scroll]',8500);await photo(a.v,info,'compact-scrolled-overview');await a.v.evaluate(()=>{const shell=document.querySelector('.viewer-shell')!;shell.classList.remove('theme-dark');shell.classList.add('theme-light');});await photo(a.v,info,'compact-scrolled-overview-light');
  }finally{await a.client.close();}
});

test('authored reports with optional session context appear in the account list without service-admin access',async({page,baseURL},info)=>{
  const a=await setup(page,info,baseURL!);try{
    const me=await sessionApi<{user:{id:string}}>(page,'/api/auth/me');expect(me.status).toBe(200);
    const sessionless=await a.call('kanvas_feedback','submit',{requestId:randomUUID(),title:'Account observation',description:'General observation without a session target.',client:'other'});
    expect(sessionless.sessionId).toBeUndefined();expect(sessionless.authorId).toBe(me.data!.user.id);
    await tab(page,'Activity');await page.getByRole('button',{name:'Reports',exact:true}).click();
    await page.getByRole('button',{name:'Write a report',exact:true}).click();
    await page.getByLabel('Related display',{exact:true}).selectOption(a.d.id);
    await page.getByLabel('Report title',{exact:true}).fill('Contextual observation');
    await page.getByLabel('What happened or could be better?').fill('An authored report with optional display context.');
    await page.getByRole('button',{name:'Submit report',exact:true}).click();
    await expect(page.locator('.reports-panel').getByRole('status')).toContainText('Report saved');
    await expect(page.getByRole('article',{name:'Report: Contextual observation',exact:true})).toBeVisible();
    await expect(page.getByRole('article',{name:'Report: Account observation',exact:true})).toHaveCount(0);
    await page.getByLabel('Report list',{exact:true}).selectOption('account');
    await expect(page.getByRole('article',{name:'Report: Account observation',exact:true})).toBeVisible();
    await expect(page.getByRole('article',{name:'Report: Contextual observation',exact:true})).toBeVisible();
    const records=await a.call('kanvas_inspect','reports.read',{});
    const own=records.reports.filter((r:any)=>['Account observation','Contextual observation'].includes(r.title));
    expect(own).toHaveLength(2);expect(own.every((r:any)=>r.authorId===me.data!.user.id)).toBe(true);
    expect(own.find((r:any)=>r.title==='Contextual observation')).toMatchObject({sessionId:a.s,displayId:a.d.id});
    expect(own.find((r:any)=>r.title==='Account observation').sessionId).toBeUndefined();
    const forbidden=await a.client.callTool(operationRequest({name:'kanvas_inspect',arguments:{operation:'reports.read',allAccounts:true}}));
    expect(forbidden.isError).toBe(true);
    await expect(page.getByRole('option',{name:'All reports · service administration'})).toHaveCount(0);
    await photo(page,info,'authored-reports');
  }finally{await a.client.close();}
});
