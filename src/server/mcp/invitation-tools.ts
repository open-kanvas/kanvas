import {invitationSchema} from '../../shared/invitations.js';
export const invitationTools = [{
        name: "kanvas.invite.create", description: 'Create a general onboarding invitation or, with groupId, a single-use member invitation for an administered group. Explicit acceptance follows account verification. Creates an artifact only; sends no message and grants no session access.', schema: invitationSchema, idempotent: true,
        domain: "members",
        requiredScope: "publish" as const,
        discovery: {"group":"access","hint":"Produce a shareable onboarding artifact without sending, enrolling or granting session access. groupId creates a single-use member invitation requiring explicit acceptance.","examples":[{"requestId":"invite-1","label":"Join me on KANVAS"},{"requestId":"group-invite-1","groupId":"group-id","label":"Join our team"}]},
        searchAliases: ["kanvas.invite.create"]
    }];
