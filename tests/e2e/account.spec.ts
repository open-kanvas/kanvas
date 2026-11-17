import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { test } from './support';
import { expect } from './support';
import { register } from './support';
import { createSession } from './support';
import { createDisplay } from './support';
import { publishPrepared } from './support';
import { sessionApi } from './support';
import { sessionDetail } from './support';
import type { Page } from '@playwright/test';
import { login } from './support';
import { openViewer } from './support';
import { viewerPath } from './support';
import { waitForDisplay } from './support';
import { validateView } from '../../src/shared/view-schemas';
import { samples } from '../../src/shared/template-examples';
import { Store } from '../../src/server/store';
import { testDatabase } from '../postgres';
import type { ViewSpec } from '../../src/shared/types';
import { operationRequest } from '../mcp/requests.js';
import { mkdir } from 'node:fs/promises';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { TestInfo } from '@playwright/test';
import type { Browser } from '@playwright/test';
import type { DisplayRecord } from '../../src/shared/types';
import { tab } from './support';
import { advancedChartExamples } from '../../src/shared/advanced-chart-examples';

test.describe("account coverage 1", () => {

const evidence=()=>test.info().outputPath("screenshots");
async function clientFor(page:Page){const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable November acceptance',scopes:['read','publish']});const client=new Client({name:'november-acceptance',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',page.url()),{requestInit:{headers:{Authorization:'Bearer '+issued.data!.token}}}));return {client,call:async(operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});expect(result.isError).not.toBe(true);return (result.structuredContent as any).data;}};}
async function setup(page:Page){await register(page);const s=await createSession(page,'November acceptance'),d=await createDisplay(page,s,'Target');return {s,d};}
test('single-session screen signs out to root and may request account approval',async({page,browser})=>{
 const {s,d}=await setup(page);await publishPrepared(page,s,[d.id],{version:1,template:'fact',data:{text:'Scoped screen content'}});const context=await browser.newContext({viewport:page.viewportSize()!}),screen=await context.newPage();try{await screen.goto(new URL('/',page.url()).href);const code=screen.locator('.login-letters');await expect(code).toHaveAttribute('aria-label',/^Sign-in code [A-Z]{6}$/);const lookup=await sessionApi<any>(page,'/api/login/lookup','POST',{code:(await code.getAttribute('aria-label'))!.replace('Sign-in code ','')});expect(lookup.status).toBe(200);const consent=await sessionApi(page,'/api/login/decide','POST',{code:(await code.getAttribute('aria-label'))!.replace('Sign-in code ',''),approvalToken:lookup.data.approvalToken,approve:true,confirm:true,scope:'session',sessionId:s});expect(consent.status).toBe(200);await expect(screen).toHaveURL(new RegExp('/session/'+s+'$'));await expect(screen.getByRole('button',{name:'Display controls',exact:true})).toBeVisible();await screen.getByRole('button',{name:'Display controls',exact:true}).click();await expect(screen.getByRole('button',{name:'Enable notifications',exact:true})).toHaveCount(0);await screen.getByRole('button',{name:'Sign out of this screen',exact:true}).click();await expect(screen).toHaveURL(/\/$/);await expect(code).toHaveAttribute('aria-label',/^Sign-in code [A-Z]{6}$/);}finally{await context.close();}
});
});

test.describe("account coverage 2", () => {


const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({template,data,...extra} as never) as ViewSpec;
/** Publish and wait until this window has painted that revision: a measurement taken while the previous
 * view is being replaced reads an element that is already detached (empty computed style, no box). */
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov10 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov10-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const inside=(inner:{x:number;y:number;width:number;height:number},outer:{x:number;y:number;width:number;height:number},slack=1.5)=>inner.x>=outer.x-slack&&inner.y>=outer.y-slack&&inner.x+inner.width<=outer.x+outer.width+slack&&inner.y+inner.height<=outer.y+outer.height+slack;

test('the session overview names the agent that created a session, and only that session (d630abcc)',async({page,baseURL})=>{
 await register(page);const client=await mcp(page,baseURL!);
 try{
  // One session made by the connected agent and one made by hand.
  const created=await use(client,'kanvas.session.create',{name:'Made by an agent'});expect(created.isError,JSON.stringify(created.structured)).toBe(false);
  await createSession(page,'Made by hand');
  await page.goto('/');
  const card=(name:string)=>page.locator('.overview-session').filter({has:page.getByRole('link',{name,exact:true})});
  await expect(card('Made by an agent').locator('.overview-created-by')).toHaveText('Created by nov10-fixture');
  await expect(card('Made by hand')).toBeVisible();await expect(card('Made by hand').locator('.overview-created-by')).toHaveCount(0);
 }finally{await client.close();}
});
});

test.describe("account coverage 3", () => {
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
    async function photo(page: Page, info: TestInfo, name: string) {
        for (const notice of await page.getByRole('button', { name: 'Dismiss notification', exact: true }).all())
            await notice.click();
        await page.evaluate(() => document.fonts.ready);
        await mkdir(info.outputPath('visuals'), { recursive: true });
        await page.screenshot({ path: `${info.outputPath('visuals')}/${info.project.name}-${name}.png`, animations: 'disabled' });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
    }
    async function asset(a: Fixture, color = '#267f9f', w = 240, h = 120) { return a.call("kanvas_call", "kanvas.asset.import", { sessionId: a.s, name: 'Acceptance logo.svg', mimeType: 'image/svg+xml', base64: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect x="1" y="1" width="${w - 2}" height="${h - 2}" fill="${color}" stroke="#ffffff" stroke-width="2"/><circle cx="${w / 2}" cy="${h / 2}" r="${h / 3}" fill="#ffffff"/><text x="${w / 2}" y="${h / 2 + 5}" text-anchor="middle" fill="${color}" font-size="16">K</text></svg>`).toString('base64') }); }
    async function counterpart(a: Fixture, page: Page, browser: Browser, info: TestInfo, baseURL: string) {
        const context = await browser.newContext({ baseURL, viewport: info.project.name.startsWith('phone') ? { width: 1440, height: 900 } : { width: 390, height: 844 }, colorScheme: 'dark', reducedMotion: 'reduce' }), peer = await context.newPage(), account = await register(peer);
        await a.call("kanvas_call", "kanvas.profile.update", { expectedRevision: 0, displayName: 'Alex · host' });
        expect((await sessionApi(page, `/api/sessions/${a.s}/members`, 'POST', { username: account.username, role: 'viewer' })).status).toBe(200);
        await peer.goto(`/view/${a.s}/${a.d.id}`);
        await expect(peer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision', String((await a.current()).revision));
        return { context, peer };
    }
    async function word(page: Page, selector: string, needle: string) {
        return page.locator(selector).evaluate((el, text) => {
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                const at = n.textContent!.indexOf(text);
                if (at < 0)
                    continue;
                const range = document.createRange();
                range.setStart(n, at);
                range.setEnd(n, at + text.length);
                const r = range.getClientRects()[0];
                return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, width: r.width, height: r.height };
            }
            throw new Error('Word is not rendered');
        }, needle);
    }
    async function pointAt(page: Page, selector: string) { const r = await page.locator(selector).boundingBox(); expect(r).not.toBeNull(); await page.mouse.click(r!.x + r!.width / 2, r!.y + r!.height / 2); }
    test('authored reports with optional session context appear in the account list without service-admin access', async ({ page, baseURL }, info) => {
        const a = await setup(page, info, baseURL!);
        try {
            const me = await sessionApi<{
                user: {
                    id: string;
                };
            }>(page, '/api/auth/me');
            expect(me.status).toBe(200);
            const sessionless = await a.call("kanvas_call", "kanvas.feedback.submit", { requestId: randomUUID(), title: 'Account observation', description: 'General observation without a session target.', client: 'other' });
            expect(sessionless.sessionId).toBeUndefined();
            expect(sessionless.authorId).toBe(me.data!.user.id);
            await tab(page, 'Activity');
            await page.getByRole('button', { name: 'Reports', exact: true }).click();
            await page.getByRole('button', { name: 'Write a report', exact: true }).click();
            await page.getByLabel('Related display', { exact: true }).selectOption(a.d.id);
            await page.getByLabel('Report title', { exact: true }).fill('Contextual observation');
            await page.getByLabel('What happened or could be better?').fill('An authored report with optional display context.');
            await page.getByRole('button', { name: 'Submit report', exact: true }).click();
            await expect(page.locator('.reports-panel').getByRole('status')).toContainText('Report saved');
            await expect(page.getByRole('article', { name: 'Report: Contextual observation', exact: true })).toBeVisible();
            await expect(page.getByRole('article', { name: 'Report: Account observation', exact: true })).toHaveCount(0);
            await page.getByLabel('Report list', { exact: true }).selectOption('account');
            await expect(page.getByRole('article', { name: 'Report: Account observation', exact: true })).toBeVisible();
            await expect(page.getByRole('article', { name: 'Report: Contextual observation', exact: true })).toBeVisible();
            const records = await a.call("kanvas_call", "kanvas.reports.read", {});
            const own = records.reports.filter((r: any) => ['Account observation', 'Contextual observation'].includes(r.title));
            expect(own).toHaveLength(2);
            expect(own.every((r: any) => r.authorId === me.data!.user.id)).toBe(true);
            expect(own.find((r: any) => r.title === 'Contextual observation')).toMatchObject({ sessionId: a.s, displayId: a.d.id });
            expect(own.find((r: any) => r.title === 'Account observation').sessionId).toBeUndefined();
            const forbidden = await a.client.callTool(operationRequest({
                name: "kanvas_call",
                arguments: {
                    operationId: "kanvas.reports.read",
                    arguments: {
                        allAccounts: true
                    }
                }
            }));
            expect(forbidden.isError).toBe(true);
            await expect(page.getByRole('option', { name: 'All reports · service administration' })).toHaveCount(0);
            await photo(page, info, 'authored-reports');
        }
        finally {
            await a.client.close();
        }
    });
});

test.describe("account coverage 4", () => {
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
    test('session overview restores real retained thumbnails while account home remains a list', async ({ page, baseURL }, info) => {
        const a = await setup(page, info, baseURL!);
        try {
            await a.show({ ...samples.fact, title: 'First retained frame' });
            await a.show({ ...samples.chart, title: 'Chart frame' });
            await a.show({ ...samples.number, title: 'Number frame' });
            await a.show({ version: 1, template: 'overview', data: {} });
            await expect(a.v.locator('.retained-overview-grid')).toBeVisible();
            await expect(a.v.locator('.retained-preview .template-fact')).toBeVisible();
            await expect(a.v.locator('.retained-preview .template-chart')).toHaveCount(1);
            await expect.poll(() => a.v.locator('.retained-overview-grid>article').evaluateAll(cards => cards.every(card => {
                const box = card.getBoundingClientRect(), caption = card.querySelector('.overview-card-caption')!.getBoundingClientRect();
                return caption.top >= box.top && caption.bottom <= box.bottom + 1;
            }))).toBe(true);
            expect(await a.v.locator('.retained-preview').first().evaluate(frame => {
                const box = frame.getBoundingClientRect(), preview = frame.firstElementChild!.getBoundingClientRect();
                return Math.abs((box.left + box.right) - (preview.left + preview.right)) < 2 && preview.top >= box.top - 1 && preview.bottom <= box.bottom + 1;
            })).toBe(true);
            await photo(a.v, info, 'session-thumbnails');
            await a.show({ version: 1, template: 'overview', data: { layout: 'list', showPreviews: false } });
            await expect(a.v.locator('.overview-list')).toBeVisible();
            await expect(a.v.locator('.retained-preview')).toHaveCount(0);
            await a.show({ version: 1, template: 'overview', data: { scope: 'account' } });
            await expect(a.v.locator('.retained-preview,.retained-overview-grid')).toHaveCount(0);
            await photo(a.v, info, 'account-list');
        }
        finally {
            await a.client.close();
        }
    });
    async function photo(page: Page, info: TestInfo, name: string) { for (const notice of await page.getByRole('button', { name: 'Dismiss notification', exact: true }).all())
        await notice.click(); await page.evaluate(() => document.fonts.ready); await mkdir(info.outputPath('visuals'), { recursive: true }); await page.screenshot({ path: `${info.outputPath('visuals')}/${info.project.name}-${name}.png`, animations: 'disabled' }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true); }
    async function asset(a: Fixture, color = '#267f9f', w = 240, h = 120) { return a.call("kanvas_call", "kanvas.asset.import", { sessionId: a.s, name: 'Acceptance logo.svg', mimeType: 'image/svg+xml', base64: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect x="1" y="1" width="${w - 2}" height="${h - 2}" fill="${color}" stroke="#ffffff" stroke-width="2"/><circle cx="${w / 2}" cy="${h / 2}" r="${h / 3}" fill="#ffffff"/><text x="${w / 2}" y="${h / 2 + 5}" text-anchor="middle" fill="${color}" font-size="16">K</text></svg>`).toString('base64') }); }
});
