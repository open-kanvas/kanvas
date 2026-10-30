# OAuth connection lifecycle

Implemented source contract for the OAuth continuity repair (feedback `7d516389`). Deployment and actual Claude/ChatGPT acceptance are recorded separately in [remote testing](../README.md).

## Tool catalog profiles are not an OAuth migration

The [two-tool discovery interface](../architecture/mcp-discovery.md) is deployed at the **same `/mcp` resource and audience** for every accepted profile setting. Modern/legacy MCP protocol negotiation is independent of the catalog. After upgrading, refresh/reconnect the host catalog; no new consent, changed scopes, client registration or database migration is required. Existing OAuth grants, refresh families and session/account boundaries retain their original lifetime and authority. Old callable aliases are intentionally rejected; clients use `kanvas_discover` and `kanvas_call`. This changes tool routing, not existing OAuth authority.

The older code-only/refresh upgrade rules below concern the prior OAuth continuity feature, not the twelve-tool switch. Rollback restores code/profile while preserving current grants and all subsequent user data; do not restore an old database to recover a tool catalog. Real profile-switch/refresh/revocation tests and public HTTPS OAuth checks passed; see the [delivery record](../README.md). Actual host UI catalog refresh remains host-specific.

## Connect once, choose the authority explicitly

KANVAS supports public dynamic client registration, S256 PKCE authorization codes, RFC 8628 device authorization, rotating refresh tokens, and token revocation. The authorization-server metadata advertises only these implemented grants and endpoints. Client-secret authentication, client credentials, CIMD, and `offline_access` are not advertised or accepted as additional scopes.

Register `grant_types: ["authorization_code", "refresh_token"]` to enable renewal. An omitted `grant_types`, an explicitly code-only registration, and a pre-upgrade registration without a stored refresh profile remain code-only. Registration is not permission to access an account.

All new OAuth connections use **Account access**: the signed-in human explicitly permits the client's approved scopes on current and future sessions accessible to that account. A client with `publish` may create sessions through MCP; a `read` client may not. An empty account connects without creating or selecting a session. Selected-session connections are historical only, not a current consent option.

Account consent never grants another account's private sessions. Current membership, role, session lifetime, and per-display restrictions remain authoritative on every action. Removing membership removes that access even from an account-wide connection. An empty or missing selected-session list is not interpreted as account consent.

## Opaque authorization state

Authorization-code requests may include opaque `state` up to **8,192 URL-encoded characters** (measured using the callback’s `URLSearchParams` serialization, excluding the `state=` key; the decoded string is also capped at 8,192 characters). Accepted state is returned exactly on success, explicit denial, and subsequent protocol-error callbacks. Non-ASCII and reserved characters are preserved, not normalized or trimmed.

Empty, duplicate/non-string, control-character-containing, or oversized state is rejected locally with HTTP 400 `invalid_request`, without a `Location` redirect or reflection of the submitted value. This avoids sending the client an error callback it cannot correlate. An omitted state remains supported; clients are responsible for their own OAuth request correlation. Registered redirect matching, S256 PKCE, resource audience, scope and explicit account consent remain mandatory.

## Expiry and transparent renewal

- Access credentials last at most **one hour**.
- Refresh families last at most **90 days** from initial approval and expire after **30 days without renewal**, whichever comes first. Renewal cannot extend the absolute deadline.
- A successful refresh returns a new access token **and a new refresh token**. Clients must serialize renewal for each connection and atomically replace their host-managed credentials. Neither credential belongs in model context, viewer URLs, or diagnostic logs.
- Refresh is bound to the registered client, approved resource, user, and original session boundary. With this single-resource grant, an omitted refresh `resource` retains that same audience; a different audience is rejected.
- Optional refresh `scope` can narrow the new credential and its subsequent refresh chain, never enlarge it. Older access credentials retain only their original authority until their original expiry; renewal does not revive or extend them.

The connection's token ID and agent ID stay stable across rotation. MCP idempotency, routed interaction feedback, and compatible legacy MCP sessions therefore keep the same identity. Each retained authorization still checks its own credential expiry. A modern notification stream remains bound to the credential that opened it and must reconnect with the renewed credential when that stream expires.

The host's OAuth implementation performs renewal; the model does not refresh tokens itself. The local security suite exercises this with both the modern MCP SDK and the legacy SDK. Actual host UI, tool-catalog refresh, stream reconnection, and agent wakeup remain separate host-level behavior.

## Revocation and replay

Revoking a connection in **Connections**, or posting its access/refresh token to the discovered `revocation_endpoint` with its registered `client_id`, revokes the entire family. No surviving rotated credential can renew or authorize another action. RFC 7009 revocation returns success for unknown tokens without revealing whether a token belongs to another client.

Reuse of a rotated refresh token revokes the complete family before `invalid_grant` is returned. Used token hashes are retained through the family's absolute lifetime so replay remains detectable after an older idle deadline. Parallel renewal attempts with the same refresh token count as reuse; clients must not race their own refresh requests.

Only SHA-256 credential hashes and non-secret connection metadata are persisted. Revocation, user deletion, credential expiry, and resource-audience changes are checked again during retained operations and notification delivery. A replayed/expired/revoked family requires a new authorization; it is not silently replaced.

## Existing connections

Existing access tokens keep their original expiry and their original selected-session or account restriction. The upgrade does not mint a refresh token for a previously issued bearer or widen an existing grant.

To gain renewal when an old client was registered code-only, reconnect using a **fresh dynamic client registration that requests refresh support**, then approve it. Some hosts reuse stored registration information when reconnecting; those hosts must also renew that client registration. To gain account-level session creation, separately confirm the new account-access email request. Neither change alters the Kanvas service configuration.

Connection metadata exposes `accessMode`, `refreshable`, the effective `refreshExpiresAt`, `status`, and `reconnectRequired` without exposing tokens. `expiresAt` remains the latest access-credential expiry; a renewable connection can still be active after that access credential expires. A code-only OAuth connection reports `reconnectRequired` to indicate that renewal requires a fresh registration/approval, even while its current access token remains valid.

## Focused verification

- `tests/core/oauth-continuity.test.ts`: real HTTP consent, modern/legacy SDK renewal, stable identity/idempotency/inbox, client/resource/scope restrictions, downscoping, concurrent reuse, family revocation, idle/absolute expiry, hash-only restart persistence, and pre-upgrade compatibility.
- Existing OAuth registration, PKCE, access-boundary, pairing, and publisher suites remain applicable.
- `tests/e2e/oauth-continuity.spec.ts`: real desktop/phone account consent without session creation, read-only account restrictions, and expired consent. Existing account-only onboarding and historical-grant regression coverage remains in `oauth-onboarding.spec.ts`.

## Email-confirmed connector sign-in

Every new authorization-code connection asks for an editable email address, even when the browser is already signed in. The page identifies the requested client and reading/publishing permissions, includes the Terms of Use and Privacy Policy, and offers **Continue with email**. Account creation and sign-in use this same flow; registration-disabled installations still accept only existing eligible accounts.

The email link only confirms the pending request. It never signs in the email browser or redirects that browser to the OAuth client. The original requesting browser holds an HttpOnly proof, completes its approved request, and receives a new account session. A short-lived verification record binds that browser, account and exact OAuth consent. Only it may finish account approval and redirect to the registered callback. An existing login, another browser, another consent or a reused link cannot substitute for this proof.

The original tab shows **Check your email** and finishes automatically after deliberate confirmation. Keep that tab open. Expired or denied requests must be restarted from the agent. The email screen shows the account/client and permission summary before confirmation; only confirm a connection you started. Screen sign-in with six letters remains a separate flow.

## Callback-free device authorization

Clients without a usable callback can use the advertised RFC 8628 endpoint. Register the device grant (`urn:ietf:params:oauth:grant-type:device_code`), optionally `refresh_token`, with `response_types: []` and no fictitious redirect URI. POST form-encoded `client_id` and `scope=read publish` to `/oauth/device/authorize`. The optional resource defaults to the canonical MCP endpoint and any supplied resource must match it exactly.

Show the returned `verification_uri` and `user_code` (or open `verification_uri_complete` while still showing the code). The human enters/verifies the code, signs in if needed, and explicitly allows or declines account access. Neither the verification link nor the email sign-in link grants agent access by itself. Client names are unverified labels.

Poll `/oauth/token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code`, `client_id` and `device_code`. Wait at least the returned interval (initially 5 seconds); `authorization_pending` means wait again, `slow_down` adds at least 5 seconds to every later interval. Stop on `access_denied`, `expired_token` or other terminal errors. Requests expire after 10 minutes. Successful access/refresh credentials go directly to the client and must remain in its protected credential store, never browser URLs, reports or model context. Redemption is single-use. Scope/resource cannot be substituted during polling.

Use `https://kanvas.host` or your installation's public origin in client configuration. This protocol does not promise automatic flow detection, automatic agent resume, or compatibility with every host. Standard PKCE remains primary. Version-pinned tested client details and limitations are recorded in [device implementation](../auth-device-implementation.md).

Signing out or revoking a browser session does not revoke OAuth connections; use Connections to revoke the agent family. Display pairing remains separate view-only access.
