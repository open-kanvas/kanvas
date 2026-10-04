# Seven-tool MCP discovery

## Public protocol and workflow

Every authenticated transport (2026 discovery and 2025 initialization eras) and every accepted deployment profile lists exactly:

- `kanvas_help_search`, `kanvas_help_index`
- `kanvas_template_search`, `kanvas_template_index`
- `kanvas_tool_search`, `kanvas_tool_index`
- `kanvas_tool_use`

Search takes `{query, limit?:1..10, cursor?}`; default limit is five. Index takes `{limit?:1..100, cursor?}`; default is 50. Each response contains `total`, `catalogTotal`, `returned`, `offset`, `results` and `nextCursor` (null at the end). Index results are concise. Search results contain full contracts and executable examples. Exact namespaced IDs return only that entry; an unavailable/unknown exact ID returns no results. Other searches rank matching entries, not a fixed category list. Scores are internal ranking signals, never probabilities.

For example:

```json
{"name":"kanvas_tool_search","arguments":{"query":"bring back my saved checklist on another screen"}}
```

Then, after obtaining real authorized IDs and current revision:

```json
{"name":"kanvas_tool_use","arguments":{"operationId":"kanvas.checklist.show","arguments":{"sessionId":"session-id","checklistId":"checklist-id","displayId":"display-id","expectedRevision":0,"requestId":"restore-checklist-1"}}}
```

Namespaced operation IDs are stable mappings of established canonical names, independent of old domain groupings. `kanvas.session.state`, `kanvas.submit`, `kanvas.update.status`, `kanvas.display.request.capture`, and `kanvas.display.snapshot` illustrate the distinction between state, publication, acknowledgement, consented receiving-browser capture, and isolated server-browser capture.

## Complete coverage without a growing tool list

The existing canonical definitions remain the validator/schema/annotations source of truth. Operation discovery derives all 127 operations and their examples from it; both former grouping registries must cover this same catalog exactly once at startup. Every former nested grouped operation therefore remains executable. Group aliases are not duplicate search entries. Adding a capability requires its canonical validator, example and reviewed registry coverage, not another public MCP tool.

Seventy-four real built-in templates use the actual renderer validation schemas, supplied examples, names and display guidance. Help currently contains 59 focused sections derived from every authored help topic and guide topic. Long help pages split only along authored step boundaries; each index page remains concise. The public `/docs/` reference uses the new search/execute flow and offers operation-specific contracts at `/docs/operations/<operationId>.json`.

Schema and example constraints are tested against JSON Schema and the unchanged runtime validators. Template examples also pass the actual view validators. Search never replaces a schema with a preview: detail pages have a 384 KiB payload budget, with an explicit continuation cursor if fewer than the requested matches fit. A single over-budget provider entry fails rather than silently exposing an unusable partial contract. Exact current template contracts fit (largest approximately 66 KiB). Normal execution keeps the existing result/content/error behavior and its existing operation-result size rules.

## Authorization, context and extension seams

`kanvas_tool_use` resolves only an exact registered operation ID, then runs the existing wire normalization, canonical validators, service authorization, OAuth scopes, selected-session restrictions, roles, revision/idempotency checks, holds and consent rules. It is not eval, a URL/path router, or a way to call arbitrary services. Its public annotations are deliberately conservative: possibly destructive/non-idempotent/open-world. Search exposes each operation's precise annotations. A read-only token still cannot mutate through the dispatcher.

The authenticated principal, async call context, nested session metadata and SDK cancellation signal are preserved. Existing image content remains image content and safe errors remain MCP `isError` results. Cancellation is cooperative: pre-execution cancellation aborts dispatch and the signal is forwarded to services that support it; an already committed mutation is not rolled back. Discovery does not execute domain operations, record diagnostic writes, or consume viewer input. Literal source, report and example argument strings are never rewritten as guidance.

`CatalogProvider` is a namespaced, kind-specific source. Every request receives `CatalogContext` with the actual authenticated principal. A future private-template provider must fetch only this principal's authorized records; item visibility is additionally checked before ranking, exact lookup, totals, cursor construction or materialization. Cursors bind release version, catalog kind, query, visible searchable metadata/provider revisions and account context; changed contracts restart pagination. There is no shared account-filtered result cache. Built-ins contain no private account records and are discoverable by scoped authenticated readers. This change does **not** implement private-template CRUD or pretend private templates exist.

## Local retrieval decision

Production search is dependency-free weighted lexical retrieval with curated general concept groups, term-frequency discrimination, morphology, single-edit/transposition typo matching, query-concept coverage and deterministic tie-breaking. IDs/titles and focused hints weigh more than long descriptions; operation fields/enums aid discovery. This is concept-aware lexical retrieval, **not pretrained neural embeddings**. It has no model download, external embedding API, outbound runtime calls, query logging or embedding of account data.

The two-CPU, four-GiB dev host has no installed ONNX/PyTorch/SentenceTransformers runtime, pretrained embedding model, NumPy or SciPy. A quantized local sentence encoder is technically feasible on a host of this size, but would introduce model/runtime distribution and pinning, extra cold-start/resident memory, licensing/supply-chain maintenance, and a new measured ranking/latency gate. Its latency was not measured because no model was installed; absence of a model is not proof local embeddings cannot work. We also evaluate a dependency-free corpus-local latent semantic alternative (TF-IDF truncated LSA) with the benchmark script: it can learn corpus co-occurrence but cannot supply meanings absent from this small corpus, and often mixes read/write/delete operations sharing nouns. Benchmark measurements and the chosen tradeoff are recorded in the accompanying release evidence.

### Reproducible dev-host measurements

Run `npx tsx scripts/mcp-discovery-benchmark.ts` (static catalog only, no database or network). On the two-CPU/four-GiB dev VM with Node v24.19.0, the 16 English probes scored **16/16 recall@5, 11/16 top-1** for production retrieval versus **12/16 recall@5, 7/16 top-1** for rank-16 corpus-local LSA. The initial production run missed two general vocabulary gaps; after focused revocation/topology metadata improvement it reached this result. This is an authored regression set, not a blind or multilingual benchmark.

- Public seven-tool listing: 4418 JSON bytes for 127 operations.
- Catalog + lexical-index cold initialization: 115.8 ms; incremental RSS after module imports: 1.0 MiB (not total server memory).
- Warm ranking over 80 queries: p50 20.4 ms, p95 36.8 ms.
- Full in-process discovery facade including index rebuild and top-five contract materialization over 16 queries: p50 34.7 ms, p95 63.1 ms (HTTP/network excluded).
- Cold exact presentation-template detail: 3219.9 ms; 66395 JSON bytes, complete contract.
- LSA initialization: 1412.4 ms; query p50 11.0 ms, p95 16.0 ms. Whole benchmark RSS growth including LSA, schemas and temporary arrays: 95.4 MiB; this is not an isolated LSA steady-state measure.

The production approach wins this local accuracy comparison with lower startup cost and no model/runtime dependency. LSA is retained only as an evaluation script, not an unused runtime dependency. A pinned pretrained local encoder remains a future measured option, not something ruled out by host capacity.

Limitations: synonym coverage is authored primarily in English; arbitrary novel paraphrases and languages are not guaranteed. Search is a discovery aid, not intent-based automatic execution. Inspect the full selected contract. The provider/retrieval boundaries permit a pinned local encoder later without changing any public tool name or execution authorization.

## Backward compatibility

`discovery` is the default deployment setting. Former `domains`, `twelve` and `legacy` settings remain accepted to avoid breaking deployment configuration, but **tools/list and new initialization instructions always advertise seven tools**. Exact existing cached calls may still execute through the former reviewed registries/validators; unknown names and invented operations are rejected. No new client should rely on these unadvertised aliases. Explicit old profiles preserve their historical response conventions for cached calls; new discovery calls always receive the new guidance. Internal legacy schema/parity helpers remain for regression tests. Removing aliases can be a separately announced breaking release.

## Verification

`tests/mcp/discovery.test.ts` verifies exhaustive coverage, schema/example validity, retrieval/ranking, bounded contracts, deterministic pagination, exact/no-result behavior, malformed inputs, namespaces and account visibility. `discovery-http.test.ts` exercises both SDK eras and all configured profiles, real nested reads/writes, read/selected-session/cross-account restrictions, safe errors, image content, context and instrumentation. Browser protocol workflows now execute `kanvas_tool_use` on the default discovery surface. Existing canonical/domain/transport regression suites remain in the full gate. Tests use disposable PostgreSQL schemas/clusters, never an application runtime database.
