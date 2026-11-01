# Kanvas

Kanvas is a shared visual workspace for people and their AI agents. Talk or type to your agent; it puts charts, notes, maps, diagrams and other focused views on your screens. A phone, laptop or room display can each show a different view of the same session.

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
