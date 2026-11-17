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

describe("kanban coverage 1", () => {
    describe("kanban contracts", () => {
        let h!: Harness, o: Browser, s: string, d: string, p: {
            userId: string;
        };
        beforeEach(async () => { h = await startHarness(); o = await h.account(); s = (await o.session()).id; d = (await o.display(s)).id; p = { userId: o.user!.id }; });
        afterEach(async () => { await h?.close(); });
        const call = (name: string, args: Record<string, unknown> = {}) => h.runtime.service.execute(name, args, p) as Promise<any>;
        const update = (name: string, args: Record<string, unknown>) => call(name, { sessionId: s, displayId: d, ...args });
        const publish = async (template: any, data: any) => { const result = await o.submit(s, [d], { version: 1, template, data }); expect(result.update.status).toBe('prepared'); return result.detail.displays.find(x => x.id === d)!; };
        const current = async () => (await o.detail(s)).displays.find(x => x.id === d)!;
        it('kanban moves, edits, WIP remains advisory, column reordering and duplicate validation', async () => {
            await publish('kanban', { columns: [{ id: 'todo', name: 'To Do', cards: [{ id: 'bug', title: 'Fix login bug' }] }, { id: 'doing', name: 'In Progress', wipLimit: 1 }] });
            await update("kanvas.kanban.update", { action: 'move-card', cardId: 'bug', columnId: 'doing' });
            await update("kanvas.kanban.update", { action: 'add-card', columnId: 'doing', card: { id: 'docs', title: 'Write docs' } });
            await update("kanvas.kanban.update", { action: 'edit-card', cardId: 'bug', patch: { assignee: 'Alex', tags: ['urgent'], dueDate: '2026-11-01' } });
            await update("kanvas.kanban.update", { action: 'reorder-columns', columnIds: ['doing', 'todo'] });
            const cols: any = (await current()).view!.data.columns;
            expect(cols[0].cards).toHaveLength(2);
            expect(cols[0].cards[0]).toMatchObject({ assignee: 'Alex' });
            await expect(update("kanvas.kanban.update", { action: 'add-card', columnId: 'doing', card: { id: 'bug', title: 'Duplicate' } })).rejects.toThrow();
            await update("kanvas.kanban.update", { action: 'remove-card', cardId: 'docs' });
            expect(((await current()).view!.data.columns as any[])[0].cards).toHaveLength(1);
        });
        const definition = { name: 'Team list', schema: { type: 'object', properties: { title: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } } }, required: ['title', 'items'] }, html: '<article><h1>{{title}}</h1><ul>{{#each items}}<li>{{name}}</li>{{/each}}</ul></article>', css: 'article {padding: 24px; color: white;} h1 {font-size: 48px;}' };
    });
});
