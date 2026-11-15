# Testing 0.38.0 (November 14 feedback)

Steps for the owner on DEV, by voice with a connected agent unless stated. Each step names the report it closes. What changed and why: [0.38.0 changes](feedback-20261114.md).

Check first: `/version.json` says `0.38.0`.

## 1. Live monitor stream (`5dc1b2f7`, `6e97c8aa`)

1. "Create a monitor stream called Build agents and show it live on this screen." The agent creates the stream and publishes the `monitor-stream` template. The screen shows **Live**, the counters at zero and "Waiting for the first event."
2. From a terminal, with the address the agent gave: `curl -s -o /dev/null -w '%{http_code} %header{x-kanvas-stream}\n' -X POST -H 'Content-Type: application/json' -d '{"source":"agent-1","event":"PreToolUse","tool":"Bash","target":"sleep 5","callId":"c1"}' "$URL"` → prints `202 1`. A row appears within a second, marked *running*, **without asking the agent anything**.
3. Five seconds later send the same with `"event":"PostToolUse"`. The row becomes one row with a duration of about 5 s.
4. Send a `PreToolUse` with `"callId":"c2"` and then any other event from `agent-1` without a matching end. The first becomes *no result*.
5. Send an event from `"source":"agent-2"`. Two sources are colour-coded. "Show only agent-2." → the agent sets the selection; only those rows remain.
6. Send an event whose `command` contains the stream address itself. The screen and `kanvas.monitor.stream.read` show `/in/[redacted]`.
7. "Add a note: nightly build." → the note appears; rows are untouched.
8. "Revoke the stream." → the screen says the stream was revoked and clears its rows. Repeat with a 1-minute stream and wait: the screen says it expired and keeps the last rows dimmed.
9. **Python urllib on DEV** (edge, not application): run the urllib line from [monitor streams](integration/monitor-streams.md#smoke-test-before-wiring-hooks). Until the edge exemption for `POST /in/*` is applied by the operator this may still print `403` without the `X-Kanvas-Stream` header. With the header absent the refusal did not come from Kanvas.

## 2. Source and info are gone (`5134662f`, `3f65409f`)

1. "Show the weather for Oslo." No attribution line, no "Source & info" button, on any template.
2. Ask the agent to publish a fact with `source: {title: "X"}`. It is refused with "Unsupported field"; the agent republishes without it.
3. Open an older session whose views carried a source: it still renders, without the footer.

## 3. Split screen (`a3523838`, `4e78197e`, `4b998939`)

1. "Split the screen in three columns." (1×3) and "three rows" (3×1). Both work.
2. "Left half one chart, right half four rows." Five panes: 1×2 with the right pane 4×1.
3. "Three columns, the middle one 2 by 2." Six panes.
4. "Sixteen panes, 4 by 4." Works. Seventeen is refused with a clear message.
5. On a phone: open the same display. The panes are all there; no tabs.
6. "Remove the borders between the panes." → edge to edge. "Twenty pixel gap, orange border, three pixels." → as asked. "Back to the default." → the 0.37 look.
7. "Six panes: bar, line, pie, area, scatter, donut." On a landscape window the pie and donut panes have the key beside the plot and do not scroll.
8. "Change only the pie pane to show last year." The other panes do not reload.

## 4. Pointing (`b0be5612`)

1. Open any view on two devices in the same session. Tap a word, a table cell or a chart bar on one. A named mark appears on both and fades after about four seconds. No button was needed.
2. Tap an empty area: a ring appears at that place on both screens and fades.
3. Long-press (or double-tap) something: the mark stays. Tap elsewhere: it is replaced by a fading mark. Nothing stays stuck.
4. Tap a link or a checklist box: it does what it always did and leaves no mark. Scroll: no mark.
5. Tap a bar and say "what is this one?" The agent answers about that bar without being told which. Ask it what it received: it quotes the `pointing` block from its last response.
6. Inside a split screen, tap in a pane: the agent hears the pane id.
7. "Turn pointing off for this session." Taps leave no marks. "Turn it on and show the Point button." The old tools appear.

## 5. Message board (`d25aaee4`)

1. "Post on the message board: is there a way to keep a checklist beside a chart? Tag it question." The agent must first tell you the board is public, ask you to confirm and ask which name to show. Only after your yes is it posted.
2. From a second account: "Any new messages on the board?" → the message, under the public name, with no email or account detail. "Mark them as seen." → asking again returns nothing new.
3. "Show the message board overview." → the `message-board` view: totals, new count, tags with counts, latest messages, marked public.
4. "Show the board messages tagged question." → the chat view.
5. "Notify me about new board messages." Post from the other account, start a new conversation: the agent mentions the count once. Without opting in nothing is mentioned.
6. "Remove my message." It disappears for everyone.
7. Post eleven messages within an hour: the eleventh is refused.

## 6. Text size (`0448f65b`)

1. With a task list on screen: "Make the text bigger in this session." The agent sets `textSize` (for example 150). The list lays out again with larger text. Publish a table, a colour grid, a document: all larger. Reload: still larger. A fact or a chart keeps filling the screen: only its fixed-size text (labels, legends) changes.
2. "Zoom this window to 150%." Only that window changes and it is not saved.
3. "Show twelve fonts at 18 pixels." The font picker uses `sampleSize`.

## 7. Task list (`08d22167`, `1c0ebe3f`)

1. Publish a 12-item task list and work through it: "check item 1, highlight item 2", and so on. Checked items stay in place with a short check-off animation. The list starts scrolling only when the highlight passes the middle and then keeps it near the middle. Same on a phone.
2. "Sink done items to the bottom for this list." → `doneLast: true` restores the old behaviour.
3. Ask the agent to set `columns` to number, item, status, tags. No duplicate columns; the response lists them as ignored. Add an `owner` column: it appears once an item has an owner.

## 8. Toast icons (`5b62fba5`, `95a83b8c`)

1. "Search icons for mail and send me a toast with the first one." The agent passes the id (`lucide:mail-dot`) directly. On a dark theme the icon is light, on a light theme dark.
2. A toast with the full Kanvas icon URL is coloured the same way.

## 9. Diagram fit (`363457fe`)

Publish an architecture diagram with `textScale: 1.5` so it overflows. "Fit the diagram." The whole diagram is visible in each window; `navigation.read` shows `fit: true` and `contentOverflowsViewport: false`. "Zoom in" leaves fit again.

## 10. Weather, maps, signage (`04dc0e65`, `8bfdf7b0`, `f430f4e8`, `99ba310f`)

1. Weather with 24 hourly steps: let it play. The strip at the bottom keeps the active step in view past the eighth.
2. World choropleth with title, caption and controls off on a laptop and on the TV: the map fills about 90% of the height. No Natural Earth line, no dots note; the legend is there. "Show the note about small territories." → it appears.
3. Signage: restroom, direction right, label "Restrooms". The word is centred under the pictogram.

## 11. Sessions overview (`22eccdda`)

Open the root overview. Every session shows one badge: Private (lock). Add a member or create a share link → Shared. Grant a team access → Team. Make it public → Public, the most prominent. A public session with a team shows Public.

## 12. Help text (`ee486423`)

"Read help on agent guidance." Step 3 describes the full block on first contact and on change, `unchanged: true` otherwise, and `clientDetails.guidance`. "Describe the split-screen template." It states the grid rule.

## 13. Grok (`99bc5479`)

Not fixed: no server defect was found. To move it forward, make one fresh attempt and note the time to the minute; the operator can then read the request sequence for that window (`KANVAS_LOG_OAUTH_DIAGNOSTICS`) and compare it with the transport answers recorded in the handoff. Complete the flow in the same browser that started it; do not let the app that opened the sign-in page be closed while confirming the email.

## Known limits of this round's automated proof

- Physical devices and real hosted clients (ChatGPT, Claude, Grok) were not part of the automated runs.
- Long press and double tap were exercised in desktop and phone Chromium, not on a physical touch screen.
- The Cloudflare behaviour for Python urllib is an edge setting; the application proof is the isolated test.
