# Whiteboard

**Status:** Accepted category; individual layouts and implementation details remain exploratory. Planning only, not a committed feature list.

## Implemented shape text — 2026-09-09

The structured whiteboard supports draw, rectangle, ellipse, arrow and text elements. An element’s optional `text` is now rendered on filled shapes and arrow labels as well as standalone notes. This fixes the reported sticky-note case where rectangles appeared but their allowed text field was discarded. Shape labels use the supplied stroke color when it has adequate contrast against the fill, otherwise black or white; shape stroke/fill values are unchanged. Wrapping preserves source characters, repeated spaces and Unicode.

Existing revision-bound collaborative drawing, unsaved-draft conflict handling, pan/zoom and fit controls remain intact. See the [runtime schemas](../../src/shared/view-schemas.ts) for geometry and source limits.

## Candidate layouts

Freeform drawing, sketch, mind map, iterative visual brainstorming.

## Core information

Board content and changes such as drawing, erasing, and revising; external/open-source integration to explore.

## Category notes

The general-purpose category replaces and includes drawing/sketching. A single user can draw, sketch, make mind maps, erase, revise, and iterate on visual ideas. Prefer exploring an existing third-party or open-source solution before considering a custom one. No service or detailed interaction design selected.

See the [template index](README.md) for shared planning boundaries and related categories.
