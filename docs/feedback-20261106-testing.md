# 0.36.0 DEV testing guide

Use a disposable DEV session. Refresh old receiver tabs after the deployment; browser/client release should be 0.36.0. Production and the website are outside this round. Do not change real feedback reports while testing.

1. Send legacy text and rich title/description/icon/time toasts together. Check local HH:mm, stacking, dismissal and one broken icon; display content/history must not change.
2. Show a QR with a short title/caption on portrait phone and desktop; code and caption fit with a clear quiet zone.
3. Lock a test device. It says “Kanvas is locked on this device. Ask your agent to unlock.” Unlock through the still-supported account/device workflow.
4. In isolated operator evidence, compare housekeeping with actual publications/failures: successful API/auth polling and heartbeats do not create rows, while actual browser mutations (including uploads), operations and failures do. Historical rows remain identical.
5. Show black and white Connect Four discs on dark/light themes; empty slots are visibly distinct.
6. Show chart/document in two vertical panes; change to horizontal, then four/six mixed views. Patch one child, preserving the other's scroll/state. Resize/rotate; phone selector keeps one readable pane. Delayed media in a hidden pane must complete before paint acknowledgement. No nested splits. Server-backed responses/editing are disabled; live overview/grid/topology use preview presentation and should be opened full-display for live data.
7. Navigate a 3-page table to first/middle/last. Agent read/control reports pages 1/2/3; explicit pageIndex is 0/1/2; no new publication history.
8. Inspect new session serverVersion, raw-event properties.serverVersion, page meta release and each registered window's clientVersion. Existing sessions lacking release metadata remain unknown.
9. Discover feedback.submit: no category is advertised or required. Historical categories remain retained; do not submit synthetic reports into real accounts.
10. Home no longer has “Account & console”. Direct /console?account=sessions still opens Signed-in browsers for account/device recovery.
11. Reconnect a real standard OAuth client with email confirmation. Email tab first confirms approval, then shows Connected only after the original tab approves the actual grant. Original tab returns through the exact callback. Confirm next-step/close guidance, and that the email-opening browser is not silently signed in. This real-client focus/callback check remains owner testing; isolated browser tests cannot certify Claude/ChatGPT acceptance.
12. Publish database-schema columns for multiple tables (12+ columns in one), explicit declared and inferred relationships. All columns remain visible/scrollable; endpoint links navigate to exact columns; solid/dashed relationship lines differ. Resize to phone. No SQL execution is involved.
13. Display the same checklist in two windows/displays. Save-only checklist.update changes both without a new history entry; replace another display with different content, then update the checklist and verify that newer content wins. Nested checklist panes/presentation snapshots are not live document bindings.
14. Inspect overlapping solitaire cards: face-up corner rank/suit remains legible; backs reveal neither. Long stacks scroll.
15. Show weather without temperature/place, then eight details. Toggle individual display fields and visualOnly; hidden fields remain in readback, scene continues and reading content stays above the horizon.
16. Flip chess/checkers/Go-style boards. Visual orientation changes; canonical cell and friendly coordinate readback remain the same. Cards are not flipped by this option.
17. Browse/publish offered signage: every offered type uses the reviewed licensed mapping. Retired original types are absent; historic source is preserved and displays an unavailable state rather than substitute art.
18. Show a 5-fret board fitting phone width, then 24 frets with readable overflow. Check physical 3/5/7/9 and double-12 markers with capo and left-handed orientation.

One app PR covers these 18 reports. Website report 6f93a24b-d317-48e9-88ab-2b829e465d76 is explicitly a separate follow-up, not implemented or deployed here. The 63 unchanged older active reports are reconciled separately; this release does not revive ASL or console-retirement work.
