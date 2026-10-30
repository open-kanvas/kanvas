# Whiteboard

**Status:** Implemented. Current source contracts and the running schema reference define supported fields and limits.

## Implemented shape text — 2026-09-09

The structured whiteboard supports draw, rectangle, ellipse, arrow and text elements. An element’s optional `text` is now rendered on filled shapes and arrow labels as well as standalone notes. This fixes the reported sticky-note case where rectangles appeared but their allowed text field was discarded. Shape labels use the supplied stroke color when it has adequate contrast against the fill, otherwise black or white; shape stroke/fill values are unchanged. Wrapping preserves source characters, repeated spaces and Unicode.

Existing revision-bound collaborative drawing, unsaved-draft conflict handling, pan/zoom and fit controls remain intact. See the [runtime schemas](../../src/shared/view-schemas.ts) for geometry and source limits.


See the [template index](README.md) and running `/docs/` reference for current fields and examples.
