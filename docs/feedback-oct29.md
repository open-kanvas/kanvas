# Current screen and agent workflows

## Browser controls and keyboard

The quiet corner menu provides screen controls and optional push setup without opening the console. About this view and Open console are removed from that menu; the console path and account functions remain supported. `kanvas.screen.control` opens the native menu/help/options/notification controls, navigates overview/live/previous/next/home, refreshes a connection or signs out one explicitly confirmed own-account viewer. Fullscreen and browser push permission require the user's click; the operation never bypasses that gesture.

Home opens the session overview; Ctrl+Home returns a full-account screen to all sessions; End returns to live content and follows publications. Left/right move through pages then retained views; F toggles fullscreen; ? opens controls; Escape closes controls/options/overview. Editable/interactive controls, text selection and scrollable content retain native behavior. Presenter-following screens cannot navigate independently. The list is shared by code and the keyboard-shortcuts help topic.

## Visual documentation

`kanvas.help.visual` retrieves a reusable single-view help page; `kanvas.help.show` publishes it using ordinary authorization and publication receipts. Supply topic and zero-based page; retrieval includes pageCount. Traditional full help remains available. No publication occurs merely by discovering or reading help.

## Notifications

Enable notifications through an explicit click in the display menu, then approve the browser prompt. On iOS, Home Screen installation may be required. `kanvas.notifications.targets` lists only your active browser/PWA subscriptions; `rename` gives recognizable names; `send` chooses targetIds and an owned session/display. Omitted targets preserve broadcast to all your enabled subscriptions. A browser profile and installed app may or may not share a subscription; names are user labels, not verified physical-device identities. Provider acceptance is not proof of display; offline delivery expires after five minutes. Disabled/expired endpoints are removed, and logout or browser revocation invalidates delivery. No endpoint URLs or keys appear in target listings.

## Six-letter approval

The existing screen code remains unchanged. After readback and owner confirmation, `kanvas.login.decide` accepts scope:account, or scope:session plus one owned sessionId. Session access is view-only, cannot access other sessions or account settings, and rechecks ownership at claim. Normal expiry, replay, rate limits and authorizing-grant revocation still apply.

## Feedback context, not classification

Feedback/error creation has no scope field. sessionId is optional; display/update/diagnostic references need matching authorized session context. Account/author identity and inferred client metadata are recorded automatically. Reading without a session lists the author's reports; session reads require access; allAccounts:true requires configured service administration. Status review requires session ownership for session reports or authorship/service administration otherwise. Data migration3 removes old scope metadata, preserves every report's text, status, revision and history, and records accountId from authorId. No status is changed by the migration. Old binaries do not implement these semantics: review backup compatibility before rollback.

## Charts

Use stackGroup per bar series for independently stacked groups side by side. Accumulation and percent denominators are isolated by axis, kind and group. Lines never stack and can use a secondary axis. Negative stacks have separate baselines; null values retain gaps. Hover/focus titles, legend visibility and category zoom/pan remain available for dense data.

## Connector icons

MCP initialize advertises versioned public square PNG and SVG icons. Favicon/ICO/apple-touch/PWA assets remain public. External clients choose whether and how to display icons; a public asset/metadata check is not proof of a fresh connector install in a particular client.
