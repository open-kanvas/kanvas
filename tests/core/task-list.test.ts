import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import { validateView } from '../../src/shared/view-schemas.js';
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
import { recordHttpOperation } from '../../src/server/raw-events.js';
import { denied } from './harness.js';
import { fact } from './harness.js';
import { z } from 'zod';
import { viewSchema } from '../../src/shared/view-schemas.js';
import { templateViewSchema } from '../../src/shared/view-schemas.js';
import { NOT_A_SLIDE } from '../../src/shared/view-schemas.js';
import { compactSchemaReferences } from '../../src/shared/json-schema.js';
import { MAX_TOOL_RESULT_BYTES } from '../../src/server/mcp/results.js';
import { publishInputSchema } from '../../src/shared/publish-input.js';
import { splitGrid } from '../../src/shared/split-screen.js';
import { splitLeaves } from '../../src/shared/split-screen.js';
import { splitDivider } from '../../src/shared/split-screen.js';
import { SPLIT_LIMITS } from '../../src/shared/split-screen.js';
import { redactStreamAddress } from '../../src/shared/monitor-stream-view.js';
import { streamRows } from '../../src/shared/monitor-stream-view.js';
import { formatDuration } from '../../src/shared/monitor-stream-view.js';
import type { StreamViewEvent } from '../../src/shared/monitor-stream-view.js';
import { boundStreamIds } from '../../src/server/monitor-streams.js';
import { STREAM_WAIT_MS } from '../../src/server/monitor-streams.js';
import { pointingSummary } from '../../src/shared/pointing.js';
import { POINTER_FADE_MS } from '../../src/shared/pointing.js';
import { POINTER_PIN_MS } from '../../src/shared/pointing.js';
import { POINTING_QUEUE } from '../../src/shared/pointing.js';
import { POINTING_BLOCK_EVENTS } from '../../src/shared/pointing.js';
import { applyResponsePolicy } from '../../src/server/mcp/response-policy.js';
import { ContactLedger } from '../../src/server/mcp/response-policy.js';
import { BOARD_DISCLOSURE } from '../../src/shared/message-board.js';
import { BOARD_LIMITS } from '../../src/shared/message-board.js';
import { parseIconId } from '../../src/shared/pickers.js';
import { isPickerIconUrl } from '../../src/shared/pickers.js';
import { iconPickerDataSchema } from '../../src/shared/pickers.js';
import { fontPickerDataSchema } from '../../src/shared/pickers.js';
import { taskCustomColumns } from '../../src/shared/task-list.js';
import { isBuiltinTaskColumn } from '../../src/shared/task-list.js';
import { navigate } from '../../src/shared/navigation.js';
import { initialNavigation } from '../../src/shared/navigation.js';
import { textScale } from '../../src/shared/reading.js';
import { configPatchSchema } from '../../src/shared/preferences.js';
import { sharingLevel } from '../../src/server/account-overview.js';
import { HELP_PAGES as HELP } from '../../src/shared/help.js';
import { HELP_TOPICS } from '../../src/shared/help.js';
import { TEMPLATE_DISPLAY_GUIDANCE } from '../../src/shared/display-guidance.js';
import { TEMPLATE_IDS } from '../../src/shared/types.js';
import type { ViewSpec } from '../../src/shared/types.js';

describe("task list coverage 1", () => {
    describe('e2ba79e1 task list: saved state, narrow operations, stable numbers', () => {
        let h!: Harness, o: Browser, s: string, d: string, p: {
            userId: string;
        }, listId: string;
        const detail = 'Original section of the release email. '.repeat(40);
        beforeEach(async () => {
            h = await startHarness();
            o = await h.account();
            s = (await o.session()).id;
            d = (await o.display(s)).id;
            p = { userId: o.user!.id };
            const published = await o.submit(s, [d], { version: 1, template: 'task-list', title: 'Release', data: { statusPalette: 'testing', columns: [{ key: 'owner', label: 'Owner' }], items: [{ title: 'Sign in', status: 'passed', tags: ['auth'], detail, source: 'Release email, section 1' }, { title: 'Tick one item', status: 'testing', tags: ['checklist'], fields: { owner: 'Ada' } }, { title: 'Dismiss a toast', status: 'untested', tags: ['toast'] }, { title: 'Reopen the app', status: 'untested', tags: ['auth'] }] } } as never);
            expect(published.update.status).toBe('prepared');
            listId = String(published.detail.displays[0].view!.data.taskListId);
        });
        afterEach(async () => { await h?.close(); });
        const call = (name: string, args: Record<string, unknown> = {}) => h.runtime.service.execute(name, args, p) as Promise<any>;
        const update = (args: Record<string, unknown>) => call("kanvas.tasklist.update", { sessionId: s, taskListId: listId, requestId: randomUUID(), ...args });
        const shown = async () => (await o.detail(s)).displays.find(x => x.id === d)!.view!.data as {
            items: {
                id: string;
                number: number;
                title: string;
                checked: boolean;
                detail?: string;
                hasDetail?: boolean;
            }[];
            highlight?: string;
        };
        it('numbers are assigned once and stay with the item; the display carries detail only for the highlighted item', async () => {
            const view = await shown();
            expect(view.items.map(item => item.number)).toEqual([1, 2, 3, 4]);
            expect(view.items[0]).toMatchObject({ id: 't1', hasDetail: true });
            expect(view.items[0].detail).toBeUndefined();
            const marked = await update({ highlight: 1 });
            expect(marked.highlight).toEqual({ id: 't1', number: 1 });
            expect((await shown()).items[0].detail).toBe(detail);
            // The agent reads one item back in full instead of re-fetching the source.
            const one = await call("kanvas.tasklist.read", { sessionId: s, taskListId: listId, item: 1 });
            expect(one.item).toMatchObject({ number: 1, title: 'Sign in', detail, source: 'Release email, section 1' });
            expect((await call("kanvas.tasklist.read", { sessionId: s, taskListId: listId, item: 't2' })).item.fields).toEqual({ owner: 'Ada' });
        });
        it('single-item operations touch only what they name and report it; nothing is deleted by omission', async () => {
            const result = await update({ expectedRevision: 0, check: [2], items: [{ item: 3, status: 'passed', tags: ['toast', 'done'] }], add: [{ title: 'New finding', status: 'untested' }] });
            expect(result).toMatchObject({ revision: 1, changes: { added: [5], changed: [3], checked: [2], removed: [], unchecked: [] }, counts: { total: 5, open: 4, done: 1 } });
            const rows = (await call("kanvas.tasklist.read", { sessionId: s, taskListId: listId })).items;
            expect(rows.map((r: {
                number: number;
            }) => r.number)).toEqual([1, 2, 3, 4, 5]);
            expect(rows[1]).toMatchObject({ number: 2, checked: true });
            expect(rows.find((r: {
                number: number;
            }) => r.number === 1)).toMatchObject({ title: 'Sign in', status: 'passed', hasDetail: true });
            const removed = await update({ remove: [4] });
            expect(removed.changes.removed).toEqual([4]);
            const added = await update({ add: [{ title: 'After a removal' }] });
            expect(added.changes.added).toEqual([6]);
            let missing: unknown;
            try {
                await update({ check: [99] });
            }
            catch (error) {
                missing = error;
            }
            expect(safeError(missing).issues?.[0]).toMatchObject({ path: 'check[0]' });
            let stale: unknown;
            try {
                await update({ expectedRevision: 0, check: [1] });
            }
            catch (error) {
                stale = error;
            }
            expect(safeError(stale)).toMatchObject({ code: 'REVISION_CONFLICT', currentRevision: 3 });
            const same = { sessionId: s, taskListId: listId, requestId: 'retry-1', check: [1] };
            const first = await call("kanvas.tasklist.update", same);
            expect((await call("kanvas.tasklist.update", same)).revision).toBe(first.revision);
        });
        it('sort and filter run on stored data, deterministically, on the server and for the display', async () => {
            await update({ filter: { status: ['UNTESTED'] }, sort: { by: 'title', direction: 'desc' } });
            const filtered = await call("kanvas.tasklist.read", { sessionId: s, taskListId: listId });
            expect(filtered.items.map((r: {
                title: string;
            }) => r.title)).toEqual(['Reopen the app', 'Dismiss a toast']);
            expect(filtered.counts).toMatchObject({ total: 4, matching: 2, hiddenByFilter: 2 });
            const view = await shown();
            expect(projectTasks(view.items as never, view as never).items.map(item => item.title)).toEqual(['Reopen the app', 'Dismiss a toast']);
            expect((await call("kanvas.tasklist.read", { sessionId: s, taskListId: listId, tags: ['auth'], sort: { by: 'number', direction: 'asc' } })).items.map((r: {
                number: number;
            }) => r.number)).toEqual([1, 4]);
            await update({ filter: null, sort: null });
            expect((await call("kanvas.tasklist.read", { sessionId: s, taskListId: listId })).items).toHaveLength(4);
            expect(projectTasks([{ title: 'b', checked: true, number: 1 }, { title: 'a', checked: false, number: 2 }] as never, { doneLast: true }).items.map(item => item.number)).toEqual([2, 1]);
        });
        it('own columns filter like status and tags: column=value, alternatives within a column, every column must match; own status colours are validated', async () => {
            await update({ items: [{ item: 3, fields: { owner: 'Bo' } }, { item: 4, fields: { owner: 'ada' } }] });
            await update({ filter: { fields: ['owner=ADA'] } });
            expect((await call("kanvas.tasklist.read", { sessionId: s, taskListId: listId })).items.map((r: {
                number: number;
            }) => r.number)).toEqual([2, 4]);
            await update({ filter: { fields: ['owner=Ada', 'owner = Bo'], status: ['untested'] } });
            const filtered = await call("kanvas.tasklist.read", { sessionId: s, taskListId: listId });
            expect(filtered.items.map((r: {
                number: number;
            }) => r.number)).toEqual([3, 4]);
            expect(filtered.counts).toMatchObject({ matching: 2, hiddenByFilter: 2 });
            const view = await shown() as never as {
                items: never[];
                filter: never;
            };
            expect(projectTasks(view.items, view).items.map((item: {
                number: number;
            }) => item.number)).toEqual([3, 4]);
            let bad: unknown;
            try {
                await update({ filter: { fields: ['owner'] } });
            }
            catch (error) {
                bad = error;
            }
            expect(bad).toBeTruthy();
            await update({ filter: null });
            expect((await call("kanvas.tasklist.read", { sessionId: s, taskListId: listId })).items).toHaveLength(4);
            const list = (colors: Record<string, string>) => validateView({ template: 'task-list', data: { colors, items: [{ title: 'One', status: 'waiting' }] } } as never);
            expect((list({ waiting: '#d9a441', Shipped: '#4caf7d' }).data as {
                colors: unknown;
            }).colors).toEqual({ waiting: '#d9a441', Shipped: '#4caf7d' });
            for (const wrong of [{ waiting: 'orange' }, { '': '#000000' }, { ['x'.repeat(41)]: '#000000' }, Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`s${i}`, '#000000']))])
                expect(() => list(wrong), JSON.stringify(wrong).slice(0, 60)).toThrow();
        });
        it('survives clearing the display, re-shows on another display, and stays inside its session', async () => {
            await o.submit(s, [d], { version: 1, template: 'fact', data: { text: 'Something else' } } as never);
            const second = (await o.display(s, 'Second')).id;
            const result = await call("kanvas.tasklist.show", { sessionId: s, taskListId: listId, displayId: second, requestId: randomUUID() });
            expect(result.status).toBe('prepared');
            expect((await o.detail(s)).displays.find(x => x.id === second)!.view!.data.taskListId).toBe(listId);
            await update({ check: [1] });
            expect(((await o.detail(s)).displays.find(x => x.id === second)!.view!.data.items as {
                number: number;
                checked: boolean;
            }[]).find(item => item.number === 1)!.checked).toBe(true);
            expect((await o.detail(s)).displays.find(x => x.id === d)!.view!.template).toBe('fact');
            const other = await h.account(), otherSession = (await other.session()).id;
            await expect(h.runtime.service.execute("kanvas.tasklist.read", { sessionId: otherSession, taskListId: listId }, { userId: other.user!.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
            await expect(h.runtime.service.execute("kanvas.tasklist.read", { sessionId: s, taskListId: listId }, { userId: other.user!.id })).rejects.toBeTruthy();
            expect((await call("kanvas.tasklist.read", { sessionId: s })).taskLists).toEqual([expect.objectContaining({ id: listId, items: 4, done: 1 })]);
        });
    });
});

describe("task list coverage 2", () => {

const displayGuidance=(template:string)=>(TEMPLATE_DISPLAY_GUIDANCE as Record<string,unknown>)[template];

const pane=(id:string,text=id)=>({id,view:{version:1,template:'fact',data:{text}}});
const split=(data:Record<string,unknown>)=>({version:1,template:'split-screen',data});

describe("task list contracts",()=>{
 it('08d22167 / 1c0ebe3f: tasks keep their written order and built-in columns are not extra columns',()=>{
  const items=[{title:'One',checked:true,number:1},{title:'Two',checked:false,number:2},{title:'Three',checked:true,number:3},{title:'Four',checked:false,number:4,fields:{owner:'Ada'}}];
  expect(projectTasks(items).items.map(i=>i.number)).toEqual([1,2,3,4]);
  expect(projectTasks(items,{doneLast:true}).items.map(i=>i.number)).toEqual([2,4,1,3]);
  expect(projectTasks(items,{sort:{by:'title',direction:'asc'}}).items.map(i=>i.number)).toEqual([4,1,3,2]);
  const columns=[{key:'number',label:'#'},{key:'item',label:'Item'},{key:'Status',label:'Status'},{key:'tags',label:'Tags'},{key:'owner',label:'Owner'},{key:'due',label:'Due'}];
  expect(taskCustomColumns(columns).map(c=>c.key)).toEqual(['owner','due']);
  // An own column nobody has filled takes no room on screen.
  expect(taskCustomColumns(columns,items).map(c=>c.key)).toEqual(['owner']);
  expect(isBuiltinTaskColumn(' Title ')).toBe(true);expect(isBuiltinTaskColumn('owner')).toBe(false);
  expect(displayGuidance('task-list')).toBeTruthy();expect(JSON.stringify(displayGuidance('task-list'))).not.toMatch(/suggested starting point/);
 });});
});
