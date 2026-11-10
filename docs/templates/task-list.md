# Task list

**Status:** Implemented in 0.37.0. A table of work items kept in the session, for richer work than a checklist. It is separate from the checklist for now.

- **Create** by publishing a `task-list` view once. The server stores the list and assigns each item a stable **number** ("item 7") and an id. A view that carries `taskListId` re-shows the saved list; it never overwrites it.
- **Change** with `kanvas.tasklist.update`: `add`, `items` (single fields of single items), `check`, `uncheck`, `remove`, `index` to move, `highlight`, `sort`, `filter`, `columns`. Items that are not named are untouched; numbers never change and are never reused. `expectedRevision` and `requestId` work as for checklists.
- **Read** with `kanvas.tasklist.read`: compact rows, filtered and sorted by the server from stored data, or one `item` in full with its stored `detail` and `source`.
- **Show** on any display of the session with `kanvas.tasklist.show`.

Columns are open. Start with none and add what the work needs (a common starting point is number, item, status, tags). `status` and `tags` are plain text matched case-insensitively; `statusPalette` (set when the list is created) is one of the ready-made palettes `traffic`, `testing` or `workflow`. Any status value is allowed; values the palette does not know are shown as neutral pills. A custom value-to-colour map is not part of this release.

Each item can store a long `detail` (up to 8000 characters) and a `source`. On a display only the highlighted item carries its detail; other rows show title and a two-line summary. Done items move to the bottom, muted, and visibly travel there. The display is read-only: ticking is done through the agent.

Limits: 200 items per list, 50 lists per session, 50 changes per call.
