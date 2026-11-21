

import {z} from 'zod';

import type {Definition} from '../canonical.js';
import {name} from '../operation-fields.js';

/** session-history operation contracts. Domain services enforce current account, role and scope. */
export const sessionHistoryOperations: readonly Definition[] = [
{
        name: "kanvas.sessions.list",
        description: "Find an accessible session for showing something on screen. Then read kanvas_call with operationId:\"kanvas.session.state\" and arguments:{\u2026} for current displays and revisions before publishing; kanvas_discover catalog help action search for \"getting started\" introduces templates, viewer location and quiet operation. IDs locate content, never authorize access.",
        schema: z.strictObject({}), readOnly: true,
        domain: "session-history",
        requiredScope: "read",
        discovery: {"group":"sessions","hint":"Session history: every session you can access across the account (NOT the overview template, which is one session's content gallery). Then read the intended session before publishing.","examples":[{}]},
        searchAliases: ["kanvas.sessions.list"]
    }
];
