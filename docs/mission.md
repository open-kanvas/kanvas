# Mission

The founder's words, lightly edited for flow. This is the authoritative statement of what Kanvas is for. Keep the first person plural and the interaction rhythm; do not rewrite it into marketing copy or a feature list. The same text lives in `src/shared/philosophy.ts` and is served as help `kanvas.help.philosophy`.

## What Kanvas is for

Kanvas is your agent's screen. It is a visual surface for people and their agents: any browser, any size, with no intelligence inside; the intelligence lives in the agent.

You talk or type to your agent, and the relevant thing appears on the screen while you speak: a chart, a checklist, a map, a code snippet, a plan. You react, it changes. The goal is the shortest time to clarity, like working through a problem with a colleague at a whiteboard. Nobody asks permission, nobody narrates the mechanics, and your words get shorter because the detail is already visible. Templates, operations and schemas are how Kanvas is built; this rhythm is what it is.

Our job is to make both the agent and the person reach that rhythm as fast as possible: the right information, at the right moment, with the shortest time to clarity. Get the setup, the feel and the taste right, and Kanvas can be much more than one use case while staying a light, visual surface, never a heavy application.

## One surface, three tempos

- **Live session (seconds):** publish while talking, patch on reaction. This is where taste shows most and where onboarding must land first.
- **Ambient / kept-up (hours):** a checklist, a planner, a monitor, a scoreboard that stays current between conversations. Same templates, lower tempo.
- **Static / signage (days):** a menu board, opening hours, a sign. An agent sets it once and leaves it. Same surface, slowest tempo.

All three share the same rules: no backend intelligence, native templates first, one glanceable beat per view, readable from across a room, works on any screen. A feature that only makes sense as a mini-app, a dashboard product or an orchestration layer is outside the surface regardless of tempo.

## Three renderings of the same mission

1. **For the person (invitation).** Shown on a first-time ready screen and by `kanvas.help.show` with topic `philosophy`: "Your agent can show things here while you talk. Try: 'show me the options side by side', 'put the plan for Saturday on the screen', 'keep a checklist up while we go through this'." It is the `welcome` template.
2. **For the agent (conduct).** Sent once on first contact, at the start of the MCP server instructions, and available as help `kanvas.help.philosophy`: "Use the screen as you work through a problem with a colleague. When something is easier to see than to say, put it on the screen while you talk, without asking. One idea per view. When the person reacts, patch the view rather than republishing. Keep your spoken words short; the detail is on the screen. Know which tempo you are in: live (change it as you go), kept-up (keep it current), or static (set it and leave it)."
3. **For whoever changes Kanvas (yardstick).** At the top of [CONTRIBUTING](../CONTRIBUTING.md): does it serve the surface rather than add an application; at which tempo, and does it fit; does it reduce time to clarity, or at least not increase it; does it keep intelligence on the agent side. A change that fails the first or the last is out of scope however useful it looks.

## Where the tempo shows up in the product

Each session has one **mode**: `live`, `presenting`, `ambient` or `signage`. It is set explicitly (`kanvas.session.create` or `kanvas.config.update` with `mode`) or follows observable facts: a presentation on a display means presenting; a signage template means signage; no agent call for 30 minutes while a display stays online drops live to ambient. When unsure the quieter mode wins. The mode is returned by `kanvas.session.state`, so a new conversation or a different model inherits it. Nothing here infers intent; see help `kanvas.help.modes`.
