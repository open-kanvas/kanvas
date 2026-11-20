import { operationRequest } from '../mcp/requests.js';
import { randomUUID } from 'node:crypto';
import { publicReference } from '../../src/server/mcp/operations';
import { mkdir } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { Page } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import type { DisplayRecord } from '../../src/shared/types';
import type { InteractionRecord } from '../../src/shared/types';
import type { UpdateRecord } from '../../src/shared/types';
import type { ViewSpec } from '../../src/shared/types';
import { createDisplay } from './support';
import { createSession } from './support';
import { expect } from './support';
import { openViewer } from './support';
import { publishPrepared } from './support';
import { register } from './support';
import { sessionApi } from './support';
import { sessionDetail } from './support';
import { test } from './support';
import { waitForDisplay } from './support';
import { validateView } from '../../src/shared/view-schemas';
import { samples } from '../../src/shared/template-examples';
import { gameExample } from '../../src/shared/game';
import { emailRuntime } from './email-oauth-fixture';
import { beginEmailConnector } from './email-oauth-fixture';
import { SEAT_LAYOUTS } from '../../src/shared/venue';
import { SIGN_TYPES } from '../../src/shared/venue';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Browser } from '@playwright/test';
import { tab } from './support';
import { advancedChartExamples } from '../../src/shared/advanced-chart-examples';

test.describe("media coverage 1", () => {


async function setup(page:Page,info:TestInfo){await register(page);const s=await createSession(page,'Evening feedback verification'),d=await createDisplay(page,s,'Test surface'),viewer=await openViewer(page,s,d.id);if(info.project.name.startsWith('phone'))await viewer.setViewportSize({width:443,height:823});await viewer.bringToFront();return {s,d,viewer};}
async function connect(page:Page,baseURL:string,s:string){const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable evening acceptance',scopes:['read','publish'],sessionIds:[s]});expect(issued.status).toBe(201);const client=new Client({name:'evening-acceptance',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${issued.data!.token}`}}}));return client;}
async function call<T=unknown>(client:Client,name:string,args:Record<string,unknown>):Promise<T>{const ref=publicReference(name);if(!ref)throw new Error('Missing public mapping');const result=await client.callTool(operationRequest({name:ref.tool,arguments:{operation:ref.operation,...args}}));expect(result.isError,`${name} succeeds`).not.toBe(true);return (result.structuredContent as {data:T}).data;}
async function ready(page:Page,s:string,d:string,template?:string){return waitForDisplay(page,s,d,x=>(!template||x.view?.template===template)&&x.revision>0&&x.appliedRevision===x.revision);}
async function photo(viewer:Page,info:TestInfo,label:string){
  // Text exists before a staged candidate becomes the visible painted frame.
  // Capture the settled screen, not that deliberately hidden preparation stage.
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status','ready');
  await expect.poll(()=>viewer.locator('.viewer-shell').evaluate(el=>el.getAttribute('data-revision')===el.getAttribute('data-rendered-revision'))).toBe(true);
  await expect(viewer.locator('.viewer-candidate')).toBeVisible();
  if(label==='procedure')await expect(viewer.locator('.viewer-candidate .procedure-instruction')).toBeInViewport();
  await viewer.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await mkdir(info.outputPath('visuals'),{recursive:true});await viewer.screenshot({path:`${info.outputPath('visuals')}/${info.project.name}-${label}.png`,animations:'disabled'});
}

test('settings apply selections immediately and notify the agent',async({page},info)=>{
  const {s,d,viewer}=await setup(page,info);await publishPrepared(page,s,[d.id],{version:1,template:'settings',data:{description:'Choose your appearance'}});await ready(page,s,d.id,'settings');
  await viewer.getByRole('radio',{name:'Iris',exact:true}).check();await expect.poll(async()=>(await sessionDetail(page,s)).session.config.style).toBe('iris');
  await viewer.getByRole('radio',{name:'Light',exact:true}).check();await expect.poll(async()=>(await sessionDetail(page,s)).session.config.theme).toBe('light');
  await expect(viewer.getByRole('radio',{name:'Iris',exact:true})).toBeChecked();await expect(viewer.getByRole('button',{name:'Apply settings',exact:true})).toHaveCount(0);
  await expect(viewer.getByText('Settings saved.',{exact:true})).toBeVisible();await expect(viewer.locator('.viewer-shell')).toHaveClass(/theme-light/);
  const detail=await sessionDetail(page,s);expect(detail.session.config).toMatchObject({style:'iris',theme:'light'});expect(detail.interactions.some(x=>x.actionId==='settings.changed')).toBe(true);await photo(viewer,info,'settings');
});
});

test.describe("media coverage 2", () => {

const quiet=async(page:Page)=>{for(const button of await page.locator('.viewer-toast button').all())await button.click();};
const fact=(text:string)=>({version:1 as const,template:'fact' as const,data:{text}});


test('phone split waits for delayed media in a hidden pane before acknowledging paint',async({page},info)=>{
 await register(page);const s=await createSession(page,'Pane media readiness'),d=await createDisplay(page,s,'Media'),viewer=await openViewer(page,s,d.id);await viewer.setViewportSize({width:390,height:844});
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let requested=false;
 await viewer.route('https://example.com/slow-pane.svg',async route=>{requested=true;await gate;await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="green"/></svg>'});});
 await publishPrepared(page,s,[d.id],validateView({template:'split-screen',data:{panes:[{id:'text',view:fact('Visible first pane')},{id:'media',view:{version:1,template:'image',data:{images:[{url:'https://example.com/slow-pane.svg',alt:'Delayed pane media'}]}}}]}}));
 await expect.poll(()=>requested).toBe(true);const pending=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!;expect(pending.appliedRevision).not.toBe(pending.revision);release();await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision);
 /* 0.38.0: both panes are on screen on a phone; there is no tab to choose. */await expect(viewer.locator('.viewer-candidate .split-screen>nav')).toHaveCount(0);await expect(viewer.frameLocator('iframe[title="Pane media"]').getByRole('img',{name:'Delayed pane media',exact:true})).toBeVisible();await quiet(viewer);await viewer.screenshot({path:info.outputPath('split-hidden-media.png')});
});
});

test.describe("media coverage 3", () => {

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
async function photo(v:Page,info:TestInfo,name:string){await v.locator('.viewer-candidate .render-surface').first().screenshot({path:info.outputPath(name+'.png'),animations:'disabled'});expect(await v.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);}
test('user media upload and private template publish/update work through browser and real MCP',async({page,baseURL},info)=>{
 const a=await setup(page,baseURL!);try{
 await page.goto('/admin?account');await page.getByRole('button',{name:'Media library',exact:true}).click();
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=','base64');
 await page.getByLabel('Tags (comma-separated)').fill('lunch, special');await page.getByLabel('Add images',{exact:true}).setInputFiles({name:'Lunch photo.png',mimeType:'image/png',buffer:png});await expect(page.getByRole('status')).toContainText('Uploaded');await page.screenshot({path:info.outputPath('media-library.png'),animations:'disabled'});
 const media=await a.call('kanvas.media.list',{query:'lunch'});expect(media.media).toHaveLength(1);
 await a.show('todays-special',{item:{image:media.media[0].url}});await expect(a.viewer.locator('.hero-image')).toBeVisible();expect(await a.viewer.locator('.hero-image').evaluate((x:HTMLImageElement)=>x.naturalWidth)).toBe(1);
 const t=await a.call('kanvas.account.templates.create',{name:'My weekly team list',schema:{type:'object',properties:{title:{type:'string'},items:{type:'array',items:{type:'object',properties:{name:{type:'string'}},required:['name']}}},required:['title','items']},html:'<main><h1>{{title}}</h1><ul>{{#each items}}<li>{{name}}</li>{{/each}}</ul></main>',css:'main{padding:30px}h1{font-size:48px}li{font-size:28px;line-height:2}'});
 const discover=await a.client.callTool({name:'kanvas_discover',arguments:{catalog:'templates',action:'search',query:'My weekly team list',limit:5}});expect(JSON.stringify(discover)).toContain(t.id);
 await a.call('kanvas.account.templates.publish',{templateId:t.id,values:{title:'Our week',items:[{name:'Peter'},{name:'Karen'}]},sessionId:a.sessionId,displayIds:[a.display.id]});await a.current();const frame=a.viewer.frameLocator('iframe[title="Custom template"]');await expect(frame.getByRole('heading',{name:'Our week'})).toBeVisible();await expect(frame.locator('li')).toHaveCount(2);await photo(a.viewer,info,'custom-template');
 await a.update('kanvas.view.patch',{operations:[{op:'set',path:'/data/values/title',value:'Updated live'}]});await a.current();await expect(frame.getByRole('heading',{name:'Updated live'})).toBeVisible();
 expect(await a.viewer.locator('iframe[title="Custom template"]').getAttribute('sandbox')).toBe('');
 }finally{await a.client.close();}
});
});

test.describe("media coverage 4", () => {

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
test('reusable imported media paints in image renderer; failures surface to MCP',async({page,baseURL,diagnostics},info)=>{
 const a=await setup(page,baseURL!);try{
 const asset=await a.call('kanvas.asset.import',{sessionId:a.sessionId,name:'Reusable.png',mimeType:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII='});
 const media=await a.call('kanvas.media.import',{sessionId:a.sessionId,assetId:asset.id,tags:['reuse']});expect((await a.call('kanvas.media.list',{query:'Reusable'})).media).toHaveLength(1);
 for(const url of [asset.url,media.url]){await a.show('image',{images:[{url,alt:'Uploaded image'}]});await expect.poll(()=>a.viewer.locator('.image-frame img').evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBe(1);}
 await page.goto('/admin?account=media');await expect(page.getByRole('heading',{name:'Your media library'})).toBeVisible();await photo(a.viewer,info,'image-library');
 diagnostics.allowHttp(a.viewer,asset.url,404);
 await a.viewer.route('**'+asset.url,route=>route.fulfill({status:404,body:'Missing'}));
 // Failure must be inspected without waiting for successful delivery acknowledgement.
 await publishPrepared(page,a.sessionId,[a.display.id],{version:1,template:'image',data:{images:[{url:asset.url}]}});await expect(a.viewer.getByText('Image unavailable',{exact:true})).toBeVisible();
 await expect.poll(async()=>{const s=await a.call('kanvas.session.state',{sessionId:a.sessionId});return JSON.stringify(s);}).toContain('HTTP_404');
 }finally{await a.client.close();}
});
});

test.describe("media coverage 5", () => {

const pixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=';
test('failed individual image remains a visible placeholder without losing the new view',async({page},info)=>{
 await register(page);const sessionId=await createSession(page,'Image fallback acceptance'),d=await createDisplay(page,sessionId,'Images'),viewer=await openViewer(page,sessionId,d.id);
 await viewer.context().route('https://images.example.test/**',route=>route.fulfill({status:200,contentType:'image/png',body:route.request().url().includes('good')?Buffer.from(pixel,'base64'):Buffer.from('not an image')}));
 await viewer.route('**/image-fallback',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{status:'unavailable',message:'Synthetic source unavailable'}})}));
 await publishPrepared(page,sessionId,[d.id],{version:1,template:'fact',data:{text:'Previous unrelated content'}});
 await waitForDisplay(page,sessionId,d.id,x=>x.appliedRevision===x.revision&&x.revision>0);
 await publishPrepared(page,sessionId,[d.id],{version:1,template:'comparison',data:{items:[{name:'Option One',values:{Price:'10'},image:{url:'https://images.example.test/good.png',alt:'Available photo'}},{name:'Option Two',values:{Price:'20'},image:{url:'https://images.example.test/bad.png',alt:'Unavailable photo'}}],criteria:['Price'],commentary:{Price:'Both options remain visible'}}});
 await expect(viewer.locator('.viewer-candidate .media-unavailable')).toBeVisible();
 await waitForDisplay(page,sessionId,d.id,x=>x.appliedRevision===x.revision&&x.revision>1);
 await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status','ready');
 await expect(viewer.locator('.viewer-candidate')).toContainText('Option One');await expect(viewer.locator('.viewer-candidate')).toContainText('Option Two');
 await expect(viewer.locator('.viewer-last-good')).toHaveCount(0);
 const placeholder=viewer.locator('.viewer-candidate .media-unavailable'),slot=placeholder.locator('..'),label=slot.locator('..').locator('.comparison-name');
 const pb=await placeholder.boundingBox(),sb=await slot.boundingBox(),lb=await label.boundingBox();expect(pb).not.toBeNull();expect(sb).not.toBeNull();expect(lb).not.toBeNull();expect(pb!.height).toBeLessThanOrEqual(sb!.height+1);expect(pb!.y+pb!.height).toBeLessThanOrEqual(lb!.y);
 await expect(placeholder).toHaveAttribute('title','Synthetic source unavailable');
 await viewer.screenshot({path:info.outputPath('image-degraded-ready.png'),animations:'disabled'});
});
});

test.describe("media coverage 6", () => {
    async function setup(page: Page, info: TestInfo, baseURL: string) {
        await register(page);
        const s = await createSession(page, 'September improvements'), d = await createDisplay(page, s, 'Acceptance screen'), v = await openViewer(page, s, d.id);
        const issued = await sessionApi<{
            token: string;
        }>(page, '/api/tokens', 'POST', { name: 'Disposable September acceptance', scopes: ['read', 'publish'] });
        expect(issued.status).toBe(201);
        const headers = { Authorization: `Bearer ${issued.data!.token}` }, client = info.project.name.startsWith('phone') ? new LegacyClient({ name: 'september-legacy', version: '1' }) : new Client({ name: 'september-current', version: '1' });
        if (client instanceof LegacyClient)
            await client.connect(new LegacyTransport(new URL('/mcp', baseURL), { requestInit: { headers } }));
        else
            await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseURL), { requestInit: { headers } }));
        const call = async (name: string, operation: string, args: Record<string, unknown> = {}) => { const r = await client.callTool(operationRequest({ name, arguments: { operation, ...args } })); expect(r.isError, `${name}/${operation}: ${JSON.stringify(r.isError ? r.content : [])}`).not.toBe(true); expect((r.structuredContent as any).truncated).not.toBe(true); return (r.structuredContent as any).data; };
        const current = async () => { const r = (await sessionDetail(page, s)).displays.find(x => x.id === d.id)!; return r; };
        const painted = async (revision: number) => { await expect(v.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision', String(revision)); await expect(v.locator('.viewer-shell')).toHaveAttribute('data-render-status', 'ready'); };
        const show = async (view: ViewSpec) => { const before = await current(); await publishPrepared(page, s, [d.id], view); const next = await waitForDisplay(page, s, d.id, x => x.revision > before.revision && x.appliedRevision === x.revision); await painted(next.revision); return next; };
        const nav = async (navigation: unknown) => call("kanvas_call", "kanvas.navigation.control", { sessionId: s, displayId: d.id, expectedRevision: (await current()).revision, requestId: randomUUID(), navigation });
        return { s, d, v, client, call, current, painted, show, nav };
    }
    type Fixture = Awaited<ReturnType<typeof setup>>;
    async function photo(page: Page, info: TestInfo, name: string) { for (const notice of await page.getByRole('button', { name: 'Dismiss notification', exact: true }).all())
        await notice.click(); await page.evaluate(() => document.fonts.ready); await mkdir(info.outputPath('visuals'), { recursive: true }); await page.screenshot({ path: `${info.outputPath('visuals')}/${info.project.name}-${name}.png`, animations: 'disabled' }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true); }
    async function asset(a: Fixture, color = '#267f9f', w = 240, h = 120) { return a.call("kanvas_call", "kanvas.asset.import", { sessionId: a.s, name: 'Acceptance logo.svg', mimeType: 'image/svg+xml', base64: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect x="1" y="1" width="${w - 2}" height="${h - 2}" fill="${color}" stroke="#ffffff" stroke-width="2"/><circle cx="${w / 2}" cy="${h / 2}" r="${h / 3}" fill="#ffffff"/><text x="${w / 2}" y="${h / 2 + 5}" text-anchor="middle" fill="${color}" font-size="16">K</text></svg>`).toString('base64') }); }
    async function counterpart(a: Fixture, page: Page, browser: Browser, info: TestInfo, baseURL: string) {
        const context = await browser.newContext({ baseURL, viewport: info.project.name.startsWith('phone') ? { width: 1440, height: 900 } : { width: 390, height: 844 }, colorScheme: 'dark', reducedMotion: 'reduce' }), peer = await context.newPage(), account = await register(peer);
        await a.call("kanvas_call", "kanvas.profile.update", { expectedRevision: 0, displayName: 'Alex · host' });
        expect((await sessionApi(page, `/api/sessions/${a.s}/members`, 'POST', { username: account.username, role: 'viewer' })).status).toBe(200);
        await peer.goto(`/view/${a.s}/${a.d.id}`);
        await expect(peer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision', String((await a.current()).revision));
        return { context, peer };
    }
    async function word(page: Page, selector: string, needle: string) { return page.locator(selector).evaluate((el, text) => { const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const at = n.textContent!.indexOf(text);
        if (at < 0)
            continue;
        const range = document.createRange();
        range.setStart(n, at);
        range.setEnd(n, at + text.length);
        const r = range.getClientRects()[0];
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, width: r.width, height: r.height };
    } throw new Error('Word is not rendered'); }, needle); }
    async function pointAt(page: Page, selector: string) { const r = await page.locator(selector).boundingBox(); expect(r).not.toBeNull(); await page.mouse.click(r!.x + r!.width / 2, r!.y + r!.height / 2); }
    test('all sixteen teams fit with loaded logos; exact standings and uncropped galleries retain optional metadata', async ({ page, baseURL }, info) => {
        const a = await setup(page, info, baseURL!);
        try {
            const blue = await asset(a), amber = await asset(a, '#925600', 100, 240);
            for (const count of [2, 4, 8, 16]) {
                await a.show({ version: 1, template: 'scoreboard', data: { sides: Array.from({ length: count }, (_, i) => ({ id: `team-${i}`, name: `Team ${i + 1}`, score: i === 2 ? 'Winner' : i * 7, logo: { url: i % 2 ? amber.url : blue.url, alt: `Team ${i + 1} logo` } })) } });
                await expect(a.v.locator('.scoreboard-side')).toHaveCount(count);
                const bounds = await a.v.locator('.scoreboard-content').evaluate(el => { const box = el.getBoundingClientRect(), violations = [...el.querySelectorAll('.scoreboard-side,.scoreboard-score,.scoreboard-side h2,img')].flatMap(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= box.left - 2 && r.right <= box.right + 2 && r.top >= box.top - 2 && r.bottom <= box.bottom + 2 ? [] : [{tag:e.tagName, class:e.className, text:e.textContent, box:r.toJSON()}]; }); return {fits:el.scrollHeight <= el.clientHeight + 2 && !violations.length, scrollHeight:el.scrollHeight, clientHeight:el.clientHeight, box:box.toJSON(), violations}; });
                if (!bounds.fits) await a.v.screenshot({path:info.outputPath('scoreboard-'+count+'-overflow.png'),animations:'disabled'});
                expect(bounds.fits, JSON.stringify({count,...bounds})).toBe(true);
                expect(await a.v.locator('.scoreboard-logo img').evaluateAll(imgs => imgs.every(i => (i as HTMLImageElement).naturalWidth > 0 && getComputedStyle(i).objectFit === 'contain'))).toBe(true);
                expect(await a.v.locator('.scoreboard-side').evaluateAll(sides => sides.every(el => { const b = el.getBoundingClientRect(); return [...el.querySelectorAll('h2,strong,button,img')].every(c => { const r = c.getBoundingClientRect(); return r.left >= b.left - 2 && r.right <= b.right + 2 && r.top >= b.top - 2 && r.bottom <= b.bottom + 2; }); }))).toBe(true);
            }
            await photo(a.v, info, 'sixteen-teams');
            await a.show({ version: 1, template: 'standings', data: { columns: [{ id: 'points', label: 'Points' }], groups: [{ id: 'g', rows: [{ id: 'a', name: 'Amber', position: 1, logo: { url: amber.url }, values: { points: '9007199254740993.001' } }, { id: 'b', name: 'Blue', position: 2, logo: { url: blue.url }, values: { points: '1.2300' } }] }] } });
            await expect(a.v.locator('.standings-content')).toContainText('9007199254740993.001');
            await expect(a.v.locator('.standings-logo img')).toHaveCount(2);
            await photo(a.v, info, 'standings-logos');
            const images = Array.from({ length: 6 }, (_, i) => ({ url: i % 2 ? amber.url : blue.url, alt: `Complete image ${i}`, title: `Hidden title ${i}`, caption: `Hidden caption ${i}` }));
            await a.show({ version: 1, template: 'image-gallery', data: { mode: 'grid', columns: 2, images } });
            await expect(a.v.locator('.gallery-frames>figure:visible')).toHaveCount(6);
            await expect(a.v.locator('.gallery-frames h2,.gallery-frames figcaption')).toHaveCount(0);
            expect(await a.v.locator('.gallery-frames img').evaluateAll(imgs => imgs.every(i => (i as HTMLImageElement).naturalWidth > 0 && getComputedStyle(i).objectFit === 'contain'))).toBe(true);
            await photo(a.v, info, 'image-grid');
            await a.show({ version: 1, template: 'image-gallery', data: { mode: 'carousel', images: images.map((x, i) => i === 1 ? { ...x, showCaption: true } : x) } });
            await a.nav({ action: 'page', page: 2 });
            await expect(a.v.locator('.gallery-frames>figure:visible')).toContainText('Hidden caption 1');
            await expect(a.v.locator('.gallery-frames>figure:visible')).not.toContainText('Source 1');
            await expect(a.v.locator('.gallery-frames h2')).toHaveCount(0);
            await photo(a.v, info, 'image-carousel');
            await a.v.getByRole('button', { name: 'Next image', exact: true }).click();
            await expect(a.v.locator('.gallery-frames>figure:visible')).toHaveAttribute('data-image-index', '2');
        }
        finally {
            await a.client.close();
        }
    });
});

test.describe("media coverage 7", () => {
    async function setup(page: Page, info: TestInfo, baseURL: string) {
        await register(page);
        const s = await createSession(page, 'September 23 feedback'), d = await createDisplay(page, s, 'Acceptance screen'), v = await openViewer(page, s, d.id);
        const issued = await sessionApi<{
            token: string;
        }>(page, '/api/tokens', 'POST', { name: 'Disposable September acceptance', scopes: ['read', 'publish'] });
        expect(issued.status).toBe(201);
        const headers = { Authorization: `Bearer ${issued.data!.token}` }, client = info.project.name.startsWith('phone') ? new LegacyClient({ name: 'september-legacy', version: '1' }) : new Client({ name: 'september-current', version: '1' });
        if (client instanceof LegacyClient)
            await client.connect(new LegacyTransport(new URL('/mcp', baseURL), { requestInit: { headers } }));
        else
            await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseURL), { requestInit: { headers } }));
        const call = async (name: string, operation: string, args: Record<string, unknown> = {}) => { const r = await client.callTool(operationRequest({ name, arguments: { operation, ...args } })); expect(r.isError, `${name}/${operation}: ${JSON.stringify(r.isError ? r.content : [])}`).not.toBe(true); expect((r.structuredContent as any).truncated).not.toBe(true); return (r.structuredContent as any).data; };
        const current = async () => { const r = (await sessionDetail(page, s)).displays.find(x => x.id === d.id)!; return r; };
        const painted = async (revision: number) => { await expect(v.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision', String(revision)); await expect(v.locator('.viewer-shell')).toHaveAttribute('data-render-status', 'ready'); };
        const show = async (view: ViewSpec) => { const before = await current(); await publishPrepared(page, s, [d.id], view); const next = await waitForDisplay(page, s, d.id, x => x.revision > before.revision && x.appliedRevision === x.revision); await painted(next.revision); return next; };
        const nav = async (navigation: unknown) => call("kanvas_call", "kanvas.navigation.control", { sessionId: s, displayId: d.id, expectedRevision: (await current()).revision, requestId: randomUUID(), navigation });
        return { s, d, v, client, call, current, painted, show, nav };
    }
    type Fixture = Awaited<ReturnType<typeof setup>>;
    test.setTimeout(180000);
    async function stable(page: Page, selector: string) {
        const sizes = await page.locator(selector).evaluate(async (el) => { const values: string[] = []; for (let i = 0; i < 65; i++) {
            await new Promise(requestAnimationFrame);
            const r = el.getBoundingClientRect();
            if (i >= 20)
                values.push([r.width, r.height, el.scrollWidth, el.scrollHeight].map(x => Math.round(x * 2) / 2).join(':'));
        } return [...new Set(values)]; });
        expect(sizes, 'Settled chart geometry must not oscillate between scrollbar sizes').toHaveLength(1);
    }
    async function contained(page: Page, selector: string) {
        expect(await page.locator(selector).evaluate(el => ({ horizontal: el.scrollWidth - el.clientWidth, vertical: el.scrollHeight - el.clientHeight }))).toEqual({ horizontal: 0, vertical: 0 });
    }
    test('balanced image grids expand and return, and public carousels follow broadcasts and reload position', async ({ page, baseURL, browser, diagnostics }, info) => {
        const a = await setup(page, info, baseURL!);
        let context: Awaited<ReturnType<Browser['newContext']>> | undefined;
        try {
            const image = await asset(a), images = Array.from({ length: 20 }, (_, i) => ({ url: image.url, alt: `Image ${i + 1}`, title: `Hidden ${i + 1}`, caption: 'Hidden caption' }));
            for (const count of [4, 6, 20]) {
                await a.show({ version: 1, template: 'image-gallery', data: { images: images.slice(0, count) } });
                await expect(a.v.locator('.gallery-frames>figure:visible')).toHaveCount(count);
                const columns = await a.v.locator('.gallery-frames').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
                if (count === 4)
                    expect(columns).toBe(2);
                if (count === 6)
                    expect(columns).toBe(info.project.name.startsWith('phone') ? 2 : 3);
                await expect(a.v.locator('.gallery-frames h2,.gallery-frames figcaption')).toHaveCount(0);
                await a.v.getByRole('button', { name: 'Enlarge Image 2', exact: true }).click();
                await expect(a.v.locator('.gallery-frames>figure:visible')).toHaveAttribute('data-image-index', '1');
                await a.v.getByRole('button', { name: 'Back to image grid' }).click();
                await expect(a.v.locator('.gallery-frames>figure:visible')).toHaveCount(count);
            }
            await photo(a.v, info, 'gallery-twenty');
            await a.show({ version: 1, template: 'image-gallery', data: { mode: 'carousel', images: images.slice(0, 4) } });
            const access = await a.call("kanvas_call", "kanvas.session.public.access", { sessionId: a.s, expectedRevision: 0, enabled: true, confirm: true });
            expect(access).toBeTruthy();
            context = await browser.newContext({ baseURL, viewport: info.project.use.viewport, hasTouch: true, colorScheme: 'dark', reducedMotion: 'reduce' });
            const publicPage = await context.newPage();
            diagnostics.watch(publicPage);
            await publicPage.goto(`/view/${a.s}/${a.d.id}`);
            await expect(publicPage.locator('.gallery-frames>figure:visible')).toHaveAttribute('data-image-index', '0');
            await a.nav({ action: 'page', page: 3 });
            await expect(publicPage.locator('.gallery-frames>figure:visible')).toHaveAttribute('data-image-index', '2');
            await publicPage.reload();
            await expect(publicPage.locator('.gallery-frames>figure:visible')).toHaveAttribute('data-image-index', '2');
            const touch = await context.newCDPSession(publicPage);
            await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 280, y: 220 }] });
            await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 90, y: 224 }] });
            await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await touch.detach();
            await expect(publicPage.locator('.gallery-frames>figure:visible')).toHaveAttribute('data-image-index', '3');
            await expect(a.v.locator('.gallery-frames>figure:visible')).toHaveAttribute('data-image-index', '2');
            await a.nav({ action: 'page', page: 2 });
            await expect(publicPage.locator('.gallery-frames>figure:visible')).toHaveAttribute('data-image-index', '1');
            await photo(publicPage, info, 'public-carousel');
        }
        finally {
            await context?.close();
            await a.client.close();
        }
    });
    async function photo(page: Page, info: TestInfo, name: string) { for (const notice of await page.getByRole('button', { name: 'Dismiss notification', exact: true }).all())
        await notice.click(); await page.evaluate(() => document.fonts.ready); await mkdir(info.outputPath('visuals'), { recursive: true }); await page.screenshot({ path: `${info.outputPath('visuals')}/${info.project.name}-${name}.png`, animations: 'disabled' }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true); }
    async function asset(a: Fixture, color = '#267f9f', w = 240, h = 120) { return a.call("kanvas_call", "kanvas.asset.import", { sessionId: a.s, name: 'Acceptance logo.svg', mimeType: 'image/svg+xml', base64: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect x="1" y="1" width="${w - 2}" height="${h - 2}" fill="${color}" stroke="#ffffff" stroke-width="2"/><circle cx="${w / 2}" cy="${h / 2}" r="${h / 3}" fill="#ffffff"/><text x="${w / 2}" y="${h / 2 + 5}" text-anchor="middle" fill="${color}" font-size="16">K</text></svg>`).toString('base64') }); }
});
