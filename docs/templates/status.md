# Status and health board

Runtime template ID: `status`.

A supplied operational snapshot with textual labels and colored states.

## Contract and boundaries

States are ok, warning, down and unknown. Up to 100 items, optional as-of label and notes. This is not a background monitoring system; stale supplied health remains a snapshot and does not become a live uptime guarantee.

Read `kanvas_inspect` (`operation: "template.get"`) for `status` before constructing a prepared view. It returns the exact same schema used by `kanvas_inspect` (`operation: "view.validate"`) and publishing.

## Illustrative example

```json
{
  "version": 1,
  "template": "status",
  "data": {
    "asOf": "Illustrative snapshot",
    "items": [
      {
        "name": "API",
        "status": "ok",
        "note": "All systems operational"
      },
      {
        "name": "Imports",
        "status": "warning",
        "note": "Queue is longer than usual"
      }
    ]
  }
}
```

Examples are illustrative, not evidence. Shared source, security and delivery behavior is in [implemented rendering](../display/implemented-rendering.md). [Template index](README.md).
