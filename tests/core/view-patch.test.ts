import { testDatabase } from '../postgres.js';
import { randomUUID, createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthPrincipal } from '../../src/server/auth.js';
import { DisplayHistory } from '../../src/server/display-history.js';
import { Engagement } from '../../src/server/engagement.js';
import { materializeDatasetView } from '../../src/server/rendering/datasets.js';
import { AppError, Store } from '../../src/server/store.js';
import { ViewPatches, type ViewPatchDisplay, type ViewPatchHost } from '../../src/server/view-patch.js';
import type { DatasetRecord, UpdateRecord, ViewSpec } from '../../src/shared/types.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { VIEW_PATCH_LIMITS, viewPatchSchema, type ViewPatchInput, type ViewPatchOperation } from '../../src/shared/view-patch.js';

const owner: AuthPrincipal = { userId: 'patch-owner', agentId: 'patch-agent' };
const other: AuthPrincipal = { userId: 'other-editor' };
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const digest = (value: unknown): string => createHash('sha256').update(canonical(value)).digest('hex');
const identity = (principal: AuthPrincipal): string => principal.tokenId ? `token:${principal.tokenId}` : `user:${principal.participantId ?? principal.userId}`;

const transcript = (): ViewSpec => ({
  version: 1, template: 'transcription', title: 'Live notes', showTitle: false,
  data: { segments: [{ id: 'current', text: 'Draft', speaker: 'Speaker A', timestamp: '00:10' }, { id: 'retained', text: 'Earlier note' }], status: 'live', language: 'en' },
  source: { title: 'Supplied notes', url: 'https://example.com/notes', locator: 'Section 1' },
  actions: [{ id: 'next', label: 'Continue', kind: 'button' }],
});
const poll = (): ViewSpec => ({ version: 1, template: 'poll', data: { question: 'Which supplied option?', options: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }] } });
const form = (): ViewSpec => ({ version: 1, template: 'form', data: { description: 'Optional supporting copy', fields: [{ id: 'name', label: 'Name', type: 'text', required: true }, { id: 'choice', label: 'Choice', type: 'choice', options: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }] }] } });
const qa = (): ViewSpec => ({ version: 1, template: 'qa', data: { prompt: 'What should we discuss?', revealResults: false } });

/** Real isolated PostgreSQL/history/participation; no HTTP, live DB or interpreter. */
class Fixture {
  readonly store = new Store(testDatabase());
  readonly history = new DisplayHistory(this.store);
  readonly engagement = new Engagement(this.store);
  readonly editors = new Set([owner.userId, other.userId]);
  failPublication = false;
  readonly verify = vi.fn(async (_principal: AuthPrincipal, sessionId: string, view: ViewSpec): Promise<Awaited<ViewSpec>> => materializeDatasetView(validateView(view), (await this.store.list<DatasetRecord>('dataset', sessionId))));
  readonly publish = vi.fn(async (principal: AuthPrincipal, input: ViewPatchInput, before: ViewPatchDisplay, view: ViewSpec): Promise<Awaited<UpdateRecord>> => {
    const current = (await this.read(before.id));
    if (current.revision !== before.revision || current.generation !== before.generation) throw new AppError('REVISION_CONFLICT', 'Changed.', 409);
    (await this.history.ensure(before));
    const stamp = new Date().toISOString(), revision = before.revision + 1;
    const next: ViewPatchDisplay = { ...current, view, revision, generation: before.generation + 1, updatedAt: stamp, delivery: { revision, status: 'pending', updatedAt: stamp } };
    const update: UpdateRecord = { id: randomUUID(), sessionId: input.sessionId, requestId: input.requestId, status: 'prepared', displayIds: [input.displayId], revisions: { [input.displayId]: revision }, createdAt: stamp, completedAt: stamp, metrics: { path: 'direct' } };
    (await this.store.put('display', next)); (await this.history.record(next, 'patch')); (await this.store.put('update', update));
    (await this.store.db.prepare('INSERT INTO requests VALUES(?,?,?,?,?,?)').run(input.sessionId, identity(principal), input.requestId, digest(input), update.id, 'patch'));
    if (this.failPublication) throw new Error('Injected persistence failure');
    return update;
  });
  readonly host: ViewPatchHost = {
    transaction: async operation => (await this.store.transaction(operation)),
    display: async (principal, sessionId, displayId) => {
      if (!this.editors.has(principal.userId) || principal.scopedSessionId || principal.scopedDisplayId) throw new AppError('FORBIDDEN', 'Editor access required.', 403);
      const display = (await this.store.get<ViewPatchDisplay>('display', displayId));
      if (!display || display.sessionId !== sessionId) throw new AppError('NOT_FOUND', 'Unavailable.', 404);
      return display;
    },
    retry: async (principal, input) => {
      const prior = (await this.store.db.prepare('SELECT digest,result_id,kind FROM requests WHERE session_id=? AND principal=? AND request_id=?').get(input.sessionId, identity(principal), input.requestId));
      if (!prior) return;
      if (prior.kind !== 'patch' || prior.digest !== digest(input)) throw new AppError('REQUEST_ID_CONFLICT', 'Different content.', 409);
      return (await this.store.get<UpdateRecord>('update', String(prior.result_id)));
    },
    verifyView: (...args) => this.verify(...args),
    publish: (...args) => this.publish(...args),
  };
  engine = new ViewPatches(this.host);

  async seed(view: ViewSpec | null = transcript(), displayId = 'display', sessionId = 'session'): Promise<Awaited<ViewPatchDisplay>> {
    const display: ViewPatchDisplay = {
      id: displayId, sessionId, name: 'Patch fixture', width: 1200, height: 800, pixelRatio: 1,
      viewportRevision: 3, revision: 4, generation: 7, interactionEpoch: `epoch:${displayId}`, targetAgentId: 'original-agent',
      held: false, online: true, appliedRevision: 4, updatedAt: '2026-09-14T00:00:00.000Z',
      view: view ? materializeDatasetView(validateView(view), (await this.store.list<DatasetRecord>('dataset', sessionId))) : null,
    };
    (await this.store.put('display', display)); return display;
  }
  async read(displayId = 'display'): Promise<Awaited<ViewPatchDisplay>> { return (await this.store.get<ViewPatchDisplay>('display', displayId))!; }
  async request(operations: ViewPatchOperation[], changes: Partial<ViewPatchInput> = {}): Promise<Awaited<ViewPatchInput>> {
    return { sessionId: 'session', displayId: 'display', requestId: randomUUID(), expectedRevision: (await this.read()).revision, operations, ...changes };
  }
  async patch(operations: ViewPatchOperation[], changes: Partial<ViewPatchInput> = {}): Promise<Awaited<UpdateRecord>> { return (await this.engine.patch(owner, (await this.request(operations, changes)))); }
  async requestCount(): Promise<Awaited<number>> { return Number((await this.store.db.prepare('SELECT count(*) AS n FROM requests').get())!.n); }
}

async function errorCode(run: () => Promise<Awaited<unknown>>, code: string): Promise<Awaited<void>> {
  try { (await run()); throw new Error('Expected rejection'); }
  catch (error) { expect(error).toMatchObject({ code }); }
}

describe('revision-bound partial view patches', () => {
  let f: Fixture;
  beforeEach(async () => { f = new Fixture(); (await f.seed()); });
  afterEach(async () => { (await f.store.close()); });

  it('progresses timeline stable IDs atomically with retained visuals, retries, history and CAS',async()=>{
    const events=[{id:'testing',title:'User testing',start:'2026-03-01',visual:{kind:'image',url:'https://example.com/testing.png',alt:'Testing'}},{id:'prototype',title:'Prototype',start:'2026-02-01',visual:{kind:'image',url:'https://example.com/prototype.png',alt:'Prototype'}}];
    await f.seed({version:1,template:'timeline',data:{events}});
    const request=await f.request([{op:'timeline',action:'select',eventId:'prototype'}]);
    const first=await f.engine.patch(owner,request);expect(await f.engine.patch(owner,request)).toEqual(first);
    expect((await f.read()).view!.data.activeEventId).toBe('prototype');
    await f.patch([{op:'timeline',action:'next'}]);const after=await f.read();expect(after.view!.data.activeEventId).toBe('testing');expect(after.view!.data.events).toEqual(events);
    expect((await f.history.list(after)).entries.map(e=>e.reason)).toEqual(['initial','patch','patch']);
    await errorCode(()=>f.engine.patch(owner,{...request,requestId:'timeline-stale'}),'REVISION_CONFLICT');
    await errorCode(()=>f.patch([{op:'timeline',action:'previous'},{op:'timeline',action:'select',eventId:'missing'}]),'PATCH_PATH_CONFLICT');expect(await f.read()).toEqual(after);
    await errorCode(async()=>f.engine.patch({userId:'stranger'},await f.request([{op:'timeline',action:'next'}])),'FORBIDDEN');
    await f.patch([{op:'timeline',action:'next'}]);expect((await f.read()).view!.data.activeEventId).toBe('testing');
    await f.patch([{op:'timeline',action:'clear'},{op:'timeline',action:'previous'}]);expect((await f.read()).view!.data.activeEventId).toBe('testing');
    await f.patch([{op:'timeline',action:'previous'},{op:'timeline',action:'previous'}]);expect((await f.read()).view!.data.activeEventId).toBe('prototype');
    await f.patch([{op:'timeline',action:'clear'}]);expect((await f.read()).view!.data.activeEventId).toBeUndefined();
    await f.patch([{op:'timeline',action:'next'}]);expect((await f.read()).view!.data.activeEventId).toBe('prototype');
    await errorCode(()=>f.patch([{op:'timeline',action:'next',eventId:'prototype'}]),'PATCH_UNSUPPORTED');
    await expect(f.patch([{op:'set',path:'/data/activeEventId',value:'missing'}])).rejects.toThrow();
  });

  it('instrument batches and schedules use ordinary authorization, retries and atomic revision checks',async()=>{
    await f.seed({version:1,template:'instrument',data:{config:{family:'keyboard',firstMidi:60,lastMidi:83}}});
    const request=await f.request([{op:'instrument',changes:[{id:'key:60',value:{highlight:true}}]}]);
    const result=await f.engine.patch(owner,request);expect(await f.engine.patch(owner,request)).toEqual(result);
    const before=await f.read();await errorCode(()=>f.patch([{op:'instrument',changes:[{id:'key:61',value:{highlight:true}},{id:'key:59',value:{highlight:true}}]}]),'PATCH_UNSUPPORTED');expect(await f.read()).toEqual(before);
    await f.patch([{op:'instrument-sequence',action:'replace',frames:[{id:'one',durationMs:1000,elements:{'key:64':{highlight:true}}}]},{op:'instrument-sequence',action:'resume'}]);expect((await f.read()).view!.data.playback).toMatchObject({state:'playing'});
  });

  it('caption sequences retain CAS, durable retry, and atomic validation',async()=>{
    await f.seed({version:1,template:'live-captions',data:{chunks:[{id:'a',text:'First',durationMs:1000}]}});
    const input=await f.request([{op:'sequence',action:'append',chunks:[{id:'b',text:'Second',durationMs:1000}]}]);
    const result=await f.engine.patch(owner,input);expect(await f.engine.patch(owner,input)).toEqual(result);
    expect((await f.read()).view!.data.chunks).toHaveLength(2);
    await errorCode(()=>f.engine.patch(owner,{...input,requestId:randomUUID()}),'REVISION_CONFLICT');
    const before=await f.read();await errorCode(()=>f.patch([{op:'sequence',action:'clear'},{op:'sequence',action:'seek',positionMs:5}]),'PATCH_UNSUPPORTED');expect(await f.read()).toEqual(before);
    await errorCode(()=>f.engine.patch({userId:'outsider'},input),'FORBIDDEN');
  });

  it('patches roster assignments atomically by semantic identity and preserves unrelated data',async()=>{
    await f.seed({version:1,template:'roster',data:{start:'2026-10-01',end:'2026-10-02',people:[{id:'a',name:'A'},{id:'b',name:'B'}],shifts:[{id:'d',label:'Day'},{id:'v',label:'Vacation'}],assignments:[{date:'2026-10-01',person:'a',shift:'d'},{date:'2026-10-01',person:'b',shift:'d',note:'Untouched'}]}});
    const request=await f.request([{op:'roster',action:'remove',date:'2026-10-01',person:'a',shift:'d'},{op:'roster',action:'add',date:'2026-10-01',person:'a',shift:'v',value:{note:'Leave'}}]);
    const first=await f.engine.patch(owner,request);expect(await f.engine.patch(owner,request)).toEqual(first);
    expect((await f.read()).view!.data.assignments).toEqual([{date:'2026-10-01',person:'b',shift:'d',note:'Untouched'},{date:'2026-10-01',person:'a',shift:'v',note:'Leave'}]);
    await f.patch([{op:'roster',action:'update',date:'2026-10-01',person:'a',shift:'v',value:{note:null,code:'V'}}]);
    const before=await f.read();await errorCode(()=>f.patch([{op:'roster',action:'remove',date:'2026-10-01',person:'a',shift:'v'},{op:'roster',action:'update',date:'2026-10-02',person:'a',shift:'d',value:{note:'Missing'}}]),'PATCH_PATH_CONFLICT');expect(await f.read()).toEqual(before);
    await expect(f.patch([{op:'roster',action:'add',date:'2026-10-02',person:'missing',shift:'d'}])).rejects.toThrow();expect(await f.read()).toEqual(before);
    await errorCode(()=>f.engine.patch(owner,{...request,requestId:'stale-roster'}),'REVISION_CONFLICT');
  });

  it('patches checklist IDs atomically, retains siblings, deduplicates retries and enforces CAS', async()=>{
    await f.seed({version:1,template:'checklist',data:{items:[{id:'a',text:'Exact A',detail:'Keep A'},{id:'b',text:'Exact B',checked:true}]}});
    const request=await f.request([{op:'checklist',action:'update',itemId:'a',value:{checked:true}},{op:'checklist',action:'add',itemId:'c',value:{text:'New C'},beforeId:'b'}]);
    const first=await f.engine.patch(owner,request);expect(await f.engine.patch(owner,request)).toEqual(first);
    expect((await f.read()).view!.data.items).toEqual([{id:'a',text:'Exact A',detail:'Keep A',checked:true},{id:'c',text:'New C',checked:false},{id:'b',text:'Exact B',checked:true}]);
    await errorCode(()=>f.engine.patch(owner,{...request,requestId:'stale'}),'REVISION_CONFLICT');
    await f.patch([{op:'checklist',action:'move',itemId:'b',beforeId:'a'},{op:'checklist',action:'remove',itemId:'c'},{op:'checklist',action:'update',itemId:'a',value:{text:'Edited A',detail:null,checked:false}}]);
    expect((await f.read()).view!.data.items).toEqual([{id:'b',text:'Exact B',checked:true},{id:'a',text:'Edited A',checked:false}]);
    const before=await f.read();
    await errorCode(()=>f.patch([{op:'checklist',action:'remove',itemId:'b'},{op:'checklist',action:'update',itemId:'missing',value:{checked:true}}]),'PATCH_PATH_CONFLICT');expect(await f.read()).toEqual(before);
    await errorCode(()=>f.patch([{op:'checklist',action:'add',itemId:'a',value:{text:'Duplicate'}}]),'PATCH_PATH_CONFLICT');
    await f.patch([{op:'checklist',action:'remove',itemId:'b'},{op:'checklist',action:'remove',itemId:'a'}]);expect((await f.read()).view!.data.items).toEqual([]);
    await f.seed(transcript());await errorCode(()=>f.patch([{op:'checklist',action:'remove',itemId:'a'}]),'PATCH_UNSUPPORTED');
  });

  it('applies exact draft text edits in order, retaining the view identity, metadata, siblings and publication history', async () => {
    const before = (await f.read());
    const update = (await f.patch([
      { op: 'appendText', path: '/data/segments/0/text', value: ' appended' },
      { op: 'set', path: '/data/segments/0/text', value: 'Final' },
      { op: 'appendText', path: '/data/segments/0/text', value: ' draft\nwith a new line' },
      { op: 'set', path: '/data/status', value: 'complete' },
    ]));
    const after = (await f.read());
    expect(after.view).toEqual({ ...before.view, data: { ...before.view!.data, status: 'complete', segments: [{ id: 'current', text: 'Final draft\nwith a new line', speaker: 'Speaker A', timestamp: '00:10' }, { id: 'retained', text: 'Earlier note' }] } });
    expect(after).toMatchObject({ interactionEpoch: before.interactionEpoch, targetAgentId: before.targetAgentId, viewportRevision: 3, revision: 5, generation: 8, appliedRevision: 4, delivery: { revision: 5, status: 'pending' } });
    expect(update).toMatchObject({ status: 'prepared', revisions: { display: 5 }, metrics: { path: 'direct' } });
    expect((await f.history.list(after)).entries.map(entry => [entry.revision, entry.reason])).toEqual([[4, 'initial'], [5, 'patch']]);
    expect(f.verify).toHaveBeenCalledTimes(1);
    expect((before.view!.data.segments as { text: string }[])[0].text).toBe('Draft');
  });

  it('sets an absent optional countdown field and removes it without recreating the timer', async () => {
    const before = (await f.seed({ version: 1, template: 'countdown', data: { endsAt: '2099-01-01T12:00:00Z', label: 'Temporary label', completeText: 'Done' } }));
    (await f.patch([{ op: 'set', path: '/data/pausedRemainingSeconds', value: 12.25 }, { op: 'remove', path: '/data/label' }]));
    expect((await f.read()).view!.data).toMatchObject({ endsAt: before.view!.data.endsAt, completeText: 'Done', pausedRemainingSeconds: 12.25 });
    expect((await f.read()).view!.data).not.toHaveProperty('label');
    (await f.patch([{ op: 'remove', path: '/data/pausedRemainingSeconds' }, { op: 'set', path: '/data/endsAt', value: '2099-01-01T12:01:00Z' }]));
    expect((await f.read()).view!.data).not.toHaveProperty('pausedRemainingSeconds');
    expect((await f.read()).interactionEpoch).toBe(before.interactionEpoch);
  });

  it('replays a durable request after later edits/reconstruction without appending or publishing twice', async () => {
    const request = (await f.request([{ op: 'appendText', path: '/data/segments/0/text', value: ' once' }], { requestId: 'durable-append' }));
    const first = (await f.engine.patch(owner, request));
    (await f.patch([{ op: 'appendText', path: '/data/segments/0/text', value: ' later' }]));
    f.engine = new ViewPatches(f.host);
    const replay = (await f.engine.patch(owner, { operations: request.operations, expectedRevision: request.expectedRevision, requestId: request.requestId, displayId: request.displayId, sessionId: request.sessionId }));
    expect(replay).toEqual(first);
    expect(((await f.read()).view!.data.segments as { text: string }[])[0].text).toBe('Draft once later');
    expect(f.publish).toHaveBeenCalledTimes(2);
    expect((await f.requestCount())).toBe(2);
    (await errorCode(async () => (await f.engine.patch(owner, { ...request, operations: [{ op: 'appendText', path: '/data/segments/0/text', value: 'different' }] })), 'REQUEST_ID_CONFLICT'));
    expect(f.publish).toHaveBeenCalledTimes(2);
  });

  it('namespaces retries by principal/session and requires current editor access even for an exact retry', async () => {
    const first = (await f.request([{ op: 'set', path: '/data/status', value: 'complete' }], { requestId: 'shared-key' }));
    (await f.engine.patch(owner, first));
    const second = (await f.engine.patch(other, { ...first, expectedRevision: (await f.read()).revision }));
    expect(second.revisions.display).toBe(6);
    (await f.seed(transcript(), 'second', 'second-session'));
    (await f.engine.patch(owner, { ...first, sessionId: 'second-session', displayId: 'second' }));
    f.editors.delete(owner.userId);
    (await errorCode(async () => (await f.engine.patch(owner, first)), 'FORBIDDEN'));
    expect((await f.requestCount())).toBe(3);
    (await errorCode(async () => (await f.engine.patch({ ...other, scopedSessionId: 'session' }, first)), 'FORBIDDEN'));
    (await errorCode(async () => (await f.engine.patch(other, { ...first, requestId: 'wrong-session', sessionId: 'second-session' })), 'NOT_FOUND'));
  });

  it('rejects a stale multi-operation patch atomically before source validation or any publication', async () => {
    const request = (await f.request([{ op: 'appendText', path: '/data/segments/0/text', value: ' obsolete' }, { op: 'set', path: '/data/status', value: 'complete' }]));
    (await f.patch([{ op: 'appendText', path: '/data/segments/0/text', value: ' newer' }]));
    const latest = (await f.read()); f.verify.mockClear(); f.publish.mockClear();
    (await errorCode(async () => (await f.engine.patch(owner, request)), 'REVISION_CONFLICT'));
    expect((await f.read())).toEqual(latest);
    expect(f.verify).not.toHaveBeenCalled(); expect(f.publish).not.toHaveBeenCalled();
    expect((await f.requestCount())).toBe(1);
  });

  it('rolls back every operation, history and dedupe on bad paths, invalid final state or a failing publisher', async () => {
    const before = (await f.read());
    (await errorCode(async () => (await f.patch([{ op: 'appendText', path: '/data/segments/0/text', value: ' lost' }, { op: 'remove', path: '/data/absent' }])), 'PATCH_PATH_CONFLICT'));
    (await errorCode(async () => (await f.patch([{ op: 'appendText', path: '/data/segments/0/text', value: ' lost' }, { op: 'set', path: '/data/status', value: 'invalid-status' }])), 'INVALID_ARGUMENT'));
    f.failPublication = true;
    const request = (await f.request([{ op: 'appendText', path: '/data/segments/0/text', value: ' once' }]));
    (await expect((async () => (await f.engine.patch(owner, request)))()).rejects.toThrow('Injected persistence failure'));
    expect((await f.read())).toEqual(before);
    expect((await f.store.list('display-history'))).toEqual([]); expect((await f.store.list('update'))).toEqual([]); expect((await f.requestCount())).toBe(0);
    f.failPublication = false;
    (await f.engine.patch(owner, request));
    expect(((await f.read()).view!.data.segments as { text: string }[])[0].text).toBe('Draft once');
  });

  it('validates the final candidate, allowing an atomic interval edit with an invalid intermediate state', async () => {
    (await f.seed({ version: 1, template: 'video', data: { url: 'https://example.com/video.mp4', start: 10, end: 20 } }));
    (await f.patch([{ op: 'set', path: '/data/start', value: 30 }, { op: 'set', path: '/data/end', value: 40 }]));
    expect((await f.read()).view!.data).toMatchObject({ start: 30, end: 40 });
    const before = (await f.read());
    (await errorCode(async () => (await f.patch([{ op: 'set', path: '/data/start', value: 50 }])), 'INVALID_ARGUMENT'));
    expect((await f.read())).toEqual(before);
  });

  it('preserves actual poll votes when closing/revealing/reordering stable options', async () => {
    const before = (await f.seed(poll()));
    (await f.engagement.submit(before, 'voter-1', { kind: 'poll.vote', optionIds: ['b'] }));
    (await f.engagement.submit(before, 'voter-2', { kind: 'poll.vote', optionIds: ['a'] }));
    const records = (await f.store.list('audience-response'));
    (await f.patch([{ op: 'set', path: '/data/closed', value: true }, { op: 'set', path: '/data/revealResults', value: true }, { op: 'set', path: '/data/options', value: [{ id: 'b', label: 'Beta' }, { id: 'a', label: 'Alpha' }] }]));
    expect((await f.engagement.projection((await f.read()), 'voter-1'))).toEqual({ poll: { revealed: true, selectedOptionIds: ['b'], totalVotes: 2, counts: { b: 1, a: 1 } } });
    expect((await f.store.list('audience-response'))).toEqual(records);
    expect((await f.read()).interactionEpoch).toBe(before.interactionEpoch);
  });

  it('preserves form submissions across close/copy changes without accepting changed field meanings', async () => {
    const before = (await f.seed(form()));
    (await f.engagement.submit(before, 'participant', { kind: 'form.submit', values: { name: 'A supplied name', choice: 'b' } }));
    const records = (await f.store.list('audience-response'));
    (await f.patch([{ op: 'set', path: '/data/closed', value: true }, { op: 'set', path: '/data/description', value: 'Responses are now closed.' }, { op: 'set', path: '/data/fields/0/placeholder', value: 'Your name' }]));
    expect((await f.engagement.projection((await f.read()), 'participant'))).toEqual({ form: { submitted: true } });
    expect((await f.store.list('audience-response'))).toEqual(records);
    for (const operation of [
      { op: 'set', path: '/data/fields/0/id', value: 'different-id' },
      { op: 'set', path: '/data/fields/0/label', value: 'A different question' },
      { op: 'set', path: '/data/fields/0/maxLength', value: 100 },
      { op: 'set', path: '/data/fields/1/options/0/label', value: 'Different option' },
    ] as ViewPatchOperation[]) (await errorCode(async () => (await f.patch([operation])), 'PATCH_PARTICIPATION_CONFLICT'));
    expect((await f.store.list('audience-response'))).toEqual(records);
  });

  it('preserves QA responses and reveal state while rejecting a different response prompt/mode', async () => {
    const before = (await f.seed(qa()));
    (await f.engagement.submit(before, 'participant', { kind: 'qa.submit', text: 'The exact supplied question.' }));
    const rows = (await f.store.list<{ id: string }>('audience-response'));
    (await f.patch([{ op: 'set', path: '/data/closed', value: true }, { op: 'set', path: '/data/revealResults', value: true }]));
    expect((await f.engagement.projection((await f.read()), 'participant'))).toEqual({ qa: { revealed: true, submitted: true, entries: [{ id: rows[0].id, text: 'The exact supplied question.' }] } });
    (await errorCode(async () => (await f.patch([{ op: 'set', path: '/data/prompt', value: 'A different question' }])), 'PATCH_PARTICIPATION_CONFLICT'));
    (await errorCode(async () => (await f.patch([{ op: 'set', path: '/data/mode', value: 'word-cloud' }])), 'PATCH_PARTICIPATION_CONFLICT'));
    expect((await f.store.list('audience-response'))).toEqual(rows);
  });

  it('rejects incompatible poll identities and fabricated participation counts with no lost responses', async () => {
    (await f.seed(poll())); (await f.engagement.submit((await f.read()), 'voter', { kind: 'poll.vote', optionIds: ['a'] }));
    const before = (await f.read()), records = (await f.store.list('audience-response'));
    for (const operation of [
      { op: 'set', path: '/data/question', value: 'A different question' },
      { op: 'set', path: '/data/options/0/id', value: 'different-id' },
      { op: 'set', path: '/data/options/0/label', value: 'Different meaning' },
      { op: 'set', path: '/data/maxChoices', value: 2 },
    ] as ViewPatchOperation[]) (await errorCode(async () => (await f.patch([operation])), 'PATCH_PARTICIPATION_CONFLICT'));
    for (const path of ['/data/totalVotes', '/data/counts', '/data/options/0/count', '/data/responseState']) (await errorCode(async () => (await f.patch([{ op: 'set', path, value: 50 }])), 'PATCH_UNSUPPORTED'));
    expect((await f.read())).toEqual(before); expect((await f.store.list('audience-response'))).toEqual(records); expect((await f.requestCount())).toBe(0);
  });

  it('patches presentation leaf data/navigation while retaining participation per slide and blocking envelope replacement', async () => {
    (await f.seed({ version: 1, template: 'presentation', title: 'Stable deck', data: { slides: [poll(), qa(), transcript()], index: 0 } }));
    (await f.engagement.submit((await f.read()), 'participant', { kind: 'poll.vote', optionIds: ['b'] }));
    (await f.patch([{ op: 'set', path: '/data/slides/0/data/revealResults', value: true }, { op: 'set', path: '/data/index', value: 1 }]));
    (await f.engagement.submit((await f.read()), 'participant', { kind: 'qa.submit', text: 'Question on the other slide.' }));
    (await f.patch([{ op: 'set', path: '/data/slides/1/data/revealResults', value: true }, { op: 'set', path: '/data/index', value: 0 }]));
    expect((await f.engagement.projection((await f.read()), 'participant'))).toMatchObject({ poll: { totalVotes: 1, selectedOptionIds: ['b'], counts: { a: 0, b: 1 } } });
    for (const path of ['/data/slides', '/data/slides/0', '/data/slides/0/data', '/data/slides/0/template', '/data/slides/0/source/url']) (await errorCode(async () => (await f.patch([{ op: 'set', path, value: 'unsupported' }])), 'PATCH_UNSUPPORTED'));
    (await errorCode(async () => (await f.patch([{ op: 'set', path: '/data/slides/1/data/prompt', value: 'Different' }])), 'PATCH_PARTICIPATION_CONFLICT'));
    expect((await f.store.list('audience-response'))).toHaveLength(2);
    expect(((await f.read()).view!.data.slides as ViewSpec[])[2]).toEqual(validateView(transcript()));
  });

  it('keeps mutation inside data, uses real escaped JSON-pointer keys, and refuses array insertion/removal', async () => {
    (await f.seed({ version: 1, template: 'table', data: { columns: ['a/b', 'c~d'], rows: [{ 'a/b': 1, 'c~d': 2 }] } }));
    (await f.patch([{ op: 'set', path: '/data/rows/0/a~1b', value: 3 }, { op: 'remove', path: '/data/rows/0/c~0d' }]));
    expect((await f.read()).view!.data.rows).toEqual([{ 'a/b': 3 }]);
    for (const path of ['/data', '/source/title', '/actions/0/label', '/responseState', '/interactionEpoch', '/held', '/data/rows/0/__proto__', '/data/rows/0/constructor', '/data/rows/0/a~2b']) (await errorCode(async () => (await f.patch([{ op: 'set', path, value: 'not allowed' }])), 'PATCH_UNSUPPORTED'));
    (await errorCode(async () => (await f.patch([{ op: 'remove', path: '/data/rows/0' }])), 'PATCH_UNSUPPORTED'));
    for (const path of ['/data/rows/1', '/data/rows/-', '/data/rows/00', '/data/rows/9007199254740992']) (await errorCode(async () => (await f.patch([{ op: 'set', path, value: {} }])), 'PATCH_PATH_CONFLICT'));
    expect((await f.read()).view!.data.rows).toEqual([{ 'a/b': 3 }]);
    expect(Object.prototype).not.toHaveProperty('not allowed');
  });

  it('protects source-bound values and rejects a silently rematerialized source refresh', async () => {
    const dataset: DatasetRecord = { id: 'source', sessionId: 'session', name: 'Exact source', columns: ['value'], rows: [{ value: 12 }], rowCount: 1, createdAt: '2026-09-14T00:00:00Z', source: { title: 'Authoritative source', url: 'https://example.com/source' } };
    (await f.store.put('dataset', dataset));
    (await f.seed({ version: 1, template: 'table', data: { binding: { datasetId: 'source' }, pageSize: 12 } }));
    (await f.patch([{ op: 'set', path: '/data/pageSize', value: 20 }]));
    const before = (await f.read());
    expect(before.view).toMatchObject({ source: dataset.source, data: { rows: dataset.rows, pageSize: 20 } });
    for (const path of ['/data/rows', '/data/rows/0/value', '/data/columns', '/data/summary/sourceRows']) (await errorCode(async () => (await f.patch([{ op: 'set', path, value: 999 }])), 'PATCH_SOURCE_CONFLICT'));
    (await errorCode(async () => (await f.patch([{ op: 'remove', path: '/data/binding' }])), 'PATCH_UNSUPPORTED'));
    (await errorCode(async () => (await f.patch([{ op: 'set', path: '/data/binding/datasetId', value: 'other-source' }])), 'PATCH_UNSUPPORTED'));
    (await f.store.put('dataset', { ...dataset, rows: [{ value: 13 }] }));
    (await errorCode(async () => (await f.patch([{ op: 'set', path: '/data/pageSize', value: 21 }])), 'PATCH_SOURCE_CONFLICT'));
    expect((await f.read())).toEqual(before); expect((await f.requestCount())).toBe(1);
    expect((await f.store.get<DatasetRecord>('dataset', 'source'))!.rows).toEqual([{ value: 13 }]);
  });

  it('honors source/asset authorization failures and checks even the verifier output against the final schema', async () => {
    const before = (await f.read());
    f.verify.mockImplementationOnce(() => { throw new AppError('NOT_FOUND', 'Referenced asset unavailable.', 404); });
    (await errorCode(async () => (await f.patch([{ op: 'appendText', path: '/data/segments/0/text', value: ' next' }])), 'NOT_FOUND'));
    f.verify.mockImplementationOnce(async (_principal, _sessionId, view) => ({ ...view, data: { ...view.data, status: 'invalid' } }));
    (await errorCode(async () => (await f.patch([{ op: 'appendText', path: '/data/segments/0/text', value: ' next' }])), 'INVALID_ARGUMENT'));
    expect(f.publish).not.toHaveBeenCalled(); expect((await f.read())).toEqual(before); expect((await f.requestCount())).toBe(0);
  });

  it('guards generation/authorization changes between validation and publication', async () => {
    const before = (await f.read());
    f.verify.mockImplementationOnce(async (_principal, _sessionId, view) => {
      (await f.store.put('display', { ...(await f.read()), generation: before.generation + 1 }));
      return view;
    });
    (await errorCode(async () => (await f.patch([{ op: 'appendText', path: '/data/segments/0/text', value: ' stale' }])), 'REVISION_CONFLICT'));
    expect((await f.read())).toEqual(before); expect(f.publish).not.toHaveBeenCalled();
    f.verify.mockImplementationOnce(async (_principal, _sessionId, view) => { f.editors.delete(owner.userId); return view; });
    (await errorCode(async () => (await f.patch([{ op: 'appendText', path: '/data/segments/0/text', value: ' revoked' }])), 'FORBIDDEN'));
    expect((await f.read())).toEqual(before); expect(f.publish).not.toHaveBeenCalled();
  });

  it('requires a current view and an existing string/parent for text edits', async () => {
    const before = (await f.read());
    for (const path of ['/data/missing', '/data/segments', '/data/segments/1/missing', '/data/segments/7/text']) (await errorCode(async () => (await f.patch([{ op: 'appendText', path, value: 'text' }])), 'PATCH_PATH_CONFLICT'));
    (await errorCode(async () => (await f.patch([{ op: 'set', path: '/data/missing/child', value: 'text' }])), 'PATCH_PATH_CONFLICT'));
    expect((await f.read())).toEqual(before);
    (await f.seed(null));
    (await errorCode(async () => (await f.patch([{ op: 'set', path: '/data/text', value: 'text' }])), 'INVALID_VIEW'));
  });

  it('enforces independent operation, byte, text, JSON and final-template bounds before mutation', async () => {
    const base = (await f.request([{ op: 'appendText', path: '/data/segments/0/text', value: 'x' }]));
    expect(viewPatchSchema.safeParse(base).success).toBe(true);
    expect(viewPatchSchema.safeParse({...base,expectedRevision:undefined}).success).toBe(true);
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    const badInputs: unknown[] = [
      { ...base, expectedRevision: -1 },
      { ...base, operations: [] }, { ...base, operations: Array.from({ length: VIEW_PATCH_LIMITS.operations + 1 }, () => base.operations[0]) },
      { ...base, operations: [{ op: 'appendText', path: '/data/segments/0/text', value: 'x'.repeat(VIEW_PATCH_LIMITS.appendCharacters + 1) }] },
      { ...base, operations: [{ op: 'set', path: '/data/status', value: 'x'.repeat(VIEW_PATCH_LIMITS.bytes) }] },
      { ...base, operations: [{ op: 'set', path: '/data/status', value: NaN }] },
      { ...base, operations: [{ op: 'set', path: '/data/status', value: { missing: undefined } }] },
      { ...base, operations: [{ op: 'set', path: '/data/status', value: cyclic }] },
      { ...base, operations: [{ op: 'set', path: '/data/status', value: JSON.parse('{"__proto__":{"polluted":true}}') }] },
      { ...base, operations: [{ op: 'set', path: '/data/status', value: 'complete', extra: true }] },
    ];
    const before = (await f.read());
    for (const input of badInputs) (await errorCode(async () => (await f.engine.patch(owner, input)), 'INVALID_ARGUMENT'));
    const long = transcript(); (long.data.segments as { text: string }[])[0].text = 'x'.repeat(20_000); (await f.seed(long));
    (await errorCode(async () => (await f.engine.patch(owner, base)), 'INVALID_ARGUMENT'));
    expect((await f.requestCount())).toBe(0); expect(f.publish).not.toHaveBeenCalled(); expect((await f.read()).revision).toBe(before.revision);
  });
});
