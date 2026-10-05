# Leaderboard and ranking

Runtime template ID: `leaderboard`.

An ordered ranking where the supplied order and values are the message.

## Contract and boundaries

Up to 100 items. Rank, score, name and change remain source strings. KANVAS neither re-sorts nor recomputes rankings. Optional source images and long lists use responsive layout.

Read `kanvas_call` with `operationId:"kanvas.template.get"` and nested `arguments` for `leaderboard` before constructing a prepared view. It returns the exact same schema used by `kanvas_call` with `operationId:"kanvas.view.validate"` and nested `arguments` and publishing.

## Illustrative example

```json
{
  "version": 1,
  "template": "leaderboard",
  "data": {
    "items": [
      {
        "rank": "1",
        "name": "North",
        "value": "92",
        "change": "+2"
      },
      {
        "rank": "2",
        "name": "South",
        "value": "88",
        "change": "−1"
      }
    ]
  }
}
```

Examples are illustrative, not evidence. Shared source, security and delivery behavior is in [implemented rendering](../display/implemented-rendering.md). [Template index](README.md).
