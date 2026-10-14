# Account overview and return navigation

The signed-in application root is an agent-native session overview. It registers the current browser window without provisioning a Home session. Existing account Home and `/start` behavior remain compatible. Signed-out, paired-view-only, email confirmation and pending OAuth consent routes retain precedence. `/console` and the configured console host keep the legacy workspace.

Sessions are ordered by the latest session metadata change, display content/control update, interaction creation or session audit event. Presence heartbeats do not reorder them. Ended sessions and generated account-entry Home sessions are omitted. Ten sessions are returned per page with up to eight nested display links each. A per-session aggregate counts currently receiving devices (falling back to a connection ID when a receiver has no device identity).

Current previews are intentionally passive: bounded template/title/current scalar content, including the current presentation slide, rendered as escaped text. Tables show up to3 headers and2 rows (40 characters/cell); diagrams show up to3 real node labels and their basic shapes (60 characters/label), without inferring omitted connections. Other nontext visuals have an explicit unavailable-preview fallback. They never execute a view, HTML, script, SVG, iframe, remote image, audio or video. Queries project only those fields, not retained full view histories. The overview refreshes every 30 seconds while visible and on window focus. Access is resolved before querying the page; previews never expand authority. The existing accessible-session inventory is still enumerated for authorization and sorting; page content projections are strictly bounded.

To send a window to a display, discover `kanvas.window.present`. To bring it back, discover `kanvas.window.overview` and call:

```json
{"operationId":"kanvas.window.overview","arguments":{"deviceId":"device-id","windowId":"window-id","expectedVersion":3,"requestId":"return-overview-1"}}
```

Use the `deviceId`, window ID and window version from `kanvas.devices.read`. Account-wide publish authority and ownership of that registered window are required. The window must be online. Reuse the same request ID and identical arguments for a retry; conflicting input is rejected. A new operation requires the current version. Sibling windows are unchanged. No session or display is created.

A pending command is not success. Inspect that window's command through devices.read until `status: applied`. The browser acknowledges only after the root overview has rendered, clears its session/display observation, and retains the command receipt. Navigation stays on the receiving origin to preserve tab identity. On the legacy console host it selects `/?overview=1`; its ordinary root still opens the console. Expired or superseded commands cannot be acknowledged; replayed requests report supersession without moving the window again.

## Development acceptance

1. Sign in at the application root; verify compact current previews, nested links and counts at desktop and phone widths. Publish to an older session: it should move above newer inactive sessions on refresh.
2. Open a nested display link. Read devices, then issue window.overview using that tab's version. Verify the same tab returns to root, its command becomes applied, current session/display is absent, and sibling tabs remain untouched.
3. Verify an empty account explains how to connect an agent. Merely loading root must not create a session. Confirm `/console`, pending OAuth and paired-display routes still work.
4. Verify private/other-account content never appears; HTML-like titles remain text and no remote preview requests occur.

No database migration or new runtime setting is needed. Older code ignores the new pending overview command shape; deploy rollback should allow pending commands to expire before targeting the affected windows again.
