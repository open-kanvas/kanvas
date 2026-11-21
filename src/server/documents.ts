import {assertExpectedRevision} from './revisions.js';
import {z} from 'zod';
import type {DisplayRecord,UpdateRecord,ViewSpec} from '../shared/types.js';
import type {AuthPrincipal} from './auth.js';
import {AppError} from './store.js';
import {InputError} from './input-errors.js';
import {DRAFTING_LIMITS,draftingDataSchema,isDraftTextBoundary,validDraftRange,type DraftActor,type DraftRange,type DraftingData} from '../shared/drafting.js';
import {PLANNER_LIMITS,plannerCategoriesSchema,plannerConflicts,plannerDataSchema,plannerDaySchema,plannerIcs,plannerIdSchema,plannerItemSchema,plannerProblems,plannerProposalSchema,proposalImpact,proposalWarnings,reviewPlanner,type PlannerData,type PlannerProblem,type PlannerProposal} from '../shared/planner.js';

/** Server-held documents: the display's current view is the authoritative
 * document. Every change is a revisioned, idempotent mutation through the same
 * path as view patches, so history, delivery and request retries behave like
 * any other publication. */
export type DocumentKind = 'draft-edit' | 'draft-suggest' | 'draft-review' | 'planner-edit' | 'planner-suggest' | 'planner-review' | 'planner-finalize';
export interface DocumentDisplay extends DisplayRecord { generation: number; interactionEpoch?: string }
export interface DocumentFrame { revision: number; view: ViewSpec | null; createdAt: string; reason: string; current: boolean }
export interface MutationTarget { sessionId: string; displayId: string; requestId: string; expectedRevision?: number }
export interface MutationResult { update: UpdateRecord; summary: Record<string, unknown> }
export interface DocumentHost {
  transaction<T>(operation: () => Promise<T>): Promise<T>;
  display(principal: AuthPrincipal, sessionId: string, displayId: string, minimum: 'viewer' | 'editor'): Promise<DocumentDisplay>;
  retry(principal: AuthPrincipal, sessionId: string, requestId: string, kind: DocumentKind, payload: unknown): Promise<UpdateRecord | undefined>;
  verifyView(principal: AuthPrincipal, sessionId: string, view: ViewSpec): Promise<ViewSpec>;
  publish(principal: AuthPrincipal, input: MutationTarget, before: DocumentDisplay, view: ViewSpec, kind: DocumentKind): Promise<UpdateRecord>;
  frames(display: DocumentDisplay): Promise<DocumentFrame[]>;
  draftActor?(principal: AuthPrincipal, sessionId: string): Promise<{actor: DraftActor; multiUser: boolean}>;
}

export const issue = (path: string, problem: string) => new InputError([{ path, problem }]);
export function requireTemplate(view: ViewSpec | null, template: string, read: string): ViewSpec {
  if (!view) throw new AppError('INVALID_VIEW', `This display has no current view. Publish a ${template} view with show first.`, 400);
  if (view.template !== template) throw new AppError('INVALID_VIEW', `This display shows ${view.template}, not ${template}. Publish a ${template} view with show, or use the display that shows it (${read}).`, 400);
  return view;
}
const dataOf = (view: ViewSpec | null) => (view?.data ?? {}) as Record<string, unknown>;

export class DocumentOps {
  constructor(protected readonly host: DocumentHost) {}
  /** Retry first (exact replays return the original update), then revision
   * CAS, validation, a concurrency re-check and one publication. */
  protected async mutate(principal: AuthPrincipal, input: MutationTarget, kind: DocumentKind, template: string, read: string,
    change: (view: ViewSpec) => { data: object; summary: Record<string, unknown> }): Promise<MutationResult> {
    return this.host.transaction(async () => {
      const before = (await this.host.display(principal, input.sessionId, input.displayId, 'editor'));
      const previous = (await this.host.retry(principal, input.sessionId, input.requestId, kind, input));
      if (previous) return { update: previous, summary: { retried: true } };
      assertExpectedRevision(input.expectedRevision,before.revision);
      const view = requireTemplate(before.view, template, read);
      let { data, summary } = change(structuredClone(view));
      if (template === 'drafting' && this.host.draftActor) {
        const { actor, multiUser } = await this.host.draftActor(principal, input.sessionId);
        const draft = data as DraftingData;
        const activity: NonNullable<DraftingData['activity']> = [];
        const add = (action: NonNullable<DraftingData['activity']>[number]['action'], suggestionId?: string) => activity.push({ actor, action, suggestionId, revision: before.revision + 1, at: new Date().toISOString() });
        if (kind === 'draft-suggest') {
          const ids = new Set((summary.added as {id:string}[]).map(item => item.id));
          draft.suggestions = draft.suggestions.map(item => ids.has(item.id) ? { ...item, author: actor } : item);
          for (const id of ids) add('suggest', id);
        } else if (kind === 'draft-review') {
          for (const id of summary.accepted as string[]) add('accept', id);
          for (const id of summary.rejected as string[]) add('reject', id);
        } else add('edit');
        data = { ...draft, collaborative: multiUser || draft.collaborative || new Set([actor.id, ...(draft.activity ?? []).map(item => item.actor.id)]).size > 1, activity: [...(draft.activity ?? []), ...activity].slice(-50) };
      }
      const verified = (await this.host.verifyView(principal, input.sessionId, { ...view, data } as ViewSpec));
      const current = (await this.host.display(principal, input.sessionId, input.displayId, 'editor'));
      if (current.revision !== before.revision || current.generation !== before.generation || current.interactionEpoch !== before.interactionEpoch) {
        throw new AppError('REVISION_CONFLICT', `The display changed while applying this change. Call ${read} again and retry with a new requestId.`, 409);
      }
      return { update: (await this.host.publish(principal, input, before, verified, kind)), summary };
    });
  }
}

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const revision = z.number().int().nonnegative();
const mutation = { sessionId: identifier, displayId: identifier, expectedRevision: revision.optional(), requestId: identifier };
const offset = z.number().int().min(0).max(DRAFTING_LIMITS.text);
const suggestionId = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_.:-]+$/);
const draftStatus = z.enum(['drafting', 'reviewing', 'ready']);
const findText = z.string().min(1).max(DRAFTING_LIMITS.span);
const occurrence = z.number().int().min(1).max(10_000);

export const draftReadSchema = z.object({
  sessionId: identifier, displayId: identifier,
  fromCharacter: offset.optional().describe('Text window start (default 0).'),
  maxCharacters: z.number().int().min(200).max(30_000).optional().describe('Text window size (default 20000).'),
  compareToRevision: revision.optional().describe('Word diff from this retained revision.'),
}).strict();

const draftEdit = z.object({
  op: z.enum(['replace', 'find-replace', 'append', 'set-text']),
  start: offset.optional().describe('replace: start offset.'),
  end: offset.optional().describe('replace: exclusive end (= start inserts).'),
  find: findText.optional().describe('find-replace: exact text.'),
  occurrence: occurrence.optional().describe('find-replace: which occurrence (default 1).'),
  all: z.boolean().optional().describe('find-replace: every occurrence.'),
  text: z.string().max(DRAFTING_LIMITS.text).optional().describe('New text.'),
}).strict().superRefine((edit, ctx) => {
  const add = (key: string, message: string) => ctx.addIssue({ code: 'custom', path: [key], message });
  const forbid = (keys: string[]) => { for (const key of keys) if ((edit as Record<string, unknown>)[key] !== undefined) add(key, `${key} is not used by op ${edit.op}`); };
  if (edit.text === undefined) add('text', `op ${edit.op} needs text`);
  if (edit.op === 'replace') { if (edit.start === undefined) add('start', 'replace needs start'); if (edit.end === undefined) add('end', 'replace needs end'); forbid(['find', 'occurrence', 'all']); }
  else if (edit.op === 'find-replace') { if (edit.find === undefined) add('find', 'find-replace needs find'); forbid(['start', 'end']); if (edit.all && edit.occurrence !== undefined) add('occurrence', 'Use occurrence or all, not both'); }
  else { forbid(['start', 'end', 'find', 'occurrence', 'all']); if (edit.op === 'append' && edit.text === '') add('text', 'append needs non-empty text'); }
});
export type DraftEdit = z.infer<typeof draftEdit>;

export const draftEditSchema = z.object({
  ...mutation,
  edits: z.array(draftEdit).min(1).max(50).optional().describe('Non-overlapping; offsets refer to the text at expectedRevision.'),
  draftStatus: draftStatus.optional(),
  purpose: z.string().min(1).max(160).nullable().optional().describe('Short purpose hint; null removes it.'),
  focus: z.object({ start: offset, end: offset, label: z.string().max(160).optional() }).strict().nullable().optional().describe('Highlighted passage after the edits; null clears it.'),
}).strict().superRefine((value, ctx) => {
  if (value.edits === undefined && value.draftStatus === undefined && value.purpose === undefined && value.focus === undefined) ctx.addIssue({ code: 'custom', path: ['edits'], message: 'Supply edits, draftStatus, purpose or focus' });
});

export const draftSuggestSchema = z.object({
  ...mutation,
  suggestions: z.array(z.object({
    id: suggestionId.optional().describe('Reuse an id to replace that suggestion.'),
    start: offset.optional(), end: offset.optional(),
    find: findText.optional().describe('Anchor text, instead of start/end.'),
    occurrence: occurrence.optional(),
    replacement: z.string().max(DRAFTING_LIMITS.replacement).describe('Proposed text; empty proposes deletion.'),
    reason: z.string().max(500).optional(),
  }).strict().superRefine((item, ctx) => {
    const byRange = item.start !== undefined || item.end !== undefined;
    if (byRange && item.find !== undefined) ctx.addIssue({ code: 'custom', path: ['find'], message: 'Use start/end or find, not both' });
    else if (!byRange && item.find === undefined) ctx.addIssue({ code: 'custom', path: ['find'], message: 'Give start and end, or find' });
    else if (byRange && (item.start === undefined || item.end === undefined)) ctx.addIssue({ code: 'custom', path: ['end'], message: 'Give both start and end' });
    if (item.occurrence !== undefined && item.find === undefined) ctx.addIssue({ code: 'custom', path: ['occurrence'], message: 'occurrence needs find' });
  })).min(1).max(DRAFTING_LIMITS.suggestions),
  replaceSuggestions: z.boolean().optional().describe('Replace all existing suggestions.'),
}).strict();

/** Identical accept/reject/all fields for draft.review and planner.review, so
 * the public operation schema lists them once. */
const reviewFields = {
  accept: z.array(suggestionId).min(1).max(100).optional().describe('Ids to accept (apply).'),
  reject: z.array(suggestionId).min(1).max(100).optional().describe('Ids to reject (discard).'),
  all: z.enum(['accept', 'reject']).optional().describe('Decide every remaining one.'),
};
export const draftReviewSchema = z.object({ ...mutation, ...reviewFields, draftStatus: draftStatus.optional() }).strict().superRefine((value, ctx) => {
  if (!value.accept && !value.reject && !value.all) ctx.addIssue({ code: 'custom', path: ['accept'], message: 'Name ids to accept or reject, or set all' });
});

export interface TextChange { start: number; end: number; text: string; order: number }
export function applyTextChanges(text: string, changes: readonly TextChange[]): string {
  let out = '', cursor = 0;
  for (const change of changes) { out += text.slice(cursor, change.start) + change.text; cursor = change.end; }
  return out + text.slice(cursor);
}
/** Where an untouched range moves; undefined when a change overlaps or lands inside it. */
export function mapDraftRange<T extends DraftRange>(range: T, changes: readonly TextChange[]): T | undefined {
  let delta = 0;
  for (const change of changes) {
    if (change.end <= range.start) delta += change.text.length - (change.end - change.start);
    else if (change.start >= range.end) break;
    else return undefined;
  }
  return { ...range, start: range.start + delta, end: range.end + delta };
}
function occurrences(text: string, find: string, limit = 1000): DraftRange[] {
  const found: DraftRange[] = [];
  for (let at = text.indexOf(find); at >= 0 && found.length < limit; at = text.indexOf(find, at + find.length)) found.push({ start: at, end: at + find.length });
  return found;
}
function locate(text: string, find: string, which: number, path: string): DraftRange {
    const found = occurrences(text, find, which), hit = found[which - 1];
    if (!hit)
        throw issue(path, found.length ? `This text occurs only ${found.length} time${found.length === 1 ? '' : 's'} in the current draft.` : "This text does not occur in the current draft. Read kanvas_call with operationId:\"kanvas.draft.read\" and arguments:{\u2026} for the exact text.");
    return hit;
}
/** Resolve edits against one text into sorted, non-overlapping changes. */
export function resolveDraftEdits(text: string, edits: readonly DraftEdit[]): TextChange[] {
    const changes: TextChange[] = [];
    edits.forEach((edit, order) => {
        const path = `edits.${order}`, next = edit.text ?? '';
        if (edit.op === 'replace') {
            const start = edit.start ?? 0, end = edit.end ?? 0;
            if (start > end || end > text.length)
                throw issue(`${path}.end`, `Use 0 ≤ start ≤ end ≤ ${text.length}, the draft length at expectedRevision.`);
            if (!isDraftTextBoundary(text, start) || !isDraftTextBoundary(text, end))
                throw issue(path, 'Do not split an emoji or other supplementary character.');
            changes.push({ start, end, text: next, order });
        }
        else if (edit.op === 'find-replace') {
            const find = edit.find ?? '';
            const ranges = edit.all ? occurrences(text, find) : [locate(text, find, edit.occurrence ?? 1, `${path}.find`)];
            if (!ranges.length)
                throw issue(`${path}.find`, "This text does not occur in the current draft. Read kanvas_call with operationId:\"kanvas.draft.read\" and arguments:{\u2026} for the exact text.");
            for (const range of ranges)
                changes.push({ ...range, text: next, order });
        }
        else if (edit.op === 'append')
            changes.push({ start: text.length, end: text.length, text: next, order });
        else
            changes.push({ start: 0, end: text.length, text: next, order });
    });
    changes.sort((a, b) => a.start - b.start || a.order - b.order);
    for (let index = 1; index < changes.length; index++) {
        const previous = changes[index - 1]!, current = changes[index]!;
        if (current.start < previous.end)
            throw issue(`edits.${current.order}`, `This edit overlaps edit ${previous.order}. Combine them or send separate calls.`);
    }
    return changes;
}

const TOKENS = /\s+|[\p{L}\p{N}_]+(?:['’-][\p{L}\p{N}_]+)*|[^\s\p{L}\p{N}_]/gu;
export interface DiffHunk { op: 'equal' | 'insert' | 'delete'; text: string; elided?: number }
/** Bounded word-level diff for review; long unchanged stretches are elided. */
export function wordDiff(before: string, after: string, maxCharacters = 12_000): { hunks: DiffHunk[]; inserted: number; deleted: number; truncated: boolean } {
  const a = before.match(TOKENS) ?? [], b = after.match(TOKENS) ?? [];
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  const left = a.slice(prefix, a.length - suffix), right = b.slice(prefix, b.length - suffix), raw: DiffHunk[] = [];
  const push = (op: DiffHunk['op'], text: string) => { if (!text) return; const last = raw[raw.length - 1]; if (last && last.op === op) last.text += text; else raw.push({ op, text }); };
  push('equal', a.slice(0, prefix).join(''));
  const n = left.length, m = right.length;
  if (n && m && n * m <= 2_000_000) {
    const width = m + 1, table = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i * width + j] = left[i] === right[j] ? table[(i + 1) * width + j + 1]! + 1 : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (left[i] === right[j]) { push('equal', left[i]!); i++; j++; }
      else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) push('delete', left[i++]!);
      else push('insert', right[j++]!);
    }
    while (i < n) push('delete', left[i++]!);
    while (j < m) push('insert', right[j++]!);
  } else { push('delete', left.join('')); push('insert', right.join('')); }
  push('equal', a.slice(a.length - suffix).join(''));
  let inserted = 0, deleted = 0, used = 0, truncated = false;
  const hunks: DiffHunk[] = [];
  raw.forEach((hunk, index) => {
    if (hunk.op === 'insert') inserted += hunk.text.length; else if (hunk.op === 'delete') deleted += hunk.text.length;
    if (truncated) return;
    let out = hunk;
    if (hunk.op === 'equal' && hunk.text.length > 160) {
      const head = index === 0 ? '' : hunk.text.slice(0, 60), tail = index === raw.length - 1 ? '' : hunk.text.slice(-60);
      out = { op: 'equal', text: `${head}…${tail}`, elided: hunk.text.length - head.length - tail.length };
    }
    if (used + out.text.length > maxCharacters) { truncated = true; return; }
    used += out.text.length; hunks.push(out);
  });
  return { hunks, inserted, deleted, truncated };
}

const READ = 'draft.read';
const textOf = (view: ViewSpec | null) => { const value = dataOf(view).text; return typeof value === 'string' ? value : ''; };

/** Drafting: authoritative text, suggestions, focus and status on the server. */
/** Drafting: authoritative text, suggestions, focus and status on the server. */
export class DraftDocuments extends DocumentOps {
    async read(principal: AuthPrincipal, raw: unknown) {
        const input = draftReadSchema.parse(raw);
        const display = (await this.host.display(principal, input.sessionId, input.displayId, 'viewer'));
        const data = draftingDataSchema.parse(requireTemplate(display.view, 'drafting', READ).data);
        const drafts = (await this.host.frames(display)).filter(frame => frame.view?.template === 'drafting');
        const versions = drafts.slice(-20).map(frame => ({ revision: frame.revision, createdAt: frame.createdAt, reason: frame.reason, length: textOf(frame.view).length, ...(frame.current ? { current: true } : {}) }));
        let diff: (ReturnType<typeof wordDiff> & {
            fromRevision: number;
            toRevision: number;
        }) | undefined;
        if (input.compareToRevision !== undefined) {
            const frame = drafts.find(entry => entry.revision === input.compareToRevision);
            if (!frame)
                throw issue('compareToRevision', `Revision ${input.compareToRevision} is not a retained drafting revision of this display. Retained: ${drafts.map(entry => entry.revision).join(', ') || 'none'}.`);
            diff = { fromRevision: frame.revision, toRevision: display.revision, ...wordDiff(textOf(frame.view), data.text) };
        }
        const text = data.text;
        let size = input.maxCharacters ?? 20000, detail: 'full' | 'short' | 'ranges' = 'full';
        for (;;) {
            let from = Math.min(input.fromCharacter ?? 0, text.length);
            if (!isDraftTextBoundary(text, from))
                from--;
            let to = Math.min(text.length, from + size);
            if (!isDraftTextBoundary(text, to))
                to--;
            const clip = (value: string) => detail === 'short' && value.length > 300 ? `${value.slice(0, 300)}…` : value;
            const result = {
                sessionId: input.sessionId, displayId: input.displayId, revision: display.revision, status: data.status, ...(data.purpose ? { purpose: data.purpose } : {}),
                length: text.length, fromCharacter: from, toCharacter: to, truncated: from > 0 || to < text.length, text: text.slice(from, to),
                suggestions: data.suggestions.map(item => detail === 'ranges' ? { id: item.id, start: item.start, end: item.end }
                    : { id: item.id, start: item.start, end: item.end, ...(item.author ? { author: item.author } : {}), original: clip(text.slice(item.start, item.end)), replacement: clip(item.replacement), ...(item.reason ? { reason: item.reason } : {}) }),
                ...(detail === 'full' ? {} : { suggestionDetail: detail }),
                ...(data.focus ? { focus: data.focus } : {}),
                versions, attribution: data.attribution ?? 'auto', collaborative: data.collaborative ?? false, activity: data.activity ?? [], ...(diff ? { diff } : {}),
                next: "Use revision as expectedRevision for kanvas_call with operationId:\"kanvas.draft.edit\" and arguments:{\u2026}, kanvas_call with operationId:\"kanvas.draft.suggest\" and arguments:{\u2026} or kanvas_call with operationId:\"kanvas.draft.review\" and arguments:{\u2026}, each with a new requestId.",
            };
            if (Buffer.byteLength(JSON.stringify(result)) <= 40000)
                return result;
            if (size > 1000)
                size = Math.floor(size / 2);
            else if (detail === 'full')
                detail = 'short';
            else if (detail === 'short')
                detail = 'ranges';
            else
                return result;
        }
    }
    async edit(principal: AuthPrincipal, raw: unknown): Promise<MutationResult> {
        const input = draftEditSchema.parse(raw);
        return this.mutate(principal, input, 'draft-edit', 'drafting', READ, view => {
            const data = draftingDataSchema.parse(view.data);
            const changes = input.edits ? resolveDraftEdits(data.text, input.edits) : [];
            const text = applyTextChanges(data.text, changes);
            if (text.length > DRAFTING_LIMITS.text)
                throw issue('edits', `The draft would have ${text.length} characters; the limit is ${DRAFTING_LIMITS.text}.`);
            const kept: DraftingData['suggestions'] = [], dropped: string[] = [];
            for (const item of data.suggestions) {
                const moved = mapDraftRange(item, changes);
                if (moved)
                    kept.push(moved);
                else
                    dropped.push(item.id);
            }
            const next: DraftingData = { ...data, text, suggestions: kept };
            delete next.focus;
            let focusCleared = false;
            if (input.focus) {
                if (!validDraftRange(text, input.focus))
                    throw issue('focus', `Focus must cover 1–${DRAFTING_LIMITS.span} characters of the text after these edits (length ${text.length}).`);
                next.focus = input.focus;
            }
            else if (input.focus === undefined && data.focus) {
                const moved = mapDraftRange(data.focus, changes);
                if (moved)
                    next.focus = moved;
                else
                    focusCleared = true;
            }
            if (input.draftStatus)
                next.status = input.draftStatus;
            if (input.purpose === null)
                delete next.purpose;
            else if (input.purpose !== undefined)
                next.purpose = input.purpose;
            return { data: next, summary: { length: text.length, changes: changes.length, droppedSuggestions: dropped, suggestions: kept.length, status: next.status, ...(focusCleared ? { focusCleared: true } : {}) } };
        });
    }
    async suggest(principal: AuthPrincipal, raw: unknown): Promise<MutationResult> {
        const input = draftSuggestSchema.parse(raw);
        return this.mutate(principal, input, 'draft-suggest', 'drafting', READ, view => {
            const data = draftingDataSchema.parse(view.data);
            const replaced = new Set(input.suggestions.flatMap(item => item.id ? [item.id] : []));
            const base = input.replaceSuggestions ? [] : data.suggestions.filter(item => !replaced.has(item.id));
            const used = new Set([...data.suggestions.map(item => item.id), ...replaced]);
            let counter = 0;
            const nextId = () => {
                for (;;) {
                    const candidate = `s${(input.expectedRevision ?? 0) + 1}-${++counter}`;
                    if (!used.has(candidate)) {
                        used.add(candidate);
                        return candidate;
                    }
                }
            };
            const seen = new Set<string>();
            const added = input.suggestions.map((item, index) => {
                const path = `suggestions.${index}`;
                const range = item.find !== undefined ? locate(data.text, item.find, item.occurrence ?? 1, `${path}.find`) : { start: item.start ?? 0, end: item.end ?? 0 };
                if (!validDraftRange(data.text, range))
                    throw issue(path, `A suggestion must cover 1–${DRAFTING_LIMITS.span} characters of the current draft (length ${data.text.length}) without splitting a character.`);
                const id = item.id ?? nextId();
                if (seen.has(id))
                    throw issue(`${path}.id`, 'Use each suggestion id once per call.');
                seen.add(id);
                return { id, ...range, replacement: item.replacement, ...(item.reason ? { reason: item.reason } : {}) };
            });
            const all = [...base, ...added].sort((a, b) => a.start - b.start);
            for (let index = 1; index < all.length; index++) {
                const previous = all[index - 1]!, current = all[index]!;
                if (current.start < previous.end)
                    throw issue('suggestions', `Suggestion ${current.id} overlaps ${previous.id}. Suggestions must not overlap: reject or replace (same id) the other one first.`);
            }
            if (all.length > DRAFTING_LIMITS.suggestions)
                throw issue('suggestions', `A draft holds at most ${DRAFTING_LIMITS.suggestions} suggestions.`);
            return { data: { ...data, suggestions: all }, summary: { added: added.map(item => ({ id: item.id, start: item.start, end: item.end })), suggestions: all.length } };
        });
    }
    async review(principal: AuthPrincipal, raw: unknown): Promise<MutationResult> {
        const input = draftReviewSchema.parse(raw);
        return this.mutate(principal, input, 'draft-review', 'drafting', READ, view => {
            const data = draftingDataSchema.parse(view.data);
            const known = new Set(data.suggestions.map(item => item.id));
            const check = (key: string, ids: readonly string[]) => {
                const missing = ids.find(value => !known.has(value));
                if (missing)
                    throw issue(key, `There is no suggestion ${missing} at this revision. Read kanvas_call with operationId:"kanvas.draft.read" and arguments:{\u2026} for the current ids.`);
            };
            check('accept', input.accept ?? []);
            check('reject', input.reject ?? []);
            const accept = new Set(input.accept ?? []), reject = new Set(input.reject ?? []);
            const both = [...accept].find(value => reject.has(value));
            if (both)
                throw issue('reject', `Suggestion ${both} cannot be both accepted and rejected.`);
            if (input.all)
                for (const item of data.suggestions)
                    if (!accept.has(item.id) && !reject.has(item.id))
                        (input.all === 'accept' ? accept : reject).add(item.id);
            const applied = data.suggestions.filter(item => accept.has(item.id)).sort((a, b) => a.start - b.start);
            const changes = applied.map((item, order) => ({ start: item.start, end: item.end, text: item.replacement, order }));
            const text = applyTextChanges(data.text, changes);
            if (text.length > DRAFTING_LIMITS.text)
                throw issue('accept', `The draft would have ${text.length} characters; the limit is ${DRAFTING_LIMITS.text}.`);
            const remaining = data.suggestions.filter(item => !accept.has(item.id) && !reject.has(item.id)).flatMap(item => { const moved = mapDraftRange(item, changes); return moved ? [moved] : []; });
            const next: DraftingData = { ...data, text, suggestions: remaining };
            delete next.focus;
            const focus = data.focus ? mapDraftRange(data.focus, changes) : undefined;
            if (focus)
                next.focus = focus;
            if (input.draftStatus)
                next.status = input.draftStatus;
            return { data: next, summary: { accepted: applied.map(item => item.id), rejected: data.suggestions.filter(item => reject.has(item.id)).map(item => item.id), remaining: remaining.length, length: text.length, status: next.status, ...(data.focus && !focus ? { focusCleared: true } : {}) } };
        });
    }
}

const PLANNER_READ = 'planner.read';

export const plannerReadSchema = z.object({
  sessionId: identifier, displayId: identifier,
  includeIcs: z.boolean().optional().describe('iCalendar text of a committed plan.'),
}).strict();

export const plannerEditSchema = z.object({
  ...mutation,
  upsertItems: z.array(plannerItemSchema).min(1).max(PLANNER_LIMITS.items).optional().describe('New id adds; same id replaces.'),
  removeItemIds: z.array(plannerIdSchema).min(1).max(PLANNER_LIMITS.items).optional(),
  plannerView: z.enum(['day', 'three-day', 'week', 'month']).optional(),
  anchorDate: plannerDaySchema.optional().describe('A date inside the period shown.'),
  categories: plannerCategoriesSchema.optional(),
  discardProposals: z.boolean().optional().describe('Drop all pending proposals.'),
}).strict().superRefine((value, ctx) => {
  if (!value.upsertItems && !value.removeItemIds && !value.plannerView && !value.anchorDate && !value.categories && !value.discardProposals) ctx.addIssue({ code: 'custom', path: ['upsertItems'], message: 'Supply upsertItems, removeItemIds, plannerView, anchorDate, categories or discardProposals' });
});

export const plannerProposeSchema = z.object({
  ...mutation,
  proposals: z.array(plannerProposalSchema).min(1).max(PLANNER_LIMITS.proposals),
  replaceProposals: z.boolean().optional().describe('Replace all pending proposals.'),
}).strict();

export const plannerReviewSchema = z.object({ ...mutation, ...reviewFields }).strict().superRefine((value, ctx) => {
  if (!value.accept && !value.reject && !value.all) ctx.addIssue({ code: 'custom', path: ['accept'], message: 'Name ids to accept or reject, or set all' });
});

export const plannerFinalizeSchema = z.object(mutation).strict();

/** Problems in the combined proposal list, reported against the caller's own proposals. */
function proposalIssues(problems: readonly PlannerProblem[], offset: number): InputError {
  return new InputError(problems.slice(0, 20).map(({ path, message }) => {
    const [head, index, ...rest] = path;
    if (head === 'proposals' && typeof index === 'number') return index >= offset ? { path: ['proposals', index - offset, ...rest].join('.'), problem: message } : { path: 'proposals', problem: `Pending proposal ${index + 1}: ${message}` };
    return { path: path.join('.'), problem: message };
  }));
}
const withoutNotes = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'notes')) as T;

/** Schedule planning: the planner display's view is the authoritative plan.
 * Kanvas holds, versions and applies decisions; it never proposes, resolves
 * conflicts or writes to external calendars. */
/** Schedule planning: the planner display's view is the authoritative plan.
 * Kanvas holds, versions and applies decisions; it never proposes, resolves
 * conflicts or writes to external calendars. */
export class PlannerDocuments extends DocumentOps {
    async read(principal: AuthPrincipal, raw: unknown) {
        const input = plannerReadSchema.parse(raw);
        const display = (await this.host.display(principal, input.sessionId, input.displayId, 'viewer'));
        const data = plannerDataSchema.parse(requireTemplate(display.view, 'planner', PLANNER_READ).data);
        const committed = data.status === 'committed';
        const ics = input.includeIcs && committed ? plannerIcs(data, input.displayId) : undefined;
        const base = {
            sessionId: input.sessionId, displayId: input.displayId, revision: display.revision, status: data.status, view: data.view, anchorDate: data.anchorDate, timeZone: data.timeZone,
            ...(data.committedAt ? { committedAt: data.committedAt } : {}), ...(data.categories ? { categories: data.categories } : {}),
            itemsTotal: data.items.length, conflicts: plannerConflicts(data.items),
            next: committed ? "This plan is committed. kanvas_call with operationId:\"kanvas.planner.edit\" and arguments:{\u2026} (item changes) or kanvas_call with operationId:\"kanvas.planner.propose\" and arguments:{\u2026} reopen it as a draft; use revision as expectedRevision." : "Use revision as expectedRevision for kanvas_call with operationId:\"kanvas.planner.edit\" and arguments:{\u2026}, kanvas_call with operationId:\"kanvas.planner.propose\" and arguments:{\u2026}, kanvas_call with operationId:\"kanvas.planner.review\" and arguments:{\u2026} or kanvas_call with operationId:\"kanvas.planner.finalize\" and arguments:{\u2026}, each with a new requestId.",
        };
        let items: object[] = data.items, notes = true, withIcs = Boolean(ics), impact = true;
        const proposals = () => data.proposals.map(proposal => {
            const { before, after } = proposalImpact(data.items, proposal), trim = <T extends object>(value: T | undefined) => value && !notes ? withoutNotes(value) : value;
            return { ...proposal, ...(impact ? { before: trim(before), after: trim(after) } : {}), warnings: proposalWarnings(data, proposal) };
        });
        for (;;) {
            const result = {
                ...base, items, truncated: items.length < data.items.length, ...(notes ? {} : { itemDetail: 'Notes omitted to fit one result.' }), proposals: proposals(),
                ...(withIcs ? { ics } : input.includeIcs ? { icsNote: committed ? 'The iCalendar export does not fit in one result; build calendar entries from items instead.' : "The plan is still a draft. Commit it with kanvas_call with operationId:\"kanvas.planner.finalize\" and arguments:{\u2026} first; the export then covers the committed items." } : {}),
            };
            if (Buffer.byteLength(JSON.stringify(result)) <= 40000)
                return result;
            if (notes) {
                notes = false;
                items = data.items.map(item => withoutNotes(item));
            }
            else if (withIcs)
                withIcs = false;
            else if (impact)
                impact = false;
            else if (items.length > 1)
                items = items.slice(0, Math.ceil(items.length / 2));
            else
                return result;
        }
    }
    async edit(principal: AuthPrincipal, raw: unknown): Promise<MutationResult> {
        const input = plannerEditSchema.parse(raw);
        return this.mutate(principal, input, 'planner-edit', 'planner', PLANNER_READ, view => {
            const data = plannerDataSchema.parse(view.data);
            const upserts = input.upsertItems ?? [], removals = new Set(input.removeItemIds ?? []), upsertIds = upserts.map(item => item.id);
            if (new Set(upsertIds).size !== upsertIds.length)
                throw issue('upsertItems', 'Use each item id once per call.');
            const existing = new Set(data.items.map(item => item.id));
            const missing = [...removals].find(itemId => !existing.has(itemId));
            if (missing)
                throw issue('removeItemIds', `There is no item ${missing}. Read kanvas_call with operationId:"kanvas.planner.read" and arguments:{\u2026} for the current items.`);
            const clash = upsertIds.find(itemId => removals.has(itemId));
            if (clash)
                throw issue('removeItemIds', `Item ${clash} cannot be both upserted and removed.`);
            const replacing = new Map(upserts.map(item => [item.id, item] as const)), added = upserts.filter(item => !existing.has(item.id));
            const items = [...data.items.filter(item => !removals.has(item.id)).map(item => replacing.get(item.id) ?? item), ...added];
            if (items.length > PLANNER_LIMITS.items)
                throw issue('upsertItems', `A plan holds at most ${PLANNER_LIMITS.items} items.`);
            const kept: PlannerProposal[] = [], dropped: string[] = input.discardProposals ? data.proposals.map(proposal => proposal.id) : [];
            for (const proposal of input.discardProposals ? [] : data.proposals) {
                if (plannerProblems({ items, proposals: [...kept, proposal] }).length)
                    dropped.push(proposal.id);
                else
                    kept.push(proposal);
            }
            const reopened = data.status === 'committed' && (upserts.length > 0 || removals.size > 0);
            const next: PlannerData = { ...data, items, proposals: kept, ...(input.plannerView ? { view: input.plannerView } : {}), ...(input.anchorDate ? { anchorDate: input.anchorDate } : {}), ...(input.categories ? { categories: input.categories } : {}) };
            if (reopened) {
                next.status = 'draft';
                delete next.committedAt;
            }
            return { data: next, summary: { items: items.length, added: added.map(item => item.id), removed: [...removals], proposals: kept.length, ...(dropped.length ? { droppedProposals: dropped } : {}), conflicts: plannerConflicts(items).length, status: next.status, ...(reopened ? { reopened: true } : {}) } };
        });
    }
    async propose(principal: AuthPrincipal, raw: unknown): Promise<MutationResult> {
        const input = plannerProposeSchema.parse(raw);
        return this.mutate(principal, input, 'planner-suggest', 'planner', PLANNER_READ, view => {
            const data = plannerDataSchema.parse(view.data);
            const replacing = new Set(input.proposals.map(proposal => proposal.id));
            const base = input.replaceProposals ? [] : data.proposals.filter(proposal => !replacing.has(proposal.id));
            const proposals = [...base, ...input.proposals];
            if (proposals.length > PLANNER_LIMITS.proposals)
                throw issue('proposals', `A plan holds at most ${PLANNER_LIMITS.proposals} pending proposals. Decide or discard some first.`);
            const problems = plannerProblems({ items: data.items, proposals });
            if (problems.length)
                throw proposalIssues(problems, base.length);
            const reopened = data.status === 'committed';
            const next: PlannerData = { ...data, proposals };
            if (reopened) {
                next.status = 'draft';
                delete next.committedAt;
            }
            return { data: next, summary: { added: input.proposals.map(proposal => proposal.id), proposals: proposals.length, status: next.status, ...(reopened ? { reopened: true } : {}) } };
        });
    }
    async review(principal: AuthPrincipal, raw: unknown): Promise<MutationResult> {
        const input = plannerReviewSchema.parse(raw);
        return this.mutate(principal, input, 'planner-review', 'planner', PLANNER_READ, view => {
            const data = plannerDataSchema.parse(view.data);
            const known = new Set(data.proposals.map(proposal => proposal.id));
            for (const key of ['accept', 'reject'] as const) {
                const missing = (input[key] ?? []).find(proposalId => !known.has(proposalId));
                if (missing)
                    throw issue(key, `There is no pending proposal ${missing} at this revision. Read kanvas_call with operationId:"kanvas.planner.read" and arguments:{\u2026} for the current ids.`);
            }
            const accept = new Set(input.accept ?? []), reject = new Set(input.reject ?? []);
            const both = [...accept].find(proposalId => reject.has(proposalId));
            if (both)
                throw issue('reject', `Proposal ${both} cannot be both accepted and rejected.`);
            if (input.all)
                for (const proposal of data.proposals)
                    if (!accept.has(proposal.id) && !reject.has(proposal.id))
                        (input.all === 'accept' ? accept : reject).add(proposal.id);
            const reviewed = reviewPlanner(data, accept, reject);
            if (reviewed.data.items.length > PLANNER_LIMITS.items)
                throw issue('accept', `The plan would hold more than ${PLANNER_LIMITS.items} items.`);
            return { data: reviewed.data, summary: { accepted: reviewed.accepted, rejected: reviewed.rejected, remaining: reviewed.data.proposals.length, conflicts: plannerConflicts(reviewed.data.items).length, status: reviewed.data.status } };
        });
    }
    async finalize(principal: AuthPrincipal, raw: unknown): Promise<MutationResult> {
        const input = plannerFinalizeSchema.parse(raw);
        return this.mutate(principal, input, 'planner-finalize', 'planner', PLANNER_READ, view => {
            const data = plannerDataSchema.parse(view.data);
            if (data.status === 'committed')
                throw issue('expectedRevision', `This plan is already committed${data.committedAt ? ` (${data.committedAt})` : ''}. kanvas_call with operationId:"kanvas.planner.edit" and arguments:{\u2026} or kanvas_call with operationId:"kanvas.planner.propose" and arguments:{\u2026} reopen it as a draft.`);
            if (data.proposals.length)
                throw issue('expectedRevision', `${data.proposals.length === 1 ? '1 proposal is' : `${data.proposals.length} proposals are`} still pending. Decide them with kanvas_call with operationId:"kanvas.planner.review" and arguments:{\u2026}, or drop them with kanvas_call with operationId:"kanvas.planner.edit" and arguments:{\u2026} discardProposals, before finalizing.`);
            const conflicts = plannerConflicts(data.items), committedAt = new Date().toISOString();
            return { data: { ...data, status: 'committed', committedAt }, summary: { status: 'committed', committedAt, items: data.items.length, conflicts: conflicts.length, ...(conflicts.length ? { conflictNote: 'Committed with the conflicts shown; Kanvas never resolves them.' } : {}), next: "kanvas_call with operationId:\"kanvas.planner.read\" and arguments:{\u2026} with includeIcs returns iCalendar text for a calendar tool." } };
        });
    }
}
