# Two-tool discovery architecture

The two-tool interface supersedes the former seven-tool interface. Every protocol era and deployment profile now exposes and accepts only:
- `kanvas_discover`
- `kanvas_call`

## Discover → get → call

```jsonl
{"name":"kanvas_discover","arguments":{"catalog":"tools","action":"search","query":"bring back my saved checklist on another screen"}}
{"name":"kanvas_discover","arguments":{"catalog":"tools","action":"get","id":"kanvas.checklist.show"}}
{"name":"kanvas_call","arguments":{"operationId":"kanvas.checklist.show","arguments":{"sessionId":"live-session","checklistId":"live-checklist","displayId":"live-display","expectedRevision":3,"requestId":"unique-request"}}}
```

Examples demonstrate routing, not permission or real source data. Get the operation schema and live authorized state before changing anything.

## One mental model

The required `catalog` is `tools | templates | help`; the required `action` is `list | search | get`.
- **list** has no limit or filter: return every visible ID and one-line description in flat plain text, not JSON. No default pagination.
- **search** requires a bounded natural-language `query`; default `limit:5` (1–20). Return ranked ID/description summaries, never detail schemas, examples or full content. The result gives matching total, catalog total, returned count and explicit continuation for alternatives.
- **get** requires exact `id`. Return one complete operation schema/annotations/examples, template schema/examples, or focused help content. Unknown and unavailable IDs have indistinguishable errors. No fuzzy fallback.

Search results are intentionally not exhaustive; list is. A 384 KiB response-safety budget may split exceptionally large inventories at entry boundaries. In that case list explicitly says INCOMPLETE and prints the exact cursor continuation; search includes `nextCursor`. The cursor binds account, scopes, query/action and visible catalog revision/content. Never silently truncate a contract or return a partial schema. An individually oversized get fails with actionable provider guidance.

## Unified help

All concepts, task recipes, agent mechanics and reference sections live in one help catalog. `kanvas.help.<topic>[.<section>]` provides natural naming hints; there is no type/audience filter that could hide the better answer. Guide sections have meaningful authored descriptions, not ID-only stubs. Duplicated tour metadata and scalar schema-tool/example-notice pseudo-topics are consolidated into the complete tour and discovery guidance; examples retain their notices. Static help never publishes. Former guide/help/template-get dispatcher operations are discovery content, not duplicate executable capabilities; their canonical service handlers remain internal for browser APIs and regression validation.

## Local retrieval

No external APIs, embeddings, downloaded model, paid service, query-history collection or GPU. Deterministic weighted lexical search combines ID/title/summary/schema terms with curated concepts and typo matching. It is concept-aware lexical retrieval, not neural semantic search. Ranking keeps alternatives visible; tests cover natural phrasing, misspellings, exact IDs and synthetic thousands-entry catalogs. This dependency-free design fits the small dev VM and can later replace ranking without changing the protocol.

## Provider boundaries and future templates

Providers receive the authenticated principal and cancellation signal. Private template providers must query by principal before returning records; visibility is checked before ranking, totals, exact lookup and detail materialization. No account-filtered global cache. Namespace IDs and provider revisions prevent collisions and invalidate cursors. Private account templates can be created, listed, published and deleted through the account.templates operations; visibility remains account-bound. Template schemas are payloads of get, not separate catalogs.

## Execution and compatibility

`kanvas_call` keeps `{operationId, arguments}`; no extra call signature change is needed. The canonical validators and service handlers retain OAuth scope, selected-session authority, CAS/idempotency, consent, cancellation, rich image results and diagnostic instrumentation. Discovery is read-only; the dispatcher conservatively advertises mutation/destruction potential. User/source/report values are never rewritten as guidance. Diagnostic provenance validates the originating kanvas_call operation even when a nested handler fails; recovery summaries translate historical route metadata to current callable routes without modifying stored provenance.

This is an intentional breaking release. Old seven-tool names and former flat/grouped aliases are rejected on every runtime profile, not hidden backdoors. Historical profile configuration values remain accepted only to avoid a configuration migration; they do not alter the public tools. Internal old grouping registries remain schema/guidance migration helpers and are not additional public catalogs. Refresh the MCP connection after deployment.

## Verification

Full clean typecheck/build, unit/integration tests, desktop/mobile browser suite and isolated PostgreSQL backup/restore are required. Test databases are isolated clusters/schemas, never the running dev database. Discovery contract tests cover plain-text completeness, lazy summaries, privacy, cursors, oversize errors and thousands-entry scaling. HTTP tests cover both protocol eras, scopes, unknown aliases, cancellation, rich content and mutation instrumentation. Production changes wait for owner approval.
