# Intent-oriented discovery (bounded prototype)

`kanvas_discover` accepts `catalog:"operations", action:"resolve", query`, optional explicit `sessionId`, `displayId`, `targetRef`, `activeContext`, and `parameters` for user-supplied operation values. It performs no operation, persistence, model inference, external search or permission grant.

Five curated families select existing operations:

- Filter/sort/highlight → selection.set. Recognizes errors/warnings only when that level exists in the current log source, and `sort by FIELD` for an existing literal source field. Other conditions require explicit parameters.selection.
- Navigate/scroll/zoom → navigation.control. Recognizes scroll to top/bottom, zoom in/out/reset, next/previous page. Checks current capabilities. Zoom uses an explicit live viewer or the sole live viewer; multiple/offline viewers need input. Root overview window.viewport remains available through ordinary search/get and is not inferred by this prototype.
- Patch/edit → view.patch. Supply parameters.operations with exact changes; missing text/edits are never invented.
- Publish/target → submit. Supply parameters.view with actual prepared source content. Current submit schema has no expectedRevision; discovery does not invent one. New-session creation and implicit target routing are deliberately not inferred.
- Inspect/interaction → display.current or interactions.read. Current stored view is not a physical screenshot; interaction text never grants permission.

Example: `{catalog:"operations",action:"resolve",query:"show only errors in this log",sessionId:"AUTHORIZED_ID",displayId:"AUTHORIZED_DISPLAY"}`. Use actual IDs from authorized state, never these illustrative strings.

Without reliable session context, returns needs_context and bounded authorized possibleTargets even if there is just one session. Within an explicit session, the sole authorized display can be selected; multiple displays require an explicit choice. Explicit session wins over activeContext/targetRef; an authorized targetRef is read-only resolved, never created. Malformed explicit parameter IDs block readiness instead of falling back to context or the sole display. When targetRef supplies the session, an explicit display must belong to that binding; a conflicting display blocks readiness.

A ready result includes the current complete canonical inputSchema, annotations, schema-valid arguments, a reusable call, fieldSources, empty missingFields and next:kanvas_call. Defaults and generated retry IDs are labelled. Incomplete/unsupported/ambiguous inputs have no executable call and identify missing information. Scope and editor access are checked afresh; revisions are advisory until execution and may conflict. Expected revisions are populated only where the operation supports them. An explicitly supplied stale revision is retained and blocks a ready call; discovery never silently refreshes the basis for an old edit. Conflicting or multiple explicit publication destinations also block a ready call; use the exact submit schema for multi-target publication. Held content requires an explicit host decision, never automatic release.

The host remains responsible for interpretation, source integrity, consent and execution. Validation cannot guarantee all domain-specific patch semantics or future revisions. Re-resolve after conflicts. Use get/search/list for broader operations, and activity.read/analytics.read for existing recorded metrics. Browser paint/receipts must be checked separately from submission acceptance.

This prototype intentionally makes no universal NLP or speed claim. The regression harness measures a real five-family execution fixture and a separate desktop/phone filter workflow: search/get/state/call versus resolve/call, observed validation failures, DOM correctness and two animation frames. These local samples are not physical-display measurements or a statistical latency benchmark.
