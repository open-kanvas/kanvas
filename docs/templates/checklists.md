# Checklists

**Status:** Implemented. Current source contracts and the running schema reference define supported fields and limits.

## Implemented controls — 2026-09-09

`checklist` has 1–100 unique-ID `{id,text,checked?,detail?}` items. An authorized interactive viewer can click the checkbox itself; no duplicate top-level action button is necessary. It sends `{"kind":"checklist.toggle","itemId":"prepare","checked":true}` with the outer display revision. The server validates the item, persists its actual checked state and records a `checklist.toggle` interaction for the agent inbox. Checkbox appearance and the completion count follow that persisted state, not a fictitious local acknowledgement.

Read-only access shows a disabled checkbox and “View-only checklist”. Checklists inside the active prepared-presentation slide use the same response path. Broader process/walk-through authoring remains outside the narrower accepted checklist category.


See the [template index](README.md) and running `/docs/` reference for current fields and examples.
