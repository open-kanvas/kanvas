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
import { z } from 'zod';
import { viewSchema } from '../../src/shared/view-schemas.js';
import { templateViewSchema } from '../../src/shared/view-schemas.js';
import { NOT_A_SLIDE } from '../../src/shared/view-schemas.js';
import { compactSchemaReferences } from '../../src/shared/json-schema.js';
import { MAX_TOOL_RESULT_BYTES } from '../../src/server/mcp/results.js';
import { publishInputSchema } from '../../src/shared/publish-input.js';
import { samples } from '../../src/shared/template-examples.js';
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
import { iconUrl } from '../../src/shared/pickers.js';
import { iconPickerDataSchema } from '../../src/shared/pickers.js';
import { fontPickerDataSchema } from '../../src/shared/pickers.js';
import { projectTasks } from '../../src/shared/task-list.js';
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

describe("split screen coverage 1", () => {
    const toastSchema = experienceTools.find(t => t.name === "kanvas.toast")!.schema;
    it('split schema has bounded ordinary panes (2, 3, 4 or 6 without rows/columns since 0.38.0) and rejects recursive composition', () => {
        for (const count of [2, 3, 4, 6])
            expect(validateView({ template: 'split-screen', data: { panes: Array.from({ length: count }, (_, i) => ({ id: 'p' + i, view: fact('Pane') })) } }).data.panes).toHaveLength(count);
        for (const count of [1, 5, 7])
            expect(() => validateView({ template: 'split-screen', data: { panes: Array.from({ length: count }, (_, i) => ({ id: 'p' + i, view: fact('Pane') })) } })).toThrow();
        const nested = { version: 1, template: 'split-screen', data: { panes: [{ id: 'a', view: fact('a') }, { id: 'b', view: fact('b') }] } };
        expect(() => validateView({ template: 'split-screen', data: { panes: [{ id: 'a', view: nested }, { id: 'b', view: fact('b') }] } })).toThrow();
    });
    describe("split screen contracts", () => {
        let h!: Harness, owner: Browser, s: string, d: string;
        const p = () => ({ userId: owner.user!.id });
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); s = (await owner.session()).id; d = (await owner.display(s)).id; await vi.waitFor(async () => expect((await h.runtime.store.query("SELECT count(*)::int n FROM events WHERE event_type='browser.operation' AND operation='kanvas.display.register'")).rows[0].n).toBe(1)); });
        afterEach(async () => { await h?.close(); });
        it('bounds the whole split after dataset expansion, without publishing a partial screen', async () => {
            const dataset = { ...parseDataset({ name: 'Large supplied data', rows: Array.from({ length: 100 }, () => ({ value: 'x'.repeat(12000) })) }), id: 'large', sessionId: s, createdAt: new Date().toISOString() };
            await h.runtime.store.put('dataset', dataset);
            const child = { version: 1 as const, template: 'table' as const, data: { binding: { datasetId: 'large' } } };
            expect((await h.runtime.service.verifyView(p(), s, child)).data.rows).toBeTruthy();
            await expect(h.runtime.service.verifyView(p(), s, { version: 1, template: 'split-screen', data: { panes: Array.from({ length: 6 }, (_, i) => ({ id: 'p' + i, view: child })) } })).rejects.toThrow(/size|complexity/);
        });
    });
});

describe("split screen coverage 2", () => {
    const displayGuidance = (template: string) => (TEMPLATE_DISPLAY_GUIDANCE as Record<string, unknown>)[template];
    const pane = (id: string, text = id) => ({ id, view: { version: 1, template: 'fact', data: { text } } });
    const split = (data: Record<string, unknown>) => ({ version: 1, template: 'split-screen', data });
    describe('a3523838 / 4e78197e: split screen grids, one nested level, sixteen panes, dividers', () => {
        const ids = (n: number, prefix = 'p') => Array.from({ length: n }, (_, i) => pane(`${prefix}${i}`));
        it('accepts every even grid from 1x2 to 4x4 and maps omitted rows/columns as before', () => {
            for (let rows = 1; rows <= 4; rows++)
                for (let columns = 1; columns <= 4; columns++) {
                    if (rows * columns < 2)
                        continue;
                    expect(validateView(split({ rows, columns, panes: ids(rows * columns) })).template, `${rows}x${columns}`).toBe('split-screen');
                }
            expect(splitGrid(3)).toEqual({ rows: 1, columns: 3 });
            expect(splitGrid(3, undefined, undefined, 'horizontal')).toEqual({ rows: 3, columns: 1 });
            expect(splitGrid(2)).toEqual({ rows: 1, columns: 2 });
            expect(splitGrid(2, undefined, undefined, 'horizontal')).toEqual({ rows: 2, columns: 1 });
            expect(splitGrid(4)).toEqual({ rows: 2, columns: 2 });
            expect(splitGrid(6)).toEqual({ rows: 2, columns: 3 });
            expect(splitGrid(4, 1)).toEqual({ rows: 1, columns: 4 });
            expect(splitGrid(4, undefined, 1)).toEqual({ rows: 4, columns: 1 });
            expect(splitGrid(8, 2)).toEqual({ rows: 2, columns: 4 });
            expect(splitGrid(5)).toBeUndefined();
            expect(splitGrid(6, 4)).toBeUndefined();
            expect(splitGrid(10, 2, 5)).toBeUndefined();
            // Three panes were refused in 0.37 although the schema allowed them.
            expect(validateView(split({ panes: ids(3) })).template).toBe('split-screen');
            expect(() => validateView(split({ panes: ids(5) }))).toThrow(/rows x columns/);
            expect(() => validateView(split({ rows: 2, columns: 2, panes: ids(3) }))).toThrow();
            expect(() => validateView(split({ rows: 5, columns: 1, panes: ids(5) }))).toThrow();
        });
        it('nests one grid inside a top-level pane and no deeper, with unique ids and a cap of sixteen', () => {
            const fiveA = split({ columns: 2, panes: [pane('left'), { id: 'right', rows: 4, columns: 1, panes: ids(4, 'r') }] });
            expect(splitLeaves(validateView(fiveA).data).map(p => p.id)).toEqual(['left', 'r0', 'r1', 'r2', 'r3']);
            expect(splitLeaves(validateView(fiveA).data).map(p => p.path)).toEqual(['/data/panes/0/view', '/data/panes/1/panes/0/view', '/data/panes/1/panes/1/view', '/data/panes/1/panes/2/view', '/data/panes/1/panes/3/view']);
            expect(splitLeaves(validateView(split({ columns: 2, panes: [pane('left'), { id: 'right', rows: 2, columns: 2, panes: ids(4, 'r') }] })).data)).toHaveLength(5);
            expect(splitLeaves(validateView(split({ columns: 3, panes: [pane('a'), { id: 'mid', rows: 2, columns: 2, panes: ids(4, 'm') }, pane('c')] })).data)).toHaveLength(6);
            // A nested pane cannot be split again.
            expect(() => validateView(split({ columns: 2, panes: [pane('left'), { id: 'right', rows: 2, columns: 1, panes: [pane('x'), { id: 'deep', rows: 2, columns: 1, panes: ids(2, 'd') }] }] }))).toThrow();
            expect(() => validateView(split({ columns: 2, panes: [pane('left'), { id: 'right', view: split({ panes: ids(2, 'n') }) }] }))).toThrow();
            expect(() => validateView(split({ columns: 2, panes: [pane('same'), { id: 'right', rows: 2, columns: 1, panes: [pane('same'), pane('other')] }] }))).toThrow(/unique/);
            expect(SPLIT_LIMITS.leaves).toBe(16);
            expect(splitLeaves(validateView(split({ rows: 4, columns: 4, panes: ids(16) })).data)).toHaveLength(16);
            // 2x2 with every pane holding 2x2 is exactly sixteen; one more pane anywhere is refused.
            expect(splitLeaves(validateView(split({ rows: 2, columns: 2, panes: [0, 1, 2, 3].map(i => ({ id: `g${i}`, rows: 2, columns: 2, panes: ids(4, `g${i}p`) })) })).data)).toHaveLength(16);
            expect(() => validateView(split({ rows: 2, columns: 2, panes: [...[0, 1, 2].map(i => ({ id: `g${i}`, rows: 2, columns: 2, panes: ids(4, `g${i}p`) })), { id: 'g3', rows: 2, columns: 3, panes: ids(6, 'g3p') }] }))).toThrow(/At most 16/);
        });
        it('keeps the default divider and takes none, gap, border width and colour', () => {
            expect(splitDivider(undefined)).toEqual({ gap: 6, borderWidth: 1 });
            expect(splitDivider('none')).toEqual({ gap: 0, borderWidth: 0 });
            expect(splitDivider({ gap: 20, borderColor: '#ff8800' })).toEqual({ gap: 20, borderWidth: 1, borderColor: '#ff8800' });
            expect(validateView(split({ divider: 'none', panes: ids(2) })).data.divider).toBe('none');
            expect(validateView(split({ divider: { gap: 0, borderWidth: 4, borderColor: '#112233' }, panes: ids(2) })).data.divider).toEqual({ gap: 0, borderWidth: 4, borderColor: '#112233' });
            expect(() => validateView(split({ divider: { gap: 999 }, panes: ids(2) }))).toThrow();
            expect(() => validateView(split({ divider: { borderColor: 'red' }, panes: ids(2) }))).toThrow();
            expect(() => validateView(split({ divider: { style: 'dashed' }, panes: ids(2) }))).toThrow();
            expect(validateView(split({ panes: ids(2) })).data.divider).toBeUndefined();
        });
        it('patches one nested pane by path without touching the others, on a real session', async () => {
            const h = await startHarness();
            try {
                const o = await h.account(), s = (await o.session()).id, d = (await o.display(s)).id, p = { userId: o.user!.id };
                const published = await o.submit(s, [d], split({ columns: 2, divider: { gap: 0 }, panes: [pane('left', 'Left'), { id: 'right', rows: 2, columns: 1, panes: [pane('top', 'Top'), pane('bottom', 'Bottom')] }] }) as ViewSpec);
                expect(published.update.status).toBe('prepared');
                const revision = published.detail.displays[0].revision;
                await h.runtime.service.execute("kanvas.view.patch", { sessionId: s, displayId: d, requestId: randomUUID(), expectedRevision: revision, operations: [{ op: 'set', path: '/data/panes/1/panes/1/view/data/text', value: 'Changed' }] }, p);
                const view = (await o.detail(s)).displays[0].view!;
                expect(splitLeaves(view.data).map(x => [x.id, x.view.data.text])).toEqual([['left', 'Left'], ['top', 'Top'], ['bottom', 'Changed']]);
                // Pane identity, count and grid shape are not patchable.
                await expect(h.runtime.service.execute("kanvas.view.patch", { sessionId: s, displayId: d, requestId: randomUUID(), expectedRevision: revision + 1, operations: [{ op: 'set', path: '/data/panes/1/rows', value: 1 }] }, p)).rejects.toMatchObject({ code: 'PATCH_UNSUPPORTED' });
                await expect(h.runtime.service.execute("kanvas.view.patch", { sessionId: s, displayId: d, requestId: randomUUID(), expectedRevision: revision + 1, operations: [{ op: 'remove', path: '/data/panes/1/panes/1' }] }, p)).rejects.toMatchObject({ code: 'PATCH_UNSUPPORTED' });
                await h.runtime.service.execute("kanvas.view.patch", { sessionId: s, displayId: d, requestId: randomUUID(), expectedRevision: revision + 1, operations: [{ op: 'set', path: '/data/divider', value: 'none' }] }, p);
                expect((await o.detail(s)).displays[0].view!.data.divider).toBe('none');
            }
            finally {
                await h.close();
            }
        });
    });
});
