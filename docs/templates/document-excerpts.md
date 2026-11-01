# Document display

**Status:** Accepted and implemented. Short excerpts remain the default for focused evidence; the September 12 evening request explicitly adds longer reading content. Runtime template ID: `document`.

## Current reading contract

Supply the exact `text`, not a URL with an implied fetch. `layout: auto | excerpt | reading` chooses the layout; auto selects reading for longer/multi-paragraph source. Reading uses a bounded line length, comfortable type and line height, top-aligned flow, and an accessible scroll region. The title pushes the body down rather than covering the first line. Source text and highlight offsets remain unchanged.

Optional `headings: [{start, end, level}]` uses exact nonoverlapping offsets into that same text, with levels 2–4; the view title remains the top heading. These are semantic headings, not generated rewrites. Existing excerpt/crop/source-reference features continue to work.

```json
{"version":1,"template":"document","title":"A supplied article","data":{"text":"Opening heading\n\nThe exact source paragraph remains intact.\n\nAnother supplied paragraph.","layout":"reading","headings":[{"start":0,"end":15,"level":2}]}}
```

Read `kanvas_discover` with `catalog:"templates", action:"get", id:"kanvas.template.document"` for current fields and bounds. The original discussion below explains why focused excerpts still matter; its full-document deferral was superseded only for explicitly supplied reading text, not document retrieval or OCR.

## Source boundaries

Focused excerpts, supplied page crops and exact highlights should retain qualifications, source labels and relevant context. Use image templates for actual crops; Kanvas does not retrieve documents or perform OCR. Never fabricate quotations, offsets or page references. Long reading text remains an explicit supplied document, not a URL with an implied fetch.
