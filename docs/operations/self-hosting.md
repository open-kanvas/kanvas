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

`KANVAS_MCP_PROFILE=domains` is the default. Clients connect to `/mcp` and follow OAuth discovery and consent. Keep proxy forwarding and origin settings consistent; do not make a viewer URL public merely to bypass authentication.

## Containers

`Dockerfile` builds a production image with the matching client/server, PostgreSQL tools and headless Chromium. `compose.yaml` expects an externally provisioned PostgreSQL host and a private service-readable password file mounted as a secret. The application runs unprivileged with a read-only filesystem and bounded temporary storage. Supply required environment settings before `docker compose up --build`; review host-specific resource limits and backups.

## Upgrade and rollback

Build and test a separate release package. Back up PostgreSQL and verify the backup before switching. Stop the old service before the new process acquires the same database runtime lease. Serve the client from the same release as the backend. Check `/readyz`, `/healthz`, `/version.json`, `/docs/index.json`, authenticated publication and browser delivery.

The 0.20.0 upgrade removes retired settings/records and normalizes historical game views. It uses a data-only ledger while retaining structural schema version 1 for 0.19.0 rollback compatibility. Keep the prior package and pre-upgrade backup; rollback restores software, while restoring deleted retired records requires the backup. Do not restore a database over new user writes without an explicit recovery decision.

Backups, service units, credentials, host-specific notes and production content belong outside the source checkout. See [PostgreSQL operations](postgresql.md).

## Third-party data and notices

Keep third-party notices when distributing builds, including `public/browser-icons/`. The `geoip-lite` library uses Apache-2.0, but its GeoLite database has separate MaxMind/data terms and update requirements. Check the installed package’s LICENSE and README and the current data provider terms before redistributing a container or updating the database. Do not treat the application’s eventual license as a license for those datasets. Provision any update credentials outside source and command-line arguments.

## Console and documentation domains

The user dashboard is **Console**. A single-origin deployment serves it at
`/console`; old `/admin` bookmarks redirect there. Set `KANVAS_CONSOLE_URL` to an
HTTPS **origin** such as `https://console.example.com` to serve Console at that
host's root. Route both the public and console hosts to the same backend while
preserving the request host. `KANVAS_ADMIN_URL` remains a compatibility alias;
`KANVAS_CONSOLE_URL` takes precedence. The start response exposes `consoleUrl`
and retains `adminUrl` for older clients. Internal service administration remains
permission-restricted; this naming change does not grant administrative access.

Browser cookies are host-scoped. Signing in on the console does not create a
browser session on the canvas/MCP origin; sign in there or use the explicit
pairing/OAuth flows when needed. Do not broaden the cookie Domain to bypass this.

An optional `KANVAS_DOCS_URL=https://docs.example.com` sets the origin used by
public documentation links and canonical URLs. At the reverse proxy, redirect
that host's `/` to `/docs/`, forward only `/docs` and `/docs/*` to the backend with
the configured public Host, and return 404 for other paths. Never expose arbitrary
application APIs on the documentation host. This does not publish source code.

Keep MCP, OAuth, authenticated APIs and event streams uncached. Reverse proxies
must flush streaming responses promptly and preserve OAuth discovery headers.
