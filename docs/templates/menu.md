# Menu and price list

Runtime template ID: `menu`.

Grouped named items with supplied prices, descriptions, optional images and featured status. Large names/prices, clear group headings, generous space and emphasized featured dishes follow the [display-first baseline](../README.md).

## Contract and boundaries

Up to 20 groups and 100 items per group, subject to the overall view budget. Prices are exact labels, not computed totals; featured items are explicitly marked. No ordering or payment system.

Optional `image: {url, alt}` is accepted on the menu, each group and each item. Supplied public or protected asset URLs use normal source validation and media-readiness checks. No images are invented or fetched from a dish name. Image-free menus remain supported; failed images retain the normal visible failure behavior. For glanceability, publish the relevant dishes rather than every possible item.

Read `kanvas_discover` with `catalog:"templates", action:"get", id:"kanvas.template.menu"` for `menu` before constructing a prepared view. It returns the exact same schema used by `kanvas_call` with `operationId:"kanvas.view.validate"` and nested `arguments` and publishing.

## Illustrative example

```json
{
  "version": 1,
  "template": "menu",
  "data": {
    "groups": [
      {
        "title": "Coffee",
        "items": [
          {
            "name": "Espresso",
            "price": "35 NOK"
          },
          {
            "name": "Flat white",
            "price": "49 NOK",
            "featured": true
          }
        ]
      }
    ]
  }
}
```

Examples are illustrative, not evidence. Shared source, security and delivery behavior is in [implemented rendering](../display/implemented-rendering.md). [Template index](README.md).
