# Interactive settings

Runtime template ID: `settings`.

Visual controls for appearance, reading and regional settings; synchronization is separately owner-controlled.

## Contract and boundaries

Changes require editor permission and the current configuration revision. Saving account defaults is a separate explicit action available only to that account; a session-only MCP grant cannot change them. Existing sessions retain their own configuration, and only new sessions copy defaults.

Selections save immediately in the chosen scope (This session, All new sessions, or an authorized group). There is no Apply button. Concurrent selections are queued and revisions still protect conflicting writes. Interactive guests submit settings.request proposals but cannot mutate configuration. The current session is not silently changed by editing defaults. See [Live settings](../settings.md).

Read `kanvas_discover` with `catalog:"templates", action:"get", id:"kanvas.template.settings"` for `settings` before constructing a prepared view. It returns the exact same schema used by `kanvas_call` with `operationId:"kanvas.view.validate"` and nested `arguments` and publishing.

## Illustrative example

```json
{
  "version": 1,
  "template": "settings",
  "data": {
    "description": "Tune this session or save your defaults.",
    "allowAccountDefaults": true
  }
}
```

Examples are illustrative, not evidence. Shared source, security and delivery behavior is in [implemented rendering](../display/implemented-rendering.md). [Template index](README.md).
