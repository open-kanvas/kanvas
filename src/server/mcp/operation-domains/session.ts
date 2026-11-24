

import {clientDetailsSchema} from '../../../shared/agent-context.js';

import {z} from 'zod';

import type {Definition} from '../canonical.js';
import {id,name,revision,config} from '../operation-fields.js';

/** session operation contracts. Domain services enforce current account, role and scope. */
export const sessionOperations: readonly Definition[] = [
{
        name: "kanvas.session.create", summary: "Create a private session with an optional initial display when starting a new topic or headless workspace.",
        description: 'Create a private session for a new topic. Returns its id, a blank Main display and its viewerUrl (initialDisplay:false for none). Link and access rules: help kanvas.help.policy-links.',
        schema: z.strictObject({ name, clientDetails: clientDetailsSchema.optional(), initialDisplay: z.boolean().default(true).describe("Create a blank branded Main display and return its viewerUrl immediately. Set false for an intentionally display-free session.") }),
        domain: "session",
        requiredScope: "publish",
        discovery: {"group":"sessions","hint":"Create a meaningfully named private session; this does not register a screen or publish content.","examples":[{"name":"Workshop"}]},
        searchAliases: ["kanvas.session.create"]
    },
{
        name: "kanvas.session.state", summary: "Read settings, displays, revisions, recent updates, and pending interactions when inspecting a chosen session before changes.",
        description: 'Read a session before a display decision: settings, configRevision, displays and revisions, the manage map of read/change operations, the last 5 updates and pending interactions with counts.',
        schema: z.strictObject({ sessionId: id, includeUpdates: z.enum(['recent', 'all']).default('recent') }), readOnly: true,
        domain: "session",
        requiredScope: "read",
        discovery: {"group":"sessions","hint":"Read current displays and revisions, configRevision, displays and their revisions.","examples":[{"sessionId":"session-id"}]},
        searchAliases: ["kanvas.session.state"]
    },
{
        name: "kanvas.config.update", summary: "Change appearance, regional, or reading settings when applying preferences at session, account, team, or organization scope.",
        description: 'Ask which settings scope the user intends: session (default), account (new-session defaults), team or organization (group defaults). Supply expectedRevision for that scope and groupId for team/organization. Group writes require group administration. Appearance and regional settings are supported. textSize (percent, 50-250) is the text size of every view in the session or account and is saved; readingFontSize, readingZoom and readingWpm apply to documents using the reading layout and markdown reading views. For a scale saved only for this browser window across content and sessions (new windows start at 100%), use kanvas.navigation.control with navigation:{action:zoom,scale:1.5}. Synchronization changes require owner authority. Settings do not grant access or trigger publication.',
        schema: z.strictObject({ sessionId: id, expectedRevision: revision.optional(), config, scope: z.enum(['session', 'account', 'team', 'organization']).default('session'), groupId: id.optional() }), idempotent: true,
        domain: "session",
        requiredScope: "publish",
        discovery: {"group":"sessions","hint":"Change requested settings for this session using configRevision as expectedRevision.","examples":[{"sessionId":"session-id","expectedRevision":3,"config":{"theme":"dark"}}]},
        searchAliases: ["kanvas.config.update"]
    }
];
