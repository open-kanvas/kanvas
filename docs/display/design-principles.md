# Display design principles

This is the standing product reference for developing or changing KANVAS templates. Read it before choosing layout or interaction. It applies to the full-screen visual surface, not the separate account-management application.

Agents see these principles as help `kanvas.help.design-philosophy` and, in compact form, in the `html` template guidance. They are the **default** when the person has not asked for something specific; an explicit request always wins. The purpose behind them is the [philosophy statement](../../src/shared/philosophy.ts).

**Navigation and editing happen through the agent. Templates render content and intrinsic responses only; never navigation chrome.** On-screen navigation of the agent's content (procedure and recipe steps, itinerary day picker, sing-along pages) appears only when the view sets `showControls: true`. Intrinsic responses stay: a poll's choices, a form's fields, satisfaction faces, a question input.

Custom HTML can follow the person's theme through tokens: `--kanvas-bg`, `--kanvas-fg`, `--kanvas-muted`, `--kanvas-accent`, `--kanvas-line`, `--kanvas-panel`, `--kanvas-font`. A view that references a token gets the themed page; older views keep their fixed dark page.

## A visual companion to the conversation

KANVAS is primarily **agent- and voice-driven**. People should understand the displayed answer at a glance without operating another application. The agent chooses the data, focus, grouping, expansion, filtering and view variant through explicit parameters or a new publication.

- Give the content the available display area. Do not duplicate the viewer's frame or add a decorative footer.
- Do not add search boxes, dropdowns, mode tabs, expand-all buttons or toolbars merely because a conventional application has them. Put those choices in the agent contract.
- Show essential labels and meaningful state, not implementation details, schema tips, connection plumbing or redundant instructions.
- Use typography and proximity to show hierarchy. Similar-looking icons alone are insufficient for different concepts such as a display and a physical device.
- Favor useful density over empty space. A tree or log should expose many readable rows; a small fact may use larger type. Do not apply one oversized spacing scale to everything.
- Scale to the actual viewport. Keep long labels readable and normally wrapped, allow bounded scrolling, and preserve legibility on phone, desktop and room screens in both themes.

## Preserve source and meaning

Never truncate or round source values silently to make a layout fit. Filtering and expansion change the projection, not the retained source. Keep exact numeric tokens, duplicate keys, timestamps and units where the source requires them. Do not show a second raw dump beneath a tree simply to prove source retention; the inspection API supplies the original.

Agent parameters must be discoverable and validated. A requested grouping or focus must visibly change the projection. A removed control must not leave dead event handlers or a decorative replacement that still looks clickable.

## Deliberate interaction exceptions

Interaction is appropriate when it is intrinsic to the task: answering a poll or form, drawing, controlling media, reading/navigation, or inspecting a map. Required attribution, consent and meaningful accessibility affordances also remain. An exception should have a specific user purpose; it is not permission to add generic application chrome to every template.

Account administration, invitations and access management are separate workflows and may use ordinary forms. Showing a connection map does not grant access or authorize location collection beyond its existing permission contract.

## Before calling a template complete

Check the actual rendered content, not just DOM existence: hierarchy, useful density, line wrapping, overflow, contrast, and the absence of unnecessary controls. Exercise agent-selected variants on representative phone and desktop sizes. Verify live data and painted state separately from a prepared server response. Record any external limitation honestly.

Examples: JSON uses a compact tree with agent-selected paths/query; connections offer agent-selected people, devices, or a combined display → people → devices → windows hierarchy. Neither needs a settings toolbar on the visual surface.

Related: [template index](../templates/README.md), [template selection](../README.md), [visual style](../README.md), [implemented rendering](implemented-rendering.md).
