# Repository working rules

- Name tests after behaviours or features, never dates, rounds or times of day. Extend the feature test when fixing a bug.
- A test-organization change preserves every test and assertion; record before/after suite counts. Mark literal duplicates `duplicate-of` rather than deleting them. Pruning is a separate reviewed change.
- Keep operational briefs, exported feedback, qualification logs and artifacts outside the tracked source tree.

New templates get their own feature-named renderer, stylesheet and schema from the start; never name source files after a date or release round.
