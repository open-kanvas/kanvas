# Timeline

Runtime template ID: `timeline`.

A proportionally spaced temporal timeline with responsive chronological event lanes, points and duration bars.

## Contract and boundaries

Supply real date-only or timezone-qualified ISO timestamps, unique event IDs and end >= start. Up to 200 events. Each event has its own lane; time spacing is preserved while narrow displays stack readable cards without horizontal scrolling. Explicit vertical orientation uses metric vertical lanes when wide enough; dense content may scroll. Optional links are outbound source links, not fetched content.

Read `kanvas_discover` with `catalog:"templates", action:"get", id:"kanvas.template.timeline"` for `timeline` before constructing a prepared view. It returns the exact same schema used by `kanvas_call` with `operationId:"kanvas.view.validate"` and nested `arguments` and publishing.

## Illustrative example

```json
{
  "version": 1,
  "template": "timeline",
  "data": {
    "events": [
      {
        "id": "launch",
        "title": "Launch",
        "start": "2026-09-01",
        "lane": "Milestones"
      },
      {
        "id": "review",
        "title": "Review",
        "start": "2026-09-12",
        "end": "2026-09-14",
        "lane": "Milestones"
      }
    ]
  }
}
```

Examples are illustrative, not evidence. Shared source, security and delivery behavior is in [implemented rendering](../display/implemented-rendering.md). [Template index](README.md).

## Optional milestone progression

A timeline remains static unless `data.activeEventId` names a supplied event.
Each stable event ID may carry `visual`:

- `{kind:"image",url:"/api/assets/ID",alt:"Prototype",caption:"Optional caption"}`
- `{kind:"chart",data:{kind:"bar",series:[{name:"Measured",points:[{x:"Stage",y:3}]}]}}`
- `{kind:"flowchart",data:{nodes:[{id:"a",label:"Prototype"}],edges:[]}}`

Chart and flowchart data use their existing schemas. Charts must contain supplied
data, not dataset bindings. Image URLs may be public or session assets.
Account-library `/api/media` URLs are not accepted in progressive visual states:
their existing authorization grants are session-wide, not active-slot scoped.
Ordinary event card images remain supported. Protected session visual assets are
authorized to a paired display only while their milestone is active.

Use existing publication patch (`kanvas_publish` operation `patch`, canonical
`kanvas.view.patch`) with sessionId, displayId, requestId, expectedRevision, and:

```json
{"operations":[{"op":"timeline","action":"select","eventId":"prototype"}]}
```

Then `{"op":"timeline","action":"next"}`, `previous`, or `clear`. Only
select accepts/requires eventId. Next/previous use chronological start order;
equal timestamps preserve supplied order. Ends clamp. From static, next selects
the first event and previous the last. Clear restores the static overview.
An event without a supplied visual shows its description, never the prior image.

All operations reuse existing atomic patch validation, permissions, revision
checks, retry keys, delivery and history. Invalid batches leave the view unchanged.
A selection update does not resend or rebuild event content. There is no
autoplay, speech interpretation, local competing selection, or generated content.
Use the authoritative current view/revision after reconnect or a conflict.

Layout uses one elapsed-time scale across all event lanes. Duration bars and
point milestones remain distinct. Wide vertical orientation rotates that scale;
narrow screens stack cards with compact horizontal scales for readability.
Dense/long content scrolls instead of reducing text to unreadable sizes.
