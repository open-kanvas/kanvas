# Recipe and step-by-step

Runtime template ID: `recipe`.

Materials and numbered steps, with optional duration, yield, image and description.

## Contract and boundaries

Up to 100 materials and 100 steps. Ordered instructions and quantities are preserved. No tool execution, cooking timer or recipe retrieval is implied.

The template supports `mode: overview | steps` (overview by default). The overview offers **Start step-by-step**; steps mode presents one large instruction, progress, back/next, materials/intro and completion. `stage: intro | step | complete` and zero-based `index` select the prepared card. `kanvas_call` with `operationId:"kanvas.procedure.control"` and nested `arguments` advances immediately without republishing after a voice-agent command; browser controls work too. See the shared [procedure contract](procedure.md), now explicitly accepted for non-food how-to guides as well.

Read `kanvas_call` with `operationId:"kanvas.template.get"` and nested `arguments` for `recipe` before constructing a prepared view. It returns the exact same schema used by `kanvas_call` with `operationId:"kanvas.view.validate"` and nested `arguments` and publishing.

## Illustrative example

```json
{
  "version": 1,
  "template": "recipe",
  "data": {
    "name": "A thoughtful cup of coffee",
    "duration": "5 minutes",
    "yield": "1 cup",
    "materials": [
      "18 g ground coffee",
      "300 ml water"
    ],
    "steps": [
      "Heat the water.",
      "Wet the grounds, then pour slowly.",
      "Enjoy."
    ]
  }
}
```

Examples are illustrative, not evidence. Shared source, security and delivery behavior is in [implemented rendering](../display/implemented-rendering.md). [Template index](README.md).
