# Venue displays, media and private templates (v0.27)

Use kanvas_discover for exact schemas and kanvas_call for the returned operation
IDs. Reconnect cached development connectors after upgrading. Examples describe
supplied data, never permission to publish.

## Seat maps

Publish seat-map with people [{id,name,tags?}], layout, tableCount, seatsPerTable,
and optional named tables [{id,name}]. Explicit seats [{id,label?,tableId,personId?}]
retain exact assignments. Up to 1,000 people and seats are supported.

Presets: long-table, two-long-tables, three-long-tables, horseshoe, hollow-square,
round-tables, cocktail-rounds, head-and-guests, theater, classroom-grid,
classroom-clusters, classroom-pods, herringbone, grid. columns, clusterSize (2–4)
and curved customize bounded preset geometry.

kanvas.seat.map.update takes sessionId/displayId and one action:

- place/move: personId, seatId. Occupied destinations automatically swap; when
  the moving person was unseated, the displaced occupant returns to the pool.
- swap: personId, otherPersonId; works with one unseated person.
- add-seat: seat; remove-seat/clear-seat: seatId; add-person: person.

Removing a seat never removes its person. PostgreSQL state/history survives
restarts. Operations target the current map; normal retained-view/history tools
restore earlier maps. No guest self-selection, drawing or smart arrangement.

## Vocabulary

kanvas.help.vocabulary and the vocabulary template share one content source.
The visual shows a session containing displays, several devices mirroring a
display, and one current view per display. highlight can select one term.
“Slide” is an alias for “view”; users need not know strict terminology.

## Restaurant and shop signage

menu-board and todays-special have separate schemas. A special has item; a board
has ordered sections [{id?,name?,items:[...]}], optional title/footer and
list/grid/featured layouts. Item name, price, description, image, badges,
availability and allergens are all optional. Numeric prices use currency/locale;
literal strings retain source text. Stable section/item IDs are generated when
omitted and can be read from current display data.

Presets: bold, fine-dining, cafe, chalkboard, modern. Quick options: accent hex
color, light/dark theme, showPrice, standard/large/extra-large size.

kanvas.menu.update: price, availability, swap-special, add-item, remove-item,
style. Hidden items are not painted; sold-out labels remain visible.

Shop templates: opening-hours, back-at, closed-sign, hiring, sale-poster,
health-notice, custom-sign. kanvas.signage.update supports set, clear, set-hours,
set-day. Clearing restores the view before the first sign, including blank;
switching signs preserves that return view. An explicit openNow status is
supported. Automatic scheduling and inventory/payment/ordering are excluded.

Sale posters also offer backgrounds/inset images, sans/serif/mono fonts,
headline sizes, center/split/editorial/burst layouts, and safe static HTML/CSS.
Hiring signs can display an application URL or “ask inside”.

## Kanban

Publish kanban with ordered columns [{id,name,wipLimit?,cards:[...]}]. Cards have
id/title and optional description, assignee, tags, dueDate. IDs are unique across
the board. WIP limits are visibly advisory, not hard workflow blocks.

kanvas.kanban.update: add-card, remove-card, edit-card, move-card (optional index),
reorder-columns. Multiple displays may have independent durable boards. Normal
history restores earlier boards; no swimlanes or guest drag/drop in v1.

## Media library

Account → Media library accepts image files, drag/drop and phone camera input.
Optional tags improve retrieval. kanvas.media.list searches names/tags;
kanvas.media.get returns metadata. Stable /api/media/ID URLs work in image fields.

PNG/JPEG/WebP/GIF bytes and dimensions are validated. Limits: 10 MiB each,
200 images / 200 MiB per account. No agent-side file connector is needed.

Listing/uploading requires account-wide authority; selected-session tokens,
guests and other accounts cannot enumerate the library. Successful publication
grants its session image access, including retained history; failed validation
does not. Revoked session access revokes image access. Responses are authenticated,
private/no-store and nosniff. Anonymous image hosting and QR handoff are not
included; upload from the signed-in browser/phone instead.

## Private account templates

kanvas.account.templates.create/list/delete/publish require account-wide
authority. Definitions are private with unique IDs; names may overlap across
accounts. No in-place edit/versioning: create a replacement, then explicitly
delete the old definition.

Create takes name, schema, html, css. Bounded JSON schema supports objects with
properties/required, arrays/items, primitives, enums and basic size/numeric
bounds, at most eight levels. Root must be an object; undeclared fields and
remote references are rejected. Limits: 100 definitions, 64 KiB schema,
50,000 HTML and 20,000 CSS characters.

Bind escaped {{field}} values; repeat {{#each items}}...{{/each}}. Primitive
arrays use {{value}}. Nesting is supported; missing optional arrays render empty.
No expressions, raw markup binding, property traversal or executable code.

A deliberately small well-formed HTML subset supports text/layout, tables/lists
and safe class/id/accessibility attributes. Static CSS excludes URL/import,
escape, comment and executable-property tricks. External resources, links,
image tags and inline style attributes are not accepted; built-in image/signage
templates support media. Output is server-validated and isolated in an
empty-sandbox iframe with restrictive CSP.

Private entries appear alongside built-ins in discover template search/list as
account.template.UUID. Exact discovery returns their schema. Publish takes
templateId, values, sessionId, displayIds and optional requestId. The internal
account-template view is not a built-in templateHint namespace. Normal replacement
and /data/values/... patches regenerate derived HTML/CSS. Deletion retains
published snapshots but prevents new publication/updates using that definition.

## Optional concurrency guards

Omit expectedRevision/expectedVersion to atomically apply to current authorized
state; supply a value to opt into optimistic concurrency. Conflicts return
currentRevision and an actionable message. Invalid syntax uses authorized reads
to obtain the current value when available; another concurrent write may still
cause a second conflict.

Stable request IDs deduplicate retries. Omitted IDs are fresh per call, not a
retry identity. Permissions, holds, consent, source validation and internal
transactional rechecks remain. Browser capture/observation revision identities
are not update guards and remain mandatory. Exact source/card/draft identity
fields can still be required independently of optional version guards.

The bounded tool-result envelope grows from 64 to 96 KiB to retain complete,
untruncated composite schemas for the expanded catalog; source/data responses
remain bounded and JSON Schema equivalence is regression-tested.
