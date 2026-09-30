import { testDatabase } from '../postgres.js';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthPrincipal } from '../../src/server/auth.js';
import { DisplayHistory } from '../../src/server/display-history.js';
import { Engagement } from '../../src/server/engagement.js';
import { AppError, Store } from '../../src/server/store.js';
import { TimerControls, timerControlInput, type TimerControlHost, type TimerControlInput } from '../../src/server/timer-controls.js';
import type { ViewPatchDisplay } from '../../src/server/view-patch.js';
import { TIMER_MAX_TIMESTAMP_MS, TIMER_MIN_TIMESTAMP_MS, timerSeconds, countdownDataSchema } from '../../src/shared/timer.js';
import type { DisplayRecord, UpdateRecord, ViewSpec } from '../../src/shared/types.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { startHarness, success, type Harness } from './harness.js';

const owner: AuthPrincipal = { userId: 'timer-owner', agentId: 'timer-agent' };
const other: AuthPrincipal = { userId: 'other-editor' };
const origin = Date.parse('2030-01-01T12:00:00.000Z');
const iso = (time: number) => new Date(time).toISOString();
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const identity = (principal: AuthPrincipal) => principal.tokenId ? `token:${principal.tokenId}` : `user:${principal.participantId ?? principal.userId}`;
const timer = (data: Record<string, unknown> = { endsAt: iso(origin + 42125) }): ViewSpec => ({
  version: 1, template: 'countdown', title: 'Retained timer metadata', showTitle: false, showSource: false,
  data: { label: 'Workshop time', ...data }, source: { title: 'Supplied event', url: 'https://example.com/event' },
  actions: [{ id: 'next', label: 'Continue workshop', kind: 'button' }],
});
const poll = (): ViewSpec => ({ version: 1, template: 'poll', data: { question: 'A retained question', revealResults: true, options: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }] } });
const fixtures: Fixture[] = [], harnesses: Harness[] = [], clients: (Client | LegacyClient)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const fixture of fixtures.splice(0)) (await fixture.close());
  await Promise.all(clients.splice(0).map(client => client.close().catch(() => {})));
  // Restart tests share the first harness's temporary DB directory.
  for (const harness of harnesses.splice(0).reverse()) await harness.close();
});

/** Actual isolated PostgreSQL transactions/history/participation, not a live DB. */
class Fixture {
  readonly directory = mkdtempSync(join(tmpdir(), 'kanvas-timer-controls-'));
  readonly path = join(this.directory, 'state.sqlite');
  store = new Store(testDatabase(this.path));
  history = new DisplayHistory(this.store);
  engagement = new Engagement(this.store);
  editors = new Set([owner.userId, other.userId]);
  ended = false;
  serverMs = origin;
  failPublication = false;
  readonly clock = vi.fn(() => this.serverMs);
  readonly verify = vi.fn(async (_principal: AuthPrincipal, _sessionId: string, view: ViewSpec) => validateView(view));
  readonly publish = vi.fn(async (principal: AuthPrincipal, input: TimerControlInput, before: ViewPatchDisplay, view: ViewSpec): Promise<Awaited<UpdateRecord>> => {
    const current = (await this.host.display(principal, input.sessionId, input.displayId));
    if (current.revision !== before.revision || current.generation !== before.generation || current.interactionEpoch !== before.interactionEpoch) throw new AppError('REVISION_CONFLICT', 'Changed.', 409);
    if (current.held) throw new AppError('DISPLAY_HELD', 'Held.', 409);
    (await this.history.ensure(before));
    const stamp = iso(this.serverMs), revision = before.revision + 1;
    const next: ViewPatchDisplay = { ...current, view, revision, generation: before.generation + 1, updatedAt: stamp, delivery: { revision, status: 'pending', updatedAt: stamp } };
    const update: UpdateRecord = { id: randomUUID(), sessionId: input.sessionId, requestId: input.requestId, displayIds: [input.displayId], status: 'prepared', revisions: { [input.displayId]: revision }, createdAt: stamp, completedAt: stamp };
    (await this.store.put('display', next)); (await this.history.record(next, 'timer-control')); (await this.store.put('update', update));
    (await this.store.db.prepare('INSERT INTO requests VALUES(?,?,?,?,?,?)').run(input.sessionId, identity(principal), input.requestId, digest(input), update.id, 'timer-control'));
    if (this.failPublication) throw new Error('Injected publication failure');
    return update;
  });
  readonly host: TimerControlHost = {
    transaction: async operation => (await this.store.transaction(operation)),
    display: async (principal, sessionId, displayId) => {
      if (!this.editors.has(principal.userId) || principal.scopedSessionId || principal.scopedDisplayId || principal.scopes && !principal.scopes.includes('publish')) throw new AppError('FORBIDDEN', 'Editor publish access required.', 403);
      if (this.ended) throw new AppError('SESSION_ENDED', 'Ended.', 410);
      const display = (await this.store.get<ViewPatchDisplay>('display', displayId));
      if (!display || display.sessionId !== sessionId) throw new AppError('NOT_FOUND', 'Unavailable.', 404);
      return display;
    },
    retry: async (principal, input) => {
      const prior = (await this.store.db.prepare('SELECT digest,result_id,kind FROM requests WHERE session_id=? AND principal=? AND request_id=?').get(input.sessionId, identity(principal), input.requestId));
      if (!prior) return;
      if (prior.kind !== 'timer-control' || prior.digest !== digest(input)) throw new AppError('REQUEST_ID_CONFLICT', 'Different original action.', 409);
      return (await this.store.get<UpdateRecord>('update', String(prior.result_id)));
    },
    verifyView: (...args) => this.verify(...args),
    publish: (...args) => this.publish(...args),
    now: () => this.clock(),
  };
  engine = new TimerControls(this.host);
  private constructor() { fixtures.push(this); }
  static async create(view: ViewSpec | null = timer()) { const fixture = new Fixture(); await fixture.seed(view); return fixture; }
  async seed(view: ViewSpec | null, displayId = 'display', sessionId = 'session') {
    const display: ViewPatchDisplay = { id: displayId, sessionId, name: 'Timer fixture', width: 1200, height: 800, pixelRatio: 1, viewportRevision: 3, revision: 4, generation: 7, interactionEpoch: `epoch:${displayId}`, targetAgentId: 'original-agent', held: false, online: true, appliedRevision: 4, updatedAt: iso(origin), view: view ? validateView(view) : null };
    (await this.store.put('display', display)); return display;
  }
  async read(displayId = 'display') { return (await this.store.get<ViewPatchDisplay>('display', displayId))!; }
  async request(action: TimerControlInput['action'], changes: Partial<TimerControlInput> = {}): Promise<Awaited<TimerControlInput>> { return { sessionId: 'session', displayId: 'display', requestId: randomUUID(), expectedRevision: (await this.read()).revision, action, ...changes }; }
  async control(action: TimerControlInput['action'], changes: Partial<TimerControlInput> = {}) { return (await this.engine.control(owner, (await this.request(action, changes)))); }
  async requests() { return Number((await this.store.db.prepare('SELECT count(*) AS n FROM requests').get())!.n); }
  async restart() { (await this.store.close()); this.store = new Store(testDatabase(this.path)); this.history = new DisplayHistory(this.store); this.engagement = new Engagement(this.store); this.engine = new TimerControls(this.host); }
  async close() { (await this.store.close()); rmSync(this.directory, { recursive: true, force: true }); }
}

async function fails(run: () => Promise<Awaited<unknown>>, code: string) {
  let caught: unknown;
  try { (await run()); } catch (error) { caught = error; }
  expect(caught).toMatchObject({ code }); return caught;
}

describe('atomic, direct timer actions', () => {
  it.each(['down', 'up'] as const)('pauses/resumes %s without rounding fractions or replacing metadata, participation identity, or history', async direction => {
    const f = (await Fixture.create(timer(direction === 'up' ? { direction, startedAt: iso(origin - 42125) } : { endsAt: iso(origin + 42125), completeText: 'Workshop resumes' })));
    const before = (await f.read()), field = direction === 'up' ? 'pausedElapsedSeconds' : 'pausedRemainingSeconds';
    const pauseInput = (await f.request('pause')), inputCopy = structuredClone(pauseInput);
    const pause = (await f.engine.control(owner, pauseInput)), paused = (await f.read());
    expect(pauseInput).toEqual(inputCopy);
    expect(paused.view).toEqual({ ...before.view, data: { ...before.view!.data, [field]: 42.125 } });
    expect(paused).toMatchObject({ revision: 5, generation: 8, interactionEpoch: before.interactionEpoch, targetAgentId: before.targetAgentId, viewportRevision: 3, appliedRevision: 4, delivery: { revision: 5, status: 'pending' } });
    expect(pause).toMatchObject({ status: 'prepared', revisions: { display: 5 } });
    f.serverMs += 3600000;
    const resume = (await f.control('resume')), after = (await f.read());
    expect(after.view!.data).not.toHaveProperty(field);
    expect(after.view!.data[direction === 'up' ? 'startedAt' : 'endsAt']).toBe(iso(f.serverMs + (direction === 'up' ? -42125 : 42125)));
    expect(timerSeconds(countdownDataSchema.parse(after.view!.data), f.serverMs)).toBe(42.125);
    expect({ ...after.view, data: before.view!.data }).toEqual(before.view);
    expect(resume.status).toBe('prepared');
    expect((await f.history.list(after)).entries.map(entry => [entry.revision, entry.reason])).toEqual([[4, 'initial'], [5, 'timer-control'], [6, 'timer-control']]);
    expect(f.clock).toHaveBeenCalledTimes(2);
  });

  it('preserves subsecond elapsed time across repeated pauses and supports more than a year of count-up', async () => {
    const f = (await Fixture.create(timer({ direction: 'up', startedAt: iso(origin) })));
    for (let turn = 1; turn <= 8; turn++) {
      f.serverMs += 125; (await f.control('pause'));
      expect((await f.read()).view!.data.pausedElapsedSeconds).toBe(turn * .125);
      f.serverMs += 3600000; (await f.control('resume'));
    }
    expect(timerSeconds(countdownDataSchema.parse((await f.read()).view!.data), f.serverMs)).toBe(1);
    (await f.seed(timer({ direction: 'up', startedAt: iso(f.serverMs - 400 * 86400000 - 125) })));
    (await f.control('pause')); expect((await f.read()).view!.data.pausedElapsedSeconds).toBe(400 * 86400 + .125);
  });

  it('replays original actions after actual database restart and later changes without reading the clock or republishing', async () => {
    const f = (await Fixture.create()), request = (await f.request('pause')), first = (await f.engine.control(owner, request));
    (await f.restart()); f.serverMs += 86400000;
    const resume = (await f.request('resume')), second = (await f.engine.control(owner, resume)), latest = (await f.read());
    (await f.restart()); f.serverMs += 86400000; f.clock.mockClear(); f.verify.mockClear(); f.publish.mockClear();
    f.clock.mockImplementation(() => { throw new Error('A retry must not read time.'); });
    expect((await f.engine.control(owner, { action: request.action, requestId: request.requestId, expectedRevision: request.expectedRevision, displayId: request.displayId, sessionId: request.sessionId }))).toEqual(first);
    expect((await f.engine.control(owner, resume))).toEqual(second);
    expect((await f.read())).toEqual(latest); expect((await f.requests())).toBe(2);
    expect(f.clock).not.toHaveBeenCalled(); expect(f.verify).not.toHaveBeenCalled(); expect(f.publish).not.toHaveBeenCalled();
    for (const changed of [{ ...request, action: 'resume' }, { ...request, expectedRevision: latest.revision }]) (await fails(async () => (await f.engine.control(owner, changed)), 'REQUEST_ID_CONFLICT'));
    (await f.seed(timer(), 'other-display')); (await fails(async () => (await f.engine.control(owner, { ...request, displayId: 'other-display' })), 'REQUEST_ID_CONFLICT'));
    (await f.store.db.prepare('UPDATE requests SET kind=? WHERE request_id=?').run('patch', request.requestId));
    (await fails(async () => (await f.engine.control(owner, request)), 'REQUEST_ID_CONFLICT'));
  });

  it('rejects duplicate new actions and stale revisions without inventing another pause or resume', async () => {
    const f = (await Fixture.create()), original = (await f.request('pause'));
    (await f.engine.control(owner, original)); const paused = (await f.read()); f.clock.mockClear();
    (await fails(async () => (await f.control('pause')), 'TIMER_ALREADY_PAUSED'));
    (await fails(async () => (await f.control('resume', { expectedRevision: original.expectedRevision })), 'REVISION_CONFLICT'));
    expect((await f.read())).toEqual(paused); expect(f.clock).not.toHaveBeenCalled();
    (await f.control('resume')); const running = (await f.read()); f.clock.mockClear();
    (await fails(async () => (await f.control('resume')), 'TIMER_NOT_PAUSED'));
    expect((await f.read())).toEqual(running); expect(f.clock).not.toHaveBeenCalled(); expect((await f.requests())).toBe(2);
  });

  it('does not turn a future count-up into fake elapsed time and permits a genuine zero-duration start', async () => {
    const f = (await Fixture.create(timer({ direction: 'up', startedAt: iso(origin + 1000) }))), before = (await f.read());
    (await fails(async () => (await f.control('pause')), 'TIMER_NOT_STARTED')); (await fails(async () => (await f.control('resume')), 'TIMER_NOT_PAUSED'));
    expect((await f.read())).toEqual(before); expect((await f.requests())).toBe(0); expect(f.publish).not.toHaveBeenCalled();
    f.serverMs += 1000; (await f.control('pause')); expect((await f.read()).view!.data.pausedElapsedSeconds).toBe(0);
    f.serverMs += 60000; (await f.control('resume')); expect((await f.read()).view!.data.startedAt).toBe(iso(f.serverMs));
  });

  it('cannot pause a completed countdown or restart it by retrying a zero-duration resume', async () => {
    const f = (await Fixture.create(timer({ endsAt: iso(origin) }))), complete = (await f.read());
    (await fails(async () => (await f.control('pause')), 'TIMER_COMPLETE')); expect((await f.read())).toEqual(complete);
    (await f.seed(timer({ endsAt: iso(origin - 1000), pausedRemainingSeconds: 0 })));
    const request = (await f.request('resume')), receipt = (await f.engine.control(owner, request)), resumed = (await f.read());
    expect(resumed.view!.data.endsAt).toBe(iso(origin)); expect(resumed.view!.data).not.toHaveProperty('pausedRemainingSeconds');
    f.serverMs += 900000; (await f.restart());
    expect((await f.engine.control(owner, request))).toEqual(receipt); expect((await f.read())).toEqual(resumed);
    (await fails(async () => (await f.control('pause')), 'TIMER_COMPLETE')); expect((await f.requests())).toBe(1);
  });

  it('enforces representable server-time, paused duration, resume-anchor, and revision bounds atomically', async () => {
    const f = (await Fixture.create()), before = (await f.read());
    for (const invalid of [NaN, Infinity, origin + .5, TIMER_MIN_TIMESTAMP_MS - 1, TIMER_MAX_TIMESTAMP_MS + 1]) {
      f.serverMs = invalid; (await fails(async () => (await f.control('pause')), 'TIMER_RANGE')); expect((await f.read())).toEqual(before);
    }
    f.serverMs = origin; (await f.seed(timer({ endsAt: iso(origin + 31536001 * 1000) })));
    (await fails(async () => (await f.control('pause')), 'TIMER_RANGE'));
    (await f.seed(timer({ direction: 'up', startedAt: iso(origin), pausedElapsedSeconds: 1 }))); f.serverMs = TIMER_MIN_TIMESTAMP_MS;
    (await fails(async () => (await f.control('resume')), 'TIMER_RANGE'));
    (await f.seed(timer({ endsAt: iso(origin), pausedRemainingSeconds: 1 }))); f.serverMs = TIMER_MAX_TIMESTAMP_MS;
    (await fails(async () => (await f.control('resume')), 'TIMER_RANGE'));
    for (const key of ['revision', 'generation'] as const) {
      const display = (await f.seed(timer())); (await f.store.put('display', { ...display, [key]: Number.MAX_SAFE_INTEGER }));
      (await fails(async () => (await f.control('pause')), 'TIMER_RANGE'));
    }
    expect((await f.requests())).toBe(0); expect(f.publish).not.toHaveBeenCalled(); expect((await f.store.list('display-history'))).toEqual([]);
  });

  it('keeps current authorization, ended-session and display scopes ahead of durable replay', async () => {
    const f = (await Fixture.create()), request = (await f.request('pause')); (await f.engine.control(owner, request));
    const before = (await f.read()); f.clock.mockClear();
    f.editors.delete(owner.userId); (await fails(async () => (await f.engine.control(owner, request)), 'FORBIDDEN')); f.editors.add(owner.userId);
    for (const principal of [{ ...owner, scopes: ['read'] }, { ...owner, scopedSessionId: 'session' }, { ...owner, scopedDisplayId: 'display' }]) (await fails(async () => (await f.engine.control(principal, request)), 'FORBIDDEN'));
    f.ended = true; (await fails(async () => (await f.engine.control(owner, request)), 'SESSION_ENDED')); f.ended = false;
    (await fails(async () => (await f.engine.control(owner, { ...request, sessionId: 'different-session' })), 'NOT_FOUND'));
    (await f.store.put('display', { ...before, held: true, revision: before.revision + 1 }));
    const held = (await f.read()); expect((await f.engine.control(owner, request)).revisions.display).toBe(5);
    (await fails(async () => (await f.control('resume')), 'DISPLAY_HELD')); expect((await f.read())).toEqual(held);
    expect(f.clock).not.toHaveBeenCalled(); expect((await f.requests())).toBe(1);
  });

  it('namespaces the original-action receipt by principal and session', async () => {
    const f = (await Fixture.create()), request = (await f.request('pause', { requestId: 'shared-key' })); (await f.engine.control(owner, request));
    (await f.engine.control(other, (await f.request('resume', { requestId: request.requestId }))));
    (await f.seed(timer(), 'second-display', 'second-session'));
    (await f.engine.control(owner, { ...request, displayId: 'second-display', sessionId: 'second-session' }));
    expect((await f.requests())).toBe(3);
  });

  it.each(['revision', 'generation', 'interactionEpoch', 'held', 'authorization'] as const)('rejects a late %s change before publication and rolls back candidate work', async field => {
    const f = (await Fixture.create()), before = (await f.read());
    f.verify.mockImplementationOnce(async (_principal, _sessionId, view) => {
      if (field === 'authorization') f.editors.delete(owner.userId);
      else (await f.store.put('display', { ...(await f.read()), [field]: field === 'held' ? true : field === 'interactionEpoch' ? 'new-epoch' : before[field] + 1 }));
      return view;
    });
    (await fails(async () => (await f.control('pause')), field === 'authorization' ? 'FORBIDDEN' : field === 'held' ? 'DISPLAY_HELD' : 'REVISION_CONFLICT'));
    expect((await f.read())).toEqual(before); expect(f.publish).not.toHaveBeenCalled(); expect((await f.requests())).toBe(0);
  });

  it('rolls back view/history/update/dedupe together on publication failure, then permits the exact request once', async () => {
    const f = (await Fixture.create()), before = (await f.read()), request = (await f.request('pause')); f.failPublication = true;
    (await expect((async () => (await f.engine.control(owner, request)))()).rejects.toThrow('Injected publication failure'));
    expect((await f.read())).toEqual(before); expect((await f.requests())).toBe(0); expect((await f.store.list('update'))).toEqual([]); expect((await f.store.list('display-history'))).toEqual([]);
    f.failPublication = false; const first = (await f.engine.control(owner, request)); expect((await f.engine.control(owner, request))).toEqual(first);
    expect((await f.requests())).toBe(1); expect((await f.read()).revision).toBe(before.revision + 1);
  });

  it('changes only the visible presentation timer and retains actual votes and every other slide', async () => {
    const f = (await Fixture.create({ version: 1, template: 'presentation', title: 'Workshop deck', actions: [{ id: 'continue', label: 'Next section', kind: 'button' }], data: { index: 1, slides: [timer(), poll(), timer({ direction: 'up', startedAt: iso(origin - 42125) })] } }));
    (await f.engagement.submit((await f.read()), 'voter', { kind: 'poll.vote', optionIds: ['b'] }));
    const responses = (await f.store.list('audience-response')), display = (await f.read());
    (await f.store.put('display', { ...display, view: { ...display.view!, data: { ...display.view!.data, index: 2 } } }));
    const before = (await f.read()), slides = before.view!.data.slides as ViewSpec[];
    (await f.control('pause')); const after = (await f.read()), changed = after.view!.data.slides as ViewSpec[];
    expect(changed[0]).toEqual(slides[0]); expect(changed[1]).toEqual(slides[1]);
    expect(changed[2]).toEqual({ ...slides[2], data: { ...slides[2].data, pausedElapsedSeconds: 42.125 } });
    expect(after.view).toEqual({ ...before.view, data: { ...before.view!.data, slides: changed } });
    expect(after.interactionEpoch).toBe(before.interactionEpoch); expect((await f.store.list('audience-response'))).toEqual(responses);
    const pollDisplay = { ...after, view: { ...after.view!, data: { ...after.view!.data, index: 1 } } };
    expect((await f.engagement.projection(pollDisplay, 'voter'))).toMatchObject({ poll: { selectedOptionIds: ['b'], totalVotes: 1, counts: { a: 0, b: 1 } } });
  });

  it('rejects source rematerialization and verifier failures without changing unrelated views', async () => {
    const f = (await Fixture.create()), before = (await f.read());
    f.verify.mockImplementationOnce(async (_principal, _sessionId, view) => ({ ...view, title: 'Unexpected source refresh' }));
    (await fails(async () => (await f.control('pause')), 'TIMER_SOURCE_CONFLICT'));
    f.verify.mockImplementationOnce(() => { throw new AppError('NOT_FOUND', 'Referenced asset unavailable.', 404); });
    (await fails(async () => (await f.control('pause')), 'NOT_FOUND'));
    f.verify.mockImplementationOnce(async (_principal, _sessionId, view) => ({ ...view, data: { ...view.data, endsAt: 'PRIVATE_INVALID_INSTANT' } }));
    const error = (await fails(async () => (await f.control('pause')), 'INVALID_ARGUMENT'));
    expect(JSON.stringify(error)).not.toContain('PRIVATE_INVALID_INSTANT'); expect((await f.read())).toEqual(before); expect(f.publish).not.toHaveBeenCalled();
  });

  it('requires a current valid timer and never selects a hidden timer on another slide', async () => {
    const f = (await Fixture.create(null)); (await fails(async () => (await f.control('pause')), 'NOT_TIMER'));
    (await f.seed({ version: 1, template: 'presentation', data: { index: 1, slides: [timer(), { version: 1, template: 'fact', data: { text: 'Visible fact' } }] } }));
    (await fails(async () => (await f.control('pause')), 'NOT_TIMER'));
    (await f.store.put('display', { ...(await f.read()), view: timer({ targetTime: 'PRIVATE_INVALID_INSTANT' }) }));
    const error = (await fails(async () => (await f.control('pause')), 'INVALID_ARGUMENT'));
    expect(JSON.stringify(error)).not.toContain('PRIVATE_INVALID_INSTANT'); expect(f.clock).not.toHaveBeenCalled(); expect((await f.requests())).toBe(0);
  });

  it('requires the strict original action shape and redacts unexpected input rather than emitting raw errors', async () => {
    const f = (await Fixture.create()), base = (await f.request('pause')), before = (await f.read());
    expect(timerControlInput.parse(base)).toEqual(base);
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    for (const raw of [undefined, { ...base, action: 'PRIVATE_ACTION' }, { ...base, requestId: undefined }, { ...base, expectedRevision: undefined }, { ...base, expectedRevision: -1 }, { ...base, expectedRevision: NaN }, { ...base, sessionId: 'x'.repeat(129) }, { ...base, PRIVATE_FIELD: 'PRIVATE_VALUE' }, { ...base, now: cyclic }]) {
      const error = (await fails(async () => (await f.engine.control(owner, raw)), 'INVALID_ARGUMENT'));
      expect(JSON.stringify(error)).not.toContain('PRIVATE_');
    }
    expect((await f.read())).toEqual(before); expect(f.clock).not.toHaveBeenCalled(); expect((await f.requests())).toBe(0);
  });
});

interface ToolResult {
  isError?: boolean;
  content?: { type: string; text?: string }[];
  structuredContent?: { data?: unknown; error?: { code: string; message: string; issues?: { path: string; problem: string }[] } };
}
async function protocolSetup(protocol: 'modern' | 'legacy') {
  const interpret = vi.fn(async () => { throw new Error('Timer controls and prepared views must not invoke source preparation.'); });
  const h = await startHarness({ interpreter: { interpret } }); harnesses.push(h);
  const account = await h.account(), session = await account.session(), display = await account.display(session.id);
  const issued = (await h.runtime.auth.issueToken(account.user!.id, 'Isolated timer acceptance', ['read', 'publish'], [session.id]));
  const requestInit = { headers: { Authorization: `Bearer ${issued.value}` } };
  const client = protocol === 'modern' ? new Client({ name: 'timer-control-test', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } }) : new LegacyClient({ name: 'timer-control-test', version: '1' });
  clients.push(client);
  if (client instanceof Client) await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', h.baseUrl), { requestInit }));
  else await client.connect(new LegacyTransport(new URL('/mcp', h.baseUrl), { requestInit }));
  const call = async (name: string, args: Record<string, unknown>) => await client.callTool({ name, arguments: { sessionId: session.id, displayId: display.id, ...args } }) as ToolResult;
  return { h, account, session, display, client, call, interpret, issued };
}
function toolFailure(result: ToolResult, code: string) {
  expect(result.isError).toBe(true); expect(result.structuredContent?.error?.code).toBe(code);
  expect(JSON.parse(result.content?.find(item => item.type === 'text')?.text ?? '{}')).toEqual(result.structuredContent);
  return result.structuredContent!.error!;
}

describe.each(['modern', 'legacy'] as const)('%s MCP timer control integration', protocol => {
  it('publishes direct pause/resume receipts, replays the original action, and returns safe state conflicts', async () => {
    const { h, account, session, display, client, call, interpret } = await protocolSetup(protocol);
    const discovery = await client.listTools(); expect(discovery.tools.some(tool => tool.name === 'kanvas_timer_control')).toBe(true);
    await account.submit(session.id, [display.id], timer({ endsAt: iso(Date.now() + 120000), completeText: 'Finished' }));
    const before = (await account.detail(session.id)).displays[0];
    const request = { expectedRevision: before.revision, requestId: randomUUID(), action: 'pause' };
    const result = await call('kanvas_timer_control', request); expect(result.isError).not.toBe(true);
    const pause = result.structuredContent!.data as UpdateRecord, paused = (await account.detail(session.id)).displays[0];
    expect(pause).toMatchObject({ status: 'prepared', revisions: { [display.id]: before.revision + 1 } });
    expect(paused.delivery).toMatchObject({ revision: paused.revision, status: 'pending' });
    expect(paused.view).toEqual({ ...before.view, data: { ...before.view!.data, pausedRemainingSeconds: expect.any(Number) } });
    expect(Number(paused.view!.data.pausedRemainingSeconds)).toBeGreaterThan(110);
    const { delivery: _liveDelivery, ...receipt } = pause;
    const { delivery: replayDelivery, ...replayedReceipt } = (await call('kanvas_timer_control', request)).structuredContent!.data as UpdateRecord;
    // The immutable receipt is replayed; delivery is a live projection whose
    // waitedMs legitimately advances while the receiving screen is offline.
    expect(replayedReceipt).toEqual(receipt); expect(replayDelivery?.[display.id].status).toBe('offline');
    toolFailure(await call('kanvas_timer_control', { ...request, action: 'resume' }), 'REQUEST_ID_CONFLICT');
    toolFailure(await call('kanvas_timer_control', { ...request, requestId: randomUUID(), expectedRevision: paused.revision }), 'TIMER_ALREADY_PAUSED');
    const resumeInput = { expectedRevision: paused.revision, requestId: randomUUID(), action: 'resume' };
    const resumedResult = await call('kanvas_timer_control', resumeInput); expect(resumedResult.isError).not.toBe(true);
    const resumed = (await account.detail(session.id)).displays[0]; expect(resumed.view!.data).not.toHaveProperty('pausedRemainingSeconds');
    expect(Math.abs(timerSeconds(countdownDataSchema.parse(resumed.view!.data), Date.parse(resumed.serverNow!)) - Number(paused.view!.data.pausedRemainingSeconds))).toBeLessThan(1);
    expect((await call('kanvas_timer_control', request)).structuredContent!.data).toMatchObject({ id: pause.id, revisions: pause.revisions });
    toolFailure(await call('kanvas_timer_control', { ...resumeInput, requestId: randomUUID(), expectedRevision: resumed.revision }), 'TIMER_NOT_PAUSED');
    const invalid = toolFailure(await call('kanvas_timer_control', { expectedRevision: resumed.revision, requestId: randomUUID(), action: 'PRIVATE_TIMER_ACTION' }), 'INVALID_ARGUMENT');
    expect(JSON.stringify(invalid)).not.toContain('PRIVATE_TIMER_ACTION'); expect(invalid.issues?.some(issue => issue.path === 'action')).toBe(true);
    const stored = (await h.runtime.store.get<UpdateRecord>('update', pause.id))!; expect(stored.status).toBe('prepared');
    expect((await h.runtime.store.db.prepare('SELECT kind FROM requests WHERE request_id=?').get(request.requestId))?.kind).toBe('timer-control');
    expect(interpret).not.toHaveBeenCalled();
    (await h.runtime.store.db.prepare('UPDATE members SET role=? WHERE session_id=? AND user_id=?').run('viewer', session.id, account.user!.id));
    toolFailure(await call('kanvas_timer_control', request), 'NOT_FOUND');
    expect((await h.runtime.store.get<DisplayRecord>('display', display.id))?.revision).toBe(resumed.revision);
  });

  it('explains partial display_edit failure and supports full-data edit and dedicated count-up control', async () => {
    const { account, session, display, call, interpret } = await protocolSetup(protocol);
    await account.submit(session.id, [display.id], timer({ endsAt: iso(Date.now() + 120000) }));
    const before = (await account.detail(session.id)).displays[0];
    const error = toolFailure(await call('kanvas_display_edit', { expectedRevision: before.revision, data: { pausedRemainingSeconds: 42.125 } }), 'INVALID_ARGUMENT');
    expect(error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'view.data.endsAt', problem: expect.stringContaining('ISO 8601') })]));
    expect((await account.detail(session.id)).displays[0].revision).toBe(before.revision);
    expect((await call('kanvas_display_edit', { expectedRevision: before.revision, data: { ...before.view!.data, pausedRemainingSeconds: 42.125 } })).isError).not.toBe(true);
    const edited = (await account.detail(session.id)).displays[0]; expect(edited.view!.data.pausedRemainingSeconds).toBe(42.125); expect(edited.delivery?.status).toBe('pending');
    await account.submit(session.id, [display.id], timer({ direction: 'up', startedAt: iso(Date.now() - 42125) }));
    const current = (await account.detail(session.id)).displays[0];
    expect((await call('kanvas_timer_control', { expectedRevision: current.revision, requestId: randomUUID(), action: 'pause' })).isError).not.toBe(true);
    const paused = (await account.detail(session.id)).displays[0]; expect(Number(paused.view!.data.pausedElapsedSeconds)).toBeGreaterThanOrEqual(42.125);
    expect(paused.view!.data).not.toHaveProperty('pausedRemainingSeconds'); expect(paused.view!.data).not.toHaveProperty('completeText');
    expect(interpret).not.toHaveBeenCalled();
  });
});

describe('HTTP timer controls use the same authorized durable transaction', () => {
  it('enforces CSRF, scope, held state and late CAS, persists original receipts across app restart, and awaits paint', async () => {
    const interpret = vi.fn(async () => { throw new Error('No source preparation for timer controls.'); });
    const options = { interpreter: { interpret } };
    const first = await startHarness(options); harnesses.push(first);
    const account = await first.account(), stranger = await first.account(), session = await account.session(), display = await account.display(session.id);
    await account.submit(session.id, [display.id], timer({ direction: 'up', startedAt: iso(Date.now() - 60000) }));
    const path = `/api/sessions/${session.id}/displays/${display.id}/timer-control`, request = { expectedRevision: 1, requestId: randomUUID(), action: 'pause' };
    expect((await account.request('POST', path, request, { csrf: null })).status).toBe(403);
    expect([403, 404]).toContain((await stranger.request('POST', path, request)).status);
    const pause = success(await account.request<UpdateRecord>('POST', path, request));
    const prepared = (await account.detail(session.id)).displays[0];
    expect(prepared.delivery).toMatchObject({ revision: 2, status: 'pending' }); expect(prepared.appliedRevision).not.toBe(2);
    expect(pause.status).toBe('prepared');
    // A restart opens the same isolated PostgreSQL schema; the original principal and
    // request identity survive, not merely an in-memory TimerControls instance.
    await first.shutdown();
    const restarted = await startHarness({ ...options, database: first.database }); harnesses.push(restarted);
    const reconnected = restarted.browser(); reconnected.user = account.user; reconnected.csrf = account.csrf;
    for (const [key, value] of account.cookies) reconnected.cookies.set(key, value);
    const replay = success(await reconnected.request<UpdateRecord>('POST', path, request));
    expect(replay).toMatchObject({ id: pause.id, revisions: pause.revisions, createdAt: pause.createdAt });
    expect((await reconnected.detail(session.id)).displays[0].view).toEqual(prepared.view);
    expect((await reconnected.request('POST', path, { ...request, action: 'resume' })).error?.code).toBe('REQUEST_ID_CONFLICT');
    const late = vi.spyOn(restarted.runtime.service, 'verifyView').mockImplementationOnce(async (_principal, _sessionId, view) => {
      const current = (await restarted.runtime.store.get<ViewPatchDisplay>('display', display.id))!;
      (await restarted.runtime.store.put('display', { ...current, generation: current.generation + 1 }));
      return validateView(view);
    });
    const resume = { expectedRevision: 2, requestId: randomUUID(), action: 'resume' };
    expect((await reconnected.request('POST', path, resume)).error?.code).toBe('REVISION_CONFLICT'); late.mockRestore();
    expect((await reconnected.detail(session.id)).displays[0].revision).toBe(2);
    success(await reconnected.request('PATCH', `/api/sessions/${session.id}/displays/${display.id}`, { expectedRevision: 2, held: true }));
    expect((await reconnected.request('POST', path, { ...resume, expectedRevision: 3 })).error?.code).toBe('DISPLAY_HELD');
    expect((await reconnected.request<UpdateRecord>('POST', path, request)).data?.id).toBe(pause.id);
    expect(interpret).not.toHaveBeenCalled();
  });
});
