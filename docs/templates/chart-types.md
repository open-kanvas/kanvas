# Individual chart types

`template: "chart"` displays **one visual**. Choose its `data.kind`; do not compose a dashboard to obtain a particular plot. The original `line`, `bar`, `histogram`, `scatter`, `heatmap` and `box` kinds remain supported.

The additional kinds are `candlestick`, `ohlc`, `area`, `violin`, `radar`, `network`, `treemap`, `sankey`, `bubble`, `choropleth`, `pie`, `donut`, `gauge`, `funnel` and `waterfall`. Each has an illustrative example in the chart gallery. Gallery region shapes are explicitly illustrative supplied polygons, not real country boundaries or a lookup service.

## Choosing a kind

| Kind | Actual source data needed | Important semantics |
|---|---|---|
| `candlestick` / `ohlc` | Ordered observations with x, open, high, low, close | `low ≤ open/close ≤ high`. Candlesticks draw bodies/wicks; OHLC draws open/close ticks. Neither derives missing prices from a line. |
| `area` | Ordinary x/y series | Filled to zero. Missing observations break both the line and fill. Series are overlaid, not silently stacked. |
| `violin` | Actual numeric samples per distribution | Gaussian kernel density estimate; actual samples remain inspectable. Quartiles alone cannot reconstruct a distribution. |
| `radar` | Matching attributes across one to four series, with explicit ranges | Every axis declares its min/max and optional unit. No fabricated attributes, default normalization, or claim that “larger is better.” |
| `network` | Entity IDs and their actual connections | Optional supplied x/y for every node, otherwise deterministic circular layout. Position is layout, not an inferred physical location. |
| `treemap` | IDs, parent IDs and nonnegative leaf values | Hierarchical slice-and-dice areas. Parent totals are derived from children, or checked against them when supplied; not counted twice. |
| `sankey` | Nodes and positive weighted directed links | Acyclic flow graph, with ribbon thickness proportional to the supplied weights. In/out differences remain visible; no balancing links are invented. |
| `bubble` | Numeric x/y and positive size | Circle **area**, not radius, encodes size. |
| `choropleth` | Supplied Polygon/MultiPolygon boundaries and associated values | Fits supplied longitude/latitude geometry in an equirectangular display. No geocoding, boundary fetch, or invented region shapes. Explicit null means no data, not zero. |
| `pie` / `donut` | One nonnegative category/value series with a positive total | Exact category values stay in the key. The donut's compact derived total is marked `≈`. |
| `gauge` | One value plus an explicit min/max range | Optional caller-supplied threshold labels/colors. No invented “safe” or “danger” thresholds. |
| `funnel` | Ordered, nonnegative, non-increasing stage values | Stage width encodes the supplied value. Use bars for values that grow between stages. |
| `waterfall` | Ordered signed contributions and optional explicit total markers | Only marked total rows are totals. An initial total seeds the balance; subsequent totals must equal the running contributions. |

## Native source data

Ordinary series have `name` and `points`. Points retain the existing required `x` and `y`. For candlestick/OHLC, `y` is the close value or explicit `null`; provide all four financial fields. For violin, `y` is the sample median or explicit `null` and `samples` contains the actual observations.

```json
{
  "version": 1,
  "template": "chart",
  "data": {
    "kind": "candlestick",
    "unit": "USD",
    "series": [{
      "name": "Supplied trading sessions",
      "points": [
        { "x": "2026-09-01", "y": 108, "open": 101, "high": 111, "low": 98, "close": 108 },
        { "x": "2026-09-02", "y": 104, "open": 108, "high": 112, "low": 102, "close": 104 }
      ]
    }]
  },
  "source": { "title": "Illustrative supplied sessions", "illustrative": true }
}
```

These example numbers are illustrative; supply your actual observations for a real display. For distribution data:

```json
{
  "kind": "violin",
  "series": [{
    "name": "Observed duration",
    "points": [
      { "x": "Group A", "y": null, "samples": [3, 4, 5, 5, 6, 8, 10] },
      { "x": "Group B", "y": null, "samples": [2, 3, 3, 4, 8, 9, 11] }
    ]
  }]
}
```

Violin bandwidth is either an explicitly supplied positive point `bandwidth`, or a deterministic robust sample-based estimate. Gaussian density is evaluated on a bounded grid including kernel tails where numeric precision permits. Width is normalized within each distribution; it does not encode group sample count. Constant observations require an explicit positive bandwidth. Every group needs at least two observations; missing bound sample rows are excluded and recorded in the source summary.

### Graphs and hierarchies

`network` and `sankey` use `nodes: [{id, label?}]` and `links: [{source, target, value?}]`, not a second series plot. Network weights are optional. Sankey weights must be positive; every node must participate in a link. Network self-links are supported; Sankey self-links/cycles are not. Native network coordinates must supply both x and y on every node or on none. `directed: true` adds arrows to a network.

`treemap` uses `nodes: [{id, parent?, label?, value?}]`. Omit `parent` for root nodes. Leaf values are required and nonnegative; at least one must be positive. Internal values are optional checked totals. IDs must be unique, parents/endpoints must exist, and hierarchies cannot contain cycles. Layout does not invent nodes or relationships.

### Explicit radar and gauge scales

Radar uses `radarAxes: [{key, min, max, label?, unit?}]`. Each series provides exactly one numeric point whose `x` equals each axis `key`; `y` must lie in that axis's range. There are 3–16 unique axes. Indexed spokes correspond to the wrapping full-name/range key, keeping long attribute names readable.

Gauge uses `gauge: {min, max, thresholds?: [{value, label?, color?}]}` and one point in one series. The range must increase and contain the point. Thresholds increase within that range; colors are supplied six-digit hex colors. Gauge values are never clamped to disguise out-of-range data.

### Supplied geography

Choropleth uses `regions: [{id, label?, geometry, value}]`. `geometry` is standard GeoJSON **geometry**, not an entire FeatureCollection:

```json
{
  "id": "supplied-zone",
  "label": "Illustrative supplied zone",
  "value": 24,
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[100, 0], [101, 0], [101, 1], [100, 1], [100, 0]]]
  }
}
```

The rectangle above illustrates the contract; it is not a claimed real administrative boundary. Use actual supplied boundary coordinates for real regions. Coordinates are `[longitude, latitude]`, within ±180° / ±90°. Rings must be explicitly closed, nonzero-area and non-self-intersecting. Holes must be strictly inside the exterior, without crossings or overlap. MultiPolygon preserves separate parts and holes. Split antimeridian-crossing rings before supplying them; no automatic boundary repair, simplification, projection change or geometry lookup occurs.

## Dataset bindings

Stored datasets and inline `rows` / `csv` / lossless `json` use the same authoritative materializer. Select actual columns; do not transcribe numeric data into a hand-reconstructed series. Put the dataset selection in `data.binding` (with `datasetId` for a stored dataset); ordinary inline submissions receive the stored ID from KANVAS.

| Kind | Binding fields, in addition to `datasetId` |
|---|---|
| `area` | `x?`, `y: [column, ...]`; ordinary explicit aggregation/groupBy or stride downsampling is supported. |
| `candlestick`, `ohlc` | `x`, `financial: {open, high, low, close}` selecting four distinct columns. No aggregation/downsampling. |
| `violin` | `distribution: {value, groupBy?, bandwidth?}`. No additional x/y/groupBy/aggregation/downsampling. |
| `radar` | `x` for attribute keys, `y: [column, ...]`; keep supplied `data.radarAxes`. Explicit aggregation is allowed when appropriate. |
| `network`, `sankey` | `edges: {source, target, value?, sourceLabel?, targetLabel?}`. Optional explicit `aggregation: "sum"` or `"count"`; duplicate edge pairs otherwise fail. |
| `treemap` | `hierarchy: {id, parent, value, label?}`. Null/empty parent cells indicate roots; null values only work on internal nodes. No aggregation/downsampling. |
| `bubble` | `x`, `y: [oneColumn]`, `size`. No aggregation; explicit stride downsampling is available. |
| `choropleth` | `geography: {id, value}` plus supplied `data.regions` geometry. Duplicate rows need explicit aggregation; no downsampling. |
| `pie`, `donut`, `funnel` | `x?`, `y: [oneColumn]`; explicit grouping/aggregation is available. Missing values are not silently zeroed. |
| `gauge` | `y: [oneColumn]` and an explicit `row`, **or** explicit aggregation. Keep supplied `data.gauge` range. |
| `waterfall` | `x?`, `y: [oneColumn]`, optional `total` column. Total markers must be booleans or exact CSV `"true"` / `"false"`. No grouped aggregation/downsampling. |

Example dataset-backed financial request data:

```json
{
  "kind": "candlestick",
  "unit": "USD",
  "binding": {
    "datasetId": "source-id",
    "x": "date",
    "financial": { "open": "open_price", "high": "high_price", "low": "low_price", "close": "close_price" }
  }
}
```

A bound choropleth joins every source ID to the exact supplied region geometry. An unmatched source row fails; a supplied region with no source row remains explicit null/no-data. Derived sums/means/counts never replace their raw contributing observations. A count is displayed as a count, not relabelled with the value of the single source cell it counted. Mapping choices, geometry, radar/gauge scales and directionality must match supplied source settings; a requested binding must match the selected chart contract.

## Precision and source integrity

Source rows/cells remain authoritative. Use decimal strings, CSV or lossless JSON text when decimal lexemes or large integers must survive exactly. As with existing chart kinds, SVG positions are finite IEEE-754 projections. The view retains:

- `rawX` / `rawY` alongside ordinary coordinates;
- `raw` fields for financial values, bubble size, total markers, graph IDs/weights and region values;
- aligned `samples` / `rawSamples` for distributions;
- `rawValues` for aggregated contributing cells, with their `sourceRows`;
- exact supplied geographic geometry, not generated approximations.

Exact decimal range checks prevent rounding from hiding invalid OHLC bounds, negative part-to-whole weights, growing funnel stages or out-of-range gauge/radar observations. Supplied exact-string waterfall/treemap totals are checked against exact source contributions/children. Those exact relation calculations are bounded by the 20,000-character source-cell budget; omit a redundant parent/total value or use a table if incompatible extreme decimal scales cannot be verified. Geometry and parent/total relations also receive ordinary finite-domain validation.

The Data alternative includes exact raw observations and source row indexes; it does not silently sample or paginate away rows. The requested chart remains one plot, never a composite chart/data dashboard. Charts cannot recover precision that was already lost before the caller supplied a JavaScript number.

## Display behavior and limits

`showControls: true` and `showSource: true` are optional **top-level ViewSpec flags**, not fields inside `data`. Their defaults are false. `showControls` exposes the Chart/Data switch; `showSource` exposes the materialization summary. Mark focus/hover inspection, full category/graph keys and axis ranges remain available as intrinsic chart meaning. Stored provenance and exact data are retained regardless of resting chrome.

Measured CSS-pixel SVG sizing keeps text readable. Discrete long-label plots wrap complete labels and gain a scrollable extent instead of ellipsizing source identities or shrinking text. Continuous axes use spaced ticks without dropping observations; every supplied mark remains in the plot. Network/radar keys identify indexed marks with full names, and dense legends/long datasets can scroll within the chart.

Shared view limits still apply: 2 MiB per view, 5,000 ordinary points across at most four series. Additional bounded contracts are 200 graph/hierarchy nodes, 500 links, 12 hierarchy levels, 50 violin groups / 20,000 total actual samples, 50 proportion/funnel categories, 250 choropleth regions / 20,000 total vertices, 2,000 vertices per ring, and eight gauge thresholds. Structured charts do not accept unrelated binding fields or implicit row truncation. Unsupported, incomplete, cyclic, nonnumeric, out-of-range or impossible geometry fails validation; choose a suitable existing chart/table or supply the missing real source data.

See [data displays](data-displays.md) and the [template index](README.md).
