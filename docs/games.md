# Supplied game and puzzle positions

`game-board` is a visual template (distinct from the retired historical `game` format), not a rules/game/network service. Publish a complete explicitly supplied position through `kanvas_call` with operationId `kanvas.publish`; read `kanvas.display.current`; mutate with `kanvas.view.patch`. Discover each exact operation schema before calling. Complete 15-preset catalog: chess, checkers, backgammon, go, reversi, poker, blackjack, solitaire, tic-tac-toe, connect-four, battleship, sudoku, crossword, word-search, sliding-tile. Presets initialize empty unless the agent supplies objects; the schema/sample catalog exposes an illustrative chess position, not a generated legal game.

## Stable state and patch

All game dictionaries have stable caller-chosen IDs. Cells use one-based `r1c1` coordinates (chess r1 is rank8); pieces have a cell, symbol, color, optional label and emphasis. Cells carry values, givens, candidate notes and emphasis. Cards refer to zones by ID and have explicit order. Zones have labels/badges/counters; counters and annotations are independently addressable.

Example atomic knight move plus capture:

```json
{"operationId":"kanvas.view.patch","arguments":{"sessionId":"session-id","displayId":"display-id","requestId":"knight-1","expectedRevision":3,"operations":[{"op":"set","path":"/data/pieces/knight/cell","value":"r6c6"},{"op":"remove","path":"/data/pieces/captured-bishop"}]}}
```

Add a piece/card/cell by setting its keyed object; remove via remove; flip/reveal by replacing the complete card object, reorder by its order field. Flip to unknown by replacing the face-up object with `{ "face":"back", "zone":"seat1", "order":0 }`: **do not keep rank/suit on backs**. The schema rejects that, as well as unsupported private/recipient fields. Updates validate the complete final state atomically; no chess move legality, scoring, solving or turn enforcement. Shared existing request/revision rules apply. Stable React piece nodes survive cell moves; unchanged object IDs are not regenerated.

History navigation can restore a retained revision using existing `display.navigate` revision + expectedRevisions. For hypothetical positions, create a distinct clearly labelled display, submit a copy with `positionLabel:"Variation — not live"`, and patch that display only. Keep the live display unchanged. No automatic branch/merge or simultaneous comparison API is added; snapshot/export/history retain their existing ACLs and limitations.

## Visibility boundary

`visibility:"public"` means **visible to every reader authorized for this session**, not Internet-public. There is no per-card/per-player filter inside a session. An unknown card back contains no secret value. Every label, ID, annotation, face-up card and all previous revisions may be read by authorized readers. Never put secret identities in IDs or labels. Private-card acceptance requires a separately ACL-isolated recipient session; do not treat two displays in the same session or CSS hiding as a privacy boundary. Recipient-isolation testing and its supported scope are tracked separately.

## Disable / rollback

Set `KANVAS_GAMES_ENABLED=false` and restart server to reject new game publications, patches, restores and nested game slides. Existing retained views remain readable/renderable; the flag does not delete data or hide already-authorized state. No migration or dependency changes. Reverting code preserves persisted JSON, but older clients lack this renderer; keep the renderer or re-enable/roll forward to recover display. Do not delete retained positions on rollback.

## Supported recipient-private workflow: separate sessions

Private game delivery reuses the existing server-enforced **session** boundary, not a new card ACL:

1. Trusted controller creates one private session per recipient, each with its own game display. Optionally create a third shared session for only community/public information. Do not enable public access or copy private recipient state into the shared session.
2. Pair each fresh receiving browser/profile to its exact recipient display; pairing approval is owner-controlled. Alternatively add a distinct player's full account as viewer of only its recipient session. Do not use the controlling full account in player browsers: that owner is intentionally authorized to every owned recipient session.
3. If delegating agent credentials, use selected-session token scope for the one recipient session. A fully authorized controller agent may publish separate complete states into both sessions; it is trusted with both hands by design.
4. Submit each view with **only information authorized for that recipient**. Own cards can be face-up; other players' cards must be identity-free unknown backs. No `privateCards`, recipient filters or hidden identities exist in the schema. `visibility:public` means public to that session's authorized readers, not anonymous Internet access.
5. Existing API/current/history/pins/snapshots/assets retain session ACLs. Paired screens have display-only access, cannot enumerate other displays/sessions/history or export snapshots. Browser streams recheck authorization and deliver content-free invalidations. Revocation denies subsequent access. The owner remains able to read both sessions.

No intra-shared-session secrecy is provided. Two full-account windows signed into the same owner are not two isolated players. No ACL can make a disclosed card secret again: replacing a face-up card with a back does not remove it from retained history, snapshots, previously delivered data or a viewer's memory. Only publish information the session audience may retain. When changing participants, create a fresh session; do not reuse a session containing another recipient's historical secrets. This is not a game server or inter-agent networking service.

Automated evidence tests real paired-cookie API reads/denials, selected-session tokens, full-account owner access, cross-session history/snapshot/receipt denial, content-free events and revocation. Actual hardware/PWA receiving acceptance and live MCP connection remain separate manual checks.

Narrow agent patch payloads and keyed DOM updates reuse existing delivery: receiving clients still fetch an authorized complete view after invalidation. This increment does not add a delta-only delivery protocol.

## Preset layouts and supplied data

- Chess/checkers: 8×8 squares; recognizable Unicode chess pieces or contrasting discs.
- Backgammon: two rows of 12 points plus bar/off columns. c7=bar and c14=off, c1–6 and c8–13 are points; top labels24–13, bottom1–12. Piece `stack` is an explicit count badge; dice/counters supplied, never rolled or calculated.
- Go: 19×19 intersections; Reversi:8×8 green board.
- Poker/blackjack/solitaire: agent-labelled zones, ordered cards, unknown backs. Solitaire uses a stock/waste/foundation plus seven columns in its example; zone cardinality is configurable, not a gameplay rule.
- Tic-tac-toe:3×3; Connect Four:6×7 disc slots.
- Battleship:10×20 cells split after c10: left own board, right known shots. **Only authorized supplied visible information**; opponent ships are omitted, not hidden in DOM. For recipient-private boards use separate sessions.
- Sudoku:9×9 with3×3 boundaries, supplied givens/notes. Crossword and word search:10×10, numbered/blocked/letter cells and annotations for supplied clues/ranges.
- Sliding tile:4×4, stable tile objects; blank is an unoccupied cell.

Dimensions are deliberately fixed reference presets in this increment; configurable board dimensions, animation, automatic layout of overlapping stacks, rule validation and game engines are not implemented. Overlapping pieces are allowed as visual state, not validated as legal moves. Custom text/symbols are bounded. All examples are illustrative agent-supplied positions, not full playable games.

The shared400-piece bound accommodates all361 intersections of a fully supplied19×19 Go position. Solitaire cards are laid out without overlapping their identities; long columns scroll. Reverting J2 preserves later-preset JSON, but J1-only clients cannot render the ten added presets; roll forward to restore them.
