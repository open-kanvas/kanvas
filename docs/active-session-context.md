# Explicit active session context

Both MCP tools accept an optional top-level `activeContext: {sessionId}`. This is a host-owned **per-call guidance context**, not account or transport state. It does not fill operation arguments or authorize an operation.

```json
{"name":"kanvas_discover","arguments":{"catalog":"operations","action":"search","query":"guidance","activeContext":{"sessionId":"authorized-session-id"}}}
```

```json
{"name":"kanvas_call","arguments":{"operationId":"kanvas.guidance.library.list","arguments":{},"activeContext":{"sessionId":"authorized-session-id"}}}
```

Use IDs from authorized live state, not the illustrative ID above. The host must resend context for every call that needs it. Switch by passing the new ID; clear with `activeContext:null` or omit the field. Concurrent calls on the same connection remain isolated. No last-opened-window or sole-account-session inference occurs.

An explicit `arguments.sessionId` or `arguments.groupId` takes precedence, including malformed or inaccessible targets (which never fall back to another session). Access is checked afresh when guidance is exposed. Unauthorized context adds no session guidance; user guidance remains subject to existing account/token permissions. Selected-session grants still cannot read standing account guidance. Drafts are never active guidance.

The envelope is validated independently from the discovered operation schema. Do not put activeContext inside an operation's arguments. Existing calls without context behave unchanged; session-specific operations must continue supplying their required sessionId explicitly. Guidance is user/workspace data, never elevated instructions or consent.
