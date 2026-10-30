# October 6 feedback: connected screens and contextual workflows

> Historical release notes. For current behavior and exact schemas, use [current workflows](feedback-oct29.md) and the running `/docs/` reference. Later changes may supersede these release-specific descriptions.

The public MCP surface remains exactly `kanvas_discover` and `kanvas_call`.

## First contact

Read `kanvas.help.about` or `kanvas.help.what-is-kanvas`, then
`kanvas.help.getting-started.steps`. Ask the human to open **kanvas.host** and
sign in. The reports' canvas.host spelling is
not a Kanvas domain. Signed-out root offers email sign-in and a short session
key for owner-approved pairing. Signed-in root shows the session overview and
registers an idle receiver independently of session creation. These receiver
mechanics already existed; this release verifies them and promotes their guidance.

Use `kanvas.account.begin`, inspect `kanvas.devices.read`, submit authorized
content, then use `kanvas.window.present` for a chosen connected tab or
`kanvas.device.present` when all windows on that device are intended. Check
actual applied/painted receipts. Do not claim delivery from a pending command.
If a link is needed, prefer the returned shortUrl. Never read a raw view path
aloud or treat a locator as guest authorization.

## Discover stateful operations at the right moment

Template get results expose related operation IDs and descriptions. Prepared
submit results expose the same workflow links, without duplicating schemas.
Planner, checklist, drafting, presentation, chat, progress, scoreboard and timer
families point to their targeted operations. Get each operation before calling;
read live revisions and preserve IDs instead of rebuilding authoritative state.
Search remains concise and never includes full schemas/content.

Planner finalization and committed planner submissions explicitly tell agents
to clarify that commitment is visual state in Kanvas only. No calendar sync,
invitations or emails occur. Real-world changes require a separately agreed step
using external tools.

Validation failures now include operation-specific get pointers and a bounded,
server-authored valid example when available. Submit failures show the nested
view envelope, plural displayIds and title placement. Template validation errors
link to that exact template. Unknown fields and source content are never echoed;
inputs are not silently normalized into a potentially different operation.

The canonical help topic is now `kanvas.help.submit`; the old /docs/publish URL
continues to render the current submit page for existing links.

## Analytics

`kanvas.analytics.read` retains daily/byType/chart and adds **byDateAndType**:
`[{date: "YYYY-MM-DD", type: "event-type", events: 4}]`. It contains only recorded,
authorized events under the existing account/group/service filters, so callers
can construct grouped or stacked charts without sensitive raw event payloads.
No zero-count dates, historical events or external activity are fabricated.

## In-place reading continuity

Displays now carry a navigationRoot identity. Patch/data edits and narrow state
mutations preserve it; a fresh submit, history navigation, clear or recalled
content starts a new identity. Navigation/page state survives in-place edits,
with pages clamped to available content and automatic reading paused. Browser
scroll restoration prefers a unique visible text block, then pixel position
when that anchor changed or is ambiguous. Explicit navigation still wins. New
content does not inherit a previous document's scroll position.

The signed-in Table viewer keeps its established source-aware reconciliation: metadata-only replacements retain filters/page; changed row sets clamp the page and reset invalid filters. Its renderer is not remounted by the generic navigation identity.
Public read-only viewers retain in-place edits but reset on a new submission, as before.
