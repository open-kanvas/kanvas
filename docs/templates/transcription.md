# Transcription

Accepted in the 2026-09-09 feedback scope; first-class renderer ID `transcription`.

## Content contract

`data.segments` contains 1–1,000 ordered `{id, text, speaker?, timestamp?}` entries. IDs must be unique. Each text is at most 20,000 characters; speaker labels are at most 200 characters and timestamp strings at most 60. The complete view still has the shared 2 MiB/complexity budget.

Text, repeated spaces, line breaks, speaker labels and timestamp lexemes are retained. A timestamp such as `00:01:02.000001` is displayed exactly; the renderer does not round it, convert it to a wall-clock date, or manufacture missing speaker/timing information.

Optional `language` labels the supplied text. `status` is `complete` (default) or `live`; the latter labels the view “Updating transcript” and exposes additions as an accessible log. A publisher sends subsequent source segments through the normal revision-bound publishing path.

```json
{"version":1,"template":"transcription","data":{"language":"en","status":"complete","segments":[{"id":"line-1","speaker":"Alex","timestamp":"00:00.000","text":"Keep the original words."}]}}
```

## Boundary

This displays supplied transcripts. It does not capture microphones, join meetings, identify people from audio, or implement speech recognition. Those capabilities must not be inferred from `status: "live"`.

See the [template index](README.md) and [authoritative schemas](../../src/shared/view-schemas.ts).
