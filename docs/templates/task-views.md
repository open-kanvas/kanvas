# Progress and log views

## Progress

`progress` accepts `task`, optional `orientation` (`horizontal` or `vertical`), `status` (`running`, `completed`, `blocked`, `failed`), and up to 500 `events`. Every event has a unique `id`, `title`, ISO `timestamp`, the same status enum, and optional `description`. Cards retain full supplied text; the axis positions events proportionally in time and connects to readable, non-overlapping cards. Horizontal is the default. Large histories scroll.

```json
{"version":1,"template":"progress","data":{"task":"Prepare a release","events":[{"id":"source","title":"Source reviewed","timestamp":"2026-09-16T14:00:00Z","status":"completed"}]}}
```

Append with `kanvas_call` with `operationId:"kanvas.progress.append"` and nested `arguments`: `sessionId`, `displayId`, `expectedRevision`, `requestId`, `event`, optional overall `status`. A missing event timestamp uses server time. Earlier events remain; a retry of the identical request reuses its result. A stale revision, duplicate event ID or unauthorized target fails without partial changes. Use ordinary `patch` for an intentional correction. Prepared and browser-applied delivery remain distinct.

`timeline` is the static supplied-event alternative with `start`, optional `end`, lane and URL. Its continuous spine, points and duration marks are not a task-progress percentage.

## Log

Supply exactly one of `raw` (up to 200,000 characters / 2,000 lines) or `entries` (up to 2,000). Optional `source`, `startLine` (default 1) and `pageSize` (default 100, max 200) control presentation. Exact raw text is split only at newline boundaries; whitespace, decimal strings and line references stay intact.

Structured entries have `message`, optional `line`, `timestamp`, `level`, `flagged`, `annotation`. Levels: `trace`, `debug`, `info`, `warn`, `error`, `fatal`. Missing explicit line references use `startLine + index`. Duplicates are invalid. A flag is visually independent from severity.

```json
{"version":1,"template":"log","data":{"source":"Release check","entries":[{"line":101,"level":"info","message":"Exact source 9007199254740993.001"},{"line":102,"level":"warn","message":"Receiving browser pending","flagged":true,"annotation":"Check the waiting screen."}]}}
```

Clicking a permitted line sends a revision-bound `log.inspect` interaction containing its exact line/context. Read/acknowledge through the ordinary interactions tools. Search highlights while retaining surrounding lines; navigation does not rewrite published log data. A stale click cannot attach to a replacement view.

## Longer progress lists

`progress.data.layout` is `auto` by default: six or more events alternate around the centered axis when there is room. `alternating` explicitly requests the centered layout in either orientation; narrow vertical displays can scroll sideways to keep both sides readable. `single` preserves a one-sided timeline. Measured straight connectors attach each original event without overlap or invented milestones.
