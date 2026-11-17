import { operationRequest } from '../mcp/requests.js';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {Client as LegacyClient} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport as LegacyTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {Page,TestInfo} from '@playwright/test';
import type {ViewSpec} from '../../src/shared/types';
import {test,expect,register,login,createSession,createDisplay,openViewer,publishPrepared,waitForDisplay,sessionApi,sessionDetail,isolatedContext} from './support';

async function setup(page: Page, info: TestInfo, baseURL: string) {
    const account = await register(page), s = await createSession(page, 'Spatial acceptance'), d = await createDisplay(page, s, 'Retained content'), v = await openViewer(page, s, d.id);
    const issued = await sessionApi<{
        token: string;
    }>(page, '/api/tokens', 'POST', { name: 'Disposable evening checks', scopes: ['read', 'publish'] });
    expect(issued.status).toBe(201);
    const headers = { Authorization: `Bearer ${issued.data!.token}` }, client = info.project.name.startsWith('phone') ? new LegacyClient({ name: 'evening-legacy', version: '1' }) : new Client({ name: 'evening-current', version: '1' });
    if (client instanceof LegacyClient)
        await client.connect(new LegacyTransport(new URL('/mcp', baseURL), { requestInit: { headers } }));
    else
        await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseURL), { requestInit: { headers } }));
    const call = async <T = any>(name: string, operation: string, args: Record<string, unknown> = {}) => { const r = await client.callTool(operationRequest({ name, arguments: { operation, ...args } })); expect(r.isError, `${name} ${operation}`).not.toBe(true); return (r.structuredContent as {
        data: T;
    }).data; };
    const current = () => waitForDisplay(page, s, d.id, x => x.revision > 0 && x.appliedRevision === x.revision), show = async (view: ViewSpec) => { await publishPrepared(page, s, [d.id], view); return current(); };
    const nav = async (navigation: unknown) => { const before = await current(); return call("kanvas_call", "kanvas.navigation.control", { sessionId: s, displayId: d.id, expectedRevision: before.revision, requestId: randomUUID(), navigation }); };
    return { account, s, d, v, call, client, current, show, nav };
}
async function photo(page:Page,info:TestInfo,name:string){await expect(page.locator('.viewer-toast')).toHaveCount(0,{timeout:15000});await page.evaluate(()=>document.fonts.ready);await mkdir(info.outputPath('visuals'),{recursive:true});await page.screenshot({path:`${info.outputPath('visuals')}/${info.project.name}-${name}.png`,animations:'disabled'});}

test('diagram auto-fit, distinct focus targets, scroll and reset are applied by real viewers', async ({ page, baseURL }, info) => {
    const a = await setup(page, info, baseURL!);
    try {
        const nodes = Array.from({ length: 41 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}`, detail: i === 0 ? 'Root source' : undefined })), edges = nodes.slice(1).map((n, i) => ({ from: `n${i}`, to: n.id }));
        await a.show({ version: 1, template: 'flowchart', data: { nodes, edges } });
        const surface = a.v.locator('.viewer-candidate .diagram-scroll');
        expect(await surface.evaluate(e => e.scrollHeight <= e.clientHeight + 2 && e.scrollWidth <= e.clientWidth + 2)).toBe(true);
        const ack = () => expect.poll(async () => { const r = await a.call("kanvas_call", "kanvas.navigation.read", { sessionId: a.s, displayId: a.d.id }); return r.viewers.some((v: any) => v.status === 'applied' && v.matches > 0); }).toBe(true);
        await a.nav({ action: 'focus', text: 'Node 30', zoom: 3 });
        await ack();
        await expect(a.v.locator('.viewer-candidate [data-node-id="n30"]')).toBeInViewport();
        const before = await surface.evaluate(e => ({ x: e.scrollLeft, y: e.scrollTop }));
        await a.nav({ action: 'focus', text: 'Node 5', zoom: 3 });
        await ack();
        await expect(a.v.locator('.viewer-candidate [data-node-id="n5"]')).toBeInViewport();
        await expect.poll(() => surface.evaluate(e => ({ x: e.scrollLeft, y: e.scrollTop }))).not.toEqual(before);
        const axis = await surface.evaluate(e => e.scrollWidth > e.clientWidth + 2 ? 'x' : 'y');
        await a.nav({ action: 'scroll', [axis]: 1 });
        await expect.poll(() => surface.evaluate((e, axis) => axis === 'x' ? e.scrollLeft / Math.max(1, e.scrollWidth - e.clientWidth) : e.scrollTop / Math.max(1, e.scrollHeight - e.clientHeight), axis)).toBeGreaterThan(.95);
        await a.nav({ action: 'fit' });
        await expect.poll(() => surface.evaluate(e => e.scrollHeight <= e.clientHeight + 2 && e.scrollWidth <= e.clientWidth + 2)).toBe(true);
        await page.context().route('https://example.test/avatar.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="10" fill="gold"/></svg>' }));
        await a.show({ version: 1, template: 'org-chart', data: { nodes: Array.from({ length: 60 }, (_, i) => ({ id: `o${i}`, label: `Person ${i}`, parentId: i ? `o${Math.floor((i - 1) / 5)}` : undefined, icon: i % 2 ? 'engineering' : 'person', image: i === 0 ? 'https://example.test/avatar.svg' : undefined })) } });
        expect(await surface.evaluate(e => e.scrollHeight <= e.clientHeight + 2 && e.scrollWidth <= e.clientWidth + 2)).toBe(true);
        await expect(a.v.locator('.viewer-candidate .diagram-node image')).toHaveAttribute('href', 'https://example.test/avatar.svg');
        await photo(a.v, info, 'org-fit');
        await a.show({ version: 1, template: 'architecture', data: { nodes: [{ id: 'a', label: 'Web client', type: 'client' }, { id: 'b', label: 'Gateway', type: 'api' }, { id: 'c', label: 'Database', type: 'database' }, { id: 'd', label: 'Jobs', type: 'queue' }], edges: [{ from: 'a', to: 'b', label: 'HTTPS' }, { from: 'b', to: 'c', label: 'SQL' }, { from: 'b', to: 'd', label: 'Enqueue' }] } });
        await expect(a.v.locator('.viewer-candidate .diagram-symbol')).toHaveCount(4);
        await photo(a.v, info, 'architecture');
    }
    finally {
        await a.client.close();
    }
});

test('code gotoLine crosses pages, text focus spans syntax tokens, diff colors and terminal output persist', async ({ page, baseURL }, info) => {
    const a = await setup(page, info, baseURL!);
    try {
        const source = Array.from({ length: 320 }, (_, i) => `const value${i} = ${i};`).join('\n');
        await a.show({ version: 1, template: 'code', data: { kind: 'code', language: 'javascript', code: source, startLine: 10 } });
        const ack = () => expect.poll(async () => { const r = await a.call("kanvas_call", "kanvas.navigation.read", { sessionId: a.s, displayId: a.d.id }); return r.viewers.some((v: any) => v.status === 'applied' && v.matches > 0); }).toBe(true);
        await a.nav({ action: 'gotoLine', line: 230 });
        await ack();
        await expect(a.v.locator('.viewer-candidate [data-code-line="230"]')).toBeInViewport();
        await a.nav({ action: 'focus', text: 'const value50 = 50;', zoom: 1 });
        await ack();
        await expect(a.v.locator('.viewer-candidate [data-code-line="60"]')).toBeInViewport();
        await a.show({ version: 1, template: 'code', data: { kind: 'diff', language: 'javascript', before: 'const value = 1;', after: 'const value = 2;', startLine: 50 } });
        await expect(a.v.locator('.viewer-candidate .diff-add .hljs-keyword')).toHaveText('const');
        await photo(a.v, info, 'diff');
        const entry = { id: 'run', command: 'npm test', stdout: 'Starting\n', status: 'running' };
        await a.show({ version: 1, template: 'code', data: { kind: 'terminal', entries: [entry] } });
        await expect(a.v.locator('.viewer-candidate .terminal-stdout')).toHaveText('Starting\n');
        await a.show({ version: 1, template: 'code', data: { kind: 'terminal', entries: [{ ...entry, stdout: 'Starting\n42 tests passed\n', status: 'success', exitCode: 0, stderr: 'Literal <tag> is not HTML' }] } });
        await expect(a.v.locator('.viewer-candidate .terminal-stdout')).toContainText('42 tests passed');
        await expect(a.v.locator('.viewer-candidate .terminal-stderr')).toHaveText('Literal <tag> is not HTML');
        await photo(a.v, info, 'terminal');
    }
    finally {
        await a.client.close();
    }
});

test('device previews use actual iframe CSS widths, responsive frame count and optional 1:1 inspection',async({page,baseURL},info)=>{
 const a=await setup(page,info,baseURL!);try{
  await a.show({version:1,template:'device-preview',data:{description:'Synthetic responsive card',html:'<article><h1>Viewport test</h1><p>Exact custom visual.</p></article>',css:'article{padding:24px}h1{font-size:40px}@media(max-width:400px){h1{font-size:20px}}',viewports:['iphone','tablet','laptop']}});
  const scope=a.v.locator('.viewer-candidate .device-preview');await expect(scope.locator('iframe')).toHaveCount(3);
  await expect(scope.frameLocator('iframe').first().locator('h1')).toHaveCSS('font-size','20px');
  await expect(scope.frameLocator('iframe').nth(1).locator('h1')).toHaveCSS('font-size','40px');
  expect(await scope.locator('iframe').first().evaluate(e=>(e as HTMLIFrameElement).clientWidth)).toBe(390);
  const columns=await scope.locator('.device-preview-grid').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(info.project.name.startsWith('phone')?1:3);await photo(a.v,info,'device-preview');
  await scope.getByRole('button',{name:'Actual size'}).first().click();await expect(scope.locator('iframe')).toHaveCount(1);await expect(scope.locator('iframe')).toHaveCSS('transform','matrix(1, 0, 0, 1, 0, 0)');
  await scope.getByRole('button',{name:'All viewports'}).click();await expect(scope.locator('iframe')).toHaveCount(3);
 }finally{await a.client.close();}
});
