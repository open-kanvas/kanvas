

import {z} from 'zod';

import type {Definition} from '../canonical.js';
import {id,requestId,name,displayIds} from '../operation-fields.js';

/** display-clear operation contracts. Domain services enforce current account, role and scope. */
export const displayClearOperations: readonly Definition[] = [
{
        name: "kanvas.clear", summary: "Clear content from explicitly selected displays when blanking screens without ending the session or affecting other displays.",
        description: 'Clear only the explicitly named displays in an accessible session. Reuse requestId for an identical retry. Other displays and the session remain intact.',
        schema: z.strictObject({ sessionId: id, displayIds, requestId }), destructive: true, idempotent: true,
        domain: "display-clear",
        requiredScope: "publish",
        discovery: {"group":"content","hint":"Blank only these explicitly selected displays; do not end the session or delete sources.","examples":[{"sessionId":"session-id","displayIds":["display-id"],"requestId":"clear-1"}]},
        searchAliases: ["kanvas.clear"]
    }
];
