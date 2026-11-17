

import {z} from 'zod';

import type {Definition} from '../canonical.js';
import {id,name} from '../operation-fields.js';

/** session-end operation contracts. Domain services enforce current account, role and scope. */
export const sessionEndOperations: readonly Definition[] = [
{
        name: "kanvas.session.end",
        description: 'End a session as its owner. This is an explicit lifecycle action, not a temporary display clear.',
        schema: z.strictObject({ sessionId: id }), destructive: true, idempotent: true,
        domain: "session-end",
        requiredScope: "publish",
        discovery: {"group":"sessions","hint":"End the explicitly selected session as owner; use clear for a temporary blank screen.","examples":[{"sessionId":"session-id"}]},
        searchAliases: ["kanvas.session.end"]
    }
];
