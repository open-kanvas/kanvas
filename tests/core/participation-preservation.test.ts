import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DisplayRecord, InteractionRecord, UpdateRecord, ViewSpec } from '../../src/shared/types.js';
import { ControlledInterpreter, denied, fact, startHarness, success, type Browser, type Harness } from './harness.js';

type StoredDisplay = DisplayRecord & { interactionEpoch?: string; generation: number };
interface AudienceResponse { id: string; displayId: string; epoch: string; userId: string; kind: string; value: unknown }
const poll = (data: Record<string, unknown> = {}): ViewSpec => ({ version: 1, template: 'poll', data: {
  question: 'Which supplied option?', options: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }], ...data,
} });
const form = (): ViewSpec => ({ version: 1, template: 'form', data: { fields: [
  { id: 'name', type: 'text', label: 'Name', required: true, maxLength: 40 },
  { id: 'choice', type: 'choice', label: 'Choice', options: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }] },
] } });
const qa = (data: Record<string, unknown> = {}): ViewSpec => ({ version: 1, template: 'qa', data: { prompt: 'What should we discuss?', revealResults: false, ...data } });
const close = (view: ViewSpec): ViewSpec => ({ ...view, data: { ...view.data, closed: true, ...(view.template === 'form' ? {} : { revealResults: true }) } });
const formResponse = { kind: 'form.submit', values: { name: '  Exact supplied name  ', choice: 'b' } };
const qaResponse = { kind: 'qa.submit', text: 'Clear clear useful' };

describe('full publications preserve compatible, authoritative participation', () => {
  let h: Harness, interpreter: ControlledInterpreter, owner: Browser, viewer: Browser, sessionId: string, displayId: string;
  beforeEach(async () => {
    interpreter = new ControlledInterpreter(); h = await startHarness({ interpreter });
    owner = await h.account(); viewer = await h.account(); sessionId = (await owner.session('Participation regression fixtures')).id;
    displayId = (await owner.display(sessionId)).id;
    success(await owner.request('POST', `/api/sessions/${sessionId}/members`, { username: viewer.user!.username, role: 'viewer' }));
  });
  afterEach(async () => { interpreter?.releaseAll(); await h?.close(); });
  const path = () => `/api/sessions/${sessionId}/displays/${displayId}`;
  const current = async (browser = owner) => (await browser.detail(sessionId)).displays.find(display => display.id === displayId)!;
  const stored = async () => (await h.runtime.store.get<StoredDisplay>('display', displayId))!;
  const responses = async () => (await h.runtime.store.list<AudienceResponse>('audience-response', sessionId)).filter(row => row.displayId === displayId);
  const publish = async (view: ViewSpec, requestId = randomUUID(), expectedStatus: 'prepared'|'retained' = 'prepared') => {
    const result = await owner.submit(sessionId, [displayId], view, requestId);
    expect(result.update.status).toBe(expectedStatus);
    return result.detail.displays.find(display => display.id === displayId)!;
  };
  const respond = (browser: Browser, value: Record<string, unknown>, revision: number, requestId = randomUUID()) => browser.request<InteractionRecord>('POST', `${path()}/respond`, { value, revision, requestId });
  const edit = (data: Record<string, unknown>, expectedRevision: number) => owner.request<DisplayRecord>('PATCH', `${path()}/view`, { expectedRevision, data });

  it('requires a fresh paint acknowledgement after a compatible edit of an already applied poll', async () => {
    const initial = await publish(poll());
    success(await viewer.request('POST', `${path()}/applied`, { revision: initial.revision }));
    expect((await current()).delivery).toMatchObject({ status: 'applied', revision: initial.revision });
    const edited = success(await edit(close(initial.view!).data, initial.revision));
    expect(edited.delivery).toMatchObject({ status: 'pending', revision: edited.revision });
    expect(edited.appliedRevision).toBe(initial.revision);
    success(await viewer.request('POST', `${path()}/applied`, { revision: edited.revision }));
    expect((await current()).delivery).toMatchObject({ status: 'applied', revision: edited.revision });
  });

  it('keeps real ballots and retry identity through full close, reveal, reopen and reordered options', async () => {
    const initial = await publish(poll()), initialEpoch = (await stored()).interactionEpoch;
    const ballot = { kind: 'poll.vote', optionIds: ['a'] }, ballotRequest = randomUUID();
    const receipt = success(await respond(viewer, ballot, initial.revision, ballotRequest));
    success(await respond(owner, { kind: 'poll.vote', optionIds: ['b'] }, initial.revision));
    const beforeResponses = (await responses());
    expect((await current(viewer)).responseState?.poll).toEqual({ revealed: false, selectedOptionIds: ['a'] });

    const requestId = randomUUID(), closing = { ...close(poll()), title: 'Audience results', showTitle: true };
    const closed = await publish(closing, requestId);
    expect(closed.responseState?.poll).toEqual({ revealed: true, selectedOptionIds: ['b'], totalVotes: 2, counts: { a: 1, b: 1 } });
    expect((await current(viewer)).responseState?.poll?.selectedOptionIds).toEqual(['a']);
    expect((await stored()).interactionEpoch).toBe(initialEpoch);
    expect((await responses())).toEqual(beforeResponses);
    const retry = success(await owner.request<UpdateRecord>('POST', `/api/sessions/${sessionId}/submit`, { displayIds: [displayId], view: closing, requestId }));
    expect(retry.revisions[displayId]).toBe(closed.revision);
    expect((await current()).revision).toBe(closed.revision);
    expect(success(await respond(viewer, ballot, initial.revision, ballotRequest)).id).toBe(receipt.id);
    const closedVote = await respond(viewer, ballot, closed.revision);
    expect(closedVote.status).toBe(409); expect(closedVote.error?.code).toBe('RESPONSE_CLOSED');
    expect((await owner.request('POST', `/api/sessions/${sessionId}/submit`, { displayIds: [displayId], view: poll(), requestId })).error?.code).toBe('REQUEST_ID_CONFLICT');

    const reopened = await publish(poll({ revealResults: true, maxChoices: 1, options: [{ id: 'b', label: 'Beta' }, { id: 'a', label: 'Alpha' }] }));
    success(await respond(viewer, { kind: 'poll.vote', optionIds: ['b'] }, reopened.revision));
    const reordered = success(await edit(poll({ revealResults: true }).data, reopened.revision));
    expect(reordered.responseState?.poll).toEqual({ revealed: true, selectedOptionIds: ['b'], totalVotes: 2, counts: { a: 0, b: 2 } });
    expect((await stored()).interactionEpoch).toBe(initialEpoch);
    expect((await responses()).map(row => row.id).sort()).toEqual(beforeResponses.map(row => row.id).sort());
    expect(interpreter.calls).toHaveLength(0);
  });

  it.each([
    ['question', { question: 'A genuinely new question?' }],
    ['option meaning', { options: [{ id: 'a', label: 'A different meaning' }, { id: 'b', label: 'Beta' }] }],
    ['option ID', { options: [{ id: 'new-a', label: 'Alpha' }, { id: 'b', label: 'Beta' }] }],
    ['option set', { options: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }, { id: 'c', label: 'Gamma' }] }],
    ['choice constraint', { maxChoices: 2 }],
  ] as const)('starts a fresh round for a changed poll %s without deleting historical ballots', async (_name, change) => {
    const initial = await publish(poll({ revealResults: true })), epoch = (await stored()).interactionEpoch;
    const ballot = { kind: 'poll.vote', optionIds: ['b'] }, requestId = randomUUID();
    const receipt = success(await respond(viewer, ballot, initial.revision, requestId)), oldResponse = (await responses())[0];
    const changed = await publish(poll({ revealResults: true, ...change }));
    expect(changed.responseState?.poll?.totalVotes).toBe(0);
    expect((await current(viewer)).responseState?.poll).not.toHaveProperty('selectedOptionIds');
    expect((await stored()).interactionEpoch).not.toBe(epoch);
    expect((await responses())).toEqual([oldResponse]);
    // Replaying an old receipt is not a new ballot in the newly published round.
    expect(success(await respond(viewer, ballot, initial.revision, requestId)).id).toBe(receipt.id);
    expect((await current()).responseState?.poll?.totalVotes).toBe(0);
    success(await respond(viewer, ballot, changed.revision));
    expect((await current()).responseState?.poll).toMatchObject({ totalVotes: 1, counts: { b: 1 } });
    expect((await responses())).toHaveLength(2);
  });

  it('keeps private form answers through full supporting-copy and order changes, then validates resubmission', async () => {
    const initial = await publish(form()), epoch = (await stored()).interactionEpoch;
    success(await respond(viewer, formResponse, initial.revision));
    const beforeResponses = (await responses()), fields = initial.view!.data.fields as Record<string, unknown>[];
    const copied = close({ ...initial.view!, title: 'Form review', data: { ...initial.view!.data,
      description: 'Updated supporting copy', submitLabel: 'Send response',
      fields: [...fields].reverse().map(field => ({ ...field, help: 'Supporting help',
        ...(field.type === 'text' ? { placeholder: 'Your name' } : {}),
        ...(Array.isArray(field.options) ? { options: [...field.options].reverse() } : {}),
      })),
    } });
    const closed = await publish(copied);
    expect(closed.responseState?.form?.submitted).toBe(false);
    expect((await current(viewer)).responseState?.form?.submitted).toBe(true);
    expect((await responses())).toEqual(beforeResponses); expect((await stored()).interactionEpoch).toBe(epoch);
    const reopened = success(await edit(form().data, closed.revision));
    expect((await stored()).interactionEpoch).toBe(epoch);
    expect((await respond(viewer, { kind: 'form.submit', values: { name: ' ', choice: 'b' } }, reopened.revision)).status).toBe(400);
    expect((await responses())).toEqual(beforeResponses);
    success(await respond(viewer, { kind: 'form.submit', values: { name: 'Corrected exact name', choice: 'a' } }, reopened.revision));
    expect((await responses())).toHaveLength(1); expect((await responses())[0].id).toBe(beforeResponses[0].id);
    expect((await responses())[0].value).toEqual({ name: 'Corrected exact name', choice: 'a' });
  });

  it.each(['questions', 'word-cloud'] as const)('keeps real %s entries and request dedupe through full close/reveal', async mode => {
    const initial = await publish(qa({ mode })), epoch = (await stored()).interactionEpoch, requestId = randomUUID();
    const receipt = success(await respond(viewer, qaResponse, initial.revision, requestId)), beforeResponses = (await responses());
    expect((await current(viewer)).responseState?.qa).toEqual({ revealed: false, submitted: true });
    await publish(close(qa({ mode })));
    const revealed = (await current(viewer)).responseState?.qa;
    expect(revealed).toMatchObject({ revealed: true, submitted: true });
    expect(revealed?.entries).toEqual(mode === 'questions' ? [{ id: beforeResponses[0].id, text: qaResponse.text }] : [
      { id: expect.any(String), text: 'clear', count: 2 }, { id: expect.any(String), text: 'useful', count: 1 },
    ]);
    expect(success(await respond(viewer, qaResponse, initial.revision, requestId)).id).toBe(receipt.id);
    expect((await responses())).toEqual(beforeResponses); expect((await stored()).interactionEpoch).toBe(epoch);
  });

  it.each([
    { name: 'form field meaning', view: form, value: formResponse, change: (view: ViewSpec) => ({ ...view.data, fields: (view.data.fields as Record<string, unknown>[]).map(field => field.id === 'name' ? { ...field, label: 'A different question' } : field) }) },
    { name: 'form field constraint', view: form, value: formResponse, change: (view: ViewSpec) => ({ ...view.data, fields: (view.data.fields as Record<string, unknown>[]).map(field => field.id === 'name' ? { ...field, maxLength: 80 } : field) }) },
    { name: 'QA prompt', view: qa, value: qaResponse, change: (view: ViewSpec) => ({ ...view.data, prompt: 'An intentionally new audience prompt' }) },
    { name: 'QA mode', view: qa, value: qaResponse, change: (view: ViewSpec) => ({ ...view.data, mode: 'word-cloud' }) },
  ])('starts a fresh participation instance for changed $name', async ({ view, value, change }) => {
    const initial = await publish(view()), epoch = (await stored()).interactionEpoch;
    success(await respond(viewer, value, initial.revision)); const original = (await responses())[0];
    const updated = await publish({ ...initial.view!, data: change(initial.view!) });
    const state = (await current(viewer)).responseState!;
    expect(state.form?.submitted ?? state.qa?.submitted).toBe(false);
    expect((await stored()).interactionEpoch).not.toBe(epoch); expect((await responses())).toEqual([original]);
    success(await respond(viewer, value, updated.revision));
    expect((await responses())).toHaveLength(2);
  });

  it.each([
    { name: 'poll', view: poll, value: { kind: 'poll.vote', optionIds: ['a'] }, invalid: { question: 'Invalid options', options: [{ id: 'a', label: 'A' }, { id: 'a', label: 'Duplicate' }] } },
    { name: 'form', view: form, value: formResponse, invalid: { fields: [{ id: 'name', type: 'range', label: 'Invalid bounds', min: 10, max: 0 }] } },
    { name: 'QA', view: qa, value: qaResponse, invalid: { prompt: '' } },
  ])('does not lose $name participation to invalid full views, shared edits or generated results', async ({ view, value, invalid }) => {
    const initial = await publish(view()); success(await respond(viewer, value, initial.revision));
    const before = (await stored()), beforeResponses = (await responses()), history = (await h.runtime.store.list('display-history', sessionId));
    const invalidView = { ...initial.view!, data: invalid };
    const failedSubmit = await owner.request('POST', `/api/sessions/${sessionId}/submit`, { displayIds: [displayId], view: invalidView, requestId: randomUUID() });
    expect(failedSubmit.status).toBe(400);
    expect((await edit(invalid, initial.revision)).status).toBe(400);
    expect((await stored())).toEqual(before); expect((await responses())).toEqual(beforeResponses);
    success(await owner.request('POST', `/api/sessions/${sessionId}/submit`, { displayIds: [displayId], context: 'Invalid generated participation fixture', requestId: 'invalid-generated' }));
    await interpreter.waitFor(1); interpreter.calls[0].resolve({ action: 'replace', view: invalidView });
    expect((await owner.settle(sessionId, 'invalid-generated')).update.status).toBe('failed');
    expect((await stored())).toMatchObject({ view: before.view, revision: before.revision, interactionEpoch: before.interactionEpoch });
    expect((await responses())).toEqual(beforeResponses); expect((await h.runtime.store.list('display-history', sessionId))).toEqual(history);
    await publish(close(initial.view!));
    expect((await stored()).interactionEpoch).toBe(before.interactionEpoch); expect((await responses())).toEqual(beforeResponses);
    const state = (await current(viewer)).responseState!;
    expect(state.poll?.totalVotes ?? Number(state.form?.submitted ?? state.qa?.submitted)).toBe(1);
  });

  it('preserves slide-scoped votes and QA while full submissions change navigation and nonparticipation copy', async () => {
    const slides = [poll({ revealResults: true }), qa(), fact('Original supporting slide')];
    const initial = await publish({ version: 1, template: 'presentation', data: { slides, index: 0 } }), epoch = (await stored()).interactionEpoch;
    success(await respond(viewer, { kind: 'poll.vote', optionIds: ['b'] }, initial.revision));
    const moved = await publish({ version: 1, template: 'presentation', title: 'Same questions', data: { slides: [close(slides[0]), slides[1], fact('Changed supporting slide')], index: 1 } });
    success(await respond(viewer, qaResponse, moved.revision));
    const beforeResponses = (await responses());
    const returned = await publish({ ...moved.view!, data: { ...moved.view!.data, index: 0 } });
    expect(returned.responseState?.poll).toMatchObject({ revealed: true, totalVotes: 1, counts: { a: 0, b: 1 } });
    expect((await current(viewer)).responseState?.poll?.selectedOptionIds).toEqual(['b']);
    const changedSlides = [...(returned.view!.data.slides as ViewSpec[])]; changedSlides[1] = close(changedSlides[1]);
    await publish({ ...returned.view!, data: { slides: changedSlides, index: 1 } });
    expect((await current(viewer)).responseState?.qa).toMatchObject({ submitted: true, entries: [{ text: qaResponse.text }] });
    expect((await stored()).interactionEpoch).toBe(epoch); expect((await responses())).toEqual(beforeResponses);
  });

  it('still rejects fabricated totals, inaccessible assets and viewer publication without changing ballots', async () => {
    const initial = await publish(poll({ revealResults: true })); success(await respond(viewer, { kind: 'poll.vote', optionIds: ['a'] }, initial.revision));
    const before = (await stored()), beforeResponses = (await responses());
    const submit = (browser: Browser, view: ViewSpec) => browser.request('POST', `/api/sessions/${sessionId}/submit`, { displayIds: [displayId], view, requestId: randomUUID() });
    expect((await submit(owner, poll({ counts: { a: 500 }, totalVotes: 500 }))).status).toBe(400);
    const inaccessible: ViewSpec = { version: 1, template: 'presentation', data: { slides: [close(initial.view!), { version: 1, template: 'image', data: { images: [{ url: '/api/assets/unavailable-fixture-asset' }] } }] } };
    denied(await submit(owner, inaccessible), [404]);
    denied(await submit(viewer, close(initial.view!)));
    denied(await viewer.request('PATCH', `${path()}/view`, { expectedRevision: initial.revision, data: close(initial.view!).data }));
    expect((await stored())).toEqual(before); expect((await responses())).toEqual(beforeResponses);
    expect((await current()).responseState?.poll).toMatchObject({ totalVotes: 1, counts: { a: 1, b: 0 } });
  });

  it.each([false, true])('ignores a delayed publication after newer intent (late new question: %s)', async lateNewQuestion => {
    const initial = await publish(poll({ revealResults: true })); success(await respond(viewer, { kind: 'poll.vote', optionIds: ['a'] }, initial.revision));
    const initialEpoch = (await stored()).interactionEpoch;
    success(await owner.request('POST', `/api/sessions/${sessionId}/submit`, { displayIds: [displayId], context: 'Delayed fixture publication', requestId: 'slow-publication' }));
    await interpreter.waitFor(1);
    const newerView = lateNewQuestion ? poll({ revealResults: true }) : poll({ question: 'The newer intentional question', revealResults: true });
    const newer = await publish(newerView, undefined, lateNewQuestion ? 'retained' : 'prepared');
    expect(newer.responseState?.poll?.totalVotes).toBe(lateNewQuestion ? 1 : 0);
    if (lateNewQuestion) expect((await stored()).interactionEpoch).toBe(initialEpoch);
    else expect((await stored()).interactionEpoch).not.toBe(initialEpoch);
    success(await respond(viewer, { kind: 'poll.vote', optionIds: ['b'] }, newer.revision));
    const beforeLate = (await stored()), beforeResponses = (await responses());
    interpreter.calls[0].resolve({ action: 'replace', view: lateNewQuestion ? poll({ question: 'An older new question' }) : close(initial.view!) });
    expect((await owner.settle(sessionId, 'slow-publication')).update.status).toBe('superseded');
    expect((await stored())).toEqual(beforeLate); expect((await responses())).toEqual(beforeResponses);
    const closed = await publish(close(newerView));
    expect(closed.responseState?.poll).toMatchObject({ totalVotes: 1, counts: { a: 0, b: 1 } });
    expect((await stored()).interactionEpoch).toBe(beforeLate.interactionEpoch);
  });

  it('accepts one concurrent identity edit and never lets a stale close overwrite the winner', async () => {
    const initial = await publish(poll({ revealResults: true })); success(await respond(viewer, { kind: 'poll.vote', optionIds: ['a'] }, initial.revision));
    const edits = await Promise.all(['First candidate question', 'Second candidate question'].map(question => edit({ ...initial.view!.data, question }, initial.revision)));
    expect(edits.filter(result => result.status === 200)).toHaveLength(1);
    expect(edits.filter(result => result.status === 409)).toHaveLength(1);
    const winner = success(edits.find(result => result.status === 200)!);
    expect(winner.responseState?.poll?.totalVotes).toBe(0);
    success(await respond(viewer, { kind: 'poll.vote', optionIds: ['b'] }, winner.revision));
    const beforeStale = (await stored()), beforeResponses = (await responses());
    expect((await edit(close(initial.view!).data, initial.revision)).error?.code).toBe('REVISION_CONFLICT');
    expect((await stored())).toEqual(beforeStale); expect((await responses())).toEqual(beforeResponses);
    const closed = await publish(close(winner.view!));
    expect(closed.responseState?.poll).toMatchObject({ totalVotes: 1, counts: { a: 0, b: 1 } });
    expect((await stored()).interactionEpoch).toBe(beforeStale.interactionEpoch);
  });
});
