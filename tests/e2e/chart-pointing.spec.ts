import { Client,StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { test,expect,register,createSession,createDisplay,openViewer,publishPrepared,waitForDisplay,sessionApi } from './support';
import type { ViewSpec } from '../../src/shared/types';

test('chart pointing follows wedge/bar/point geometry, snaps real line observations and separates legend labels',async({page,baseURL})=>{
  await register(page);const s=await createSession(page,'Semantic chart pointing'),d=await createDisplay(page,s,'Chart'),viewer=await openViewer(page,s,d.id);await viewer.setViewportSize({width:960,height:540});
  const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Chart gesture receipt',scopes:['read','publish']});
  const client=new Client({name:'chart-gesture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${token.data!.token}`}}}));
  const hear=async()=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.session.state',arguments:{sessionId:s}}});expect(result.isError).not.toBe(true);return result.structuredContent as any;};
  try{
  await hear();
  const endpoint=`/api/sessions/${s}/displays/${d.id}/pointing`;
  const state=async()=>(await sessionApi<any>(viewer,endpoint)).data;
  const show=async(data:Record<string,unknown>)=>{await publishPrepared(page,s,[d.id],{version:1,template:'chart',data} as ViewSpec);const current=await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision&&x.revision>0);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));};
  await show({kind:'pie',series:[{name:'Share',points:[{x:'Alpha',y:40},{x:'Beta',y:60}]}]});
  const wedge=viewer.locator('path[data-chart-series="Share"][data-chart-x="Alpha"]');await expect(wedge).toBeVisible();
  const point=await wedge.evaluate(el=>{const path=el as SVGGeometryElement,box=path.getBBox(),matrix=path.getScreenCTM()!;for(let xi=1;xi<10;xi++)for(let yi=1;yi<10;yi++){const p=new DOMPoint(box.x+box.width*xi/10,box.y+box.height*yi/10);if(path.isPointInFill(p)){const screen=p.matrixTransform(matrix);return{x:screen.x,y:screen.y};}}throw new Error('No interior wedge point');});
  await viewer.mouse.click(point.x,point.y);
  const overlay=viewer.locator('.pointing-overlay [data-pointer-kind="chart"]');await expect(overlay).toHaveCount(1);
  await expect(overlay.locator('[data-pointer-shape="path"]')).toHaveAttribute('d',(await wedge.getAttribute('d'))!);await expect(overlay.locator('.semantic-pointer-mark')).toHaveCount(0);
  expect((await state()).pointers[0].anchor).toMatchObject({kind:'chart',series:'Share',x:'Alpha',y:'40'});
  await viewer.screenshot({path:test.info().outputPath('chart-pointing-wedge.png')});
  await show({kind:'bar',orientation:'horizontal',series:[{name:'Revenue',points:[{x:'March',y:42},{x:'April',y:55}]}]});
  const bar=viewer.locator('rect[data-chart-series="Revenue"][data-chart-x="March"]');await bar.click();
  await expect(overlay.locator('[data-pointer-shape="rect"]')).toHaveCount(1);await expect(overlay.locator('.semantic-pointer-mark')).toHaveCount(0);
  // Playwright's painted box includes the highlight's intentional 2.5px stroke.
  // Compare the SVG geometry in screen coordinates, including its position, instead.
  const screenGeometry=(node:Element)=>{const el=node as SVGGraphicsElement,box=el.getBBox(),matrix=el.getScreenCTM()!;return [new DOMPoint(box.x,box.y),new DOMPoint(box.x+box.width,box.y+box.height)].flatMap(point=>{const screen=point.matrixTransform(matrix);return [screen.x,screen.y];});};
  const painted=await overlay.locator('[data-pointer-shape="rect"]').evaluate(screenGeometry),original=await bar.evaluate(screenGeometry);
  for(let i=0;i<original.length;i++)expect(painted[i]).toBeCloseTo(original[i],2);
  await expect(overlay.locator('[data-pointer-shape="rect"]')).toHaveAttribute('stroke-width','2.5');
  await viewer.screenshot({path:test.info().outputPath('chart-pointing-bar.png')});
  await show({kind:'line',series:[{name:'Site A',points:[{x:'March',y:42},{x:'April',y:55}]},{name:'Site B',points:[{x:'March',y:12},{x:'April',y:22}]}]});
  const line=viewer.locator('path[data-chart-line="Site A"]');
  const between=await line.evaluate(el=>{const path=el as SVGGeometryElement,p=path.getPointAtLength(path.getTotalLength()*.35),q=new DOMPoint(p.x,p.y).matrixTransform(path.getScreenCTM()!);return{x:q.x,y:q.y};});
  await viewer.mouse.click(between.x,between.y+2);
  await expect(overlay.locator('[data-pointer-shape="circle"]')).toHaveCount(1);
  expect((await state()).pointers[0].anchor).toEqual({kind:'chart',series:'Site A',x:'March',y:'42'});
  await viewer.screenshot({path:test.info().outputPath('chart-pointing-snapped-line.png')});
  // The gap in the legend is not a plotted value and reports readable series names.
  const legend=viewer.locator('.chart-legend'),gap=await legend.evaluate(el=>{const a=el.children[0].getBoundingClientRect(),b=el.children[1].getBoundingClientRect();return{x:(a.right+b.left)/2,y:a.top+a.height/2};});
  await viewer.mouse.click(gap.x,gap.y);
  await expect(viewer.locator('.pointing-overlay [data-pointer-kind="point"]')).toHaveCount(1);
  expect((await hear()).pointing.events.at(-1).target.label).toBe('Site A · Site B');
  expect((await state()).pointers[0].anchor.kind).toBe('point');
  }finally{await client.close();}
});
