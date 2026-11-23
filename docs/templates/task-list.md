# Task list

**Status:** Implemented in 0.37.0. A table of work items kept in the session, for richer work than a checklist. It is separate from the checklist for now.

- **Create** by publishing a `task-list` view once. The server stores the list and assigns each item a stable **number** ("item 7") and an id. A view that carries `taskListId` re-shows the saved list; it never overwrites it.
- **Change** with `kanvas.tasklist.update`: `add`, `items` (single fields of single items), `check`, `uncheck`, `remove`, `index` to move, `highlight`, `sort`, `filter`, `columns`. Items that are not named are untouched; numbers never change and are never reused. `expectedRevision` and `requestId` work as for checklists.
- **Read** with `kanvas.tasklist.read`: compact rows, filtered and sorted by the server from stored data, or one `item` in full with its stored `detail` and `source`.
- **Show** on any display of the session with `kanvas.tasklist.show`.

Columns are open. Start with none and add what the work needs (a common starting point is number, item, status, tags). `status` and `tags` are plain text matched case-insensitively; `statusPalette` is one of the ready-made palettes `traffic`, `testing` or `workflow`. `colors` gives a list its own colours instead of, or on top of, a palette: up to 16 status values each with a `#rrggbb` colour, for example `{"waiting":"#d9a441","shipped":"#4caf7d"}`; its values win over the palette. Any status value is allowed; values with no colour are shown as neutral pills. Both are set when the list is created; `kanvas.tasklist.update` does not change them .

Filter and sort run on the stored data, on the server for reads and by the same function on the display: `filter` takes `status`, `tags`, `done` and `fields`, which filters on your own columns in plain text as `column=value` (for example `{"fields":["owner=Anna","owner=Bo"]}`; entries for the same column are alternatives, different columns must all match); `sort.by` takes `number`, `title`, `status`, `tag`, `position` or the key of one of your columns. Matching ignores case.

Each item can store a long `detail` (up to 8000 characters) and a `source`. On a display, agent-expanded items carry their detail; other rows show title and a two-line summary. Done items stay in their written position by default; doneLast:true opts into moving them to the bottom. Expand/collapse item detail locally with its title button or through the agent; ticking is done through the agent. Only that displayed list can be read through the screen-scoped detail endpoint.

Limits: 200 items per list, 50 lists per session, 50 changes per call.


## Subtasks and display references

A parent may carry up to 100 `subtasks:[{id?,title,checked?,status?,description?,detail?}]`. Omitted ids are assigned once. Overview rows show a done/total count; subtasks open with the parent’s detail. `kanvas.tasklist.read` with `item` returns all stored subtasks.

Use `kanvas.tasklist.update` with `subtasks:[{item:7,add:[{title:"Bars"}],items:[{id:"stable-id",status:"doing"}],check:["stable-id"],uncheck:[],remove:[],highlight:"stable-id"}]`. Each group addresses one permanent parent number or id. Highlighting a subtask also opens its parent; null clears the subtask highlight. Parent and subtask changes share the existing revision/idempotency transaction.

`items[].reference` is free plain text, never an operational key. `showNumber` defaults true and `showReference` defaults false; both can be set independently at creation or through tasklist.update. Hiding a number never changes it, and moving/removing items does not reuse their permanent numbers.

Storage stays in existing JSON documents; no SQL migration is needed. Older binaries reject new fields on mutation, so retain the newer binary when editing lists that contain subtasks/references.

A parent plus its subtask detail is bounded to64KiB so an item read remains complete within MCP's response limit. The stored list is bounded to2MiB across cumulative delta updates; rejected updates save nothing.

## Agent-controlled expansion

Use `kanvas.tasklist.update` with `expand:[7,"stable-id"]` or `collapse:[7]` to open or close specific parent details and subtasks. `collapseAll:true` closes every item, including the highlighted one. These updates reach displays already showing the list without republishing; item ids and permanent numbers do not change. Reads return the saved `expanded` ids.

Moving the highlight opens only the newly highlighted item and closes the previous item and any local expansions. Highlighting a subtask opens its parent. Within one update, highlight changes apply first, then `collapseAll`, `expand`, and `collapse`. Local title-button choices survive unrelated item edits, but a new agent expansion command takes precedence. Replaying the same request id does not reapply a command; use a fresh request id for a new spoken request.

A published view can provide `expanded:["stable-id"]`; an empty array initially closes everything. When omitted, the highlighted item opens. Persisted disclosure fields require this version or newer for subsequent list mutations; software rollback must preserve those stored documents.
