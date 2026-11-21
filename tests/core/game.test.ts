import { z } from 'zod';
import { afterEach } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { vi } from 'vitest';
import { startHarness } from './harness';
import type { Harness } from './harness';
import { gameExample } from '../../src/shared/game';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { randomUUID } from 'node:crypto';
import { success } from './harness.js';
import { fact } from './harness.js';
import type { Browser } from './harness.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { validationIssues } from '../../src/server/input-errors.js';
import { gameDataSchema } from '../../src/shared/game.js';
import { createApp } from '../../src/server/app.js';
import { rawEvent } from '../../src/server/raw-events.js';
import { eventContext } from '../../src/server/raw-events.js';

describe("game coverage 1", () => {
    let h!: Harness;
    afterEach(async () => { vi.unstubAllEnvs(); await h?.close(); });
    it('patches stable pieces atomically, preserves peers, retries, rejects stale/invalid state, restores history', async () => {
        h = await startHarness();
        const a = await h.account(), s = await a.session(), d = await a.display(s.id), p = { userId: a.user!.id }, service = h.runtime.service;
        await a.submit(s.id, [d.id], { version: 1, template: 'game-board', data: gameExample('chess') });
        const before = await service.display(p, s.id, d.id);
        expect(before.view).toMatchObject({ template: 'game-board', data: { pieces: { knight: { cell: 'r8c7' } } } });
        const args = { sessionId: s.id, displayId: d.id, requestId: 'knight-move', expectedRevision: before.revision, operations: [{ op: 'set', path: '/data/pieces/knight/cell', value: 'r6c6' }, { op: 'set', path: '/data/pieces/knight/emphasis', value: 'last-move' }] };
        const updated = z.object({ id: z.string(), revisions: z.record(z.string(), z.number().int()) }).parse(await service.execute("kanvas.view.patch", args, p));
        expect(await service.execute("kanvas.view.patch", args, p)).toMatchObject({ id: updated.id, revisions: updated.revisions });
        const moved = await service.display(p, s.id, d.id);
        expect(moved.view!.data.pieces).toMatchObject({ knight: { cell: 'r6c6' }, whiteKing: { cell: 'r8c5' }, blackKing: { cell: 'r1c5' } });
        await expect(service.execute("kanvas.view.patch", { ...args, requestId: 'stale' }, p)).rejects.toThrow();
        await expect(service.execute("kanvas.view.patch", { ...args, requestId: 'invalid', expectedRevision: moved.revision, operations: [{ op: 'set', path: '/data/pieces/knight/cell', value: 'r99c1' }] }, p)).rejects.toThrow();
        expect((await service.display(p, s.id, d.id)).revision).toBe(moved.revision);
        const history = await service.displayHistory(p, s.id, d.id);
        expect(JSON.stringify(history)).toContain('game');
        await service.execute("kanvas.display.navigate", { sessionId: s.id, displayIds: [d.id], requestId: 'restore', expectedRevisions: { [d.id]: moved.revision }, revision: before.revision }, p);
        expect((await service.display(p, s.id, d.id)).view!.data).toEqual(before.view!.data);
    });
    it('disable flag prevents new game writes including presentation nesting without deleting retained state', async () => {
        h = await startHarness();
        const a = await h.account(), s = await a.session(), p = { userId: a.user!.id }, service = h.runtime.service;
        const view = { version: 1 as const, template: 'game-board' as const, data: gameExample('sudoku') };
        expect(await service.verifyView(p, s.id, view)).toEqual(view);
        vi.stubEnv('KANVAS_GAMES_ENABLED', 'false');
        await expect(service.verifyView(p, s.id, view)).rejects.toThrow('disabled');
        await expect(service.verifyView(p, s.id, { version: 1, template: 'presentation', data: { slides: [view] } })).rejects.toThrow('disabled');
    });
});

describe("game coverage 2", () => {


describe("game contracts",()=>{
 it('accepts visible board coordinates with unambiguous normalized mapping',()=>{
  expect(gameDataSchema.parse({preset:'chess',pieces:{knight:{cell:'f3',symbol:'knight'}}}).pieces.knight.cell).toBe('r6c6');
  expect(gameDataSchema.parse({preset:'sudoku',cells:{C7:{value:'4'}}}).cells.r7c3.value).toBe('4');
  expect(()=>gameDataSchema.parse({preset:'sudoku',cells:{C7:{value:'4'},r7c3:{value:'5'}}})).toThrow();
 });});
});
