# Repository working rules

- Name tests after behaviours or features, never dates, rounds or times of day. Extend the feature test when fixing a bug.
- A test-organization change preserves every test and assertion; record before/after suite counts. Mark literal duplicates `duplicate-of` rather than deleting them. Pruning is a separate reviewed change.
- Keep operational briefs, exported feedback, qualification logs and artifacts outside the tracked source tree.

New templates get their own feature-named renderer, stylesheet and schema from the start; never name source files after a date or release round.

## Reference documentation and scratch
Round briefs, plans, exported report lists and acceptance notes belong in ignored `.work/` or evidence outside the checkout. Never commit them, even during a release. Name committed source, tests and docs after their feature, never a date or release round. `docs/` is contributor/agent reference (architecture, integration, operations, templates); round records belong in PR descriptions and release notes.
