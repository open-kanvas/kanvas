import {derivedViewLabel} from '../shared/view-label.js';
import {limitError} from './limit-errors.js';
import { SESSION_VIEW_LIMIT } from './usage-limits.js';
import { asyncMap } from './async-collections.js';
import type { DisplayRecord, ViewSpec } from '../shared/types.js';
import { AppError, id, Store } from './store.js';

interface Entry { /** Derived at write time for a view without a title. */ label?: string; id: string; sessionId: string; displayId: string; revision: number; view: ViewSpec | null; createdAt: string; reason: string; archivedAt?:string; interactionEpoch?: string; zoomRoot?: number }
type HistoricalDisplay = DisplayRecord & { interactionEpoch?: string };
interface Timeline { id: string; sessionId: string; entries: string[]; cursor: number }


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
  private async snapshot(display: HistoricalDisplay, metadataOnly=false): Promise<Awaited<{ timeline: Timeline; entries: Entry[] }>> {
    const timeline = (await this.store.get<Timeline>('display-timeline', display.id));
    if (timeline) {
      if(!metadataOnly)return {timeline,entries:(await asyncMap(timeline.entries,async key=>await this.store.get<Entry>('display-history',key))).filter((e):e is Entry=>Boolean(e))};
      const rows=(await this.store.query<{value:Entry}>(`SELECT ((value::jsonb - 'view') || jsonb_build_object('view',CASE WHEN value::jsonb->'view'='null'::jsonb THEN NULL ELSE jsonb_build_object('version',1,'template',value::jsonb#>>'{view,template}','title',value::jsonb#>>'{view,title}','data',jsonb_build_object('index',value::jsonb#>'{view,data,index}','text',left(value::jsonb#>>'{view,data,text}',300),'value',left(value::jsonb#>>'{view,data,value}',300),'images',CASE WHEN jsonb_typeof(value::jsonb#>'{view,data,images}')='array' THEN jsonb_build_array((value::jsonb#>'{view,data,images}')->0) ELSE NULL END,'slides',CASE WHEN jsonb_typeof(value::jsonb#>'{view,data,slides}')='array' THEN (SELECT jsonb_agg(jsonb_build_object('version',1,'template',slide->>'template','title',slide->>'title','data','{}'::jsonb)) FROM jsonb_array_elements(value::jsonb#>'{view,data,slides}') slide) ELSE NULL END)) END)) AS value FROM documents WHERE kind='display-history' AND id=ANY($1::text[]) AND NOT value::jsonb ? 'archivedAt'`,[timeline.entries])).rows;
      const byId=new Map(rows.map(row=>[row.value.id,row.value]));return {timeline,entries:timeline.entries.flatMap(id=>byId.has(id)?[byId.get(id)!]:[])};
    }
    // This ID is only a local lookup key; ensure() assigns a durable history ID
    // when a mutation actually needs to retain the original view.
    const entry: Entry = { id: display.id, sessionId: display.sessionId, displayId: display.id, revision: display.revision, view: structuredClone(display.view), createdAt: display.updatedAt, reason: 'initial', interactionEpoch: display.interactionEpoch, zoomRoot: display.zoomRoot ?? display.navigationRoot ?? display.revision };
    return { timeline: { id: display.id, sessionId: display.sessionId, entries: [entry.id], cursor: 0 }, entries: [entry] };
  }
  async frames(display:DisplayRecord,metadataOnly=false){const {timeline,entries}=(await this.snapshot(display,metadataOnly));return entries.map((entry,index)=>({...entry,current:index===timeline.cursor}));}
  async ensure(display: HistoricalDisplay): Promise<Awaited<void>> {
    return this.store.atomic(async () => { (await this.timeline(display));
    });
  }
  async retainedCount(sessionId:string){return Number((await this.store.query<{n:string}>("SELECT count(*) AS n FROM documents WHERE kind='display-history' AND session_id=$1 AND value::jsonb->'view' IS NOT NULL AND value::jsonb->'view'<>'null'::jsonb",[sessionId])).rows[0].n);}
  private async append(display: HistoricalDisplay, reason: string, timeline: Timeline): Promise<void> {
    // Publishing while browsing appends, never discards the forward branch.
    if(display.view&&await this.retainedCount(display.sessionId)>=SESSION_VIEW_LIMIT)
      throw limitError({code:'VIEW_LIMIT_REACHED',limit:SESSION_VIEW_LIMIT,used:SESSION_VIEW_LIMIT,resource:'views',tier:'fixed',whatYouCanDo:['Everything already shown stays available; publishing was refused to preserve every earlier view.','Permanently delete retained views that are no longer needed, or continue in a new session.']});
    const entry: Entry = { id: id(), sessionId: display.sessionId, displayId: display.id, revision: display.revision, view: structuredClone(display.view), createdAt: display.updatedAt, reason, interactionEpoch: display.interactionEpoch, zoomRoot: display.zoomRoot ?? display.navigationRoot ?? display.revision, ...(derivedViewLabel(display.view) ? { label: derivedViewLabel(display.view) } : {}) };
    (await this.store.put('display-history', entry)); timeline.entries.push(entry.id); timeline.cursor = timeline.entries.length - 1;
    (await this.store.put('display-timeline', timeline));
  }
  async record(display: HistoricalDisplay, reason: string): Promise<Awaited<void>> {
    return this.store.atomic(async () => {
    const timeline = (await this.timeline(display));
    const current = (await this.store.get<Entry>('display-history', timeline.entries[timeline.cursor]));
    if (current?.revision === display.revision) return;
    if(current && ['presentation.navigate','procedure.navigate','display-sync'].includes(reason)) {
      // The retained publication keeps its identity and creation time; only its
      // current navigation state/revision changes. No history slot is consumed.
      await this.store.put('display-history',{...current,revision:display.revision,view:structuredClone(display.view)});
    } else (await this.append(display, reason, timeline));

    });
  }
  async list(display: DisplayRecord) {
    const { timeline, entries } = (await this.snapshot(display,true));
    return { displayId: display.id, currentRevision: display.revision, cursor: timeline.cursor, canGoBack: timeline.cursor > 0, canGoForward: timeline.cursor < timeline.entries.length - 1,
      entries: entries.map((entry, index) => {
        return { id:entry.id, revision: entry.revision, template: entry.view?.template ?? null, title: entry.view?.title ?? entry.label ?? derivedViewLabel(entry.view), createdAt: entry.createdAt, reason: entry.reason, current: index === timeline.cursor };
      }), limits: { entries: SESSION_VIEW_LIMIT, scope: 'session' } };
  }
  async target(display: DisplayRecord, direction?: 'back' | 'forward', revision?: number): Promise<Awaited<{ entry: Entry; cursor: number }>> {
    const { timeline, entries } = (await this.snapshot(display,true));
    const cursor = direction ? timeline.cursor + (direction === 'back' ? -1 : 1) : entries.findIndex(entry => entry.revision === revision);
    const entry = cursor >= 0 && cursor < entries.length ? entries[cursor] : undefined;
    if (!entry) throw new AppError('HISTORY_BOUNDARY', 'There is no retained view at that history position. Read display history for available revisions.', 409);
    return { entry:await this.store.get<Entry>('display-history',entry.id)??entry, cursor };
  }
  async moved(display: DisplayRecord, cursor: number): Promise<Awaited<void>> {
    return this.store.atomic(async () => {
    const timeline = (await this.timeline(display)); timeline.cursor = cursor; (await this.store.put('display-timeline', timeline));

    });
  }
}
