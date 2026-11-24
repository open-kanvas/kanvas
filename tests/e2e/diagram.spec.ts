import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createDisplay } from './support';
import { createSession } from './support';
import { expect } from './support';
import { login } from './support';
import { openViewer } from './support';
import { publishPrepared } from './support';
import { register } from './support';
import { sessionApi } from './support';
import { sessionDetail } from './support';
import { test } from './support';
import { viewerPath } from './support';
import { waitForDisplay } from './support';
import { validateView } from '../../src/shared/view-schemas';
import { samples } from '../../src/shared/template-examples';
import { Store } from '../../src/server/store';
import { testDatabase } from '../postgres';
import type { ViewSpec } from '../../src/shared/types';
import { operationId } from '../../src/server/mcp/operations';
import { mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import QRCode from 'qrcode';
import type { TestInfo } from '@playwright/test';
import { TEMPLATE_IDS } from '../../src/shared/types';
import type { AssetRecord } from '../../src/shared/types';
import { showViewHeading } from '../../src/shared/display-guidance';
import type { ReportPage } from '../../src/shared/reports';
import { tab } from './support';
import { operationRequest } from '../mcp/requests.js';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Browser } from '@playwright/test';
import type { DisplayRecord } from '../../src/shared/types';

test.describe("diagram coverage 1", () => {


const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({template,data,...extra} as never) as ViewSpec;
/** Publish and wait until this window has painted that revision: a measurement taken while the previous
 * view is being replaced reads an element that is already detached (empty computed style, no box). */
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov10 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov10-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const inside=(inner:{x:number;y:number;width:number;height:number},outer:{x:number;y:number;width:number;height:number},slack=1.5)=>inner.x>=outer.x-slack&&inner.y>=outer.y-slack&&inner.x+inner.width<=outer.x+outer.width+slack&&inner.y+inner.height<=outer.y+outer.height+slack;

test('diagram zoom enlarges, text scale grows the whole diagram, a small diagram fills the screen (32b32d20)',async({page},info)=>{
 const {s,d,viewer}=await setup(page,'Diagram zoom');
 const nodes=Array.from({length:6},(_,i)=>({id:`n${i}`,label:`Service ${i+1}`,detail:'Handles one job',type:'service'})),edges=Array.from({length:5},(_,i)=>({from:`n${i}`,to:`n${i+1}`}));
 // While one view replaces another the diagram is briefly absent; a poll then reads 0 and tries again.
 const width=async()=>(await viewer.locator('.viewer-candidate .relationship-diagram').boundingBox().catch(()=>null))?.width??0;
 await publishPrepared(page,s,[d.id],view('architecture',{layout:'left-right',nodes,edges}));await expect(viewer.locator('.viewer-candidate .relationship-diagram')).toBeVisible();await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision);
 const fitted=await width();
 const store=new Store(testDatabase(process.env.KANVAS_E2E_RUN_ID!));let tab:string;try{await store.ready;await expect.poll(async()=>(await store.list<{displayId:string;tabId:string}>('viewer',s)).some(v=>v.displayId===d.id),{timeout:10000}).toBe(true);tab=(await store.list<{displayId:string;tabId:string}>('viewer',s)).find(v=>v.displayId===d.id)!.tabId;}finally{await store.close();}
 const revision=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!.revision;
 for(const scale of [1.4,2.5]){
  expect((await sessionApi(page,`/api/sessions/${s}/displays/${d.id}/navigation`,'POST',{tabId:tab,requestId:randomUUID(),expectedRevision:revision,navigation:{action:'zoom',scale}})).status).toBe(200);
  await expect.poll(async()=>(await width())/fitted,{timeout:8000,message:`zoom ${scale} enlarges the diagram`}).toBeGreaterThan(scale*.8);
 }
 await viewer.screenshot({path:info.outputPath('architecture-zoomed.png')});
 expect((await sessionApi(page,`/api/sessions/${s}/displays/${d.id}/navigation`,'POST',{tabId:tab,requestId:randomUUID(),expectedRevision:revision,navigation:{action:'zoom',scale:1}})).status).toBe(200);
 await expect.poll(async()=>Math.abs((await width())/fitted-1)).toBeLessThan(.05);
 await shown(page,viewer,s,d.id,view('architecture',{layout:'left-right',textScale:1.8,nodes,edges}));
 await expect.poll(async()=>(await width())/fitted,{timeout:8000}).toBeGreaterThan(1.6);
 // Two nodes on a large screen: enlarged beyond natural size so labels read from a distance.
 if(!info.project.name.startsWith('phone')){await shown(page,viewer,s,d.id,view('architecture',{layout:'left-right',nodes:nodes.slice(0,2),edges:edges.slice(0,1)}));await expect.poll(async()=>Number(await viewer.locator('.viewer-candidate .diagram-scroll').getAttribute('data-diagram-scale')),{timeout:8000}).toBeGreaterThan(1.2);}
});
});

test.describe("diagram coverage 2", () => {
    const view = (template: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) => validateView({ version: 1, template, data, ...extra } as never) as ViewSpec;
    const shown = async (page: Page, viewer: Page, s: string, displayId: string, spec: ViewSpec) => { await publishPrepared(page, s, [displayId], spec); const current = await waitForDisplay(page, s, displayId, x => x.revision > 0 && x.appliedRevision === x.revision); await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision', String(current.revision)); return current; };
    const setup = async (page: Page, name: string) => { await register(page); const s = await createSession(page, name), d = await createDisplay(page, s, 'Display'), viewer = await openViewer(page, s, d.id); return { s, d, viewer }; };
    const mcp = async (page: Page, baseURL: string) => { const token = await sessionApi<{
        token: string;
    }>(page, '/api/tokens', 'POST', { name: 'Nov14 fixture', scopes: ['read', 'publish'] }); const { Client, StreamableHTTPClientTransport } = await import('@modelcontextprotocol/client'); const client = new Client({ name: 'nov14-fixture', version: '1' }); await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseURL), { requestInit: { headers: { Authorization: 'Bearer ' + token.data!.token } } })); return client; };
    const use = async (client: Awaited<ReturnType<typeof mcp>>, canonical: string, args: Record<string, unknown>) => { const result = await client.callTool({ name: 'kanvas_call', arguments: { operationId: operationId(canonical), arguments: args } }); return { isError: result.isError === true, structured: result.structuredContent as Record<string, any> }; };
    const fact = (text: string) => ({ version: 1, template: 'fact', data: { text } });
    const pane = (id: string, inner: Record<string, unknown> = fact(id)) => ({ id, view: inner });
    const pie = (kind: 'pie' | 'donut') => ({ version: 1, template: 'chart', data: { kind, series: [{ name: 'Share', points: [{ x: 'Alpha', y: 40 }, { x: 'Beta', y: 30 }, { x: 'Gamma', y: 20 }, { x: 'Delta', y: 10 }] }] } });
    test('text size applies to every template and survives a reload; fit shows a whole diagram (0448f65b, 363457fe)', async ({ page, baseURL }) => {
        const { s, d, viewer } = await setup(page, 'Text size');
        const client = await mcp(page, baseURL!);
        try {
            await shown(page, viewer, s, d.id, view('task-list', { items: [{ title: 'First task' }, { title: 'Second task' }] }));
            const title = viewer.locator('.viewer-candidate .task-item strong').first(), surface = viewer.locator('.viewer-candidate .render-surface');
            const before = (await title.boundingBox())!.height;
            const state = (await use(client, "kanvas.session.state", { sessionId: s })).structured.data;
            const set = await use(client, "kanvas.settings.update", { sessionId: s, expectedRevision: state.session?.configRevision ?? state.configRevision ?? 0, config: { textSize: 150 } });
            expect(set.isError, JSON.stringify(set.structured).slice(0, 300)).toBe(false);
            await expect(surface).toHaveAttribute('data-text-scale', '1.5');
            await expect(surface).toHaveAttribute('data-text-mode', 'content');
            await expect.poll(async () => (await title.boundingBox())!.height / before).toBeGreaterThan(1.35);
            // The enlarged list still occupies exactly its area and scrolls inside it.
            expect(await viewer.locator('.viewer-candidate .render-body').evaluate(el => { const body = el.getBoundingClientRect(), surface = el.closest('.render-surface')!.getBoundingClientRect(); return body.right <= surface.right + 1 && body.bottom <= surface.bottom + 1; })).toBe(true);
            // Other templates honour it too, and it is a saved setting.
            await shown(page, viewer, s, d.id, view('fact', { text: 'One idea' }));
            await expect(viewer.locator('.viewer-candidate .render-surface')).toHaveAttribute('data-text-mode', 'viewport');
            expect(await viewer.locator('.viewer-candidate .render-surface').evaluate(el => (el as HTMLElement).style.zoom)).toBe('1.5');
            await shown(page, viewer, s, d.id, view('font-picker', { fonts: [{ family: 'inter', weight: 400 }, { family: 'inter', weight: 700 }], text: 'Sample' }));
            await expect(viewer.locator('.viewer-candidate .render-surface')).toHaveAttribute('data-text-mode', 'content');
            const sample = viewer.locator('.viewer-candidate .font-sample').first(), large = parseFloat(await sample.evaluate(el => getComputedStyle(el).fontSize)) * 1.5;
            await shown(page, viewer, s, d.id, view('font-picker', { fonts: [{ family: 'inter', weight: 400 }, { family: 'inter', weight: 700 }], text: 'Sample', sampleSize: 18 }));
            expect(parseFloat(await viewer.locator('.viewer-candidate .font-sample').first().evaluate(el => getComputedStyle(el).fontSize))).toBe(18);
            expect(large).toBeGreaterThan(18);
            await shown(page, viewer, s, d.id, view('table', { columns: ['A', 'B'], rows: [['one', 'two']] }));
            await expect(viewer.locator('.viewer-candidate .render-surface')).toHaveAttribute('data-text-scale', '1.5');
            await viewer.reload();
            await expect(viewer.locator('.viewer-candidate .render-surface')).toHaveAttribute('data-text-scale', '1.5');
            // The enlarged surface still fits its window: no page-level overflow.
            expect(await viewer.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
            const reset = (await use(client, "kanvas.session.state", { sessionId: s })).structured.data;
            await use(client, "kanvas.settings.update", { sessionId: s, expectedRevision: reset.session?.configRevision ?? reset.configRevision ?? 1, config: { textSize: 100 } });
            await expect(viewer.locator('.viewer-candidate .render-surface')).toHaveAttribute('data-text-scale', '1');
            // Diagram that overflows because of its own textScale.
            const nodes = Array.from({ length: 13 }, (_, i) => ({ id: `n${i}`, label: `Service number ${i}`, type: 'service' })), edges = Array.from({ length: 12 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` }));
            const diagram = await shown(page, viewer, s, d.id, view('architecture', { layout: 'left-right', textScale: 1.5, nodes, edges }));
            const scroll = viewer.locator('.viewer-candidate .diagram-scroll');
            await expect.poll(async () => scroll.evaluate(el => el.scrollWidth - el.clientWidth)).toBeGreaterThan(20);
            const fitted = await use(client, "kanvas.navigation.control", { sessionId: s, displayId: d.id, requestId: 'fit-1', expectedRevision: diagram.revision, navigation: { action: 'fit' } });
            expect(fitted.isError, JSON.stringify(fitted.structured).slice(0, 300)).toBe(false);
            await expect(scroll).toHaveAttribute('data-diagram-fitted', 'true');
            await expect.poll(async () => scroll.evaluate(el => ({ x: el.scrollWidth - el.clientWidth, y: el.scrollHeight - el.clientHeight }))).toEqual({ x: 0, y: 0 });
            const svg = (await scroll.locator('svg.relationship-diagram').boundingBox())!, frame = (await scroll.boundingBox())!;
            expect(svg.width).toBeLessThanOrEqual(frame.width + 1);
            expect(svg.height).toBeLessThanOrEqual(frame.height + 1);
        }
        finally {
            await client.close();
        }
    });
});

test.describe("diagram coverage 3", () => {


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

test('whiteboard starts on the supplied diagram and preserves a chosen camera through updates',async({page})=>{
  const {s,d,viewer}=await setup(page);
  async function expectClearBoardControls(){
    const styles=await viewer.locator('.viewer-candidate .board-style').boundingBox(),zoom=await viewer.locator('.viewer-candidate .board-zoom').boundingBox(),menu=await viewer.getByRole('button',{name:'Display controls',exact:true}).boundingBox();
    expect(styles).not.toBeNull();expect(zoom).not.toBeNull();expect(menu).not.toBeNull();
    const separate=(a:{x:number;y:number;width:number;height:number},b:{x:number;y:number;width:number;height:number})=>a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y;
    expect(separate(styles!,zoom!),'Drawing style and zoom have separate hit areas').toBe(true);
    expect(separate(styles!,menu!),'Display controls do not cover drawing style').toBe(true);
    expect(separate(zoom!,menu!),'Display controls do not cover the zoom or Fit targets').toBe(true);
    for(const name of ['Zoom out','Zoom in','Fit board to screen']){
      const button=viewer.getByRole('button',{name,exact:true});await expect(button).toBeInViewport({ratio:1});
      const target=await button.evaluate(el=>{
        const r=el.getBoundingClientRect();
        return {width:r.width,height:r.height,clear:[[.5,.5],[.1,.1],[.9,.1],[.1,.9],[.9,.9]].every(([x,y])=>{const hit=document.elementFromPoint(r.x+r.width*x,r.y+r.height*y);return hit!==null&&(hit===el||el.contains(hit));})};
      });
      expect(target.width,`${name}: touch-target width`).toBeGreaterThanOrEqual(44);expect(target.height,`${name}: touch-target height`).toBeGreaterThanOrEqual(44);
      expect(target.clear,`${name}: center and inset corners receive real pointer events`).toBe(true);
    }
  }
  const view=validateView({version:1,template:'whiteboard',showControls:true,data:{elements:[{id:'first',type:'rect',x:1600,y:1800,width:360,height:120,text:'Supplied starting point'},{id:'second',type:'rect',x:1600,y:2030,width:360,height:120,text:'Supplied next step'}]}});
  await show(page,viewer,s,d.id,view);
  await expect(viewer.locator('[data-element-id="first"]')).toBeInViewport();await expect(viewer.locator('[data-element-id="second"]')).toBeInViewport();
  await expectClearBoardControls();
  const svg=viewer.locator('.board-surface'),initial=await svg.getAttribute('viewBox');
  await viewer.getByRole('button',{name:'Zoom in',exact:true}).click();await expect(svg).not.toHaveAttribute('viewBox',initial!);
  const chosen=await svg.getAttribute('viewBox');
  await show(page,viewer,s,d.id,{...view,data:{elements:[...(view.data.elements as object[]),{id:'third',type:'text',x:2800,y:2100,text:'Later supplied note'}]}});
  await expect(svg).toHaveAttribute('viewBox',chosen!);await expectClearBoardControls();await viewer.getByRole('button',{name:'Fit board to screen',exact:true}).click();await expect(viewer.locator('[data-element-id="third"]')).toBeInViewport();
});
});

test.describe("diagram coverage 4", () => {
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
    test('whiteboard background remains behind saved drawing elements and blank boards are unchanged', async ({ page, baseURL }, info) => {
        const a = await setup(page, info, baseURL!);
        try {
            const image = await asset(a), background = { url: image.url, alt: 'Supplied plan', x: 50, y: -10, width: 900, height: 450 };
            const before = await a.show({ version: 1, template: 'whiteboard', data: { background, elements: [] } });
            await expect(a.v.locator('.board-surface image')).toHaveAttribute('href', image.url);
            await expect(a.v.locator('.board-empty')).toHaveCount(0);
            await a.v.getByRole('button', { name: 'Rectangle (R)', exact: true }).click();
            const r = await a.v.locator('.board-surface').boundingBox();
            await a.v.mouse.move(r!.x + r!.width * .3, r!.y + r!.height * .3);
            await a.v.mouse.down();
            await a.v.mouse.move(r!.x + r!.width * .65, r!.y + r!.height * .62, { steps: 8 });
            await a.v.mouse.up();
            const saved = await waitForDisplay(page, a.s, a.d.id, d => d.revision > before.revision && (d.view?.data.elements as unknown[]).length === 1);
            expect(saved.view?.data.background).toEqual(background);
            await a.painted(saved.revision);
            expect(await a.v.locator('.board-surface').evaluate(el => { const children = [...el.children]; return children.indexOf(el.querySelector('image')!) < children.indexOf(el.querySelector('[data-element-id]')!); })).toBe(true);
            await photo(a.v, info, 'whiteboard-background');
            await a.v.reload();
            await expect(a.v.locator('.board-surface image')).toBeVisible();
            await expect(a.v.locator('.board-surface [data-element-id]')).toHaveCount(1);
            await a.show({ version: 1, template: 'whiteboard', data: { elements: [] } });
            await expect(a.v.locator('.board-surface image')).toHaveCount(0);
            await expect(a.v.locator('.board-empty')).toBeVisible();
        }
        finally {
            await a.client.close();
        }
    });
});
