import type { ReportPage } from '../../src/shared/reports';
import type { ReportRecord } from '../../src/shared/reports';
import { createDisplay } from './support';
import { createSession } from './support';
import { expect } from './support';
import { register } from './support';
import { sessionApi } from './support';
import { tab } from './support';
import { test } from './support';
import { openViewer } from './support';
import { publishPrepared } from './support';
import { waitForDisplay } from './support';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { SEAT_LAYOUTS } from '../../src/shared/venue';
import { SIGN_TYPES } from '../../src/shared/venue';
import type { Page } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import QRCode from 'qrcode';
import { TEMPLATE_IDS } from '../../src/shared/types';
import type { AssetRecord } from '../../src/shared/types';
import type { ViewSpec } from '../../src/shared/types';
import { samples } from '../../src/shared/template-examples';
import { validateView } from '../../src/shared/view-schemas';
import { showViewHeading } from '../../src/shared/display-guidance';
import { sessionDetail } from './support';

test.describe("reports coverage 1", () => {


test('product reports can be reviewed and created in the responsive activity workspace', async ({ page }) => {
  await register(page);
  const sessionId = await createSession(page, 'Product reporting loop');
  const display = await createDisplay(page, sessionId, 'Related screen');
  const seeded = await sessionApi<ReportRecord>(page, `/api/sessions/${sessionId}/error-reports`, 'POST', {
    requestId: 'reported-publishing-failure', title: 'Publishing needs clearer errors', description: 'A hand-built fact did not match the template.',
    client: 'claude', displayId: display.id, steps: ['Register a display', 'Submit a fact'], expected: 'An actionable validation error', actual: 'Generic failure',
  });
  expect(seeded.status).toBe(200);
  await tab(page, 'Activity');
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  const report = page.getByRole('article', { name: 'Report: Publishing needs clearer errors', exact: true });
  await expect(report).toBeVisible();
  await expect(report.getByRole('link', { name: 'Open related display' })).toHaveAttribute('href', `/view/${sessionId}/${display.id}`);
  await report.getByRole('button', { name: 'Review report', exact: true }).click();
  await report.getByLabel('Review status', { exact: true }).selectOption('resolved');
  await report.getByLabel('Review note', { exact: true }).fill('Verified the template-guided publish and clear validation response.');
  await report.getByRole('button', { name: 'Save review', exact: true }).click();
  await expect(report.getByText('Verified the template-guided publish and clear validation response.', { exact: true })).toBeVisible();
  await expect(report.getByRole('button', { name: 'Review report', exact: true })).toBeVisible();
  await page.getByLabel('Report status', { exact: true }).selectOption('open');
  await expect(report).toHaveCount(0);

  await page.getByRole('button', { name: 'Write a report', exact: true }).click();
  await page.getByLabel('Report type', { exact: true }).selectOption('feedback');
  await page.getByLabel('Report title', { exact: true }).fill('Keep viewer URLs easy to find');
  const text = '<script>window.reportExecuted = true</script> Show reports as text, not executable markup.';
  await page.getByLabel('What happened or could be better?', { exact: true }).fill(text);
  await page.getByLabel('Related display', { exact: true }).selectOption(display.id);
  await page.getByRole('button', { name: 'Submit report', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Report saved.');
  const feedback = page.getByRole('article', { name: 'Report: Keep viewer URLs easy to find', exact: true });
  await expect(feedback).toBeVisible(); await expect(feedback).toContainText(text);
  expect(await page.evaluate(() => 'reportExecuted' in window)).toBe(false);
  const stored = await sessionApi<ReportPage>(page, `/api/sessions/${sessionId}/reports`);
  expect(stored.data?.reports).toHaveLength(2);
  expect(stored.data?.reports.some(item => item.status === 'resolved' && item.history.length === 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
});

test('a live report review cannot silently overwrite a newer owner decision', async ({ page }) => {
  await register(page);
  const sessionId = await createSession(page, 'Concurrent report reviews');
  const seeded = await sessionApi<ReportRecord>(page, `/api/sessions/${sessionId}/feedback`, 'POST', { requestId: 'review-race', title: 'A shared review', description: 'Two browser tabs review the same report.' });
  expect(seeded.status).toBe(200);
  await tab(page, 'Activity'); await page.getByRole('button', { name: 'Reports', exact: true }).click();
  const report = page.getByRole('article', { name: 'Report: A shared review', exact: true });
  await report.getByRole('button', { name: 'Review report', exact: true }).click();
  await report.getByLabel('Review note', { exact: true }).fill('Keep my unsaved investigation note.');
  const updated = await sessionApi<ReportRecord>(page, `/api/sessions/${sessionId}/reports/${seeded.data!.id}`, 'PATCH', { expectedRevision: 0, status: 'resolved', note: 'Verified in another tab.' });
  expect(updated.status).toBe(200);
  await page.getByRole('button', { name: 'Refresh reports', exact: true }).click();
  await expect(report.getByRole('alert')).toContainText('Another review changed this report.');
  await expect(report.getByLabel('Review note', { exact: true })).toHaveValue('Keep my unsaved investigation note.');
  await expect(report.getByRole('button', { name: 'Save review', exact: true })).toBeDisabled();
  const stored = await sessionApi<ReportPage>(page, `/api/sessions/${sessionId}/reports`);
  expect(stored.data?.reports[0]).toMatchObject({ revision: 1, status: 'resolved' });
});
});

test.describe("reports coverage 2", () => {


test('diagnostic quota drops are quiet and back off browser uploads',async({page})=>{
 await register(page);
 const statuses=await page.evaluate(async()=>{
  const me=await(await fetch('/api/auth/me')).json(),supportRef=sessionStorage.getItem('kanvas-diagnostic-reference');
  const results:number[]=[];
  for(let i=0;i<27;i++)results.push((await fetch('/api/diagnostics',{method:'POST',headers:{'Content-Type':'application/json','X-Kanvas-CSRF':me.data.csrfToken},body:JSON.stringify({supportRef,windowId:crypto.randomUUID(),events:Array.from({length:i<7?20:1},()=>({event:'startup'}))})})).status);
  return results;
 });
 expect(statuses).toEqual(Array(27).fill(200));
 const dropped=page.waitForResponse(r=>r.url().endsWith('/api/diagnostics')&&r.request().method()==='POST'&&r.request().postData()?.includes('js-error')===true);
 await page.evaluate(()=>window.dispatchEvent(new ErrorEvent('error',{message:'Quota probe must not be retained'})));
 const response=await dropped;expect(response.status()).toBe(200);expect((await response.json()).data).toMatchObject({accepted:0,rateLimited:true});
 const uploads:string[]=[];page.on('request',r=>{if(r.url().endsWith('/api/diagnostics')&&r.method()==='POST')uploads.push(r.url());});
 await page.evaluate(()=>window.dispatchEvent(new PopStateEvent('popstate')));
 // Cross the normal five-second upload interval: the quota pause must prevent another attempt.
 await page.waitForTimeout(6500);expect(uploads).toEqual([]);
});
});

test.describe("reports coverage 3", () => {

async function setup(page:Page,baseURL:string){
 await register(page);const sessionId=await createSession(page,'October 17 acceptance'),display=await createDisplay(page,sessionId,'Feature screen'),viewer=await openViewer(page,sessionId,display.id);
 const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable feature test',scopes:['read','publish']});
 const client=new Client({name:'feedback-acceptance',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+issued.data!.token}}}));
 const call=async(operationId:string,args:Record<string,unknown>={})=>{const r=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});expect(r.isError,JSON.stringify(r.structuredContent)).not.toBe(true);return (r.structuredContent as any).data;};
 const update=(operationId:string,args:Record<string,unknown>)=>call(operationId,{sessionId,displayId:display.id,...args});
 const current=()=>waitForDisplay(page,sessionId,display.id,d=>d.revision>0&&d.appliedRevision===d.revision);
 const show=async(template:any,data:Record<string,unknown>)=>{await publishPrepared(page,sessionId,[display.id],{version:1,template,data});return current();};
 return {sessionId,display,viewer,client,call,update,current,show};
}
async function photo(v:Page,info:TestInfo,name:string){for(let i=0;i<5&&await v.getByRole('button',{name:'Dismiss notification',exact:true}).count();i++)await v.getByRole('button',{name:'Dismiss notification',exact:true}).first().click();await v.locator('.viewer-candidate .render-surface').first().screenshot({path:info.outputPath(name+'.png'),animations:'disabled'});expect(await v.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);}

async function fit(v:Page){
 await expect(v.locator('.fit-display')).toHaveAttribute('data-fit-scale',/^[0-9.]+$/);
 await v.waitForTimeout(200);
 const bounds=await v.locator('.fit-display').evaluate(box=>{const outer=box.getBoundingClientRect(),inner=box.firstElementChild!.getBoundingClientRect();const descendants=[...box.querySelectorAll<HTMLElement>('.seat,.menu-item,.menu-group article,.opening-hours>div,.sign-content')];return {scale:Number((box as HTMLElement).dataset.fitScale),fits:descendants.every(n=>{const b=n.getBoundingClientRect();return b.bottom<=outer.bottom+2&&b.right<=outer.right+2&&b.top>=outer.top-2&&b.left>=outer.left-2;}),height:inner.height,width:outer.width};});
 expect(bounds.scale).toBeGreaterThan(0);expect(bounds.scale).toBeLessThanOrEqual(1);
 // October26 supersedes shrinking menu text indefinitely: retain the font floor and expose scroll.
 if(!bounds.fits&&await v.locator('.menu-board').count()){
  const readable=await v.locator('.fit-display').evaluate(box=>({scrollable:getComputedStyle(box).overflow==='auto'&&box.scrollHeight>box.clientHeight,font:parseFloat(getComputedStyle(box.querySelector('.menu-item h3')!).fontSize)*Number((box as HTMLElement).dataset.fitScale)}));
  expect(readable.scrollable).toBe(true);expect(readable.font).toBeGreaterThanOrEqual(19.9);
 }else expect(bounds.fits,JSON.stringify(bounds)).toBe(true);
}

test('unchecked consent gives actionable feedback and never submits',async({page})=>{
 let consumed=0;await page.route('**/api/auth/email/inspect',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({data:{email:'test@example.test',originatingDevice:{code:'123456',device:'Your test device',createdAt:new Date().toISOString(),expiresAt:Date.now()+600000}}})}));
 await page.route('**/api/auth/email/consume',route=>{consumed++;return route.fulfill({contentType:'application/json',body:JSON.stringify({data:{approved:true}})});});
 await page.goto('/#email-signin='+ 'a'.repeat(43));await page.getByRole('button',{name:'Approve requesting device'}).click();await expect(page.getByRole('alert')).toContainText('Accept the Terms');expect(consumed).toBe(0);
 await page.getByRole('checkbox').first().check();await page.getByRole('button',{name:'Approve requesting device'}).click();await expect(page.getByRole('alert')).toContainText('code matches');expect(consumed).toBe(0);
 await page.getByRole('checkbox').nth(1).check();await page.getByRole('button',{name:'Approve requesting device'}).click();await expect(page.getByRole('status')).toContainText('requesting device is approved');expect(consumed).toBe(1);
});
});

test.describe("reports coverage 4", () => {


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

test('long browser feedback has an accurate counter and survives save/reload as complete text',async({page})=>{
  await register(page);const s=await createSession(page,'Richer feedback');await tab(page,'Activity');await page.getByRole('button',{name:'Reports',exact:true}).click();await page.getByRole('button',{name:'Write a report',exact:true}).click();
  await page.getByLabel('Report title',{exact:true}).fill('Detailed browser finding');const input=page.getByLabel('What happened or could be better?',{exact:true});await expect(input).toHaveAttribute('maxlength','12000');
  const description='A detailed finding.\n'+'漢'.repeat(9000);await input.fill(description);await expect(page.getByText(`${description.length} / 12000 characters.`,{exact:false})).toBeVisible();await page.getByRole('button',{name:'Submit report',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Report saved.');await page.reload();await tab(page,'Activity');await page.getByRole('button',{name:'Reports',exact:true}).click();await expect(page.getByRole('article',{name:'Report: Detailed browser finding'}).locator('.report-text').first()).toHaveText(description);
  const saved=await sessionApi<ReportPage>(page,`/api/sessions/${s}/reports`);expect(saved.data?.reports[0].description).toBe(description);
});
});
