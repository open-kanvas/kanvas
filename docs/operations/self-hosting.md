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

## First account and first view

Start from a new checkout (Git is required):

~~~sh
git clone https://github.com/open-kanvas/kanvas.git
cd kanvas
cp .env.example .env
chmod 600 .env
~~~

Provision the dedicated database/role first, then edit .env for that database and origin before the install/build/start commands above. For a local-only trial, the example HTTP loopback origin is supported; public access requires HTTPS. Keep registration disabled. In another interactive terminal, load the **same environment file** to create the initial account:

~~~sh
node --env-file=.env dist/server/create-user.js
~~~

The command asks for username, display name and a masked password. It does not enable public registration. Using plain npm run create-user without exporting the environment does not load .env.

The normal browser UI uses email sign-in; it does not show a password form. For a local-only trial with email sign-in disabled, open /console and use the browser developer console on that same origin to sign in with the account just created, then publish a synthetic view through the normal authenticated API (never paste untrusted code into developer tools). The temporary local password is entered at a browser prompt (visible, not masked), not stored in the snippet or shell history. Use this only on your private test screen; normal deployments should configure email sign-in:

~~~js
const login = await fetch('/api/auth/login', {method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({username: prompt('Local username'), password: prompt('Local password')})});
if (!login.ok) throw new Error('Local sign-in failed');
const auth = (await (await fetch('/api/auth/me')).json()).data;
async function post(path, body) {
  const response = await fetch(path, {method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-Kanvas-CSRF': auth.csrfToken
  }, body: JSON.stringify(body)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? 'Request failed');
  return result.data;
}
const session = await post('/api/sessions', {name: 'First view', initialDisplay: false});
const display = await post('/api/sessions/' + session.id + '/displays', {
  name: 'My screen', width: 1200, height: 800, pixelRatio: 1
});
await post('/api/sessions/' + session.id + '/submit', {
  requestId: crypto.randomUUID(), displayIds: [display.id],
  view: {version: 1, template: 'fact', data: {text: 'Hello from your Kanvas'}}
});
location.href = '/view/' + session.id + '/' + display.id;
~~~

You should see “Hello from your Kanvas”. The viewer is still private: a viewer URL is not an access credential. Check /readyz and /healthz; their version should agree with package.json. The optional /version.json file is supplied by some deployment pipelines and is not generated by npm run build. This smoke uses password sign-in and the browser API, not OAuth. External-agent OAuth sign-in additionally needs the configured mailer and public HTTPS origin described above. If optional capture is needed, install a matching Playwright Chromium with npx playwright install --with-deps --only-shell chromium.

## Containers

`Dockerfile` builds a production image with the matching client/server, PostgreSQL tools and headless Chromium. `compose.yaml` expects an externally provisioned PostgreSQL host and a private service-readable password file mounted as a secret. The application runs unprivileged with a read-only filesystem and bounded temporary storage. Supply required environment settings before `docker compose up --build`; review host-specific resource limits and backups.

## Upgrade and rollback

Current connector authorization-code sign-in requires a functioning email mailer even for an already signed-in browser. Verify delivery before exposing MCP. Data migration3 removes feedback scope without changing report status/history. Older report semantics are not a safe blind software rollback; retain and verify the pre-upgrade backup.

Build and test a separate release package. Back up PostgreSQL and verify the backup before switching. Stop the old service before the new process acquires the same database runtime lease. Serve the client from the same release as the backend. Check `/readyz`, `/healthz`, `/docs/index.json`, authenticated publication and browser delivery. If your release pipeline supplies `/version.json`, verify that metadata too.

The 0.20.0 upgrade removes retired settings/records and normalizes historical game views. That historical change used a data-only ledger; current releases use structural schema version 2, and older schema-1 binaries cannot run against it. See [raw activity events](../raw-events.md) and verify downgrade compatibility rather than assuming 0.19.0 rollback is safe. Keep the prior package and pre-upgrade backup; rollback restores software, while restoring deleted retired records requires the backup. Do not restore a database over new user writes without an explicit recovery decision.

Backups, service units, credentials, host-specific notes and production content belong outside the source checkout. See [PostgreSQL operations](postgresql.md).

## Third-party data and notices

Keep third-party notices when distributing builds, including public/browser-icons/ and [the dependency licence index](../licenses/README.md). Runtime picker caches and operator-provided data retain separate terms.

### Optional IP geolocation

Kanvas starts and joins sessions normally without a geolocation database. Location is simply unavailable, never guessed from browser language. No database is bundled or downloaded by the application, and an IP address is never sent to MaxMind for lookup.

To enable coarse location:

1. Create your own free MaxMind account and licence key, and review the [current GeoLite agreement](https://www.maxmind.com/en/geolite/eula). The hosted service and each self-hoster use their own credentials.
2. Install MaxMind's [GeoIP Update tool](https://dev.maxmind.com/geoip/updating-databases/). Obtain its pre-filled GeoIP.conf from your account; set EditionIDs to GeoLite2-City and an external DatabaseDirectory, such as /var/lib/GeoIP. Keep the configuration and key private and outside this repository, images, logs and command-line arguments.
3. Run geoipupdate -f /etc/GeoIP.conf, using the operator-owned protected configuration. Give the Kanvas service read access only to the resulting database, not the key. For containers, mount the database directory read-only (directory mounts preserve atomic replacements).
4. Set KANVAS_GEOLITE_CITY_PATH=/var/lib/GeoIP/GeoLite2-City.mmdb in the service environment. It must be an absolute local path. No key is supplied to Kanvas.
5. Schedule the updater with your service manager and monitor failures. Kanvas checks for file replacement at most once a minute on lookup. Missing, unreadable or corrupt files yield unavailable location without preventing startup or session use.

The GeoLite agreement (updated February 12, 2026) incorporates CC-BY-SA-4.0 and additional terms. Retain MaxMind attribution and notices. It requires prompt updates and cessation of use/destruction of old versions within 30 days after a new release, and destruction on termination; ensure backups and old release images do not retain database snapshots indefinitely. Do not use approximate IP location to identify a household or individual, or for prohibited eligibility decisions. Review the current agreement before redistributing data; Kanvas's Apache licence does not grant database rights.

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
