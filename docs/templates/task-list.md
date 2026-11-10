# Task list

**Status:** Implemented in 0.37.0. A table of work items kept in the session, for richer work than a checklist. It is separate from the checklist for now.

- **Create** by publishing a `task-list` view once. The server stores the list and assigns each item a stable **number** ("item 7") and an id. A view that carries `taskListId` re-shows the saved list; it never overwrites it.
- **Change** with `kanvas.tasklist.update`: `add`, `items` (single fields of single items), `check`, `uncheck`, `remove`, `index` to move, `highlight`, `sort`, `filter`, `columns`, `statusPalette`, `statusColors`. Items that are not named are untouched; numbers never change and are never reused. `expectedRevision` and `requestId` work as for checklists.
- **Read** with `kanvas.tasklist.read`: compact rows, filtered and sorted by the server from stored data, or one `item` in full with its stored `detail` and `source`.
- **Show** on any display of the session with `kanvas.tasklist.show`.

Columns are open. Start with none and add what the work needs (a common starting point is number, item, status, tags). `status` and `tags` are plain text matched case-insensitively; `statusPalette` is one of the ready-made palettes `traffic`, `testing` or `workflow`. `statusColors` gives a list its own colours instead of, or on top of, a palette: up to 16 status values each with a `#rrggbb` colour, for example `{"waiting":"#d9a441","shipped":"#4caf7d"}`; its values win over the palette. Any status value is allowed; values with no colour are shown as neutral pills. Both can be set when the list is created and changed or cleared (`null`) later with `kanvas.tasklist.update`.

Filter and sort run on the stored data, on the server for reads and by the same function on the display: `filter` takes `status`, `tags`, `done` and `fields` (values of your own columns, for example `{"fields":{"owner":["Anna"]}}`); `sort.by` takes `number`, `title`, `status`, `tag`, `position` or the key of one of your columns. Matching ignores case.

Each item can store a long `detail` (up to 8000 characters) and a `source`. On a display only the highlighted item carries its detail; other rows show title and a two-line summary. Done items move to the bottom, muted, and visibly travel there. The display is read-only: ticking is done through the agent.

Limits: 200 items per list, 50 lists per session, 50 changes per call.
