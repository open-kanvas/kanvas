# Free usage limits

All accounts use one free tier; there is no payment or upgrade flow yet. Deployment administrators set `KANVAS_MAX_SESSIONS_PER_ACCOUNT` (default 10) and `KANVAS_MAX_VIEWS_PER_SESSION` (default 50), positive integers up to 100000, then restart the service. No source change is needed.

Session limits count all owned sessions, including ended/archived sessions. View limits count retained nonempty view revisions plus pending publications, including archived views. An existing over-limit account/session remains accessible; only new creation/publication is blocked. Edits that create a new retained revision also consume a view slot; changing ordinary session configuration does not. History retention may remove old unarchived views; archives remain until explicitly restored or permanently removed. A limit response is conversational and does not overwrite a display. Contact the administrator about future upgrades; no billing link is invented.

# Safe schema fallbacks

Every effectful MCP operation with a top-level requestId accepts omission and generates a unique ID. Agents must still supply stable IDs for retry safety; omitted IDs cannot deduplicate retries. Read-side requestId selectors remain unchanged. Target IDs, expected revisions, access scope, participant identity, source coordinates and content have no safe generic defaults and remain explicit. Publishing already selects the only display in an explicit session; multiple candidates return needs_target, never retarget to whichever screen happened to be active. No access scope is inferred or broadened.

# Scoped settings

Ask whether changes apply to the current session, the account’s new-session defaults, a team, or an organization. `kanvas_session` operation `settings.update` accepts scope (session/account/team/organization), config, expectedRevision for that scope and groupId for group scopes. Group writes require owner/admin membership; a session editor cannot change group defaults without that role. Group defaults support regional and reading settings as well as appearance. Precedence in group-associated sessions is installation/session baseline → organization → team → explicit personal defaults → explicit session overrides. Standalone existing sessions remain unchanged by account default updates.

Publish settings with data.dimension (for example timeFormat or unitSystem) to show just one choice. Changing a scope resets unsaved changes and loads that scope’s values.

# Archive and permanent deletion

`kanvas_archive` operations list and manage expose recoverable archives. manage defaults to action archive; select resource session/display/view, sessionId and targetId for displays/views (history now returns retained view IDs). Archives are hidden and inaccessible through normal reads; restoring reuses the same IDs. No automatic purge.

For hard deletion use request-delete, selecting the current live confirmation display (can be another session when deleting an archived session). The owner sees a 60-second warning and three random phonetic words. Only a subsequent confirm-delete with the matching challengeId and words explicitly supplied by the human can remove the item. Three wrong attempts close the request. The code is not included in the MCP response and never published into retained view history. No nonowner or selected-session grant can expand its scope using this API.
