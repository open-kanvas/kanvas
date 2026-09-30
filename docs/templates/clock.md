# Clock

`clock` shows the current time. It has no target or start time and is distinct from a [`countdown`](countdowns.md) or [`schedule`](schedules.md).

The default is one large, clean clock in the receiving browser’s local time zone. No external time service, network request or user control is needed for ticking.

```json
{"version":1,"template":"clock","data":{}}
```

## Options

- `timeZone`: optional validated IANA zone, such as `Europe/Oslo`, `America/New_York` or `UTC`. Omit it for browser-local time; a numeric offset is not a time zone.
- `label`: optional meaningful primary label, at most 120 characters. A supplied label is kept exactly. Without one, an explicitly configured primary zone identifies itself; an unconfigured solo clock needs no label.
- `hourFormat`: `24h` (default, hours 00–23) or `12h` with the locale’s AM/PM marker and ordering.
- `showSeconds`: `false` by default. Enable it for a seconds-resolution clock.
- `showDate`: `false` by default. Enable it to show each clock’s actual Gregorian date in its own zone, formatted for the viewer’s language.
- `zones`: up to **two additional** `{timeZone, label}` clocks, for a maximum of three clocks total. Each requires an explicit meaningful label. Duplicate explicit zones, including IANA aliases, are rejected.

```json
{
  "version": 1,
  "template": "clock",
  "data": {
    "timeZone": "Europe/Oslo",
    "label": "Arendal",
    "hourFormat": "24h",
    "showSeconds": true,
    "showDate": true,
    "zones": [
      { "timeZone": "America/New_York", "label": "New York" },
      { "timeZone": "Asia/Tokyo", "label": "Tokyo" }
    ]
  }
}
```

The primary time gets the largest type. Its localized digits and period marker are measured against the actual free display area; comparisons remain secondary. Supplied labels wrap rather than being truncated. Generic title/source chrome follows the ordinary explicit display flags.

Dates and relative-day labels remain clear of device safe areas and the display-menu target. A real illustrative-data qualification participates in the clock layout; clocks without that qualification do not reserve an empty footer. The active clock's display menu is at the top-right, with long optional headings and presentation navigation kept separate.

All clocks use **one current instant**, so comparison clocks cannot tick out of step. IANA/`Intl` rules handle daylight-saving transitions, half/quarter-hour offsets, leap days and local date changes. If dates are hidden but a comparison falls on another calendar day, a short “yesterday”/“tomorrow” qualification keeps that comparison unambiguous.

## Live timing

The viewer uses its existing `serverNow` snapshot when available, deriving an anchor/offset at receipt. Ordinary ticks recompute the instant from monotonic elapsed time; they never increment a displayed second counter. A visibility/pageshow wake recomputes immediately and can recover device-sleep time when a browser’s monotonic clock was suspended. A newer server snapshot replaces the local anchor. The timestamp is not an NTP round-trip measurement.

Without a valid server snapshot, the clock uses the browser’s current wall time. This still supports a local or configured zone; it does not manufacture a synchronization claim. Preview thumbnails render a current sample without running their own background timer.

Use a normal revision-bound view patch to change zone labels or display options. No per-second publishing loop is necessary. Do not pass `now`, `time`, `endsAt` or other frozen timestamp fields in `data`; this template is a live clock, not a historical instant or timer.

See the [template index](README.md), [clock contract](../../src/shared/clock.ts) and [complete view schemas](../../src/shared/view-schemas.ts).
