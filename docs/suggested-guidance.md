# Optional global guidance suggestions

`kanvas.guidance.library.list` still lists **only your private saved prompts**. New accounts remain empty. Browse the separate catalog explicitly with `kanvas.guidance.suggestions.list` (default five, maximum twenty items; follow `nextCursor` as `afterId`). Responses include exact preview text and revisions.

The five defaults are fresh editorial prose: Muted Agent, Passive, Proactive, Reduced verbosity, and Proactive with reduced verbosity. No user's private prompts are read or exported to seed this catalog.

Import a previewed suggestion with `kanvas.guidance.suggestions.import`, supplying `suggestionId`, its `expectedRevision`, a **new** personal `promptId`, and a unique `requestId`; optionally give your copy a different `name`. The result reports `activated:false` and the source revision. Import is an explicit copy, never activation or overwrite. Edit the copy with the existing library save operation; activate it in a session with the existing library activation operation only after a separate user choice.

Only deployment-configured service administrators (`KANVAS_SERVICE_ADMINS`, existing authority) can use suggestions.save/delete. Account tier, session ownership and group administration do not grant this authority. Save uses expectedRevision0 for a new ID, current revision to edit; delete retains a revisioned tombstone so built-in defaults cannot reappear after restart. To recreate a deleted ID use its deletion revision, not zero. Exact request retries return the original result.

Global edits/deletions never alter imported copies or active guidance. Private edits never alter global suggestions. Selected-session grants cannot browse/import an account-wide personal library.

Persistence is additive in the existing generic record store (`guidance-suggestion`); no SQL migration. Reverting hides catalog operations but preserves catalog data and personal imports. No automatic seeding writes, activation, model calls or external services.
