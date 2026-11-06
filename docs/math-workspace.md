# Supplied mathematical notation
Template math renders supplied LaTeX with KaTeX 0.16.22 (MIT; bundled distribution includes its fonts/license). No evaluation, symbolic operations, external resources or trusted HTML.
Expressions is an ID-keyed map; order lists exactly those IDs. Layouts: single (one), derivation, alternatives. Focus optionally marks one expression. Each expression has latex, optional label, display (default true), and terms map. \term{denominator} substitutes exactly the annotated terms.denominator.latex. No arbitrary text matching or nested annotations.

Use ordinary submit/read and revision-bound view.patch:
- Set/replace: set /data/expressions/equation to a complete expression.
- Term replace: set /data/expressions/equation/terms/denominator/latex.
- Highlight: set term emphasis to box, underline, color, or none; color is six-digit hex.
- Append/insert: atomic set new expression + set /data/order including its ID.
- Remove: atomic remove expression + set order (and clear/change focus if necessary).
- Focus: set /data/focus; clear with remove.
Untouched expressions remain unchanged. Existing display current/history restore retain ordinary ACLs/revisions/idempotency. History has no per-display eviction; publishing after back navigation preserves the forward branch. The fixed1000-view session cap refuses additional publications without removing earlier views; navigation consumes no slot. There is no dedicated saved-variant/branch API. To preserve an alternative, the agent explicitly copies/publishes its supplied state to a separate display; those displays can be composed via existing display-grid. No new symbolic history engine, linked plot evaluator or intra-template split-plot control.

Bounds: 32 expressions, 32 terms/expression, 8000 characters/source, 16000 expanded characters/expression, 64000 workspace characters, max 200 macro expansions, maxSize 20. Unsupported/invalid TeX shows escaped source and a failure message; saved source is retained. Wide formulas scroll rather than becoming illegibly small. Browser screen/hardware acceptance still required.

Build flag VITE_KANVAS_MATH_ENABLED=false disables rendering (retains state and read/patch). Default enabled. No migration. Reverting removes rendering/schema support; keep saved records for re-enable, never delete data.
