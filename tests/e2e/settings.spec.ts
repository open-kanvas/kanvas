import { operationRequest } from '../mcp/requests.js';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Page } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import type { ViewSpec } from '../../src/shared/types';
import { test } from './support';
import { expect } from './support';
import { register } from './support';
import { login } from './support';
import { createSession } from './support';
import { createDisplay } from './support';
import { openViewer } from './support';
import { publishPrepared } from './support';
import { waitForDisplay } from './support';
import { sessionApi } from './support';
import { sessionDetail } from './support';
import { isolatedContext } from './support';
import { viewerPath } from './support';
import { validateView } from '../../src/shared/view-schemas';
import { samples } from '../../src/shared/template-examples';
import { Store } from '../../src/server/store';
import { testDatabase } from '../postgres';
import { publicReference } from '../../src/server/mcp/operations';
import type { DisplayRecord } from '../../src/shared/types';
import {templateExampleData} from '../../src/shared/template-examples';

test.describe("settings coverage 1", () => {
    async function setup(page: Page, info: TestInfo, baseURL: string) {
        const account = await register(page), s = await createSession(page, 'Evening acceptance'), d = await createDisplay(page, s, 'Retained content'), v = await openViewer(page, s, d.id);
        const issued = await sessionApi<{
            token: string;
        }>(page, '/api/tokens', 'POST', { name: 'Disposable evening checks', scopes: ['read', 'publish'] });
        expect(issued.status).toBe(201);
        const headers = { Authorization: `Bearer ${issued.data!.token}` }, client = info.project.name.startsWith('phone') ? new LegacyClient({ name: 'evening-legacy', version: '1' }) : new Client({ name: 'evening-current', version: '1' });
        if (client instanceof LegacyClient)
            await client.connect(new LegacyTransport(new URL('/mcp', baseURL), { requestInit: { headers } }));
        else
            await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseURL), { requestInit: { headers } }));
        const call = async <T = any>(name: string, operation: string, args: Record<string, unknown> = {}) => { const r = await client.callTool(operationRequest({ name, arguments: { operation, ...args } })); expect(r.isError, `${name} ${operation}: ${JSON.stringify((r.structuredContent as any)?.error ?? {}).slice(0, 600)}`).not.toBe(true); return (r.structuredContent as {
            data: T;
        }).data; };
        const current = () => waitForDisplay(page, s, d.id, x => x.revision > 0 && x.appliedRevision === x.revision), show = async (view: ViewSpec) => { await publishPrepared(page, s, [d.id], view); return current(); };
        const nav = async (navigation: unknown) => { const before = await current(); return call("kanvas_call", "kanvas.navigation.control", { sessionId: s, displayId: d.id, expectedRevision: before.revision, requestId: randomUUID(), navigation }); };
        return { account, s, d, v, call, client, current, show, nav };
    }
    async function photo(page: Page, info: TestInfo, name: string) { await expect(page.locator('.viewer-toast')).toHaveCount(0, { timeout: 15000 }); await page.evaluate(() => document.fonts.ready); await mkdir(info.outputPath('visuals'), { recursive: true }); await page.screenshot({ path: `${info.outputPath('visuals')}/${info.project.name}-${name}.png`, animations: 'disabled' }); }
    test('Home is live, registered PC and TV route independently, and system theme follows each operating system', async ({ page, browser, baseURL }, info) => {
        const a = await setup(page, info, baseURL!), tvContext = await isolatedContext(browser, info, baseURL!);
        try {
            const pc = await page.context().newPage();
            await pc.goto('/start');
            await expect(pc.getByRole('region', { name: 'Your sessions' })).toBeVisible();
            await expect(pc.getByRole('button', { name: /Evening acceptance/ })).toBeVisible();
            const pcHome = new URL(pc.url()).pathname.split('/').at(-1)!;
            const tv = await tvContext.newPage();
            await login(tv, a.account, '/admin');
            await tv.goto('/start');
            await expect(tv.getByRole('region', { name: 'Your sessions' })).toBeVisible();
            const tvHome = new URL(tv.url()).pathname.split('/').at(-1)!;
            expect(tvHome).not.toBe(pcHome);
            await expect.poll(async () => { const r = await a.call("kanvas_call", "kanvas.devices.read"); return r.devices.filter((d: any) => [pcHome, tvHome].includes(d.home.displayId) && d.connected).length; }).toBe(2);
            const devices = (await a.call("kanvas_call", "kanvas.devices.read")).devices, pcDevice = devices.find((d: any) => d.home.displayId === pcHome), tvDevice = devices.find((d: any) => d.home.displayId === tvHome);
            const other = await sessionApi<{
                id: string;
            }>(page, `/api/sessions/${a.s}/displays`, 'POST', { name: 'TV source', width: 1200, height: 800, pixelRatio: 1 });
            expect(other.status).toBe(200);
            await a.show({ version: 1, template: 'fact', data: { text: 'PC-specific content' } });
            await publishPrepared(page, a.s, [other.data!.id], { version: 1, template: 'fact', data: { text: 'TV-specific content' } });
            // Publications can outlive a receiver reconnect. Recheck actual readiness
            // at each command boundary, rather than reuse the earlier discovery result.
            for (const target of [{ deviceId: pcDevice.id, displayId: a.d.id }, { deviceId: tvDevice.id, displayId: other.data!.id }]) {
                await expect.poll(async () => { const current = (await a.call("kanvas_call", "kanvas.devices.read")).devices.find((d: any) => d.id === target.deviceId); return current?.connected; }).toBe(true);
                const current = (await a.call("kanvas_call", "kanvas.devices.read")).devices.find((d: any) => d.id === target.deviceId);
                await a.call("kanvas_call", "kanvas.device.present", { ...target, sessionId: a.s, expectedVersion: current.version, requestId: randomUUID() });
            }
            await expect(pc.locator('.viewer-candidate')).toContainText('PC-specific content');
            await expect(tv.locator('.viewer-candidate')).toContainText('TV-specific content');
            await expect.poll(async () => { const d = (await a.call("kanvas_call", "kanvas.devices.read")).devices; return d.filter((x: any) => [pcDevice.id, tvDevice.id].includes(x.id) && x.command?.status === 'applied').length; }).toBe(2);
            const participants = await a.call("kanvas_call", "kanvas.participants.read", { sessionId: a.s });
            expect(participants.registeredDevices.map((d: any) => d.id)).toEqual(expect.arrayContaining([pcDevice.id, tvDevice.id]));
            const preferences = await a.call("kanvas_call", "kanvas.preferences.get");
            await a.call("kanvas_call", "kanvas.preferences.update", { expectedRevision: preferences.revision, config: { theme: 'system' } });
            const detail = await sessionDetail(page, a.s);
            await a.call("kanvas_call", "kanvas.config.update", { sessionId: a.s, expectedRevision: detail.session.configRevision, config: { theme: 'system' } });
            await pc.emulateMedia({ colorScheme: 'dark' });
            await tv.emulateMedia({ colorScheme: 'light' });
            await expect(pc.locator('.viewer-shell')).toHaveClass(/theme-dark/);
            await expect(tv.locator('.viewer-shell')).toHaveClass(/theme-light/);
            await pc.emulateMedia({ colorScheme: 'light' });
            await expect(pc.locator('.viewer-shell')).toHaveClass(/theme-light/);
            await photo(tv, info, 'device-tv-system-theme');
            await tvContext.close();
            await expect.poll(async () => { const d = (await a.call("kanvas_call", "kanvas.devices.read")).devices.find((d: any) => d.id === tvDevice.id); return d.connected; }).toBe(false);
            await pc.goto('/start');
            await expect(pc.getByRole('region', { name: 'Your sessions' })).toBeVisible();
            await expect(pc.locator('.workspace')).toHaveCount(0);
            await photo(pc, info, 'live-home');
            await pc.close();
        }
        finally {
            await tvContext.close();
            await a.client.close();
        }
    });
});

test.describe("settings coverage 2", () => {


const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({template,data,...extra} as never) as ViewSpec;
/** Publish and wait until this window has painted that revision: a measurement taken while the previous
 * view is being replaced reads an element that is already detached (empty computed style, no box). */
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov10 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov10-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const inside=(inner:{x:number;y:number;width:number;height:number},outer:{x:number;y:number;width:number;height:number},slack=1.5)=>inner.x>=outer.x-slack&&inner.y>=outer.y-slack&&inner.x+inner.width<=outer.x+outer.width+slack&&inner.y+inner.height<=outer.y+outer.height+slack;

test('custom HTML follows the theme through tokens; older HTML keeps its page (2444dc0d)',async({page},info)=>{
 const {s,d,viewer}=await setup(page,'Theme tokens');
 await publishPrepared(page,s,[d.id],view('html',{description:'Themed',html:'<main><h1>Option B</h1></main>',css:'main{min-height:100vh;display:grid;place-content:center;background:var(--kanvas-bg);color:var(--kanvas-fg);font-family:var(--kanvas-font)}h1{font-size:12vw;color:var(--kanvas-accent)}'}));
 const frame=viewer.locator('.viewer-candidate iframe.custom-visual');await expect(frame).toBeVisible();
 const doc=await frame.getAttribute('srcdoc');expect(doc).toContain('--kanvas-bg:');expect(doc).toContain('--kanvas-accent:');expect(doc).toContain('background:var(--kanvas-bg)');expect(await frame.getAttribute('sandbox')).toBe('');
 await expect(viewer.locator('.viewer-candidate .custom-visual-host')).toHaveAttribute('data-themed','true');
 const size=await frame.boundingBox(),shell=await viewer.locator('.viewer-shell').boundingBox();expect(size!.height).toBeGreaterThan(shell!.height*.6);
 await publishPrepared(page,s,[d.id],view('html',{description:'Legacy',html:'<p>Plain</p>',css:'p{font-size:8vw}'}));
 await expect.poll(async()=>await viewer.locator('.viewer-candidate iframe.custom-visual').getAttribute('srcdoc')).toContain('background:#151515');
 await viewer.screenshot({path:info.outputPath('html-tokens.png')});
});
});

test.describe("settings coverage 3", () => {
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    async function connect(page: Page, baseURL: string, sessionId?: string) {
        const issued = await sessionApi<{
            token: string;
        }>(page, '/api/tokens', 'POST', { name: 'Disposable September acceptance', scopes: ['read', 'publish'], ...(sessionId ? { sessionIds: [sessionId] } : {}) });
        expect(issued.status).toBe(201);
        const client = new Client({ name: 'september-acceptance', version: '1' });
        await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseURL), { requestInit: { headers: { Authorization: `Bearer ${issued.data!.token}` } } }));
        return client;
    }
    async function call<T = unknown>(client: Client, name: string, args: Record<string, unknown>): Promise<T> { const ref = publicReference(name); if (!ref)
        throw new Error('Missing public mapping'); const result = await client.callTool(operationRequest({ name: ref.tool, arguments: { operation: ref.operation, ...args } })); expect(result.isError, `${name} succeeds`).not.toBe(true); return (result.structuredContent as {
        data: T;
    }).data; }
    async function setup(page: Page) { await register(page); const sessionId = await createSession(page, 'September display lab'), display = await createDisplay(page, sessionId, 'Receiving screen'); return { sessionId, display }; }
    async function painted(page: Page, sessionId: string, displayId: string, template: string) { return waitForDisplay(page, sessionId, displayId, d => d.view?.template === template && d.appliedRevision === d.revision && d.revision > 0); }
    test('overview navigates retained views across displays and settings promote only explicit account defaults', async ({ page, baseURL }) => {
        const { sessionId, display } = await setup(page), other = await createDisplay(page, sessionId, 'Other display'), viewer = await openViewer(page, sessionId, display.id), client = await connect(page, baseURL!);
        await viewer.bringToFront();
        try {
            await publishPrepared(page, sessionId, [other.id], { version: 1, template: 'fact', title: 'Earlier retained view', data: { text: 'First retained value' } });
            await waitForDisplay(page, sessionId, other.id, d => d.revision === 1);
            await publishPrepared(page, sessionId, [other.id], { version: 1, template: 'fact', title: 'Latest retained view', data: { text: 'Second retained value' } });
            await waitForDisplay(page, sessionId, other.id, d => d.revision === 2);
            await publishPrepared(page, sessionId, [display.id], { version: 1, template: 'overview', data: { displayIds: [other.id], order: 'oldest' } });
            await painted(page, sessionId, display.id, 'overview');
            await viewer.getByRole('button', { name: /Show Earlier retained view/ }).click();
            await waitForDisplay(page, sessionId, other.id, d => d.revision > 2 && d.view?.data.text === 'First retained value');
            await publishPrepared(page, sessionId, [display.id], { version: 1, template: 'settings', data: { description: 'Choose a palette and save your defaults' } });
            await painted(page, sessionId, display.id, 'settings');
            await viewer.getByRole('radio', { name: 'All new sessions', exact: true }).check();
            await viewer.getByRole('radio', { name: 'Iris', exact: true }).check();
            await expect(viewer.getByText('Saved for all new sessions. This session is unchanged.', { exact: true })).toBeVisible();
            await viewer.getByRole('radio', { name: 'Light', exact: true }).check();
            await expect(viewer.getByText('Saved for all new sessions. This session is unchanged.', { exact: true })).toBeVisible();
            const next = await call<{
                config: {
                    style: string;
                    theme: string;
                };
            }>(client, "kanvas.session.create", { name: 'Inherits chosen defaults' });
            expect(next.config).toMatchObject({ style: 'iris', theme: 'light' });
            expect((await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)!.view?.template).toBe('settings');
        }
        finally {
            await client.close();
        }
    });
});
