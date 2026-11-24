

import {archiveSchema,archiveListSchema} from '../../archive.js';

import type {Definition} from '../canonical.js';
import {name} from '../operation-fields.js';

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
        name: "kanvas.archive.manage", summary: "Archive, restore, or request confirmed permanent deletion when managing retained sessions, displays, and historical views.", description: 'Owner-only archive (default) or restore of a session, display or retained view ID from display history. Archive is reversible. Permanent removal requires request-delete: show a warning and three random phonetic words on the current confirmationSessionId/confirmationDisplayId for 120 seconds. Batch views use targetIds (1–100 distinct IDs in one session), with one exact-target-bound confirmation. Then confirm-delete with challengeId and words explicitly supplied by the human. Never read/guess the words or infer approval. Shared items are deleted for everyone.', schema: archiveSchema, destructive: true,
        domain: "archive",
        requiredScope: "publish",
        discovery: {"group":"sessions","hint":"Archive by default, restore explicitly. Batch retained views use targetIds in one owned session. Permanent deletion requires a current-screen, 120-second human phonetic confirmation. Words are never returned to the agent.","examples":[{"sessionId":"session-id","resource":"session","action":"archive"}]},
        searchAliases: ["kanvas.archive.manage"]
    }
];
