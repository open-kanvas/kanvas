import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startHarness, success, fact, type Harness, type Browser } from './harness.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import type { ViewSpec } from '../../src/shared/types.js';
import { plannerConflicts, plannerDataSchema, plannerIcs, reviewPlanner } from '../../src/shared/planner.js';

describe('server-held schedule planner (reported regression)', () => {
  let h: Harness, owner: Browser, sessionId: string, displayId: string, p: AuthPrincipal;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = async (name: string, args: unknown) => (await h.runtime.service.execute(name, args, p)) as any;
  const items = [
    { id: 'review', title: 'Design review', start: '2026-11-04T13:00:00+01:00', end: '2026-11-04T15:00:00+01:00' },
    { id: 'dentist', title: 'Dentist', start: '2026-11-04T14:00:00+01:00', end: '2026-11-04T15:00:00+01:00' },
    { id: 'boat', title: 'Boat trip', start: '2026-11-05T10:00:00+01:00', end: '2026-11-05T14:00:00+01:00', constraints: { fixed: true } },
  ];
  const plan = { version: 1, template: 'planner', data: { view: 'week', anchorDate: '2026-11-02', timeZone: 'Europe/Oslo', items } } as ViewSpec;
  const revision = async () => (await owner.detail(sessionId)).displays[0].revision as number;
  const publish = async () => (await owner.submit(sessionId, [displayId], plan)).detail.displays[0].revision as number;
  beforeEach(async () => { h = await startHarness(); owner = await h.account(); sessionId = (await owner.session()).id; displayId = (await owner.display(sessionId)).id; p = { userId: owner.user!.id }; });
  afterEach(async () => { await h?.close(); });

  it('flags overlaps and declared constraints, applies decisions and exports folded iCalendar', () => {
    const data = plannerDataSchema.parse({ ...plan.data, items: [...items,
      { id: 'report', title: 'Quarterly report, final', start: '2026-11-06T09:00:00+01:00', end: '2026-11-06T12:00:00+01:00', notes: 'Line one\nLine two; with a semicolon', constraints: { deadline: '2026-11-06T11:00:00+01:00', bufferAfterMinutes: 30 } },
      { id: 'lunch', title: 'Lunch', start: '2026-11-06T12:15:00+01:00', end: '2026-11-06T13:00:00+01:00' },
      { id: 'holiday', title: 'Holiday', allDay: true, start: '2026-11-04', end: '2026-11-05' }] });
    expect(plannerConflicts(data.items).map(conflict => [conflict.kind, conflict.itemId, conflict.withItemId ?? null])).toEqual([['overlap', 'review', 'dentist'], ['buffer', 'report', 'lunch'], ['deadline', 'report', null]]);
    const moved = reviewPlanner({ ...data, proposals: [{ id: 'p1', action: 'move', itemId: 'dentist', item: { start: '2026-11-04T16:00:00+01:00', end: '2026-11-04T17:00:00+01:00' }, reason: 'Avoid the overlap' }] }, new Set(['p1']), new Set());
    expect(moved.accepted).toEqual(['p1']); expect(moved.data.proposals).toEqual([]);
    expect(plannerConflicts(moved.data.items).some(conflict => conflict.kind === 'overlap')).toBe(false);
    const ics = plannerIcs({ ...data, committedAt: '2026-11-01T10:00:00Z' }, 'display-a');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true); expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('SUMMARY:Quarterly report\\, final'); expect(ics).toContain('DTSTART:20261106T080000Z'); expect(ics).toContain('DTSTART;VALUE=DATE:20261104');
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two\\; with a semicolon');
    expect(ics.split('\r\n').every(line => new TextEncoder().encode(line).length <= 75)).toBe(true);
    expect(() => plannerDataSchema.parse({ ...plan.data, proposals: [{ id: 'x', action: 'add', itemId: 'review', item: { title: 'Again', start: '2026-11-04T16:00:00+01:00', end: '2026-11-04T17:00:00+01:00' }, reason: 'r' }] })).toThrow();
  });

  it('reads, proposes, reviews on the display and through tools, finalizes and exports the authoritative plan', async () => {
    const r0 = await publish();
    const first = await call('kanvas_planner_read', { sessionId, displayId });
    expect(first).toMatchObject({ revision: r0, status: 'draft', itemsTotal: 3, truncated: false, proposals: [] });
    expect(first.conflicts).toEqual([expect.objectContaining({ kind: 'overlap', itemId: 'review', withItemId: 'dentist' })]);
    const proposeArgs = { sessionId, displayId, expectedRevision: r0, requestId: 'propose-1', proposals: [
      { id: 'p-dentist', action: 'move', itemId: 'dentist', item: { start: '2026-11-04T16:00:00+01:00', end: '2026-11-04T17:00:00+01:00' }, reason: 'Avoid the overlap' },
      { id: 'p-gym', action: 'add', itemId: 'gym', item: { title: 'Gym', start: '2026-11-06T07:00:00+01:00', end: '2026-11-06T08:00:00+01:00' }, reason: 'Friday morning is free' },
      { id: 'p-boat', action: 'remove', itemId: 'boat', reason: 'Storm forecast' },
    ] };
    const proposed = await call('kanvas_planner_propose', proposeArgs);
    expect(proposed.revisions[displayId]).toBe(r0 + 1);
    expect((await call('kanvas_planner_propose', proposeArgs)).document).toEqual({ retried: true });
    const pending = await call('kanvas_planner_read', { sessionId, displayId });
    expect(pending.proposals.find((entry: { id: string }) => entry.id === 'p-boat').warnings).toContain('Changes an item marked fixed');
    expect(pending.proposals.find((entry: { id: string }) => entry.id === 'p-dentist')).toMatchObject({ before: { start: '2026-11-04T14:00:00+01:00' }, after: { start: '2026-11-04T16:00:00+01:00' } });
    const respond = (requestId: string, proposalId: string, decision: string, at: number) => owner.request('POST', `/api/sessions/${sessionId}/displays/${displayId}/respond`, { revision: at, requestId, value: { kind: 'planner.review', proposalId, decision } });
    success(await respond('button-accept', 'p-dentist', 'accept', r0 + 1));
    expect(await revision()).toBe(r0 + 2);
    success(await respond('button-change', 'p-gym', 'change', r0 + 2));
    expect(await revision()).toBe(r0 + 2);
    const afterButton = await call('kanvas_planner_read', { sessionId, displayId });
    expect(afterButton.conflicts).toEqual([]); expect(afterButton.proposals.map((entry: { id: string }) => entry.id)).toEqual(['p-gym', 'p-boat']);
    await expect(call('kanvas_planner_review', { sessionId, displayId, expectedRevision: r0 + 1, requestId: 'stale', accept: ['p-gym'] })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    const reviewed = await call('kanvas_planner_review', { sessionId, displayId, expectedRevision: r0 + 2, requestId: 'review-1', accept: ['p-gym'], reject: ['p-boat'] });
    expect(reviewed.document).toMatchObject({ accepted: ['p-gym'], rejected: ['p-boat'], remaining: 0, conflicts: 0 });
    const draft = await call('kanvas_planner_read', { sessionId, displayId, includeIcs: true });
    expect(draft.ics).toBeUndefined(); expect(draft.icsNote).toContain('finalize');
    const finalized = await call('kanvas_planner_finalize', { sessionId, displayId, expectedRevision: r0 + 3, requestId: 'finalize-1' });
    expect(finalized.document).toMatchObject({ status: 'committed', items: 4, conflicts: 0 });
    const exported = await call('kanvas_planner_read', { sessionId, displayId, includeIcs: true });
    expect(exported).toMatchObject({ revision: r0 + 4, status: 'committed' });
    expect(exported.items.map((item: { id: string }) => item.id)).toEqual(['review', 'dentist', 'boat', 'gym']);
    expect(exported.ics).toContain('SUMMARY:Gym');
    const reopened = await call('kanvas_planner_edit', { sessionId, displayId, expectedRevision: r0 + 4, requestId: 'edit-1', upsertItems: [{ id: 'tennis', title: 'Tennis', start: '2026-11-08T15:00:00+01:00', end: '2026-11-08T16:00:00+01:00' }] });
    expect(reopened.document).toMatchObject({ reopened: true, status: 'draft', items: 5 });
  });

  it('rejects invalid proposals, finalizing with pending proposals, and non-planner displays', async () => {
    const r0 = await publish();
    const propose = (requestId: string, proposals: unknown[]) => call('kanvas_planner_propose', { sessionId, displayId, expectedRevision: r0, requestId, proposals });
    await expect(propose('unknown', [{ id: 'x', action: 'move', itemId: 'missing', item: { start: '2026-11-04T16:00:00+01:00' }, reason: 'r' }])).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(propose('exists', [{ id: 'x', action: 'add', itemId: 'review', item: { title: 'Again', start: '2026-11-04T16:00:00+01:00', end: '2026-11-04T17:00:00+01:00' }, reason: 'r' }])).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(propose('twice', [{ id: 'a', action: 'remove', itemId: 'boat', reason: 'r' }, { id: 'b', action: 'move', itemId: 'boat', item: { start: '2026-11-05T11:00:00+01:00', end: '2026-11-05T15:00:00+01:00' }, reason: 'r' }])).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(propose('backwards', [{ id: 'a', action: 'move', itemId: 'boat', item: { end: '2026-11-05T09:00:00+01:00' }, reason: 'r' }])).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await call('kanvas_planner_propose', { sessionId, displayId, expectedRevision: r0, requestId: 'ok', proposals: [{ id: 'a', action: 'remove', itemId: 'boat', reason: 'r' }] });
    await expect(call('kanvas_planner_finalize', { sessionId, displayId, expectedRevision: r0 + 1, requestId: 'too-early' })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await owner.submit(sessionId, [displayId], fact('Not a plan'));
    await expect(call('kanvas_planner_read', { sessionId, displayId })).rejects.toMatchObject({ code: 'INVALID_VIEW' });
  });
});
