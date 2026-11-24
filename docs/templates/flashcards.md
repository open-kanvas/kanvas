# Voice-first flashcards

Publish a plain-text deck unchanged, or add promptVisual / answerVisual. Each card retains id, prompt, answer and optional acceptedAnswers. The large passive card has compact accessible position progress, no answer form or previous/reveal/next/restart buttons. A connected agent uses kanvas.flashcards.control. Revealed grading is a green check / red cross with accessible labels; reference answers remain visible (including incorrect responses), and the grading-method explanation stays in tool/help documentation rather than the card.

```json
{"version":1,"template":"flashcards","data":{"cards":[{"id":"shape","prompt":"What kind of flowchart node is this?","answer":"Decision","promptVisual":{"kind":"diagram","data":{"nodes":[{"id":"decision","label":"Yes or no?","shape":"decision"}],"edges":[]}}}]}}
```

An image visual uses {kind:"image",url:"https://example.com/image.png",alt:"Meaningful description"}, or an authorized protected asset URL. Diagrams reuse flowchart schema/rendering (box/decision/terminal shapes, bounded nodes/edges, optional safe images). No HTML, scripts or arbitrary component trees. Card encoded-byte and whole-view limits still apply; image references require normal session asset permissions.

Read saved deck state and current display revision. Supply current cardId, including for restart. expectedRevision and expectedDeckRevision are independent optional stale-write guards, recommended after reading current state. Supplied stale guards fail. Use grading:exact only for normalized string equality, self with explicit correct for user/agent assessment, or none for ungraded responses. Restart resets the whole deck and ignores cardId because a shared display can lag the saved deck’s current-card identity. It honors supplied revision guards, holds and ACLs, and deduplicates exact requestId retries. Restart ignores the card identity comparison, not the structural cardId requirement.
