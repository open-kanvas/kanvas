# Document display

**Status:** Accepted and implemented. Short excerpts remain the default for focused evidence; the September 12 evening request explicitly adds longer reading content. Runtime template ID: `document`.

## Current reading contract

Supply the exact `text`, not a URL with an implied fetch. `layout: auto | excerpt | reading` chooses the layout; auto selects reading for longer/multi-paragraph source. Reading uses a bounded line length, comfortable type and line height, top-aligned flow, and an accessible scroll region. The title pushes the body down rather than covering the first line. Source text and highlight offsets remain unchanged.

Optional `headings: [{start, end, level}]` uses exact nonoverlapping offsets into that same text, with levels 2–4; the view title remains the top heading. These are semantic headings, not generated rewrites. Existing excerpt/crop/source-reference features continue to work.

```json
{"version":1,"template":"document","title":"A supplied article","data":{"text":"Opening heading\n\nThe exact source paragraph remains intact.\n\nAnother supplied paragraph.","layout":"reading","headings":[{"start":0,"end":15,"level":2}]}}
```

Read `kanvas_call` with `operationId:"kanvas.template.get"` and nested `arguments` for current fields and bounds. The original discussion below explains why focused excerpts still matter; its full-document deferral was superseded only for explicitly supplied reading text, not document retrieval or OCR.

## Candidate layouts

Highlighted excerpt, focused page crop, selected table/figure.

## Core information

Source document and locator, exact relevant content, highlighted span or region.

## Document display: highlight the relevant evidence

The user accepted document display as a category, emphasizing a relevant word, sentence, or passage rather than a full document or wall of text. Make the item under discussion immediately legible while preserving enough surrounding context to avoid changing its meaning.

Additional design suggestions for discussion, not finalized requirements:

- **Excerpt card:** reflow a short exact quotation for the current screen and emphasize the relevant words. Retain meaningful qualifications and clearly mark omissions.
- **Focused page crop:** show an enlarged original region when page layout matters; highlight the specific sentence or area rather than fitting an unreadable whole page onto a small display.
- **Source reference:** show the document title and a page/section locator, plus revision/date where relevant. Keep an available path to the original so the user can inspect more context; full-document viewing is optional, not the default.
- **Progressive context:** start with the essential passage and allow expansion to its paragraph or section if needed. Interaction behavior is not specified yet.
- **Figures and tables:** select the relevant figure, row, or cell as well as text, retaining labels, units, and notes needed to understand it.
- **Quote versus explanation:** keep source wording visibly distinct from a caller-supplied explanation. Highlights and locators must correspond to the actual source; do not fabricate a quote or page reference. Scanned documents may require OCR and uncertain extraction should not be presented as verified text.

A document excerpt can reuse the quick-fact/quotation layout, while a crop can reuse the image layout. Document-specific value is faithful selection, highlighting, and source traceability, not a separate document editor. Retrieval and OCR remain outside this renderer; current supplied-text highlights and reading layouts are implemented as described above.

See the [template index](README.md) for shared planning boundaries and related categories.
