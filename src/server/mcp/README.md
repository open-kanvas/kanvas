# Kanvas MCP layer

This folder exposes exactly two MCP tools to agents: **kanvas_discover** finds contracts and guidance, and **kanvas_call** executes a discovered operation. The public-ID operation table in `operations.ts` is the source of truth for roughly 187 executable operations grouped by domain; each entry owns its schema, annotations, required scope and dispatch. Domain services retain authorization and state-transition rules.

- **Entry and dispatch:** `index.ts` registers the two tools; `operations.ts` assembles the registry and `canonical.ts` assembles definitions. `wire-arguments`, `call-context`, `active-context`, `types` and `manage-map` support request handling.
- **Discovery:** `discovery.ts` implements list/search/get; `tool-discovery.ts` derives metadata from definitions and `catalog.ts` validates calls. `local-search`, `intent-resolve` / `intent-schema`, `schema-properties` and `resources` cover ranking, intent and references.
- **Guidance and responses:** `results.ts` wraps outcomes; `response-policy.ts` decides what to attach. `guide`, `profile-guidance`, `publishing-guidance`, `workflow-guidance`, `viewer-link-guidance`, `visual-intent`, `session-continuity` and `subscriptions` supply focused context.
- **Domain definitions:** `operation-domains/` contains publish, session, display, monitor and other focused contracts, alongside `experience-tools`, `work-tools`, `account-tools`, `document-tools`, `event-tools`, `home-tools`, `sync-tools` and `invitation-tools`. `operation-fields.ts` holds shared schema fields; `canonical.ts` combines these with service-owned definitions.

A call enters `index.ts`, resolves its exact public ID against the registry and validates nested arguments against that operation's schema. Its domain handler executes with the current principal and cancellation signal. `results.ts` wraps the result, and `response-policy.ts` selects orientation, guidance and viewer-link context without rewriting user/source values.

See [the discovery architecture](../../../docs/architecture/mcp-discovery.md) for design rationale. Keep this map current when the folder changes.
