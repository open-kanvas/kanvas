# Architecture

A Node.js/Express service exposes authenticated HTTP, MCP and event streams. A React browser client receives revisioned views. PostgreSQL stores source records, accounts, sessions, revisions, requests and delivery state.

## Publication flow

1. Authenticate the principal, resolve an intended target and check session scope.
2. Validate prepared content or deterministically map supported literal/native source input.
3. Bind datasets and assets to that authorized session; preserve exact numeric strings and original source records.
4. Commit a new display revision only if authorization, configuration, hold and generation checks still pass.
5. Notify receivers and record their acknowledgement separately from preparation.

The renderer has no external inference transport. Ambiguous data or missing source returns a clear error requiring an explicit template or prepared view. Source content is not executed as instructions. Static HTML uses a restricted sandbox; website capture and bounded public-HTTPS monitoring are separate explicit capabilities.

## Storage and concurrency

`src/server/postgres-store.ts` provides asynchronous transactions, nested savepoints, advisory serialization and post-commit notifications. `schema_migrations` tracks structural compatibility; `data_migrations` tracks checksummed data-only upgrades. A runtime lease prevents two application owners from serving the same schema.

`legacy-data.ts` normalizes retired settings and historical views when read. Upgrade migrations never require application source files from the checkout: release bundles carry executable migration logic. The client is served from the matching packaged release, not a mutable development build.

## Boundaries

Each domain checks account/session membership, role, selected-session OAuth scope, revisions and idempotency. A tool name, locator, report, template or source text grants no authority. All accepted MCP profile settings expose the same two-tool discovery interface; catalog parity and byte budgets are tested.
