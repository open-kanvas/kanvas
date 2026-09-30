import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startHarness, fact, type Harness, type Browser } from './harness.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import type { ViewSpec } from '../../src/shared/types.js';
import { applyTextChanges, mapDraftRange, resolveDraftEdits, wordDiff } from '../../src/server/documents.js';

describe('server-held drafting operations (reported regression)', () => {
  let h: Harness, owner: Browser, sessionId: string, displayId: string, p: AuthPrincipal;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = async (name: string, args: unknown) => (await h.runtime.service.execute(name, args, p)) as any;
  const draft = (text: string) => ({ version: 1, template: 'drafting', data: { text } }) as ViewSpec;
  const publish = async (view: ViewSpec) => (await owner.submit(sessionId, [displayId], view)).detail.displays[0].revision as number;
  beforeEach(async () => { h = await startHarness(); owner = await h.account(); sessionId = (await owner.session()).id; displayId = (await owner.display(sessionId)).id; p = { userId: owner.user!.id }; });
  afterEach(async () => { await h?.close(); });

  it('resolves edits, re-anchors untouched ranges and diffs words', () => {
    const text = 'Dear team, please reply asap. Thanks';
    const changes = resolveDraftEdits(text, [{ op: 'find-replace', find: 'Dear team', text: 'Hi all' }, { op: 'append', text: '!' }]);
    expect(applyTextChanges(text, changes)).toBe('Hi all, please reply asap. Thanks!');
    const asap = text.indexOf('asap');
    expect(mapDraftRange({ start: asap, end: asap + 4 }, changes)).toEqual({ start: asap - 3, end: asap + 1 });
    expect(mapDraftRange({ start: 0, end: 4 }, changes)).toBeUndefined();
    expect(() => resolveDraftEdits(text, [{ op: 'replace', start: 0, end: 10, text: 'x' }, { op: 'find-replace', find: 'team', text: 'y' }])).toThrow();
    expect(() => resolveDraftEdits(text, [{ op: 'find-replace', find: 'missing', text: 'y' }])).toThrow();
    expect(wordDiff('Please reply asap.', 'Please reply by Friday.').hunks).toEqual([{ op: 'equal', text: 'Please reply ' }, { op: 'delete', text: 'asap' }, { op: 'insert', text: 'by Friday' }, { op: 'equal', text: '.' }]);
  });

  it('reads, suggests, edits, reviews and diffs the authoritative draft with revision CAS and idempotent retries', async () => {
    const original = 'Dear team,\n\nPlease reply asap.\n\nThanks';
    const r0 = await publish(draft(original));
    expect(await call('kanvas_draft_read', { sessionId, displayId })).toMatchObject({ revision: r0, status: 'drafting', text: original, truncated: false, suggestions: [] });
    const suggestArgs = { sessionId, displayId, expectedRevision: r0, requestId: 'suggest-1', suggestions: [{ find: 'asap', replacement: 'by Friday', reason: 'Concrete date' }] };
    const suggested = await call('kanvas_draft_suggest', suggestArgs);
    const id = suggested.document.added[0].id as string;
    expect(suggested.revisions[displayId]).toBe(r0 + 1);
    const again = await call('kanvas_draft_suggest', suggestArgs);
    expect(again.id).toBe(suggested.id); expect(again.document).toEqual({ retried: true });
    await expect(call('kanvas_draft_edit', { sessionId, displayId, expectedRevision: r0, requestId: 'stale', edits: [{ op: 'append', text: '!' }] })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    const edited = await call('kanvas_draft_edit', { sessionId, displayId, expectedRevision: r0 + 1, requestId: 'edit-1', edits: [{ op: 'find-replace', find: 'Dear team', text: 'Hi all' }], draftStatus: 'reviewing' });
    expect(edited.document).toMatchObject({ droppedSuggestions: [], suggestions: 1, status: 'reviewing' });
    const moved = await call('kanvas_draft_read', { sessionId, displayId, compareToRevision: r0 });
    expect(moved.suggestions).toEqual([{ author: { id: owner.user!.id, name: owner.user!.displayName }, id, start: moved.text.indexOf('asap'), end: moved.text.indexOf('asap') + 4, original: 'asap', replacement: 'by Friday', reason: 'Concrete date' }]);
    expect(moved.diff).toMatchObject({ fromRevision: r0, toRevision: r0 + 2 }); expect(moved.diff.deleted).toBeGreaterThan(0); expect(moved.diff.inserted).toBeGreaterThan(0);
    const reviewed = await call('kanvas_draft_review', { sessionId, displayId, expectedRevision: r0 + 2, requestId: 'review-1', accept: [id], draftStatus: 'ready' });
    expect(reviewed.document).toMatchObject({ accepted: [id], rejected: [], remaining: 0, status: 'ready' });
    const final = await call('kanvas_draft_read', { sessionId, displayId });
    expect(final).toMatchObject({ revision: r0 + 3, status: 'ready', text: 'Hi all,\n\nPlease reply by Friday.\n\nThanks', suggestions: [] });
    expect(final.versions.map((version: { revision: number }) => version.revision)).toEqual(expect.arrayContaining([r0 + 1, r0 + 2, r0 + 3]));
  });

  it('drops suggestions an edit overlaps, rejects overlapping suggestions and requires a drafting display', async () => {
    const r0 = await publish(draft('One two three four'));
    await call('kanvas_draft_suggest', { sessionId, displayId, expectedRevision: r0, requestId: 's', suggestions: [{ id: 'two', find: 'two', replacement: '2' }, { id: 'four', find: 'four', replacement: '4' }] });
    await expect(call('kanvas_draft_suggest', { sessionId, displayId, expectedRevision: r0 + 1, requestId: 'overlap', suggestions: [{ find: 'two three', replacement: 'x' }] })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    const edited = await call('kanvas_draft_edit', { sessionId, displayId, expectedRevision: r0 + 1, requestId: 'e', edits: [{ op: 'find-replace', find: 'two', text: 'TWO!' }] });
    expect(edited.document.droppedSuggestions).toEqual(['two']);
    expect((await call('kanvas_draft_read', { sessionId, displayId })).suggestions).toEqual([{ author: { id: owner.user!.id, name: owner.user!.displayName }, id: 'four', start: 15, end: 19, original: 'four', replacement: '4' }]);
    const reviewed = await call('kanvas_draft_review', { sessionId, displayId, expectedRevision: r0 + 2, requestId: 'r', all: 'reject' });
    expect(reviewed.document).toMatchObject({ accepted: [], rejected: ['four'], remaining: 0 });
    await owner.submit(sessionId, [displayId], fact('Not a draft'));
    await expect(call('kanvas_draft_read', { sessionId, displayId })).rejects.toMatchObject({ code: 'INVALID_VIEW' });
  });
});
