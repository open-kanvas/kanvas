# Interactive settings

Runtime template ID: `settings`.

Visual controls for appearance, reading and regional settings; synchronization is separately owner-controlled.

## Contract and boundaries

Changes require editor permission and the current configuration revision. Saving account defaults is a separate explicit action available only to that account; a session-only MCP grant cannot change them. Existing sessions retain their own configuration, and only new sessions copy defaults.

The UI separates selection from application: selected palettes are visibly marked, drafts survive normal refreshes, and a reachable footer shows pending/saving/saved or conflict state. **Apply settings** persists the change and emits `settings.changed` for the agent. Interactive guests can submit `settings.request` proposals, but cannot mutate configuration. View-only screens explain their permission boundary before showing disabled controls. A received proposal is not an applied change.

Read `kanvas_inspect` (`operation: "template.get"`) for `settings` before constructing a prepared view. It returns the exact same schema used by `kanvas_inspect` (`operation: "view.validate"`) and publishing.

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
