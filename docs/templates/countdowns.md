# Countdown and elapsed-time timers

Renderer ID: `countdown`. The template supports countdown and open-ended count-up.

## Content contract

Omitting `direction` preserves the original down-counting behavior and data defaults. Both modes accept an optional `label`, which remains visible as the timer’s identity. They require a supplied, real ISO timestamp with an explicit timezone (`Z`, `+HH:MM` or `-HH:MM`); neither mode guesses “now” from prose or accepts `targetTime`.

| Direction | Required instant | Paused snapshot | Completion |
| --- | --- | --- | --- |
| `down` (default) | `endsAt` | `pausedRemainingSeconds`, 0–31,536,000 seconds | At zero, `completeText` (default “Time is up”) |
| `up` | `startedAt` | `pausedElapsedSeconds`, finite and nonnegative | None: elapsed time continues without a fixed end |

The directions are strict alternatives. Do not send `endsAt`, `completeText` or `pausedRemainingSeconds` with `direction: "up"`; do not send `startedAt` or `pausedElapsedSeconds` with the down direction. Count-up elapsed periods are not capped at one year; only the representable duration/date range of supported ISO years 0000–9999 bounds storage and resume arithmetic. No target/reminder or notification behavior is implied.

```json
{"version":1,"template":"countdown","data":{"endsAt":"2026-09-09T16:00:00+02:00","label":"Break ends in","completeText":"Welcome back."}}
```

```json
{"version":1,"template":"countdown","data":{"direction":"up","startedAt":"2026-09-14T10:00:00+02:00","label":"Time since launch"}}
```

```json
{"version":1,"template":"countdown","data":{"direction":"up","startedAt":"2026-09-14T10:00:00+02:00","label":"Elapsed working time","pausedElapsedSeconds":42.125}}
```

## Clock behavior

The viewer receives the server’s current time independently of submitted content. It anchors both modes to that snapshot and uses monotonic elapsed time (`performance.now`) between refreshes. Changing the receiving device’s wall clock does not jump the timer; throttled/background timers catch up from elapsed time instead of counting missed ticks. Submitted content cannot inject its own authoritative `serverNow` value.

Without a server-time snapshot, an unpaused timer displays a syncing state. A paused value is already a complete snapshot and does not need a running clock. Network transit still creates ordinary synchronization uncertainty; this is not a precision time-distribution protocol.

Down-counting displays round remaining seconds **up**, so zero is not shown before the actual deadline. Count-up displays round elapsed seconds **down**, so a second is not claimed before it has elapsed. Stored pause snapshots retain fractional seconds; they are never rounded to the visible integer. A future `startedAt` shows “Not started yet” and placeholders until the supplied start instant arrives. It does not silently switch into a countdown. Count-up never uses completion text, including at zero or after a long elapsed period.

## Pause and resume data

Publishing the matching pause field freezes that exact duration. For a down-counting resume, remove `pausedRemainingSeconds` and set `endsAt` to the authoritative resume time **plus** the stored remainder. For a count-up resume, remove `pausedElapsedSeconds` and set `startedAt` to the authoritative resume time **minus** the stored elapsed duration. This running anchor is adjusted to exclude time spent paused; it is not a record of the original event’s wall-clock start. Timestamp arithmetic uses millisecond precision and rejects out-of-range results rather than inventing a date or changing direction.

At zero, a paused down timer remains explicitly paused; an unpaused down timer is complete. A paused zero stopwatch is simply paused, not complete.

## Dedicated pause/resume control

Use `kanvas_call` with `operationId:"kanvas.timer.control"` and nested `arguments` for an existing timer. It calculates the exact fractional pause snapshot from authoritative server time and resumes from that stored snapshot directly. Read `kanvas_call` with `operationId:"kanvas.display.current"` and nested `arguments` immediately before a **new** action, then send its display revision and a new request ID:

```json
{
  "name": "kanvas_call",
  "arguments": {
    "operationId": "kanvas.timer.control",
    "arguments": {
      "sessionId": "SESSION_ID",
      "displayId": "DISPLAY_ID",
      "expectedRevision": 134,
      "requestId": "pause-workshop-1",
      "action": "pause"
    }
  }
}
```

For the subsequent resume, read the current revision again and send a new request ID with `"action":"resume"`. The HTTP equivalent is `POST /api/sessions/SESSION_ID/displays/DISPLAY_ID/timer-control`, with `expectedRevision`, `requestId` and `action` in the body. Existing editor/publish authorization and normal browser CSRF protection apply.

Retry a lost response with the **exact original request**, including its original revision and action. The durable principal/session/request identity returns the original publication receipt after a restart or later edits; it never calculates a new pause or resume time. Changing any input or reusing an ID from another operation yields `REQUEST_ID_CONFLICT`. Current authorization is checked even for retries. Delivery status is a fresh projection, so its elapsed wait or paint state can change while the stored receipt stays the same.

Each successful new action publishes one revision/generation and records the resulting view in display history. It preserves labels, metadata, actions and compatible audience responses. In a presentation it affects **only the currently selected timer slide**, leaving other slides unchanged. A `prepared` result means publication is durable, not that a browser has painted it: delivery remains pending/offline until the receiving viewer acknowledges that revision.

New actions reject held/ended/inaccessible displays, stale revisions and unsupported durations without changing the view. A new pause on an already paused timer returns `TIMER_ALREADY_PAUSED`; a new resume without a paused snapshot returns `TIMER_NOT_PAUSED`. A future count-up returns `TIMER_NOT_STARTED` when paused before its start, and a completed down timer returns `TIMER_COMPLETE`. These commands never restart a completed timer, silently change direction or create a deadline/start from missing content.

### Editing data directly

The pause fields are supported by both initial submission and `kanvas_call` with `operationId:"kanvas.display.edit"` and nested `arguments`. **`replace_data` replaces the complete `data` object; it is not a partial merge.** Sending only `{"pausedRemainingSeconds":1668}` omits required `endsAt` and must fail validation without changing the revision. An up timer similarly still requires `direction:"up"` and `startedAt`.

Prefer `kanvas_call` with `operationId:"kanvas.timer.control"` and nested `arguments` when the user asks to pause/resume. For another precise field change, `kanvas_call` with `operationId:"kanvas.view.patch"` and nested `arguments` updates a selected path such as `/data/label` or `/data/pausedRemainingSeconds` while preserving the remaining data. If deliberately using full-data edit, retain all desired data fields from the current view:

```json
{
  "name": "kanvas_call",
  "arguments": {
    "operationId": "kanvas.display.edit",
    "arguments": {
      "sessionId": "SESSION_ID",
      "displayId": "DISPLAY_ID",
      "expectedRevision": 134,
      "data": {
        "endsAt": "2026-09-14T12:30:00+02:00",
        "label": "Break ends in",
        "completeText": "Welcome back.",
        "pausedRemainingSeconds": 42.125
      }
    }
  }
}
```

Manual resume requires an atomic removal of the pause field **and** the adjusted start/end timestamp described above. Merely deleting the pause field restores the old running anchor and therefore includes time spent paused; the dedicated command performs both changes together.

## Display fit

Both directions share the large duration layout: a single row on wide displays, stacked time units on portrait displays, and a grid when days are present. Every unit is retained; long day counts shrink within their own cell instead of clipping or wrapping unpredictably. The supplied timer label and meaningful phase remain visible. Generic outer title/source metadata and start/end-time details require the normal explicit display flags; `showControls: true` exposes timer details without creating fake playback or stopwatch controls.

See the [template index](README.md), [authoritative view schemas](../../src/shared/view-schemas.ts) and [timer contract/arithmetic](../../src/shared/timer.ts).
