import {test,expect,register,createSession,createDisplay,openViewer,publishPrepared,waitForDisplay} from './support';
test('planner month sorts timed entries after all-day entries, irrespective of insertion order',async({page},info)=>{
 await register(page);const s=await createSession(page,'Planner chronology'),d=await createDisplay(page,s,'Plan'),viewer=await openViewer(page,s,d.id);
 await publishPrepared(page,s,[d.id],{version:1,template:'planner',data:{view:'month',anchorDate:'2026-12-01',timeZone:'UTC',items:[{id:'party',title:'Evening party',start:'2026-12-31T19:00:00Z',end:'2026-12-31T21:00:00Z'},{id:'lunch',title:'Lunch first',start:'2026-12-31T12:00:00Z',end:'2026-12-31T13:00:00Z'},{id:'holiday',title:'Holiday span',start:'2026-12-31',end:'2027-01-01',allDay:true}]}});
 await waitForDisplay(page,s,d.id,x=>x.revision>0&&x.appliedRevision===x.revision);
 const cell=viewer.locator('.viewer-candidate .planner-cell[data-day="2026-12-31"]');const content=await cell.innerText();
 expect(content.indexOf('Holiday span')).toBeLessThan(content.indexOf('Lunch first'));expect(content.indexOf('Lunch first')).toBeLessThan(content.indexOf('Evening party'));
 await viewer.screenshot({path:info.outputPath('planner-chronology.png'),animations:'disabled'});
});
test('topology display cards occupy multiple columns on wide screens and stack on phones',async({page},info)=>{
 await register(page);const s=await createSession(page,'Topology layout'),displays=[];
 for(const name of ['Main','Lobby','Café counter','Meeting room'])displays.push(await createDisplay(page,s,name));
 const viewer=await openViewer(page,s,displays[0].id);if(info.project.name==='desktop-chromium')await viewer.setViewportSize({width:1920,height:1080});
 await publishPrepared(page,s,[displays[0].id],{version:1,template:'session-topology',data:{layout:'connections',groupBy:'all',includeOffline:true,density:'compact'}});
 await waitForDisplay(page,s,displays[0].id,x=>x.revision>0&&x.appliedRevision===x.revision);
 const cards=viewer.locator('.viewer-candidate .topology-display');await expect(cards).toHaveCount(5);
 const rects=await cards.evaluateAll(es=>es.map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y})));
 if(info.project.name==='desktop-chromium'){expect(rects[1].x).toBeGreaterThan(rects[0].x+200);expect(Math.abs(rects[0].y-rects[1].y)).toBeLessThan(2);}
 else expect(Math.abs(rects[0].x-rects[1].x)).toBeLessThan(2);
 await viewer.screenshot({path:info.outputPath('topology-cards.png'),animations:'disabled'});
});
