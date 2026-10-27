# v0.31: account sign-in and view refinements

## One-code account sign-in

The signed-out root screen displays six A–Z letters and the same code in NATO words. Tell your connected agent that code. `login.read` returns approximate city/country (or unavailable), device/browser, request age and the scope of access. The agent must read these back and obtain your explicit confirmation before `login.decide` with `confirm:true`. Its opaque `approvalToken` is protocol state, not a second human code. No QR, second device or screen interaction is required. Email remains an optional alternative for keyboard-equipped devices.

Approval gives a **real full-account browser sign-in**, with the same host-only HttpOnly cookie, idle/absolute lifetimes and Signed-in browsers revocation as email login. The browser goes to the normal root account overview and can access the account's sessions/content. It does not inherit the approving agent's credentials. Normal device/window registration makes redirect/present available when the browser connects. Guest display pairing and legacy receive-only enrollment remain separate APIs and never gain this authority.

Codes rotate after five minutes; previous codes work for thirty further seconds. Active codes are unique, and each browser request is bound to an unpredictable HttpOnly proof cookie. Metadata is untrusted and GeoIP is approximate. Only account-wide publish authority may look up/decide; session-scoped, read-only and receiver credentials cannot approve full login. Review tokens are principal-bound and expire within two minutes; decisions and claims are single-use. Approved claims expire after one minute and reject revoked authorizing grants. Expired approval claims require a new code and fresh consent. Pending request proofs last24hours; the waiting screen automatically starts a fresh request when its proof expires.

There is no meaningful way to assign an arbitrary wrong six-letter guess to a particular pending request. Consequently lookup/decision attempts are capped at 50 per authenticated account per five minutes across all its browser/client grants, plus request creation is IP-limited. A known request locks after 50 invalid review-token confirmations. This is an explicit implementation of bounded attempts, not a claim that arbitrary nonmatching guesses can be attributed to a screen. Status/readback never enumerates pending screens.

Reconnect your agent connector to refresh operation schemas. Discovery operation IDs are `kanvas.login.read` and `kanvas.login.decide`; the resource profile exposes them on `kanvas_screen` as `login.read` and `login.decide`.

## View controls

Checklist zoom is stored with its persistent checklist ID inside its session, not with the display or account. It survives `checklist.update`/`checklist.show` and returning to that saved checklist on another display. Different checklists and new static publications start with their own defaults. Independent viewer-targeted zoom stays a viewer override; broadcast zoom supplies the shared default. Explicit zoom/reset changes the stored preference. Reading/page/scroll state is not implicitly persisted across unrelated views. Old history snapshots that restore as an independent checklist are new views with defaults. Other static templates retain within-publication navigation; republishing fresh content resets it.

Checklists use compact, content-aware columns and retain all supplied detail/checkbox state. Long or large lists scroll. Image zoom scales actual image content; content can exceed the viewport when enlarged. Phone song-sheet type starts at 75% of the supplied size while laptop/TV defaults remain unchanged. Agent zoom remains available.

Document displays omit the Interpretation label and reading-controls footer; all agent navigation/reading operations remain available. Menu-board `backgroundColor` accepts optional #RRGGBB and overrides preset/theme backgrounds only when supplied. Choose suitable text contrast.

`catalog.show` for templates accepts `scope: all | system | account` (default all); private templates display their user-given names plus the account marker. Operations catalogs remain complete. Unknown-field diagnostics emit one issue per key, allowed fields where the object schema is resolved, received type (never the value), and targeted hints for view-envelope fields mistakenly placed in data. Schema-known field names are exposed; arbitrary unrecognized record keys remain redacted under the existing diagnostic privacy contract.

Composable chart SVG sizing is isolated from its measured flex container. Horizontal, stacked, percent, value-label and dual-axis paths share bounded layout instead of growing with each ResizeObserver update.
