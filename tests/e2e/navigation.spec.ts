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
import { createDisplay } from './support';
import { createSession } from './support';
import { expect } from './support';
import { isolatedContext } from './support';
import { openViewer } from './support';
import { publishPrepared } from './support';
import { register } from './support';
import { sessionApi } from './support';
import { sessionDetail } from './support';
import { tab } from './support';
import { test } from './support';
import { viewerPath } from './support';
import { waitForDisplay } from './support';
import { login } from './support';
import { publicReference } from '../../src/server/mcp/operations';
import type { DisplayRecord } from '../../src/shared/types';
import type { InteractionRecord } from '../../src/shared/types';
import type { UpdateRecord } from '../../src/shared/types';
import { SEAT_LAYOUTS } from '../../src/shared/venue';
import { SIGN_TYPES } from '../../src/shared/venue';
import { Store } from '../../src/server/store';
import { testDatabase } from '../postgres';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createHash } from 'node:crypto';
import { createApp } from '../../src/server/app';
import { removeTestDatabase } from '../postgres';
import type { Browser } from '@playwright/test';
import { samples } from '../../src/shared/template-examples';

test.describe("navigation coverage 1", () => {
    async function setup(page: Page, info: TestInfo, baseURL: string) {
        await register(page);
        const sessionId = await createSession(page, 'Afternoon release acceptance'), display = await createDisplay(page, sessionId, 'Receiving screen'), viewer = await openViewer(page, sessionId, display.id);
        const issued = await sessionApi<{
            token: string;
        }>(page, '/api/tokens', 'POST', { name: 'Disposable release client', scopes: ['read', 'publish'] });
        expect(issued.status).toBe(201);
        const options = { requestInit: { headers: { Authorization: `Bearer ${issued.data!.token}` } } }, client = info.project.name.startsWith('phone') ? new LegacyClient({ name: 'afternoon-legacy', version: '1' }) : new Client({ name: 'afternoon-modern', version: '1' });
        if (client instanceof Client)
            await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseURL), options));
        else
            await client.connect(new LegacyTransport(new URL('/mcp', baseURL), options));
        const call = async <T = any>(tool: string, operation: string, args: Record<string, unknown> = {}) => { const result = await client.callTool(operationRequest({ name: tool, arguments: { operation, ...args } })); expect(result.isError, `${tool} ${operation} succeeds`).not.toBe(true); return (result.structuredContent as {
            data: T;
        }).data; };
        const current = () => waitForDisplay(page, sessionId, display.id, d => d.revision > 0 && d.appliedRevision === d.revision);
        const show = async (view: ViewSpec) => { await publishPrepared(page, sessionId, [display.id], view); return current(); };
        const nav = async (navigation: unknown) => { const d = await current(); return call("kanvas_call", "kanvas.navigation.control", { sessionId, displayId: display.id, requestId: randomUUID(), expectedRevision: d.revision, navigation }); };
        return { sessionId, display, viewer, client, call, current, show, nav };
    }
    async function photo(page: Page, info: TestInfo, name: string) { const directory = info.outputPath('visuals'); await mkdir(directory, { recursive: true }); await page.screenshot({ path: `${directory}/${info.project.name}-${name}.png`, animations: 'disabled' }); }
    test('reading navigation commands change actual typography and pacing, pause in place, and carry independent defaults to a new session', async ({ page, baseURL }, info) => {
        const s = await setup(page, info, baseURL!);
        try {
            const text = Array.from({ length: 70 }, (_, i) => `Paragraph ${i + 1}. Keep these exact source words and the decimal 9007199254740993.001 intact. This paragraph has enough readable context to check real scroll geometry.`).join('\n\n');
            const original = await s.show({ version: 1, template: 'document', title: 'A readable source', data: { layout: 'reading', text } }), reader = s.viewer.getByRole('region', { name: 'Document reader' });
            // October 27 intentionally removed the in-view toolbar; drive the supported MCP controls.
            await expect(s.viewer.getByRole('navigation', { name: 'Reading controls' })).toHaveCount(0);
            await expect(reader).toHaveAttribute('data-reading-playing', 'false');
            await expect(reader).toHaveAttribute('data-reading-wpm', '220');
            const font = () => s.viewer.locator('.document-article').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
            const initialFont = await font();
            await s.nav({ action: 'reading', command: 'configure', fontSize: 32, saveDefaults: false });
            await expect(reader).toHaveCSS('--reading-font-size', '32px');
            await expect.poll(font).toBeGreaterThan(initialFont);
            await expect(reader).toHaveCSS('--reading-zoom', '1');
            await s.nav({ action: 'reading', command: 'configure', zoom: 1.1, saveDefaults: false });
            await expect(reader).toHaveCSS('--reading-zoom', '1.1');
            await expect(reader).toHaveCSS('--reading-font-size', '32px');
            await s.nav({ action: 'reading', command: 'slower', saveDefaults: false });
            await expect(reader).toHaveAttribute('data-reading-wpm', '190');
            await s.viewer.bringToFront();
            await s.nav({ action: 'reading', command: 'start', saveDefaults: false });
            await expect(reader).toHaveAttribute('data-reading-playing', 'true');
            await expect.poll(() => reader.evaluate(el => el.scrollTop)).toBeGreaterThan(20);
            const observed = await s.call("kanvas_call", "kanvas.viewers.read", { sessionId: s.sessionId, displayId: s.display.id });
            expect(observed.some((v: any) => v.connected)).toBe(true);
            await s.nav({ action: 'reading', command: 'pause', saveDefaults: false });
            await expect(reader).toHaveAttribute('data-reading-playing', 'false');
            const held = await reader.evaluate(el => el.scrollTop);
            await expect.poll(async () => Math.abs(await reader.evaluate(el => new Promise<number>(resolve => setTimeout(() => resolve(el.scrollTop), 400))) - held)).toBeLessThan(3);
            await s.nav({ action: 'reading', command: 'configure', fontSize: 32, wpm: 190, zoom: 1.1, saveDefaults: true });
            const pref = await s.call("kanvas_call", "kanvas.preferences.get");
            expect(pref.config).toMatchObject({ readingFontSize: 32, readingWpm: 190, readingZoom: 1.1 });
            expect((await s.current()).view).toEqual(original.view);
            expect((await s.current()).revision).toBe(original.revision);
            await s.nav({ action: 'reading', command: 'start', wpm: 320, saveDefaults: false });
            await expect(reader).toHaveAttribute('data-reading-wpm', '320');
            await s.nav({ action: 'reading', command: 'pause' });
            await s.show({ version: 1, template: 'document', title: 'Next reading', data: { layout: 'reading', text } });
            await expect(reader).toHaveAttribute('data-reading-playing', 'false');
            await expect(reader).toHaveAttribute('data-reading-wpm', '190');
            await expect.poll(() => reader.evaluate(el => el.scrollTop)).toBeLessThan(2);
            const next = await createSession(page, 'Independent new reading defaults');
            expect((await sessionDetail(page, next)).session.config).toMatchObject({ readingFontSize: 32, readingWpm: 190, readingZoom: 1.1 });
            await photo(s.viewer, info, 'reading');
        }
        finally {
            await s.client.close();
        }
    });
});

test.describe("navigation coverage 2", () => {
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
    test('content-aware cards/bookmarks fit the viewport, keep per-item new tabs and preserve preview', async ({ page, context, baseURL }, info) => {
        const a = await setup(page, info, baseURL!);
        try {
            await a.v.setViewportSize({ width: 1900, height: 1000 });
            const columns = async (selector: string) => a.v.locator(selector).evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length);
            await a.show({ version: 1, template: 'cards', data: { items: Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, title: `Label ${i}` })) } });
            const short = await columns('.record-grid');
            expect(short).toBeGreaterThanOrEqual(6);
            await a.show({ version: 1, template: 'cards', data: { items: Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, title: `A considerably longer descriptive title for meaningful source item ${i}`, description: 'This complete contextual paragraph should get an appropriately wide readable card instead of six tightly packed columns. '.repeat(2) })) } });
            expect(await columns('.record-grid')).toBeLessThan(short);
            await a.v.setViewportSize(info.project.use.viewport as {
                width: number;
                height: number;
            });
            await photo(a.v, info, 'content-aware-cards');
            await context.route('https://example.com/evening/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body><h1>Original source page</h1></body></html>' }));
            await context.route('**/website-preview', route => route.fulfill({ json: { data: { status: 'interactive', remoteContentVerified: false } } }));
            await a.show({ version: 1, template: 'bookmarks', data: { items: Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, title: `A descriptive research reference with full source context ${i}`, url: `https://example.com/evening/${i}` })) } });
            await expect(a.v.getByRole('link', { name: 'Open in new tab' })).toHaveCount(6);
            await photo(a.v, info, 'bookmark-card-containment');
            const overlaps = await a.v.locator('.bookmark-card').evaluateAll(cards => cards.map((card, i) => { const r = card.getBoundingClientRect(), preview = card.querySelector('.bookmark-preview')!.getBoundingClientRect(), link = card.querySelector('a')!.getBoundingClientRect(); return { i, inside: r.bottom - link.bottom, separation: link.top - preview.bottom }; }).filter(g => g.inside < 5 || g.separation < 5));
            expect(overlaps, 'Every new-tab link stays inside its card and clear of the preview').toEqual([]);
            const popupPromise = a.v.waitForEvent('popup');
            await a.v.getByRole('link', { name: 'Open in new tab' }).first().click();
            const popup = await popupPromise;
            await expect(popup.getByRole('heading', { name: 'Original source page' })).toBeVisible();
            await popup.close();
            await a.v.getByRole('button', { name: /Preview A descriptive research reference/ }).first().click();
            await expect(a.v.frameLocator('iframe').getByRole('heading', { name: 'Original source page' })).toBeVisible();
            await a.v.getByRole('button', { name: '← Bookmarks' }).click();
            await photo(a.v, info, 'bookmark-actions');
        }
        finally {
            await a.client.close();
        }
    });
    test('positional arrows page inward then move across retained views, keep another viewer unchanged and show thumbnail overview', async ({ page, baseURL }, info) => {
        const a = await setup(page, info, baseURL!);
        try {
            await a.show({ version: 1, template: 'fact', title: 'First frame', data: { text: 'First retained view' } });
            await a.show({ version: 1, template: 'table', title: 'Paged source', data: { columns: ['Row'], rows: [['Row one'], ['Row two'], ['Row three']], pageSize: 1 } });
            const last = await a.show({ version: 1, template: 'fact', title: 'Last frame', data: { text: 'Last retained view' } }), peer = await openViewer(page, a.s, a.d.id);
            const history = await a.call("kanvas_call", "kanvas.display.history", { sessionId: a.s, displayId: a.d.id });
            await expect.poll(async () => { const r = await sessionApi<any>(page, `/api/sessions/${a.s}/displays/${a.d.id}/filmstrip`); return r.data.frames.length; }).toBe(3);
            await a.v.locator('.viewer-candidate').click({ position: { x: 20, y: 20 } });
            await a.v.keyboard.press('ArrowLeft');
            await expect(a.v.locator('tbody')).toContainText('Row three');
            await a.v.keyboard.press('ArrowLeft');
            await expect(a.v.locator('tbody')).toContainText('Row two');
            await a.v.keyboard.press('ArrowLeft');
            await expect(a.v.locator('tbody')).toContainText('Row one');
            await a.v.keyboard.press('ArrowLeft');
            await expect(a.v.locator('.viewer-candidate')).toContainText('First retained view');
            await a.v.keyboard.press('End');
            await expect(a.v.locator('.viewer-candidate')).toContainText('Last retained view'); // Home opens the session overview; choosing a retained frame remains private.
            await a.v.keyboard.press('Home');
            await expect(a.v.getByRole('region', { name: 'Session filmstrip' })).toBeVisible();
            await expect(a.v.locator('.filmstrip-card')).toHaveCount(3);
            await expect(peer.locator('.viewer-candidate')).toContainText('Last retained view');
            await a.v.getByRole('button', { name: 'Open First frame at position 1', exact: true }).click();
            await expect(a.v.locator('.viewer-candidate')).toContainText('First retained view');
            await expect(peer.locator('.viewer-candidate')).toContainText('Last retained view');
            await a.v.keyboard.press('Escape');
            await expect(a.v.getByRole('region', { name: 'Session filmstrip' })).toHaveCount(0);
            await a.v.getByRole('button', { name: 'Display controls', exact: true }).click();
            await a.v.getByRole('button', { name: 'Session overview', exact: true }).click();
            await expect(a.v.getByRole('region', { name: 'Session filmstrip' })).toBeVisible();
            await expect(a.v.locator('.filmstrip-card')).toHaveCount(3);
            await photo(a.v, info, 'filmstrip-overview');
            await a.v.getByRole('button', { name: 'Open Paged source at position 2' }).click();
            await expect(a.v.locator('tbody')).toContainText('Row one');
            expect((await a.current()).revision).toBe(last.revision);
            expect(await a.call("kanvas_call", "kanvas.display.history", { sessionId: a.s, displayId: a.d.id })).toEqual(history);
            await peer.close();
            await publishPrepared(page, a.s, [a.d.id], { version: 1, template: 'fact', title: 'New live frame', data: { text: 'New live content while privately browsing' } });
            // A new authorized shared revision returns private history browsing to live.
            await expect(a.v.locator('.viewer-candidate')).toContainText('New live content while privately browsing');
            const current = await a.current();
            expect(current.revision).toBe(last.revision + 1);
            expect(current.appliedRevision).toBe(current.revision);
        }
        finally {
            await a.client.close();
        }
    });
    test('touch swipes step positionally while vertical gestures keep reading scroll', async ({ page, baseURL }, info) => {
        const a = await setup(page, info, baseURL!);
        try {
            await a.show({ version: 1, template: 'fact', data: { text: 'Swipe first' } });
            await a.show({ version: 1, template: 'fact', data: { text: 'Swipe second' } });
            await a.v.locator('.viewer-candidate .browsing-root').evaluate(root => { const dispatch = (type: string, x: number, y: number) => { const t = new Touch({ identifier: 1, target: root, clientX: x, clientY: y }); root.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] })); }; dispatch('touchstart', 70, 180); dispatch('touchend', 240, 185); });
            await expect(a.v.locator('.viewer-candidate')).toContainText('Swipe first');
            await a.v.locator('.viewer-candidate .browsing-root').evaluate(root => { const t = new Touch({ identifier: 1, target: root, clientX: 150, clientY: 350 }); root.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t], changedTouches: [t] })); const end = new Touch({ identifier: 1, target: root, clientX: 145, clientY: 100 }); root.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [end] })); });
            await expect(a.v.locator('.viewer-candidate')).toContainText('Swipe first');
        }
        finally {
            await a.client.close();
        }
    });
});

test.describe("navigation coverage 3", () => {


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

test('long documents start with the supplied content and scroll to the exact last paragraph',async({page},info)=>{
  const {s,d,viewer}=await setup(page,info),text='Opening heading\n\n'+Array.from({length:45},(_,i)=>`Supplied paragraph ${i+1}. The exact value is 123.4500. Clear reading preserves every sentence, rather than shrinking it into a fact card.`).join('\n\n')+'\n\nThe final supplied paragraph.';
  await publishPrepared(page,s,[d.id],{version:1,template:'document',title:'A supplied article',data:{text,layout:'reading',headings:[{start:0,end:15,level:2}]}});await ready(page,s,d.id,'document');
  await expect(viewer.locator('.view-heading')).toHaveCount(0);
  await expect(viewer.locator('.document-article h2')).toHaveText('Opening heading');
  await expect(viewer.locator('.document-article h2')).toBeInViewport({ratio:1});
  await expect(viewer.locator('.document-article>p').first()).toBeInViewport({ratio:1});
  await expect(viewer.locator('.document-article')).toContainText('Supplied paragraph 1.');await photo(viewer,info,'document-top');
  await viewer.getByRole('region',{name:'Document reader'}).evaluate(el=>{el.scrollTop=el.scrollHeight;});await expect(viewer.getByText('The final supplied paragraph.',{exact:true})).toBeInViewport();
  expect((await sessionDetail(page,s)).displays.find(item => item.id === d.id)!.view?.data.text).toBe(text);expect(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await photo(viewer,info,'document-bottom');
});
});

test.describe("navigation coverage 4", () => {


test('diagnostic batches exclude raw errors and preserve support reference across navigation',async({page})=>{
 await register(page);
 const reference=await page.evaluate(()=>sessionStorage.getItem('kanvas-diagnostic-reference'));
 await page.evaluate(()=>window.dispatchEvent(new ErrorEvent('error',{message:'Private typed answer https://example.invalid/?token=do-not-record',filename:'https://example.invalid/private.js?token=do-not-record'})));
 await page.goto('/start');
 expect(await page.evaluate(()=>sessionStorage.getItem('kanvas-diagnostic-reference'))).toBe(reference);
 await expect.poll(async()=>{const result=await page.request.get('/api/diagnostics?supportRef='+reference);if(!result.ok())return false;const body=(await result.json()).data;expect(JSON.stringify(body)).not.toContain('Private typed');expect(JSON.stringify(body)).not.toContain('do-not-record');expect(body.supportRef).toBe(reference);return body.timeline.some((batch:{events:{event:string}[]})=>batch.events.some(event=>event.event==='js-error'));}).toBe(true);
});
});

test.describe("navigation coverage 5", () => {

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
test('platform zoom applies through real MCP without changing source revision',async({page,baseURL},info)=>{
 const a=await setup(page,baseURL!);try{
 const d=await a.show('kanban',{columns:Array.from({length:5},(_,i)=>({id:'c'+i,name:'Column '+i,cards:Array.from({length:6},(_,j)=>({id:i+'-'+j,title:'Task '+j,description:'Detailed work to complete'}))}))});
 await a.update('kanvas.navigation.control',{requestId:'zoom-out',expectedRevision:d.revision,navigation:{action:'zoom',scale:.5}});
 await expect.poll(()=>a.viewer.locator('.viewer-candidate .render-surface').first().evaluate(el=>(el as HTMLElement).style.zoom)).toBe('0.5');expect((await a.current()).revision).toBe(d.revision);await photo(a.viewer,info,'zoom-kanban');
 }finally{await a.client.close();}
});
});

test.describe("navigation coverage 6", () => {

async function navigation(page:any,s:string,d:string,revision:number,action:unknown){const tabId=await page.evaluate(()=>sessionStorage.getItem('kanvas-viewer-tab'));return sessionApi(page,`/api/sessions/${s}/displays/${d}/navigation`,'POST',{tabId:tabId??'feedback26',requestId:crypto.randomUUID(),expectedRevision:revision,navigation:action});}
test('zoom fills the physical viewport, reading stays readable, and actual DOM inspection is bounded',async({page})=>{
 await register(page);const s=await createSession(page,'Zoom inspection'),d=await createDisplay(page,s,'Reading');
 await sessionApi(page,`/api/sessions/${s}/config`,'PATCH',{config:{theme:'dark'}});
 await publishPrepared(page,s,[d.id],{version:1,template:'document',data:{layout:'reading',text:'Read this document comfortably. '.repeat(100)}});
 const revision=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!.revision;
 await page.goto(`/view/${s}/${d.id}`);await expect(page.locator('.viewer-candidate .document-content')).toBeVisible();
 // A broadcast navigation uses a real connected viewer tab identity.
 const tabId=await page.evaluate(()=>{const entry=Object.keys(sessionStorage).find(k=>k.includes('window'));return entry?sessionStorage.getItem(entry):null;});
 const observation=await sessionApi<any>(page,`/api/sessions/${s}/viewers`);expect(observation.status).toBe(200);
 // Browser controls use the page's own exported UI, avoiding artificial tab IDs.
 for(const scale of [1.6,2,2.5,1]){

  // Use a persisted real observation's tab ID through the isolated test DB, never credentials.
  const store=new Store(testDatabase(process.env.KANVAS_E2E_RUN_ID!));let tab:string;try{await store.ready;const viewers=await store.list<any>('viewer',s);tab=viewers.find(v=>v.displayId===d.id)!.tabId;}finally{await store.close();}
  const result=await sessionApi<any>(page,`/api/sessions/${s}/displays/${d.id}/navigation`,'POST',{tabId:tab,requestId:crypto.randomUUID(),expectedRevision:revision,navigation:{action:'zoom',scale}});expect(result.status).toBe(200);
  await expect.poll(async()=>page.locator('.viewer-candidate .render-surface').evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,zoom:getComputedStyle(el).zoom}))).toMatchObject({zoom:String(scale)});
  const box=await page.locator('.viewer-candidate .render-surface').boundingBox(),viewport=page.viewportSize()!;expect(box!.width).toBeGreaterThan(viewport.width*.95);expect(box!.height).toBeGreaterThan(viewport.height*.85);
 }
 const inspected=await sessionApi<any>(page,`/api/sessions/${s}/displays/${d.id}/inspect`,'POST',{detail:'dom',maxNodes:8,maxDepth:3});expect(inspected.status).toBe(200);const dom=inspected.data.observations.find((x:any)=>x.domAvailable)?.dom;expect(dom).toBeTruthy();expect(dom.theme).toBe('dark');expect(dom.elements.length).toBeLessThanOrEqual(8);expect(dom.css).toContain('font-size');expect(dom.html).not.toContain('csrf');expect(dom.truncated).toBe(true);
 const store=new Store(testDatabase(process.env.KANVAS_E2E_RUN_ID!));try{await store.ready;await expect.poll(async()=> (await store.list<any>('delivery-paint',s)).length).toBeGreaterThan(0);const rows=await store.list<any>('delivery-paint',s);expect(rows[0]).toMatchObject({revision:revision,paintConfirmed:true,request:expect.any(Object)});expect(rows[0].receiveToPaintMs).toBeGreaterThanOrEqual(0);}finally{await store.close();}
});
});

test.describe("navigation coverage 7", () => {

const evidence=()=>test.info().outputPath("screenshots");
async function clientFor(page:Page){const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable feedback acceptance',scopes:['read','publish']});expect(issued.status).toBe(201);const client=new Client({name:'feedback-acceptance',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',page.url()),{requestInit:{headers:{Authorization:'Bearer '+issued.data!.token}}}));return {client,call:async(operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});expect(result.isError).not.toBe(true);return (result.structuredContent as any).data;}};}
test('grouped stacks, independent line, native legend and dense category zoom',async({page})=>{
 await register(page);const s=await createSession(page,'Grouped native charts'),d=await createDisplay(page,s,'Chart');const points=(n:number)=>Array.from({length:100},(_,i)=>({x:`Category ${i+1}`,y:n+i%5}));
 await publishPrepared(page,s,[d.id],{version:1,template:'chart',data:{kind:'bar',stacking:'stacked',secondaryLabel:'Trend %',series:[{name:'A one',stackGroup:'a',points:points(2)},{name:'A two',stackGroup:'a',points:points(3)},{name:'B one',stackGroup:'b',points:points(6)},{name:'B two',stackGroup:'b',points:points(4)},{name:'Trend',kind:'line',axis:'secondary',points:points(60)}]}});await page.goto(`/view/${s}/${d.id}`);await expect(page.locator('.viewer-candidate .composable-chart')).toBeVisible();
 const first=page.locator('rect[data-chart-series="A one"]').first(),second=page.locator('rect[data-chart-series="A two"]').first(),other=page.locator('rect[data-chart-series="B one"]').first();expect(await first.getAttribute('x')).toBe(await second.getAttribute('x'));expect(await first.getAttribute('x')).not.toBe(await other.getAttribute('x'));await expect(second).toHaveAttribute('data-stack-start','2');
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();await expect(page.getByLabel('Pan chart categories')).toBeVisible();await expect(page.locator('rect[data-chart-series="A one"]')).toHaveCount(50);await page.getByRole('button',{name:'A two',exact:true}).click();await expect(page.locator('rect[data-chart-series="A two"]')).toHaveCount(0);await page.getByRole('button',{name:'A two',exact:true}).click();await expect(page.locator('rect[data-chart-series="A two"]')).toHaveCount(50);const ticks=await page.locator('.chart-category-label').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right};}));expect(ticks.length).toBeGreaterThan(1);for(let i=1;i<ticks.length;i++)expect(ticks[i].left).toBeGreaterThanOrEqual(ticks[i-1].right);await page.screenshot({path:`${evidence()}/${test.info().project.name}-grouped-chart.png`});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});
test('native menu from MCP, visual help and Home overview thumbnail navigation return to live',async({page})=>{
 await register(page);const s=await createSession(page,'Native controls'),d=await createDisplay(page,s,'Main'),d2=await createDisplay(page,s,'Second');const mcp=await clientFor(page);
 try{await mcp.call('kanvas.guidance.library.save',{promptId:'acceptance',name:'Acceptance prompt',text:'Wait for my explicit request.',requestId:randomUUID()});const library=await mcp.call('kanvas.guidance.library.list',{});expect(library.prompts[0].name).toBe('Acceptance prompt');await mcp.call('kanvas.guidance.library.activate',{promptId:'acceptance',sessionId:s,requestId:randomUUID()});await mcp.call('kanvas.guidance.library.delete',{promptId:'acceptance',requestId:randomUUID()});expect((await mcp.call('kanvas.notifications.targets',{})).targets).toEqual([]);expect((await mcp.call('kanvas.help.visual',{topic:'keyboard-shortcuts'})).pageCount).toBe(1);for(let i=0;i<8;i++)await publishPrepared(page,s,[i%3===0?d2.id:d.id],{version:1,template:'fact',title:`Retained card ${i+1}`,data:{text:`Supplied preview ${i+1}`}});await page.goto(`/view/${s}/${d.id}`);await expect(page.locator('.viewer-candidate')).toContainText('Supplied preview 8');
 await mcp.call('kanvas.screen.control',{sessionId:s,displayId:d.id,action:'menu',requestId:randomUUID()});await expect(page.locator('.viewer-menu')).toBeVisible();await expect(page.getByRole('link',{name:'Open console',exact:true})).toHaveCount(0);await expect(page.getByText('About this view',{exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'New-session notifications'})).toHaveCount(0);await page.keyboard.press('Escape');
 await page.locator('body').click({position:{x:10,y:10}});await page.keyboard.press('Home');await expect(page.getByRole('heading',{name:'Session overview',exact:true})).toBeVisible();await expect(page.locator('.filmstrip-group')).toHaveCount(2);await expect(page.locator('.filmstrip-card')).toHaveCount(8);await expect(page.locator('.filmstrip-card .retained-preview .render-surface').first()).toBeVisible();await page.screenshot({path:`${evidence()}/${test.info().project.name}-overview.png`});
 await page.locator('.filmstrip-card').first().click();await expect(page.locator('.filmstrip-reading')).toBeVisible();await page.locator('body').click({position:{x:10,y:10}});await page.keyboard.press('End');await expect(page.locator('.filmstrip-reading')).toHaveCount(0);await expect(page.locator('.viewer-candidate')).toContainText('Supplied preview 8');
 await publishPrepared(page,s,[d.id],{version:1,template:'fact',data:{text:'New live publication'}});await expect(page.locator('.viewer-candidate')).toContainText('New live publication');
 await mcp.call('kanvas.help.show',{sessionId:s,displayIds:[d.id],topic:'keyboard-shortcuts',page:0,requestId:randomUUID()});await expect(page.locator('.viewer-candidate')).toContainText('Session overview');await page.keyboard.press('Control+Home');await expect(page.locator('main.account-overview')).toBeVisible();
 }finally{await mcp.client.close();}
});

test('dense overview keeps 32 cards on one page then paginates 49 with stable thumbnail navigation',async({page})=>{
 await register(page);const s=await createSession(page,'Dense overview'),d=await createDisplay(page,s,'Slides');
 for(let i=0;i<32;i++)await publishPrepared(page,s,[d.id],{version:1,template:'fact',title:`Slide ${i+1}`,data:{text:`Retained slide ${i+1}`}});
 await page.goto(`/view/${s}/${d.id}`);await expect(page.locator('.viewer-candidate')).toContainText('Retained slide 32');await expect(page.locator('.viewer-shell')).toHaveAttribute('data-render-status','ready');await expect(page.locator('.viewer-toast-stack')).toBeAttached();await page.locator('.viewer-candidate').click({position:{x:10,y:10}});await page.keyboard.press('Home');await expect(page.locator('.filmstrip-card')).toHaveCount(32);await expect(page.locator('.filmstrip-grid')).toHaveAttribute('data-density','dense');const visibleCards=await page.locator('.filmstrip-card').evaluateAll(cards=>cards.filter(c=>{const r=c.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0;}).length);await expect.poll(()=>page.locator('.filmstrip-card .retained-preview .render-surface').count()).toBeGreaterThanOrEqual(visibleCards);for(const close of await page.locator('.viewer-toast button').all())await close.click();await page.screenshot({path:`${evidence()}/${test.info().project.name}-overview-32.png`});
 await page.keyboard.press('Escape');for(let i=32;i<49;i++)await publishPrepared(page,s,[d.id],{version:1,template:'fact',title:`Slide ${i+1}`,data:{text:`Retained slide ${i+1}`}});await page.reload();await expect(page.locator('.viewer-candidate')).toContainText('Retained slide 49');await expect(page.locator('.viewer-shell')).toHaveAttribute('data-render-status','ready');await expect(page.locator('.viewer-toast-stack')).toBeAttached();await page.locator('.viewer-candidate').click({position:{x:10,y:10}});await page.keyboard.press('Home');await expect(page.getByRole('heading',{name:'Session overview',exact:true})).toBeVisible();await page.keyboard.press('Home');await expect(page.locator('.filmstrip-card')).toHaveCount(48);await page.getByRole('button',{name:'Next views',exact:true}).click();await expect(page.locator('.filmstrip-card')).toHaveCount(1);await expect(page.locator('.filmstrip-card')).toContainText('49.');await page.locator('.filmstrip-card').click();await expect(page.locator('.filmstrip-reading')).toContainText('Retained slide 49');
});
});

test.describe("navigation coverage 8", () => {
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
    test('manual scrolling survives polls and overscroll without validation errors in tables, logs and compact overview', async ({ page, baseURL }, info) => {
        const a = await setup(page, info, baseURL!);
        try {
            const settleScroll = async (selector: string, wait = 1900) => { const el = a.v.locator(selector); await expect.poll(() => el.evaluate(e => e.scrollHeight - e.clientHeight), { message: `Overflow in ${selector}` }).toBeGreaterThan(80); await el.evaluate(e => { e.scrollTop = e.scrollHeight; }); await expect.poll(() => el.evaluate(e => e.scrollTop)).toBeGreaterThan(70); const at = await el.evaluate(e => e.scrollTop); await a.v.waitForTimeout(wait); expect(await el.evaluate(e => e.scrollTop)).toBeGreaterThan(at - 3); await expect(a.v.locator('.navigation-error')).toHaveCount(0); };
            const original = await a.show({ version: 1, template: 'table', data: { columns: ['Name', 'Value'], pageSize: 100, rows: Array.from({ length: 70 }, (_, i) => ({ Name: `Source row ${i}`, Value: '1.2300' })) } });
            await settleScroll('.table-scroll');
            expect((await a.current()).view).toEqual(original.view);
            await a.show({ version: 1, template: 'log', data: { entries: Array.from({ length: 80 }, (_, i) => ({ line: i + 1, level: 'info', message: `Exact source line ${i}` })) } });
            await settleScroll('[data-navigation-scroll]');
            for (let i = 0; i < 16; i++)
                await a.show({ version: 1, template: 'fact', title: `Retained ${i}`, data: { text: `Frame ${i}` } });
            await a.show({ version: 1, template: 'overview', data: { order: 'oldest', showMetadata: true, layout: 'list', showPreviews: false } });
            await expect(a.v.locator('.overview-list')).toBeVisible();
            expect(await a.v.locator('.overview-list article').first().evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(130);
            await expect(a.v.locator('.retained-preview,.retained-overview-grid')).toHaveCount(0);
            await expect(a.v.getByRole('button', { name: /^(Gallery|List)$/ })).toHaveCount(0);
            await settleScroll('.overview-content>[data-navigation-scroll]', 8500);
            await photo(a.v, info, 'compact-scrolled-overview');
            await a.v.evaluate(() => { const shell = document.querySelector('.viewer-shell')!; shell.classList.remove('theme-dark'); shell.classList.add('theme-light'); });
            await photo(a.v, info, 'compact-scrolled-overview-light');
        }
        finally {
            await a.client.close();
        }
    });
});

test.describe("navigation coverage 9", () => {


test('native embedded scrolling is quiet and display menu omits search controls',async({page},info)=>{
 await register(page);const s=await createSession(page,'Synthetic menus'),d=await createDisplay(page,s,'Embedded'),v=await openViewer(page,s,d.id);
 await publishPrepared(page,s,[d.id],{version:1,template:'device-preview',data:{description:'Synthetic frame collection',html:'<h1>Example only</h1>',viewports:['small-phone','iphone','pixel','galaxy','tablet','laptop']}});
 await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision&&x.revision>0);
 const navRequests:string[]=[];v.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/navigation'))navRequests.push(r.postData()??'');});
 const scrolled=await v.locator('.viewer-candidate').evaluate(root=>{const nodes=[...root.querySelectorAll<HTMLElement>('*')],el=nodes.find(e=>e.scrollHeight>e.clientHeight+50&&['auto','scroll'].includes(getComputedStyle(e).overflowY));if(!el)return false;el.scrollTop=150;el.dispatchEvent(new Event('scroll',{bubbles:true}));return el.scrollTop>0;});
 expect(scrolled).toBe(true);await v.waitForTimeout(1100);await expect(v.locator('.navigation-error')).toHaveCount(0);expect(navRequests).toEqual([]);
 await publishPrepared(page,s,[d.id],{version:1,template:'fact',data:{text:'Menu smoke content'}});await expect(v.locator('.viewer-candidate')).toContainText('Menu smoke content');
 await v.locator('.viewer-candidate').click({position:{x:30,y:30}});await v.keyboard.press('Escape');await expect(v.locator('.filmstrip-overview')).toHaveCount(0);await expect(v.locator('.viewer-candidate')).toContainText('Menu smoke content');
 await v.getByRole('button',{name:'Display controls',exact:true}).click();await expect(v.locator('.viewer-navigation')).toHaveCount(0);await expect(v.getByRole('button',{name:'Next match',exact:true})).toHaveCount(0);await expect(v.getByRole('button',{name:'Screen options',exact:true})).toBeVisible();await expect(v.getByRole('button',{name:'Refresh connection',exact:true})).toBeVisible();await expect(v.getByRole('button',{name:'Session overview',exact:true})).toBeVisible();await v.screenshot({path:info.outputPath('simplified-menu.png'),animations:'disabled'});
});
});
