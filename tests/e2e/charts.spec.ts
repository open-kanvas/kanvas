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
import { operationRequest } from '../mcp/requests.js';
import { mkdir } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { TestInfo } from '@playwright/test';
import type { Browser } from '@playwright/test';
import type { DisplayRecord } from '../../src/shared/types';
import { advancedChartExamples } from '../../src/shared/advanced-chart-examples';
import { tab } from './support';

test.describe("charts coverage 1", () => {


const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({template,data,...extra} as never) as ViewSpec;
/** Publish and wait until this window has painted that revision: a measurement taken while the previous
 * view is being replaced reads an element that is already detached (empty computed style, no box). */
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov10 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov10-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const inside=(inner:{x:number;y:number;width:number;height:number},outer:{x:number;y:number;width:number;height:number},slack=1.5)=>inner.x>=outer.x-slack&&inner.y>=outer.y-slack&&inner.x+inner.width<=outer.x+outer.width+slack&&inner.y+inner.height<=outer.y+outer.height+slack;

test('chess: White is at the bottom on ranks 1 and 2; a flip turns pieces and labels together (955403f7)',async({page},info)=>{
 const {s,d,viewer}=await setup(page,'Chess orientation');
 const pieces={wk:{cell:'E1',symbol:'king',side:'first'},wq:{cell:'D1',symbol:'queen',side:'first'},wp:{cell:'E2',symbol:'pawn',side:'first'},bk:{cell:'E8',symbol:'king',side:'second'},bp:{cell:'E7',symbol:'pawn',side:'second'}};
 const read=async()=>viewer.locator('.viewer-candidate .game-surface').evaluate(surface=>{const board=surface.querySelector('.game-board')!,box=board.getBoundingClientRect(),at=(id:string)=>{const piece=board.querySelector(`[data-game-piece="${id}"]`)!,r=piece.getBoundingClientRect();return {y:(r.top+r.height/2-box.top)/box.height,x:(r.left+r.width/2-box.left)/box.width,white:piece.classList.contains('color-white'),black:piece.classList.contains('color-black')};};const rows=[...surface.querySelectorAll('.game-row-labels span')].map(e=>e.textContent),columns=[...surface.querySelectorAll('.game-column-labels span')].map(e=>e.textContent);return {wk:at('wk'),bk:at('bk'),wp:at('wp'),rows,columns};});
 await publishPrepared(page,s,[d.id],view('game-board',{preset:'chess',pieces}));await expect(viewer.locator('.viewer-candidate [data-game-piece=wk]')).toBeVisible();
 const normal=await read();
 expect(normal.wk.white).toBe(true);expect(normal.bk.black).toBe(true);expect(normal.wk.y).toBeGreaterThan(.85);expect(normal.wp.y).toBeGreaterThan(.7);expect(normal.bk.y).toBeLessThan(.15);
 expect(normal.rows[0]).toBe('8');expect(normal.rows.at(-1)).toBe('1');expect(normal.columns[0]).toBe('A');expect(Math.abs(normal.wk.x-4.5/8)).toBeLessThan(.03);
 await viewer.screenshot({path:info.outputPath('chess-default.png')});
 await publishPrepared(page,s,[d.id],view('game-board',{preset:'chess',orientation:'flipped',pieces}));await expect.poll(async()=>(await read()).rows[0]).toBe('1');
 const flipped=await read();
 // Rotated 180 degrees: White at the top, still on the square labelled E1.
 expect(flipped.wk.white).toBe(true);expect(flipped.wk.y).toBeLessThan(.15);expect(flipped.bk.y).toBeGreaterThan(.85);expect(flipped.columns[0]).toBe('H');expect(Math.abs(flipped.wk.x-3.5/8)).toBeLessThan(.03);
 await viewer.screenshot({path:info.outputPath('chess-flipped.png')});
});

test('first-time ready screen invites; the sign-in code can be copied (aa19719e, 510011ae)',async({page,browser,baseURL},info)=>{
 const {viewer}=await setup(page,'First session');
 await expect(viewer.locator('.viewer-empty')).toHaveAttribute('data-ready-screen','invitation');await expect(viewer.locator('.viewer-empty .welcome-view h2')).toHaveText('Your agent can show things here while you talk.');await expect(viewer.locator('.viewer-empty .welcome-view li')).toHaveCount(3);
 await viewer.screenshot({path:info.outputPath('ready-invitation.png')});
 // A returning account (a second session exists) keeps the quiet screen.
 const second=await createSession(page,'Second session'),display=await createDisplay(page,second,'Display'),quiet=await openViewer(page,second,display.id);
 await expect(quiet.locator('.viewer-empty')).toHaveAttribute('data-ready-screen','quiet');await expect(quiet.getByRole('heading',{name:'Ready when you are.'})).toBeVisible();
 const context=await browser.newContext({baseURL:baseURL!,permissions:['clipboard-read','clipboard-write']}),signedOut=await context.newPage();
 try{
  await signedOut.goto('/');await expect(signedOut.locator('.login-letters strong')).toHaveCount(6);
  const code=signedOut.locator('.login-code-text'),letters=(await signedOut.locator('.login-letters strong').allTextContents()).join('');
  await expect(code).toHaveText(letters);expect(await code.evaluate(el=>getComputedStyle(el).userSelect)).toBe('all');
  await signedOut.getByRole('button',{name:'Copy code'}).click();await expect(signedOut.getByRole('button',{name:'Code copied'})).toBeVisible();
  expect(await signedOut.evaluate(()=>navigator.clipboard.readText())).toBe(letters);await signedOut.screenshot({path:info.outputPath('copy-code.png')});
  expect(await signedOut.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }finally{await context.close();}
});
});

test.describe("charts coverage 2", () => {


const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({version:1,template,data,...extra} as never) as ViewSpec;
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov14 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov14-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,canonical:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId:operationId(canonical),arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const fact=(text:string)=>({version:1,template:'fact',data:{text}});
const pane=(id:string,inner:Record<string,unknown>=fact(id))=>({id,view:inner});
const pie=(kind:'pie'|'donut')=>({version:1,template:'chart',data:{kind,series:[{name:'Share',points:[{x:'Alpha',y:40},{x:'Beta',y:30},{x:'Gamma',y:20},{x:'Delta',y:10}]}]}});

test('pie and donut fit a pane without scrolling (4b998939)',async({page})=>{
 const {s,d,viewer}=await setup(page,'Charts in panes');
 await shown(page,viewer,s,d.id,view('split-screen',{rows:2,columns:3,panes:[pane('bar',{version:1,template:'chart',data:{kind:'bar',series:[{name:'A',points:[{x:'Q1',y:3},{x:'Q2',y:5}]}]}}),pane('pie',pie('pie')),pane('donut',pie('donut')),pane('f1'),pane('f2'),pane('f3')]}));
 for(const id of ['pie','donut']){
  const body=viewer.frameLocator(`[data-pane-id="${id}"] iframe.split-pane`).locator('.advanced-chart-body');
  await expect(body.locator('svg path[data-chart-proportion]').first()).toBeVisible();
  await expect.poll(async()=>body.evaluate(el=>({overflowY:el.scrollHeight-el.clientHeight,overflowX:el.scrollWidth-el.clientWidth})),{message:`${id} pane must not scroll`}).toEqual({overflowY:expect.any(Number),overflowX:expect.any(Number)});
  const fit=await body.evaluate(el=>({y:el.scrollHeight-el.clientHeight,x:el.scrollWidth-el.clientWidth,layout:el.querySelector<HTMLElement>('.advanced-plot-with-key')?.dataset.keyLayout,svg:el.querySelector('svg')!.getBoundingClientRect().height,height:el.clientHeight}));
  expect(fit.y,`${id}: vertical overflow`).toBeLessThanOrEqual(1);expect(fit.x,`${id}: horizontal overflow`).toBeLessThanOrEqual(1);expect(fit.svg).toBeLessThanOrEqual(fit.height+1);expect(['side','stacked']).toContain(fit.layout);
 }
});
});

test.describe("charts coverage 3", () => {

async function navigation(page:any,s:string,d:string,revision:number,action:unknown){const tabId=await page.evaluate(()=>sessionStorage.getItem('kanvas-viewer-tab'));return sessionApi(page,`/api/sessions/${s}/displays/${d}/navigation`,'POST',{tabId:tabId??'feedback26',requestId:crypto.randomUUID(),expectedRevision:revision,navigation:action});}

test('stacked columns show real segment totals and combo charts keep a labeled secondary scale',async({page})=>{
 await register(page);const s=await createSession(page,'Charts'),d=await createDisplay(page,s,'Chart');
 await publishPrepared(page,s,[d.id],{version:1,template:'chart',data:{kind:'bar',stacking:'stacked',showValues:true,showTotals:true,series:[{name:'First',color:'#5599dd',points:[{x:'A',y:20},{x:'B',y:15}]},{name:'Second',color:'#eeaa66',points:[{x:'A',y:30},{x:'B',y:25}]}]}});await page.goto(`/view/${s}/${d.id}`);await expect(page.locator('.composable-chart')).toBeVisible();await expect(page.locator('[data-stack-total="50"]')).toHaveText('50');await expect(page.locator('rect[data-chart-series="Second"][data-chart-x="A"]')).toHaveAttribute('data-stack-start','20');
 await publishPrepared(page,s,[d.id],{version:1,template:'chart',data:{kind:'bar',secondaryLabel:'Rate',series:[{name:'Count',kind:'bar',points:[{x:'A',y:100}]},{name:'Rate',kind:'line',axis:'secondary',points:[{x:'A',y:2}]}]}});await expect(page.locator('.composable-chart svg')).toContainText('Rate');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
});

test.describe("charts coverage 4", () => {
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
    test('windowed charts fit the measured viewport, use full funnel height and omit raw data by default', async ({ page, baseURL }, info) => {
        const a = await setup(page, info, baseURL!);
        try {
            const phone = info.project.name.startsWith('phone');
            if (!phone)
                await a.v.setViewportSize({ width: 1280, height: 720 });
            const tree: ViewSpec = { version: 1, template: 'chart', data: { kind: 'treemap', nodes: [{ id: 'root', label: 'Budget', value: 120 }, ...Array.from({ length: 3 }, (_, g) => ({ id: `g${g}`, parent: 'root', label: `Group ${g + 1}`, value: 40 })), ...Array.from({ length: 9 }, (_, i) => ({ id: `n${i}`, parent: `g${Math.floor(i / 3)}`, label: `Work ${i + 1}`, value: i % 3 ? 13 : 14 }))] } };
            for (const view of [advancedChartExamples.gauge, tree]) {
                await a.show(view);
                await stable(a.v, '.advanced-chart-body');
                await contained(a.v, '.advanced-chart-body');
                await expect(a.v.locator('.advanced-chart-key,.exact-data-table')).toHaveCount(0);
                await photo(a.v, info, String(view.data.kind));
            }
            for (const count of [3, 5, 10]) {
                await a.show({ version: 1, template: 'chart', data: { kind: 'funnel', series: [{ name: 'Participants', points: Array.from({ length: count }, (_, i) => ({ x: `Stage ${i + 1}`, y: 1000 - i * 80 })) }] } });
                await stable(a.v, '.advanced-chart-body');
                await contained(a.v, '.advanced-chart-body');
                expect(await a.v.locator('.advanced-chart-body').evaluate(el => el.querySelector('svg')!.getBoundingClientRect().height / el.clientHeight)).toBeGreaterThan(.85);
            }
            await photo(a.v, info, 'funnel');
            const waterfall: ViewSpec = { version: 1, template: 'chart', data: { kind: 'waterfall', series: [{ name: 'Balance', points: Array.from({ length: 13 }, (_, i) => ({ x: `Monthly financial period ${i + 1}`, y: i === 0 ? 180 : i % 2 ? -12 : 24, ...(i === 0 ? { total: true } : {}) })) }] } };
            await a.show(waterfall);
            await stable(a.v, '.advanced-chart-body');
            if (!phone)
                await contained(a.v, '.advanced-chart-body');
            await photo(a.v, info, 'waterfall');
            for (const view of [samples.chart, { ...samples.chart, data: { ...samples.chart.data, kind: 'bar' } }, samples.timeline]) {
                await a.show(view);
                const selector = view.template === 'timeline' ? '.temporal-timeline' : '.legacy-chart-plot';
                await stable(a.v, selector);
            }
            await photo(a.v, info, 'timeline');
            if (!phone) {
                await a.v.setViewportSize({ width: 1920, height: 1080 });
                await a.show(advancedChartExamples.gauge);
                await contained(a.v, '.advanced-chart-body');
                await stable(a.v, '.advanced-chart-body');
                await photo(a.v, info, 'gauge-tv');
            }
            await a.show({ ...tree, showControls: true });
            await expect(a.v.locator('.advanced-chart-key')).toBeVisible();
        }
        finally {
            await a.client.close();
        }
    });
    async function photo(page: Page, info: TestInfo, name: string) { for (const notice of await page.getByRole('button', { name: 'Dismiss notification', exact: true }).all())
        await notice.click(); await page.evaluate(() => document.fonts.ready); await mkdir(info.outputPath('visuals'), { recursive: true }); await page.screenshot({ path: `${info.outputPath('visuals')}/${info.project.name}-${name}.png`, animations: 'disabled' }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true); }
    async function asset(a: Fixture, color = '#267f9f', w = 240, h = 120) { return a.call("kanvas_call", "kanvas.asset.import", { sessionId: a.s, name: 'Acceptance logo.svg', mimeType: 'image/svg+xml', base64: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect x="1" y="1" width="${w - 2}" height="${h - 2}" fill="${color}" stroke="#ffffff" stroke-width="2"/><circle cx="${w / 2}" cy="${h / 2}" r="${h / 3}" fill="#ffffff"/><text x="${w / 2}" y="${h / 2 + 5}" text-anchor="middle" fill="${color}" font-size="16">K</text></svg>`).toString('base64') }); }
});
