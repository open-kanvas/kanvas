import { randomUUID } from 'node:crypto';
import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import { denied } from './harness.js';
import { fact } from './harness.js';
import { PNG } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import type { DisplayRecord } from '../../src/shared/types.js';
import type { InteractionRecord } from '../../src/shared/types.js';
import type { UpdateRecord } from '../../src/shared/types.js';
import type { ViewSpec } from '../../src/shared/types.js';
import { vi } from 'vitest';
import { validateView } from '../../src/shared/view-schemas.js';
import { validationIssues } from '../../src/server/input-errors.js';
import { z } from 'zod';
import { gameDataSchema } from '../../src/shared/game.js';
import { createApp } from '../../src/server/app.js';
import { rawEvent } from '../../src/server/raw-events.js';
import { eventContext } from '../../src/server/raw-events.js';
import { hash } from '../../src/server/auth';
import { safePushEndpoint } from '../../src/server/push';
import { diagnosticBatchSchema } from '../../src/shared/frontend-diagnostics';
import { diagnosticRoute } from '../../src/shared/frontend-diagnostics';
import { chatDataSchema } from '../../src/shared/work-views';
import { flashcardDataSchema } from '../../src/shared/flashcards';
import { advanceFlashcards } from '../../src/shared/flashcards';
import { flashcardControlSchema } from '../../src/shared/flashcards';
import { SEAT_LAYOUTS } from '../../src/shared/venue';
import { materializeSeats } from '../../src/shared/venue';
import { VOCABULARY } from '../../src/shared/venue';
import { venueSchemas } from '../../src/shared/venue';
import { validateStatic } from '../../src/server/custom-templates';
import { validateCustomSchema } from '../../src/server/custom-templates';
import { bindTemplate } from '../../src/shared/custom-templates';
import { DiscoveryCatalog } from '../../src/server/mcp/discovery';
import { safeError } from '../../src/server/mcp/results';
import { CANONICAL_TOOLS } from '../../src/server/mcp/canonical';
import { validateMedia } from '../../src/server/rendering/media';
import { signSchema } from '../../src/shared/venue';
import { navigate } from '../../src/shared/navigation';
import { initialNavigation } from '../../src/shared/navigation';
import { navigationCapabilities } from '../../src/shared/navigation';
import { navigationActionSchema } from '../../src/shared/navigation';
import { guidanceTools } from '../../src/server/agent-guidance';
import { DEFAULT_AGENT_GUIDANCE } from '../../src/server/agent-guidance';
import { safeUrl } from '../../src/client/api';
import type { Response } from 'express';
import { accountTier } from '../../src/server/usage-limits.js';
import { accountUsageLimits } from '../../src/server/usage-limits.js';
import { VisualCaptureResult } from '../../src/server/visual-capture.js';
import { resolveToolCall } from '../../src/server/mcp/catalog.js';
import { Checklists } from '../../src/server/checklists.js';
import type { ViewerPresence } from '../../src/shared/viewer-experience.js';
import { asyncMap } from '../../src/server/async-collections.js';
import { ControlledInterpreter } from './harness.js';
import type { MonitoringFetchResult } from '../../src/server/monitoring.js';
import type { MonitoringFetcher } from '../../src/server/monitoring.js';
import type { MonitoringSummary } from '../../src/shared/monitoring.js';
import type { Token } from '../../src/server/auth.js';
import { normalizedScroll } from '../../src/client/renderers/Navigation.js';
import { readFileSync } from 'node:fs';
import { samples } from '../../src/shared/template-examples.js';

describe("media coverage 1", () => {
    describe("media contracts", () => {
        let h!: Harness, owner: Browser, s: string, d: string, p: AuthPrincipal;
        const path = () => `/api/sessions/${s}/displays/${d}`;
        const call = async <T = Record<string, unknown>>(name: string, args: unknown) => (await h.runtime.service.execute(name, args, p)) as Promise<T>;
        const current = async () => (await owner.detail(s)).displays.find(x => x.id === d)!;
        const settle = async (update: UpdateRecord) => owner.settle(s, update.requestId);
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); s = (await owner.session()).id; d = (await owner.display(s)).id; p = { userId: owner.user!.id }; });
        afterEach(async () => { await h?.close(); });
        async function guest(interactive: boolean) {
            const share = await call<{
                id: string;
            }>("kanvas.share.create", { sessionId: s, displayId: d, allowInteraction: interactive });
            const g = h.browser();
            const pair = success(await g.request<{
                id: string;
            }>('POST', '/api/pairings', { shareId: share.id, deviceName: 'Evening test screen', requestedInteractive: interactive }));
            await call("kanvas.pairing.decide", { sessionId: s, pairingId: pair.id, approve: true, confirm: true, interactive });
            success(await g.request('GET', `/api/pairings/${pair.id}/status`));
            g.csrf = success(await g.request<{
                csrfToken: string;
            }>('GET', '/api/auth/me')).csrfToken;
            return g;
        }
        it('authorizes only actually rendered menu and join assets for paired screens', async () => {
            const a = success(await owner.request<{
                id: string;
                url: string;
            }>('POST', `/api/sessions/${s}/assets`, { name: 'Menu image', mimeType: 'image/png', base64: PNG }));
            await owner.submit(s, [d], { version: 1, template: 'menu', data: { groups: [{ title: 'Lunch', items: [{ name: 'Soup', image: { url: a.url, alt: 'Supplied soup' } }] }] } });
            const g = await guest(false);
            expect((await g.raw(a.url)).status).toBe(200);
            await owner.submit(s, [d], fact('Image no longer displayed'));
            expect((await g.raw(a.url)).status).toBe(404);
        });
    });
});

describe("media coverage 2", () => {


describe("media contracts",()=>{
 let h!:Harness,owner:Browser,sessionId:string,displayId:string;
 beforeEach(async()=>{h=await startHarness();owner=await h.account();sessionId=(await owner.session()).id;displayId=(await owner.display(sessionId)).id;});
 afterEach(async()=>{await h?.close();});
 it('retains image diagnostic history beyond its former cap and captures content-free raw failures',async()=>{
  const url='https://example.com/reference.png';await owner.submit(sessionId,[displayId],validateView({template:'image',data:{images:[{url,alt:'Reference'}]}}));
  await h.runtime.store.query(`INSERT INTO documents(kind,id,session_id,value) SELECT 'image-diagnostic','diagnostic-'||n,$1::text,json_build_object('id','diagnostic-'||n,'sessionId',$1::text,'displayId',$2::text,'revision',0,'reason','HTTP_404','at','2026-11-05T00:00:00Z')::text FROM generate_series(1,100) n`,[sessionId,displayId]);
  const display=await h.runtime.service.display({userId:owner.user!.id},sessionId,displayId);
  success(await owner.request('POST',`/api/sessions/${sessionId}/displays/${displayId}/image-diagnostic`,{expectedRevision:display.revision,url,reason:'HTTP_404'}));
  expect(await h.runtime.store.list('image-diagnostic',sessionId)).toHaveLength(101);
  const events=(await h.runtime.store.query("SELECT user_id,properties FROM events WHERE event_type='document.image-diagnostic'")).rows;
  expect(events).toEqual([expect.objectContaining({user_id:owner.user!.id,properties:expect.objectContaining({reason:'HTTP_404'})})]);expect(JSON.stringify(events)).not.toContain(url);
 });});
});

describe("media coverage 3", () => {

describe("media contracts",()=>{
 let h!:Harness,owner:Browser,s:string,d:string,p:AuthPrincipal;
 const send=vi.fn(async(_subscription:unknown,_payload:string)=>({statusCode:201}));
 beforeEach(async()=>{send.mockClear();h=await startHarness({pushOptions:{publicKey:'test-public-key',privateKey:'test-private-key',subject:'mailto:test@example.invalid',send}});owner=await h.account();s=(await owner.session()).id;d=(await owner.display(s)).id;p={userId:owner.user!.id};});
 afterEach(async()=>{await h?.close();});
 async function deck(){const result=await owner.submit(s,[d],{version:1,template:'flashcards',data:{mode:'test',cards:[{id:'hola',prompt:'hola',answer:'hello',acceptedAnswers:['hi']},{id:'adios',prompt:'adiós',answer:'goodbye'}]}});expect(result.update.status).toBe('prepared');return result.detail.displays.find(x=>x.id===d)!;}
 it('validates bounded visual card data and rejects executable/private image inputs',()=>{
  const card={id:'c',prompt:'Shape?',answer:'Decision'};
  expect(flashcardDataSchema.safeParse({cards:[{...card,promptVisual:{kind:'diagram',data:{nodes:[{id:'shape',label:'Decision',shape:'decision'}],edges:[]}}}]}).success).toBe(true);
  for(const url of ['javascript:alert(1)','https://127.0.0.1/private','https://user:pass@example.com/private'])expect(flashcardDataSchema.safeParse({cards:[{...card,promptVisual:{kind:'image',url,alt:'Unsafe'}}]}).success).toBe(false);
  expect(flashcardDataSchema.safeParse({cards:[{...card,promptVisual:{kind:'diagram',data:{nodes:[{id:'shape',label:'Unsafe',image:'https://localhost/private'}]}}}]}).success).toBe(false);
  expect(flashcardDataSchema.safeParse({cards:[{...card,promptVisual:{kind:'html',html:'<script>alert(1)</script>'}}]}).success).toBe(false);
 });
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/inert',keys:{p256dh:'B'.repeat(87),auth:'A'.repeat(22)}};
 it('binds subscriptions to browser/account; unsubscribes and logout revoke them',async()=>{
  success(await owner.request('POST','/api/push',subscription));
  const stranger=await h.account();expect((await stranger.request('POST','/api/push',subscription)).status).toBe(409);
  expect((await stranger.request('DELETE','/api/push')).status).toBe(200);expect(await h.runtime.store.get('push-subscription',hash(subscription.endpoint))).toBeDefined();
  success(await owner.request('DELETE','/api/push'));expect(await h.runtime.store.get('push-subscription',hash(subscription.endpoint))).toBeUndefined();
  success(await owner.request('POST','/api/push',subscription));success(await owner.request('POST','/api/auth/logout'));expect(await h.runtime.store.get('push-subscription',hash(subscription.endpoint))).toBeUndefined();
 });});
});

describe("media coverage 4", () => {
    describe("media contracts", () => {
        let h!: Harness, o: Browser, s: string, d: string, p: {
            userId: string;
        };
        beforeEach(async () => { h = await startHarness(); o = await h.account(); s = (await o.session()).id; d = (await o.display(s)).id; p = { userId: o.user!.id }; });
        afterEach(async () => { await h?.close(); });
        const call = (name: string, args: Record<string, unknown> = {}) => h.runtime.service.execute(name, args, p) as Promise<any>;
        const update = (name: string, args: Record<string, unknown>) => call(name, { sessionId: s, displayId: d, ...args });
        const publish = async (template: any, data: any) => { const result = await o.submit(s, [d], { version: 1, template, data }); expect(result.update.status).toBe('prepared'); return result.detail.displays.find(x => x.id === d)!; };
        const current = async () => (await o.detail(s)).displays.find(x => x.id === d)!;
        it('browser upload enforces CSRF/raster validation and account/session isolation with stable references', async () => {
            expect((await o.request('POST', '/api/media-library', { name: 'dish.png', mimeType: 'image/png', base64: PNG }, { csrf: null })).status).toBe(403);
            const media = success(await o.request<any>('POST', '/api/media-library', { name: 'dish.png', mimeType: 'image/png', base64: PNG, tags: ['lunch'] }));
            expect((await call("kanvas.media.list", { query: 'lunch' })).media).toHaveLength(1);
            const stranger = await h.account();
            expect((await stranger.raw(media.url)).status).toBe(404);
            expect((await o.raw(media.url)).status).toBe(200);
            const token = await h.runtime.auth.issueToken(p.userId, 'Selected', ['read', 'publish'], [s]);
            const stored = (await h.runtime.store.list<any>('token')).find(t => t.name === 'Selected')!;
            const restricted = { userId: p.userId, tokenId: stored.id };
            await expect(h.runtime.service.mediaLibrary.list(restricted)).rejects.toMatchObject({ code: 'FORBIDDEN' });
            expect(await h.runtime.service.customTemplateCatalog(restricted)).toEqual([]);
            await publish('todays-special', { item: { image: media.url } });
            expect((await current()).view!.data.item).toMatchObject({ image: media.url });
            await expect(h.runtime.service.mediaLibrary.own({ userId: stranger.user!.id }, media.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
            const bad = await o.request('POST', '/api/media-library', { name: 'bad.png', mimeType: 'image/png', base64: Buffer.from('<script>bad</script>').toString('base64') });
            expect(bad.status).toBeGreaterThanOrEqual(400);
        });
        const definition = { name: 'Team list', schema: { type: 'object', properties: { title: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } } }, required: ['title', 'items'] }, html: '<article><h1>{{title}}</h1><ul>{{#each items}}<li>{{name}}</li>{{/each}}</ul></article>', css: 'article {padding: 24px; color: white;} h1 {font-size: 48px;}' };
    });
});

describe("media coverage 5", () => {
    it('protected media is a safe image URL, not an arbitrary relative URL', () => {
        expect(safeUrl('/api/media/abc', true)).toBe('/api/media/abc');
        expect(safeUrl('/api/assets/abc', true)).toBe('/api/assets/abc');
        expect(safeUrl('/api/media/../tokens', true)).toBeUndefined();
        expect(bindTemplate('<ul>{{#each points}}<li>{{value}}</li>{{/each}}</ul>', { points: ['A', '<B>'] })).toBe('<ul><li>A</li><li>&lt;B&gt;</li></ul>');
        expect(CANONICAL_TOOLS.find(t => t.name === "kanvas.account.templates.create")!.description).toContain('{{value}}');
    });
    it('rejects corrupt PNG header/framing accepted by the previous signature-only check', () => {
        const valid = Buffer.from(PNG, 'base64');
        expect(validateMedia({ name: 'pixel.png', mimeType: 'image/png', base64: PNG }).width).toBe(1);
        const header = Buffer.from(valid);
        header[29] ^= 1;
        expect(() => validateMedia({ name: 'bad-header.png', mimeType: 'image/png', base64: header.toString('base64') })).toThrow();
        const chunk = Buffer.from(valid);
        chunk.writeUInt32BE(0xffffffff, 33);
        expect(() => validateMedia({ name: 'bad-chunk.png', mimeType: 'image/png', base64: chunk.toString('base64') })).toThrow();
        const truncated = Buffer.concat([valid.subarray(0, 37), valid.subarray(valid.length - 12)]);
        expect(() => validateMedia({ name: 'truncated.png', mimeType: 'image/png', base64: truncated.toString('base64') })).toThrow();
    });
});

describe("media coverage 6", () => {
    let h!: Harness;
    afterEach(async () => { vi.restoreAllMocks(); delete process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT; delete process.env.KANVAS_MAX_VIEWS_PER_SESSION; await h?.close(); });
    async function principal(a: Browser) { const session = await h.runtime.auth.issueBrowser(a.user!.id, { cookie: () => { } } as unknown as Response); return { userId: a.user!.id, browserId: session.id }; }
    const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=';
    describe("media contracts", () => {
        it('portable asset chunks preserve bytes and original session authorization', async () => {
            h = await startHarness();
            const owner = await h.account(), other = await h.account(), p = await principal(owner), q = await principal(other), s = await owner.session();
            const asset = await h.runtime.service.importAsset(p, s.id, { name: 'pixel.png', mimeType: 'image/png', base64: pixel });
            const chunks: Buffer[] = [];
            let offset = 0;
            for (;;) {
                const r: any = await h.runtime.service.execute("kanvas.asset.export", { sessionId: s.id, assetId: asset.id, offset, length: 13 }, p);
                chunks.push(Buffer.from(r.base64, 'base64'));
                if (r.complete)
                    break;
                offset = r.nextOffset;
            }
            expect(Buffer.concat(chunks).toString('base64')).toBe(pixel);
            await expect(h.runtime.service.execute("kanvas.asset.export", { sessionId: s.id, assetId: asset.id }, q)).rejects.toBeDefined();
            await expect(h.runtime.service.execute("kanvas.asset.export", { sessionId: s.id, assetId: asset.id, offset: 999 }, p)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
            const d = await owner.display(s.id);
            vi.spyOn(h.runtime.service.visualCapture, 'capture').mockResolvedValue(new VisualCaptureResult({ readiness: 'ready' }, Buffer.from(pixel, 'base64'), 'image/png'));
            const snapshot: any = await h.runtime.service.execute("kanvas.display.snapshot", { sessionId: s.id, displayId: d.id, includeBase64: true }, p);
            expect(snapshot.metadata.export).toMatchObject({ base64: pixel, mimeType: 'image/png', size: Buffer.from(pixel, 'base64').length });
        });
    });
});

describe("media coverage 7", () => {

let h!:Harness;
afterEach(async()=>{await h?.close();});
async function principal(a:Browser){const session=await h.runtime.auth.issueBrowser(a.user!.id,{cookie:()=>{}} as unknown as Response);return {userId:a.user!.id,browserId:session.id};}
const view={version:1 as const,template:'checklist' as const,title:'Release tasks',data:{items:[{id:'a',text:'Review',checked:false},{id:'b',text:'Test',checked:false}]}};
describe("media contracts",()=>{
 it('explicit session creation is immediately joinable, supports deliberate opt-out, never grants access',async()=>{
  h=await startHarness();const a=await h.account(),other=await h.account();
  const result:any=success(await a.request('POST','/api/sessions',{name:'Ready'}));expect(result.displays).toHaveLength(1);expect(result.viewerUrl).toContain(result.displays[0].id);expect(result.displays[0].view).toBeNull();
  expect((await other.request('GET',`/api/sessions/${result.id}`)).status).toBe(404);
  const blank:any=success(await a.request('POST','/api/sessions',{name:'Headless',initialDisplay:false}));expect(blank.displays).toEqual([]);
 });});
});

describe("media coverage 8", () => {


describe("media contracts",()=>{
  let h!:Harness,owner:Browser,sessionId:string,displayId:string,p:AuthPrincipal;
  const path=()=>`/api/sessions/${sessionId}/displays/${displayId}`;
  const call=async (name:string,args:unknown)=>(await h.runtime.service.execute(name,args,p));
  beforeEach(async()=>{h=await startHarness();owner=await h.account();sessionId=(await owner.session()).id;displayId=(await owner.display(sessionId)).id;p={userId:owner.user!.id};});
  afterEach(async()=>{await h?.close();});
  it('allows reusable asset reads through scoped bearer authorization without granting a browser login or another session',async()=>{
    const asset=(await h.runtime.service.importAsset(p,sessionId,{name:'Scoped pixels.png',mimeType:'image/png',base64:PNG}));
    const other=(await owner.session()).id;
    const allowed=(await h.runtime.auth.issueToken(p.userId,'Read this session',['read'],[sessionId]));
    const wrongSession=(await h.runtime.auth.issueToken(p.userId,'Read another session',['read'],[other]));
    const writeOnly=(await h.runtime.auth.issueToken(p.userId,'Publish only',['publish'],[sessionId]));
    const get=(value:string)=>h.browser().raw(asset.url,{headers:{Authorization:`Bearer ${value}`}});
    const ok=await get(allowed.value);expect(ok.status).toBe(200);expect(Buffer.from(await ok.arrayBuffer())).toEqual(Buffer.from(PNG,'base64'));expect(ok.headers.getSetCookie()).toEqual([]);
    expect((await get(wrongSession.value)).status).toBe(403);expect((await get(writeOnly.value)).status).toBe(403);
    expect((await h.browser().raw(asset.url)).status).toBe(401);
    (await h.runtime.auth.revokeToken(p.userId,allowed.token.id));expect((await get(allowed.value)).status).toBe(401);
  });});
});

describe("media coverage 9", () => {


const running: Harness[] = [];
afterEach(async () => { await Promise.all((await asyncMap(running.splice(0), async h => (await h.close())))); });
async function setup(fetcher?: MonitoringFetcher) {
  let time = Date.now();
  const interpret = vi.fn(async () => { throw new Error('These source operations must not invoke the source renderer.'); });
  const fetch = vi.fn(fetcher ?? (async () => ({ statusCode: 200, latencyMs: 5, mimeType: 'application/json', body: Buffer.from('{"text":"Exact source result"}'), finalUrl: 'https://example.com/status' })));
  const h = await startHarness({ interpreter: { interpret }, monitoringOptions: { automatic: false, now: () => time, fetcher: fetch } }); running.push(h);
  const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
  return { h, owner, session, display, interpret, fetch, advance: (ms: number) => { time += ms; } };
}
const jsonConfig = { mode: 'json', url: 'https://example.com/status', template: 'fact', mapping: { text: { $path: '/text' } }, intervalSeconds: 30, durationSeconds: 3600 };

describe("media contracts", () => {

  it('retains a prior successful image asset while history references it', async () => {
    const { h, owner, session, display, advance } = await setup(async () => ({ statusCode: 200, latencyMs: 3, mimeType: 'image/png', body: Buffer.from(PNG, 'base64'), finalUrl: 'https://example.com/source.png' }));
    const path = `/api/sessions/${session.id}/monitoring`;
    success(await owner.request('POST', path, { requestId: randomUUID(), displayId: display.id, expectedRevision: 0, config: { mode: 'image', url: 'https://example.com/source.png', intervalSeconds: 30, durationSeconds: 3600 } }));
    await h.runtime.service.monitoring.runDue();
    const first = (await owner.detail(session.id)).assets[0]; expect(first).toBeDefined();
    advance(31_000); await h.runtime.service.monitoring.runDue();
    expect((await owner.raw(first.url)).status).toBe(200);
    expect((await h.runtime.service.history.list((await h.runtime.service.display({ userId: owner.user!.id }, session.id, display.id)))).entries).toHaveLength(3);
  });});
});

describe("media coverage 10", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});const id=()=>randomUUID();
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><defs><linearGradient id="g"><stop offset="0" stop-color="#123456"/><stop offset="1" stop-color="#abcdef"/></linearGradient></defs><rect width="100" height="60" fill="url(#g)"/><text x="4" y="30">Team &amp; Friends</text></svg>';
it('accepts bounded passive SVG logos while rejecting active, external, namespace and resource abuse',()=>{
  const upload=(s:string)=>validateMedia({name:'logo.svg',mimeType:'image/svg+xml',base64:Buffer.from(s).toString('base64')});expect(upload(svg)).toMatchObject({kind:'image',width:100,height:60,mimeType:'image/svg+xml'});
  const payloads=['<script>alert(1)</script>','<foreignObject><p>html</p></foreignObject>','<image href="https://example.com/image.png"/>','<use href="#self" id="self"/>','<rect onclick="x()"/>','<rect style="fill:url(https://example.com/x)"/>','<animate attributeName="href" values="bad"/>','<g xmlns="http://www.w3.org/1999/xhtml"/>','<rect fill="url(&#35;missing)"/>'];
  for(const payload of payloads)expect(()=>upload(`<svg xmlns="http://www.w3.org/2000/svg">${payload}</svg>`)).toThrow();
  expect(()=>upload('<!DOCTYPE svg [<!ENTITY e SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg">&e;</svg>')).toThrow();expect(()=>upload(svg.replace('0 0 100 60','0 0 999999 99'))).toThrow();
});
});

describe("media coverage 11", () => {
    let h!: Harness;
    const id = () => randomUUID();
    afterEach(async () => { await h?.close(); });
    it('imports real Pillow RGB PNG bytes and returns actionable safe errors for invalid encodings and files', async () => {
        const bytes = readFileSync(new URL('../fixtures/feedback-plot.png', import.meta.url)), media = validateMedia({ name: 'plot.png', mimeType: 'image/png', base64: bytes.toString('base64') });
        expect(media).toMatchObject({ width: 240, height: 100 });
        h = await startHarness();
        const a = await h.account(), s = await a.session();
        const asset: any = await h.runtime.service.execute("kanvas.asset.import", { sessionId: s.id, name: 'plot.png', mimeType: 'image/png', base64: bytes.toString('base64') }, { userId: a.user!.id });
        expect(asset.mimeType).toBe('image/png');
        expect(asset.size).toBe(bytes.length);
        for (const base64 of ['data:image/png;base64,' + bytes.toString('base64'), bytes.toString('base64') + '\n', Buffer.from('not a png').toString('base64')]) {
            let error: unknown;
            try {
                validateMedia({ name: 'plot.png', mimeType: 'image/png', base64 });
            }
            catch (e) {
                error = e;
            }
            const result = safeError(error);
            expect(result.code).toMatch(/^INVALID_MEDIA/);
            expect(result.message).toMatch(/base64/);
            expect(result.message).not.toContain(bytes.toString('base64'));
        }
    });
    it('preserves generic record fields, source activity and optional story/recipe media while keeping strict contracts', () => {
        const record = { version: 1, template: 'record-detail', data: { id: 'A-1', title: 'Ticket', status: 'Review', statusColor: '#123456', description: 'Full\nthread', fields: { Exact: '1.2300' }, activity: [{ id: 'a', author: 'Kim', timestamp: 'Yesterday (source)', text: 'Exact note.' }], related: [{ id: 'b', type: 'Contract', title: 'Deal' }] } };
        expect(validateView(record).data).toEqual(record.data);
        expect(() => validateView({ ...record, data: { ...record.data, statusColor: 'red' } })).toThrow();
        for (const name of ['story-cards', 'recipe', 'itinerary', 'website'] as const)
            expect(validateView(samples[name]).template).toBe(name);
        const images = Array.from({ length: 20 }, (_, i) => ({ url: `https://example.com/${i}.png` }));
        const gallery = validateView({ version: 1, template: 'image-gallery', data: { images } });
        expect(gallery.data.images).toHaveLength(20);
        expect(() => validateView({ ...gallery, data: { ...gallery.data, images: [...images, images[0]] } })).toThrow();
    });
});
