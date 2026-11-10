import { timelineScale } from '../shared/timeline.js';
import type { ExtendedData } from '../shared/extended-templates.js';
import { instrumentDataSchema, changeInstrument, changeInstrumentSequence } from '../shared/instrument.js';
import { captionDataSchema, changeCaptionSequence } from '../shared/local-sequence.js';
import {assertExpectedRevision} from './revisions.js';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { VIEW_PATCH_LIMITS, viewPatchSchema, type ViewPatchInput, type ViewPatchOperation } from '../shared/view-patch.js';
import { assertJsonBudget, validateView } from '../shared/view-schemas.js';
import type { DisplayRecord, UpdateRecord, ViewSpec } from '../shared/types.js';
import type { AuthPrincipal } from './auth.js';
import { InputError, validationIssues } from './input-errors.js';
import { AppError } from './store.js';
import { participationCompatible } from './participation.js';

export interface ViewPatchDisplay extends DisplayRecord {
  generation: number;
  interactionEpoch?: string;
  targetAgentId?: string;
}

/**
 * All callbacks are awaited inside one host transaction. The host
 * keeps the ordinary domain ACL, durable request namespace and publication
 * machinery; this engine has no interpreter or direct persistence shortcut.
 */
export interface ViewPatchHost {
  transaction<T>(operation: () => T | Promise<T>): Promise<T>;
  /** Must authorize current editor/publish access, including display scope. */
  display(principal: AuthPrincipal, sessionId: string, displayId: string): Promise<Awaited<ViewPatchDisplay>>;
  /** Durable principal/session/requestId dedupe, using kind='patch' and the entire input. */
  retry(principal: AuthPrincipal, input: ViewPatchInput): Promise<Awaited<UpdateRecord | undefined>>;
  /** Reuse domain schema validation, authoritative source materialization and asset ACLs. */
  verifyView(principal: AuthPrincipal, sessionId: string, view: ViewSpec): Promise<Awaited<ViewSpec>>;
  /**
   * Guard against a changed revision/generation; preserve interactionEpoch and
   * response records. Increment revision/generation, record history, create a
   * deterministic prepared update and pending delivery, and save request dedupe
   * atomically. Emit invalidations only after the surrounding transaction.
   */
  publish(principal: AuthPrincipal, input: ViewPatchInput, before: ViewPatchDisplay, view: ViewSpec): Promise<Awaited<UpdateRecord>>;
}

const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor']);
const inputFields = new Set(['sessionId', 'displayId', 'requestId', 'expectedRevision', 'operations', 'op', 'path', 'value', 'itemId', 'action', 'beforeId', 'eventId', 'text', 'detail', 'checked']);
const participationTemplates = new Set(['poll', 'form', 'qa']);
const responseFields = new Set(['responseState', 'responses', 'participants', 'totalVotes', 'totalResponses', 'counts', 'count', 'votes', 'voteCount', 'responseCount', 'selectedOptionIds', 'entries', 'submitted']);
const arrayIndex = /^(?:0|[1-9]\d*)$/;

const unsupported = (message: string): never => { throw new AppError('PATCH_UNSUPPORTED', message); };
const pathConflict = (): never => { throw new AppError('PATCH_PATH_CONFLICT', 'A patch path no longer names an existing parent/item, or the target is not text. Read kanvas_display_current and rebuild the patch.', 409); };

function parseInput(raw: unknown): ViewPatchInput {
  try {
    assertJsonBudget(raw, VIEW_PATCH_LIMITS.bytes, VIEW_PATCH_LIMITS.nodes);
    // assertJsonBudget also accepts undefined for internal view callers. The
    // patch/dedupe wire contract must be actual JSON, including nested values.
    const visit = (value: unknown): void => {
      if (value === undefined) throw new Error('Not JSON');
      if (Array.isArray(value)) for (let index = 0; index < value.length; index++) visit(value[index]);
      else if (value && typeof value === 'object') for (const item of Object.values(value)) visit(item);
    };
    visit(raw);
  } catch {
    throw new InputError([{ path: 'operations', problem: `Supply plain JSON within ${VIEW_PATCH_LIMITS.bytes} UTF-8 bytes and the supported depth/node limits; reserved object keys are forbidden.`, maximum: VIEW_PATCH_LIMITS.bytes, unit: 'bytes' }]);
  }
  const parsed = viewPatchSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = validationIssues(parsed.error);
    throw new InputError(issues.map((issue, index) => ({ ...issue, path: parsed.error.issues[index].path.map(part => typeof part === 'number' ? `[${part}]` : inputFields.has(String(part)) ? String(part) : '<record-key>').join('.') || 'input' })));
  }
  return parsed.data;
}

function pathParts(path: string): string[] {
  if (!path.startsWith('/data/')) unsupported('Patch only a specific /data/... field. Use the dedicated tool for view identity, source, actions, access or display metadata.');
  const parts = path.slice(1).split('/');
  if (parts.length > VIEW_PATCH_LIMITS.pathDepth) unsupported('This patch path exceeds the supported depth. Target a narrower data field.');
  return parts.map(part => {
    if (!part || /~(?:[^01]|$)/.test(part)) unsupported('Use a nonempty JSON-pointer field; escape ~ as ~0 and / as ~1.');
    const decoded = part.replaceAll('~1', '/').replaceAll('~0', '~');
    if (unsafeKeys.has(decoded)) unsupported('Reserved object keys are not patchable.');
    return decoded;
  });
}

function existingIndex(part: string, values: unknown[]): number {
  if (!arrayIndex.test(part)) return pathConflict();
  const index = Number(part);
  if (!Number.isSafeInteger(index) || index >= values.length || !Object.hasOwn(values, index)) return pathConflict();
  return index;
}

/** Do not cross a nested view envelope or mutate source/response authorities. */
function assertPatchTarget(view: ViewSpec, parts: string[]): void {
  let leaf = view, relative = parts.slice(1);
  if(leaf.template==='split-screen'){
    if(relative.length===1&&relative[0]==='direction')return;
    if(relative[0]!=='panes'||relative[2]!=='view')unsupported('Patch a pane at /data/panes/N/view or its data; pane IDs/count remain stable until a new submission.');
    const pane=(leaf.data.panes as {view:ViewSpec}[])[existingIndex(relative[1],leaf.data.panes as unknown[])];
    if(relative.length===3)return;
    return assertPatchTarget(pane.view,relative.slice(3));
  }
  while (leaf.template === 'presentation') {
    if (relative[0] === 'index' && relative.length === 1) return;
    if (relative[0] !== 'slides' || relative.length < 4 || relative[2] !== 'data') {
      unsupported('For a presentation, patch /data/index or /data/slides/N/data/... . Slides, their identities, actions and sources cannot be replaced by a patch.');
    }
    const slides = leaf.data.slides as ViewSpec[];
    leaf = slides[existingIndex(relative[1], slides)];
    relative = relative.slice(3);
  }
  if (relative[0] === 'binding') unsupported('Source bindings are not patchable. Submit an explicit source-bound view to change the selected source or transformation.');
  if (leaf.data.binding) {
    const derived = leaf.template === 'table' ? ['rows', 'columns', 'summary'] : leaf.template === 'chart' ? ['series', 'summary'] : leaf.template === 'number' ? ['value', 'summary'] : [];
    if (derived.includes(relative[0])) throw new AppError('PATCH_SOURCE_CONFLICT', 'This field is derived from an authoritative dataset. A view patch cannot overwrite its values; update the source through its dedicated operation.', 409);
  }
  if (participationTemplates.has(leaf.template) && relative.some(part => responseFields.has(part))) {
    unsupported('Audience responses and totals are server-owned. Use the authenticated participation action; patch only compatible poll/form/QA display state.');
  }
  if (leaf.template === 'join' && ['url', 'qr', 'expiresAt'].includes(relative[0])) {
    unsupported('Invitation identity and expiry are managed by the invitation tools. Only invitation label/description can be patched.');
  }
}

function applyOperation(view: ViewSpec, operation: ViewPatchOperation): void {
  if(operation.op==='timeline'){
    if(view.template!=='timeline')unsupported('Timeline progression requires a timeline view.');
    if((operation.action==='select')!==Boolean(operation.eventId))unsupported('Supply eventId only for select.');
    const data=view.data as ExtendedData<'timeline'>;
    const events=timelineScale(data.events).events;
    if(operation.action==='clear'){delete data.activeEventId;return;}
    if(operation.action==='select'){
      if(!events.some(event=>event.id===operation.eventId))pathConflict();
      data.activeEventId=operation.eventId;return;
    }
    const at=events.findIndex(event=>event.id===data.activeEventId);
    const next=at<0?(operation.action==='next'?0:events.length-1):Math.max(0,Math.min(events.length-1,at+(operation.action==='next'?1:-1)));
    data.activeEventId=events[next].id;return;
  }
  if(operation.op==='instrument-sequence') {
    if(view.template!=='instrument') unsupported('Timed instrument frames require instrument view.');
    try {view.data=changeInstrumentSequence(instrumentDataSchema.parse(view.data),operation,Date.now());}
    catch {unsupported('Invalid instrument sequence transition, target IDs or duration.');}
    return;
  }
  if(operation.op==='instrument') {
    if(view.template!=='instrument') unsupported('Instrument updates require instrument view.');
    try {view.data=changeInstrument(instrumentDataSchema.parse(view.data),operation);}
    catch {unsupported('Invalid instrument targets or supplied element data. Read the current configuration.');}
    return;
  }
  if(operation.op==='sequence') {
    if(view.template!=='live-captions') unsupported('Sequence captions require live-captions.');
    try {view.data=changeCaptionSequence(captionDataSchema.parse(view.data),operation,Date.now());}
    catch {unsupported('Invalid sequence transition. Check unique IDs, duration limits and action fields; seek must be within the queue.');}
    return;
  }
  if(operation.op==='roster') {
    if(view.template!=='roster'||view.data.mode==='coverage')unsupported('Roster assignment operations require individual mode.');
    const assignments=view.data.assignments as {date:string;shift:string;person?:string;code?:string;note?:string}[];
    const index=assignments.findIndex(a=>a.date===operation.date&&a.shift===operation.shift&&a.person===operation.person);
    if(operation.action==='add'?index>=0:index<0)pathConflict();
    if(operation.action==='remove'){if(operation.value)unsupported('remove does not accept value');assignments.splice(index,1);return;}
    if(operation.action==='update'&&(!operation.value||!Object.keys(operation.value).length))unsupported('update requires code or note');
    const item=operation.action==='add'?{date:operation.date,shift:operation.shift,...(operation.person?{person:operation.person}:{})}:{...assignments[index]};
    for(const field of ['code','note'] as const){const value=operation.value?.[field];if(value===null)delete item[field];else if(value!==undefined)item[field]=value;}
    if(operation.action==='add')assignments.push(item);else assignments[index]=item;return;
  }
  if (operation.op === 'checklist') {
    if (view.template !== 'checklist') unsupported('Item operations require a checklist view.');
    const items = view.data.items as {id:string;text:string;detail?:string;checked?:boolean}[];
    const index = items.findIndex(item => item.id === operation.itemId);
    const {action,value,beforeId}=operation;
    if ((action==='remove'||action==='move')&&value || (action==='remove'||action==='update')&&beforeId) unsupported('value is for add/update; beforeId is for add/move.');
    if (action==='add' ? index>=0 : index<0) pathConflict();
    if (action==='add' && !value?.text || action==='update' && (!value || !Object.keys(value).length)) unsupported('Add requires text; update requires text, detail or checked.');
    if (beforeId && (beforeId===operation.itemId || !items.some(item=>item.id===beforeId))) pathConflict();
    if(action==='remove') { items.splice(index,1); if(view.data.highlight===operation.itemId)delete view.data.highlight; return; }
    const item=action==='add'?{id:operation.itemId,text:value!.text!}:{...items[index]};
    if(value) { if(value.text!==undefined)item.text=value.text;if(value.checked!==undefined)item.checked=value.checked;if(value.detail===null)delete item.detail;else if(value.detail!==undefined)item.detail=value.detail; }
    if(action==='update')items[index]=item;
    else { if(action==='move')items.splice(index,1);const at=beforeId?items.findIndex(item=>item.id===beforeId):items.length;items.splice(at,0,item); }
    return;
  }
  const parts = pathParts(operation.path);
  assertPatchTarget(view, parts);
  let parent: unknown = view;
  for (const part of parts.slice(0, -1)) {
    if (Array.isArray(parent)) parent = parent[existingIndex(part, parent)];
    else if (parent && typeof parent === 'object' && Object.hasOwn(parent, part)) parent = (parent as Record<string, unknown>)[part];
    else pathConflict();
  }
  const key = parts.at(-1)!;
  if (!parent || typeof parent !== 'object') pathConflict();
  if (Array.isArray(parent)) {
    if (operation.op === 'remove') unsupported('Array insertion/removal is not supported by a field patch. Replace a specific existing item or its containing data field without changing participation identities.');
    existingIndex(key, parent);
  }
  const record = parent as Record<string, unknown>, present = Object.hasOwn(record, key);
  if (operation.op === 'set') record[key] = structuredClone(operation.value);
  else if (operation.op === 'remove') {
    if (!present) pathConflict();
    delete record[key];
  } else {
    if (!present || typeof record[key] !== 'string') pathConflict();
    record[key] = (record[key] as string) + operation.value;
  }
}

function assertParticipationCompatible(before: ViewSpec, after: ViewSpec): void {
  if (!participationCompatible(before, after)) {
    throw new AppError('PATCH_PARTICIPATION_CONFLICT', 'This patch changes a poll/form/QA question, option identity/meaning or response constraint. Keep those unchanged to preserve participation; submit a new view intentionally for a new question.', 409);
  }
}

function checkedView(value: unknown): ViewSpec {
  try { return validateView(value); }
  catch (error) {
    throw new InputError(error instanceof z.ZodError ? validationIssues(error, 'view') : [{ path: 'view', problem: 'The final patched view exceeds its content or complexity limits.' }], value && typeof value === 'object' && 'template' in value && typeof value.template === 'string' ? value.template : undefined);
  }
}

/** Revision-bound, ordered, idempotent state changes without full resubmission. */
export class ViewPatches {
  constructor(private readonly host: ViewPatchHost) {}

  async patch(principal: AuthPrincipal, raw: unknown): Promise<Awaited<UpdateRecord>> {
    const input = parseInput(raw);
    return (await this.host.transaction(async () => {
      const before = (await this.host.display(principal, input.sessionId, input.displayId));
      // Reauthorize even an exact retry. A retry precedes revision checks so a
      // lost response never appends twice or demands a new idempotency key.
      const previous = (await this.host.retry(principal, input));
      if (previous) return previous;
      assertExpectedRevision(input.expectedRevision,before.revision);
      if (!before.view) throw new AppError('INVALID_VIEW', 'There is no current view to patch. Publish a view first.');
      if (before.revision === Number.MAX_SAFE_INTEGER || before.generation === Number.MAX_SAFE_INTEGER) unsupported('This display cannot accept another revision. Create a new display before continuing.');
      const original = checkedView(before.view), candidate = structuredClone(original);
      for (const operation of input.operations) applyOperation(candidate, operation);
      const normalized = checkedView(candidate);
      assertParticipationCompatible(original, normalized);
      const verified = checkedView((await this.host.verifyView(principal, input.sessionId, structuredClone(normalized))));
      // Materialization must not silently discard a requested change, detach a
      // source, or turn a narrow patch into a refresh of unrelated state.
      // HTML/CSS are derived, server-owned output for private templates. A
      // data-values patch must re-render them, but cannot directly patch markup.
      const comparable=(v:ViewSpec):ViewSpec=>v.template==='account-template'?{...v,data:{templateId:v.data.templateId,values:v.data.values}}:v;
      if(normalized.template==='account-template'&&input.operations.some(op=>!('path' in op)||!op.path.startsWith('/data/values/')))throw new AppError('PATCH_UNSUPPORTED','Custom template patches may only change /data/values/...; use complete data replacement to change the selected template.');
      if (!isDeepStrictEqual(comparable(normalized), comparable(verified))) throw new AppError('PATCH_SOURCE_CONFLICT', 'Source validation would override this patch or change unrelated data. Refresh the authoritative view first, then patch its current revision.', 409);
      assertParticipationCompatible(original, verified);
      const current = (await this.host.display(principal, input.sessionId, input.displayId));
      if (current.revision !== before.revision || current.generation !== before.generation || current.interactionEpoch !== before.interactionEpoch) {
        throw new AppError('REVISION_CONFLICT', 'The display changed while validating this patch. Read the current revision and retry with a new request ID.', 409);
      }
      return (await this.host.publish(principal, input, before, verified));
    }));
  }
}
