# Product and vendor comparison

Runtime template ID: `product`.

One product or comparable offer set, with multiple vendors, exact prices and supplied practical details.

## Contract and boundaries

Up to 20 offers include vendor, price and optional stock, opening hours, distance, shipping and outbound offer URL. Prices remain strings, preserving currencies and precision. An optional supplied image supports image-led or compact layouts. No checkout, price retrieval, stock checking or preferred-vendor assumption.

Read `kanvas_discover` with `catalog:"templates", action:"get", id:"kanvas.template.product"` for `product` before constructing a prepared view. It returns the exact same schema used by `kanvas_call` with `operationId:"kanvas.view.validate"` and nested `arguments` and publishing.

## Illustrative example

```json
{
  "version": 1,
  "template": "product",
  "data": {
    "name": "Studio headphones",
    "description": "Illustrative vendor comparison.",
    "layout": "image-led",
    "offers": [
      {
        "vendor": "Local shop",
        "price": "1 290 NOK",
        "availability": "In stock",
        "hours": "10–18",
        "distance": "1.2 km"
      },
      {
        "vendor": "Online shop",
        "price": "1 190 NOK",
        "shipping": "2–3 days"
      }
    ]
  }
}
```

Examples are illustrative, not evidence. Shared source, security and delivery behavior is in [implemented rendering](../display/implemented-rendering.md). [Template index](README.md).
