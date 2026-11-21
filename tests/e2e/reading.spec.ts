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
import type { Browser } from '@playwright/test';
import type { DisplayRecord } from '../../src/shared/types';
import { advancedChartExamples } from '../../src/shared/advanced-chart-examples';
import { samples } from '../../src/shared/template-examples';
import { tab } from './support';

test.describe("reading coverage 1", () => {
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
    test('parameter types stay whole, generic chat context is readable and messages have no reply controls', async ({ page, baseURL }, info) => {
        const a = await setup(page, info, baseURL!);
        try {
            await a.show({ version: 1, template: 'tool-detail', data: { name: 'source.read', parameters: ['string', 'integer', 'object'].map((type, i) => ({ name: `field_${i}`, type, required: true, description: 'A supplied parameter description.' })) } });
            // 2026-11-10 (7e7fb1b1): on a narrow screen each parameter is a card and its type has a line of its own that may wrap
            // when a type is longer than the card. The contract this test protects is unchanged: a type is never split inside a
            // word and never overflows. Wide screens keep the one-line column.
            const cells = a.v.locator('td.parameter-type');
            await expect(cells).toHaveCount(3);
            expect(await cells.evaluateAll(els => els.map(e => { const range = document.createRange(); range.selectNodeContents(e); const style = getComputedStyle(e); return { text: e.textContent, lines: new Set([...range.getClientRects()].map(r => Math.round(r.top))).size, overflows: e.scrollWidth > e.clientWidth + 1, layout: style.display === 'table-cell' ? `column ${style.whiteSpace}` : 'card' }; }))).toEqual(['string', 'integer', 'object'].map(text => ({ text, lines: 1, overflows: false, layout: info.project.name.startsWith('phone') ? 'card' : 'column nowrap' })));
            await photo(a.v, info, 'parameter-types');
            await a.show({ version: 1, template: 'chat', data: { contextLabel: 'Research workspace', conversationLabel: '#release-review', participants: ['Ada', 'Bo', 'Casey'], messages: [{ id: 'first', sender: 'Ada', text: 'Preserve the exact value 1.2300.' }, { id: 'second', sender: 'Bo', text: 'The agent handles replies in the real messaging system.' }] } });
            await expect(a.v.locator('.chat-context')).toContainText('Research workspace');
            await expect(a.v.locator('.chat-context')).toContainText('#release-review');
            await expect(a.v.getByLabel('Conversation participants')).toContainText('Ada · Bo · Casey');
            await expect(a.v.locator('.render-actions,input,textarea')).toHaveCount(0);
            await photo(a.v, info, 'chat-context');
        }
        finally {
            await a.client.close();
        }
    });
});

test.describe("reading coverage 2", () => {

test('bubble chat preserves source text and fits desktop/phone',async({page})=>{
 await register(page);const s=await createSession(page,'Bubble regression'),d=await createDisplay(page,s,'Chat');
 await publishPrepared(page,s,[d.id],{version:1,template:'chat',data:{style:'bubbles',selfSender:'Alex',messages:[{id:'1',sender:'Sam',text:'Hello there'},{id:'2',sender:'Alex',text:'An exact response'}]}});
 const viewer=await openViewer(page,s,d.id);await expect(viewer.locator('.viewer-candidate .chat-bubbles')).toBeVisible();await expect(viewer.locator('.viewer-candidate .chat-self')).toContainText('An exact response');
 expect(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('flashcards are voice-first, visually graded and preserve agent-controlled progress',async({page})=>{
 await register(page);const s=await createSession(page,'Flashcard regression'),d=await createDisplay(page,s,'Cards');
 await publishPrepared(page,s,[d.id],{version:1,template:'flashcards',data:{mode:'test',cards:[{id:'hola',prompt:'Translate hola',answer:'hello',promptVisual:{kind:'diagram',data:{nodes:[{id:'q',label:'hola',shape:'terminal'}],edges:[]}}},{id:'adios',prompt:'Translate adiós',answer:'goodbye'}]}});
 const viewer=await openViewer(page,s,d.id),deck=viewer.locator('.viewer-candidate .flashcards');
 await expect(deck).toBeVisible();await expect(deck.getByRole('button')).toHaveCount(0);await expect(deck.getByRole('textbox')).toHaveCount(0);
 await expect(deck.getByRole('progressbar',{name:'Card position'})).toHaveAttribute('value','1');
 const control=async(action:string,response?:string)=>{const detail=await sessionApi<any>(page,`/api/sessions/${s}`),display=detail.data.displays.find((x:any)=>x.id===d.id),data=display.view.data;
  const result=await page.evaluate(async body=>{const me=await (await fetch('/api/auth/me')).json();const r=await fetch('/api/flashcards/control',{method:'POST',headers:{'Content-Type':'application/json','X-Kanvas-CSRF':me.data.csrfToken},body:JSON.stringify(body)});return r.status;},{sessionId:s,displayId:d.id,deckId:data.deckId,expectedRevision:display.revision,expectedDeckRevision:data.deckRevision,requestId:crypto.randomUUID(),cardId:data.cards[data.index].id,action,...(response?{response}:{})});expect(result).toBe(200);};
 await control('answer','incorrect response');await expect(deck.getByRole('img',{name:'Incorrect answer',exact:true})).toBeVisible();await expect(deck).toContainText('hello');await expect(deck).not.toContainText('Exact text matching');
 const face=await deck.locator('.flashcard-face').boundingBox();expect(face!.height).toBeGreaterThan(viewer.viewportSize()!.height*.55);
 await expect(viewer.locator('.viewer-toast')).toHaveCount(0,{timeout:15000});
 await viewer.screenshot({path:`/home/deploy/kanvas-feedback-20261014-visuals/${test.info().project.name}-flashcards-incorrect.png`});
 await control('answer','hello');await expect(deck.getByRole('img',{name:'Correct answer',exact:true})).toBeVisible();
 await expect(viewer.locator('.viewer-toast')).toHaveCount(0,{timeout:15000});
 await viewer.screenshot({path:`/home/deploy/kanvas-feedback-20261014-visuals/${test.info().project.name}-flashcards-correct.png`});
 await control('next');await expect(deck).toContainText('Translate adiós');await viewer.reload();await expect(viewer.locator('.viewer-candidate .flashcards progress')).toHaveAttribute('value','2');
 expect(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await expect(viewer.locator('.viewer-toast')).toHaveCount(0,{timeout:15000});
 await viewer.screenshot({path:`/home/deploy/kanvas-feedback-20261014-visuals/${test.info().project.name}-flashcards.png`});
});
});

test.describe("reading coverage 3", () => {
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
    test('records, status colours, stories, recipe pictures and icons preserve the supplied source', async ({ page, baseURL }, info) => {
        const a = await setup(page, info, baseURL!);
        try {
            const image = await asset(a), record: ViewSpec = { version: 1, template: 'record-detail', data: { id: 'INC-482', title: 'Release approval', status: 'Review', statusColor: '#39ad82', assignees: ['Kim', 'Sam'], fields: { Exact: '1.2300', Contract: '9007199254740993' }, description: 'The complete supplied description.\n\nNo summaries or inferred fields.', activity: [{ id: 'a', author: 'Kim', timestamp: 'Yesterday (source)', text: 'Original discussion text.' }], related: [{ id: 'D-1', type: 'Deal', title: 'Related contract' }] } };
            const original = await a.show(record);
            for (const text of ['INC-482', 'Kim, Sam', '1.2300', '9007199254740993', 'Original discussion text.', 'Related contract'])
                await expect(a.v.locator('.record-detail')).toContainText(text);
            expect((await a.current()).view).toEqual(original.view);
            await photo(a.v, info, 'record-detail');
            await a.show({ version: 1, template: 'cards', data: { items: [{ id: 'a', title: 'Review', status: 'Custom status', statusColor: '#123456', fields: { Exact: '1.2300' } }] } });
            await expect(a.v.locator('.record-state-dot')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
            await a.show({ version: 1, template: 'story-cards', data: { items: [{ image: { url: image.url, alt: 'Article picture' }, headline: 'A clear headline', summary: 'The original short summary.' }, { headline: 'Text-only story', summary: 'No placeholder picture.' }] } });
            await expect(a.v.locator('.story-card')).toHaveCount(2);
            await expect(a.v.locator('.story-card img')).toHaveCount(1);
            await photo(a.v, info, 'story-cards');
            const recipe: ViewSpec = { version: 1, template: 'recipe', data: { name: 'Lemon cake', steps: ['Mix the batter.', 'Bake for 20 minutes.'], image: { url: image.url, alt: 'Finished cake' }, stepDetails: [{ index: 0, action: 'mix', image: { url: image.url, alt: 'Mixing bowl' } }, { index: 1, action: 'bake' }], mode: 'overview' } };
            await a.show(recipe);
            await expect(a.v.getByRole('img', { name: 'Finished cake' })).toBeVisible();
            await expect(a.v.getByRole('img', { name: 'mix', exact: true })).toBeVisible();
            await photo(a.v, info, 'recipe-overview');
            await a.show({ ...recipe, data: { ...recipe.data, mode: 'steps', stage: 'step', index: 0 } });
            await expect(a.v.getByRole('img', { name: 'Mixing bowl' })).toBeVisible();
            await expect(a.v.getByRole('img', { name: 'mix', exact: true })).toBeVisible();
            await photo(a.v, info, 'recipe-step');
            await a.show({ version: 1, template: 'itinerary', data: { days: [{ date: '2026-09-23', items: [{ title: 'Fly to Oslo', category: 'flight' }, { title: 'Hotel check-in', category: 'hotel' }, { title: 'Dinner', category: 'food' }] }] } });
            for (const name of ['flight', 'hotel', 'food'])
                await expect(a.v.getByRole('img', { name, exact: true })).toBeVisible();
            await a.show({ version: 1, template: 'scoreboard', data: { sides: [{ id: 'a', name: 'North', score: 2 }, { id: 'b', name: 'South', score: 1 }], event: { text: 'Goal · Alex 42′', type: 'goal', sideId: 'a' } } });
            await expect(a.v.locator('.scoreboard-event')).toContainText('Goal · Alex 42′');
            await photo(a.v, info, 'score-event');
        }
        finally {
            await a.client.close();
        }
    });
    async function photo(page: Page, info: TestInfo, name: string) { for (const notice of await page.getByRole('button', { name: 'Dismiss notification', exact: true }).all())
        await notice.click(); await page.evaluate(() => document.fonts.ready); await mkdir(info.outputPath('visuals'), { recursive: true }); await page.screenshot({ path: `${info.outputPath('visuals')}/${info.project.name}-${name}.png`, animations: 'disabled' }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true); }
    async function asset(a: Fixture, color = '#267f9f', w = 240, h = 120) { return a.call("kanvas_call", "kanvas.asset.import", { sessionId: a.s, name: 'Acceptance logo.svg', mimeType: 'image/svg+xml', base64: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect x="1" y="1" width="${w - 2}" height="${h - 2}" fill="${color}" stroke="#ffffff" stroke-width="2"/><circle cx="${w / 2}" cy="${h / 2}" r="${h / 3}" fill="#ffffff"/><text x="${w / 2}" y="${h / 2 + 5}" text-anchor="middle" fill="${color}" font-size="16">K</text></svg>`).toString('base64') }); }
});
