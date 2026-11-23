# Presentations

**Status:** Implemented native slide rendering and navigation; the original category notes below remain design context.

## Ordinary published slides — 0.3.0

`kanvas_call` with `operationId:"kanvas.presentation.navigate"` and nested `arguments` moves within the current presentation without requiring a saved deck. Supply `sessionId`, `displayId`, `expectedRevision`, `requestId` and `action:next|previous|first|last|goto`; `goto` requires zero-based `index`. The exact slides, source details and participation state are preserved. No content is regenerated. A duplicate request never advances twice; stale revisions, held displays and unauthorized callers fail. A next/previous at the end/start is a retained no-op. Explicitly selecting a saved deck remains `kanvas_call with operationId:"kanvas.presentation.cue" and arguments:{…}`.

## Implemented navigation — 2026-09-09

Prepared decks contain 1–64 validated leaf `ViewSpec`s, not arbitrary uploaded HTML or nested decks. A `kanvas_call` with `operationId:"kanvas.presentation.create"` and nested `arguments` / `kanvas_call` with `operationId:"kanvas.presentation.cue"` and nested `arguments` sequence displays the retained deck with its current index. Visible previous/next buttons require showControls or presenterPreview; keyboard navigation remains intrinsic where permitted. New decks exclude nested presentation/split-screen, monitor-stream, message-board and historical web leaves. For permitted keyboard contexts, Home opens the session overview and End returns to live content when not editing or scrolling. Input fields and video controls retain their own keyboard behavior.

Manual navigation sends the revision-bound intrinsic response `{"kind":"presentation.navigate","index":1}` and appears in the interaction inbox. The server still enforces editor access. Forms, polls, Q&A and checklists on the active slide use that same outer display revision; inactive slides cannot accept responses. Media/whiteboard readiness is forwarded from the actual active slide before it is reported applied.

The original category notes below describe the preparation concept; [schemas](../../src/shared/view-schemas.ts) define the implemented data contract.

## Cue cards and teleprompter use

Prepared decks may include `instructions` and one `cardInstructions` entry per slide. These remain private author guidance returned by `kanvas.presentations.list`, not text on the audience's view. Every card is an ordinary validated template: notes, bullets, diagrams or other supplied visuals. The listening agent cues retained zero-based indexes with `kanvas.presentation.cue`; it may move forward or back without regenerating content. Set `mirrored:"vertical"`, `"horizontal"` or `"both"` for the flip that matches your glass rig. `true` defaults to vertical (top/bottom only), `false` disables mirroring. Horizontal flips left/right; both rotates 180 degrees. Retained boolean decks now use the vertical default; choose horizontal explicitly to preserve the older result. Software transforms are tested, not physical glass calibration.

Kanvas does not listen, recognize speech, control client muting, or wake an idle agent. Automatic flipping requires a host that actually supplies live speech and a user-authorized listening agent following the authored cues. Test the real client's listen-only behavior before relying on it in a talk. Personal saved guidance can supply reusable cueing conventions.
