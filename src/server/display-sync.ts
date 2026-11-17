import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {DisplayRecord,Role,SessionEvent,ViewSpec} from '../shared/types.js';
import type {AuthPrincipal} from './auth.js';
import {id,now,type Store} from './store.js';
import {InputError} from './input-errors.js';

/** Linked displays: slide or step navigation on any display in a group moves
 * the others to the same position, in both directions. Only navigation
 * propagates: new content on a display becomes its own baseline and no content
 * is copied between displays. Links persist per session until unlinked. */
export const SYNC_LIMITS = { displays: 8, groups: 16 } as const;
const NAVIGABLE = new Set(['presentation', 'procedure', 'recipe']);
const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const issue = (path: string, problem: string) => new InputError([{ path, problem }]);

export interface SyncDisplay extends DisplayRecord { generation: number; interactionEpoch?: string }
export interface SyncPosition { position: number; count: number }
interface Known { fingerprint: string | null; position: number | null }
export interface SyncGroup { id: string; displayIds: string[]; position: number | null; known: Record<string, Known>; lagging: string[]; createdAt: string; updatedAt: string }
interface SyncDocument { id: string; sessionId: string; groups: SyncGroup[]; updatedAt: string }
export interface SyncState { display: SyncDisplay; fingerprint: string | null; at: SyncPosition | null }
export interface DisplaySyncHost {
  store: Pick<Store, 'get' | 'put' | 'delete' | 'transaction'>;
  display(principal: AuthPrincipal, sessionId: string, displayId: string, minimum: 'viewer' | 'editor'): Promise<SyncDisplay>;
  access(principal: AuthPrincipal, sessionId: string, minimum?: Role): Promise<unknown>;
  history: { ensure(display: SyncDisplay): Promise<void>; record(display: SyncDisplay, reason: string): Promise<void> };
  emit(event: SessionEvent): void;
  closed(): boolean;
}

export const displaysSyncSchema = z.object({
  sessionId: identifier,
  action: z.enum(['link', 'unlink']),
  displayIds: z.array(identifier).min(1).max(64),
  alignTo: identifier.optional().describe('link: the display whose slide or step the others take.'),
}).strict().superRefine((value, ctx) => {
  if (value.action === 'link' && new Set(value.displayIds).size < 2) ctx.addIssue({ code: 'custom', path: ['displayIds'], message: 'link needs at least two different displays (an already-linked display may be one of them)' });
  if (value.action === 'unlink' && value.alignTo !== undefined) ctx.addIssue({ code: 'custom', path: ['alignTo'], message: 'alignTo is only used by link' });
});
export const displaysSyncReadSchema = z.object({ sessionId: identifier }).strict();

/** Ordinal position of a navigable view: a presentation slide, or a procedure
 * or recipe step (introduction counts as the first step, completion as the last). */
export function syncPosition(view: ViewSpec | null | undefined): SyncPosition | null {
  if (!view || !NAVIGABLE.has(view.template)) return null;
  const data = (view.data ?? {}) as Record<string, unknown>, list = view.template === 'presentation' ? data.slides : data.steps;
  const count = Array.isArray(list) ? list.length : 0;
  if (!count) return null;
  const last = count - 1, index = typeof data.index === 'number' && Number.isInteger(data.index) ? Math.min(Math.max(data.index, 0), last) : 0;
  if (view.template === 'presentation') return { position: index, count };
  return { position: data.stage === 'complete' ? last : data.stage === 'step' ? index : 0, count };
}
export function withSyncPosition(view: ViewSpec, position: number): ViewSpec {
  const data = view.data as Record<string, unknown>;
  return (view.template === 'presentation' ? { ...view, data: { ...data, index: position } }
    : { ...view, data: { ...data, index: position, stage: 'step', ...(view.template === 'recipe' ? { mode: 'steps' } : {}) } }) as ViewSpec;
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
/** Content identity without the position, so navigation and new content can be told apart. */
export function syncFingerprint(view: ViewSpec | null | undefined): string | null {
  if (!view || !NAVIGABLE.has(view.template)) return null;
  const { index: _index, stage, mode, ...rest } = (view.data ?? {}) as Record<string, unknown>;
  const data = view.template === 'presentation' ? { ...rest, stage, mode } : rest;
  return createHash('sha256').update(stable({ ...view, data })).digest('base64url');
}

const groupKey = (group: SyncGroup) => stable({ displayIds: group.displayIds, position: group.position, known: group.known, lagging: [...group.lagging].sort() });
/** Pure: which displays move where, and what the group remembers next. A
 * display navigated when its content is unchanged but its position differs
 * from the remembered one; the most recently changed display wins. Displays
 * with new content are never moved; held displays catch up once released. */
export function planSync(group: SyncGroup, states: readonly SyncState[]): { group: SyncGroup; writes: { displayId: string; position: number }[]; changed: boolean } {
  const navigated = states.filter(state => {
    const known = group.known[state.display.id];
    return Boolean(known && state.at && known.fingerprint === state.fingerprint && known.position !== state.at.position);
  });
  const leader = navigated.reduce<SyncState | undefined>((best, state) => !best || (Date.parse(state.display.updatedAt) || 0) > (Date.parse(best.display.updatedAt) || 0) ? state : best, undefined);
  const next: SyncGroup = { ...group, displayIds: states.map(state => state.display.id), position: leader?.at ? leader.at.position : group.position, known: {}, lagging: [] };
  const writes: { displayId: string; position: number }[] = [], lagging = new Set(group.lagging);
  for (const state of states) {
    const displayId = state.display.id, known = group.known[displayId];
    let position = state.at?.position ?? null;
    const sameContent = known !== undefined && known.fingerprint === state.fingerprint;
    const follow = sameContent && (leader ? displayId !== leader.display.id : lagging.has(displayId));
    if (follow && state.at && next.position !== null) {
      const wanted = Math.min(next.position, state.at.count - 1);
      if (wanted !== position) {
        if (state.display.held) next.lagging.push(displayId);
        else { writes.push({ displayId, position: wanted }); position = wanted; }
      }
    }
    next.known[displayId] = { fingerprint: state.fingerprint, position };
  }
  const changed = writes.length > 0 || groupKey(next) !== groupKey(group);
  return { group: changed ? { ...next, updatedAt: now() } : group, writes, changed };
}

export class DisplaySync {
    private readonly queues = new Map<string, Promise<void>>();
    constructor(private readonly host: DisplaySyncHost) { }
    /** Called after every committed display change; work is serialized per session. */
    changed(sessionId: string): void {
        const run = (this.queues.get(sessionId) ?? Promise.resolve()).then(() => this.reconcile(sessionId)).catch(() => { if (!this.host.closed())
            console.error('KANVAS display sync failed.'); });
        this.queues.set(sessionId, run);
        void run.finally(() => { if (this.queues.get(sessionId) === run)
            this.queues.delete(sessionId); });
    }
    /** Resolves once queued synchronization for the session has finished. */
    async idle(sessionId: string): Promise<void> {
        for (let pending = this.queues.get(sessionId); pending; pending = this.queues.get(sessionId))
            await pending;
    }
    private async load(sessionId: string): Promise<{
        doc: SyncDocument;
        groups: {
            group: SyncGroup;
            states: SyncState[];
        }[];
    } | undefined> {
        const doc = (await this.host.store.get<SyncDocument>('display-sync', sessionId));
        if (!doc?.groups?.length)
            return undefined;
        const groups: {
            group: SyncGroup;
            states: SyncState[];
        }[] = [];
        for (const group of doc.groups)
            groups.push({ group, states: (await this.states(sessionId, group.displayIds)) });
        return { doc, groups };
    }
    private async states(sessionId: string, displayIds: readonly string[]): Promise<SyncState[]> {
        const states: SyncState[] = [];
        for (const displayId of displayIds) {
            const display = (await this.host.store.get<SyncDisplay>('display', displayId));
            if (display && display.sessionId === sessionId)
                states.push({ display, fingerprint: syncFingerprint(display.view), at: syncPosition(display.view) });
        }
        return states;
    }
    private async reconcile(sessionId: string): Promise<void> {
        if (this.host.closed())
            return;
        // Most display changes need nothing; only then take the write lock.
        const peek = (await this.load(sessionId));
        if (!peek || !peek.groups.some(({ group, states }) => planSync(group, states).changed))
            return;
        await this.host.store.transaction(async () => {
            const fresh = (await this.load(sessionId));
            if (!fresh)
                return;
            const groups: SyncGroup[] = [];
            let changed = false;
            for (const { group, states } of fresh.groups) {
                const plan = planSync(group, states);
                for (const write of plan.writes) {
                    const state = states.find(entry => entry.display.id === write.displayId);
                    if (state)
                        (await this.write(state.display, write.position));
                }
                changed = changed || plan.changed;
                if (plan.group.displayIds.length >= 2)
                    groups.push(plan.group);
                else
                    changed = true;
            }
            if (!changed)
                return;
            if (groups.length)
                (await this.host.store.put('display-sync', { ...fresh.doc, groups, updatedAt: now() }));
            else
                (await this.host.store.delete('display-sync', sessionId));
        });
    }
    /** Moves one display like a navigation: new revision and in-place history position, no
     * new publication, and in-flight renders for the display are not discarded. */
    private async write(display: SyncDisplay, position: number): Promise<void> {
        if (!display.view)
            return;
        const view = withSyncPosition(display.view, position);
        (await this.host.history.ensure(display));
        display.view = view;
        display.revision++;
        display.updatedAt = now();
        (await this.host.store.put('display', display));
        (await this.host.history.record(display, 'display-sync'));
        this.host.emit({ type: 'display', sessionId: display.sessionId, displayId: display.id, revision: display.revision });
    }
    async configure(principal: AuthPrincipal, raw: unknown) {
        const input = displaysSyncSchema.parse(raw), ids = [...new Set(input.displayIds)], aligned: string[] = [];
        (await this.host.access(principal, input.sessionId, 'editor'));
        (await this.host.store.transaction(async () => {
            for (const displayId of ids)
                (await this.host.display(principal, input.sessionId, displayId, 'editor'));
            const stored = (await this.host.store.get<SyncDocument>('display-sync', input.sessionId));
            const doc: SyncDocument = stored ?? { id: input.sessionId, sessionId: input.sessionId, groups: [], updatedAt: now() };
            if (input.action === 'unlink') {
                const removed = new Set(ids);
                doc.groups = doc.groups.map(group => group.displayIds.some(displayId => removed.has(displayId)) ? {
                    ...group, displayIds: group.displayIds.filter(displayId => !removed.has(displayId)), lagging: group.lagging.filter(displayId => !removed.has(displayId)),
                    known: Object.fromEntries(Object.entries(group.known).filter(([displayId]) => !removed.has(displayId))), updatedAt: now(),
                } : group).filter(group => group.displayIds.length >= 2);
            }
            else {
                const merging = doc.groups.filter(group => group.displayIds.some(displayId => ids.includes(displayId)));
                const linked = new Set(merging.flatMap(group => group.displayIds)), members = [...new Set([...linked, ...ids])];
                if (members.length > SYNC_LIMITS.displays)
                    throw issue('displayIds', `A link holds at most ${SYNC_LIMITS.displays} displays; this would link ${members.length}.`);
                const others = doc.groups.filter(group => !merging.includes(group));
                if (others.length >= SYNC_LIMITS.groups)
                    throw issue('displayIds', `A session holds at most ${SYNC_LIMITS.groups} separate links.`);
                if (input.alignTo && !members.includes(input.alignTo))
                    throw issue('alignTo', 'alignTo must be one of the linked displays.');
                const states = (await this.states(input.sessionId, members)), byId = (displayId: string) => states.find(state => state.display.id === displayId);
                const preference = [...ids.filter(displayId => linked.has(displayId)), ...linked, ...ids];
                const leader = input.alignTo ? byId(input.alignTo) : preference.map(byId).find(state => state?.at);
                if (input.alignTo && !leader?.at)
                    throw issue('alignTo', 'alignTo must show a presentation, procedure or recipe.');
                const group: SyncGroup = { id: merging[0]?.id ?? `sync-${id().slice(0, 8)}`, displayIds: states.map(state => state.display.id), position: leader?.at?.position ?? merging[0]?.position ?? null, known: {}, lagging: [], createdAt: merging[0]?.createdAt ?? now(), updatedAt: now() };
                for (const state of states) {
                    let position = state.at?.position ?? null;
                    if (leader?.at && state !== leader && state.at && group.position !== null) {
                        const wanted = Math.min(group.position, state.at.count - 1);
                        if (wanted !== position) {
                            if (state.display.held)
                                group.lagging.push(state.display.id);
                            else {
                                (await this.write(state.display, wanted));
                                position = wanted;
                                aligned.push(state.display.id);
                            }
                        }
                    }
                    group.known[state.display.id] = { fingerprint: state.fingerprint, position };
                }
                if (group.displayIds.length < 2)
                    throw issue('displayIds', 'link needs at least two displays of this session.');
                doc.groups = [...others, group];
            }
            doc.updatedAt = now();
            if (doc.groups.length)
                (await this.host.store.put('display-sync', doc));
            else if (stored)
                (await this.host.store.delete('display-sync', input.sessionId));
        }));
        return { action: input.action, ...(input.action === 'link' ? { aligned } : {}), ...(await this.read(principal, { sessionId: input.sessionId })) };
    }
    async read(principal: AuthPrincipal, raw: unknown) {
        const input = displaysSyncReadSchema.parse(raw);
        (await this.host.access(principal, input.sessionId));
        const loaded = (await this.load(input.sessionId));
        const groups = (loaded?.groups ?? []).map(({ group, states }) => ({
            id: group.id, position: group.position, updatedAt: group.updatedAt,
            displays: states.map(({ display, at }) => ({ displayId: display.id, name: display.name, online: display.online, held: display.held, template: display.view?.template ?? null, position: at?.position ?? null, count: at?.count ?? null, ...(group.lagging.includes(display.id) ? { lagging: true } : {}) })),
        }));
        return {
            sessionId: input.sessionId, groups,
            next: groups.length ? "Navigate any linked display (kanvas_call with operationId:\"kanvas.presentation.navigate\" and arguments:{\u2026}, kanvas_call with operationId:\"kanvas.procedure.control\" and arguments:{\u2026} or on the display itself); the others follow. A republished deck keeps its own index: set data.index to position, or link again to re-align." : "No displays are linked. kanvas_call with operationId:\"kanvas.displays.sync\" and arguments:{\u2026} with action link and two or more displayIds links them.",
        };
    }
}
