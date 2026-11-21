

import {z} from 'zod';

import type {Definition} from '../canonical.js';
import {id,name} from '../operation-fields.js';

/** members operation contracts. Domain services enforce current account, role and scope. */
export const membersOperations: readonly Definition[] = [
{
        name: "kanvas.member.add",
        description: 'As session owner, grant an existing account viewer or editor access. Viewer login remains separate from MCP authorization; sharing a URL alone grants nothing.',
        schema: z.strictObject({ sessionId: id, username: z.string().min(1).max(160), role: z.enum(['viewer', 'editor']) }),
        idempotent: true,
        domain: "members",
        requiredScope: "publish",
        discovery: {"group":"access","hint":"Grant an existing account the owner-requested role. This example is NOT authorization and does not identify a real recipient.","examples":[{"sessionId":"session-id","username":"example_viewer","role":"viewer"}]},
        searchAliases: ["kanvas.member.add"]
    },
{
        name: "kanvas.member.remove",
        description: 'As session owner, revoke a participant account from this session. Subsequent reads, edits, and subscription delivery must be re-authorized.',
        schema: z.strictObject({ sessionId: id, userId: id }), destructive: true, idempotent: true,
        domain: "members",
        requiredScope: "publish",
        discovery: {"group":"access","hint":"Revoke only the owner-selected member. This example is NOT authorization to remove an account.","examples":[{"sessionId":"session-id","userId":"user-id"}]},
        searchAliases: ["kanvas.member.remove"]
    }
];
