import {clientDetailsSchema} from '../../shared/agent-context.js';
import {z} from 'zod';
import {connectionRedirectSchema} from '../window-receivers.js';
import {accountInventorySchema} from '../../shared/account-inventory.js';
import type {Definition} from './canonical.js';

/** Account-level reach: one inventory read, and moving a live browser window across sessions. */
export const homeTools: Definition[] = [
    {
        name: "kanvas.account.details", summary: "Read your email, display name, tier, and limits when reviewing personal account details and available capacity.", readOnly: true, description: 'Read only YOUR signed-in account email, display name, quota tier and configured limits. No accountId argument; account-wide permission required. Returns a ready account-details view recipe: publish only on a private display chosen by the user, since email is personal.', schema: z.strictObject({}),
        domain: "account",
        requiredScope: "read",
        discovery: {"group":"sessions","hint":"Own account email, name, quota tier and private account-details view recipe. Account-wide read only; no arbitrary account selection.","examples":[{}]},
        searchAliases: ["kanvas.account.details"]
    },
    {
        name: "kanvas.session.start", summary: "Start a session on a chosen owned window when beginning new work with an available receiving screen.", description: 'Start a requested Kanvas session on one connected owned window. With multiple windows choose deviceId/windowId; never broadcast. With none, an actively opted-in returning account can get a ready session and queued push (only with no explicit target); otherwise returns needs_display and bare startUrl to open before retry. A notification is not delivery or paint: publish to returned IDs and verify. requestId retries are safe. Selected-session grants cannot create sessions.', schema: z.strictObject({ clientDetails: clientDetailsSchema.optional(), requestId: z.string().min(1).max(128), name: z.string().trim().min(1).max(160).default('Kanvas session'), deviceId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(), windowId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional() }), idempotent: true,
        domain: "account",
        requiredScope: "publish",
        discovery: {"group":"sessions","hint":"User asks to start Kanvas with no active session: begin checks connected windows and active notification opt-in before asking them to open the bare startUrl. Never read a session URL aloud.","examples":[{"requestId":"start-session","name":"Planning"}]},
        searchAliases: ["kanvas.session.start"]
    },
    {
        name: "kanvas.account.inventory", summary: "Inventory accessible sessions, displays, devices, windows, and groups when surveying account resources and their management operations.", readOnly: true, schema: accountInventorySchema,
        description: 'ACCOUNT INVENTORY: every session the account can open (each display with its name, online state and what it shows), registered devices with their browser windows, and groups, plus manage: the operations that read or change each resource. Bounded; ended sessions only with includeEnded. Read-only.',
        domain: "account",
        requiredScope: "read",
        discovery: {"group":"sessions","hint":"One bounded read of everything the account can reach: sessions with their displays (online, what they show), registered devices with their windows, groups, and manage: the operations that read or change each resource. Start here for account-level questions instead of reading session by session.","examples":[{},{"includeEnded":true}]},
        searchAliases: ["kanvas.account.inventory"]
    },
    {
        name: "kanvas.connection.redirect", summary: "Redirect one owned live browser connection to an authorized display when switching its session or viewing destination.", idempotent: true, schema: connectionRedirectSchema,
        description: "REDIRECT A LIVE BROWSER: move one of your own open browser windows, identified by its kanvas_call with operationId:\"kanvas.topology.read\" and arguments:{\u2026} connection id, to any display you can open, including a display in another session. sessionId and displayId are the target. A retry with the same requestId returns the original command.",
        domain: "connections",
        requiredScope: "publish",
        discovery: {"group":"displays","hint":"Move one of your own live browser windows to any display you can open, in any session. Identify it by its kanvas_call with operationId:\"kanvas.topology.read\" and arguments:{…} connection id (your windows carry windowId); sessionId and displayId are the target. Use it when the user switches session and an already-open browser should follow.","examples":[{"connectionId":"connection-id","sessionId":"target-session-id","displayId":"target-display-id","requestId":"redirect-1"}]},
        searchAliases: ["kanvas.connection.redirect"]
    },
];
