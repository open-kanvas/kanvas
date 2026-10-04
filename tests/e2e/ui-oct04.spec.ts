import {test,expect,register,createSession,createDisplay,openViewer,publishPrepared,waitForDisplay} from './support';

test('marker tables retain rich safe content in popup and permanent modes',async({page},info)=>{
 const unwanted:string[]=[];page.context().on('request',r=>{if(r.url().includes('evil.test'))unwanted.push(r.url());});
 await page.context().route('https://tile.openstreetmap.org/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e0e7e0"/></svg>'}));
 await register(page);const s=await createSession(page,'Synthetic map'),d=await createDisplay(page,s,'Map'),v=await openViewer(page,s,d.id);
 const html='<strong>Regional transport</strong><table><tr><td>Daily departures</td><td>310</td></tr><tr><td>Connections</td><td>48</td></tr></table><script>window.untrustedExecuted=true</script><img src="https://evil.test/pixel"><a href="javascript:alert(1)" onclick="alert(1)">Safe text</a>';
 for(const permanent of [false,true]){
  await publishPrepared(page,s,[d.id],{version:1,template:'map',data:{markers:[{lat:59.9,lng:10.7,label:'Plain fallback',popupHtml:html,contentDisplay:permanent?'permanent':'popup'}]}});
  await expect(v.locator('.viewer-candidate .leaflet-interactive').first()).toBeVisible();
  if(!permanent)await v.locator('.viewer-candidate .leaflet-interactive').first().click();
  const box=v.locator(permanent?'.viewer-candidate .map-permanent-content':'.viewer-candidate .map-rich-popup');
  await expect(box).toHaveCount(1);await expect(box.locator('strong')).toHaveText('Regional transport');await expect(box.locator('table')).toBeVisible();await expect(box).not.toContainText('Plain fallback');
  await expect(box.locator('script,img,[onclick],a[href^="javascript:"]')).toHaveCount(0);expect(unwanted).toEqual([]);
  const geometry=await box.evaluate(e=>{const cells=e.querySelectorAll('td'),a=cells[0].getBoundingClientRect(),b=cells[1].getBoundingClientRect(),r=e.getBoundingClientRect(),map=e.closest('.map-surface')!.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(cells[0]);return{width:r.width,left:r.left,right:r.right,mapLeft:map.left,mapRight:map.right,lines:range.getClientRects().length,cellWidth:a.width,secondLeft:b.left,firstRight:a.right};});
  expect(geometry.cellWidth).toBeGreaterThan(100);expect(geometry.lines).toBeLessThanOrEqual(2);expect(geometry.secondLeft).toBeGreaterThanOrEqual(geometry.firstRight-1);expect(geometry.left).toBeGreaterThanOrEqual(geometry.mapLeft);expect(geometry.right).toBeLessThanOrEqual(geometry.mapRight);
  await v.screenshot({path:info.outputPath(permanent?'permanent-table.png':'popup-table.png'),animations:'disabled'});
 }
});

test('native embedded scrolling is quiet and display menu omits search controls',async({page},info)=>{
 await register(page);const s=await createSession(page,'Synthetic menus'),d=await createDisplay(page,s,'Embedded'),v=await openViewer(page,s,d.id);
 await publishPrepared(page,s,[d.id],{version:1,template:'device-preview',data:{description:'Synthetic frame collection',html:'<h1>Example only</h1>',viewports:['small-phone','iphone','pixel','galaxy','tablet','laptop']}});
 await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision&&x.revision>0);
 const navRequests:string[]=[];v.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/navigation'))navRequests.push(r.postData()??'');});
 const scrolled=await v.locator('.viewer-candidate').evaluate(root=>{const nodes=[...root.querySelectorAll<HTMLElement>('*')],el=nodes.find(e=>e.scrollHeight>e.clientHeight+50&&['auto','scroll'].includes(getComputedStyle(e).overflowY));if(!el)return false;el.scrollTop=150;el.dispatchEvent(new Event('scroll',{bubbles:true}));return el.scrollTop>0;});
 expect(scrolled).toBe(true);await v.waitForTimeout(1100);await expect(v.locator('.navigation-error')).toHaveCount(0);expect(navRequests).toEqual([]);
 await publishPrepared(page,s,[d.id],{version:1,template:'fact',data:{text:'Menu smoke content'}});await expect(v.locator('.viewer-candidate')).toContainText('Menu smoke content');
 await v.locator('.viewer-candidate').click({position:{x:30,y:30}});await v.keyboard.press('Escape');await expect(v.locator('.filmstrip-overview')).toHaveCount(0);await expect(v.locator('.viewer-candidate')).toContainText('Menu smoke content');
 await v.getByRole('button',{name:'Display controls',exact:true}).click();await expect(v.locator('.viewer-navigation')).toHaveCount(0);await expect(v.getByRole('button',{name:'Next match',exact:true})).toHaveCount(0);await expect(v.getByRole('button',{name:'Screen options',exact:true})).toBeVisible();await expect(v.getByRole('button',{name:'Refresh connection',exact:true})).toBeVisible();await expect(v.getByRole('button',{name:'Session overview',exact:true})).toBeVisible();await v.screenshot({path:info.outputPath('simplified-menu.png'),animations:'disabled'});
});
