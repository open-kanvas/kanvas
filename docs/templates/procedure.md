# Step-by-step procedures

Runtime template ID: `procedure`. [Recipes](recipe.md) use the same transitions through `mode: "steps"`.

One supplied step fills the display, with large type, progress, optional materials/intro, back/next and a completion card. All steps are pre-staged; advancing uses the retained source. Long individual instructions remain scrollable without removing words.

## Contract

`name`, optional `description`, up to 100 `materials`, 1–100 `steps`, zero-based `index`, and `stage: intro | step | complete`. Optional `completion` supplies the closing text. The index must refer to a supplied step. Fields, limits and defaults are available from `kanvas_tool_use` with `operationId:"kanvas.template.get"` and nested `arguments`.

```json
{"version":1,"template":"procedure","data":{"name":"Prepare the workspace","materials":["A notebook"],"steps":["Clear a space for the work ahead.","Write the one result you want to achieve.","Begin with the smallest useful action."],"stage":"intro","index":0},"source":{"illustrative":true}}
```

## Hands-free control

After the user says “next,” the connected voice agent calls `kanvas_tool_use` with `operationId:"kanvas.procedure.control"` and nested `arguments` with the current `expectedRevision`, a stable `requestId` and `action: next`. Other actions: `start`, `back`, `complete`, `overview`. Browser controls require editor permission. Updates preserve the original complete step list and return ordinary interaction/delivery state. A stale revision is a conflict, not permission to skip a step.

KANVAS does not capture audio or execute a physical procedure. Voice recognition and conversation belong to the MCP host. The same display works for cooking, assembly, maintenance and other supplied how-to instructions.

[Display-first principles](../README.md) · [Template index](README.md).
