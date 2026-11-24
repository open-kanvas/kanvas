

import {z} from 'zod';

import {publishInputSchema} from '../../../shared/publish-input.js';

import {viewPatchSchema} from '../../../shared/view-patch.js';

import type {Definition} from '../canonical.js';
import {id,requestId,name,revision,record,exactlyOne} from '../operation-fields.js';

/** publish operation contracts. Domain services enforce current account, role and scope. */
export const publishOperations: readonly Definition[] = [
{
        name: "kanvas.display.edit", summary: "Replace an editable view's complete data object when updating all template data rather than patching individual fields.",
        description: "Replace the COMPLETE data object of an editable current template. This is not a partial merge. Prefer kanvas_call with operationId:\"kanvas.view.patch\" and arguments:{\u2026} for individual fields or text appends. expectedRevision is an optional optimistic-concurrency guard; conflicts include currentRevision. The domain validates editable template fields.",
        schema: z.strictObject({ sessionId: id, displayId: id, expectedRevision: revision.optional(), data: record }),
        idempotent: true,
        domain: "publish",
        requiredScope: "publish",
        discovery: {"group":"content","hint":"Replace COMPLETE data on the current editable template, not a partial merge. This example assumes the current template is transcription; prefer kanvas_call with operationId:\"kanvas.view.patch\" and arguments:{…} for one field.","examples":[{"sessionId":"session-id","displayId":"display-id","expectedRevision":3,"data":{"segments":[{"id":"segment-1","text":"Exact supplied words.","speaker":"Speaker A"}],"status":"live"}}]},
        searchAliases: ["kanvas.display.edit"]
    },
{
        name: "kanvas.view.patch", summary: "Apply narrow validated content changes when editing selected fields or checklist items without regenerating the whole view.",
        description: 'Patch current content without regeneration or resetting compatible poll/form/QA participation. Supply current expectedRevision and a stable requestId. Operations: set/remove/appendText at /data/...; checklist uses {op:"checklist",action:"add|remove|update|move",itemId,value?:{text,detail,checked},beforeId?}. checked sets one item; detail:null clears; add/move append unless beforeId. The final view is validated; no source-binding, server-counter, identity or permission changes. Read current state after a conflict. Waits briefly for genuine browser acknowledgement and returns per-display delivery outcomes. Applied delivery confirms that revision; inspect later only when unconfirmed. Top-level status is the historical update lifecycle, while delivery reports the current per-display observation.',
        schema: viewPatchSchema, idempotent: true,
        domain: "publish",
        requiredScope: "publish",
        discovery: {"group":"content","hint":"Patch narrow /data/... fields with revision CAS and stable requestId. This append assumes an existing transcription segment; retain all other data.","examples":[{"sessionId":"session-id","displayId":"display-id","expectedRevision":3,"requestId":"patch-1","operations":[{"op":"appendText","path":"/data/segments/0/text","value":" More supplied words."}]}]},
        searchAliases: ["kanvas.view.patch"]
    },
{
        name: "kanvas.submit", summary: "Publish prepared views or supplied source content when showing information on selected displays or resolving a new target.",
        description: "View fields (not data): title, showTitle, showCaption, showControls, actions. Publish quietly with requestId and content; returns session/display, URLs, updateId and scoped targetRef. Continue with targetRef or sessionId+displayIds. newSession:true starts another topic; optional sessionName. Resolve needs_target with its resolution ref; nothing was published. contextId must be reliable host context, never a transport/account ID. Read existing displays/revisions; kanvas_discover catalog help action search for \"getting started\" explains policy and consented viewer context. Limits: 1\u201364 displays, intent 1000 characters, context 12000, title 500, 8 actions, prepared view 2 MiB. Preserve actual source data: coordinates, URLs, code, conditions and exact numeric text are not invented or fetched. Translation templates need supplied sourceText, targetText and language labels. Omit redundant titles; showTitle:true opts in. Reuse requestId only for identical retries. Explain failures; use kanvas_call with operationId:\"kanvas.error.report\" and arguments:{\u2026}.",
        schema: publishInputSchema, idempotent: true,
        domain: "publish",
        requiredScope: "publish",
        discovery: {"group":"content","hint":"Show/chart/render on screen, including voice. First use: content + requestId → targetRef and URLs. Continue with targetRef or explicit sessionId+displayIds; needs_target requires a choice. Existing session: read current displays and revisions. Translation renders supplied source and target text only. Start with kanvas_discover catalog help action search for \"getting started\".","examples":[{"requestId":"first-visual","templateHint":"fact","data":{"text":"Exact supplied sentence."}},{"requestId":"continue-visual","targetRef":"returned-target-ref","view":{"version":1,"template":"fact","data":{"text":"Exact supplied sentence."}}},{"sessionId":"session-id","displayIds":["display-id"],"requestId":"publish-1","view":{"version":1,"template":"fact","data":{"text":"Exact supplied sentence."}}},{"sessionId":"session-id","displayIds":["display-id"],"requestId":"transcribe-1","view":{"version":1,"template":"transcription","data":{"segments":[{"id":"segment-1","text":"Exact supplied words.","speaker":"Speaker A"}],"status":"live"}}}]},
        searchAliases: ["kanvas.submit"]
    },
{
        name: "kanvas.update.status", summary: "Read preparation and per-display delivery outcomes when checking whether a submitted update reached an acknowledging browser.",
        description: 'Read an update by exactly one of updateId or requestId in its session. Distinguishes accepted/rendering/prepared/applied/retained/superseded/failed/held. Per-display delivery reports pending/applied/failed/offline/timed_out/superseded after preparation; applied requires a real viewer acknowledgement. Failure codes/field issues distinguish source, view validation, media and delivery failures. Prepared without acknowledgement for 30 seconds is explicitly timed out, not applied.',
        schema: z.strictObject({ sessionId: id, updateId: id.optional(), requestId: requestId.optional() })
            .refine(value => (value.updateId === undefined) !== (value.requestId === undefined)),
        jsonSchemaExtras: exactlyOne('updateId', 'requestId'), readOnly: true,
        domain: "publish",
        requiredScope: "read",
        discovery: {"group":"content","hint":"Read publication/delivery by exactly one updateId or requestId; prepared is not yet browser-applied.","examples":[{"sessionId":"session-id","requestId":"publish-1"}]},
        searchAliases: ["kanvas.update.status"]
    }
];
