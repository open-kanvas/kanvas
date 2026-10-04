# Drafting and dictation

`drafting` is a mutable note, email, message or other draft. Unlike [`transcription`](transcription.md), it is intended for review and revision, not a chronological record of speech.

## Content contract

The draft text is the dominant, responsive reading surface. Supplied `status` is `drafting` (default), `reviewing` or `ready`; optional `purpose` is a short destination/purpose hint, not a delivery address or an integration. Neither field means a microphone is listening or a message has been sent.

`data.text` is required and may initially be empty. It accepts up to 100,000 UTF-16 units; repeated spaces, line breaks, Unicode and markup-like strings remain exact, inert text. The shared whole-view size/complexity limits also apply.

```json
{
  "version": 1,
  "template": "drafting",
  "data": {
    "text": "Thank you for the update.\nI will review the proposal tomorrow.",
    "purpose": "Email draft",
    "status": "reviewing",
    "suggestions": [
      { "id": "timing", "start": 53, "end": 61, "replacement": "on Friday", "reason": "Make the timing specific" }
    ],
    "focus": { "start": 53, "end": 61, "label": "Review the timing" }
  }
}
```

`suggestions` contains at most 100 unique-ID, non-overlapping `{id, start, end, replacement, reason?}` spans. `focus` is an optional `{start, end, label?}` highlight for agent-directed navigation; it may overlap a suggestion. Offsets are zero-based UTF-16 positions, with an exclusive `end`, in the **exact current** `data.text`. A span is 1–4,000 units and cannot split a surrogate pair. Replacements are up to 4,000 units; an empty replacement proposes a deletion. Reasons are up to 500 characters, purpose/focus labels up to 160. These remain proposals; displaying one does not edit the text.

## Incremental updates

Create the draft through `kanvas_tool_use` with `operationId:"kanvas.submit"` and nested `arguments`. Append each supplied text chunk through the same tool with `operation: "patch"`, using the current display revision and a stable request ID for retries:

```json
{
  "operation": "patch",
  "sessionId": "SESSION_ID",
  "displayId": "DISPLAY_ID",
  "requestId": "draft-chunk-2",
  "expectedRevision": 1,
  "operations": [
    {
      "op": "appendText",
      "path": "/data/text",
      "value": "\n\nPlease share your thoughts."
    }
  ]
}
```

`appendText` adds exactly the supplied string, with no inserted separators. Use a new request ID and the returned revision for the next chunk. A retry must repeat the original request unchanged. To revise wording, `set` `/data/text` and update/remove affected suggestions and focus in the **same** patch; only the final complete view is accepted. For a drafting slide, target `/data/slides/INDEX/data/text` and the corresponding leaf fields.

Chunk latency depends on the upstream app. Some voice hosts deliver only completed turns; others may expose partial text. KANVAS displays whichever chunks the authorized publisher supplies. It does not capture speech, manufacture interim words, or make an idle host agent run continuously.

## Review interaction

An agent can locate a referenced passage in the current draft and set `focus`; the span is highlighted precisely. Suggestions expose their exact source and proposed replacement. There are no binary accept/reject controls.

A contributing viewer can tap a passage, activate it with Enter/Space, or select a more precise range. Pointer/keyboard selection shares the passage; **Review selected text** also supports touch selection handles. **Review this passage** on a suggestion shares that suggestion's source range. These actions create a `drafting.select` item in the existing interaction inbox; they do not edit, accept a proposal, record audio, or send the draft externally.

Feedback includes the originating display revision, `textPath` (including the visible presentation slide), exact `start`/`end`/`text`, and interaction method. Suggestion details come from the authoritative displayed view, not client-authored replacement text. Authorization, request-id idempotency, inbox limits and acknowledgement reuse the ordinary interaction path. An interactive pairing can contribute; a view-only pairing cannot. Stale revisions, off-screen leaves, out-of-range spans and source-text mismatches are rejected.

When new text arrives, the display follows the bottom only while the reader is at the end. Scrolling up, focusing a passage or selecting text pauses following. Exact append operations preserve native selection nodes. New agent focus does not pull a reader away from manual review; **Go to highlighted passage** and **Follow latest** are deliberate navigation choices. A submitted selection retains its originating revision and is not silently retargeted to a newer revision.

Saving or sending the completed draft belongs to an explicitly authorized external tool. `ready` is a drafting state, not a delivery receipt.

See the [template index](README.md), [shared drafting schema](../../src/shared/drafting.ts) and [display contract](../../src/shared/view-schemas.ts).
