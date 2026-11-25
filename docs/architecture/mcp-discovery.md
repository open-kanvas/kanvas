# Two-tool discovery architecture

Both supported MCP transports expose and accept exactly two tools:
- `kanvas_discover`
- `kanvas_call`

## Overview → discover → get → call

```jsonl
{"name":"kanvas_discover","arguments":{}}
{"name":"kanvas_discover","arguments":{"catalog":"operations","action":"search","query":"bring back my saved checklist on another screen"}}
{"name":"kanvas_discover","arguments":{"catalog":"operations","action":"get","id":"kanvas.checklist.show"}}
{"name":"kanvas_call","arguments":{"operationId":"kanvas.checklist.show","arguments":{"sessionId":"live-session","checklistId":"live-checklist","displayId":"live-display","expectedRevision":3,"requestId":"unique-request"}}}
```

Examples demonstrate routing, not permission or real source data. Get the operation schema and live authorized state before changing anything.

## One mental model

Call with no arguments (or `action:overview`) once per conversation. The overview is assembled from live registry summaries plus authorized current screens, recent named sessions and saved guidance; it never creates sessions. For other actions, `catalog` is `operations | templates | help`; `action` is `list | search | get`, or `resolve` for the operations catalog only. [Intent resolution](../intent-discovery.md) covers the bounded five-family read-only workflow.
- **list** has no default pagination or count limit: return every visible ID and one-line description in flat plain text, not JSON. Optional `prefix` explicitly narrows IDs; optional `examples:true` adds minimal examples and may require safety-budget continuation.
- **search** requires a bounded natural-language `query`; default `limit:5` (1–20). Return ranked ID/description summaries with bounded minimal examples when available, never full schemas or full help content. The result gives matching total, catalog total, returned count and explicit continuation for alternatives.
- **get** requires exact `id`. Return an operation schema/annotations/examples, template schema/examples, or focused help content. Template get defaults to `expand:"own"`: nested view slots are named references, not the entire recursive template union; `expand:"full"` requests that union. Unknown and unavailable IDs have indistinguishable errors. No fuzzy fallback.

Both tools accept optional per-call `activeContext`. For ordinary calls it scopes authorized guidance only and never supplies missing operation arguments. Read-only resolve may use explicitly supplied authorized context to propose session arguments; it does not execute a call, choose a browser window or grant access. Explicit operation session/group targets take precedence. When a host hides discovery parameters, use the read-only fallback `kanvas_call {operationId:"kanvas.discover",arguments:{catalog:"help",action:"get",id:"kanvas.help.about"}}`. This fallback cannot execute a nested call.

Search results are intentionally not exhaustive; list is. A 384 KiB response-safety budget may split exceptionally large inventories at entry boundaries. In that case list explicitly says INCOMPLETE and prints the exact cursor continuation; search includes `nextCursor`. The cursor binds account, scopes, query/action and visible catalog revision/content. Never silently truncate a contract or return a partial schema. An individually oversized get fails with actionable provider guidance.

## Unified help

All concepts, task recipes, agent mechanics and reference sections live in one help catalog. `kanvas.help.<topic>[.<section>]` provides natural naming hints; there is no type/audience filter that could hide the better answer. Guide sections have meaningful authored descriptions, not ID-only stubs. Duplicated tour metadata and scalar schema-tool/example-notice pseudo-topics are consolidated into the complete tour and discovery guidance; examples retain their notices. Static help never publishes. Former guide/help/template-get dispatcher operations are discovery content, not duplicate executable capabilities; their canonical service handlers remain internal for browser APIs and regression validation.

## Local retrieval

No external APIs, embeddings, downloaded model, paid service, query-history collection or GPU. Deterministic weighted lexical search combines ID/title/summary/schema terms with curated concepts and typo matching. It is concept-aware lexical retrieval, not neural semantic search. Ranking keeps alternatives visible; tests cover natural phrasing, misspellings, exact IDs and synthetic thousands-entry catalogs. This dependency-free design fits the small dev VM and can later replace ranking without changing the protocol.

## Provider boundaries and future templates

Providers receive the authenticated principal and cancellation signal. Private template providers must query by principal before returning records; visibility is checked before ranking, totals, exact lookup and detail materialization. No account-filtered global cache. Namespace IDs and provider revisions prevent collisions and invalidate cursors. Private account templates can be created, listed, published and deleted through the account.templates operations; visibility remains account-bound. Template schemas are payloads of get, not separate catalogs.

## Execution and compatibility

`kanvas_call` keeps `{operationId, arguments}`; no extra call signature change is needed. The canonical validators and service handlers retain OAuth scope, selected-session authority, CAS/idempotency, consent, cancellation, rich image results and diagnostic instrumentation. Discovery is read-only; the dispatcher conservatively advertises mutation/destruction potential. User/source/report values are never rewritten as guidance. Diagnostic provenance validates the originating kanvas_call operation even when a nested handler fails; recovery summaries translate historical route metadata to current callable routes without modifying stored provenance.

This is an intentional breaking release. Old seven-tool names and former flat/grouped aliases are rejected on every runtime profile, not hidden backdoors. Historical profile configuration values remain accepted only to avoid a configuration migration; they do not alter the public tools. There is one public-ID operation table, grouped by domain, with schema, annotations, scopes and dispatch for every executable operation. Definitions own discovery metadata; no twelve-tool, domain-tool or flat-name translation registry remains. The three help/template catalog helpers remain internal definitions and are not executable public operations. Refresh the MCP connection after deployment.

## Verification

Full clean typecheck/build, unit/integration tests, desktop/mobile browser suite and isolated PostgreSQL backup/restore are required. Test databases are isolated clusters/schemas, never the running dev database. Discovery contract tests cover plain-text completeness, lazy summaries, privacy, cursors, oversize errors and thousands-entry scaling. HTTP tests cover both protocol eras, scopes, unknown aliases, cancellation, rich content and mutation instrumentation. Production changes wait for owner approval.

## Single-source descriptions and hard names

Each operation definition owns its concise `summary` and detailed `description`; template concepts own their `summary` and use guidance. List and overview read those same summaries without character truncation. Administrator-only definitions are excluded before lookup/ranking for non-administrators. Account templates and context are fetched per call, never cached across accounts. The old catalog `tools` is rejected, and the former operations template is now `devops`, without an alias. Existing stored source is not rewritten. Retired operations-template source remains stored but requires an explicit republish using devops; there is no compatibility alias or background rewrite. Help subjects have descriptive IDs; intentional aliases expose `aliasOf`. Every non-overview discovery response and validation recovery points to the overview. The former first-contact block is removed, and publishing no longer repeats the orientation block.

## Browser acknowledgement outcomes

Publishing waits after the mutation transaction commits, for up to 2000 ms by default (`KANVAS_PUBLISH_ACK_WAIT_MS`, clamped 0–5000). This is a browser-observation budget, not a total execution deadline. All target displays share that budget. The returned delivery map reports pending, applied, failed, offline, held, unconfirmed or superseded per display. Offline/held results return immediately; mixed results preserve successful displays. Applied requires a genuine acknowledgement of the matching revision, not merely stored content or a server capture. The browser only acknowledges after visible animation frames; hidden tabs and timer expiry do not manufacture paint. Website/iframe acknowledgements cover the Kanvas container, not cross-origin content.

Identical request-ID retries re-observe the original revision without republishing. A later acknowledgement can turn an unconfirmed receipt into applied; newer content supersedes it. Timeouts are not persisted as rendering failures. Publish, patch, full data edit and retained checklist/task-list updates/show use durable updateId/requestId receipts at this boundary. Late acknowledgements carry both IDs in session logs and are recoverable through update.status. Retained is a historical lifecycle state, not a delivery outcome. Navigation uses the same bounded wait but its genuine per-viewer command acknowledgements and navigation.read recovery, not update.status; video keeps its own protocol. Inspect/status remains useful for unconfirmed outcomes and later checks, not a mandatory second call after applied.
