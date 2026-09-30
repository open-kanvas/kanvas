# Timeline

Runtime template ID: `timeline`.

A proportionally spaced horizontal timeline, with named lanes, points and duration bars.

## Contract and boundaries

Supply real date-only or timezone-qualified ISO timestamps, unique event IDs and end >= start. Up to 200 events. Nearby labels pack into separate rows; time spacing is preserved and narrow displays can scroll horizontally. Optional links are outbound source links, not fetched content.

Read `kanvas_inspect` (`operation: "template.get"`) for `timeline` before constructing a prepared view. It returns the exact same schema used by `kanvas_inspect` (`operation: "view.validate"`) and publishing.

## Illustrative example

```json
{
  "version": 1,
  "template": "timeline",
  "data": {
    "events": [
      {
        "id": "launch",
        "title": "Launch",
        "start": "2026-09-01",
        "lane": "Milestones"
      },
      {
        "id": "review",
        "title": "Review",
        "start": "2026-09-12",
        "end": "2026-09-14",
        "lane": "Milestones"
      }
    ]
  }
}
```

Examples are illustrative, not evidence. Shared source, security and delivery behavior is in [implemented rendering](../display/implemented-rendering.md). [Template index](README.md).
