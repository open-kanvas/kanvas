# Kanvas MCP layer

This folder exposes exactly two MCP tools to agents: **kanvas_discover** finds contracts and guidance, and **kanvas_call** executes a discovered operation. The public-ID operation table in `operations.ts` is the source of truth for 189 executable operations grouped by domain; each entry owns its schema, annotations, required scope and dispatch. Domain services retain authorization and state-transition rules.

- **Entry and dispatch:** `index.ts` registers the two tools; `operations.ts` assembles the registry and `canonical.ts` assembles definitions. `wire-arguments`, `call-context`, `active-context`, `types` and `manage-map` support request handling.
- **Discovery:** `discovery.ts` implements list/search/get; `tool-discovery.ts` derives metadata from definitions and `catalog.ts` validates calls. `local-search`, `intent-resolve` / `intent-schema`, `schema-properties` and `resources` cover ranking, intent and references.
- **Guidance and responses:** `results.ts` wraps outcomes; `response-policy.ts` decides what to attach. `guide`, `profile-guidance`, `publishing-guidance`, `workflow-guidance`, `viewer-link-guidance`, `visual-intent`, `session-continuity` and `subscriptions` supply focused context.
- **Domain definitions:** `operation-domains/` contains publish, session, display, monitor and other focused contracts, alongside `experience-tools`, `work-tools`, `account-tools`, `document-tools`, `event-tools`, `home-tools`, `sync-tools` and `invitation-tools`. `operation-fields.ts` holds shared schema fields and `guide-topics.ts` is a leaf contract independent of registry initialization; `canonical.ts` combines these with service-owned definitions.

A call enters `index.ts`, resolves its exact public ID against the registry and validates nested arguments against that operation's schema. Its domain handler executes with the current principal and cancellation signal. `results.ts` wraps the result, and `response-policy.ts` selects orientation, guidance and viewer-link context without rewriting user/source values.

See [the discovery architecture](../../../docs/architecture/mcp-discovery.md) for design rationale. Keep this map current when the folder changes. `node --import tsx scripts/measure-mcp-catalog.ts` measures the current surface offline; its artifacts stay in ignored feature scratch.


### Discovery visibility and recovery

The discover validator is a strict Zod discriminated union. z.toJSONSchema emits fields inside oneOf, not root properties. MCP SDK 2.4 preserves those branches in both protocol dialects; this is not a missing description or a stripped schema at registration. Hosts inspecting only root properties therefore presented discovery as parameterless. exposeSchemaProperties now projects host-visible fields while retaining strict per-action branches. Real modern/legacy HTTP tests compare tools/list to this contract and validate accepted/rejected calls with AJV.

Reconnect after upgrades to refresh cached schemas. Fallback through kanvas_call:

    {"operationId":"kanvas.discover","arguments":{"catalog":"operations","action":"get","id":"kanvas.tasklist.update"}}

The adapter validates the outer call, then uses the same authenticated discovery path, private-template filtering and resolver as kanvas_discover; never recursive dispatch. Resolve preserves existing authorization/hold/revision rules and never executes its returned call. Scroll example:

    {"catalog":"operations","action":"resolve","query":"scroll to the bottom","sessionId":"AUTHORIZED_SESSION_ID","displayId":"AUTHORIZED_DISPLAY_ID"}

Errors return at most three public operation/template suggestions with bounded examples, allowed top-level fields and a fallback schema lookup, not full schemas on every failure. Unknown submitted values and private catalog entries are not copied into suggestions. Template get exposes related narrow operations; kanvas.template.task-list includes read/update/show and navigation. Subtask checking already exists: subtasks:[{item:1,check:["SUBTASK_ID"]}] belongs to kanvas.tasklist.update; top-level check addresses parent items. Examples are syntax, not consent, live targets or authorization.
