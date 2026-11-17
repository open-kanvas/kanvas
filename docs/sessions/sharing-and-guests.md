# Share one display with approved guests

In a session you own, open **People & access → Share a display**. Choose an existing
display, an invitation label and a lifetime, then create the sharing link. The
same invitation is shown as a QR code.

The invitation label is public to anyone who opens the link. Session names,
display content, account details and source data are not included in that
discovery response. A link or QR scan alone does **not** grant viewer access.

## Admit a browser

1. The guest opens the link, enters a screen name and requests access. A
   browser-held, HttpOnly proof cookie binds that request to this browser.
2. Confirm the request label with the person. In **Guest browsers**, choose
   **Deny guest** or **Approve view only**.
3. If the invitation allows response requests and the guest explicitly asked
   to respond, **Approve responses** is also available. It is never selected
   automatically, including when the request asks for it.
4. The original requesting browser claims its approved grant and opens the
   existing live display. No account, membership or new display is created.

An already signed-in account with actual display access can open the display
directly. A signed-in account without access is not silently replaced with a
guest identity: use a separate private browser window or explicitly sign out.

## What guests can do

All admitted browsers follow the same display and receive live updates.
View-only guests cannot submit answers or use contextual actions. Explicitly
interactive guests can submit the currently displayed forms, polls, audience
questions, checklist changes and contextual actions. The presenter receives
their responses; checklist changes affect the shared display.

Each approved browser has a server-derived participant identity, distinct from
the owner and other guests. Repeated votes replace that browser's prior vote;
guest-selected answers and form submission state do not become the owner's.
Poll and question aggregates are exposed only when the presenter reveals them.

Neither kind of guest can manage the workspace, add members, publish or edit
views, navigate saved presentations, inspect display history, read original
datasets, read the response inbox, or open other displays. Local media is
available only while referenced by the approved display's currently active
view. The normal viewer can still report its viewport and rendering status.
An isolated server screenshot identity is separate and cannot write or submit
a fabricated physical-viewer acknowledgement.

## Expiry and revocation

- New pending requests expire after ten minutes, or when their invitation expires
  if earlier, and must be approved and claimed before that deadline. Existing
  requests keep their originally issued expiry; extending the default never
  revives an expired request or grants permission automatically.
- Invitations default to 24 hours, with a maximum of seven days. The UI also
  offers a one-hour invitation.
- An approved guest grant cannot outlive its invitation or its seven-day
  browser lifetime. Every request and stream rechecks the server grant.
- **Revoke guest** removes only that browser. **Revoke invitation and guests**
  closes linked pending requests and active viewers together. Existing streams
  are disconnected; replaying the original invitation or proof cannot restore
  access.
- Ended sessions, removed displays and removed owning accounts no longer admit
  guests. Removing an account also invalidates its retained browser grants.

Per session: at most 32 active invitations, 64 pending invitation requests and
128 approved paired browsers. Admission creation and decisions are rate
limited. This is an owner-approved follow-along flow, not an anonymous public
broadcast, attendee account system or large-event admission platform.

Existing direct paired screens remain view-only and retain their original
expiry. Their original approval/claim records already persist the owner,
exact browser, display and grant deadline; no new approval or inferred expiry
is needed for a valid existing grant. New interactive permission requires a
new explicit invitation request and owner decision. Incomplete or expired
records are not repaired into a new grant automatically.

## Verification

`tests/core/sharing.test.ts` exercises discovery, CSRF/origin and owner checks,
browser binding, explicit participation, per-guest vote/form/retry isolation,
restricted controls and source access, expiry, revocation of active streams,
and capture-only restrictions through real loopback HTTP.

`tests/e2e/sharing.spec.ts` covers rendered QR invitations, request/deny/approve,
view-only live updates, independent guest voting and revocation in isolated
desktop and phone browser contexts. A physical phone camera scan and an actual
audience event are separate acceptance checks, not simulated load-test claims.

## Agent-managed invitation lifecycle

`kanvas.shares.read {sessionId}` lists only active, unexpired links owned by the session’s owning account. It needs a full-account read grant. `kanvas.share.revoke {sessionId,shareId}` needs owning-account publish authority and closes that invitation immediately, including its approved and pending pairings and paired-browser sessions. A repeated revoke is safe and keeps the original close time. Other invitation links, member grants and the owner’s sign-in are unchanged.

The session overview returns to `private` when its last active link is revoked, unless public access or another sharing grant still applies. A share ID is not an invite ID: use the share operations, not `kanvas.invite.revoke`.
