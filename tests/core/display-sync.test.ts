import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startHarness, success, type Harness, type Browser } from './harness.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import type { ViewSpec } from '../../src/shared/types.js';
import { planSync, syncFingerprint, syncPosition, type SyncGroup, type SyncState } from '../../src/server/display-sync.js';
import { samples } from '../../src/shared/template-examples.js';

const deck = (label: string, count: number, index = 0) => ({ version: 1, template: 'presentation', data: { index, slides: Array.from({ length: count }, (_, slide) => ({ version: 1, template: 'fact', data: { text: `${label} ${slide + 1}` } })) } }) as unknown as ViewSpec;
const procedure = { ...samples.procedure, data: { ...(samples.procedure.data as Record<string, unknown>), stage: 'intro', index: 0 } } as unknown as ViewSpec;
const steps = ((procedure.data as { steps: unknown[] }).steps).length;

describe('display synchronization (reported regression)', () => {
  it('derives positions, tells navigation from new content, and lets the latest navigation win', () => {
    expect(syncPosition(deck('A', 3, 2))).toEqual({ position: 2, count: 3 });
    expect(syncPosition({ ...procedure, data: { ...procedure.data, stage: 'intro', index: 1 } } as ViewSpec)?.position).toBe(0);
    expect(syncPosition({ ...procedure, data: { ...procedure.data, stage: 'complete' } } as ViewSpec)?.position).toBe(steps - 1);
    expect(syncPosition({ version: 1, template: 'fact', data: { text: 'Plain' } } as ViewSpec)).toBeNull();
    expect(syncFingerprint(deck('A', 3, 0))).toBe(syncFingerprint(deck('A', 3, 2)));
    expect(syncFingerprint(deck('A', 3))).not.toBe(syncFingerprint(deck('B', 3)));
    const state = (displayId: string, view: ViewSpec, updatedAt: string, held = false): SyncState => ({ display: { id: displayId, sessionId: 's', name: displayId, view, held, updatedAt, revision: 1, generation: 1 } as unknown as SyncState['display'], fingerprint: syncFingerprint(view), at: syncPosition(view) });
    const group: SyncGroup = { id: 'g', displayIds: ['a', 'b', 'c'], position: 0, lagging: [], createdAt: '', updatedAt: '', known: {
      a: { fingerprint: syncFingerprint(deck('A', 4)), position: 0 }, b: { fingerprint: syncFingerprint(deck('B', 2)), position: 0 }, c: { fingerprint: syncFingerprint(deck('C', 4)), position: 0 } } };
    const plan = planSync(group, [state('a', deck('A', 4, 3), '2026-01-01T00:00:02Z'), state('b', deck('B', 2), '2026-01-01T00:00:00Z'), state('c', deck('C', 4, 1), '2026-01-01T00:00:01Z', true)]);
    expect(plan.writes).toEqual([{ displayId: 'b', position: 1 }]);
    expect(plan.group).toMatchObject({ position: 3, lagging: ['c'] });
    const echo = planSync(plan.group, [state('a', deck('A', 4, 3), '2026-01-01T00:00:02Z'), state('b', deck('B', 2, 1), '2026-01-01T00:00:03Z'), state('c', deck('C', 4, 1), '2026-01-01T00:00:01Z', true)]);
    expect(echo).toMatchObject({ writes: [], changed: false });
    const fresh = planSync(plan.group, [state('a', deck('A', 4, 3), '2026-01-01T00:00:02Z'), state('b', deck('Revised', 5), '2026-01-01T00:00:05Z'), state('c', deck('C', 4, 1), '2026-01-01T00:00:01Z')]);
    expect(fresh.writes).toEqual([{ displayId: 'c', position: 3 }]);
    expect(fresh.group.known.b).toEqual({ fingerprint: syncFingerprint(deck('Revised', 5)), position: 0 });
  });

  describe('through the service', () => {
    let h: Harness, owner: Browser, sessionId: string, main: string, notes: string, p: AuthPrincipal, counter = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = async (name: string, args: unknown) => (await h.runtime.service.execute(name, args, p)) as any;
    const settle = () => h.runtime.service.displaySync.idle(sessionId);
    const displays = async () => Object.fromEntries((await owner.detail(sessionId)).displays.map(display => [display.id, display]));
    const indexOf = async (displayId: string) => Number(((await displays())[displayId]!.view?.data as { index?: number }).index ?? 0);
    const navigate = async (displayId: string, action: string, index?: number) => {
      (await call('kanvas_presentation_navigate', { sessionId, displayId, requestId: `nav-${++counter}`, expectedRevision: (await displays())[displayId]!.revision, action, ...(index === undefined ? {} : { index }) }));
      (await settle());
    };
    const tap = async (displayId: string, index: number) => {
      success(await owner.request('POST', `/api/sessions/${sessionId}/displays/${displayId}/respond`, { revision: (await displays())[displayId]!.revision, requestId: `tap-${++counter}`, value: { kind: 'presentation.navigate', index } }));
      (await settle());
    };
    const hold = async (displayId: string, held: boolean) => { (await call('kanvas_display_update', { sessionId, displayId, held, expectedRevision: (await displays())[displayId]!.revision })); (await settle()); };
    beforeEach(async () => {
      h = await startHarness(); owner = await h.account(); sessionId = (await owner.session()).id; p = { userId: owner.user!.id };
      main = (await owner.display(sessionId, 'Main')).id; notes = (await owner.display(sessionId, 'Notes')).id;
      (await owner.submit(sessionId, [main], deck('Slide', 4))); (await owner.submit(sessionId, [notes], deck('Note', 4))); (await settle());
    });
    afterEach(async () => { if (h) { (await h.runtime.service.displaySync.idle(sessionId)); (await h.close()); } });

    it('links displays persistently and moves them together in both directions without echo loops', async () => {
      const linked = await call('kanvas_displays_sync', { sessionId, action: 'link', displayIds: [main, notes] });
      expect(linked.groups).toEqual([expect.objectContaining({ position: 0, displays: [expect.objectContaining({ displayId: main, position: 0, count: 4 }), expect.objectContaining({ displayId: notes, position: 0, count: 4 })] })]);
      (await navigate(main, 'next'));
      expect(await indexOf(notes)).toBe(1);
      (await tap(notes, 3));
      expect(await indexOf(main)).toBe(3);
      const revisions = async () => Object.fromEntries(Object.values(await displays()).map(display => [display.id, display.revision]));
      const before = await revisions();
      (await settle());
      expect(await revisions()).toEqual(before);
      expect((await call('kanvas_displays_sync_read', { sessionId })).groups[0]).toMatchObject({ position: 3 });
      expect(await h.runtime.service.store.get('display-sync', sessionId)).toMatchObject({ sessionId });
      (await owner.submit(sessionId, [notes], deck('Revised note', 4))); (await settle());
      expect(await indexOf(main)).toBe(3); expect(await indexOf(notes)).toBe(0);
      (await tap(notes, 1));
      expect(await indexOf(main)).toBe(1);
    });

    it('aligns on link, clamps shorter decks, follows procedure steps, catches up held displays and stops after unlink', async () => {
      const short = (await owner.display(sessionId, 'Short')).id, guide = (await owner.display(sessionId, 'Guide')).id;
      (await owner.submit(sessionId, [short], deck('Short', 2))); (await owner.submit(sessionId, [guide], procedure)); (await settle());
      (await navigate(main, 'goto', 2));
      const linked = await call('kanvas_displays_sync', { sessionId, action: 'link', displayIds: [main, notes, short, guide], alignTo: main });
      expect([...linked.aligned].sort()).toEqual([notes, short, guide].sort());
      expect(await indexOf(notes)).toBe(2); expect(await indexOf(short)).toBe(1);
      const guideData = async () => (await displays())[guide]!.view!.data as { index: number; stage: string };
      expect(await guideData()).toMatchObject({ stage: 'step', index: Math.min(2, steps - 1) });
      (await hold(notes, true));
      (await navigate(main, 'next'));
      expect(await indexOf(notes)).toBe(2);
      const lagging = (await call('kanvas_displays_sync_read', { sessionId })).groups[0].displays.find((display: { displayId: string }) => display.displayId === notes);
      expect(lagging).toMatchObject({ held: true, lagging: true });
      (await hold(notes, false));
      expect(await indexOf(notes)).toBe(3); expect(await indexOf(short)).toBe(1);
      (await call('kanvas_displays_sync', { sessionId, action: 'unlink', displayIds: [notes] }));
      (await navigate(main, 'first'));
      expect(await indexOf(notes)).toBe(3); expect(await indexOf(short)).toBe(0);
      expect(await guideData()).toMatchObject({ stage: 'step', index: 0 });
    });

    it('validates links', async () => {
      await expect(call('kanvas_displays_sync', { sessionId, action: 'link', displayIds: [main] })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
      await expect(call('kanvas_displays_sync', { sessionId, action: 'link', displayIds: [main, notes], alignTo: 'elsewhere' })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
      const other = (await owner.session()).id, foreign = (await owner.display(other, 'Elsewhere')).id;
      await expect(call('kanvas_displays_sync', { sessionId, action: 'link', displayIds: [main, foreign] })).rejects.toThrow();
      expect((await call('kanvas_displays_sync_read', { sessionId })).groups).toEqual([]);
    });
  });
});
