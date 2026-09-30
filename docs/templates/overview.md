# Session overview

Runtime template ID: `overview`.

An interactive gallery of retained views across the selected displays. A **view** is one retained content state; a **display** is the independent receiving surface.

## Contract and boundaries

Uses service history, not agent-reconstructed content. Includes current indicators, original revisions, full wrapped titles, timestamps and type. The evening update renders real miniatures of retained content with the normal template renderer, loaded only near the viewport. Previews are inert, have no autoplay, and fit within wider cards. Session controls use a nonrecursive placeholder. The selected-history endpoint and protected assets remain session/display scoped; it does not fetch complete datasets or hidden presentation slides.

These are live renderings of retained source, not historical screenshots of a physical display. Current appearance/media may differ from the original rendering. Clicking **Show this view** navigates the original display through its revision-safe history API; editor authority is required. Up to 60 views / 6 MiB per display and 200 gallery entries are retained; branching can discard forward history. This is not an unlimited archive.

Read `kanvas_inspect` (`operation: "template.get"`) for `overview` before constructing a prepared view. It returns the exact same schema used by `kanvas_inspect` (`operation: "view.validate"`) and publishing.

## Illustrative example

```json
{
  "version": 1,
  "template": "overview",
  "data": {
    "order": "oldest",
    "showPreviews": true
  }
}
```

Examples are illustrative, not evidence. Shared source, security and delivery behavior is in [implemented rendering](../display/implemented-rendering.md). [Template index](README.md).
