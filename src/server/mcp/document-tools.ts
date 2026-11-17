import {draftEditSchema,draftReadSchema,draftReviewSchema,draftSuggestSchema,plannerEditSchema,plannerFinalizeSchema,plannerProposeSchema,plannerReadSchema,plannerReviewSchema} from '../documents.js';
import type {Definition} from './canonical.js';

/** Server-held drafting: the drafting display's view is the authoritative draft. */
export const documentTools: Definition[] = [
    {
        name: "kanvas.draft.read", readOnly: true, schema: draftReadSchema,
        description: 'DRAFT READ: includes authenticated author/activity attribution; the authoritative server-held draft of a drafting display: exact text (windowed), suggestions with their original text, focus, status, retained versions and optionally a word diff from an earlier revision (compareToRevision). Read-only.',
        domain: "draft",
        requiredScope: "read",
        discovery: {"group":"content","hint":"Read the authoritative server-held draft of a drafting display before editing: exact text (fromCharacter/maxCharacters window), suggestions with their original text, focus, status, retained versions and, with compareToRevision, a word diff. Use its revision as expectedRevision.","examples":[{"sessionId":"session-id","displayId":"display-id"},{"sessionId":"session-id","displayId":"display-id","compareToRevision":2}]},
        searchAliases: ["kanvas.draft.read"]
    },
    {
        name: "kanvas.draft.edit", schema: draftEditSchema,
        description: 'DRAFT EDIT: change the draft text in place with expectedRevision CAS and a stable requestId: replace a range, find-replace (occurrence or all), append or set-text; also draftStatus, purpose and focus. Untouched suggestions are re-anchored; suggestions an edit overlaps are dropped and reported.',
        domain: "draft",
        requiredScope: "publish",
        discovery: {"group":"content","hint":"Edit the draft text in place (replace, find-replace, append or set-text). Also sets draftStatus, purpose and focus, with revision CAS and a stable requestId. Offsets refer to the text at expectedRevision; overlapped suggestions are dropped and reported.","examples":[{"sessionId":"session-id","displayId":"display-id","expectedRevision":3,"requestId":"draft-edit-1","edits":[{"op":"find-replace","find":"Dear team","text":"Hi all"}]},{"sessionId":"session-id","displayId":"display-id","expectedRevision":3,"requestId":"draft-edit-2","edits":[{"op":"append","text":"\n\nBest regards"}],"draftStatus":"reviewing"}]},
        searchAliases: ["kanvas.draft.edit"]
    },
    {
        name: "kanvas.draft.suggest", schema: draftSuggestSchema,
        description: 'DRAFT SUGGEST: actor attributed automatically; propose replacements without changing the text, anchored by start/end or by find (+occurrence). They render inline as struck-through original plus proposed text with the reason. Suggestions must not overlap; reusing an id replaces that suggestion.',
        domain: "draft",
        requiredScope: "publish",
        discovery: {"group":"content","hint":"Propose inline replacements without changing the draft text. Anchor each by start/end or by find (+occurrence); it renders as struck-through original plus proposed text. Suggestions must not overlap; reusing an id replaces that suggestion.","examples":[{"sessionId":"session-id","displayId":"display-id","expectedRevision":3,"requestId":"draft-suggest-1","suggestions":[{"find":"asap","replacement":"by Friday","reason":"Give a concrete date"}]}]},
        searchAliases: ["kanvas.draft.suggest"]
    },
    {
        name: "kanvas.draft.review", schema: draftReviewSchema,
        description: 'DRAFT REVIEW: accept (apply to the text) or reject suggestions by id, or all remaining ones; other suggestions are re-anchored. Optionally set draftStatus, for example ready.',
        domain: "draft",
        requiredScope: "publish",
        discovery: {"group":"content","hint":"Accept (apply) or reject draft suggestions by id, or all remaining ones. Accepted replacements change the text and the other suggestions are re-anchored. Optionally set draftStatus.","examples":[{"sessionId":"session-id","displayId":"display-id","expectedRevision":3,"requestId":"draft-review-1","accept":["s4-1"],"reject":["s4-2"]},{"sessionId":"session-id","displayId":"display-id","expectedRevision":3,"requestId":"draft-review-2","all":"accept","draftStatus":"ready"}]},
        searchAliases: ["kanvas.draft.review"]
    },
];

/** Server-held schedule planning: the planner display's view is the authoritative plan. */
export const plannerTools: Definition[] = [
    {
        name: "kanvas.planner.read", readOnly: true, schema: plannerReadSchema,
        description: 'PLANNER READ (not read-only calendar): the authoritative plan of a planner display: items, conflicts (overlaps and missed declared wishes), pending proposals with before/after placement and warnings, status and revision. includeIcs returns iCalendar text for a committed plan. Read-only.',
        domain: "planner",
        requiredScope: "read",
        discovery: {"group":"content","hint":"For read-only events publish calendar. Planner day/three-day/week/month supports supplied weather, wind and solar markers. Read the authoritative plan before changing it: items, conflicts (overlaps, missed buffers, not-before and deadline wishes), pending proposals with before/after placement and warnings, status and revision. includeIcs returns iCalendar text once the plan is committed.","examples":[{"sessionId":"session-id","displayId":"display-id"},{"sessionId":"session-id","displayId":"display-id","includeIcs":true}]},
        searchAliases: ["kanvas.planner.read"]
    },
    {
        name: "kanvas.planner.edit", schema: plannerEditSchema,
        description: 'PLANNER EDIT: add or replace items (upsertItems; same id replaces), remove items, change plannerView/anchorDate/categories, or discard pending proposals. Proposals that no longer apply are dropped and reported; item changes reopen a committed plan.',
        domain: "planner",
        requiredScope: "publish",
        discovery: {"group":"content","hint":"Change plan items directly (plannerView includes three-day): add, replace or remove them, or change the view. Use upsertItems to add (new id) or replace (same id) items and removeItemIds to remove them; also plannerView, anchorDate, categories or discardProposals. Proposals that no longer apply are dropped and reported; item changes reopen a committed plan.","examples":[{"sessionId":"session-id","displayId":"display-id","expectedRevision":3,"requestId":"planner-edit-1","upsertItems":[{"id":"tennis","title":"Tennis","start":"2026-11-08T15:00:00+01:00","end":"2026-11-08T16:00:00+01:00"}]}]},
        searchAliases: ["kanvas.planner.edit"]
    },
    {
        name: "kanvas.planner.propose", schema: plannerProposeSchema,
        description: 'PLANNER PROPOSE: suggest moving (changed fields), adding (new itemId) or removing an item, each with a reason. Items change only when a proposal is accepted; one pending proposal per item, and reusing a proposal id replaces it.',
        domain: "planner",
        requiredScope: "publish",
        discovery: {"group":"content","hint":"Propose moving, adding or removing plan items, each with a reason. Move: itemId plus the changed fields in item; add: a new itemId plus item with title, start and end. Items change only when accepted; one pending proposal per item, and reusing a proposal id replaces it. Colours and declared wishes are set with kanvas_call with operationId:\"kanvas.planner.edit\" and arguments:{…}.","examples":[{"sessionId":"session-id","displayId":"display-id","expectedRevision":3,"requestId":"planner-propose-1","proposals":[{"id":"move-boat","action":"move","itemId":"boat","item":{"start":"2026-11-06T13:00:00+01:00","end":"2026-11-06T17:00:00+01:00"},"reason":"Friday afternoon is open."}]}]},
        searchAliases: ["kanvas.planner.propose"]
    },
    {
        name: "kanvas.planner.review", schema: plannerReviewSchema,
        description: 'PLANNER REVIEW: accept (apply) or reject proposals by id, or all remaining ones; conflicts are recomputed. Viewers can also decide on the display.',
        domain: "planner",
        requiredScope: "publish",
        discovery: {"group":"content","hint":"Accept (apply) or reject plan proposals by id, or all remaining ones. Conflicts are recomputed. Viewers can also accept, reject or ask for another option on the display, which reaches you as an interaction.","examples":[{"sessionId":"session-id","displayId":"display-id","expectedRevision":3,"requestId":"planner-review-1","accept":["move-boat"]}]},
        searchAliases: ["kanvas.planner.review"]
    },
    {
        name: "kanvas.planner.finalize", schema: plannerFinalizeSchema,
        description: "PLANNER FINALIZE: commit the plan once no proposals are pending; remaining conflicts are reported, not blocked. Kanvas never writes to calendars: read kanvas_call with operationId:\"kanvas.planner.read\" and arguments:{\u2026} with includeIcs and hand the iCalendar text to a calendar tool.",
        domain: "planner",
        requiredScope: "publish",
        discovery: {"group":"content","hint":"Commit the plan once no proposals are pending. Remaining conflicts are reported, not blocked. Afterwards kanvas_call with operationId:\"kanvas.planner.read\" and arguments:{…} with includeIcs gives iCalendar text for your calendar tool; Kanvas never writes to calendars.","examples":[{"sessionId":"session-id","displayId":"display-id","expectedRevision":3,"requestId":"planner-finalize-1"}]},
        searchAliases: ["kanvas.planner.finalize"]
    },
];
