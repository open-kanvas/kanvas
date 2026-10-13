# Returning-device and interactive-view improvements

## Sign-in and connector identity
Email sign-in buttons are centered primary actions, confirmation numbers are centered, and spacing separates the form from delivery guidance. Actual sender: **kanvas@open-kanvas.ai**. Checking spam or adding a contact does not guarantee delivery. Paired-browser OAuth recovery and explicit connector consent are unchanged.

Public help/docs use the configured installation origin or kanvas.host, never internal deployment addresses. The MCP initialize server metadata now advertises the current monochrome SVG mark at /favicon.svg, also used by browser favicon discovery. Client-specific connector caches are outside server control: reconnect/refresh the connector if its client caches an older icon. This change does not claim that every client consumes MCP icons.

## Chat
The existing chat template gains optional `style: "lines" | "bubbles"` (default lines). `selfSender` is an explicit supplied sender name for trailing alignment. No sender identity or platform is inferred. Exact text, order, append operations, following/scroll behavior and selection remain unchanged. Bubble mode is intended for informal messaging; it never sends messages.

## Flashcards
Publish `{version:1, template:"flashcards", data:{mode:"test",cards:[{id:"hola",prompt:"Translate hola",answer:"hello",acceptedAnswers:["hi"]}]}}`.
Publishing saves an independent session deck. Discover the operation IDs `kanvas.flashcards.read`, `kanvas.flashcards.control`, and `kanvas.flashcards.show`; the public transport remains exactly `kanvas_discover` and `kanvas_call`.

Read returns the saved deck, current index, deck revision and reference answers. For voice testing, speak the current prompt, accept a spoken response, then control `answer` with the exact current cardId, display expectedRevision, expectedDeckRevision, requestId and response. `grading:exact` normalizes Unicode NFKC, trim and English case-folding; it is **not semantic grading**. `grading:self` records an explicit correct boolean; `grading:none` is ungraded. Answer reveals without advancing; next, previous, reveal and restart are explicit. Restart optionally changes learn/test mode. Answered cards can be retried; latest response replaces the previous response for that card.

Document and display optimistic concurrency plus requestId deduplication prevent stale voice responses and concurrent screens from silently overwriting each other. Progress survives display replacement and server restarts. Saved decks are session-shared, not private per-user exams; authorized readers can inspect reference answers. No high-stakes assessment or anti-cheating claim is made. Up to 100 cards/deck and 100 decks/session; no spaced-repetition scheduler.

## First-party diagnostics
The browser batches strict allowlisted event categories: startup/route, command/navigation, stream lifecycle, HTTP status, update receipt, JS/render/asset errors and render acknowledgement. Stored correlation is support reference, tab/window UUID, release, session/display/update IDs and revisions. Raw URLs (including query/fragment), exception messages/stacks, console output, view bodies, input text, cookies, tokens and screenshots are not accepted.

A bounded metadata-only sessionStorage buffer and support reference survive same-tab navigation; buffered observations expire after one day and carry client timestamps (untrusted clocks). Events buffer until authenticated; paired-only, never-authenticated and pre-JavaScript boot failures cannot upload. No external telemetry service. The page emits at most 240 events, holds at most 40, deduplicates repeated metadata for three seconds and sends up to 20/batch. Server caps 120 events/account/minute and 100 batches/account. Failure is dropped, never retried in a loop and never blocks UI. Detail expires after 14 days (hourly pruning); account caps can remove older detail sooner.

Support reference appears in account defaults and on failed opening. Use `kanvas.diagnostics.read` with supportRef or authenticated GET /api/diagnostics?supportRef=... . Optional accountId requires configured service-admin privileges. Timelines are untrusted browser observations, not evidence a human saw content. ID correlation can be joined to existing internal session/update logs; it does not grant access to them.

## Opt-in PWA push
Push is disabled without server configuration. In account defaults, a returning fully signed-in browser explicitly chooses Enable notifications; only that gesture requests browser permission. Supported browsers use their native push service. iOS/iPadOS require a Home Screen installation. Unsupported or unconfigured installations explain that state. Permission alone never silently subscribes another sign-in.

With no connected window, account.begin can create a new ready session for a returning account with an active opted-in subscription (only when no device/window target was specified); otherwise its existing needs_display behavior is unchanged. A queued notification never proves delivery or paint.

An agent-created owner session gets a single preview-free notification when its first display is registered within 60 seconds and no account screen has a connected receiver. Browser-created sessions and sessions owned by others do not notify. Notification text never includes session name, content or sender details. Clicking opens the authenticated display; the URL conveys no authority. Delivery is best-effort, expires after five minutes and is not a read receipt.

Subscriptions bind to account and browser sign-in, maximum ten/account. Disable unsubscribes; logout removes the server record; revoked/expired browser bindings are rechecked before sending. 404/410 responses remove invalid subscriptions. At most ten new-session notices/account/hour, four concurrent jobs and ten subscriptions/job. Deduplication is durable; transient send failures are not retried. Browser-level permission revocation is discovered through delivery failure or local disable, not instant server callbacks.

Only exact HTTPS push-service hosts fcm.googleapis.com, updates.push.services.mozilla.com and web.push.apple.com are accepted, with no credentials, custom port, fragment or redirect following. Other vendors need a reviewed code change; this is not a general HTTP proxy.

### Operator configuration
Generate VAPID material **outside chat and logs** into a root-owned mode-0600 credential file containing JSON fields publicKey, privateKey and subject (a mailto contact). Configure systemd LoadCredential named `kanvas-push` and set `KANVAS_PUSH_ENABLED=true`. Do not put private material in environment values, command arguments, source control, PRs or reports. The application reads only the service credential path. The public VAPID key may be returned to an authenticated browser. Key rotation invalidates existing browser subscriptions: disable/re-enable on each device. Use protected installation backups for subscription records and keys.

No SQL schema migration is required: additive records use the existing generic document store (`flashcards`, `flashcard-request`, `frontend-diagnostic`, `push-subscription`, `push-notice`). Deploying the code does not enroll or notify existing users. Tests inject a sender stub; they never contact push services or send real notifications.

### Manual acceptance
- Desktop and phone: exercise email sign-in, spam guidance, code comparison and PR8 paired-browser OAuth reconnect/explicit consent.
- Refresh a custom MCP connector and inspect its icon; document client/cache limitations.
- Publish line and bubble chat; check exact text, sender alignment and narrow screens.
- Study/test a two-card deck by pointer/keyboard and voice tool calls; answer, reveal, next, restart, reload, replace/restore, and conflict on a second screen.
- Capture support reference during offline/reconnect and controlled render failure; inspect only safe metadata and confirm another account cannot read it.
- With a protected VAPID credential configured: enable on a real supported browser/PWA, close all account screens, start a new agent session, receive and click. Repeat with another account, disabled permission, logout, an already-connected screen and unsupported browser. No real-device delivery has been verified by automated tests.
