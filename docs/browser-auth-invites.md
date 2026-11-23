# Browser sign-ins and explicitly requested invitation email

The advertised MCP tools remain `kanvas_discover` and `kanvas_call`. Get the exact schemas with `kanvas_discover {catalog:"tools",action:"get",id:"kanvas.browser.auth.list"}` (or the other operation ID), then use `kanvas_call {operationId,arguments}`.

## Remote full-account browser logout

- `kanvas.browser.auth.list`, arguments `{}`: current account's nonexpired full-account browser sessions, each with management `id`, creation time (null for legacy records), expiry, and `current` (true only when invoked from that browser, not OAuth). IDs are separate one-way management digests, not cookie hashes; no bearer or CSRF values are returned.
- `kanvas.browser.auth.revoke`, arguments `{browserSessionId:"ID_FROM_LIST",confirm:true,requestId:"logout-1"}` OR `{all:true,confirm:true,requestId:"logout-all-1"}`: delete one/all full-account cookie grants and associated push subscriptions. Requires account-level publish authority even to list. Read-only/selected-session OAuth grants and paired/capture browsers cannot use either operation.
- Exact retries return the original count. In particular, repeating an all-browser logout does not log out new sign-ins created after its first successful execution. New intent uses a new request ID. Cross-account IDs produce not found.
- APIs revalidate stored credentials. Attached session, device and window receiver SSE connections close on committed revocation; their actions/delivery also recheck credentials. This prevents further access, not removal of content previously received/cached by a browser.
- Paired view-only displays, independent OAuth/client grants, session membership and registered device records are NOT revoked. Use pairing revoke, client connection revoke or membership removal separately. All includes the invoking full browser if applicable; an OAuth agent remains connected.

## Native email invitation delivery

1. Explicitly create an onboarding/group invitation using `kanvas.invite.create`, or a session display invitation using `kanvas.share.create`. Link-only creation still sends nothing.
2. On an explicit request to email a recipient, call `kanvas.invite.send` with `{invitationId:"INVITE_ID",email:"recipient@example.com",confirm:true,requestId:"email-1"}`. For a session display share, replace invitationId with `shareId`. Exactly one is required.
3. Response `requestAccepted:true,status:"queued",sent:false` means queued, NOT delivered. Retry the exact request to inspect `queued`, `sending`, `sent` (provider accepted, not proof of inbox delivery), or `failed`. No automatic resend. Reusing a request ID with different arguments is a conflict.

Only the original inviter may email an onboarding/group invitation; current group administration is rechecked. Session shares require the current owning account. Account-level publish authority is required. Invites must be active/unexpired/unaccepted; share admission validation applies. Templates contain fixed subjects/body text plus validated server-generated invitation URLs and expiry; agents cannot supply arbitrary HTML, subjects, URLs or mail content. Raw recipient addresses are validated/normalized and never used for account lookup, so results do not enumerate registered accounts. A forwarded group invite retains the existing one-person acceptance semantics: email is a delivery address, not a new identity binding. A session share remains owner-approved view-only/interactive display access, NOT account/session membership. Recipient onboarding still requires ordinary email verification and legal confirmation.

Dispatch is bounded to 10 attempts/account/hour, 50/account/day, 3/recipient/day across accounts and 100/installation/hour. Queued/failed attempts count. Receipt reservation commits before I/O; current authority is checked again before claiming the attempt. Provider idempotency is also supplied. There is no background automatic retry: if the process stops after reservation or claim, status may remain queued/sending and delivery is uncertain. Reusing the request never sends again; inspect before any separately authorized new send. Revoked/expired links stay invalid even if a previously delivered email exists.

The persistent receipt contains owner ID, recipient hash, argument digest, time and status, not raw recipient/content/provider responses. These deduplication/audit receipts are retained with application data (no automatic retention deletion yet). No external provider response or credential is logged. Provider receives recipient and the fixed invitation content.

## Operator enablement and rollback

Disabled by default. Enable only with `KANVAS_INVITE_EMAIL=true`, `KANVAS_MAIL_FROM` and the existing protected systemd `kanvas-mailer` service credential used for sign-in. The invitation sender uses the same Resend infrastructure, with a 12-second timeout and no redirects. No new credential is needed and no credential goes in chat or source. Existing sign-in enablement does not itself enable invitation email. Turning the flag off restores link-only behavior without invalidating existing links or undoing sends. New metadata uses the existing document store; no schema migration is required for these two features. Downgrade preserves cookie deletion; older code ignores the new receipt kinds/creation timestamps.

## Manual dev acceptance

Use dedicated test accounts only. List two full browsers via MCP, log out one and verify an already-open stream ends plus protected requests fail; the other browser and agent OAuth should remain valid. Repeat all-browser logout, verify pairings remain separate, then sign in anew and verify an exact retry does not revoke the new browser. Inspect discover schemas for both target alternatives.

Email tests use mocked delivery only. Before any real dev delivery, explicitly authorize the exact recipient and enable the operator flag; verify onboarding and session-share content, recipient acceptance/approval, expiry/revocation, and exact retry status without a duplicate email.
