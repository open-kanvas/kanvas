# Checklists

**Status:** Implemented. Current source contracts and the running schema reference define supported fields and limits.

## Implemented controls — 2026-09-09

`checklist` has up to 100 unique-ID `{id,text,checked?,detail?}` items; an empty saved checklist is valid. An authorized interactive viewer can click the checkbox itself; no duplicate top-level action button is necessary. It sends `{"kind":"checklist.toggle","itemId":"prepare","checked":true}` with the outer display revision. The server validates the item, persists its actual checked state and records a `checklist.toggle` interaction for the agent inbox. Checkbox appearance and the completion count follow that persisted state, not a fictitious local acknowledgement.

Read-only access shows a disabled checkbox and “View-only checklist”. Checklists inside the active prepared-presentation slide use the same response path. Broader process/walk-through authoring remains outside the narrower accepted checklist category.


See the [template index](README.md) and running `/docs/` reference for current fields and examples.

## In-place update refresh (0.36.0)

`checklist.update` saves independently, then refreshes every display still showing that same top-level checklist. The save/check/update runs under the publication serialization boundary: newer replacement content cannot be overwritten. No display-history publication is added and navigation roots remain stable for scroll/autofollow. Multiple windows receive the normal display invalidation. If no display shows the checklist, update changes no display. `checklist.show` remains the explicit operation to put it on a screen. Snapshots inside presentation/split panes are not live bindings.

## By-ID updates, highlight and retained revisions (0.37.0)

`checklist.update` changes items **by id**. The stored checklist is the source of truth; an agent sends only what changes.

- `items: [{id, checked?, text?, detail?, index?}]`: each entry changes only the fields it carries on the item with that id. `detail: null` clears a note. An id that does not exist yet is a new item and needs `text`; `index` places or moves it.
- `removeIds: [...]` deletes. Leaving an item out of `items` never deletes it.
- `mode: "replace"` swaps the whole list and needs every item in full. If saved items would disappear the call is refused and names them (`wouldRemoveIds`) unless `allowRemove: true` is sent.
- `highlightId` marks one item as the current one (`null` clears it). A published view can do the same with `data.highlight`. The highlight changes neither content nor order.
- Every response reports `changes {added, changed, removed, moved}` and `counts`, so a wrong call is obvious at once. A call that changes nothing leaves the revision as it is.
- The last 10 earlier revisions are retained. `checklist.read` lists them (`retainedRevisions`) and returns one with `revision`; `checklist.update {restoreRevision}` brings one back as a new revision. This is a one-step undo.

Compatibility: before 0.37.0 `items` replaced the whole list. A caller that sent the complete list still gets the same items, but items it leaves out are now kept instead of deleted, and the order of existing items is not changed by a patch. Use `removeIds`, `index` or `mode: "replace"` for those effects. The response is now a compact change report instead of the whole document; read the checklist for its items.

On screen the list keeps its scroll position when an update changes nothing that needs to move. The item an update is about (ticked, edited, added or highlighted, by an agent or by a tap) is brought to the middle when it is out of view or within the outer part of the list; while someone is scrolling by hand only a completely hidden item is fetched.


## Held displays and durable updates

`kanvas.checklist.update` saves the durable list even when a matching display is held.
Only matching unheld displays receive the changed view and a new display revision.
Held displays keep their complete stored snapshot, revision and previous delivery
record; no display-change event is emitted for them. The result records
`heldDisplayIds` separately from `displayRevisions` and reports `delivery[id].status:
"held"` without a revision: the old applied revision is not proof of this update.
Mixed targets can therefore report held and applied/offline/failed/unconfirmed together.

An identical request-ID retry does not modify the list again or publish targets
that were skipped. Its held outcome describes that original request, even after
release or subsequent publication; genuinely published revisions are reobserved
and can become superseded. Releasing hold alone does not replay skipped updates.
After releasing it, use `kanvas.checklist.show` with a new request ID to show the latest
saved list. A no-change update neither publishes nor implies browser application.
