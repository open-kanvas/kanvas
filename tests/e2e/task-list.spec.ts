import type { Page } from '@playwright/test';
import { createDisplay } from './support';
import { createSession } from './support';
import { expect } from './support';
import { openViewer } from './support';
import { publishPrepared } from './support';
import { register } from './support';
import { sessionApi } from './support';
import { test } from './support';
import { waitForDisplay } from './support';
import { validateView } from '../../src/shared/view-schemas';
import { operationId } from '../../src/server/mcp/operations';
import type { ViewSpec } from '../../src/shared/types';

test.describe("task list coverage 1", () => {
    const view = (template: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) => validateView({ version: 1, template, data, ...extra } as never) as ViewSpec;
    const shown = async (page: Page, viewer: Page, s: string, displayId: string, spec: ViewSpec) => { await publishPrepared(page, s, [displayId], spec); const current = await waitForDisplay(page, s, displayId, x => x.revision > 0 && x.appliedRevision === x.revision); await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision', String(current.revision)); return current; };
    const setup = async (page: Page, name: string) => { await register(page); const s = await createSession(page, name), d = await createDisplay(page, s, 'Display'), viewer = await openViewer(page, s, d.id); return { s, d, viewer }; };
    const mcp = async (page: Page, baseURL: string) => { const token = await sessionApi<{
        token: string;
    }>(page, '/api/tokens', 'POST', { name: 'Nov14 fixture', scopes: ['read', 'publish'] }); const { Client, StreamableHTTPClientTransport } = await import('@modelcontextprotocol/client'); const client = new Client({ name: 'nov14-fixture', version: '1' }); await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseURL), { requestInit: { headers: { Authorization: 'Bearer ' + token.data!.token } } })); return client; };
    const use = async (client: Awaited<ReturnType<typeof mcp>>, canonical: string, args: Record<string, unknown>) => { const result = await client.callTool({ name: 'kanvas_call', arguments: { operationId: operationId(canonical), arguments: args } }); return { isError: result.isError === true, structured: result.structuredContent as Record<string, any> }; };
    const fact = (text: string) => ({ version: 1, template: 'fact', data: { text } });
    const pane = (id: string, inner: Record<string, unknown> = fact(id)) => ({ id, view: inner });
    const pie = (kind: 'pie' | 'donut') => ({ version: 1, template: 'chart', data: { kind, series: [{ name: 'Share', points: [{ x: 'Alpha', y: 40 }, { x: 'Beta', y: 30 }, { x: 'Gamma', y: 20 }, { x: 'Delta', y: 10 }] }] } });
    test('checked tasks stay in place and the highlighted task is kept in view (08d22167, 1c0ebe3f)', async ({ page, baseURL }) => {
        const { s, d, viewer } = await setup(page, 'Task order');
        const client = await mcp(page, baseURL!);
        try {
            await shown(page, viewer, s, d.id, view('task-list', { columns: [{ key: 'number', label: '#' }, { key: 'item', label: 'Item' }, { key: 'status', label: 'Status' }, { key: 'tags', label: 'Tags' }, { key: 'owner', label: 'Owner' }], items: Array.from({ length: 30 }, (_, i) => ({ title: `Task ${i + 1}`, status: 'untested', tags: ['t'] })) }));
            const rows = viewer.locator('.viewer-candidate .task-list tbody tr');
            await expect(rows).toHaveCount(30);
            // Built-in keys add no columns; an own column without values takes no room.
            await expect(viewer.locator('.viewer-candidate .task-list thead th')).toHaveCount(5);
            const lists = (await use(client, "kanvas.tasklist.read", { sessionId: s })).structured.data, taskListId = lists.taskLists[0].id;
            const scroller = viewer.locator('.viewer-candidate .task-list-scroll');
            await use(client, "kanvas.tasklist.update", { sessionId: s, taskListId, requestId: 't-1', check: [1], highlight: 2 });
            await expect(rows.nth(0)).toHaveClass(/is-done/);
            await expect(rows.nth(0)).toHaveAttribute('data-task-number', '1');
            await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true');
            expect(await rows.evaluateAll(els => els.map(el => Number((el as HTMLElement).dataset.taskNumber)))).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
            // Early in the list nothing scrolls.
            expect(await scroller.evaluate(el => el.scrollTop)).toBeLessThanOrEqual(1);
            await use(client, "kanvas.tasklist.update", { sessionId: s, taskListId, requestId: 't-2', check: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17], highlight: 18 });
            await expect(rows.nth(17)).toHaveAttribute('aria-current', 'true');
            await expect.poll(async () => { const frame = (await scroller.boundingBox())!, row = (await rows.nth(17).boundingBox())!; return Math.abs(row.y + row.height / 2 - (frame.y + frame.height / 2)) / frame.height; }).toBeLessThan(.3);
            expect(await rows.evaluateAll(els => els.map(el => Number((el as HTMLElement).dataset.taskNumber)))).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
            await expect(rows.nth(16)).toHaveClass(/is-done/);
            const updated = await use(client, "kanvas.tasklist.update", { sessionId: s, taskListId, requestId: 't-3', columns: [{ key: 'number', label: '#' }, { key: 'owner', label: 'Owner' }], items: [{ item: 18, fields: { owner: 'Ada' } }] });
            expect(updated.structured.data.ignoredColumns).toEqual(['number']);
            await expect(viewer.locator('.viewer-candidate .task-list thead th')).toHaveCount(6);
        }
        finally {
            await client.close();
        }
    });
});
