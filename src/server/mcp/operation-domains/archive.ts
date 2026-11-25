

import {archiveCreateSchema,archiveRestoreSchema,archiveDeleteRequestSchema,archiveDeleteConfirmSchema,archiveListSchema} from '../../archive.js';

import type {Definition} from '../canonical.js';

/** archive operation contracts. Domain services enforce current account, role and scope. */
export const archiveOperations: readonly Definition[] = [
{
        name: "kanvas.archive.list", summary: "List recoverable archived sessions, displays, and retained views when locating content hidden from normal browsing.", description: 'List your recoverable archived sessions, displays and retained views. Hidden from normal lists; retained indefinitely. Session grant restrictions still apply.', schema: archiveListSchema, readOnly: true,
        domain: "archive",
        requiredScope: "read",
        discovery: {"group":"sessions","hint":"Read recoverable archived sessions/displays/views owned by you, optionally narrowed by sessionId.","examples":[{}]},
        searchAliases: ["kanvas.archive.list"]
    },
{
        name: 'kanvas.archive.create', summary: 'Reversibly archive owned sessions, displays, or retained views when hiding content from normal browsing without permanently deleting it.',
        description: 'Owner-only reversible archive. Retained indefinitely; still counts toward storage limits. Batch retained views use targetIds (1–100 distinct IDs in one session). Restore with kanvas.archive.restore; permanent deletion is a separate human-confirmed process.',
        schema: archiveCreateSchema, destructive: true, domain: 'archive', requiredScope: 'publish',
        discovery: {group:'sessions',hint:'Hide owned sessions, displays or retained views without permanent deletion.',examples:[{sessionId:'session-id',resource:'session'}]},
        searchAliases: ['kanvas.archive.create']
    },
    {
        name: 'kanvas.archive.restore', summary: 'Restore archived sessions, displays, or retained views when returning recoverable content to normal browsing with its existing identity.',
        description: 'Owner-only restore of a session, display or retained view. Restoring a session uses a session slot again. Batch retained views use targetIds (1–100 distinct IDs in one session).',
        schema: archiveRestoreSchema, domain: 'archive', requiredScope: 'publish',
        discovery: {group:'sessions',hint:'Restore recoverable archived content.',examples:[{sessionId:'session-id',resource:'session'}]},
        searchAliases: ['kanvas.archive.restore']
    },
    {
        name: 'kanvas.archive.delete.request', summary: 'Request a visual human confirmation before permanently deleting owned sessions, displays, or retained views.',
        description: 'Owner-only deletion request. Show a warning and three random phonetic words on the current confirmationSessionId/confirmationDisplayId for 120 seconds. Batch views use targetIds (1–100 distinct IDs in one session), with one exact-target-bound confirmation. No deletion occurs yet. Words are never returned to the agent. Ask the human to read them; never retrieve, guess or infer approval. Shared items will be deleted for everyone.',
        schema: archiveDeleteRequestSchema, domain: 'archive', requiredScope: 'publish',
        discovery: {group:'sessions',hint:'Show a current-screen 120-second deletion warning; then use kanvas.archive.delete.confirm only with words explicitly supplied by the human.',examples:[{sessionId:'session-id',resource:'view',targetId:'view-id',confirmationDisplayId:'display-id'}]},
        searchAliases: ['kanvas.archive.delete.request']
    },
    {
        name: 'kanvas.archive.delete.confirm', summary: 'Permanently delete the exact requested archive targets after the human supplies the visual confirmation words.',
        description: 'Owner-only irreversible deletion. Requires the fresh challengeId from kanvas.archive.delete.request, the exact same target selection, and words explicitly supplied by the human within 120 seconds. Never read or guess the words or infer approval. The challenge is single-use, expires, and is invalidated after three incorrect attempts. Shared items are deleted for everyone.',
        schema: archiveDeleteConfirmSchema, destructive: true, domain: 'archive', requiredScope: 'publish',
        discovery: {group:'sessions',hint:'Irreversible deletion using a fresh exact-target-bound human confirmation; never invent words.',examples:[{sessionId:'session-id',resource:'view',targetId:'view-id',challengeId:'challenge-id',words:'words supplied by human'}]},
        searchAliases: ['kanvas.archive.delete.confirm']
    }
];
