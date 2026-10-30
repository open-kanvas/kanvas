# Calendars and schedules

Accepted in the 2026-09-09 feedback scope; renderer ID `schedule`.

## Content contract

Required fields are `date` (`YYYY-MM-DD`), `timeZone` (a supported IANA zone such as `Europe/Oslo`), and `events` (0–500). `view` is `day` (default), `week`, `month`, `months` or `year`. A week begins on the Monday containing the supplied date; it is not tied to the receiving device’s current date.

Each event is `{id, title, start, end, location?, description?, allDay?, color?}`. IDs are unique. `start` and `end` are real ISO timestamps with an explicit UTC offset; end must follow start. `allDay` defaults to `false`, and optional colors are six-digit hex values.

Events are sorted by start instant and displayed in the supplied timezone, including daylight-saving changes. Overnight events appear on each overlapping day. An event ending exactly at midnight does not occupy the following day. Week columns become a vertical day list on narrow surfaces. Events outside the visible period are counted explicitly.

```json
{"version":1,"template":"schedule","data":{"date":"2026-09-09","view":"day","timeZone":"Europe/Oslo","events":[{"id":"workshop","title":"Workshop","start":"2026-09-09T10:00:00+02:00","end":"2026-09-09T11:30:00+02:00","location":"Studio"}]}}
```

## Boundary

This displays supplied events and bookings. It does not fetch a calendar provider, reserve rooms, create bookings, or interpret timezone-less times using a device-dependent guess.

See the [template index](README.md) and [authoritative schemas](../../src/shared/view-schemas.ts).

## Month and year overviews

`view: "month"` renders every real day of the supplied month as a Monday-first grid, with exact supplied timezone-aware events in their day cells. `months` shows1–12 months beginning with the supplied date's month, controlled by the optional months field; `year` shows January–December. Optional eventStyle selects detailed/compact events, and a supplied legend can explain source colors. Day and week remain supported. `date`, `timeZone` and `events` are still explicit source fields; no events are inferred from a calendar image. For a genuinely bespoke visual, see [static HTML](html.md).
