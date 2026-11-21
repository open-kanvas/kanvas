import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import { fact } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { validationIssues } from '../../src/server/input-errors.js';
import { z } from 'zod';
import { gameDataSchema } from '../../src/shared/game.js';
import { createApp } from '../../src/server/app.js';
import { rawEvent } from '../../src/server/raw-events.js';
import { eventContext } from '../../src/server/raw-events.js';
import { KANVAS_VERSION } from '../../src/shared/version.js';
import { feedbackSubmitSchema } from '../../src/shared/reports.js';
import { experienceTools } from '../../src/server/mcp/experience-tools.js';
import { pairedDisplayAllowsAsset } from '../../src/server/access-flows.js';
import { parseDataset } from '../../src/server/rendering/datasets.js';
import { recordHttpOperation } from '../../src/server/raw-events.js';
import { samples } from '../../src/shared/template-examples.js';
import { projectTasks } from '../../src/shared/task-list.js';
import { STREAM_BURST } from '../../src/server/monitor-streams.js';
import { STREAM_EVENT_BYTES } from '../../src/server/monitor-streams.js';
import { STREAM_MAX_EVENTS } from '../../src/server/monitor-streams.js';
import { sanitizeSvg } from '../../src/server/pickers.js';
import { iconifyBase } from '../../src/server/pickers.js';
import { readCapped } from '../../src/server/pickers.js';
import { PICKER_CACHE_BYTES } from '../../src/server/pickers.js';
import { PICKER_ICON_BYTES } from '../../src/server/pickers.js';
import { PICKER_FONT_BYTES } from '../../src/server/pickers.js';
import { precachePickers } from '../../scripts/picker-precache.js';
import { mkdtemp } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FONT_FAMILIES } from '../../src/shared/pickers.js';
import { ICON_SETS } from '../../src/shared/pickers.js';
import { iconUrl } from '../../src/shared/pickers.js';
import { iconId } from '../../src/shared/pickers.js';
import { fontUrl } from '../../src/shared/pickers.js';
import { colourTokens } from '../../src/shared/colour.js';
import { contrastGrade } from '../../src/shared/colour.js';
import { contrastRatio } from '../../src/shared/colour.js';
import { harmonies } from '../../src/shared/colour.js';
import { hexToOklch } from '../../src/shared/colour.js';
import { namedColours } from '../../src/shared/colour.js';
import { NAMED_GROUPS } from '../../src/shared/colour.js';
import { oklchToHex } from '../../src/shared/colour.js';
import { resolveColour } from '../../src/shared/colour.js';
import { roleSteps } from '../../src/shared/colour.js';
import { seedTheme } from '../../src/shared/colour.js';
import { shadeGrid } from '../../src/shared/colour.js';
import { variations } from '../../src/shared/colour.js';
import { CSS_NAMED } from '../../src/shared/colour-palettes.js';
import { OPEN_COLOR } from '../../src/shared/colour-palettes.js';
import { RADIX_DARK } from '../../src/shared/colour-palettes.js';
import { RADIX_LIGHT } from '../../src/shared/colour-palettes.js';
import { TAILWIND } from '../../src/shared/colour-palettes.js';
import { jsonPathLine } from '../../src/shared/connection-views.js';
import { prettyJson } from '../../src/shared/connection-views.js';
import { jsonDataSchema } from '../../src/shared/connection-views.js';
import { HUMAN_INVITATION } from '../../src/shared/philosophy.js';
import { safeError } from '../../src/server/mcp/results.js';
import { PNG } from './harness';
import { SEAT_LAYOUTS } from '../../src/shared/venue';
import { materializeSeats } from '../../src/shared/venue';
import { VOCABULARY } from '../../src/shared/venue';
import { venueSchemas } from '../../src/shared/venue';
import { validateStatic } from '../../src/server/custom-templates';
import { validateCustomSchema } from '../../src/server/custom-templates';
import { bindTemplate } from '../../src/shared/custom-templates';
import { DiscoveryCatalog } from '../../src/server/mcp/discovery';
import { CANONICAL_TOOLS } from '../../src/server/mcp/canonical';
import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import type { KanvasService } from '../../src/server/domain.js';
import type { UpdateRecord } from '../../src/shared/types.js';
import { stackChart } from '../../src/shared/chart-stacks.js';
import { chartDataSchema } from '../../src/shared/chart-contract.js';
import type { Request } from 'express';
import { denied } from './harness.js';
import { menuBoardSchema } from '../../src/shared/venue.js';
import { navigationCapabilities } from '../../src/shared/navigation.js';
import { navigate } from '../../src/shared/navigation.js';
import { initialNavigation } from '../../src/shared/navigation.js';
import { redactDeliveryRequest } from '../../src/server/delivery-telemetry.js';
import { deliveryIngress } from '../../src/server/delivery-telemetry.js';
import { recordDeliveryRequest } from '../../src/server/delivery-telemetry.js';
import { readingDefaults } from '../../src/shared/reading.js';
import { liveSurfaceLayout } from '../../src/shared/live-surface.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import type { ViewerPresence } from '../../src/shared/viewer-experience.js';

describe("events coverage 1", () => {


describe("events contracts",()=>{
 let h!:Harness,owner:Browser,sessionId:string,displayId:string;
 beforeEach(async()=>{h=await startHarness();owner=await h.account();sessionId=(await owner.session()).id;displayId=(await owner.display(sessionId)).id;});
 afterEach(async()=>{await h?.close();});
 it('keeps raw attributed events append-only without writing new hourly aggregates or content',async()=>{
  const marker='PRIVATE_CONTENT_NEVER_IN_EVENTS';await owner.submit(sessionId,[displayId],fact(marker));
  await eventContext.run({userId:owner.user!.id,client:{timeZone:'Europe/Oslo'}},()=>rawEvent(h.runtime.store,'test.event',{sessionId,properties:{status:'ok'}}));
  const rows=(await h.runtime.store.query('SELECT * FROM events')).rows;
  expect(rows.some(r=>r.event_type==='test.event'&&r.user_id===owner.user!.id&&r.client_context.timeZone==='Europe/Oslo')).toBe(true);
  expect(JSON.stringify(rows)).not.toContain(marker);
  expect((await h.runtime.store.query('SELECT count(*)::int AS n FROM request_metrics')).rows[0].n).toBe(0);
  await expect(h.runtime.store.query("UPDATE events SET status='changed'")).rejects.toThrow('append-only');
  await expect(h.runtime.store.query('DELETE FROM events')).rejects.toThrow('append-only');
  const user=(await h.runtime.store.query('SELECT created_at,last_login_at,last_seen_at FROM users WHERE id=$1',[owner.user!.id])).rows[0];expect(user.created_at).toBeTruthy();expect(user.last_login_at).toBeTruthy();expect(user.last_seen_at).toBeTruthy();
 });});
});

describe("events coverage 2", () => {
    const toastSchema = experienceTools.find(t => t.name === "kanvas.toast")!.schema;
    describe("events contracts", () => {
        let h!: Harness, owner: Browser, s: string, d: string;
        const p = () => ({ userId: owner.user!.id });
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); s = (await owner.session()).id; d = (await owner.display(s)).id; await vi.waitFor(async () => expect((await h.runtime.store.query("SELECT count(*)::int n FROM events WHERE event_type='browser.operation' AND operation='kanvas.display.register'")).rows[0].n).toBe(1)); });
        afterEach(async () => { await h?.close(); });
        it('suppresses housekeeping only, retains failures/actions and preserves historical rows', async () => {
            const store = h.runtime.store;
            await rawEvent(store, 'historical.fixture', { sessionId: s, properties: { sentinel: 'preserved' } });
            const before = await store.query('SELECT * FROM events ORDER BY occurred_at,event_id');
            for (let i = 0; i < 50; i++) {
                await store.put('navigation-viewport', { id: 'v', sessionId: s, width: 390 });
                await store.put('registered-window', { id: 'w', sessionId: s });
                await store.put('connection-history', { id: 'c', sessionId: s });
                await h.runtime.service.accounts.recordRequest('api', 200, 1, 'fixture');
            }
            expect((await store.query('SELECT count(*)::int n FROM events')).rows[0].n).toBe(before.rows.length);
            await h.runtime.service.accounts.recordRequest('api', 500, 2, 'fixture-failure');
            await rawEvent(store, 'tool.call', { sessionId: s, operation: 'fixture.operation', status: 'success' });
            const after = await store.query('SELECT * FROM events ORDER BY occurred_at,event_id');
            expect(after.rows.slice(0, before.rows.length)).toEqual(before.rows);
            expect(after.rows).toHaveLength(before.rows.length + 2);
            expect(after.rows.at(-1)?.properties.serverVersion).toBe(KANVAS_VERSION);
        });
        it('retains an authenticated browser upload operation without copying uploaded bytes or filename', async () => {
            const result = await owner.request('POST', `/api/sessions/${s}/assets`, { name: 'private-upload-name-7721.png', mimeType: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=' });
            expect(result.status).toBe(201);
            await vi.waitFor(async () => { const rows = (await h.runtime.store.query("SELECT * FROM events WHERE event_type='browser.operation' AND operation='POST /api/sessions/:id/assets'")).rows; expect(rows).toHaveLength(1); expect(rows[0].user_id).toBe(owner.user!.id); expect(JSON.stringify(rows)).not.toContain('private-upload-name-7721'); expect(JSON.stringify(rows)).not.toContain('iVBORw0KGgo'); });
        });
        it('omits credential renewal snapshots while retaining creation and explicit authentication changes', async () => {
            const store = h.runtime.store, browser = await h.runtime.auth.issueBrowser(owner.user!.id, { cookie: () => { } } as any);
            const count = async () => Number((await store.query("SELECT count(*) n FROM events WHERE event_type='document.browser'")).rows[0].n), before = await count();
            const current = await store.get<any>('browser', browser.id);
            current.lastActiveAt = new Date().toISOString();
            current.renewedAt = Date.now() + 1;
            current.expiresAt += 1000;
            current.idleExpiresAt = current.expiresAt;
            await store.put('browser', current);
            expect(await count()).toBe(before);
            current.authenticatedAt += 1000;
            await store.put('browser', current);
            expect(await count()).toBe(before + 1);
        });
    });
    describe('event privacy and idle-volume boundaries', () => {
        let h!: Harness;
        afterEach(async () => { await h?.close(); });
        it('keeps connect/disconnect, but sixty simulated heartbeat touches write no event rows', async () => {
            h = await startHarness();
            const owner = await h.account(), s = (await owner.session()).id, d = (await owner.display(s)).id;
            const browser = await h.runtime.auth.issueBrowser(owner.user!.id, { cookie: () => { } } as any);
            const connection = await h.runtime.service.experience.receiving.connect({ userId: owner.user!.id, browserId: browser.id }, s, d, 'idle-tab', 'Synthetic Browser');
            const count = Number((await h.runtime.store.query('SELECT count(*) n FROM events')).rows[0].n);
            for (let i = 0; i < 60; i++)
                connection.touch();
            expect(Number((await h.runtime.store.query('SELECT count(*) n FROM events')).rows[0].n)).toBe(count);
            expect((await h.runtime.store.query("SELECT event_type FROM events WHERE event_type='connection.connect'")).rows).toHaveLength(1);
            connection.disconnect();
        });
        it('meaningful HTTP event context excludes test credentials, body, query and raw IP', async () => {
            h = await startHarness();
            const owner = await h.account();
            const secrets = ['private-query-7721', 'private-body-7721', 'private-header-7721', '203.0.113.77'];
            success(await owner.request('POST', '/api/sessions?private=' + secrets[0], { name: secrets[1] }, { headers: { 'X-API-Key': secrets[2], 'X-Forwarded-For': secrets[3] } }));
            const rows = (await h.runtime.store.query('SELECT * FROM events')).rows;
            expect(rows.some(r => r.event_type === 'document.session')).toBe(true);
            const serialized = JSON.stringify(rows);
            for (const secret of secrets)
                expect(serialized).not.toContain(secret);
            for (const cookie of owner.cookies.values())
                expect(serialized).not.toContain(cookie);
        });
    });
});

describe("events coverage 3", () => {


describe('06ee64d1 JSON raw view and tool call details; other new templates',()=>{
 it('tool call details holds request and response, an error, a highlighted field and stored long content',()=>{
  const data=validateView(samples['tool-call-details']).data;expect(data).toMatchObject({view:'raw',status:'success',expanded:false});
  const failed=validateView({template:'tool-call-details',data:{tool:'kanvas.planner.edit',status:'error',request:'{"items":[{"start":"09:00"}]}',responseText:'Invalid arguments',error:{code:'INVALID_ARGUMENT',message:'items[0].start: Expected ISO 8601 date-time.'},highlight:{pane:'request',path:'$.items[0].start',note:'this argument was wrong'},view:'tree'}} as never).data;
  expect(failed.error).toMatchObject({code:'INVALID_ARGUMENT'});
  const long='{"rows":['+Array.from({length:3000},(_,i)=>i).join(',')+']}';expect((validateView({template:'tool-call-details',data:{tool:'t',request:'{}',response:long}} as never).data.response as string).length).toBe(long.length);
  for(const bad of [{tool:'t',request:'not json'},{tool:'t',request:'{}',response:'{}',responseText:'both'},{tool:'t',request:'{}',highlight:{pane:'request',path:'items[0]'}},{tool:'t',request:'{}',status:'weird'}])expect(()=>validateView({template:'tool-call-details',data:bad} as never),JSON.stringify(bad)).toThrow();
 });});
});

describe("events coverage 4", () => {

describe("events contracts",()=>{
 let h!:Harness,o:Browser,s:string,d:string,p:{userId:string};
 beforeEach(async()=>{h=await startHarness();o=await h.account();s=(await o.session()).id;d=(await o.display(s)).id;p={userId:o.user!.id};});
 afterEach(async()=>{await h?.close();});
 const call=(name:string,args:Record<string,unknown>={})=>h.runtime.service.execute(name,args,p) as Promise<any>;
 const update=(name:string,args:Record<string,unknown>)=>call(name,{sessionId:s,displayId:d,...args});
 const publish=async(template:any,data:any)=>{const result=await o.submit(s,[d],{version:1,template,data});expect(result.update.status).toBe('prepared');return result.detail.displays.find(x=>x.id===d)!;};
 const current=async()=> (await o.detail(s)).displays.find(x=>x.id===d)!;
 const definition={name:'Team list',schema:{type:'object',properties:{title:{type:'string'},items:{type:'array',items:{type:'object',properties:{name:{type:'string'}},required:['name']}}},required:['title','items']},html:'<article><h1>{{title}}</h1><ul>{{#each items}}<li>{{name}}</li>{{/each}}</ul></article>',css:'article {padding: 24px; color: white;} h1 {font-size: 48px;}'};
 it('rejects scripts, event handlers, URL/CSS exfiltration, parser tricks and invalid schemas',()=>{
  for(const html of ['<script>alert(1)</script>','<p onclick="x">x</p>','<svg onload="x"/>','<a href="javascript:alert(1)">x</a>','<iframe/>','<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><p>&e;</p>','<style>body{}</style>','<p style="background:url(https://evil.example)">x</p>'])expect(()=>validateStatic(html,'')).toThrow();
  for(const css of ['@import "https://evil.example";','p{background:url(https://evil.example)}','p{background:u\\72l(x)}','</style><script>x</script>','p{behavior:x}','p{background:image-set("https://evil.example/a" 1x)}','p{background:src("https://evil.example/a")}'])expect(()=>validateStatic('<p>OK</p>',css)).toThrow();
  expect(()=>validateCustomSchema({type:'object',properties:{x:{$ref:'https://evil.example'}}})).toThrow();
  expect(bindTemplate('<p>{{name}}</p>',{name:'" <script>'})).toBe('<p>&quot; &lt;script&gt;</p>');
  expect(()=>bindTemplate('{{#each items}}x', {items:[]})).toThrow();
 });});
});

describe("events coverage 5", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});
describe("events contracts",()=>{
 it('retains raw payload while excluding credentials and signed URL secrets',()=>{expect(redactDeliveryRequest({view:{data:{text:'Customer source text'}},authorization:'Bearer private',nested:{refresh_token:'private'},url:'https://example.test/image?signature=private&size=3'})).toEqual({view:{data:{text:'Customer source text'}},authorization:'[credential redacted]',nested:{refresh_token:'[credential redacted]'},url:'https://example.test/image?signature=[redacted]&size=3'});});});
});

describe("events coverage 6", () => {
    describe("events contracts", () => {
        let h!: Harness, owner: Browser, sessionId: string, displayId: string, p: AuthPrincipal;
        const path = () => `/api/sessions/${sessionId}/displays/${displayId}`;
        const call = async (name: string, args: unknown) => (await h.runtime.service.execute(name, args, p));
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); sessionId = (await owner.session()).id; displayId = (await owner.display(sessionId)).id; p = { userId: owner.user!.id }; });
        afterEach(async () => { await h?.close(); });
        it('logs receipt, preparation, push and actual acknowledgement with pagination and scoped access', async () => {
            const requestId = randomUUID();
            await owner.submit(sessionId, [displayId], fact('Logged source'), requestId);
            let log = await call("kanvas.session.log", { sessionId, requestId }) as {
                entries: {
                    stage: string;
                }[];
            };
            expect(log.entries.map(x => x.stage)).toEqual(expect.arrayContaining(['submission.received', 'render.started', 'render.prepared', 'view.pushed']));
            expect(log.entries.some(x => x.stage === 'viewer.acknowledged')).toBe(false);
            success(await owner.request('POST', `${path()}/applied`, { revision: 1 }));
            log = await call("kanvas.session.log", { sessionId }) as typeof log;
            expect(log.entries.some(x => x.stage === 'viewer.acknowledged')).toBe(true);
            const first = await call("kanvas.session.log", { sessionId, limit: 2 }) as {
                entries: {
                    id: string;
                }[];
                nextCursor: string;
            };
            const next = await call("kanvas.session.log", { sessionId, afterId: first.nextCursor, limit: 2 }) as typeof first;
            expect(next.entries.some(x => x.id === first.entries[0].id)).toBe(false);
            const stranger = await h.account();
            await expect(h.runtime.service.execute("kanvas.session.log", { sessionId }, { userId: stranger.user!.id })).rejects.toBeTruthy();
        });
    });
});
