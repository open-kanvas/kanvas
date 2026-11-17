import { test,expect,register,createSession,createDisplay,openViewer,publishPrepared,waitForDisplay } from './support';
import type { ViewSpec } from '../../src/shared/types';

test('dense repository trees fit thirty rows at 960×540 and fifteen in each split pane at default zoom',async({page})=>{
  await register(page);const s=await createSession(page,'Repository tree'),d=await createDisplay(page,s,'Tree'),viewer=await openViewer(page,s,d.id);await viewer.setViewportSize({width:960,height:540});
  const show=async(view:ViewSpec)=>{await publishPrepared(page,s,[d.id],view);const current=await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision&&x.revision>0);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));};
  const files=['server','client','shared'].flatMap(folder=>Array.from({length:9},(_,i)=>({path:`${folder}/module-${i+1}.ts`}))),tree=(files:{path:string}[]):ViewSpec=>({version:1,template:'code',data:{kind:'tree',files}});
  await show(tree(files));const root=viewer.getByLabel('File structure');
  await expect(root.locator('summary,.tree-file')).toHaveCount(30);
  await expect.poll(()=>root.evaluate(el=>el.scrollHeight<=el.clientHeight+2)).toBe(true);
  const size=await root.evaluate(el=>{const style=getComputedStyle(el);return {font:parseFloat(style.fontSize),line:parseFloat(style.lineHeight)};});
  expect(size.font).toBeGreaterThanOrEqual(10);expect(size.font).toBeLessThanOrEqual(22);expect(size.line/size.font).toBeGreaterThanOrEqual(1.2);expect(size.line/size.font).toBeLessThanOrEqual(1.4);
  await show({version:1,template:'split-screen',data:{rows:1,columns:3,panes:['server','client','shared'].map(folder=>({id:folder,view:tree(Array.from({length:14},(_,i)=>({path:`${folder}/file-${i+1}.ts`})))}))}});
  await expect(viewer.locator('iframe.split-pane')).toHaveCount(3);
  for(let i=0;i<3;i++){const pane=viewer.frameLocator('iframe.split-pane').nth(i).getByLabel('File structure');await expect(pane.locator('summary,.tree-file')).toHaveCount(15);await expect.poll(()=>pane.evaluate(el=>el.scrollHeight<=el.clientHeight+2)).toBe(true);}
  await viewer.setViewportSize({width:390,height:844});
  await show(tree(Array.from({length:100},(_,i)=>({path:`src/long-component-with-an-exact-source-name-${i+1}.tsx`}))));
  const narrow=viewer.getByLabel('File structure');await expect(narrow.locator('.tree-file')).toHaveCount(100);
  await expect.poll(()=>narrow.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  await narrow.evaluate(el=>{el.scrollTop=el.scrollHeight;});await expect(narrow.locator('.tree-file').last()).toBeInViewport();
});
