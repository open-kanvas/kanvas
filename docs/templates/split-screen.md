# Split screen

Several ordinary views on one screen, each in its own pane with its own CSS viewport. One publication and one history entry for the whole screen.

## Grid

`data.rows` and `data.columns` are each 1-4. Panes fill the grid row by row, so `panes.length` must equal `rows × columns`.

```json
{"version":1,"template":"split-screen","data":{"rows":1,"columns":3,"panes":[
  {"id":"left","view":{"version":1,"template":"fact","data":{"text":"One"}}},
  {"id":"middle","view":{"version":1,"template":"fact","data":{"text":"Two"}}},
  {"id":"right","view":{"version":1,"template":"fact","data":{"text":"Three"}}}]}}
```

When `rows`/`columns` are omitted: 2 or 3 panes form one lane (`direction: "vertical"` is side by side, `"horizontal"` is stacked), 4 panes form 2×2 and 6 panes form 2 rows of 3, as before 0.38.0. Any other count needs `rows` and `columns`. Giving only one of them derives the other.

## One level of nesting

A top-level pane may hold its own grid instead of a view: `{id, rows, columns, panes}`. Panes inside a nested grid cannot be split again.

```json
{"version":1,"template":"split-screen","data":{"columns":2,"panes":[
  {"id":"main","view":{"version":1,"template":"fact","data":{"text":"Left half"}}},
  {"id":"side","rows":4,"columns":1,"panes":[
    {"id":"a","view":{"version":1,"template":"fact","data":{"text":"1"}}},
    {"id":"b","view":{"version":1,"template":"fact","data":{"text":"2"}}},
    {"id":"c","view":{"version":1,"template":"fact","data":{"text":"3"}}},
    {"id":"d","view":{"version":1,"template":"fact","data":{"text":"4"}}}]}]}}
```

## Limits and identity

- At most **16 panes in total**, nested panes included, on every screen size.
- Pane ids are stable and unique across the whole screen, nested panes included.
- Patch one pane without resetting the others: `/data/panes/0/view` (or `/data/panes/0/view/data/...`), and for a nested pane `/data/panes/1/panes/2/view`. Pane ids, counts and the grid shape change only with a new submission. `direction` and `divider` can be patched.
- The existing total-view byte and node limits are shared by all panes.

## Phones and small screens

Every screen shows the authored grid; the tab fallback below 600 CSS px is gone. Many panes on a small screen are the person's choice: nothing blocks a layout below the cap, so choose rows and columns for the screen you publish to (for a portrait phone, `columns: 1`).

## Divider

Optional `data.divider`. Omitted, panes keep the standard 6 px gap and 1 px border.

| Value | Result |
| --- | --- |
| omitted | 6 px gap, 1 px border in the theme's muted colour |
| `"none"` | no gap and no border: content runs edge to edge while the panes stay separate |
| `{"gap": 0-64}` | gap in CSS px |
| `{"borderWidth": 0-16}` | border thickness in CSS px |
| `{"borderColor": "#rrggbb"}` | border colour |

The divider applies to nested grids too.

## Inside panes

Pane controls are display-only. Global navigation does not target a pane; zoom and the session text size apply to the whole screen; device privacy and lockdown apply to the whole screen. A tap inside a pane is reported as a place in the whole view with the pane id named (see [pointing](../sessions/pointing.md)). Pie and donut charts size themselves to the pane and put the key beside the plot when the pane is wider than tall, so a chart does not scroll inside a pane.
