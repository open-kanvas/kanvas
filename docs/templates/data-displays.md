# Data display

**Status:** Accepted and implemented category. The September 14 source adds the requested chart families; final release evidence belongs in the batch implementation report.

## Implemented layouts

Time series, bars/ranking, histogram, scatter, heatmap, box, candlestick, OHLC, area, violin, radar, network, treemap, Sankey, bubble, choropleth, pie, donut, gauge, funnel and waterfall, plus the separate data-table template. See [chart types and source contracts](chart-types.md) for the field roles and requirements of each kind.

## Core information

Values and field roles; units, labels, dates and provenance.

## Category notes

**One chart per view:** show one clear relationship at a time. A requested comparison across views can use a presentation or separate displays; adding chart families is not a dashboard-composition feature. This follows the September 14 feedback and supersedes the earlier allowance for two to four graphs in one surface.

External, internal and illustrative data use the same category. The connected agent supplies the exact source; an explicitly started [monitoring job](../README.md) can refresh a declared public source. Numeric bindings preserve original values and identify transformations. Financial/distribution/flow/geometry charts need their actual field roles, scales or coordinates; names alone are not a source. Equations remain a separate future consideration.

## Tables

The `table` template is a complete reading surface, not an automatically filtered summary. All supplied rows remain available through pagination and an inner reading scroll region; the 51-row tool-list case must include its final row. `data.pageSize` retains the existing 1–100 range and defaults to 12. Headers, long identifiers and cell contents wrap without shrinking live text below a readable size; wider column sets scroll inside the table, not the whole page.

Plain headers and data are the default. Set the **view-level** `showControls: true` only when table filtering, sorting and a reset action are wanted. Intrinsic Previous/Next navigation remains available without this flag. `showSource: true` displays an actual supplied `data.summary`; absent summaries do not create empty source or information controls.

Original strings, whitespace, decimal precision, booleans and row order are retained. Boolean cells show `true`/`false`; null cells have a distinct, accessible empty-value marker, not a zero or an empty string. Optional sorting does not coerce numeric-looking strings through floating-point numbers: strings sort as text, numbers numerically. The stored dataset is never edited by pagination, filtering or sorting.

A metadata-only update preserves the current page and requested utilities. Changed cells clear stale filtering/sorting while retaining or clamping a plain reading page; a different dataset or column set starts at the first page. Turning controls off also clears their projection, so an invisible filter cannot hide newly requested data.

See the [template index](README.md) for shared planning boundaries and related categories.
