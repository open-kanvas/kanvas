# Raw activity events (0.36.0)

## Current operation-level policy

Record meaningful actions and state changes as individual append-only PostgreSQL `events` rows: authenticated tool operations (including failed reads), session/display/publication/history changes, navigation commands/acks/receipts, render/lifecycle outcomes, pointing, satisfaction, device lock and requested window commands, account/sign-in/out/sharing actions, connection connect/disconnect, and validation/runtime failures. Each row has a UUID, server occurred_at timestamp, known principal/session/display, event type, operation/status/duration where supplied, structural context and server-authoritative properties.serverVersion.

Exclude successful category-api HTTP completions (including polling/status/background calls), connection heartbeats, connection-history snapshots, navigation-viewport snapshots, registered-window snapshots and routine frontend diagnostics. Registered-device writes changing only lastSeenAt are suppressed. Explicit window commands remain document.device-request events. Failed API completions remain recorded. Frontend *-error and failed-request observations (status 0 or >=400) remain browser.event rows without duplicate diagnostic-batch rows. Existing page/account/agent HTTP categories remain recorded. A status poll therefore does not imply a new person action. Access logs are separate and unchanged.

## Context and privacy

Retained HTTP events attribute an existing validated browser credential without granting access. Anonymous or unavailable identities remain NULL; identity is never fabricated. Supplied agent/model/harness and MCP client name/version are unverified context. Browser context may include User-Agent, parsed browser/OS, language, timezone, viewport, network type, client release, referrer origin and approximate local GeoIP. No external geolocation request is made.

No credentials, source text, messages, request/response bodies, arbitrary URL paths/query strings, cookies, authorization headers or raw IPs are copied into events. Referrer paths, UTM values and IP hashes are omitted. Document events use a structural allowlist. Existing source/report storage retains its separately authorized data. Controlled synthetic privacy tests establish their tested cases, not universal safety of arbitrary production headers.

## Retention and history

No TTL, eviction, archive, deletion or replacement aggregation is introduced. PostgreSQL rejects UPDATE, DELETE and TRUNCATE on events. All historical 0.35 rows—including heartbeats, successful API polling and diagnostic batches—remain unchanged. Suppression applies only to future events. Accepted operation/audit/render/diagnostic history is not automatically pruned. Mutable presence/current-state projections and expiring credentials remain operational/security state, not event history. Temporary raster caches and web-server log rotation are unchanged.

Version 0.35 introduced schema migration 2 and recorded substantially more housekeeping. Migration 2 added nullable document/user/request created_at, member joined_at, user login/seen timestamps and is_internal. Pre-migration timestamps remain unknown rather than reconstructed; new insertions receive database timestamps. Version 0.36 keeps schema 2 and preserves every existing timestamp/column. No pre-0.35 activity is reconstructed. Abrupt process/network loss can prevent final completion/disconnect recording.

## Queries and recovery

Service traffic charts aggregate retained events in PostgreSQL with indexed inclusive timestamp bounds and bounded results. Legacy request_metrics remain untouched hourly aggregates; partial legacy hours retain hour precision. Traffic totals from 0.36 deliberately omit suppressed successful API housekeeping, so they are not total HTTP throughput.

```sql
SELECT operation,status,count(*) FROM events
WHERE event_type='tool.call' GROUP BY operation,status;
SELECT properties->>'template',count(*) FROM events
WHERE event_type='document.display-history' GROUP BY properties->>'template';
```

For people-only analysis join users and exclude explicitly marked is_internal accounts; never infer which accounts are people. A history row does not prove paint: correlate delivery/render outcomes. Version 0.36 introduces no database migration. Preserve backups and matching artifacts; a rollback must preserve newly recorded events and all current schema-2 columns. Older 0.34 binaries reject schema 2 and require the documented matching snapshot recovery, not in-place column/event deletion.
