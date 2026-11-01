# October acceptance workflow

> Historical release notes. For current behavior and exact schemas, use [current workflows](feedback-oct29.md) and the running `/docs/` reference. Later changes may supersede these release-specific descriptions.

All new changes are acceptance-only until owner approval. This release preserves the PostgreSQL structural schema (version 1): no table migration or irreversible data rewrite is needed. Existing records may retain removed density fields; runtime normalization ignores them. A rollback restores the prior release; quota entitlement records are ignored by the prior release and trial limits apply again. Take the standard local pre-deploy database snapshot as usual.

## Account tiers (quota entitlement, not authorization)

`documents` stores an optional `account-tier` record keyed by user ID, with JSON `{ "id": "account-user-id", "tier": "trial" }`. Absence is trial, so existing and new accounts default consistently without bulk rewriting records. Allowed meanings are trial, free and admin. Unknown/malformed tiers fail closed to trial. `free` and `admin` bypass only the configured session-count and retained-view-count limits; storage, source validation, media, rate and safety budgets remain enforced. View limits remain per session (not account-global), as before, and are determined by that session's owner, not a collaborating editor.

There is deliberately no self-service MCP/UI tier setter. A deployment administrator can insert/update the JSON record using the protected database administration path after separately verifying the account ID. No live tier was changed during implementation. The label `admin` does not confer service-analytics, unified feedback, group administration, session ownership or any other authorization. Service administrators remain configured separately.

## Portable captures

Call `kanvas_call` with `operationId:"kanvas.display.snapshot"` and nested `arguments` with `includeBase64:true` for `data.export` containing filename, MIME type, size and canonical base64 (maximum 2 MiB decoded). Inline image output is retained. External sending still requires the user's authorization to that destination. Existing asset URLs remain authenticated. For an existing saved asset, `kanvas_call` with `operationId:"kanvas.asset.export"` and nested `arguments` returns at most 32768 bytes per call with `offset`, `nextOffset` and `complete`; decode each chunk and concatenate bytes, not padded base64 strings. Original session grants and revocation apply on every call.

## Feedback and cleanup

`kanvas_call` with `operationId:"kanvas.report.patch"` and nested `arguments` takes reportId, expectedRevision and note, optionally title/description. It appends a follow-up only to the current author's report; status review is still the existing separate operation. Current account and original-session access apply; the filing session ID need not be passed.

Archive manage accepts targetIds for 1–100 distinct retained view IDs within one owned session. Archive/restore validate all targets before an atomic mutation. Permanent deletion binds a single 120-second challenge to the exact target set, owner, resource and session. Reordering IDs is harmless; changing any target is rejected. Human words stay off tool responses and are shown prominently only on the authorized confirmation screen. Archiving still retains quota usage; permanent deletion frees it.

## Starting and media

When the user asks to start Kanvas with no active session, `kanvas_call` with `operationId:"kanvas.account.begin"` and nested `arguments` reads authenticated live windows first. One selected window receives a fresh branded blank screen; multiple windows require a choice; none returns only the bare environment URL with no session created. Retry the same requestId safely after the browser opens. Existing session links and explicit session continuation remain supported. Omitted publishing displayId in an explicit session selects its first-registered display, never all displays.

A failed individual image now yields its existing labeled placeholder while the containing view is acknowledged ready. Existing source diagnostics stay visible and authorized; failed videos remain delivery failures. This does not weaken URL, SSRF, access or format validation.
