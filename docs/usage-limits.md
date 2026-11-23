# Free usage limits

## Limit messages and what counts (0.37.0)

A limit answer says which limit was reached, how much is used and what can be done. Agents receive `code`, `message` and a structured `limit {code, limit, used, resource, tier, whatYouCanDo, contact, paidPlans:false}`; the browser API returns the same.

- `SESSION_LIMIT_REACHED`: "You've reached the free limit of {limit} sessions on this account, so a new session can't be created. You can keep using your existing sessions, or archive one you no longer need to free up a slot. Need more? Paid plans aren't available yet. Email {contact} to request a higher limit."
- `VIEW_LIMIT_REACHED`: the same pattern for the per-session view limit.
- `SESSION_STORAGE_LIMIT_REACHED`: the total of stored sessions, archived ones included, is five times the session limit; permanently deleting an archived session frees space.

The numbers come from the values that enforce the limit (`KANVAS_MAX_SESSIONS_PER_ACCOUNT`, the fixed view cap); the contact address is `KANVAS_LIMIT_CONTACT` (default kanvas@open-kanvas.ai). When paid plans exist only the last sentence changes.

A session uses a slot when it is owned by the account and not archived. Two things changed with this release: **archived sessions no longer use a slot** (restoring one takes a slot again and is refused at the limit), and the **Home session every account is given automatically is no longer counted**; the limit counts the sessions a person or their agent created. Before this release Home used one of the ten slots, so an account could create nine sessions of its own. That matches the report of a limit reached with nine sessions; it was derived from the code, not confirmed against the reporting account's data. The active-session limit excludes archived and generated Home sessions; the separate stored-session limit includes archived user-created sessions. The view limit still counts archived views.

Accounts default to the trial quota tier; operators may assign free or admin quota entitlements. Neither label grants administrator authority. There is no payment or self-service upgrade flow yet. Read your actual tier and limits with kanvas_call with operationId:"kanvas.account.details" and arguments:{…}. Deployment administrators may set `KANVAS_MAX_SESSIONS_PER_ACCOUNT` (trial default10, positive integer up to100000). Retained views have a fixed1000-per-session cap across all tiers; the retired `KANVAS_MAX_VIEWS_PER_SESSION` override no longer applies.

The active-session limit counts owned, nonarchived, user-created sessions (including ended sessions that are not archived). The separate stored-session cap also counts archived user-created sessions; generated Home sessions are excluded from both. View limits count retained nonempty view revisions plus pending publications, including archived views. An existing over-limit account/session remains accessible; only new creation/publication is blocked. Edits that create a new retained revision also consume a view slot; changing ordinary session configuration does not. History navigation, presentation/procedure navigation and display-sync positioning consume no publication slots. There is no per-display count/byte eviction. Publishing after history navigation preserves the forward branch. Archives remain until explicitly restored or permanently removed. A limit response is conversational and does not overwrite a display. Start a new session when the fixed view limit is reached. Free/admin session entitlements do not bypass that view cap or grant administrator authority.

# Safe schema fallbacks

Every effectful MCP operation with a top-level requestId accepts omission and generates a unique ID. Agents must still supply stable IDs for retry safety; omitted IDs cannot deduplicate retries. Read-side requestId selectors remain unchanged. Revision/version guards can be omitted under the current mutation policy; when supplied they must be actual current state and stale guards are rejected. Target identity, access scope, participant identity, source coordinates and content are never fabricated. A publication with an explicit session but omitted display target uses that session's stable primary display; it does not broadcast or choose whichever screen happened to be active. Supply explicit display IDs to choose other or multiple authorized targets. No access scope is inferred or broadened.

# Scoped settings

Ask whether changes apply to the current session, the account’s new-session defaults, a team, or an organization. `kanvas_call` with `operationId:"kanvas.config.update"` and nested `arguments` accepts scope (session/account/team/organization), config, expectedRevision for that scope and groupId for group scopes. Group writes require owner/admin membership; a session editor cannot change group defaults without that role. Group defaults support regional and reading settings as well as appearance. Precedence in group-associated sessions is installation/session baseline → organization → team → explicit personal defaults → explicit session overrides. Standalone existing sessions remain unchanged by account default updates.

Publish settings with data.dimension (for example timeFormat or unitSystem) to show just one choice. Changing a scope resets unsaved changes and loads that scope’s values.

# Archive and permanent deletion

`kanvas_discover` with `{ "catalog":"tools", "action":"search", "query": "archive" }` finds the recoverable archive operations `kanvas.archive.list` and `kanvas.archive.manage`; get the selected ID for its full schema, then execute through `kanvas_call`. manage defaults to action archive; select resource session/display/view, sessionId and targetId for displays/views (history now returns retained view IDs). Archives are hidden and inaccessible through normal reads; restoring reuses the same IDs. No automatic purge.

For hard deletion use request-delete, selecting the current live confirmation display (can be another session when deleting an archived session). The owner sees a 60-second warning and three random phonetic words. Only a subsequent confirm-delete with the matching challengeId and words explicitly supplied by the human can remove the item. Three wrong attempts close the request. The code is not included in the MCP response and never published into retained view history. No nonowner or selected-session grant can expand its scope using this API.
