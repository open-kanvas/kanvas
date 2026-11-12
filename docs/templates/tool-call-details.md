# JSON raw view and tool call details

**Status:** Implemented in 0.37.0.

## JSON: `view: "raw"` (default) or `"tree"`

`raw` shows pretty-printed JSON text with indentation, syntax colours and line numbers. Every token is the source token: large integers and exact decimals are not re-encoded; only whitespace between tokens changes. `tree` is the collapsible tree viewer, where `expandedDepth`, `expandedPaths`, `collapsedPaths` and `query` apply. There is no automatic switching; the agent and the person choose.

Compatibility: a JSON view stored before 0.37.0 has no `view` field and now opens as raw text. Send `view: "tree"` for the previous look.

## `tool-call-details`

One tool call in full: request on the left, response on the right, stacked on narrow screens.

- Header: `tool`, `integration`, `status` (`success`, `error`, `running`), `durationMs`, `timestamp`.
- `request`: the arguments as exact JSON source text. `response`: the result as JSON source, or `responseText` when it came back as plain text.
- `error {code, message}` is shown prominently under the header.
- `view`: `raw` (default) or `tree`, for both panes.
- `highlight {pane, path, note}` marks one field by JSON path, for example `$.items[0].start` with the note "this argument was wrong" (raw view).
- Long content is cut on screen after 60 lines per pane unless `expanded` is true. The full content is always stored and returned by `kanvas.display.current`.

Opening this view by selecting a row in `tool-call-log` is not part of this release; the agent publishes it.
