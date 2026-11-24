import type {Definition} from './canonical.js';
import {z} from 'zod';
import {activityQuerySchema,analyticsQuerySchema,groupCreateSchema,groupUpdateSchema,groupMemberSchema,groupGrantSchema,sessionContextSchema,profileUpdateSchema,topologyQuerySchema} from '../../shared/accounts.js';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const accountTools: readonly Definition[] = [
    {
        name: "kanvas.profile.read", summary: "Read your account profile and optional avatar when checking the identity currently presented by the account.", description: 'Read the current account profile and optional avatar. Account-wide authorization required.', schema: z.object({}).strict(), readOnly: true,
        domain: "profile",
        requiredScope: "read" as const,
        discovery: {"group":"sessions","hint":"Read your optional account profile and avatar.","examples":[{}]},
        searchAliases: ["kanvas.profile.read"]
    },
    {
        name: "kanvas.profile.update", summary: "Change your display name or avatar when updating account identity without modifying another user's profile.", description: 'Update your own display name or optional profile avatar at its current revision. Use bounded PNG/JPEG/WebP base64 bytes, not remote URLs; avatar:null removes it. Never changes another account.', schema: profileUpdateSchema,
        domain: "profile",
        requiredScope: "publish" as const,
        discovery: {"group":"sessions","hint":"Update your own profile at its current revision; avatar is optional.","examples":[{"expectedRevision":0,"displayName":"Example name"}]},
        searchAliases: ["kanvas.profile.update"]
    },
    {
        name: "kanvas.groups.list", summary: "List your organizations and teams when locating current group memberships independently of linked organizations or sessions.", description: 'List organizations and independent cross-organization teams the current account belongs to. Organization links do not imply membership or session access.', schema: z.object({}).strict(), readOnly: true,
        domain: "groups",
        requiredScope: "read" as const,
        discovery: {"group":"access","hint":"Discover your organizations and independent teams; no access is granted by reading.","examples":[{}]},
        searchAliases: ["kanvas.groups.list"]
    },
    {
        name: "kanvas.group.read", summary: "Read a group's defaults, branding, and member roles when inspecting an organization or team you belong to.", description: 'Read a current organization/team, its branding/defaults and member roles. Requires membership in that group.', schema: z.object({ groupId: id }).strict(), readOnly: true,
        domain: "groups",
        requiredScope: "read" as const,
        discovery: {"group":"access","hint":"Read one permitted group and its membership/defaults.","examples":[{"groupId":"group-id"}]},
        searchAliases: ["kanvas.group.read"]
    },
    {
        name: "kanvas.group.create", summary: "Create an organization or independent team when establishing a requested group without automatically inheriting members or access.", description: 'Create an explicitly requested organization or independent team. Stable requestId prevents duplicate creation. Linking a team to organizations requires administration of each organization; no members or session grants are inherited automatically.', schema: groupCreateSchema, idempotent: true,
        domain: "groups",
        requiredScope: "publish" as const,
        discovery: {"group":"access","hint":"Create an explicitly requested organization or cross-organization team; links alone grant no access.","examples":[{"kind":"organization","name":"Example organization","requestId":"group-1"}]},
        searchAliases: ["kanvas.group.create"]
    },
    {
        name: "kanvas.group.update", summary: "Update group details, defaults, links, or branding when administering an existing organization or team configuration.", description: 'Administer an explicitly selected group name, description, linked organizations, appearance, reading and regional defaults or optional branding. Current group expectedRevision is an optional stale-write guard. Branding logo is bounded raster bytes; null removes it. Does not change session access.', schema: groupUpdateSchema,
        domain: "groups",
        requiredScope: "publish" as const,
        discovery: {"group":"sessions","hint":"Administer one group at the current revision, including optional branding.","examples":[{"groupId":"group-id","expectedRevision":0,"defaults":{"accent":"#38bdf8"}}]},
        searchAliases: ["kanvas.group.update"]
    },
    {
        name: "kanvas.group.member.set", summary: "Add, change, or remove group membership when administering an existing account's role within an organization or team.", description: 'Explicit group membership administration. Add/change an existing username to member/admin or remove with role:null, at current group revision. Owner cannot be removed/demoted; only owner manages admins. Removal immediately invalidates inherited session access.', schema: groupMemberSchema,
        domain: "groups",
        requiredScope: "publish" as const,
        discovery: {"group":"access","hint":"Explicitly add/change a group member; role:null removes. Examples are not permission.","examples":[{"groupId":"group-id","expectedRevision":0,"username":"example_user","role":"member"}]},
        searchAliases: ["kanvas.group.member.set"]
    },
    {
        name: "kanvas.group.access.read", summary: "Read group session-access grants and revocations when the session owner reviews inherited viewer or editor permissions.", description: 'Session-owner read of explicit organization/team default-access grants and revisions, including revoked grant tombstones. A missing grant starts at revision 0.', schema: z.object({ sessionId: id }).strict(), readOnly: true,
        domain: "groups",
        requiredScope: "read" as const,
        discovery: {"group":"access","hint":"Owner read of session-level group grants; missing grant revision starts at zero.","examples":[{"sessionId":"session-id"}]},
        searchAliases: ["kanvas.group.access.read"]
    },
    {
        name: "kanvas.group.access.set", summary: "Grant, change, or revoke a group's session role when the owner manages membership-based viewer or editor access.", description: 'Session owner explicitly grants/changes organization/team session access to viewer/editor, or revokes with role:null. Membership is evaluated at every request; does not populate individual memberships or broaden an OAuth session grant. Audit records actor, time and before/after roles.', schema: groupGrantSchema,
        domain: "groups",
        requiredScope: "publish" as const,
        discovery: {"group":"access","hint":"Explicit owner grant/change/revocation of team/org session access. expectedRevision is an optional stale-write guard.","examples":[{"sessionId":"session-id","groupId":"group-id","expectedRevision":0,"role":"viewer"}]},
        searchAliases: ["kanvas.group.access.set"]
    },
    {
        name: "kanvas.session.context.read", summary: "Read session group associations, branding, and resolved settings when checking which defaults and overrides apply.", description: 'Read a session’s organization/team association, optional branding, explicit settings overrides and resolved precedence. Linking branding is separate from granting access.', schema: z.object({ sessionId: id }).strict(), readOnly: true,
        domain: "session",
        requiredScope: "read" as const,
        discovery: {"group":"sessions","hint":"Read layered appearance/branding and its precedence, separately from access.","examples":[{"sessionId":"session-id"}]},
        searchAliases: ["kanvas.session.context.read"]
    },
    {
        name: "kanvas.session.context.set", summary: "Set session group context, branding, and overrides when choosing inherited settings without granting group access.", description: 'Session-owner setting for optional organization/team context and branding. Precedence: installation, organization, team, explicit personal settings, explicit session overrides. Use null to unlink; explicit empty overrides restore inheritance. Does NOT grant any access.', schema: sessionContextSchema,
        domain: "session",
        requiredScope: "publish" as const,
        discovery: {"group":"sessions","hint":"Owner links optional organization/team branding; this never grants session access.","examples":[{"sessionId":"session-id","expectedRevision":0,"teamId":"team-id","overrides":{}}]},
        searchAliases: ["kanvas.session.context.set"]
    },
    {
        name: "kanvas.activity.read", summary: "Read retained account, session, or group activity when reviewing authorized lifecycle and membership audit events.", description: 'Page genuine retained account/session/group activity, including joins and access grant/change/revocation audit. Current session membership and OAuth scopes apply to history, even for ended sessions. Group history requires group administration. No source text, credentials, raw IPs or fabricated pre-deployment events.', schema: activityQuerySchema, readOnly: true,
        domain: "account",
        requiredScope: "read" as const,
        discovery: {"group":"sessions","hint":"Read retained activity and access audit under the caller’s current session/group permissions.","examples":[{"limit":50}]},
        searchAliases: ["kanvas.activity.read"]
    },
    {
        name: "kanvas.analytics.read", summary: "Aggregate recorded activity by date and type when analyzing usage within authorized account, group, or service scope.", description: 'Aggregate recorded activity by UTC day/type, including byDateAndType matrix (date, type, events) for custom grouped/stacked charts. Existing daily/byType totals and ready-to-publish chart remain. Account scope is available to regular users under their current grants; group scope requires groupId and group admin. Service scope is restricted to deployment-configured service administrators, never inferred from session ownership.', schema: analyticsQuerySchema, readOnly: true,
        domain: "account",
        requiredScope: "read" as const,
        discovery: {"group":"sessions","hint":"Aggregate own activity for charts. Service scope is protected by configured administration.","examples":[{"scope":"account"}]},
        searchAliases: ["kanvas.analytics.read"]
    },
    {
        name: "kanvas.topology.read", summary: "Read live session, display, device, and browser relationships when locating connections or reviewing explicitly included offline records.", description: "Omit sessionId to discover ALL live displays across accessible sessions; redirect your existing window across sessions with kanvas_call with operationId:\"kanvas.connection.redirect\" and arguments:{\u2026}. With sessionId, read live session \u2192 displays \u2192 browser windows and people \u2192 devices \u2192 windows, plus explicitly labelled offline records. includeLocation reveals approximate locally derived GeoIP only to the session owner. expectedCountries highlights review candidates, not threats. Publish session-topology for a live connections or map view; overview remains a chronological visual gallery.", schema: topologyQuerySchema.extend({ sessionId: topologyQuerySchema.shape.sessionId.optional() }), readOnly: true,
        domain: "connections",
        requiredScope: "read" as const,
        discovery: {"group":"displays","hint":"Omit sessionId to discover live windows across ALL accessible sessions; specify it to narrow the lookup. Live structured people/devices/windows and offline evidence. Publish session-topology, not overview, for connection maps. Your own windows can be moved to another display or session with kanvas_call with operationId:\"kanvas.connection.redirect\" and arguments:{…}.","examples":[{"sessionId":"session-id","includeLocation":false}]},
        searchAliases: ["kanvas.topology.read"]
    },
] as const;
