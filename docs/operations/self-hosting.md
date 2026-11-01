# Self-hosting

## Requirements

- Node.js 24 or later and npm.
- PostgreSQL 15 or later, provisioned separately with a dedicated application role/database.
- HTTPS reverse proxy for public access; keep the Node listener on loopback or a private network.
- Chromium installed through Playwright if website capture or server visual snapshots are required.

## Configure and start

Copy `.env.example` to a private local configuration. Configure `KANVAS_PUBLIC_URL` to your exact external HTTPS origin. The application reads process environment, not a dotenv file automatically. Local development can use Node’s `--env-file`; production should use a service manager with protected credentials.

```sh
npm ci
npm run build
node --env-file=.env dist/server/index.js
```

Set `KANVAS_PG_HOST`, `KANVAS_PG_PORT`, `KANVAS_PG_DATABASE`, `KANVAS_PG_USER`, and `KANVAS_PG_SCHEMA`. Local Unix sockets can use peer authentication. Remote PostgreSQL uses `KANVAS_PG_SSL=verify-full`; an optional CA file is supported. Passwords come from a private file referenced by `KANVAS_PG_PASSWORD_FILE`, or the service credential `kanvas-database-password` under `CREDENTIALS_DIRECTORY`. Never put a password in a URL or commit it.

Registration can be disabled with `KANVAS_ALLOW_REGISTRATION=false`; provision an initial account with `npm run create-user` according to that command’s protected-input instructions. For email sign-in, enable `KANVAS_EMAIL_SIGNIN=true`, set an appropriate `KANVAS_MAIL_FROM`, and supply the `kanvas-mailer` service credential through the host’s protected credential mechanism. The application fails startup if the required credential is absent. Do not enable email sign-in until delivery and the public origin are verified.

`KANVAS_MCP_PROFILE=discovery` is the default. All accepted former profile settings also expose only the same two tools, `kanvas_discover` and `kanvas_call`; obsolete callable aliases are rejected, not retained as alternate catalogs. Clients connect to `/mcp` and follow OAuth discovery and consent. Keep proxy forwarding and origin settings consistent; do not make a viewer URL public merely to bypass authentication.

## Containers

`Dockerfile` builds a production image with the matching client/server, PostgreSQL tools and headless Chromium. `compose.yaml` expects an externally provisioned PostgreSQL host and a private service-readable password file mounted as a secret. The application runs unprivileged with a read-only filesystem and bounded temporary storage. Supply required environment settings before `docker compose up --build`; review host-specific resource limits and backups.

## Upgrade and rollback

Current connector authorization-code sign-in requires a functioning email mailer even for an already signed-in browser. Verify delivery before exposing MCP. Data migration3 removes feedback scope without changing report status/history. Older report semantics are not a safe blind software rollback; retain and verify the pre-upgrade backup.

Build and test a separate release package. Back up PostgreSQL and verify the backup before switching. Stop the old service before the new process acquires the same database runtime lease. Serve the client from the same release as the backend. Check `/readyz`, `/healthz`, `/version.json`, `/docs/index.json`, authenticated publication and browser delivery.

The 0.20.0 upgrade removes retired settings/records and normalizes historical game views. It uses a data-only ledger while retaining structural schema version 1 for 0.19.0 rollback compatibility. Keep the prior package and pre-upgrade backup; rollback restores software, while restoring deleted retired records requires the backup. Do not restore a database over new user writes without an explicit recovery decision.

Backups, service units, credentials, host-specific notes and production content belong outside the source checkout. See [PostgreSQL operations](postgresql.md).

## Third-party data and notices

Keep third-party notices when distributing builds, including `public/browser-icons/`. The `geoip-lite` library uses Apache-2.0, but its GeoLite database has separate MaxMind/data terms and update requirements. Check the installed package’s LICENSE and README and the current data provider terms before redistributing a container or updating the database. Do not treat the application’s eventual license as a license for those datasets. Provision any update credentials outside source and command-line arguments.

## Console and documentation domains

The user dashboard is **Console**. A single-origin deployment serves it at
`/console`; old `/admin` path bookmarks redirect there. Console, viewers, email
sign-in and OAuth use the configured public origin. The start response exposes
`consoleUrl` and retains `adminUrl` as a response-field alias for older clients.
Internal service administration remains permission-restricted.

Browser cookies are Secure, HttpOnly, host-only `__Host-kanvas` cookies on HTTPS;
console and viewer paths share one login. Dev and production never share cookies.
Do not add a cookie Domain. Full-account sign-ins use `KANVAS_BROWSER_IDLE_DAYS`
(default 90) and `KANVAS_BROWSER_ABSOLUTE_DAYS` (365). Foreground trusted input
renews at most once per `KANVAS_BROWSER_RENEWAL_HOURS` (24), capped at the original
absolute expiry. Background receivers, polling and OAuth do not renew them.
Valid legacy sessions migrate lazily without extending their old deadline until
foreground use; expired or revoked records are never resurrected. Scoped pairing
and capture grants retain their own short deadlines.

`KANVAS_BROWSER_FRESH_MINUTES` (15, maximum 60) requires fresh email confirmation
for new publisher credentials, OAuth approval (including device authorization),
membership/group invitations, sharing/public access or paired-screen approval,
and revoking other/all browser sign-ins. Current-browser
logout and ordinary viewing/content use remain available. The UI does not replay
the requested mutation after reauthentication; review it and try again.
Account → Signed-in browsers shows non-credential IDs and device/browser/origin,
created/last-active/idle/absolute expiry metadata. Activity timestamps have the
configured renewal precision. Audit events distinguish sign-in, replacement,
logout, device/all revocation, idle expiry and absolute expiry; raw cookie tokens,
credential hashes and CSRF secrets are never returned by session management.

An optional `KANVAS_DOCS_URL=https://docs.example.com` sets the origin used by
public documentation links and canonical URLs. At the reverse proxy, redirect
that host's `/` to `/docs/`, forward only `/docs` and `/docs/*` to the backend with
the configured public Host, and return 404 for other paths. Never expose arbitrary
application APIs on the documentation host. This does not publish source code.

Keep MCP, OAuth, authenticated APIs and event streams uncached. Reverse proxies
must flush streaming responses promptly and preserve OAuth discovery headers.
