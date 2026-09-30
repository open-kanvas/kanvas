# Independent displays per session

Planning only; interfaces and implementation choices remain provisional.

## Multiple displays per session

The user also wants the inverse of multi-participant collaboration: one user/agent session can connect to a configurable number of display surfaces at once. Different displays can show different content—for example, data on one meeting-room screen and quick facts on another, or four to six screens supporting one data-analysis session. This is not limited to mirroring a single view.

Keep session identity separate from display identity so content can be directed to the intended surface. Display assignment, per-screen state, and any coordination between updates are future design questions; no fixed maximum or routing protocol is selected. This is an architectural capability, not another template category or a full-dashboard product. The preference for a focused visual (or a few related views) applies to each screen, not a global limit on the number of screens in a session.
