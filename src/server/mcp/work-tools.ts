import type {Definition} from './canonical.js';
import {deviceLockSchema} from '../device-privacy.js';
import {clientDetailsSchema} from '../../shared/agent-context.js';
import {z} from 'zod';
import {devicePresentSchema,deviceRenameSchema} from '../entry-devices.js';
import {windowPresentSchema,windowOverviewSchema,windowViewportSchema} from '../window-receivers.js';
import {invitationAcceptSchema,invitationRevokeSchema} from '../invitations.js';
import {chatMessageSchema} from '../../shared/work-views.js';
import {selectionSchema} from '../../shared/selection.js';
const id=z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),revision=z.number().int().nonnegative();
const target={sessionId:id,displayId:id,expectedRevision:revision.optional(),requestId:id};
export const chatAppendSchema=z.object({...target,messages:z.array(chatMessageSchema).min(1).max(100)}).strict();
export const selectionInputSchema=z.object({...target,selection:selectionSchema.nullable()}).strict();
export const workTools: readonly Definition[] = [
    {
        name: "kanvas.client.context.update", summary: "Record connection-specific client hints or guidance verbosity when adapting the integration without changing saved guidance text.", description: 'Set clientDetails.guidance to concise to reduce repeated guidance for this connection without changing saved text; full restores the default repetition. No permission from the person is needed to reduce your own repetition. Stateless clients must send a unique Kanvas-Connection-Id header or kanvas/connectionId tool _meta on every call. Optional unverified client hints for this connection. Separate observed User-Agent/MCP identity; conflicts flagged. Private account history. Sharing helps adaptation, diagnosis and session recognition; omit unknowns.', schema: z.object({ sessionId: id, clientDetails: clientDetailsSchema }).strict(),
        domain: "session",
        requiredScope: "publish" as const,
        discovery: {"group":"sessions","hint":"Optional unverified client context for this connection, visible to its account.","examples":[{"sessionId":"session-id","clientDetails":{"agent":"Example agent","interaction_mode":"voice"}}]},
        searchAliases: ["kanvas.client.context.update"]
    },
    {
        name: "kanvas.catalog.show", summary: "Publish an alphabetical template or operation catalog when displaying available capabilities as a static overview.", description: 'Show a static alphabetical auto-fit catalog. Templates scope: all (default), system or account; private templates use their names with an account marker. Operations remain complete. Reissue to refresh.', schema: z.object({ sessionId: id, displayIds: z.array(id).min(1).max(64), requestId: id, catalog: z.enum(["operations", "templates"]), scope: z.enum(["all", "system", "account"]).default("all").describe("Templates only; operations always includes all operations.") }).strict(), idempotent: true,
        domain: "template",
        requiredScope: "publish" as const,
        discovery: {"group":"content","hint":"Static alphabetical full catalog from live registries.","examples":[{"sessionId":"session-id","displayIds":["display-id"],"requestId":"catalog-1","catalog":"operations"}]},
        searchAliases: ["kanvas.catalog.show"]
    },
    {
        name: "kanvas.window.viewport", summary: "Zoom or scroll one owned overview window when adjusting its viewport without navigating or editing content.", description: "Zoom or scroll one owned online window on the root sessions overview. Supply deviceId/windowId from kanvas_call with operationId:\"kanvas.devices.read\" and arguments:{\u2026} and await command status applied. Zoom is per window (0.25\u20133); scroll uses normalized position or delta. For session content use kanvas_call with operationId:\"kanvas.navigation.control\" and arguments:{\u2026} with viewerId. Does not navigate or edit content.", schema: windowViewportSchema, idempotent: true,
        domain: "devices",
        requiredScope: "publish" as const,
        discovery: {"group":"controls","hint":"Zoom/scroll one owned online root overview window; session content uses kanvas_call with operationId:\"kanvas.navigation.control\" and arguments:{…} viewerId.","examples":[{"deviceId":"device-id","windowId":"window-id","requestId":"zoom-overview-1","navigation":{"action":"zoom","scale":1.5}}]},
        searchAliases: ["kanvas.window.viewport"]
    },
    {
        name: "kanvas.window.overview", summary: "Return one owned browser window to the sessions overview when detaching it from its current display.", description: "Return one owned online browser window to the root sessions overview, detaching its displayed session without changing session content or other windows. Read kanvas_call with operationId:\"kanvas.devices.read\" and arguments:{\u2026} for deviceId, windowId and expectedVersion. Stable requestId retries are safe. Account-wide publish permission required. Check the command receipt for browser acknowledgement.", schema: windowOverviewSchema, idempotent: true,
        domain: "devices",
        requiredScope: "publish" as const,
        discovery: {"group":"controls","hint":"Return one owned online window to the root overview.","examples":[{"deviceId":"device-id","windowId":"window-id","expectedVersion":0,"requestId":"overview-1"}]},
        searchAliases: ["kanvas.window.overview"]
    },
    {
        name: "kanvas.invite.accept", summary: "Accept a chosen group invitation as the signed-in account when explicitly joining an organization or team.", description: 'Explicitly accept a single-use organization/team invitation as the current verified/signed-in account. Requires confirm:true after the user chooses to join. Adds member role only; preserves any existing higher role. Rechecks inviter authority and never joins linked groups or grants OAuth access.', schema: invitationAcceptSchema, idempotent: true,
        domain: "members",
        requiredScope: "publish" as const,
        discovery: {"group":"access","hint":"Accept a single-use group invitation only after the person chooses to join. Own full account and confirm:true required.","examples":[{"invitationId":"invitation-id","confirm":true}]},
        searchAliases: ["kanvas.invite.accept"]
    },
    {
        name: "kanvas.invite.revoke", summary: "Revoke an issued or administered group invitation when closing a join link without removing existing members.", description: 'Revoke an invitation issued by this account or administered group. Does not remove an existing membership. Account-wide authority required; group members cannot revoke other invitations.', schema: invitationRevokeSchema, idempotent: true,
        domain: "members",
        requiredScope: "publish" as const,
        discovery: {"group":"access","hint":"Issuer or group administrator revokes an invitation; existing membership is not removed.","examples":[{"invitationId":"invitation-id"}]},
        searchAliases: ["kanvas.invite.revoke"]
    },
    {
        name: "kanvas.devices.read", summary: "List registered account devices, windows, connection states, and command acknowledgements when choosing or checking browser targets.", description: 'List this account’s registered devices and their individually addressable windows, per-window versions, current displays, actual connection states, last-seen time, home target and targeting acknowledgements. Account-wide grants only. Select the intended named device; IDs are addresses, not credentials.', schema: z.object({}).strict(), readOnly: true,
        domain: "devices",
        requiredScope: "read" as const,
        discovery: {"group":"displays","hint":"List own registered devices, individually addressable windows, window versions and per-window paint receipts. To SHOW it, publish the returned publishRecipe (template devices: device and browser icons, online status, sessions grouped by colour).","examples":[{}]},
        searchAliases: ["kanvas.devices.read"]
    },
    {
        name: "kanvas.participants.read", summary: "List registered devices and paired guests across session displays when checking actual presence and current viewing locations.", description: 'Unified participants across every display in a session: registered account devices and paired guests, actual connected state, current display and last-seen evidence. Pairing approval alone is not presence.', schema: z.object({ sessionId: id }).strict(), readOnly: true,
        domain: "session",
        requiredScope: "read" as const,
        discovery: {"group":"displays","hint":"All active guests and registered-account browsers across a session, plus offline registered-device records.","examples":[{"sessionId":"session-id"}]},
        searchAliases: ["kanvas.participants.read"]
    },
    {
        name: "kanvas.device.present", summary: "Direct all windows of one owned online device to an authorized display when targeting that device together.", description: "Present an authorized display to one owned online device (all its windows). Use deviceId or unique match:{name,location,tag}; ambiguous matches fail. Read kanvas_call with operationId:\"kanvas.devices.read\" and arguments:{\u2026} for expectedVersion; supply a stable requestId. For one tab use kanvas_call with operationId:\"kanvas.window.present\" and arguments:{\u2026}. Verify painted acknowledgement; pending is not applied.", schema: devicePresentSchema, idempotent: true,
        domain: "devices",
        requiredScope: "publish" as const,
        discovery: {"group":"displays","hint":"Make an already-connected device FOLLOW another display from now on: every live window on it is re-pointed and stays there (persistent, not a one-off cast), e.g. a phone that mirrors the laptop display. Use kanvas_call with operationId:\"kanvas.window.present\" and arguments:{…} for one tab. Verify every addressed window’s paint receipt.","examples":[{"deviceId":"device-id","sessionId":"session-id","displayId":"display-id","expectedVersion":0,"requestId":"cast-1"}]},
        searchAliases: ["kanvas.device.present"]
    },
    {
        name: "kanvas.window.present", summary: "Direct one owned online browser window to an authorized display when sibling tabs should remain unchanged.", description: "Independently target one online browser tab/window, leaving sibling tabs unchanged. Read kanvas_call with operationId:\"kanvas.devices.read\" and arguments:{\u2026} for deviceId, windows[].id and the window version. Supply expectedVersion and stable requestId. Account-wide owner authority only. Pending is not painted; inspect the individual window command receipt.", schema: windowPresentSchema, idempotent: true,
        domain: "devices",
        requiredScope: "publish" as const,
        discovery: {"group":"displays","hint":"Re-point one online window from kanvas_call with operationId:\"kanvas.devices.read\" and arguments:{…} so it follows another display (any session you can present to), leaving sibling tabs unchanged. Use the window version, then verify its own paint receipt.","examples":[{"deviceId":"device-id","windowId":"window-id","sessionId":"session-id","displayId":"display-id","expectedVersion":0,"requestId":"window-1"}]},
        searchAliases: ["kanvas.window.present"]
    },
    {
        name: "kanvas.displays.identify", summary: "Flash temporary numbers and names on connected displays when people need to identify their physical screens.", description: 'IDENTIFY SCREENS: briefly flash a large number (display 1, 2, 3 in stable registration order) and the display name on every connected display of a session, or only on displayIds, so people can tell which screen is which. Transient overlay for 1–5 seconds: content, revisions, history and delivery status are unchanged. Offline displays are listed with online:false and show nothing.', schema: z.object({ sessionId: id, displayIds: z.array(id).min(1).max(64).optional(), durationMs: z.number().int().min(1000).max(5000).optional() }).strict(),
        domain: "display",
        requiredScope: "publish" as const,
        discovery: {"group":"displays","hint":"When people ask which screen is which, or before assigning content to screens by position, flash each display’s stable number and name for about two seconds. Content, revisions and history stay unchanged.","examples":[{"sessionId":"session-id"},{"sessionId":"session-id","displayIds":["display-id"],"durationMs":3000}]},
        searchAliases: ["kanvas.displays.identify"]
    },
    {
        name: "kanvas.display.lockdown", summary: "Restrict viewer navigation and menus on one display when enabling a content-visible kiosk without device locking.", description: 'Owner-only per-display kiosk restriction: content stays visible and intrinsic responses work; viewer menus/history/pointing are disabled. Set locked true/false. Owner tools can still publish. Separate from device privacy lock; not OS/browser lockdown.', schema: z.object({ sessionId: id, displayId: id, expectedRevision: revision.optional(), locked: z.boolean() }).strict(), idempotent: true,
        domain: "display",
        requiredScope: "publish" as const,
        discovery: {"group":"displays","hint":"Restrict a visible display to its content interactions; owner tools retain control.","examples":[{"sessionId":"session-id","displayId":"display-id","expectedRevision":3,"locked":true}]},
        searchAliases: ["kanvas.display.lockdown"]
    },
    {
        name: "kanvas.device.lock", summary: "Hide application data across one registered browser device when the owner needs a temporary privacy lock.", description: 'Owner-only privacy lock of one registered browser device, across all app routes/windows/sessions. Server withholds browser data until unlock. No content deletion; not OS lockdown. Account-wide publish grant required.', schema: deviceLockSchema, idempotent: true,
        domain: "devices",
        requiredScope: "publish" as const,
        discovery: {"group":"displays","hint":"Hide all Kanvas content on one owned browser device until unlocked.","examples":[{"deviceId":"device-id"}]},
        searchAliases: ["kanvas.device.lock"]
    },
    {
        name: "kanvas.device.unlock", summary: "Restore application access on a privacy-locked browser device when its owner is ready to resume viewing.", description: 'Owner-only unlock of a registered browser device. Authenticated account-wide publish grant is the control authority; no PIN or extra confirmation. Content/history are preserved.', schema: deviceLockSchema, idempotent: true,
        domain: "devices",
        requiredScope: "publish" as const,
        discovery: {"group":"displays","hint":"Restore a locked owned browser device without deleting content.","examples":[{"deviceId":"device-id"}]},
        searchAliases: ["kanvas.device.unlock"]
    },
    {
        name: "kanvas.device.update", summary: "Update a device's name, location, role, tags, or home session when organizing registered account screens.", description: 'Edit an owned device name, location, role, tags or defaultSessionId at expectedVersion. Null clears text/default; [] clears tags. Home/start opens the configured default with access rechecked. Account-wide owner authority required.', schema: deviceRenameSchema,
        domain: "devices",
        requiredScope: "publish" as const,
        discovery: {"group":"displays","hint":"Give an owned registered device a useful name for conversational targeting.","examples":[{"deviceId":"device-id","name":"TV","expectedVersion":0}]},
        searchAliases: ["kanvas.device.update"]
    },
    {
        name: "kanvas.start.read", summary: "Read the account start page and recent accessible sessions when choosing a destination for new conversation work.", description: 'At the start of a new conversation or connection, offer this account start page and its ten most recent accessible sessions. Returns names, IDs, real short URLs when already reserved, older-page cursor and explicit new-session capability. Select by the user’s chosen name/ID; never publish to the newest session automatically. No session or short address is created by this read.', schema: z.object({ offset: z.number().int().min(0).max(10000).default(0) }).strict(), readOnly: true,
        domain: "account",
        requiredScope: "read" as const,
        discovery: {"group":"sessions","hint":"Offer the account start page for a new conversation. Choose deliberately, never auto-target recent content.","examples":[{}]},
        searchAliases: ["kanvas.start.read"]
    },
    {
        name: "kanvas.session.rename", summary: "Change an owned session's name when refining its topic label without replacing content, access, or addresses.", description: 'Owner-only rename of a selected session. Supply current configRevision as expectedRevision. Preserves content, display URLs, preferences, membership and OAuth grants; bumps the configuration revision and notifies open clients.', schema: z.object({ sessionId: id, expectedRevision: revision.optional(), name: z.string().trim().min(1).max(160) }).strict(),
        domain: "session",
        requiredScope: "publish" as const,
        discovery: {"group":"sessions","hint":"Owner-only naming change using configRevision; no access/content change.","examples":[{"sessionId":"session-id","expectedRevision":3,"name":"Design review"}]},
        searchAliases: ["kanvas.session.rename"]
    },
    {
        name: "kanvas.display.rename", summary: "Rename an owned display in place when improving its label while preserving content, history, and access.", description: 'Owner-only in-place rename of an existing display. Supply its current display revision. Preserves its content, history, URL and access; notifies connected browsers. Read the current revision after a conflict.', schema: z.object({ sessionId: id, displayId: id, expectedRevision: revision.optional(), name: z.string().trim().min(1).max(160) }).strict(),
        domain: "display",
        requiredScope: "publish" as const,
        discovery: {"group":"displays","hint":"Owner renames the existing display without replacing content or its address. Use its current display revision.","examples":[{"sessionId":"session-id","displayId":"display-id","expectedRevision":3,"name":"Meeting room"}]},
        searchAliases: ["kanvas.display.rename"]
    },
    {
        name: "kanvas.chat.append", summary: "Append supplied messages to the current chat view when extending a displayed conversation without external delivery.", description: 'Append up to 100 supplied messages to the currently displayed chat thread without resending earlier messages. Exact text, sender and source timestamps are retained. Stable unique message IDs plus requestId make exact retries safe. Never sends to Slack, Teams, email or any external conversation.', schema: chatAppendSchema, idempotent: true,
        domain: "feed",
        requiredScope: "publish" as const,
        discovery: {"group":"content","hint":"Append supplied chat messages on KANVAS, not an external conversation.","examples":[{"sessionId":"session-id","displayId":"display-id","expectedRevision":3,"requestId":"chat-1","messages":[{"id":"m1","sender":"Alex","text":"Exact supplied message."}]}]},
        searchAliases: ["kanvas.chat.append"]
    },
    {
        name: "kanvas.selection.set", summary: "Filter, sort, or highlight existing records when adjusting their displayed selection without modifying the retained source.", description: 'Set agent-controlled filtering, stable sorting and row highlighting for the current table, list, log, communication or technical record view. Full source remains stored; this changes only a derived presentation. field is a literal key or dotted field path; empty field addresses a scalar list entry. Numeric comparison uses exact decimal strings. No filter inputs, dropdowns or column-sort buttons are added. selection:null restores the complete original order. Requires current revision and exact retry ID.', schema: selectionInputSchema, idempotent: true,
        domain: "view-navigation",
        requiredScope: "publish" as const,
        discovery: {"group":"content","hint":"Filter/sort/highlight source records without UI widgets or loss of stored source.","examples":[{"sessionId":"session-id","displayId":"display-id","expectedRevision":3,"requestId":"filter-1","selection":{"where":[{"field":"level","op":"eq","value":"error"}],"sort":[{"field":"line","type":"number","direction":"asc"}]}}]},
        searchAliases: ["kanvas.selection.set"]
    },
] as const;
