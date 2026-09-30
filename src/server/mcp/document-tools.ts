import { draftEditSchema, draftReadSchema, draftReviewSchema, draftSuggestSchema, plannerEditSchema, plannerFinalizeSchema, plannerProposeSchema, plannerReadSchema, plannerReviewSchema } from '../documents.js';
import type { Definition } from './canonical.js';

/** Server-held drafting: the drafting display's view is the authoritative draft. */
export const documentTools: Definition[] = [
  { name: 'kanvas_draft_read', readOnly: true, schema: draftReadSchema,
    description: 'DRAFT READ: includes authenticated author/activity attribution; the authoritative server-held draft of a drafting display: exact text (windowed), suggestions with their original text, focus, status, retained versions and optionally a word diff from an earlier revision (compareToRevision). Read-only.' },
  { name: 'kanvas_draft_edit', schema: draftEditSchema,
    description: 'DRAFT EDIT: change the draft text in place with expectedRevision CAS and a stable requestId: replace a range, find-replace (occurrence or all), append or set-text; also draftStatus, purpose and focus. Untouched suggestions are re-anchored; suggestions an edit overlaps are dropped and reported.' },
  { name: 'kanvas_draft_suggest', schema: draftSuggestSchema,
    description: 'DRAFT SUGGEST: actor attributed automatically; propose replacements without changing the text, anchored by start/end or by find (+occurrence). They render inline as struck-through original plus proposed text with the reason. Suggestions must not overlap; reusing an id replaces that suggestion.' },
  { name: 'kanvas_draft_review', schema: draftReviewSchema,
    description: 'DRAFT REVIEW: accept (apply to the text) or reject suggestions by id, or all remaining ones; other suggestions are re-anchored. Optionally set draftStatus, for example ready.' },
];

/** Server-held schedule planning: the planner display's view is the authoritative plan. */
export const plannerTools: Definition[] = [
  { name: 'kanvas_planner_read', readOnly: true, schema: plannerReadSchema,
    description: 'PLANNER READ (not read-only calendar): the authoritative plan of a planner display: items, conflicts (overlaps and missed declared wishes), pending proposals with before/after placement and warnings, status and revision. includeIcs returns iCalendar text for a committed plan. Read-only.' },
  { name: 'kanvas_planner_edit', schema: plannerEditSchema,
    description: 'PLANNER EDIT: add or replace items (upsertItems; same id replaces), remove items, change plannerView/anchorDate/categories, or discard pending proposals. Proposals that no longer apply are dropped and reported; item changes reopen a committed plan.' },
  { name: 'kanvas_planner_propose', schema: plannerProposeSchema,
    description: 'PLANNER PROPOSE: suggest moving (changed fields), adding (new itemId) or removing an item, each with a reason. Items change only when a proposal is accepted; one pending proposal per item, and reusing a proposal id replaces it.' },
  { name: 'kanvas_planner_review', schema: plannerReviewSchema,
    description: 'PLANNER REVIEW: accept (apply) or reject proposals by id, or all remaining ones; conflicts are recomputed. Viewers can also decide on the display.' },
  { name: 'kanvas_planner_finalize', schema: plannerFinalizeSchema,
    description: 'PLANNER FINALIZE: commit the plan once no proposals are pending; remaining conflicts are reported, not blocked. Kanvas never writes to calendars: read planner.read with includeIcs and hand the iCalendar text to a calendar tool.' },
];
