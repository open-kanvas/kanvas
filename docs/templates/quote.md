# Quote and testimonial

Runtime template ID: `quote`.

A highlighted statement with attribution, optional role, portrait and source link.

## Contract and boundaries

Text is preserved as source; quotes must retain exact source wording. Up to 8,000 characters, subject to the full-view budget. Attribution is a supplied claim, not independently verified by KANVAS.

Read `kanvas_discover` with `catalog:"templates", action:"get", id:"kanvas.template.quote"` for `quote` before constructing a prepared view. It returns the exact same schema used by `kanvas_call` with `operationId:"kanvas.view.validate"` and nested `arguments` and publishing.

## Illustrative example

```json
{
  "version": 1,
  "template": "quote",
  "data": {
    "text": "Simplicity is the ultimate sophistication.",
    "attribution": "Attributed to Leonardo da Vinci"
  }
}
```

Examples are illustrative, not evidence. Shared source, security and delivery behavior is in [implemented rendering](../display/implemented-rendering.md). [Template index](README.md).
