# Now playing

`now-playing` is a passive music/audio information display. It presents supplied artwork, track and artist prominently, with an optional secondary album line and supplied playback position.

It is **not an audio player**: it cannot play, pause, skip, seek, connect to a service or look up a track. There are no transport controls, including when display controls are otherwise enabled. Use the [video template](video.md) for an actual supplied video playback surface.

```json
{
  "version": 1,
  "template": "now-playing",
  "data": {
    "track": "Open Water",
    "artist": "Ingrid Sol",
    "album": "Night Sessions",
    "artwork": {
      "url": "/api/assets/supplied-cover",
      "alt": "Supplied Open Water album cover"
    },
    "state": "paused",
    "elapsedSeconds": 72.5,
    "durationSeconds": 248,
    "observedAt": "2026-09-14T01:23:45+02:00"
  }
}
```

The example is illustrative. Replace its content and asset path with genuinely supplied information. Without artwork, omit `artwork` entirely: the layout gives the text more room, without inventing a cover or requesting one.

## Data contract

- `track` and `artist`: required meaningful strings, up to 500 characters each. Episodes/audiobooks can use their supplied title and speaker/author. Original text is preserved, not trimmed or treated as HTML.
- `album`: optional string, up to 500 characters.
- `artwork`: optional strict `{url, alt}` object. `url` is a safe public HTTP(S) URL or authorized `/api/assets/...` path, up to 2,048 characters. `alt` is up to 500 characters and defaults to an empty decorative alternative when absent. No generated artwork fallback is used. Actual loading/failure participates in the viewer's media-readiness gate; a failed replacement cannot be acknowledged as displayed.
- `state`: optional `playing`, `paused` or `stopped`. It is only the state reported by the source. Omitting it does not imply playing, paused or a connected service.
- `elapsedSeconds`: optional finite, nonnegative number.
- `durationSeconds`: optional finite, positive number. Both numeric fields accept fractions and values up to `Number.MAX_SAFE_INTEGER`, supporting long-form audio without a 24-hour wrap. Elapsed values greater than the supplied duration are rejected, never clamped.
- `observedAt`: optional timezone-qualified ISO source timestamp. It remains metadata, not a clock anchor. Set the view's `showSource: true` to display this exact observation time; it creates no default timestamp footer.

The root data object and artwork object reject unknown fields. Playback URLs, service credentials, controls and fetch instructions are not accepted.

## Supplied position only

A progress bar appears **only when both elapsed and total seconds are supplied**. With just one value, the view labels that readout as “Elapsed” or “Duration” without inventing the missing side or showing a progress bar. Zero elapsed is a real supplied value.

Fractional seconds remain visible, for example `72.5` → `1:12.5`; an audiobook position of `360005.125` → `100:00:05.125`. Accessible progress values retain the original numeric seconds.

Nothing ticks or extrapolates. A `playing` snapshot at 72.5 seconds still shows 72.5 seconds after a minute, device wake or server clock update. `observedAt` never advances it. To reflect a new source observation, publish a new snapshot or use a revision-bound view patch containing the actual new `elapsedSeconds`, `durationSeconds`, `state` and/or `observedAt` values. Do not run a publishing loop that merely estimates elapsed time.

Generic title/provenance chrome stays opt-in. Supplied track, artist, album and state remain useful content. Artwork is contained without cropping; long original names wrap in a bounded scroll region instead of shrinking to unreadable type or truncating.

See the [template index](README.md), [now-playing contract](../../src/shared/now-playing.ts) and [complete view schemas](../../src/shared/view-schemas.ts).
