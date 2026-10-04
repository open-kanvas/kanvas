# Persistent checklists and account-aware startup

## Checklists

Publishing a `checklist` automatically saves an independent session document. Its `data.checklistId` and `data.checklistRevision` identify it. Normal item patches and viewer checkbox changes update that document too. Replacing or clearing a display does not erase it.

- `kanvas_checklist read {sessionId}` lists IDs, titles and completion counts. Include `checklistId` for exact items and checked state. Large documents return bounded item windows: continue with `offset:nextOffset`.
- `kanvas_checklist update` accepts a complete `items` array, current **document** `expectedRevision` and an exact retry `requestId`. It changes saved state, not whichever content a display now shows.
- `kanvas_checklist show` accepts a same-session destination `displayId`, that **display's** `expectedRevision`, checklist ID and retry ID. It publishes the full latest saved state, regardless of which display originally showed it.

Keep the returned identity/revision when modifying the same checklist. Omit them for a genuinely new list. Stale mirrors cannot overwrite newer saved state: read the latest checklist and show it again. Showing a saved checklist does not silently alter other displays. Identical checklist content in one multi-display publication shares a document. Up to100 documents per session, each with at most100 items. Session ownership/access and ordinary view quotas still apply; new document storage is independent of bounded display history.

Retained pre-upgrade checklist snapshots appear with `legacy_` IDs. Showing one promotes its actual stored items into a durable document. No content is reconstructed from an agent's conversation memory.

## Start and identity

A signed-in root/Console window now registers its authenticated receiver even before joining a session. `kanvas_connections read` includes `availableWindows`; use the returned device/window/version with `kanvas_devices window.present`, or `kanvas_account begin` to start a new subject session. Account ownership is still required. Multiple windows still need an explicit target choice.

Explicit `kanvas_session create` returns one blank Main display and its immediately joinable private `viewerUrl`. It shows the branded ready screen until content is published. Experienced/headless workflows can explicitly set `initialDisplay:false`; internal provisioning uses its existing display lifecycle. A viewer address never grants access.

`kanvas_account details` and `kanvas_profile read` provide the current account's email, display name, quota tier and configured limits. No arbitrary account ID is accepted. Account details require an account-wide grant. The details result includes a ready table recipe; it contains personal information and should only be shown on the user's intended private display. Quota tiers do not grant service-administrator permissions.

Settings publications return live action guidance: read session `configRevision`, then apply requested changes via `kanvas_session settings.update` with `expectedRevision` and `config`. Account/group scopes keep their own revision and authorization boundaries.

## Deployment and rollback

No PostgreSQL structural migration is required. New `checklist` and `checklist-request` session documents and optional checklist metadata in retained views are persisted. Take the standard pre-deployment database snapshot. Rolling back to pre-feature code may require restoring that snapshot: older strict view validators reject the added checklist fields when editing a saved view. Do not remove the local backup until acceptance.

MCP server metadata advertises the current official icon at `/icons/kanvas-192.png`. Existing favicon/PWA assets already use the official mark. Clients that cached connector metadata may need a reconnect or connector refresh; Kanvas cannot forcibly clear a third-party app's cache.
