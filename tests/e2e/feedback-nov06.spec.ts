import type {Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createDisplay,createSession,expect,openViewer,publishPrepared,register,sessionApi,sessionDetail,test,waitForDisplay} from './support';
import {validateView} from '../../src/shared/view-schemas';
import {samples} from '../../src/shared/template-examples';
import {gameExample} from '../../src/shared/game';
import {emailRuntime,beginEmailConnector} from './email-oauth-fixture';
const quiet=async(page:Page)=>{for(const button of await page.locator('.viewer-toast button').all())await button.click();};
const fact=(text:string)=>({version:1 as const,template:'fact' as const,data:{text}});

test('portrait QR fits a short caption and fretted boards distinguish fit from readable overflow',async({page},info)=>{
 await register(page);const s=await createSession(page,'Fit contracts'),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);
 await publishPrepared(page,s,[d.id],validateView({template:'qr',data:{content:'https://example.com/',title:'Scan to open',text:'Open the supplied page.'}}));
 const qr=viewer.locator('.viewer-candidate .qr-viewport');await expect(qr.locator('img')).toBeVisible();
 const fit=await qr.evaluate(el=>{const r=el.getBoundingClientRect();return [...el.querySelectorAll('.qr-code img,.qr-copy')].every(e=>{const b=e.getBoundingClientRect();return b.top>=r.top-1&&b.bottom<=r.bottom+1&&b.right<=r.right+1;});});expect(fit).toBe(true);await quiet(viewer);await viewer.screenshot({path:info.outputPath('qr-fit.png')});
 const strings=[64,59,55,50,45,40].map((midi,i)=>({id:'s'+i,label:'String '+i,openPitch:{midi,label:'E'}}));
 for(const count of [5,24]){await publishPrepared(page,s,[d.id],validateView({template:'instrument',data:{config:{family:'fretted',strings,fretCount:count,capo:2,handedness:'left'},elements:{}}}));const root=viewer.locator('.viewer-candidate .instrument-scroll');await expect(root).toBeVisible();const size=await root.evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));if(count===5)expect(size.scroll).toBeLessThanOrEqual(size.width+1);else{if(info.project.name.startsWith('phone'))expect(size.scroll).toBeGreaterThan(size.width);expect(await root.locator('[data-fret-marker="12"]').count()).toBe(2);}await quiet(viewer);await viewer.screenshot({path:info.outputPath(`frets-${count}.png`)});}
});

test('both neutral Connect Four discs differ from empty slots and face-up corner indices survive overlap',async({page},info)=>{
 await register(page);const s=await createSession(page,'Game readability'),d=await createDisplay(page,s,'Board'),viewer=await openViewer(page,s,d.id);
 const board=gameExample('connect-four');board.pieces={a:{cell:'r6c3',symbol:'disc',side:'first',emphasis:'none'},b:{cell:'r6c4',symbol:'disc',side:'second',emphasis:'none'}};
 await publishPrepared(page,s,[d.id],{version:1,template:'game-board',data:board});await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision);
 for(const theme of ['dark','light']){const detail=await sessionDetail(page,s);expect((await sessionApi(page,`/api/sessions/${s}/config`,'PATCH',{expectedRevision:detail.session.configRevision,config:{theme}})).status).toBe(200);await expect(viewer.locator('.viewer-shell')).toHaveClass(new RegExp('theme-'+theme));
 const colors=await viewer.locator('.viewer-candidate').evaluate(root=>({empty:getComputedStyle(root.querySelector('.game-cell')!).backgroundColor,discs:[...root.querySelectorAll('.game-piece')].map(e=>getComputedStyle(e,'::before').backgroundColor)}));expect(new Set([colors.empty,...colors.discs]).size).toBe(3);
 await quiet(viewer);await viewer.screenshot({path:info.outputPath(`connect-four-${theme}.png`)});}
 await publishPrepared(page,s,[d.id],{version:1,template:'game-board',data:gameExample('solitaire')});const cards=viewer.locator('.viewer-candidate .game-card');await expect(cards.locator('.game-card-index')).toHaveCount(4);await expect(viewer.locator('.viewer-candidate .game-card.is-back .game-card-index')).toHaveCount(0);await expect(viewer.locator('.viewer-candidate [data-game-card="c"] .game-card-index')).toHaveText('Q♥');await quiet(viewer);await viewer.screenshot({path:info.outputPath('solitaire-corners.png')});
});

test('split panes use real local viewports and retain sibling DOM state across single-pane patch',async({page},info)=>{
 await register(page);const s=await createSession(page,'Split panes'),d=await createDisplay(page,s,'Split'),viewer=await openViewer(page,s,d.id);
 await viewer.setViewportSize({width:1440,height:900});
 const panes=[{id:'left',view:fact('First pane')},{id:'right',view:validateView({template:'document',data:{text:'Notes\n\n'+('Readable text.\n\n'.repeat(100))}})}];
 await publishPrepared(page,s,[d.id],{version:1,template:'split-screen',data:{panes}});const left=viewer.frameLocator('iframe[title="Pane left"]'),right=viewer.frameLocator('iframe[title="Pane right"]');await expect(left.getByText('First pane',{exact:true})).toBeVisible();await expect(right.locator('.document-content')).toBeVisible();
 const localWidth=await right.locator('body').evaluate(()=>innerWidth);expect(localWidth).toBeLessThan(800);expect(localWidth).toBeGreaterThan(400);
 await right.locator('body').evaluate(el=>{el.dataset.siblingSentinel='retained';});
 const current=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!;
 const result=await sessionApi(page,`/api/sessions/${s}/displays/${d.id}/patch`,'POST',{requestId:randomUUID(),expectedRevision:current.revision,operations:[{op:'set',path:'/data/panes/0/view',value:fact('Updated pane')}]});expect(result.status).toBe(200);await expect(left.getByText('Updated pane',{exact:true})).toBeVisible();expect(await right.locator('body').getAttribute('data-sibling-sentinel')).toBe('retained');
 await quiet(viewer);await viewer.screenshot({path:info.outputPath('split-two.png')});
 await publishPrepared(page,s,[d.id],{version:1,template:'split-screen',data:{direction:'horizontal',panes}});await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision);const frames=await viewer.locator('.viewer-candidate .split-pane').evaluateAll(es=>es.map(e=>({top:e.getBoundingClientRect().top,width:e.getBoundingClientRect().width})));expect(frames[1].top).toBeGreaterThan(frames[0].top);expect(frames[0].width).toBeGreaterThan(1000);await quiet(viewer);await viewer.screenshot({path:info.outputPath('split-horizontal.png')});
 for(const count of [4,6]){await publishPrepared(page,s,[d.id],{version:1,template:'split-screen',data:{panes:Array.from({length:count},(_,i)=>({id:'p'+i,view:[samples.chart,samples.table,{version:1 as const,template:'game-board' as const,data:gameExample('chess')},validateView({template:'weather',data:{condition:'rain',display:{visualOnly:true}}}),validateView({template:'qr',data:{content:'https://example.com/',title:'Scan'}}),fact('Pane 5')][i]}))}});await expect(viewer.locator('.viewer-candidate .split-pane')).toHaveCount(count);await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision);const inheritedColor=await viewer.locator('.viewer-candidate').evaluate(e=>getComputedStyle(e).color);expect(await viewer.frameLocator('iframe[title="Pane p1"]').locator('td').first().evaluate(e=>getComputedStyle(e).color)).toBe(inheritedColor);await quiet(viewer);await viewer.screenshot({path:info.outputPath(`split-${count}.png`)});}
 for(const theme of ['light','dark']){const detail=await sessionDetail(page,s);expect((await sessionApi(page,`/api/sessions/${s}/config`,'PATCH',{expectedRevision:detail.session.configRevision,config:{theme}})).status).toBe(200);await expect(viewer.locator('.viewer-shell')).toHaveClass(new RegExp('theme-'+theme));await expect.poll(async()=>{const parent=await viewer.locator('.viewer-candidate').evaluate(e=>getComputedStyle(e).color);const pane=await viewer.frameLocator('iframe[title="Pane p1"]').locator('td').first().evaluate(e=>getComputedStyle(e).color);return {parent,pane};}).toEqual({parent:theme==='light'?'rgb(58, 58, 58)':'rgb(237, 237, 237)',pane:theme==='light'?'rgb(58, 58, 58)':'rgb(237, 237, 237)'});}
 await viewer.setViewportSize({width:390,height:844});const nav=viewer.locator('.viewer-candidate .split-screen>nav');await expect(nav).toBeVisible();await nav.getByRole('button',{name:'p5',exact:true}).click();await expect(viewer.frameLocator('iframe[title="Pane p5"]').getByText('Pane 5',{exact:true})).toBeVisible();await quiet(viewer);await viewer.screenshot({path:info.outputPath('split-phone.png')});
});

test('database schema shows every column, linked relationship kind, and readable phone width',async({page},info)=>{
 await register(page);const s=await createSession(page,'Schema session'),d=await createDisplay(page,s,'Schema display'),viewer=await openViewer(page,s,d.id);
 const columns=Array.from({length:14},(_,i)=>({schema:'public',table:'events',column:'field_'+i,type:'timestamp with time zone',nullable:i>0,primaryKey:i===0}));columns.push({schema:'public',table:'users',column:'id',type:'uuid',nullable:false,primaryKey:true});
 await publishPrepared(page,s,[d.id],validateView({template:'database-schema',data:{columns,relationships:[{from:{schema:'public',table:'events',column:'field_1'},to:{schema:'public',table:'users',column:'id'},kind:'inferred'},{from:{schema:'public',table:'events',column:'field_2'},to:{schema:'public',table:'users',column:'id'},kind:'declared'}]}}));
 const root=viewer.locator('.viewer-candidate .database-schema');await expect(root.locator('[data-schema-column]')).toHaveCount(15);await expect(root.locator('.database-schema-relationships')).toContainText('inferred');await expect(root.locator('.database-schema-relationships')).toContainText('declared');await root.getByRole('link',{name:'events.field_1',exact:true}).click();await expect(root.locator('tr:target')).toContainText('field_1');const widths=await root.evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));expect(widths.scroll).toBeLessThanOrEqual(widths.client+2);await quiet(viewer);await viewer.screenshot({path:info.outputPath('database-schema.png')});
});

test('weather visual-only suppresses all prose while preserving optional data and eight-detail layout',async({page},info)=>{
 await register(page);const s=await createSession(page,'Weather options'),d=await createDisplay(page,s,'Weather'),viewer=await openViewer(page,s,d.id);
 const data={condition:'rain',place:'Arendal',description:'Rain showers',details:Array.from({length:8},(_,i)=>({label:'Detail '+i,value:'Value '+i})),forecast:[{time:'16:00',condition:'storm'}]};
 await publishPrepared(page,s,[d.id],validateView({template:'weather',data:{...data,display:{visualOnly:true}}}));const root=viewer.locator('.viewer-candidate .weather-cinema');await expect(root).toBeVisible();await expect(root).not.toContainText('Arendal');await expect(root).not.toContainText('Rain showers');await expect(root.locator('.weather-time-strip')).toHaveCount(0);await quiet(viewer);await viewer.screenshot({path:info.outputPath('weather-visual-only.png')});
 await publishPrepared(page,s,[d.id],validateView({template:'weather',data}));await expect(root.locator('dl>div')).toHaveCount(8);const bounds=await root.evaluate(e=>{const r=e.getBoundingClientRect(),b=e.querySelector('.weather-scene-reading')!.getBoundingClientRect();return {bottom:b.bottom,limit:r.top+r.height*.75};});expect(bounds.bottom).toBeLessThanOrEqual(bounds.limit+2);await quiet(viewer);await viewer.screenshot({path:info.outputPath('weather-eight.png')});
});

test('standard email confirmation observes real grant completion without signing in email browser',async({page,browser})=>{
 const h=await emailRuntime(),context=await browser.newContext(),confirmation=await context.newPage();
 try{const connection=await beginEmailConnector(h,page),link=await connection.request('nov06-'+randomUUID()+'@example.invalid');await connection.confirm(confirmation,link);await connection.exchange();await expect(confirmation.getByRole('heading',{name:'Connected to Kanvas',exact:true})).toBeVisible();await expect(confirmation.getByRole('status')).toContainText('You can close this window');expect((await confirmation.request.get(h.base+'/api/auth/me')).status()).toBe(401);expect((await page.request.get(h.base+'/api/auth/me')).status()).toBe(200);}
 finally{await context.close();await page.goto('about:blank');await h.close();}
});

test('rich stacked toasts and save-only checklist refresh reach multiple windows without replacing content',async({page,baseURL},info)=>{
 await register(page);const s=await createSession(page,'Checklist and notices'),d=await createDisplay(page,s,'Checklist'),viewer=await openViewer(page,s,d.id),second=await openViewer(page,s,d.id);
 await publishPrepared(page,s,[d.id],validateView({template:'checklist',data:{items:[{id:'one',text:'One',checked:false},{id:'two',text:'Two',checked:false}]}}));await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision);
 const current=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!,checklistId=String(current.view!.data.checklistId);
 const update=await sessionApi(page,`/api/sessions/${s}/checklists/${checklistId}`,'PATCH',{requestId:randomUUID(),items:[{id:'one',text:'One',checked:true},{id:'two',text:'Two',checked:false}]});expect(update.status).toBe(200);
 for(const window of [viewer,second])await expect(window.locator('.viewer-candidate .checklist-content [role=checkbox][aria-checked=true]')).toHaveCount(1);
 const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Toast fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'notice-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));
 try{
  await viewer.route('https://example.com/notice.png',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=','base64')}));await second.route('https://example.com/notice.png',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=','base64')}));
  for(const window of [viewer,second])await window.route('https://example.com/broken.png',r=>r.fulfill({contentType:'image/png',body:'Not an image'}));
  const revision=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!.revision;
  for(let i=0;i<3;i++){const r=await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.toast',arguments:{sessionId:s,displayIds:[d.id],title:'Notice '+i,description:'Supplied notification',icon:i===2?'https://example.com/broken.png':'https://example.com/notice.png',time:'2026-11-06T14:38:00Z',durationMs:60000}}});expect(r.isError).not.toBe(true);}
  await expect(viewer.locator('.viewer-toast-title')).toHaveCount(3);await expect(viewer.locator('.viewer-toast-icon[hidden]')).toHaveCount(1);await expect(viewer.locator('.viewer-toast time').first()).toHaveText(/^\d{2}:\d{2}$/);expect((await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!.revision).toBe(revision);await viewer.screenshot({path:info.outputPath('rich-toasts.png')});
  await publishPrepared(page,s,[d.id],fact('Keep this content'));await sessionApi(page,`/api/sessions/${s}/checklists/${checklistId}`,'PATCH',{requestId:randomUUID(),items:[{id:'one',text:'One',checked:false}]});await expect(viewer.locator('.viewer-candidate')).toContainText('Keep this content');
 }finally{await client.close();}
});

test('flipping chess keeps coordinates stable and root hides console link without removing account recovery',async({page},info)=>{
 await register(page);await page.goto('/');await expect(page.locator('.account-overview')).toBeVisible();await expect(page.getByRole('link',{name:'Account & console'})).toHaveCount(0);await expect(page.locator('meta[name="kanvas-version"]')).toHaveAttribute('content','0.37.0');await page.goto('/console?account=sessions');await expect(page.getByRole('heading',{name:'Signed-in browsers',exact:true})).toBeVisible();
 const s=await createSession(page,'Board orientation'),d=await createDisplay(page,s,'Chess'),viewer=await openViewer(page,s,d.id);const board=gameExample('chess');board.pieces={king:{cell:'E2',symbol:'king',color:'white',emphasis:'none'}};
 for(const orientation of ['default','flipped'] as const){await publishPrepared(page,s,[d.id],validateView({template:'game-board',data:{...board,orientation}}));await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision);const piece=viewer.locator('.viewer-candidate [data-game-piece="king"]');await expect(piece).toHaveAttribute('title','E2 (r7c5)');const view=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!.view!;expect((view.data.pieces as any).king.coordinate).toBe('E2');await expect(viewer.locator('.viewer-candidate .game-column-labels span').first()).toHaveText(orientation==='default'?'A':'H');await quiet(viewer);await viewer.screenshot({path:info.outputPath(`chess-${orientation}.png`)});}
});


test('phone split waits for delayed media in a hidden pane before acknowledging paint',async({page},info)=>{
 await register(page);const s=await createSession(page,'Pane media readiness'),d=await createDisplay(page,s,'Media'),viewer=await openViewer(page,s,d.id);await viewer.setViewportSize({width:390,height:844});
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let requested=false;
 await viewer.route('https://example.com/slow-pane.svg',async route=>{requested=true;await gate;await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="green"/></svg>'});});
 await publishPrepared(page,s,[d.id],validateView({template:'split-screen',data:{panes:[{id:'text',view:fact('Visible first pane')},{id:'media',view:{version:1,template:'image',data:{images:[{url:'https://example.com/slow-pane.svg',alt:'Delayed pane media'}]}}}]}}));
 await expect.poll(()=>requested).toBe(true);const pending=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!;expect(pending.appliedRevision).not.toBe(pending.revision);release();await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision);
 await viewer.locator('.viewer-candidate .split-screen>nav').getByRole('button',{name:'media',exact:true}).click();await expect(viewer.frameLocator('iframe[title="Pane media"]').getByRole('img',{name:'Delayed pane media',exact:true})).toBeVisible();await quiet(viewer);await viewer.screenshot({path:info.outputPath('split-hidden-media.png')});
});
