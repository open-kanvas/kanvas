import {randomUUID} from 'node:crypto';
import {Store} from '../../src/server/store';
import {testDatabase} from '../postgres';
import {mkdir} from 'node:fs/promises';
import type {Page,TestInfo} from '@playwright/test';
import {test,expect,register,createSession,createDisplay,openViewer,publishPrepared,waitForDisplay,sessionApi,sessionDetail} from './support';
import type {ViewSpec} from '../../src/shared/types';
import {workExamples} from '../../src/shared/work-examples';

async function setup(page:Page){
  await register(page);const s=await createSession(page,'Source work acceptance'),d=await createDisplay(page,s,'Work screen'),viewer=await openViewer(page,s,d.id);
  const current=()=>waitForDisplay(page,s,d.id,d=>d.revision>0&&d.appliedRevision===d.revision);
  const show=async(view:ViewSpec)=>{await publishPrepared(page,s,[d.id],view);return current();};
  const select=async(selection:unknown)=>{const before=await current(),result=await sessionApi(page,`/api/sessions/${s}/displays/${d.id}/selection`,'POST',{expectedRevision:before.revision,requestId:randomUUID(),selection});expect(result.status).toBe(200);return current();};
  return {s,d,viewer,show,current,select};
}
async function photo(page:Page,info:TestInfo,name:string){await expect(page.locator('.viewer-toast')).toHaveCount(0,{timeout:15000});await page.evaluate(()=>document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));await mkdir(info.outputPath('visuals'),{recursive:true});await page.screenshot({path:`${info.outputPath('visuals')}/${info.project.name}-${name}.png`,animations:'disabled'});}

test('failed public image loads recover only after decoded bytes arrive, and revalidate the source on a new revision',async({page,context,diagnostics},info)=>{
  const a=await setup(page),v=a.viewer,url='https://example.com/controlled-image-fixture.png';
  const base64=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=160;c.height=100;const x=c.getContext('2d')!;x.fillStyle='#3475ae';x.fillRect(0,0,160,100);x.fillStyle='#fff';x.fillRect(20,20,120,60);return c.toDataURL('image/png').split(',')[1];});
  const asset=await sessionApi<{url:string}>(page,`/api/sessions/${a.s}/assets`,'POST',{name:'Controlled recovered image',mimeType:'image/png',base64});expect(asset.status).toBe(201);
  await context.route(url,route=>route.fulfill({status:403,contentType:'text/plain',body:'Controlled source refusal'}));
  for(const p of [page,v])diagnostics.allowHttp(p,'/controlled-image-fixture.png',403);
  const requests:{expectedRevision:number;url:string}[]=[];let release!:()=>void;const bytesReady=new Promise<void>(resolve=>{release=resolve;});
  await context.route('**/image-fallback',async route=>{requests.push(route.request().postDataJSON());await bytesReady;await route.fulfill({json:{data:{status:'available',imageUrl:asset.data!.url}}});});
  const view:ViewSpec={version:1,template:'image',data:{images:[{url,alt:'Exact recovered source image'}]}};
  await publishPrepared(page,a.s,[a.d.id],view);await expect.poll(()=>requests.length).toBeGreaterThan(0);
  const waiting=(await sessionDetail(page,a.s)).displays.find(item => item.id === a.d.id)!;expect(waiting.appliedRevision??0).toBeLessThan(waiting.revision);
  release();await waitForDisplay(page,a.s,a.d.id,d=>d.revision===1&&d.appliedRevision===1);
  await expect(v.locator('.viewer-candidate .image-frame img')).toHaveAttribute('src',asset.data!.url);expect(await v.locator('.viewer-candidate .image-frame img').evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBe(160);await photo(v,info,'image-recovery');
  await publishPrepared(page,a.s,[a.d.id],{...view,title:'Next source revision'});await waitForDisplay(page,a.s,a.d.id,d=>d.revision===2&&d.appliedRevision===2);
  expect(requests.some(r=>r.expectedRevision===2&&r.url===url)).toBe(true);expect((await a.current()).view!.data.images).toEqual([{url,alt:'Exact recovered source image'}]);
});

test('communication and tool views preserve source text, reveal real detail and append a chat without losing prior messages',async({page},info)=>{
  const a=await setup(page),v=a.viewer;
  const inventory=structuredClone(workExamples['tool-inventory']);(inventory.data.groups as any[])[0].tools[1].detail=structuredClone(workExamples['tool-detail'].data);
  await a.show(inventory);await expect(v.locator('.inventory')).toBeVisible();await v.getByRole('button',{name:/pull_requests.read/}).click();await expect(v.locator('.tool-detail table')).toBeVisible();await photo(v,info,'tool-detail');await v.getByRole('button',{name:`← ${(inventory.data.groups as any[])[0].name}`} ).click();await expect(v.locator('.inventory')).toBeVisible();
  const email={id:'mail-1',from:'Ada <ada@example.com>',to:['Team <team@example.com>'],cc:['Review <review@example.com>'],subject:'Exact source message',timestamp:'17 Sep 2026 · 11:30 UTC',body:'  Original paragraph\n\nInvoice 9007199254740993.001 and 1.2300.\n\tRetained indentation.'};
  await a.show({version:1,template:'inbox',data:{items:[{id:'mail-1',from:email.from,subject:email.subject,unread:true,snippet:'Original paragraph',timestamp:email.timestamp}]}});await expect(v.getByLabel('Unread')).toBeVisible();await expect(v.locator('.inbox-message')).toContainText('Exact source message');await expect(v.locator('.inbox-message button,.inbox-message a')).toHaveCount(0);
  await a.show({version:1,template:'email',data:{messages:[email]}});await expect(v.locator('.email-body')).toHaveText(email.body,{useInnerText:false});await expect(v.locator('.email-message')).toContainText('review@example.com');await photo(v,info,'email');
  const old=await a.show({version:1,template:'chat',data:{channel:'Source discussion',messages:[{id:'first',sender:'Ada',timestamp:'11:30 UTC',text:'Keep original 1.2300'}]}});
  const append=await sessionApi(page,`/api/sessions/${a.s}/displays/${a.d.id}/chat`,'POST',{expectedRevision:old.revision,requestId:'chat-append-once',messages:[{id:'next',sender:'Bo',timestamp:'11:31 UTC',text:'  Exact reply\n9007199254740993.001'}]});expect(append.status).toBe(200);await a.current();await expect(v.locator('.chat-message')).toHaveCount(2);await expect(v.locator('.chat-message p').last()).toHaveText('  Exact reply\n9007199254740993.001',{useInnerText:false});await photo(v,info,'chat');
});

test('agent selection filters, sorts and highlights exact source rows without adding selection widgets',async({page},info)=>{
  const a=await setup(page),rows=[{ID:'a',Cost:'9007199254740993.002'},{ID:'b',Cost:'9007199254740993.001'},{ID:'c',Cost:'9007199254740993.003'}];
  await a.show({version:1,template:'table',data:{columns:['ID','Cost'],rows}});
  await a.select({where:[{field:'ID',op:'ne',value:'c'}],sort:[{field:'Cost',type:'number',direction:'asc'}],highlight:[{field:'ID',op:'eq',value:'a'}]});
  await expect(a.viewer.locator('tbody tr')).toHaveCount(2);await expect(a.viewer.locator('tbody tr').first()).toContainText('9007199254740993.001');await expect(a.viewer.locator('tbody .agent-highlight')).toContainText('9007199254740993.002');await expect(a.viewer.locator('select,input[type="search"]')).toHaveCount(0);expect((await a.current()).view!.data.rows).toEqual(rows);await photo(a.viewer,info,'selection-table');
  await a.select(null);await expect(a.viewer.locator('tbody tr')).toHaveCount(3);await expect(a.viewer.locator('tbody tr').first()).toContainText('9007199254740993.002');
  await a.show({version:1,template:'cards',data:{items:[{id:'one',title:'Source issue',status:'Awaiting owner',fields:{Cost:'1.2300',Owner:'Ada'}},{id:'two',title:'CRM record',status:'Qualified',fields:{Value:'9007199254740993.001'}}]}});await a.select({highlight:[{field:'status',op:'eq',value:'Qualified'}]});await expect(a.viewer.locator('.record-card.agent-highlight')).toContainText('9007199254740993.001');await photo(a.viewer,info,'cards');
  await a.show({version:1,template:'log',data:{raw:'first\n  ERROR exact 1.2300\nlast',startLine:101}});await a.select({where:[{field:'message',op:'contains',value:'ERROR'}],highlight:[{field:'message',op:'contains',value:'ERROR'}]});await expect(a.viewer.getByRole('button',{name:'Inspect log line 102'})).toBeVisible();await expect(a.viewer.locator('.log-line')).toHaveCount(1);expect((await a.current()).view!.data.raw).toBe('first\n  ERROR exact 1.2300\nlast');
});

test('developer and operations source variants render accessible records and usable code workspace on both widths',async({page},info)=>{
  const a=await setup(page),v=a.viewer;
  await a.show(workExamples['code-workspace']);await expect(v.locator('.code-workspace .file-tree')).toBeVisible();await expect(v.locator('[aria-current="true"]')).toHaveCount(1);await expect(v.locator('.code-workspace>section')).toBeVisible();await photo(v,info,'code-workspace');
  await a.show(workExamples.developer);await expect(v.locator('.change-files')).toBeVisible();await photo(v,info,'pull-request');
  await a.show({version:1,template:'developer',data:{kind:'pipeline',name:'Supplied build',stages:[{id:'build',name:'Build',status:'Passed',jobs:[{id:'compile',name:'Compile',status:'Passed'}]},{id:'deploy',name:'Deploy',status:'Awaiting approval'}]}});await a.select({highlight:[{field:'status',op:'eq',value:'Awaiting approval'}]});await expect(v.locator('.workflow-stages .agent-highlight')).toContainText('Deploy');await photo(v,info,'pipeline');
  await a.show({version:1,template:'developer',data:{kind:'commits',commits:[{id:'d3',message:'Merge source branch',branch:'main',parents:['b2','c1']},{id:'b2',message:'Exact source patch',branch:'feature',parents:['c1']},{id:'c1',message:'Initial source',branch:'main',parents:['not-in-excerpt']}]}});await expect(v.locator('.commit-log svg path')).toHaveCount(3);await expect(v.locator('.commit-log')).toContainText('Parent outside supplied excerpt');await photo(v,info,'commits');
  await a.show({version:1,template:'developer',data:{kind:'review',path:'src/exact.ts',code:'const value = "1.2300";\nreturn value;',threads:[{id:'thread',line:1,status:'Open',comments:[{id:'c',sender:'Reviewer',text:'Keep the exact decimal string.'}]}]}});await expect(v.locator('.review-code')).toContainText('1.2300');await expect(v.locator('.review-threads')).toContainText('Keep the exact decimal string.');await photo(v,info,'review');
  for(const kind of ['environments','alerts','access','cost','rollout']){await a.show({version:1,template:'operations',data:{kind,title:`Source ${kind}`,items:[{id:'source',name:'Supplied service',status:kind==='cost'?'Forecast':'Needs review',fields:{Value:'9007199254740993.001',Region:'eu-north',Observed:'11:40 UTC'}}],...(kind==='rollout'?{stages:[{id:'canary',name:'Canary',status:'Passed'},{id:'rollout',name:'Rollout',status:'Pending'}]}:{})}});await expect(v.locator('.operations-view')).toContainText('9007199254740993.001');await photo(v,info,`operations-${kind}`);}
});

test('file tree fits its own viewport and source structure, reveals the active nested file and keeps expansion usable',async({page},info)=>{
  const a=await setup(page),v=a.viewer,original=v.viewportSize()!;
  await v.setViewportSize({width:1920,height:1080});
  await a.show({version:1,template:'code',data:{kind:'tree',files:[{path:'app.ts',kind:'file'},{path:'styles.css',kind:'file'}]}});
  const tree=v.locator('.viewer-candidate .file-tree'),font=()=>tree.evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  await expect.poll(font).toBeGreaterThan(40);const wide=await font();
  await v.setViewportSize({width:390,height:844});await expect.poll(font).toBeLessThan(wide);
  await v.setViewportSize(original);
  const activePath='src/features/account/start/view.ts',files=[{path:activePath,kind:'file',status:'modified'},...Array.from({length:32},(_,i)=>({path:`src/features/module-${i}/source.ts`,kind:'file'}))];
  await a.show({version:1,template:'code-workspace',data:{files,activePath,excerpt:{kind:'code',path:activePath,code:'const source = "1.2300";'}}});
  await expect.poll(font).toBeLessThan(wide);await expect.poll(font).toBeGreaterThanOrEqual(16);
  const active=tree.locator('[aria-current="true"]');await active.scrollIntoViewIfNeeded();await expect(active).toBeVisible();await expect(active).toContainText('view.ts');
  const directory=tree.locator('summary').filter({hasText:'module-0'});await directory.scrollIntoViewIfNeeded();await directory.click();await expect(directory.locator('..')).toHaveAttribute('open','');
  await active.scrollIntoViewIfNeeded();await expect(v.locator('.code-workspace>section')).toContainText('1.2300');await photo(v,info,'nested-file-tree');
});

test('bookmarks drill down to the selected source, open real tabs, and Web view fills the screen with mixed viewports',async({page,context},info)=>{
  const a=await setup(page),v=a.viewer;
  await context.route('https://example.com/work-fixture/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width"><style>body{margin:0;background:#12354c;color:white;font:24px system-ui}</style><h1>Supplied page '+new URL(route.request().url()).pathname.split('/').at(-1)+'</h1>'}));
  const pages:number[]=[];await context.route('**/website-preview',route=>{pages.push(route.request().postDataJSON().page);return route.fulfill({json:{data:{status:'interactive',remoteContentVerified:false}}});});
  await a.show({version:1,template:'bookmarks',data:{items:Array.from({length:25},(_,i)=>({id:`b${i}`,title:`Reference ${i+1}`,url:`https://example.com/work-fixture/${i+1}`}))}});await v.getByRole('button',{name:'Preview Reference 25',exact:true}).click();await expect(v.frameLocator('iframe').getByRole('heading',{name:'Supplied page 25'})).toBeVisible();expect(pages).toContain(24);
  const next=v.waitForEvent('popup');await v.getByRole('link',{name:'Open in new tab'}).click();const popup=await next;await expect(popup.getByRole('heading',{name:'Supplied page 25'})).toBeVisible();await popup.close();await v.getByRole('button',{name:'← Bookmarks'}).click();await expect(v.getByRole('button',{name:'Preview Reference 1',exact:true}).first()).toBeVisible();
  await a.show({version:1,template:'iframe',data:{pages:[{url:'https://example.com/work-fixture/desktop',viewport:'desktop'},{url:'https://example.com/work-fixture/mobile',viewport:'mobile'}]}});await expect(v.locator('.iframe-cell')).toHaveCount(2);await expect(v.getByRole('navigation',{name:'Website navigation'})).toHaveCount(0);await expect(v.frameLocator('.viewport-mobile iframe').getByRole('heading',{name:'Supplied page mobile'})).toBeVisible();
  const width=await v.frameLocator('.viewport-mobile iframe').locator('body').evaluate(()=>innerWidth);expect(width).toBe(390);await photo(v,info,'web-view-mixed');
});

test('list uses multiple columns without losing long rows and progress connectors remain orthogonal',async({page},info)=>{
  const a=await setup(page),v=a.viewer,items=Array.from({length:80},(_,i)=>`Source item ${i+1} · 1.2300`);
  await a.show({version:1,template:'list',data:{items,ordered:true,start:100}});await expect(v.locator('.plain-list li')).toHaveCount(80);
  const cols=await v.locator('.plain-list').evaluate(el=>Number(getComputedStyle(el).columnCount));expect(cols).toBeGreaterThanOrEqual(info.project.name.startsWith('desktop')?2:1);await v.locator('.plain-list li').last().scrollIntoViewIfNeeded();await expect(v.locator('.plain-list li').last()).toBeVisible();expect(await v.locator('.plain-list li').last().getAttribute('value')).toBe('179');await photo(v,info,'list-columns');
  await a.show({version:1,template:'progress',data:{task:'Verified source milestones',orientation:'vertical',events:[{id:'a',title:'Source read',timestamp:'2026-09-17T11:00:00Z',status:'completed'},{id:'b',title:'Checks running',timestamp:'2026-09-17T11:05:00Z',status:'running'},{id:'c',title:'Release awaiting verification',timestamp:'2026-09-17T11:20:00Z',status:'blocked'}]}});await expect(v.locator('.spine-card')).toHaveCount(3);
  const connectors=await v.locator('.spine-connector').evaluateAll(els=>els.map(e=>['x1','y1','x2','y2'].map(k=>Number(e.getAttribute(k)))));expect(connectors).toHaveLength(3);for(const [x1,y1,x2,y2] of connectors)expect(Math.abs(x1-x2)<1||Math.abs(y1-y2)<1).toBe(true);await photo(v,info,'progress-orthogonal');
});

test('a free account start paginates names and real links, renames with CAS, and installs a shell without caching account data',async({page},info)=>{
  await register(page);
  // Pagination beyond fifty sessions requires a real free-tier entitlement. This
  // operator fixture is restricted to the disposable configured browser schema.
  const runId=process.env.KANVAS_E2E_RUN_ID;if(!runId)throw new Error('Isolated browser run ID is required.');
  const userId=await page.evaluate(async()=> (await(await fetch('/api/auth/me')).json()).data.user.id as string);
  const fixtures=new Store(testDatabase(runId));try{await fixtures.ready;await fixtures.put('account-tier',{id:userId,tier:'free'});}finally{await fixtures.close();}
  for(let i=0;i<52;i++){const created=await sessionApi(page,'/api/sessions','POST',{name:`Recent source ${i+1}`});expect(created.status).toBe(200);}
  const list=await sessionApi<any>(page,'/api/start');expect(list.status).toBe(200);expect(list.data.sessions).toHaveLength(50);const selected=list.data.sessions[0],before=await sessionDetail(page,selected.id);
  const renamed=await sessionApi(page,`/api/sessions/${selected.id}/rename`,'POST',{name:'Renamed source session',expectedRevision:before.session.configRevision});expect(renamed.status).toBe(200);
  await page.goto('/start');await expect(page.getByRole('region',{name:'Your sessions'})).toBeVisible();await expect(page.locator('.account-session-list article')).toHaveCount(50);await expect(page.getByRole('button',{name:/Renamed source session/})).toBeVisible();const firstNames=await page.locator('.session-choice strong').allTextContents();await page.getByRole('button',{name:'Older sessions',exact:true}).click();await expect(page.locator('.account-session-list article')).toHaveCount(2);const olderNames=await page.locator('.session-choice strong').allTextContents();expect(new Set([...firstNames,...olderNames]).size).toBe(list.data.total);await page.getByRole('button',{name:'Newer sessions',exact:true}).click();await expect(page.locator('.account-session-list article')).toHaveCount(50);expect(await page.locator('.session-choice strong').allTextContents()).toEqual(firstNames);await expect(page.locator('.viewer-shell')).toBeVisible();await photo(page,info,'account-start');
  const manifest=await page.evaluate(async()=>fetch('/manifest.webmanifest').then(r=>r.json()));expect(manifest.start_url).toBe('/start');expect(manifest.display).toBe('standalone');
  const keys=await page.evaluate(async()=>{await navigator.serviceWorker.ready;const out:string[]=[];for(const name of await caches.keys())for(const req of await (await caches.open(name)).keys())out.push(new URL(req.url).pathname);return out;});expect(keys.sort()).toEqual(['/offline.html','/icons/kanvas-192.png','/icons/kanvas-512.png','/brand/kanvas-logo-white.svg'].sort());
  await page.goto('/docs/install-and-cast');await expect(page.locator('main')).toContainText('device.present');
});
