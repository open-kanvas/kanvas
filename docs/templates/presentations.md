# Presentations

**Status:** Implemented native slide rendering and navigation; the original category notes below remain design context.

## Ordinary published slides — 0.3.0

`kanvas_tool_search for "control"` / `kanvas_tool_use with operationId:"kanvas.presentation.navigate" and arguments:{…}` moves within the current presentation without requiring a saved deck. Supply `sessionId`, `displayId`, `expectedRevision`, `requestId` and `action:next|previous|first|last|goto`; `goto` requires zero-based `index`. The exact slides, source details and participation state are preserved. No content is regenerated. A duplicate request never advances twice; stale revisions, held displays and unauthorized callers fail. A next/previous at the end/start is a retained no-op. Explicitly selecting a saved deck remains `kanvas_tool_use with operationId:"kanvas.presentation.cue" and arguments:{…}`.

## Implemented navigation — 2026-09-09

Prepared decks contain 1–64 validated leaf `ViewSpec`s, not arbitrary uploaded HTML or nested decks. A `kanvas_tool_use` with `operationId:"kanvas.presentation.create"` and nested `arguments` / `kanvas_tool_use` with `operationId:"kanvas.presentation.cue"` and nested `arguments` sequence displays the retained deck with its current index. Authorized presenters have built-in previous/next buttons and arrow/Page Up/Page Down/Home/End navigation. Input fields and video controls retain their own keyboard behavior.

Manual navigation sends the revision-bound intrinsic response `{"kind":"presentation.navigate","index":1}` and appears in the interaction inbox. The server still enforces editor access. Forms, polls, Q&A and checklists on the active slide use that same outer display revision; inactive slides cannot accept responses. Media/whiteboard readiness is forwarded from the actual active slide before it is reported applied.

The original category notes below describe the preparation concept; [schemas](../../src/shared/view-schemas.ts) define the implemented data contract.

## Candidate layouts

Prepared HTML slide sequence, selected slide on cue.

## Core information

Prebuilt content, structure/order, and presenter-requested selection.

## Category notes

Unlike organically evolving conversation displays, the presenter usually prepares content, topics, and structure beforehand, potentially by talking it through with the agent. Build and retain adaptable **HTML slides** in advance. During delivery, the user cues the agent to show an already-prepared slide, aiming for immediate display rather than regenerating it. This is its own preparation-and-delivery workflow; how authoring, slide selection, and commands work will be explored later. For the initial pure-MCP version, the agent cues prepared content through MCP tools, while ordinary updates likewise use MCP submissions. Observer-based delivery is deferred under D29.

See the [template index](README.md) for shared planning boundaries and related categories.
