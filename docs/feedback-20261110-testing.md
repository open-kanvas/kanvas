# 0.37.0 DEV testing guide

Use a disposable DEV session and your normal agent. Refresh or reopen receiver tabs and the installed app after the deployment; the release shown by the app and by the agent's server information should be 0.37.0. Production and the website are outside this round. Do not change real feedback reports while testing.

Each step names the report it checks (first eight characters). "Agent" means: ask your agent to do it.

## A. Reopening and privacy lock

1. `042944fe` Phone, installed app: close it completely, reopen it, and time from the tap to the first content. Repeat five times, also once right after switching between wifi and mobile data. Expected: content within about a second on a good connection; at worst a quiet "Opening Kanvas…" and then "Reconnecting…", never several seconds of a fixed message. After about eight seconds without a connection you see "Kanvas can't be reached right now." with a "Try again" button.
2. `042944fe` Same, in a phone browser tab and on the laptop: switch away for a minute and back.
3. `042944fe` Privacy guarantee: Agent locks the phone (`kanvas.device.lock`). The phone shows "Kanvas is locked on this device." within about a second. Close and reopen the app while locked: no content appears at any moment. Agent unlocks: content returns.
4. `042944fe` Put the phone in flight mode with content showing: content disappears at once. Turn flight mode off: content returns by itself.
5. Optional measurement: Agent reads `kanvas.diagnostics.read` with the support reference from account defaults; `privacy-verified` events show `elapsedMs` and `attempts` for each reopen.

## B. Notifications

6. `1559c2fd`, `b4c5d005` Open the same display on laptop and phone. Agent sends a sticky notification. Dismiss it on the laptop: it disappears on the phone within a second or two, without touching the phone.
7. `b4c5d005` Restart the installed app on the phone and reload the laptop tab: the dismissed notification does not come back. Open the display in a new browser window: still gone.
8. `1559c2fd` If you have a second account that is a member of the session: its screen still shows the notification until that account dismisses it.
9. `e6ae1605` Agent sends notifications with `type` email, message, calendar, update, person and error; with `severity` warning and success and no type; and one plain notification. Expected: a matching generic pictogram for each typed or severity one, no icon on the plain one. A notification with an `icon` image shows the image.

## C. Checklists

10. `2a3bdc12`, `a416fadc` Agent publishes a checklist with about 20 items, each with a note. Agent ticks one item by id (`items:[{id, checked:true}]`). Expected: only that item changes; the answer lists one changed item and the rest as untouched. Agent reads the checklist: all items and notes are intact.
11. `2a3bdc12` Agent tries `mode:"replace"` with only two items. Expected: refused, nothing changed, the answer names the items that would be deleted. Agent adds one item at a position, clears one note with `detail:null`, and deletes one with `removeIds`.
12. `2a3bdc12` Undo: Agent reads the checklist (it lists retained revisions) and restores an earlier one with `restoreRevision`.
13. `d0e13f12` Scroll the checklist to the middle on the laptop. Agent ticks an item you can see. Expected: the list does not move.
14. `47f4f4c5` Scroll to the top. Agent ticks an item near the end. Expected: the list scrolls and that item ends up around the middle. Agent then edits the note of an item at the very top: the list goes back to it. Repeat on the phone. While you are scrolling by hand, only a completely hidden item is fetched.
15. `a38d9e45` Agent highlights one item (`highlightId`). Expected: an accent bar and tint on that item, brought into view, content and order unchanged. Agent clears it with `highlightId:null`.

## D. Presence

16. `7263db4a` Leave a TV or monitor browser and a phone on the same display for an hour without touching either, while talking to the agent. Expected: no "connected" or "disconnected" notices. Agent reads `kanvas.display.current` a few times: width and height stay those of the larger screen. Agent reads `kanvas.viewers.read`: each viewer has its own width and height.
17. `7263db4a` Close the phone tab. Expected: one "disconnected" notice within a few seconds. Turn the phone's wifi off for ten seconds and on again with the tab open: no notice.

## E. Layout fixes

18. `20722a0f` Weather with place, time, temperature, high and low, a three-sentence description, six details and a 12-step forecast, on the laptop. Expected: the text block sits low, its bottom on the horizon line, clear of the place and time, above the ground band and the timeline.
19. `aca837d4` Same view while the forecast loops, then with only place, time and temperature switched on. Expected: never a scroll bar inside the text block. With eight details and the longest allowed description the type gets smaller and, if it still does not fit, the bottom is cut off. A description over 400 characters is refused with the limit in the error. Check phone portrait and a 960x540 screen.
20. `955403f7` Chess, default orientation, white pieces on ranks 1 and 2 given with `side:"first"` (or coordinates E1 and so on). Expected: White at the bottom, A1 bottom left, labels and pieces agree. `orientation:"flipped"`: White at the top and every piece still on the square with its own label. Check a checkers or Go position: first side is still the dark one.
21. `c079dde2` Signs with each direction. Expected: one clean arrow shape with a sharp tip; left-pointing arrows on the left of the sign, right on the right, up above, down below. No-phones, no-trespassing and wifi on a wide laptop window, then resize the window: the figure keeps its size relative to the sign and stays visible behind the slash.
22. `ffdb2cec` Solitaire with a 13-card tableau column, foundations, stock and waste. Expected: no pile scrolls inside itself; every card is fully on the table; every stacked card shows its corner index. Laptop and phone.
23. `32b32d20` Architecture diagram with about 15 nodes on the TV. Agent zooms to 1.4 and 2.5 (`kanvas.navigation.control`). Expected: the diagram gets larger each time and can be scrolled. Agent publishes the same diagram with `textScale: 1.6`: boxes, text and spacing grow together. A two-node diagram on a large screen is drawn large. Try a flowchart and an org chart.
24. `341c9d9b` Agent publishes a procedure. Expected: the current step and nothing to click. Say "next": the agent advances it. With `showControls:true` the Back and Next buttons are there. Recipe, itinerary and sing-along likewise show no navigation buttons unless asked.
25. `b2640923` World choropleth with about 20 countries including HK on the 960x540 monitor and on a phone in landscape. Expected: the colour scale is fully visible without scrolling; HK appears as a dot and is not listed as unsupported.
26. `bebc556b` Planner day view with weather points, some with zero precipitation and no wind. Expected: icon on the left, temperature and other values beside it in one row, no empty slots. Proposals panel: larger type, one line per proposal, the reason dimmer below. Decide afterwards how many points per day read well.
27. `7e7fb1b1` Tool detail for an operation with three or more parameters, on the phone. Expected: one card per parameter, name and Required/Optional on the first line, type and description below, nothing cut off, no sideways scrolling. On the laptop: columns.
28. `510011ae` Open the Kanvas address in a signed-out browser. Expected: the six letters are also shown as one selectable line with a small copy icon; tapping it shows a check mark and "Copied", and the code pastes into a chat.
29. `aef9fccb` Connect an agent (OAuth) and reach "Check your email". Expected: the sentence names the sender address from the mail configuration as selectable text, says to check spam or junk and to allow the address, and offers "Send the email again". Confirm the address is the one the email really comes from.

## F. Exposure and guidance

30. `aa19719e`, `f18269b5` Start a new conversation with the agent and ask it, before anything else, what Kanvas is for. Expected: it describes the whiteboard idea in a sentence. Ask it to show what Kanvas is: the screen shows "Your agent can show things here while you talk." and three things to say.
31. `aa19719e` With a brand-new account, open the first session's display before anything is published. Expected: the same invitation instead of "Ready when you are." An account that already has another session sees the quiet ready screen.
32. `0875e953` In one conversation make about ten calls (publish, patch, read state). Ask the agent to compare the size of the first answer with later ones. Expected: saved guidance and the first-contact text only in the first answer; later answers carry a short pointer. Change your saved guidance: the next answer carries it again, once.
33. `0875e953` Modes: Agent reads `kanvas.session.state` and reports `mode`. Publish a presentation: presenting. Publish a menu board: signage. Say "we're done, keep it on the wall": the agent sets ambient or signage with one call. Leave a display on with no agent activity for over 30 minutes and start a new conversation: the mode is ambient.
34. `6d119fd6` Ask the agent to show a kind of view it has not used in this conversation (for example a seating plan). Expected: it publishes correctly on the first try. Ask it how large the split-screen template description was: a few kilobytes.
35. `6d119fd6` Ask the agent to publish a long paragraph "as a flow" without naming a template. Expected: nothing appears on the screen; the agent is told to choose a template, gets three candidates, and publishes a proper view on its next call.
36. `6d119fd6` Ask the agent to add planner items with start times like "09:00". Expected: one error line that names the expected date-time format and says how many fields share the problem.
37. `f7374ccd` Ask the agent to "put this on a second screen". Expected: it finds `kanvas.display.register` with one search. Ask what it can manage: it reads the manage map from session state.
38. `ffc47785` Ask the agent to "split the bill four ways with tip on the screen". Expected: it finds the math template.
39. `2444dc0d` Ask the agent for a custom html view of a decision. Expected: one large beat, no header, menu or buttons, and it follows your theme: switch between light and dark and change the accent. Then ask explicitly for a button: you get a button.
40. `7dcd018f` Ask the agent to read the description of `kanvas.feedback.submit`: no mention of a category.
41. `8f4962dc`, `e2573eca` Remove and re-add the connector in ChatGPT, Claude and Grok on a clean account. Note per client which logo, version, website and title are shown, and add it to the table in the connector identity document.
42. `43bcc861` With a test account at its session limit, ask the agent for a new session. Expected: the agent explains the limit with the number, that existing sessions keep working, that archiving one frees a slot, and the address to ask for more. Archive a session: creating one works again. Confirm a fresh account can create ten sessions of its own.
43. `684bd79e` With an account that has no display name, open a display. Expected: the join notice shows the part of the address before the @, never the full address. Agent sets a display name: `kanvas.viewers.read` and `kanvas.participants.read` show the new name at once, without reconnecting the screen.
44. `1668dad7` Agent drives a procedure with `kanvas.procedure.control` and then reads `kanvas.interactions.read`: nothing pending from its own actions. Publish a quote and a poll without titles: `kanvas.display.history` and pins list them as "quote: …" and "poll: …".
45. `843a384e` As service administrator, after a day of use: Agent reads `kanvas.friction.read` for `validation`, `retries`, `discovery`, `resolve` and `weight` and shows one as a table. A normal account is refused.

## G. New templates and capabilities

46. `06ee64d1` Agent shows JSON. Expected: indented text with colours and line numbers by default; large numbers shown exactly; `view:"tree"` gives the tree. Agent shows a tool call with `tool-call-details`: request left, response right, stacked on the phone; an error is prominent; a highlighted field is marked.
47. `e2ba79e1` Agent creates a task list from a document, then works through it by voice: "check item 3", "what was item 7 about" (it reads the stored detail back), "highlight item 5", "show only the open ones", "sort by status", "show only Anna's" (a column you added). Expected: numbers never change; done items travel to the bottom and are muted; the highlighted item shows its detail. Ask for a new list with your own status words and colours ("waiting in amber, shipped in green"): the pills take those colours and any other status stays a neutral pill.
48. `ebebd25c` Agent shows colour options A to F, variations of one, the Tailwind shade grid, "the blues" of the CSS names, harmonies, a contrast check and a theme from a seed, on the 960x540 monitor and the phone. Expected: every swatch readable and labelled; nothing overflows. Pick by voice ("amber 400"); the agent marks it and repeats the exact value. Ask for a shade grid of your own brand colours: every cell prints its own label, and with hex on request the value under it.
49. `e011b35b` Agent searches icons for "settings" and shows the candidates; pick "number 3"; the agent names the exact set and icon. Agent shows your text in six fonts, then pairings and the weights of one family. In the browser's network view all requests go to the Kanvas address only; for Inter or Merriweather the weights come from one `variable.woff2` file. Ask for icons from the wider catalogue ("also look in Material Design Icons"): on an installation without an Iconify API the agent says the catalogue is not configured; with one, candidates such as `mdi:cog-outline` appear and only openly licensed collections are offered.
50. `d630abcc` Agent shows the connected agents. Expected: one row per agent with name, active or last seen, session count, most recent session and model if reported. Connect a second client, use it, and see it appear. Revoke it from the first agent: it shows as revoked and that client has to sign in again. Open the Kanvas start page with your sessions: a session an agent created says "Created by" and that agent's name; a session you made by hand does not.
51. `f4373691` Agent creates a monitor stream and gives you the address. Post to it with `curl` from another machine, with two different `source` values. Agent shows the events as a log and as a chart of events per minute. Post more than 4 KB: refused. Post in a tight loop: some are refused with 429. Agent revokes the stream: posting stops working and the events are gone. Optionally wire the Claude Code or Codex hook from the monitor streams document.

## Not covered by automated checks

Physical devices, other browsers than Chromium, real networks, real mail delivery, and what ChatGPT, Claude and Grok display for the connector. Steps 1 to 5, 16, 17, 29 and 41 depend on these.
