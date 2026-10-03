import { sessionUsageLimits } from './usage-limits.js';
import { asyncMap, asyncReduce } from './async-collections.js';
import type { DisplayRecord, ViewSpec } from '../shared/types.js';
import { AppError, id, Store } from './store.js';

interface Entry { id: string; sessionId: string; displayId: string; revision: number; view: ViewSpec | null; createdAt: string; reason: string; archivedAt?:string; interactionEpoch?: string }
type HistoricalDisplay = DisplayRecord & { interactionEpoch?: string };
interface Timeline { id: string; sessionId: string; entries: string[]; cursor: number }
const MAX_ENTRIES = 60, MAX_BYTES = 6 * 1024 * 1024;

/** Actual prepared views, not reconstruction from old prompts. */
export class DisplayHistory {
  constructor(private readonly store: Store) {}
  private async timeline(display: HistoricalDisplay): Promise<Awaited<Timeline>> {
    const existing = (await this.store.get<Timeline>('display-timeline', display.id));
    if (existing) return existing;
    const initial: Timeline = { id: display.id, sessionId: display.sessionId, entries: [], cursor: -1 };
    (await this.store.put('display-timeline', initial));
    (await this.append(display, 'initial', initial));
    return (await this.store.get<Timeline>('display-timeline', display.id))!;
  }
  /** Reads expose the implicit initial view without materializing retained rows. */
  private async snapshot(display: HistoricalDisplay): Promise<Awaited<{ timeline: Timeline; entries: Entry[] }>> {
    const timeline = (await this.store.get<Timeline>('display-timeline', display.id));
    if (timeline) return { timeline, entries: (await asyncMap(timeline.entries, async key => (await this.store.get<Entry>('display-history', key))!)).filter(Boolean) };
    // This ID is only a local lookup key; ensure() assigns a durable history ID
    // when a mutation actually needs to retain the original view.
    const entry: Entry = { id: display.id, sessionId: display.sessionId, displayId: display.id, revision: display.revision, view: structuredClone(display.view), createdAt: display.updatedAt, reason: 'initial', interactionEpoch: display.interactionEpoch };
    return { timeline: { id: display.id, sessionId: display.sessionId, entries: [entry.id], cursor: 0 }, entries: [entry] };
  }
  async frames(display:DisplayRecord){const {timeline,entries}=(await this.snapshot(display));return entries.map((entry,index)=>({...entry,current:index===timeline.cursor}));}
  async ensure(display: HistoricalDisplay): Promise<Awaited<void>> {
    return this.store.atomic(async () => { (await this.timeline(display));
    });
  }
  /** Bound the live navigation list without permanently deleting retained source. */
  private async archiveEntry(key: string): Promise<void> {
    const entry = await this.store.get<Entry>('display-history', key, true);
    if (entry && !entry.archivedAt) { entry.archivedAt = new Date().toISOString(); await this.store.put('display-history', entry); }
  }
  private async append(display: HistoricalDisplay, reason: string, timeline: Timeline): Promise<Awaited<void>> {
    for (const key of timeline.entries.splice(timeline.cursor + 1)) await this.archiveEntry(key);
    const limit=(await sessionUsageLimits(this.store,display.sessionId)).views;
    if(display.view&&(await this.store.list<Entry>('display-history',display.sessionId,true)).filter(e=>e.view).length>=limit)throw new AppError('LIMIT_REACHED',`Trial session view limit (${limit}) reached. Existing views remain available. Contact the administrator about upgrading. Archived views still count.`,429);
    const entry: Entry = { id: id(), sessionId: display.sessionId, displayId: display.id, revision: display.revision, view: structuredClone(display.view), createdAt: display.updatedAt, reason, interactionEpoch: display.interactionEpoch };
    (await this.store.put('display-history', entry)); timeline.entries.push(entry.id); timeline.cursor = timeline.entries.length - 1;
    const size = async () => (await asyncReduce(timeline.entries, async (total, key) => total + Buffer.byteLength(JSON.stringify((await this.store.get<Entry>('display-history', key)) ?? {})), 0));
    while (timeline.entries.length > 1 && (timeline.entries.length > MAX_ENTRIES || (await size()) > MAX_BYTES)) {
      await this.archiveEntry(timeline.entries.shift()!); timeline.cursor--;
    }
    (await this.store.put('display-timeline', timeline));
  }
  async record(display: HistoricalDisplay, reason: string): Promise<Awaited<void>> {
    return this.store.atomic(async () => {
    const timeline = (await this.timeline(display));
    const current = (await this.store.get<Entry>('display-history', timeline.entries[timeline.cursor]));
    if (current?.revision === display.revision) return;
    (await this.append(display, reason, timeline));

    });
  }
  async list(display: DisplayRecord) {
    const { timeline, entries } = (await this.snapshot(display));
    return { displayId: display.id, currentRevision: display.revision, cursor: timeline.cursor, canGoBack: timeline.cursor > 0, canGoForward: timeline.cursor < timeline.entries.length - 1,
      entries: entries.map((entry, index) => {
        return { id:entry.id, revision: entry.revision, template: entry.view?.template ?? null, title: entry.view?.title, createdAt: entry.createdAt, reason: entry.reason, current: index === timeline.cursor };
      }), limits: { entries: MAX_ENTRIES, bytes: MAX_BYTES } };
  }
  async target(display: DisplayRecord, direction?: 'back' | 'forward', revision?: number): Promise<Awaited<{ entry: Entry; cursor: number }>> {
    const { timeline, entries } = (await this.snapshot(display));
    const cursor = direction ? timeline.cursor + (direction === 'back' ? -1 : 1) : entries.findIndex(entry => entry.revision === revision);
    const entry = cursor >= 0 && cursor < entries.length ? entries[cursor] : undefined;
    if (!entry) throw new AppError('HISTORY_BOUNDARY', 'There is no retained view at that history position. Read display history for available revisions.', 409);
    return { entry, cursor };
  }
  async moved(display: DisplayRecord, cursor: number): Promise<Awaited<void>> {
    return this.store.atomic(async () => {
    const timeline = (await this.timeline(display)); timeline.cursor = cursor; (await this.store.put('display-timeline', timeline));

    });
  }
}
