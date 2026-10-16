# Account-only device authorization implementation

Status: development implementation, not a production release. Baseline PR10 is preserved.

## Contract

Existing authorization code + S256 PKCE stays primary. Both current flows require explicit account consent (`read` and/or `publish`); an empty account needs no session. Account authority follows current memberships, never other accounts. Historical selected-session grants retain their original restrictions across refresh and require new explicit consent to become account grants.

RFC 8628 endpoints: `POST /oauth/device/authorize`, `POST /oauth/token`, browser `/connect`, and authenticated `POST /api/oauth/approve`. Metadata advertises the device endpoint and `urn:ietf:params:oauth:grant-type:device_code`. Registration supports public code-only, device-only, combined, and opt-in refresh profiles. Device-only clients omit redirect URIs and use `response_types: []`; code clients still require exact registered redirects and S256 PKCE. No client secret.

Single-resource policy: device requests and redemption may omit `resource`, which defaults immutably to this issuer's `/mcp`. Any supplied resource must match exactly; token-time scope/access substitution is rejected. Code flow retains its existing explicit resource contract. Form-encoded requests supported.

Device secret is 256 random bits and only its SHA256 digest is persisted. The recognition code uses 12 unambiguous random alphabet characters (~59.5 bits), rendered in three groups, and is not a bearer credential. Code resolution is limited to 20 requests per source IP per 10 minutes; device issuance to 30. Device token requests use a separate durable aggregate ceiling of 7200 per source IP per 10 minutes (60 concurrent five-second pollers), with 120 invalid-device requests per IP per 10 minutes and the per-device persisted polling interval. Code/refresh exchanges retain their separate 120/IP/10-minute budget; compliant device polling does not consume it. Code knowledge only locates consent, never signs in or authorizes. Client labels are explicitly unverified. Verification links contain the recognition code only.

Requests expire after 10 minutes regardless of polling or sign-in. Initial polling interval 5 seconds; early polls persist an additional 5 seconds. States pending → approved/denied, with expiry terminal; approved device credentials are consumed exactly once atomically with token issuance. PostgreSQL schema-wide write advisory transactions serialize decisions, redemption and rate counters, including across connections/restarts. Polling errors commit timing state before returning. Cleanup retains expired device/consent records at most one extra day. No new database schema migration.

Consent requires a full authenticated browser with existing CSRF/origin checks, explicit account access and explicit recognition-code match. Paired/view-only sessions cannot consent. Email sign-in reuses its existing safe authorization-request continuation, legal acceptance and cross-device paths; device flows offer sign-in-and-review, never email shortcut approval, so users always inspect the recognition code before approval. Browser completion says to return to the agent, without promising host auto-resume.

Tokens use existing account connection IDs, scoped access credentials, refresh rotation/replay revocation, 1-hour access, 90-day absolute/30-day idle refresh limits and connection revocation. Browser sign-out/revocation and OAuth connection revocation remain distinct. Opening links never grants agent access. No unauthenticated MCP email tools or new external providers.

## Rollback

Additive generic-store record kinds only (`oauth-device` and optional consent fields); no SQL schema migration. Older code cannot redeem new device requests. Before downgrade, wait ten minutes for pending requests to expire; do not send old code pending device consent IDs. Existing issued tokens use the unchanged connection format and remain revocable. Never restore an old database over current user data. Production deployment remains approval-gated.

## Verification

Exact-commit gates and client compatibility results will be recorded after tests. Standards coverage is not proof of named-host support; untested interactive host acceptance remains pending. References: RFC 8628 §§3–5, RFC 7591 registration, RFC 8707 resource indicators; MCP authorization discovery preserves the existing public OAuth and protected-resource metadata.

## Version-pinned compatibility and recipes

Verified against an isolated local Kanvas server, synthetic email-confirmed account, captured email (no sends), and disposable credential stores:

- **mcp-remote 0.15.1:** actual CLI process, dynamic registration, device approval/polling, token persistence, MCP initialization and the two-tool list passed. Its default device-only registration still sends `response_types: ["code"]`; use the metadata override below. This is a client compatibility adjustment, not a relaxation of server registration rules. The client prints a complete verification URL; verify its code in Kanvas against that URL. No callback listener is needed.
- **Hermes source `acc3cada0da86c81efc8aa6c5a291989549ca900`, Python MCP SDK 2.0.0:** actual `login_device` implementation and its normal metadata discovery, dynamic registration, polling and protected store passed, followed by authenticated SDK initialization and two-tool listing. The documented CLI dispatches to this tested function; a complete interactive Hermes agent conversation was not exercised.
- **Hosted HTTPS callbacks:** server registration/exact redirect/S256 PKCE regressions remain covered, including Claude callback examples. Actual Claude/ChatGPT UI reconnect and automatic agent resume are not claimed tested here. OpenClaw's existing configured connector is not modified or revoked by these tests; client-side hosted callback configuration must be verified for the installed OpenClaw release.

mcp-remote (choose an isolated protected config directory when testing):

```sh
npx mcp-remote@0.15.1 https://kanvas.host/mcp --device-code \
  --static-oauth-client-metadata '{"response_types":[],"scope":"read publish"}'
```

Hermes at the pinned source revision:

```yaml
mcp_servers:
  kanvas:
    url: https://kanvas.host/mcp
    auth: oauth
    oauth:
      flow: device
      scope: read publish
```

Then run `hermes mcp login kanvas --flow device` on the same host/profile as the agent. Device login is explicit and terminal-initiated; background reconnects do not initiate it. Standard browser PKCE remains the default absent the override. Do not assume other releases support these flags. Connection approval may require returning to/resuming the agent.

Reviewed references: [RFC 8628](https://www.rfc-editor.org/rfc/rfc8628), [MCP 2025-11-25 authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), mcp-remote 0.15.1 published package README/source, and Hermes documentation/source at the pinned revision. Test logs and exact-commit deployment evidence are kept separately; protocol tests do not imply universal host support.
