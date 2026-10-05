# KPI and stat cluster

Runtime template ID: `kpi`.

A small cluster of exact values, changes and trend indicators.

## Contract and boundaries

Designed primarily for three to five values; accepts one to eight. Values and deltas are strings, not floating-point conversions. Trend directions are supplied, not interpreted as inherently good or bad. Longer values receive more width; detail remains scrollable on small displays.

Read `kanvas_tool_use` with `operationId:"kanvas.template.get"` and nested `arguments` for `kpi` before constructing a prepared view. It returns the exact same schema used by `kanvas_tool_use` with `operationId:"kanvas.view.validate"` and nested `arguments` and publishing.

## Illustrative example

```json
{
  "version": 1,
  "template": "kpi",
  "data": {
    "items": [
      {
        "label": "Revenue",
        "value": "123,456.78",
        "delta": "+12%",
        "trend": "up"
      },
      {
        "label": "Response time",
        "value": "42 ms",
        "delta": "−8 ms",
        "trend": "down"
      },
      {
        "label": "Availability",
        "value": "99.98%",
        "trend": "flat"
      }
    ]
  }
}
```

Examples are illustrative, not evidence. Shared source, security and delivery behavior is in [implemented rendering](../display/implemented-rendering.md). [Template index](README.md).
