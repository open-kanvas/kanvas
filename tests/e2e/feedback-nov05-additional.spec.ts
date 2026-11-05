import {createDisplay,createSession,expect,openViewer,publishPrepared,register,sessionApi,sessionDetail,test,waitForDisplay} from './support';
import {validateView} from '../../src/shared/view-schemas';
import {gameExample} from '../../src/shared/game';

test('a full poker table keeps ten seats, attached bets and community cards inside the felt',async({page},info)=>{
 await register(page);const s=await createSession(page,'Full table'),d=await createDisplay(page,s,'Poker'),viewer=await openViewer(page,s,d.id),data=gameExample('poker');
 data.zones={community:{label:'Community',role:'community'}};data.cards={};
 for(let i=0;i<10;i++){const zone='seat'+i;data.zones[zone]={label:'Seat '+(i+1),role:'seat',bet:'40',counter:'Chips 200'};for(let n=0;n<2;n++)data.cards[zone+'card'+n]={face:'back',zone,order:n,emphasis:'none'};}
 for(let i=0;i<5;i++)data.cards['board'+i]={face:'up',zone:'community',order:i,rank:(['A','K','Q','J','10'] as const)[i],suit:'hearts',emphasis:'none'};
 await publishPrepared(page,s,[d.id],{version:1,template:'game-board',data});await waitForDisplay(page,s,d.id,v=>v.appliedRevision===v.revision);
 for(const [width,height] of [[1440,900],[390,844],[844,390]]){
  await viewer.setViewportSize({width,height});await expect.poll(()=>viewer.locator('.viewer-shell').evaluate(e=>Math.round(e.getBoundingClientRect().height))).toBe(height);
  const root=viewer.locator('.viewer-candidate .game-table');await expect(root.locator('.zone-seat')).toHaveCount(10);
  const state=await root.evaluate(root=>{const box=(e:Element)=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};return{table:box(root),zones:[...root.querySelectorAll('.game-zone')].map(box),cards:[...root.querySelectorAll('.game-card')].map(box)};});
  for(const rect of [...state.zones,...state.cards]){expect(rect.x).toBeGreaterThanOrEqual(state.table.x);expect(rect.right).toBeLessThanOrEqual(state.table.right);expect(rect.y).toBeGreaterThanOrEqual(state.table.y);expect(rect.bottom).toBeLessThanOrEqual(state.table.bottom);}
  for(let i=0;i<state.zones.length;i++)for(let j=i+1;j<state.zones.length;j++){const a=state.zones[i],b=state.zones[j],overlap=Math.min(a.right,b.right)-Math.max(a.x,b.x)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>2;expect(overlap,`Seats ${i}/${j} overlap at ${width}x${height}`).toBe(false);}
  await viewer.screenshot({path:info.outputPath(`poker-ten-${width}x${height}.png`)});
 }
});

test('fretted left-handed mode mirrors positions but preserves ordered strings and theme styling',async({page},info)=>{
 await register(page);const s=await createSession(page,'Handedness'),d=await createDisplay(page,s,'Fretboard'),viewer=await openViewer(page,s,d.id);
 const strings=[['one','1 · E4',64],['two','2 · B3',59],['three','3 · G3',55],['four','4 · D3',50],['five','5 · A2',45],['six','6 · E2',40]].map(([id,label,midi])=>({id,label,openPitch:{midi,label}}));
 const show=async(handedness:string)=>{await publishPrepared(page,s,[d.id],validateView({template:'instrument',data:{config:{family:'fretted',strings,fretCount:5,handedness},elements:{'string:one:fret:1':{highlight:true,label:'A'},'string:six:fret:3':{highlight:true,label:'B'}}}}));await waitForDisplay(page,s,d.id,v=>v.appliedRevision===v.revision);};
 await show('right');const root=viewer.locator('.viewer-candidate .instrument-visual');
 const right=await root.locator('[data-element-id="string:one:fret:1"] circle').getAttribute('cx');
 await show('left');const left=await root.locator('[data-element-id="string:one:fret:1"] circle').getAttribute('cx');expect(Number(left)).toBeGreaterThan(Number(right));
 const labels=await root.locator('svg>g>text').allTextContents();expect(labels.filter(t=>/^[1-6] ·/.test(t))).toEqual(strings.map(s=>String(s.label)));
 await expect(root.locator('svg')).not.toHaveAttribute('transform',/scale/);
 await viewer.screenshot({path:info.outputPath('instrument-left.png')});
});

test('privacy recovery on another signed-in browser restores the locked installation',async({page,browser,baseURL,diagnostics})=>{
 const account=await register(page);const devices=await sessionApi<{devices:{id:string}[]}>(page,'/api/devices');expect(devices.data!.devices.length).toBeGreaterThan(0);
 // Separate browser context has independent installation cookies and sign-in.
 const context=await browser.newContext({baseURL});const recovery=await context.newPage();diagnostics.watch(recovery);
 try{
  expect((await context.request.post('/api/auth/login',{data:account})).status()).toBe(200);
  await recovery.goto('/console?account=sessions');await expect(recovery.getByRole('heading',{name:'Signed-in browsers',exact:true})).toBeVisible();
  const token=await sessionApi<{token:string}>(recovery,'/api/tokens','POST',{name:'Recovery fixture',scopes:['read','publish']});
  const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'recovery-fixture',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));
  try{diagnostics.allowHttp(page,'/api/',423);const result=await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.device.lock',arguments:{deviceId:devices.data!.devices[0].id}}});expect(result.isError).not.toBe(true);}finally{await client.close();}
  await expect(page.getByText('Locked from your AI assistant',{exact:true})).toBeVisible();
  await recovery.getByRole('button',{name:'Refresh locked devices',exact:true}).click();
  await recovery.getByRole('button',{name:'Unlock',exact:true}).click();
  await expect(page.locator('.workspace')).toBeVisible();await expect(recovery.getByRole('button',{name:'Unlock',exact:true})).toHaveCount(0);
 }finally{await context.close();}
});


test('status-channel failure hides cached content until an unlocked response is received',async({page,diagnostics})=>{
 await register(page);const s=await createSession(page,'Offline privacy'),d=await createDisplay(page,s,'Offline screen'),viewer=await openViewer(page,s,d.id);
 await publishPrepared(page,s,[d.id],validateView({template:'fact',data:{text:'No offline private content'}}));await expect(viewer.locator('.viewer-candidate')).toContainText('No offline private content');
 diagnostics.allowOffline(viewer);await viewer.route('**/api/device-privacy/status',route=>route.abort('internetdisconnected'));
 await expect(viewer.locator('[data-privacy-state=offline]')).toBeVisible();await expect(viewer.locator('.viewer-shell')).toHaveCount(0);await expect(viewer.getByText('No offline private content',{exact:true})).toHaveCount(0);
 await viewer.unroute('**/api/device-privacy/status');await expect(viewer.locator('.viewer-candidate')).toContainText('No offline private content');
});
