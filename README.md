# Kanvas

Kanvas is your agent's screen. It is a visual surface for people and their agents: any browser, any size, with no intelligence inside; the intelligence lives in the agent. Sometimes the screen is a whiteboard in a live conversation, sometimes a board the agent keeps up for you, sometimes a sign it sets and leaves.

The experience at the heart of it is the feeling of working with a colleague at a whiteboard: you talk, the relevant thing appears on the screen while you speak, you point at it, it changes. Nobody asks permission, nobody narrates the mechanics, and your words get shorter because the detail is already visible. Templates, operations and schemas are how Kanvas is built; this rhythm is what it is.

Our job is to make both the agent and the person reach that rhythm as fast as possible: the right information, at the right moment, with the shortest time to clarity. Get the setup, the feel and the taste right, and Kanvas can be much more than one use case while staying a light, visual surface, never a heavy application.

One surface, three tempos: a **live session** (seconds: publish while talking, patch on reaction), a **kept-up board** (hours: a checklist, a planner or a monitor that stays current between conversations) and a **sign** (days: set once and left). All three share the same rules: no backend intelligence, native templates first, one glanceable beat per view, readable from across a room, works on any screen. The full statement and how agents are expected to behave: [mission](docs/mission.md).

Talk or type to your agent; it puts charts, notes, maps, diagrams and other focused views on your screens. A phone, laptop or room display can each show a different view of the same session.

Kanvas preserves supplied content and keeps access private unless you choose otherwise. It does not run a language model, fetch your source data or listen to your microphone. Your connected agent does that work; Kanvas renders the results and reports whether a browser received them.

## Run it yourself

Give your agent this repository URL and ask it to install and run Kanvas on your infrastructure. The [self-hosting guide](docs/operations/self-hosting.md) has the exact prerequisites, commands, PostgreSQL settings, email configuration and upgrade procedure. It needs Node.js 24+, PostgreSQL 15+ and a public HTTPS origin for remote clients.

Ask the agent to keep credentials outside the checkout, use an isolated test database, verify the installation and explain its backup plan before exposing it. [Contributing](CONTRIBUTING.md) covers local development and tests.

## Or use hosted Kanvas

The hosted service uses the same application. Connect your agent to **https://kanvas.host/mcp**, confirm your email, and open **https://kanvas.host** on a screen. The screen shows a six-letter code: read it to your connected agent and confirm the screen details. You can approve full-account access or view-only access to one session.

[Getting started](https://open-kanvas.ai/#getting-started) explains connecting an agent. Hosted and self-hosted installations remain separate; links locate content but never grant access.

## What you can do

- Show exact supplied data, text, images, code and interactive charts.
- Prepare presentations or cue cards, with authored cues for a listening agent.
- Keep multiple screens independent, browse retained views, and return to live content.
- Save personal guidance prompts and activate one for a session.
- Collaborate through explicit session permissions and revocable screen approval.
- Opt into browser/PWA notifications and choose which subscription receives them.

## Find the details

- [Documentation map](docs/README.md)
- [Agent workflows](docs/integration/agent-workflows.md) and [two-tool discovery](docs/architecture/mcp-discovery.md)
- [Templates](docs/templates/README.md), [visual help and shortcuts](docs/feedback-oct29.md)
- [OAuth and email confirmation](docs/integration/oauth-lifecycle.md)
- [Security policy](SECURITY.md)

Agents use exactly two tools, `kanvas_discover` and `kanvas_call`. Discovery finds current operations, templates and help; the running instance provides exact schemas at `/docs/`. Release identity is in `package.json` and the running `/version.json`, not a copied version number here.

The package remains private to prevent accidental npm publication. No repository-wide license has been selected; third-party assets retain their own notices. A repository being readable does not imply a license grant.
