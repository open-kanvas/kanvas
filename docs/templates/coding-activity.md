# Coding

**Status:** Implemented. Current source contracts and the running schema reference define supported fields and limits.

## Implemented display — 2026-09-09

`code` supports source, before/after diff, file tree and supplied tool status layouts. Original code is rendered as inert text with bounded syntax highlighting; it is never executed. The code renderer is in the initial client module graph, so first display does not depend on a later lazy code-chunk fetch. Readiness follows the actual rendered component and remains separate from a server “prepared” response. Renderer failures and pending-delivery deadlines are reported through the display delivery path.

The historical report did not retain enough browser diagnostics to prove why that specific hosted code view failed. Regression coverage verifies the explicit prepared-code path and browser application, not an invented reconstruction of the old failure. See the [schemas](../../src/shared/view-schemas.ts) and [implemented rendering](../display/implemented-rendering.md) for literal-source interpretation and current limits.


See the [template index](README.md) and running `/docs/` reference for current fields and examples.
