# Checklists

**Status:** Accepted category; individual layouts and implementation details remain exploratory. Planning only, not a committed feature list.

## Implemented controls — 2026-09-09

`checklist` has 1–100 unique-ID `{id,text,checked?,detail?}` items. An authorized interactive viewer can click the checkbox itself; no duplicate top-level action button is necessary. It sends `{"kind":"checklist.toggle","itemId":"prepare","checked":true}` with the outer display revision. The server validates the item, persists its actual checked state and records a `checklist.toggle` interaction for the agent inbox. Checkbox appearance and the completion count follow that persisted state, not a fictitious local acknowledgement.

Read-only access shows a disabled checkbox and “View-only checklist”. Checklists inside the active prepared-presentation slide use the same response path. Broader process/walk-through authoring remains outside the narrower accepted checklist category.

## Candidate layouts

Concise item list with completion state.

## Core information

Items and known status; broader instruction/walk-through variants are not yet accepted.

## Category notes

User explicitly accepted checklists after a broader process-guidance suggestion. Record the narrower category without treating every suggested workflow feature as approved.

See the [template index](README.md) for shared planning boundaries and related categories.
