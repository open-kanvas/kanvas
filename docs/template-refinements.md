# Template refinements

## Compact device preview
`device-preview.data.gridSize` accepts `standard` (default) or `compact`.
Compact only changes preview frame scale and spacing; iframe CSS viewport widths and heights are unchanged. Actual size remains 1:1. It is not a session appearance/density option.

## Rich passive map content
`contentDisplay: "permanent"` on a map or marker renders `popupHtml` (or plain label/description) as an always-visible tooltip. A marker overrides the map default; `popup` preserves click content.

`popupHtml` supports headings, div/span, sections, lists, tables, basic text formatting and links. Inline declarations are allowlisted: text colors/background-color, bounded spacing/size, borders, typography and basic flex/grid display. Caller styles are scoped to copied inert elements. Style blocks, selectors, classes/ids, event handlers, executable content, embedded media, CSS URLs/variables/expressions and positioning are never retained. Unsupported formatting is ignored. This is intentionally not arbitrary HTML/CSS execution.

## Choropleth partial success
Natural Earth 110m polygons remain the base geography. Missing small countries, including Singapore, Malta and Bahrain, have approximate representative point fallbacks (fixed-size dots, not area/administrative boundaries). Unsupported ISO-like codes are retained in source, omitted from the map, and explicitly named in its warning. Known regions still display. Supply custom GeoJSON for exact boundaries or unsupported territories. Duplicate aliases of a known country remain invalid to avoid ambiguous values.

## Product and comparison
`product.layout: "multi-vendor"` includes the supplied product title, description and optional image, plus price, availability, sizes and shipping alongside custom attributes. Missing values are marked, never invented. The `comparison` alias remains backward-compatible but is not recommended for new calls; standalone `comparison` is for different items. Its Takeaway column is explicitly labelled Summary and visually separated.

## Code split/diff navigation
`code.data.kind: "split"` accepts `panels` containing 2–3 unique `id` values and code/diff source with independent `path`, `language`, `startLine`, and `highlightLines`. Large screens use adjacent panes; phones stack separately scrollable panes.

`navigation: {action:"gotoLine", line:230, panelId:"definition", side:"before"}` targets an absolute displayed line. `panelId` defaults to the first pane for split views. `side` defaults to `after` for diffs, with removed lines available via `before`. Ranges are validated against the chosen source. Read capabilities exposes `codePanels`.

## Itinerary
Map layout uses `navigation: {action:"selectDay",day:2}` for one-based days or `day:"all"` for the whole trip. Navigation read returns the selected `state.day`; clicks use the same navigation state.

Any item may supply `inlineMap: {points:[{lat:38.71,lng:-9.14,label:"Station A"},{lat:38.80,lng:-9.38,label:"Station B"}],connect:true}`. One or two pins appear on a network-free SVG thumbnail backed by generalized Natural Earth geography. This is a geographic accent, not a detailed street map; the optional straight connector is not a calculated road/rail route. No place-name geocoding, tile lookup or server screenshot job is required.

## Org charts and roster guidance
Org charts allocate each parent a contiguous subtree span; a parentId edit recomputes both placement and edges. Explicit caller coordinates still override automatic placement.

Before a first roster draft, elicit missing hard constraints and soft preferences, reusing what is already known. After iterative edits, summarize recurring preferences tentatively, confirm them, and offer to save preferences in the agent's own memory. Do not automatically retain private assignments or infer unconfirmed rules. Kanvas remains a renderer, not a roster optimizer.
