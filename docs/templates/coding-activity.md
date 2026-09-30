# Coding

**Status:** Accepted category; individual layouts and implementation details remain exploratory. Planning only, not a committed feature list.

## Implemented display — 2026-09-09

`code` supports source, before/after diff, file tree and supplied tool status layouts. Original code is rendered as inert text with bounded syntax highlighting; it is never executed. The code renderer is in the initial client module graph, so first display does not depend on a later lazy code-chunk fetch. Readiness follows the actual rendered component and remains separate from a server “prepared” response. Renderer failures and pending-delivery deadlines are reported through the display delivery path.

The historical report did not retain enough browser diagnostics to prove why that specific hosted code view failed. Regression coverage verifies the explicit prepared-code path and browser application, not an invented reconstruction of the old failure. See the [schemas](../../src/shared/view-schemas.ts) and [implemented rendering](../display/implemented-rendering.md) for literal-source interpretation and current limits.

## Candidate layouts

Highlighted diff, active-file view, file/code structure, tool-activity summary.

## Core information

File paths, changed code, structural context, current tool calls and status.

## Coding: brief category notes

These coding layouts are independent templates; select an explicit code template with exact supplied source.

The user identifies coding-agent work as a major use case, mentioning agents such as Claude Code and Codex as examples, not verified integrations. KANVAS should make it easy to follow and inspect work as it happens:

- Show the file currently being updated and the relevant code section.
- Highlight the agent's diff so additions, removals, and changes are immediately visible.
- Show file/project structure or code structure for orientation.
- Summarize active tool calls and their status alongside the changes.

Aim for an interactive, real-time view of coding work. Interaction behavior, layouts, and integration mechanisms are intentionally deferred; the user requested category-level notes only. No claim about competing products' capabilities has been verified.

See the [template index](README.md) for shared planning boundaries and related categories.
