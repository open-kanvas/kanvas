# Raw activity events (0.35.0)

New activity is recorded as individual append-only PostgreSQL `events` rows: UUID, server `occurred_at` timestamptz, authenticated user/principal where known, session/display where applicable, event type, operation, exact HTTP/result status, duration and JSONB client context/properties. No new hourly aggregates are written. Service traffic charts aggregate raw requests at query time; pre-existing `request_metrics` rows remain untouched legacy aggregates, not invented individual requests.

Captured sources include HTTP completion, authenticated tool operations (including failed reads), session/display/publication/history changes, lifecycle/render outcomes, accepted browser diagnostics, connection connect/heartbeat/disconnect, device/window changes, account audit/funnel/sharing events and removal metadata before expiring security records. Device lock hides content but does not delete events. A source snapshot may still change; its accepted changes also append separate raw events.

Anonymous requests have NULL user IDs; account-independent calls have NULL session/display IDs. Server background work uses its known owning/acting user when available. Missing identity is never fabricated. Known MCP client name/version and supplied agent/model/harness are attached as unverified context; unavailable model names remain absent. Browser context includes raw User-Agent, parsed browser/version/OS/version and available model, language(s), timezone, screen/viewport/pixel ratio, network type, client release, referrer origin and approximate local GeoIP when available. These are observations/hints, not authentication. No external geolocation call is made.

No credentials, source text, messages, request/response bodies, arbitrary URL paths/query strings, cookies, authorization headers or raw IPs are copied into events. Referrer paths, UTM values and IP hashes are deliberately omitted rather than risking embedded secrets or unstable pseudonymous identifiers. Existing source/report storage retains its own authorized data separately. Only a structural metadata allowlist is copied from documents.

## Retention and historical limits

No TTL, automatic eviction or aggregation replaces raw events. PostgreSQL rejects UPDATE, DELETE and TRUNCATE on the events table. Diagnostic, lifecycle, connection-history, audit and tool-log automatic pruning has been removed. Read pagination limits do not delete rows. Credential/login expiry, rate limits, revocation and stale-cookie cleanup remain security boundaries; metadata events survive those deletions without retaining usable credentials. Browser/disconnect state can still expire as operational presence, not as history deletion. Web-server/system log rotation is unchanged: these are not the event source of truth, and are not reconstructed as historical app events.

Migration2 adds nullable created_at to documents/users/requests, joined_at to members, user last_login_at/last_seen_at, and is_internal (default false). Existing creation/join timestamps remain NULL; new insertions receive database timestamps. SQLite historical imports explicitly retain NULL rather than presenting import time as original creation time. Login time changes only on a new full-account sign-in, not routine foreground renewal. Operators can mark known automation with users.is_internal=true; do not guess which accounts are people.

No claim of reconstructing pre-0.35 activity or identifying every anonymous visitor is made. Abrupt process/network loss can prevent a final disconnect/completion event; heartbeats provide the last positive observation. Browser diagnostic admission limits remain bounded and report dropped/rate-limited input; they do not prune already accepted events.

## Query examples

```sql
SELECT count(DISTINCT user_id)
FROM events WHERE occurred_at >= now()-interval '14 days';

SELECT operation,status,count(*)
FROM events WHERE event_type='tool.call'
GROUP BY operation,status;

SELECT properties->>'template' AS template,count(*)
FROM events WHERE event_type='document.display-history'
GROUP BY properties->>'template';
```

For people-only analyses join users and exclude is_internal. A template history row is a publication/navigation-state event, not by itself proof that a browser painted it; correlate lifecycle/render events.

## Release and recovery

Migration2 runs transactionally. Older 0.34 binaries refuse the newer schema: an artifact-only rollback is insufficient. Take and verify a pre-migration PostgreSQL archive, preserve the previous artifact and restore that matching snapshot if rolling back. Do not drop new columns/events in place or silently discard new activity. Normal backup/restore preserves the append-only trigger and exact event rows.
