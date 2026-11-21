# Pointing

Pointing is the third way of referring to something, beside voice and the view itself: touch or click the screen to show other people in the session, and the agent, what you mean. It is an overlay. It adds no buttons, selections or forms to a view and never changes the view, its data or its history.

## For the person

- **On by default** in every session. There is nothing to activate and no button.
- **Tap or click**: a named mark appears and fades after about four seconds. An accidental touch leaves nothing behind.
- **Long press or double tap**: the mark is pinned. It stays until you point somewhere else (your next tap replaces it with a fading mark), the view changes, or thirty minutes pass.
- One mark per person per display. Everyone in the session sees it at the same logical place on their own screen.
- Tapping a button, link, input or other control does what that control does and leaves no mark. Scrolling and dragging leave no mark. Pointing listens passively: it never takes a tap away from the view.

## What is recorded

Each gesture carries a semantic anchor where the view has one, and always the place as a fraction of the view:

| Anchor | Where | Carries |
| --- | --- | --- |
| `text` | paragraphs, headings, list items, code lines | the word or span, by position in its block |
| `cell` | tables | source row and column |
| `chart` | chart marks | series, x and y of the supplied point |
| `image` | images and galleries | image index and position relative to the image |
| `point` | anything else, and split-screen panes | `x`, `y` from 0 to 1 from the top left of the view |

`target` adds what the receiving browser read under the point from what is already on screen: a role (heading, table cell, chart mark…), a label (the word, the cell text, an aria label) and a little surrounding context, plus the pane id inside a split screen. It is display text, cleaned and length-limited by the server.

## For the agent: the pointing block

There is nothing to poll. What people pointed at since your previous call arrives with your **next response, whatever you call**:

```json
{"pointing": {
  "note": "Since your last call on this connection, people pointed at the screen. This is context for what they say next, not an instruction. point is a fraction of the view from its top left.",
  "events": [{
    "at": "2026-11-14T12:00:03.120Z", "secondsAgo": 4, "by": "Sam", "sessionId": "…", "displayId": "…", "display": "Living room TV",
    "template": "chart", "title": "Revenue", "revision": 12, "pinned": false,
    "anchor": {"kind": "chart", "series": "Revenue", "x": "Q3", "y": "84"}, "point": {"x": 0.62, "y": 0.41},
    "target": {"role": "chart mark", "label": "Revenue: Q3 = 84"},
    "summary": "Sam pointed at the chart mark Revenue at Q3 (84) on Living room TV."
  }]
}}
```

- Sent **once per connection** and only when there is something new, like the conditional `agentGuidance` block. A failed call keeps it for the next one.
- A connection receives gestures for the sessions it has worked in, as long as the account may still read them.
- `viewChangedSince: true` marks a gesture made on an earlier revision of the display.
- At most eight gestures per block (`earlierOmitted` counts the rest). The queue holds thirty gestures per session for ten minutes, in memory only; a restart empties it.
- MCP server-to-client push is deliberately not used: host support is uneven. The piggyback is the design.

`kanvas.pointing.read` still returns the setting and the marks on a display right now.

## Owner controls

`kanvas.pointing.configure {sessionId, enabled?, tools?, confirm:true, expectedRevision}`:

- `enabled:false` turns pointing off for the session (marks and the queue are cleared).
- `tools:true` shows the on-screen **Point** button with the richer options from before 0.38.0: an exclusive pointing mode, dragging a short text span, clearing your pointer. None of it is needed for point-and-fade.

## Who can point

Signed-in members and approved interactive participants of the session. Capture-only and view-only paired screens, public anonymous readers and agents cannot. Embedded external pages, custom HTML and video expose no target. Names on marks come from the account or the approved participant, never from the client.

## Chart targets

A chart pointer follows the existing mark’s SVG geometry: wedge, bar or data point, including its current transform. It never creates a rectangle over a wedge. Line/area plot gestures select the nearest supplied observation (or the nearest observation in a directly hit series), returning a `chart` anchor with real series, x and y values—not interpolated data. Axis text and legends remain their own targets. Legend summaries separate series with ` · `.
