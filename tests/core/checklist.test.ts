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
import { KANVAS_VERSION } from '../../src/shared/version.js';
import { feedbackSubmitSchema } from '../../src/shared/reports.js';
import { experienceTools } from '../../src/server/mcp/experience-tools.js';
import { pairedDisplayAllowsAsset } from '../../src/server/access-flows.js';
import { parseDataset } from '../../src/server/rendering/datasets.js';
import { rawEvent } from '../../src/server/raw-events.js';
import { recordHttpOperation } from '../../src/server/raw-events.js';
import { denied } from './harness.js';
import { applyChecklistChanges } from '../../src/server/checklists.js';
import { checklistTools } from '../../src/server/checklists.js';
import { CHECKLIST_RETAINED_REVISIONS } from '../../src/server/checklists.js';
import { safeError } from '../../src/server/mcp/results.js';
import { toastBuiltInIcon } from '../../src/shared/viewer-experience.js';
import { TOAST_TYPES } from '../../src/shared/viewer-experience.js';
import type { ToastRecord } from '../../src/shared/viewer-experience.js';
import type { ViewerPresence } from '../../src/shared/viewer-experience.js';
import { PRESENCE_GRACE_MS } from '../../src/server/receiving-presence.js';
import { PRESENCE_LEAVE_MS } from '../../src/server/receiving-presence.js';
import { runPrivacyCycle } from '../../src/client/device-privacy-check.js';
import { privacyBackoffMs } from '../../src/client/device-privacy-check.js';
import { PRIVACY_DEADLINE_MS } from '../../src/client/device-privacy-check.js';
import { normalizeLoginCode } from '../../src/server/device-login.js';
import { loginRead } from '../../src/server/device-login.js';
import { loginDecide } from '../../src/server/device-login.js';
import { validationIssues } from '../../src/server/input-errors.js';
import { z } from 'zod';
import type { NavigationSnapshot } from '../../src/shared/navigation.js';
import type { Response } from 'express';
import { Checklists } from '../../src/server/checklists.js';
import { resolveToolCall } from '../../src/server/mcp/catalog.js';

describe("checklist coverage 1", () => {
    const toastSchema = experienceTools.find(t => t.name === "kanvas.toast")!.schema;
    describe("checklist contracts", () => {
        let h!: Harness, owner: Browser, s: string, d: string;
        const p = () => ({ userId: owner.user!.id });
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); s = (await owner.session()).id; d = (await owner.display(s)).id; await vi.waitFor(async () => expect((await h.runtime.store.query("SELECT count(*)::int n FROM events WHERE event_type='browser.operation' AND operation='kanvas_display_register'")).rows[0].n).toBe(1)); });
        afterEach(async () => { await h?.close(); });
        it('refreshes all matching checklist displays, not replacement content, without history growth', async () => {
            await owner.submit(s, [d], { version: 1, template: 'checklist', data: { items: [{ id: 'one', text: 'One', checked: false }] } });
            const view = (await owner.detail(s)).displays.find(x => x.id === d)!.view!, checklistId = String(view.data.checklistId), d2 = (await owner.display(s)).id, d3 = (await owner.display(s)).id;
            await h.runtime.service.checklists.show(p(), { sessionId: s, displayId: d2, checklistId, requestId: 'show2' });
            await h.runtime.service.checklists.show(p(), { sessionId: s, displayId: d3, checklistId, requestId: 'show3' });
            await owner.submit(s, [d3], fact('Newer content wins'));
            const before = await h.runtime.store.list('display-history', s);
            for (let i = 0; i < 8; i++)
                await h.runtime.service.checklists.update(p(), { sessionId: s, checklistId, requestId: 'update' + i, items: [{ id: 'one', text: 'One', checked: i % 2 === 1 }] });
            for (const target of [d, d2])
                expect((await h.runtime.service.display(p(), s, target)).view?.data.items).toEqual([{ id: 'one', text: 'One', checked: true }]);
            expect((await h.runtime.service.display(p(), s, d3)).view?.data.text).toBe('Newer content wins');
            expect(await h.runtime.store.list('display-history', s)).toEqual(before);
        });
    });
});

describe("checklist coverage 2", () => {
    describe('checklists: by-ID updates, explicit removal, history, highlight', () => {
        let h!: Harness, o: Browser, s: string, d: string, p: {
            userId: string;
        }, checklistId: string;
        const items = Array.from({ length: 19 }, (_, i) => ({ id: `t${i + 1}`, text: `Acceptance item ${i + 1}`, checked: false, detail: `Note for item ${i + 1}` }));
        beforeEach(async () => {
            h = await startHarness();
            o = await h.account();
            s = (await o.session()).id;
            d = (await o.display(s)).id;
            p = { userId: o.user!.id };
            const published = await o.submit(s, [d], { version: 1, template: 'checklist', title: 'Release', data: { items } } as never);
            checklistId = String(published.detail.displays[0].view!.data.checklistId);
        });
        afterEach(async () => { await h?.close(); });
        const call = (name: string, args: Record<string, unknown> = {}) => h.runtime.service.execute(name, args, p) as Promise<any>;
        const update = (args: Record<string, unknown>) => call("kanvas.checklist.update", { sessionId: s, checklistId, requestId: randomUUID(), ...args });
        const saved = async () => (await call("kanvas.checklist.read", { sessionId: s, checklistId })).view.data.items as typeof items;
        it('2a3bdc12/a416fadc: two partial items change two items and nothing else (the incident)', async () => {
            const result = await update({ expectedRevision: 0, items: [{ id: 't4', checked: true }, { id: 't9', detail: 'Corrected note' }] });
            expect(result).toMatchObject({ revision: 1, previousRevision: 0, itemCount: 19, checkedCount: 1, changes: { added: [], changed: ['t4', 't9'], removed: [], moved: [] }, counts: { added: 0, changed: 2, removed: 0, untouched: 17 } });
            const after = await saved();
            expect(after).toHaveLength(19);
            expect(after.find(x => x.id === 't4')).toEqual({ ...items[3], checked: true });
            expect(after.find(x => x.id === 't9')).toEqual({ ...items[8], detail: 'Corrected note' });
            expect(after.filter(x => !['t4', 't9'].includes(x.id))).toEqual(items.filter(x => !['t4', 't9'].includes(x.id)));
        });
        it('adds at a position, clears a note with null, removes only through removeIds and reports unknown ids', async () => {
            const result = await update({ items: [{ id: 'new', text: 'Inserted', index: 0 }, { id: 't2', detail: null }], removeIds: ['t19', 'ghost'] });
            expect(result.changes).toEqual({ added: ['new'], changed: ['t2'], removed: ['t19'], moved: [] });
            expect(result.notFound).toEqual(['ghost']);
            const after = await saved();
            expect(after[0]).toMatchObject({ id: 'new', text: 'Inserted', checked: false });
            expect(after.find(x => x.id === 't2')).not.toHaveProperty('detail');
            expect(after.some(x => x.id === 't19')).toBe(false);
            expect(after).toHaveLength(19);
            let missing: unknown;
            try {
                await update({ items: [{ id: 'unknown-item', checked: true }] });
            }
            catch (e) {
                missing = e;
            }
            expect(safeError(missing)).toMatchObject({ code: 'INVALID_ARGUMENT', issues: [expect.objectContaining({ path: 'items[0].text', expected: 'string', received: 'missing' })] });
            expect(await saved()).toHaveLength(19);
        });
        it('replace is explicit and refuses to delete saved items without allowRemove, naming them', async () => {
            let refused: unknown;
            try {
                await update({ mode: 'replace', items: [{ id: 't1', text: 'Only one', checked: true }, { id: 't2', text: 'And two' }] });
            }
            catch (e) {
                refused = e;
            }
            const error = safeError(refused);
            expect(error.code).toBe('INVALID_ARGUMENT');
            expect(error.wouldRemoveIds).toHaveLength(17);
            expect(error.wouldRemoveIds).toContain('t19');
            expect(error.message).toMatch(/would delete 17 saved items/);
            expect(await saved()).toEqual(items);
            const done = await update({ mode: 'replace', allowRemove: true, items: [{ id: 't1', text: 'Only one', checked: true }, { id: 't2', text: 'And two' }] });
            expect(done.counts).toMatchObject({ removed: 17, changed: 2 });
            expect(await saved()).toHaveLength(2);
            let partial: unknown;
            try {
                await update({ mode: 'replace', allowRemove: true, items: [{ id: 't1', checked: false }] });
            }
            catch (e) {
                partial = e;
            }
            expect(safeError(partial).issues?.[0].path).toBe('items[0].text');
        });
        it('keeps earlier revisions readable and restores one as a one-step undo', async () => {
            await update({ items: [{ id: 't1', checked: true }] });
            const wiped = await update({ mode: 'replace', allowRemove: true, items: [{ id: 't1', text: 'Only this', checked: true }] });
            expect(wiped.revision).toBe(2);
            const current = await call("kanvas.checklist.read", { sessionId: s, checklistId });
            expect(current.retainedRevisions.map((x: {
                revision: number;
            }) => x.revision)).toEqual([0, 1]);
            const earlier = await call("kanvas.checklist.read", { sessionId: s, checklistId, revision: 1 });
            expect(earlier).toMatchObject({ revision: 1, retained: true, currentRevision: 2 });
            expect(earlier.view.data.items).toHaveLength(19);
            const restored = await update({ restoreRevision: 1, expectedRevision: 2 });
            expect(restored).toMatchObject({ revision: 3, itemCount: 19, checkedCount: 1 });
            expect(restored.counts.added).toBe(18);
            expect((await saved()).find(x => x.id === 't7')).toEqual(items[6]);
            let gone: unknown;
            try {
                await call("kanvas.checklist.read", { sessionId: s, checklistId, revision: 77 });
            }
            catch (e) {
                gone = e;
            }
            expect(safeError(gone).code).toBe('NOT_FOUND');
            for (let i = 0; i < CHECKLIST_RETAINED_REVISIONS + 4; i++)
                await update({ items: [{ id: 't3', detail: `edit ${i}` }] });
            expect((await call("kanvas.checklist.read", { sessionId: s, checklistId })).retainedRevisions).toHaveLength(CHECKLIST_RETAINED_REVISIONS);
        });
        it('two writers changing different items do not overwrite each other; requestId retries are exact', async () => {
            const first = { sessionId: s, checklistId, requestId: 'tick-one', items: [{ id: 't5', checked: true }] };
            const [a, b] = await Promise.all([call("kanvas.checklist.update", first), update({ items: [{ id: 't6', detail: 'Second writer' }] })]);
            expect(new Set([a.revision, b.revision])).toEqual(new Set([1, 2]));
            const after = await saved();
            expect(after.find(x => x.id === 't5')!.checked).toBe(true);
            expect(after.find(x => x.id === 't6')!.detail).toBe('Second writer');
            expect((await call("kanvas.checklist.update", first)).revision).toBe(a.revision);
            let conflict: unknown;
            try {
                await call("kanvas.checklist.update", { ...first, items: [{ id: 't5', checked: false }] });
            }
            catch (e) {
                conflict = e;
            }
            expect(safeError(conflict).code).toBe('REQUEST_ID_CONFLICT');
            let stale: unknown;
            try {
                await update({ expectedRevision: 0, items: [{ id: 't1', checked: true }] });
            }
            catch (e) {
                stale = e;
            }
            expect(safeError(stale)).toMatchObject({ code: 'REVISION_CONFLICT', currentRevision: 2 });
        });
        it('d0e13f12: an in-place update keeps the navigation root, and an unchanged call changes nothing', async () => {
            const before = (await o.detail(s)).displays[0];
            await update({ items: [{ id: 't17', checked: true }] });
            const after = (await o.detail(s)).displays[0];
            expect(after.revision).toBe(before.revision + 1);
            expect(after.navigationRoot ?? after.revision).toBe(before.navigationRoot ?? before.revision);
            const again = await update({ items: [{ id: 't17', checked: true }] });
            expect(again).toMatchObject({ unchanged: true, revision: 1 });
            expect((await o.detail(s)).displays[0].revision).toBe(after.revision);
        });
        it('a38d9e45: one item can be highlighted by id, in a view and through update; bad ids are explained', async () => {
            expect(validateView({ template: 'checklist', data: { highlight: 'b', items: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] } }).data.highlight).toBe('b');
            expect(() => validateView({ template: 'checklist', data: { highlight: 'zzz', items: [{ id: 'a', text: 'A' }] } })).toThrow();
            const marked = await update({ highlightId: 't12' });
            expect(marked).toMatchObject({ highlightId: 't12', revision: 1, counts: { changed: 0 } });
            expect((await o.detail(s)).displays[0].view!.data.highlight).toBe('t12');
            expect(await saved()).toEqual(items);
            await update({ removeIds: ['t12'] });
            expect((await call("kanvas.checklist.read", { sessionId: s, checklistId })).view.data.highlight).toBeUndefined();
            await update({ highlightId: 't3' });
            const cleared = await update({ highlightId: null });
            expect(cleared.highlightId).toBeUndefined();
            let bad: unknown;
            try {
                await update({ highlightId: 'nope' });
            }
            catch (e) {
                bad = e;
            }
            expect(safeError(bad).issues?.[0]).toMatchObject({ path: 'highlightId' });
        });
        it('the description and schema state the by-ID contract; pure merge never deletes by omission', () => {
            const tool = checklistTools.find(t => t.name === "kanvas.checklist.update")!;
            expect(tool.description).toMatch(/BY ID/);
            expect(tool.description).toMatch(/items you do not name stay exactly as they are/);
            expect(tool.description).toContain('items:[{id,checked:true}]');
            const merged = applyChecklistChanges(items, [{ id: 't1', checked: true }]);
            expect(merged.items).toHaveLength(19);
            expect(merged.changes.removed).toEqual([]);
            expect(() => applyChecklistChanges(items, [{ id: 't1', checked: true }], ['t1'])).toThrow();
        });
    });
});

describe("checklist coverage 3", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});
it('reports exact misplaced envelope fields and allowed checklist keys without values',()=>{const view={version:1,template:'checklist',data:{title:'private title',items:[{id:'a',text:'b'}]}};try{validateView(view);throw Error('expected failure');}catch(e){expect(e).toBeInstanceOf(z.ZodError);const issues=validationIssues(e as z.ZodError,'view',view);expect(issues).toContainEqual(expect.objectContaining({path:'view.data.title',received:'string',allowedFields:expect.arrayContaining(['items','checklistId','checklistRevision']),hint:expect.stringContaining('beside template/data')}));expect(JSON.stringify(issues)).not.toContain('private title');}});
it('keeps checklist zoom in its browser window through updates/show without leaking to other windows',async()=>{
 h=await startHarness();const a=await h.account(),session=await a.session('Zoom'),d=await a.display(session.id),s=h.runtime.service,p={userId:a.user!.id};await a.submit(session.id,[d.id],{version:1,template:'checklist',data:{items:[{id:'a',text:'Original'}]}});const current=await s.display(p,session.id,d.id),checklistId=current.view!.data.checklistId as string;
 const path=`/api/sessions/${session.id}/displays/${d.id}/navigation`;
 const scale=async(tabId:string)=>success(await a.request<NavigationSnapshot>('GET',`${path}?tabId=${tabId}`)).state.scale;
 success(await a.request('POST',path,{tabId:'checklist-window',requestId:'zoom-checklist',expectedRevision:current.revision,navigation:{action:'zoom',scale:.6}}));
 expect(await scale('other-window')).toBe(1);
 await s.checklists.update(p,{sessionId:session.id,checklistId,requestId:'check',items:[{id:'a',text:'Original',checked:true}]});await s.checklists.show(p,{sessionId:session.id,displayId:d.id,checklistId,requestId:'reshow'});expect(await scale('checklist-window')).toBe(.6);
 await a.submit(session.id,[d.id],{version:1,template:'fact',data:{text:'Different view'}});expect(await scale('checklist-window')).toBe(.6);await s.checklists.show(p,{sessionId:session.id,displayId:d.id,checklistId,requestId:'back'});expect(await scale('checklist-window')).toBe(.6);
 expect(await scale('new-window')).toBe(1);expect((await s.navigation.read(p,{sessionId:session.id,displayId:d.id})).state.scale).toBe(1);
 const otherSession=await a.session('Other session'),otherDisplay=await a.display(otherSession.id);await a.submit(otherSession.id,[otherDisplay.id],{version:1,template:'fact',data:{text:'Other session'}});
 const otherPath=`/api/sessions/${otherSession.id}/displays/${otherDisplay.id}/navigation`;
 expect(success(await a.request<NavigationSnapshot>('GET',`${otherPath}?tabId=checklist-window`)).state.scale).toBe(.6);
 expect(success(await a.request<NavigationSnapshot>('GET',`${otherPath}?tabId=other-window`)).state.scale).toBe(1);
 const latest=await s.display(p,session.id,d.id);success(await a.request('POST',path,{tabId:'checklist-window',requestId:'reset',expectedRevision:latest.revision,navigation:{action:'zoom',direction:'reset'}}));
 await s.checklists.show(p,{sessionId:session.id,displayId:d.id,checklistId,requestId:'reset-show'});expect(await scale('checklist-window')).toBe(1);expect(await scale('other-window')).toBe(1);
});
});

describe("checklist coverage 4", () => {
    let h!: Harness;
    afterEach(async () => { await h?.close(); });
    async function principal(a: Browser) { const session = await h.runtime.auth.issueBrowser(a.user!.id, { cookie: () => { } } as unknown as Response); return { userId: a.user!.id, browserId: session.id }; }
    const view = { version: 1 as const, template: 'checklist' as const, title: 'Release tasks', data: { items: [{ id: 'a', text: 'Review', checked: false }, { id: 'b', text: 'Test', checked: false }] } };
    describe("checklist contracts", () => {
        it('discovers account details and checklist operations through the public dispatcher', () => {
            for (const [operationId, args] of [
                ['kanvas.account.details', {}],
                ['kanvas.checklist.read', {sessionId:'s'}],
                ['kanvas.checklist.update', {sessionId:'s',checklistId:'c',expectedRevision:0,requestId:'r',items:[]}],
                ['kanvas.checklist.show', {sessionId:'s',checklistId:'c',displayId:'d',expectedRevision:0,requestId:'r'}],
            ] as const) expect(resolveToolCall('discovery','kanvas_call',{operationId,arguments:args}).error).toBeUndefined();
        });
        it('saved checklist survives display replacement, fresh module instance and show on another screen', async () => {
            h = await startHarness();
            const a = await h.account(), p = await principal(a), s = await a.session(), d = await a.display(s.id), second = await a.display(s.id);
            await a.submit(s.id, [d.id], view);
            let current = await h.runtime.service.display(p, s.id, d.id);
            const key = String(current.view!.data.checklistId);
            expect(key).toBeTruthy();
            await h.runtime.service.edit(p, s.id, d.id, current.revision, { ...current.view!.data, items: [{ id: 'a', text: 'Review', checked: true }, { id: 'b', text: 'Test', checked: false }] });
            await a.submit(s.id, [d.id], fact('Unrelated map/topic'));
            const reader = new Checklists(h.runtime.service), saved: any = await reader.read(p, { sessionId: s.id, checklistId: key });
            expect(saved.revision).toBe(1);
            expect(saved.view.data.items[0].checked).toBe(true);
            const args = { sessionId: s.id, checklistId: key, displayId: second.id, expectedRevision: 0, requestId: 'bring-back' };
            const shown: any = await reader.show(p, args);
            expect((await h.runtime.service.display(p, s.id, second.id)).view!.data).toMatchObject({ checklistId: key, checklistRevision: 1 });
            expect((await reader.show(p, args)).id).toBe(shown.id);
            expect((await h.runtime.service.display(p, s.id, d.id)).view!.template).toBe('fact');
        });
        it('checklist IDs grant no cross-account/session access and held screens stay intact', async () => {
            h = await startHarness();
            const a = await h.account(), p = await principal(a), q = await principal(await h.account()), s = await a.session(), d = await a.display(s.id);
            await a.submit(s.id, [d.id], view);
            const current = await h.runtime.service.display(p, s.id, d.id), key = String(current.view!.data.checklistId);
            await expect(h.runtime.service.checklists.read(q, { sessionId: s.id, checklistId: key })).rejects.toBeDefined();
            const another = await a.session();
            await expect(h.runtime.service.checklists.read(p, { sessionId: another.id, checklistId: key })).rejects.toMatchObject({ code: 'NOT_FOUND' });
            await h.runtime.service.updateDisplay(p, s.id, d.id, { held: true, expectedRevision: current.revision });
            const held = await h.runtime.service.display(p, s.id, d.id);
            await expect(h.runtime.service.checklists.show(p, { sessionId: s.id, checklistId: key, displayId: d.id, expectedRevision: held.revision, requestId: 'held' })).rejects.toMatchObject({ code: 'DISPLAY_HELD' });
        });
        it('one multi-display publish shares one checklist and reads large documents in bounded pages', async () => {
            h = await startHarness();
            const a = await h.account(), p = await principal(a), s = await a.session(), d = await a.display(s.id), e = await a.display(s.id);
            await a.submit(s.id, [d.id, e.id], view);
            const first = await h.runtime.service.display(p, s.id, d.id), second = await h.runtime.service.display(p, s.id, e.id);
            expect(first.view!.data.checklistId).toBe(second.view!.data.checklistId);
            const key = String(first.view!.data.checklistId), items = Array.from({ length: 70 }, (_, i) => ({ id: `item${i}`, text: 'x'.repeat(900), checked: i % 2 === 0 }));
            await h.runtime.service.checklists.update(p, { sessionId: s.id, checklistId: key, expectedRevision: 0, requestId: 'large', mode: 'replace', allowRemove: true, items });
            const page: any = await h.runtime.service.checklists.read(p, { sessionId: s.id, checklistId: key });
            expect(page.view).toBeUndefined();
            expect(page.nextOffset).toBeGreaterThan(0);
            expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(44000);
            const rest: any = await h.runtime.service.checklists.read(p, { sessionId: s.id, checklistId: key, offset: page.nextOffset });
            expect([...page.items, ...rest.items]).toEqual(items);
            const http: any = success(await a.request('GET', `/api/sessions/${s.id}/checklists/${key}?offset=${page.nextOffset}`));
            expect(http.items).toEqual(rest.items);
        });
        it('retained pre-upgrade checklist can be read and promoted without agent reconstruction', async () => {
            h = await startHarness();
            const a = await h.account(), p = await principal(a), s = await a.session(), d = await a.display(s.id);
            await h.runtime.store.put('display-history', { id: 'legacy-frame', sessionId: s.id, displayId: d.id, revision: 1, view: { ...view, data: { items: [{ id: 'a', text: 'Already done', checked: true }] } }, createdAt: new Date().toISOString(), reason: 'prepared' });
            const listed: any = await h.runtime.service.checklists.read(p, { sessionId: s.id });
            expect(listed.checklists[0].id).toBe('legacy_legacy-frame');
            await h.runtime.service.checklists.show(p, { sessionId: s.id, checklistId: listed.checklists[0].id, displayId: d.id, expectedRevision: 0, requestId: 'restore-legacy' });
            const current = await h.runtime.service.display(p, s.id, d.id);
            expect(current.view!.data.checklistId).toBeTruthy();
            expect((current.view!.data.items as any[])[0].checked).toBe(true);
        });
        it('historical and pinned snapshots fork without overwriting newer saved checklist state', async () => {
            h = await startHarness();
            const a = await h.account(), p = await principal(a), s = await a.session(), d = await a.display(s.id);
            await a.submit(s.id, [d.id], view);
            let current = await h.runtime.service.display(p, s.id, d.id);
            const key = String(current.view!.data.checklistId), oldRevision = current.revision;
            const pin: any = await h.runtime.service.execute("kanvas.pin.save", { sessionId: s.id, displayId: d.id, requestId: 'pin', label: 'Original checklist' }, p);
            await h.runtime.service.edit(p, s.id, d.id, current.revision, { ...current.view!.data, items: [{ id: 'a', text: 'Review', checked: true }] });
            current = await h.runtime.service.display(p, s.id, d.id);
            await h.runtime.service.navigate(p, { sessionId: s.id, displayIds: [d.id], expectedRevisions: { [d.id]: current.revision }, requestId: 'back', revision: oldRevision });
            current = await h.runtime.service.display(p, s.id, d.id);
            expect(current.view!.data.checklistId).not.toBe(key);
            expect((current.view!.data.items as any[])[0].checked).toBe(false);
            const saved: any = await h.runtime.service.checklists.read(p, { sessionId: s.id, checklistId: key });
            expect(saved.view.data.items[0].checked).toBe(true);
            await h.runtime.service.execute("kanvas.pin.recall", { sessionId: s.id, displayId: d.id, pinId: pin.id, expectedRevision: current.revision, requestId: 'recall' }, p);
            expect(((await h.runtime.service.display(p, s.id, d.id)).view!.data.items as any[])[0].checked).toBe(false);
        });
    });
});
