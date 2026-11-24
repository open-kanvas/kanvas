

import {z} from 'zod';

import type {Definition} from '../canonical.js';
import {id,requestId,name,revision,displayIds,record,exactlyOne} from '../operation-fields.js';

/** display-revisions operation contracts. Domain services enforce current account, role and scope. */
export const displayRevisionsOperations: readonly Definition[] = [
{
        name: "kanvas.display.history", summary: "List retained display views and navigation position when locating earlier content without retrieving its source prompts.",
        description: "List all retained display views with revision IDs and back/forward position. Returns metadata, not source prompts. No per-display eviction; publishing after back preserves forward history. Fixed1000-view session cap refuses new publications; start a new session. Navigation consumes no slot. Use kanvas_call with operationId:\"kanvas.display.navigate\" and arguments:{\u2026} to restore without resubmitting source.",
        schema: z.strictObject({ sessionId: id, displayId: id }), readOnly: true,
        domain: "display-revisions",
        requiredScope: "read",
        discovery: {"group":"displays","hint":"Read retained revision metadata before navigating to a previous view.","examples":[{"sessionId":"session-id","displayId":"display-id"}]},
        searchAliases: ["kanvas.display.history"]
    },
{
        name: "kanvas.display.navigate", summary: "Restore retained views on selected displays when moving through history without resubmitting or regenerating their content.",
        description: "Restore actual retained views on named displays. Supply exactly one of direction (back/forward) or original revision from kanvas_call with operationId:\"kanvas.display.history\" and arguments:{\u2026}, plus optional expectedRevisions guards keyed by display. Restoration creates a new current revision from stored content, respects permission and reports normal delivery acknowledgement. All targets validate before any change.",
        schema: z.strictObject({ sessionId: id, displayIds, requestId, expectedRevisions: z.record(id, revision).default({}), direction: z.enum(['back', 'forward']).optional(), revision: revision.optional() }).refine(v => (v.direction === undefined) !== (v.revision === undefined)),
        jsonSchemaExtras: exactlyOne('direction', 'revision'), idempotent: true,
        domain: "display-revisions",
        requiredScope: "publish",
        discovery: {"group":"displays","hint":"Restore retained history with expectedRevisions for every target and exactly one of direction or revision.","examples":[{"sessionId":"session-id","displayIds":["display-id"],"requestId":"navigate-1","expectedRevisions":{"display-id":3},"direction":"back"}]},
        searchAliases: ["kanvas.display.navigate"]
    }
];
