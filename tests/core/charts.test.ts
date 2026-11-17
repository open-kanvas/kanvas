import { beforeEach } from 'vitest';
import { afterEach } from 'vitest';
import { describe } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { startHarness } from './harness';
import { success } from './harness';
import { PNG } from './harness';
import type { Harness } from './harness';
import type { Browser } from './harness';
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
import { z } from 'zod';
import { validateMedia } from '../../src/server/rendering/media';
import { signSchema } from '../../src/shared/venue';
import { navigate } from '../../src/shared/navigation';
import { initialNavigation } from '../../src/shared/navigation';
import { navigationCapabilities } from '../../src/shared/navigation';
import { navigationActionSchema } from '../../src/shared/navigation';
import { guidanceTools } from '../../src/server/agent-guidance';
import { DEFAULT_AGENT_GUIDANCE } from '../../src/server/agent-guidance';
import { safeUrl } from '../../src/client/api';
import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import type { KanvasService } from '../../src/server/domain.js';
import type { UpdateRecord } from '../../src/shared/types.js';
import { stackChart } from '../../src/shared/chart-stacks.js';
import { chartDataSchema } from '../../src/shared/chart-contract.js';
import type { Request } from 'express';
import { denied } from './harness.js';
import { menuBoardSchema } from '../../src/shared/venue.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { validationIssues } from '../../src/server/input-errors.js';
import { redactDeliveryRequest } from '../../src/server/delivery-telemetry.js';
import { deliveryIngress } from '../../src/server/delivery-telemetry.js';
import { recordDeliveryRequest } from '../../src/server/delivery-telemetry.js';
import { readingDefaults } from '../../src/shared/reading.js';
import { liveSurfaceLayout } from '../../src/shared/live-surface.js';
import { createApp } from '../../src/server/app';
import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { feedbackSubmitSchema } from '../../src/shared/reports';
import { visualHelp } from '../../src/server/visual-help';
import { HELP_TOPICS } from '../../src/shared/help';
import { randomUUID } from 'node:crypto';
import { fact } from './harness.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import type { ViewerPresence } from '../../src/shared/viewer-experience.js';

describe("charts coverage 1", () => {
    describe("charts contracts", () => {
        let h!: Harness, o: Browser, s: string, d: string, p: {
            userId: string;
        };
        beforeEach(async () => { h = await startHarness(); o = await h.account(); s = (await o.session()).id; d = (await o.display(s)).id; p = { userId: o.user!.id }; });
        afterEach(async () => { await h?.close(); });
        const call = (name: string, args: Record<string, unknown> = {}) => h.runtime.service.execute(name, args, p) as Promise<any>;
        const update = (name: string, args: Record<string, unknown>) => call(name, { sessionId: s, displayId: d, ...args });
        const publish = async (template: any, data: any) => { const result = await o.submit(s, [d], { version: 1, template, data }); expect(result.update.status).toBe('prepared'); return result.detail.displays.find(x => x.id === d)!; };
        const current = async () => (await o.detail(s)).displays.find(x => x.id === d)!;
        it('place/move occupied auto-swap, explicit swap, clear/remove preserve people, retry dedupe and stale guard', async () => {
            await publish('seat-map', { layout: 'long-table', seatsPerTable: 4, people: [{ id: 'p', name: 'Peter', tags: ['family'] }, { id: 'k', name: 'Karen' }, { id: 'r', name: 'Ryan' }] });
            await update("kanvas.seat.map.update", { action: 'place', personId: 'p', seatId: 'seat-1' });
            await update("kanvas.seat.map.update", { action: 'place', personId: 'k', seatId: 'seat-2' });
            const a = { action: 'move', personId: 'p', seatId: 'seat-2', requestId: 'move-once' };
            const result = await update("kanvas.seat.map.update", a);
            expect(await update("kanvas.seat.map.update", a)).toEqual(result);
            expect((await current()).view!.data.seats).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'seat-1', personId: 'k' }), expect.objectContaining({ id: 'seat-2', personId: 'p' })]));
            await update("kanvas.seat.map.update", { action: 'swap', personId: 'p', otherPersonId: 'r' });
            await update("kanvas.seat.map.update", { action: 'clear-seat', seatId: 'seat-1' });
            await update("kanvas.seat.map.update", { action: 'remove-seat', seatId: 'seat-2' });
            await update("kanvas.seat.map.update", { action: 'add-seat', seat: { id: 'extra', tableId: 'table-1' } });
            const display = await current();
            expect(display.view!.data.people).toHaveLength(3);
            await expect(update("kanvas.seat.map.update", { action: 'clear-seat', seatId: 'seat-1', expectedRevision: 0 })).rejects.toMatchObject({ code: 'REVISION_CONFLICT', currentRevision: display.revision });
        });
        const definition = { name: 'Team list', schema: { type: 'object', properties: { title: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } } }, required: ['title', 'items'] }, html: '<article><h1>{{title}}</h1><ul>{{#each items}}<li>{{name}}</li>{{/each}}</ul></article>', css: 'article {padding: 24px; color: white;} h1 {font-size: 48px;}' };
    });
});

describe("charts coverage 2", () => {
    describe('account media reuse and image diagnostics', () => {
        let h!: Harness, o: Browser, s: string, d: string;
        beforeEach(async () => { h = await startHarness(); o = await h.account(); s = (await o.session()).id; d = (await o.display(s)).id; });
        afterEach(async () => { await h?.close(); });
        it('explicit import copies an asset into private account storage without losing session scope', async () => {
            const asset = success(await o.request<any>('POST', `/api/sessions/${s}/assets`, { name: 'reuse.png', mimeType: 'image/png', base64: PNG }));
            const p = { userId: o.user!.id };
            const media: any = await h.runtime.service.execute("kanvas.media.import", { sessionId: s, assetId: asset.id, tags: ['reuse'] }, p);
            expect(media.id).not.toBe(asset.id);
            expect(media.url).toBe('/api/media/' + media.id);
            expect((await h.runtime.service.mediaLibrary.list(p, 'reuse'))).toHaveLength(1);
            const stranger = await h.account();
            await expect(h.runtime.service.mediaLibrary.own({ userId: stranger.user!.id }, media.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
            await expect(h.runtime.service.mediaLibrary.importAsset({ userId: stranger.user!.id }, s, asset.id)).rejects.toThrow();
            expect((await o.request('GET', asset.url)).status).toBe(200);
            expect((await o.request('GET', media.url)).status).toBe(200);
        });
    });
});

describe("charts coverage 3", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});
describe('keyboardless account receiver boundary',()=>{
 it('rejects copied codes without proof and expired requests',async()=>{h=await startHarness();const owner=await h.account(),screen=h.browser(),other=h.browser();const req=success(await screen.request<any>('POST','/api/screens/request',{}));success(await owner.request('POST','/api/screens/decide',{code:req.code,label:req.label,approve:true,confirm:true}));denied(await other.request('POST','/api/screens/claim',{code:req.code}),[401]);const record=(await h.runtime.store.list<any>('screen-enrollment')).find(x=>x.code===req.code);record.expiresAt=Date.now()-1;await h.runtime.store.put('screen-enrollment',record);denied(await screen.request('POST','/api/screens/claim',{}));});});

describe('composable charts',()=>{
 const source={kind:'bar',series:[{name:'A',points:[{x:'Mon',y:20},{x:'Tue',y:-5}]},{name:'B',points:[{x:'Mon',y:30},{x:'Tue',y:-10}]}]};
 it('normalizes percent stacks and rejects misleading negative proportions',()=>{const model=stackChart(chartDataSchema.parse({...source,stacking:'percent',series:source.series.map(s=>({...s,points:s.points.slice(0,1)}))}));expect(model.series[0][0].value).toBe(40);expect(model.series[1][0].end).toBe(100);expect(()=>chartDataSchema.parse({...source,stacking:'percent'})).toThrow();});
 it('supports combo charts and isolates stacked values on explicit independent axes',()=>{expect(chartDataSchema.parse({...source,orientation:'horizontal',series:[{...source.series[0],kind:'bar',color:'#336699'},{...source.series[1],kind:'line',axis:'secondary',dashed:true}]}).series[1].axis).toBe('secondary');const separate=stackChart(chartDataSchema.parse({...source,stacking:'stacked',series:source.series.map((s,i)=>({...s,axis:i?'secondary':'primary'}))}));expect(separate.series.map(s=>s[0].end)).toEqual([20,30]);});});
});

describe("charts coverage 4", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});
it('groups positive/negative and percent stacks independently and never adds a secondary line to bars',()=>{
 const points=(y:number)=>[{x:'A',y}],data=chartDataSchema.parse({kind:'bar',stacking:'stacked',series:[{name:'a1',stackGroup:'a',points:points(2)},{name:'a2',stackGroup:'a',points:points(3)},{name:'b1',stackGroup:'b',points:points(8)},{name:'b2',stackGroup:'b',points:points(-2)},{name:'trend',kind:'line',axis:'secondary',points:points(45)}]});
 const model=stackChart(data);expect(model.barGroups).toHaveLength(2);expect(model.series.map(s=>[s[0].start,s[0].end])).toEqual([[0,2],[2,5],[0,8],[0,-2],[0,45]]);
 const percent=stackChart(chartDataSchema.parse({...data,stacking:'percent',series:data.series.filter(s=>s.name!=='b2')}));expect(percent.series.map(s=>s[0].end)).toEqual([40,100,100,45]);
});
});

describe("charts coverage 5", () => {
    describe("charts contracts", () => {
        let h!: Harness, owner: Browser, sessionId: string, displayId: string, p: AuthPrincipal;
        const path = () => `/api/sessions/${sessionId}/displays/${displayId}`;
        const call = async (name: string, args: unknown) => (await h.runtime.service.execute(name, args, p));
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); sessionId = (await owner.session()).id; displayId = (await owner.display(sessionId)).id; p = { userId: owner.user!.id }; });
        afterEach(async () => { await h?.close(); });
        it('copies the default Ocean style and account defaults into new sessions without modifying old sessions, checks revisions and token scope', async () => {
            const before = await owner.detail(sessionId);
            expect(before.session.config).toMatchObject({ style: 'ocean', accent: '#38bdf8' });
            await call("kanvas.preferences.update", { expectedRevision: 0, config: { style: 'iris', theme: 'light', } });
            const next = await owner.session();
            expect(next.config).toMatchObject({ style: 'iris', accent: '#a78bfa', theme: 'light' });
            expect((await owner.detail(sessionId)).session.config).toEqual(before.session.config);
            await expect(call("kanvas.preferences.update", { expectedRevision: 0, config: { style: 'lime' } })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
            const scoped = (await h.runtime.auth.issueToken(p.userId, 'Selected', ['read', 'publish'], [sessionId]));
            await expect(h.runtime.service.execute("kanvas.preferences.update", { expectedRevision: 1, config: { style: 'lime' } }, { userId: p.userId, tokenId: scoped.token.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
        });
    });
});
