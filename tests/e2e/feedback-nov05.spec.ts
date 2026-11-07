import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {operationRequest} from '../mcp/requests.js';
import {gameExample,GAME_PRESETS} from '../../src/shared/game';
import {validateView} from '../../src/shared/view-schemas';
import {createDisplay,createSession,expect,openViewer,publishPrepared,register,sessionApi,sessionDetail,test,waitForDisplay} from './support';

test('all game presets fit both axes and keep readable labels and card-table positions',async({page},info)=>{
 test.setTimeout(240000);
 await register(page);const s=await createSession(page,'Board geometry'),d=await createDisplay(page,s,'Game screen'),viewer=await openViewer(page,s,d.id);
 for(const preset of GAME_PRESETS){
  const data=gameExample(preset);
  if(preset==='solitaire'){
   for(let col=1;col<=7;col++)for(let row=0;row<col;row++)data.cards[`deal${col}_${row}`]={face:'back',zone:`column${col}`,order:row,emphasis:'none'};
   data.cards.last={face:'up',zone:'column7',order:7,rank:'K',suit:'hearts',emphasis:'none'};
  }
  const update=await publishPrepared(page,s,[d.id],{version:1,template:'game-board',data});
  try{await waitForDisplay(page,s,d.id,v=>v.appliedRevision===v.revision&&v.view?.data.preset===preset);}catch(error){const detail=await sessionDetail(page,s);console.log('game qualification failure',preset,JSON.stringify({displays:detail.displays.map(d=>({revision:d.revision,appliedRevision:d.appliedRevision,preset:d.view?.data.preset,delivery:d.delivery})),updates:detail.updates.slice(-2)}));await viewer.screenshot({path:info.outputPath('failed-game.png')});throw error;}
  for(const [width,height] of [[390,844],[844,390],[1440,900],[1920,1054]]){
   await viewer.setViewportSize({width,height});
   await expect.poll(()=>viewer.locator('.viewer-shell').evaluate(e=>Math.round(e.getBoundingClientRect().height)),{message:'Viewport resize is applied before geometry measurements'}).toBe(height);
   const root=viewer.locator('.viewer-candidate .game-surface');await expect(root).toBeVisible();
   const board=root.locator('.game-board,.game-table');
   await expect.poll(async()=>{const b=await board.boundingBox();return !!b&&b.width>100&&b.height>100&&b.x>=-1&&b.y>=-1&&b.x+b.width<=width+1&&b.y+b.height<=height+1;},{message:`${preset} fits ${width}x${height}`}).toBe(true);
   if(!['poker','blackjack','solitaire','backgammon'].includes(preset))await expect(root.locator('.game-column-labels')).toBeVisible();
   if(preset==='blackjack'){const dealer=await root.locator('.zone-dealer').boundingBox(),player=await root.locator('.game-zone:not(.zone-dealer)').first().boundingBox();expect(dealer!.y).toBeLessThan(player!.y);expect(player!.x).toBeGreaterThanOrEqual(0);expect(player!.x+player!.width).toBeLessThanOrEqual(width);const hand=await root.locator('.game-zone:not(.zone-dealer) .game-hand').first().boundingBox();expect(hand!.width).toBeGreaterThan(50);}
   if(preset==='solitaire'){
    const columns=await root.locator('.zone-tableau').all();expect(columns).toHaveLength(7);
    const rects=await Promise.all(columns.map(c=>c.boundingBox()));expect(Math.max(...rects.map(r=>r!.y))-Math.min(...rects.map(r=>r!.y))).toBeLessThan(2);
    const last=await root.locator('[data-game-card=last]').boundingBox();expect(last!.y+last!.height).toBeLessThanOrEqual(height);
    const first=await root.locator('[data-game-card=deal7_0]').boundingBox(),second=await root.locator('[data-game-card=deal7_1]').boundingBox();expect(second!.y).toBeGreaterThan(first!.y);expect(second!.y).toBeLessThan(first!.y+first!.height);
   }
  }
  if(['poker','blackjack','solitaire','chess','connect-four','backgammon'].includes(preset))await viewer.screenshot({path:info.outputPath(`nov05-${preset}.png`)});
 }
});

test('generic QR preserves arbitrary payload with plain supporting text and no table widgets',async({page},info)=>{
 await register(page);const s=await createSession(page,'QR display'),d=await createDisplay(page,s,'QR screen'),viewer=await openViewer(page,s,d.id);
 const payload='WIFI:T:WPA;S:Acceptance network;P:synthetic-only;;';
 await publishPrepared(page,s,[d.id],validateView({template:'qr',data:{content:payload,title:'Connect here',text:'Scan using your camera'}}));
 await waitForDisplay(page,s,d.id,v=>v.appliedRevision===v.revision);
 const qr=viewer.locator('.viewer-candidate .qr-code img');await expect(qr).toBeVisible();expect(await qr.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
 await expect(viewer.getByRole('heading',{name:'Connect here'})).toBeVisible();
 await qr.screenshot({path:info.outputPath('nov05-qr.png')});
 // Supporting media participates in readiness, not only the generated QR.
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=32;c.height=32;c.getContext('2d')!.fillRect(0,0,32,32);return c.toDataURL().split(',')[1];});
 let received!:()=>void,release!:()=>void;const requested=new Promise<void>(resolve=>{received=resolve;}),held=new Promise<void>(resolve=>{release=resolve;});
 await viewer.route('https://example.com/nov05-qr-support.png',async route=>{received();await held;await route.fulfill({status:200,contentType:'image/png',body:Buffer.from(png,'base64')});});
 await publishPrepared(page,s,[d.id],validateView({template:'qr',data:{content:'Updated plain text payload',title:'With image',image:{url:'https://example.com/nov05-qr-support.png',alt:'Supporting illustration'}}}));
 try{
  await requested;await expect.poll(()=>viewer.locator('.qr-code img').last().evaluate((e:HTMLImageElement)=>e.naturalWidth)).toBeGreaterThan(0);
  const pending=(await sessionDetail(page,s)).displays.find(v=>v.id===d.id)!;expect(pending.appliedRevision).toBeLessThan(pending.revision);
 }finally{release();}
 await waitForDisplay(page,s,d.id,v=>v.appliedRevision===v.revision&&v.view?.data.content==='Updated plain text payload');
 await expect(viewer.locator('.viewer-candidate .qr-logo img')).toBeVisible();

 await publishPrepared(page,s,[d.id],validateView({template:'table',showControls:true,data:{columns:['Source'],rows:[{Source:'Preserved'}]}}));
 await expect(viewer.locator('.viewer-candidate .table-surface')).toContainText('Preserved');await expect(viewer.locator('.table-toolbar')).toHaveCount(0);
});

test('device lock covers existing windows and reloads, while kiosk preserves visible content without chrome',async({page,baseURL,diagnostics},info)=>{
 await register(page);const s=await createSession(page,'Private device'),d=await createDisplay(page,s,'Protected screen'),viewer=await openViewer(page,s,d.id);
 await publishPrepared(page,s,[d.id],validateView({template:'fact',data:{text:'PRIVATE RECEIVER CONTENT'}}));
 await expect(viewer.locator('.viewer-candidate')).toContainText('PRIVATE RECEIVER CONTENT');
 const second=await page.context().newPage();await second.goto(`/view/${s}/${d.id}`);await expect(second.locator('.viewer-candidate')).toContainText('PRIVATE RECEIVER CONTENT');
 const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Privacy acceptance',scopes:['read','publish']});
 const client=new Client({name:'nov05-privacy-acceptance',version:'1'});
 await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${token.data!.token}`}}}));
 const call=async(name:string,args:Record<string,unknown>)=>{const result=await client.callTool(operationRequest({name,arguments:args}));expect(result.isError,JSON.stringify(result)).not.toBe(true);return (result.structuredContent as any).data;};
 try{
  const devices=await sessionApi<{devices:{id:string}[]}>(page,'/api/devices');expect(devices.data!.devices.length).toBeGreaterThan(0);const deviceId=devices.data!.devices[0].id;
  for(const screen of [page,viewer,second])diagnostics.allowHttp(screen,'/api/',423);
  await call('kanvas_device_lock',{deviceId});
  for(const screen of [page,viewer,second]){await expect(screen.getByText('Kanvas is locked on this device.',{exact:true})).toBeVisible();await expect(screen.locator('.viewer-shell,.workspace')).toHaveCount(0);}
  expect((await page.request.get(`/api/sessions/${s}`)).status()).toBe(423);
  await second.reload();await expect(second.getByText('Kanvas is locked on this device.',{exact:true})).toBeVisible();
  await call('kanvas_device_unlock',{deviceId});await expect(viewer.locator('.viewer-candidate')).toContainText('PRIVATE RECEIVER CONTENT');
  await call('kanvas_display_lockdown',{sessionId:s,displayId:d.id,locked:true});
  try{await expect(viewer.locator('[data-kiosk=true]')).toContainText('PRIVATE RECEIVER CONTENT');}
  catch(error){console.log('lockdown diagnostic',JSON.stringify({body:await viewer.locator('body').innerText(),state:(await sessionDetail(page,s)).displays.map(d=>({id:d.id,lockdown:d.lockdown,revision:d.revision,appliedRevision:d.appliedRevision}))}));await viewer.screenshot({path:info.outputPath('lockdown-failure.png')});throw error;}
  await expect(viewer.locator('.viewer-menu-toggle,.filmstrip,.navigation-panel')).toHaveCount(0);
  await viewer.evaluate(()=>window.addEventListener('kanvas:painted',e=>{(window as any).__kioskPaint=(e as CustomEvent).detail;}));
  await publishPrepared(page,s,[d.id],validateView({template:'fact',data:{text:'Owner-updated kiosk content'},actions:[{id:'feedback',kind:'input',label:'Send feedback'}]}));
  await expect(viewer.locator('[data-kiosk=true]')).toContainText('Owner-updated kiosk content');
  const input=viewer.getByRole('textbox',{name:'Send feedback'});await input.pressSequentially('feedback');await expect(input).toHaveValue('feedback');await input.press('ArrowLeft');await input.press('ArrowRight');await input.press('Enter');
  await expect.poll(async()=>(await sessionDetail(page,s)).interactions.some(i=>i.actionId==='feedback'&&i.value==='feedback')).toBe(true);
  const revision=(await sessionDetail(page,s)).displays.find(v=>v.id===d.id)!.revision;
  await expect.poll(()=>viewer.evaluate(()=>(window as any).__kioskPaint?.renderedRevision)).toBe(revision);

  await call('kanvas_display_lockdown',{sessionId:s,displayId:d.id,locked:false});await expect(viewer.locator('.viewer-menu-toggle')).toBeVisible();
 }finally{await client.close();}
});

test('checklist follows newly completed progress but respects deliberate scrolling',async({page})=>{
 await register(page);const s=await createSession(page,'Progress following'),d=await createDisplay(page,s,'Checklist screen'),viewer=await openViewer(page,s,d.id);
 const items=Array.from({length:90},(_,i)=>({id:'step'+i,text:`Task ${i+1}`,detail:'Original detailed task instructions. '.repeat(8),checked:false}));
 await publishPrepared(page,s,[d.id],validateView({template:'checklist',data:{items}}));
 await waitForDisplay(page,s,d.id,v=>v.appliedRevision===v.revision);
 const list=viewer.locator('.viewer-candidate .checklist-content ul');
 await expect.poll(()=>list.evaluate(e=>e.scrollHeight>e.clientHeight+100)).toBe(true);
 const patch=async(first:number,last:number)=>{
  const result=await sessionApi(page,`/api/sessions/${s}/displays/${d.id}/patch`,'POST',{requestId:crypto.randomUUID(),operations:Array.from({length:last-first},(_,n)=>({op:'checklist',itemId:'step'+(first+n),action:'update',value:{checked:true}}))});
  expect(result.status,JSON.stringify(result)).toBe(200);
 };
 await patch(0,20);await expect.poll(()=>list.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
 await list.evaluate(e=>{e.scrollTop=0;e.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true}));});
 await patch(20,30);await expect(list.locator('li').nth(29)).toHaveClass(/checked/);
 expect(await list.evaluate(e=>e.scrollTop)).toBeLessThan(2);
});

test('reviewed sign artwork loads with direction/prohibition layers and remains region-aware',async({page},info)=>{
 await register(page);const s=await createSession(page,'Reviewed signage'),d=await createDisplay(page,s,'Signs'),viewer=await openViewer(page,s,d.id);
 await publishPrepared(page,s,[d.id],validateView({template:'signage',data:{region:'no',items:[{id:'toilet',type:'restroom',direction:'left'},{id:'phone',type:'no-phones'},{id:'exit',type:'exit',direction:'right'}]}}));
 await waitForDisplay(page,s,d.id,v=>v.appliedRevision===v.revision);
 const images=viewer.locator('.viewer-candidate .sign-reviewed-art');await expect(images).toHaveCount(2);
 expect(await images.evaluateAll(elements=>elements.every(e=>(e as HTMLImageElement).complete&&(e as HTMLImageElement).naturalWidth>0))).toBe(true);
 await expect(viewer.locator('.viewer-candidate .sign-reviewed-prohibition')).toHaveCount(1);
 await expect(viewer.locator('.viewer-candidate .sign-arrow')).toHaveCount(2);
 await viewer.screenshot({path:info.outputPath('nov05-signage.png')});
});
