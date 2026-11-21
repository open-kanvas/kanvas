# Documentation

Kanvas renders supplied content. The agent or data producer owns retrieval, reasoning, translation and listening; Kanvas owns validation, source binding, access, display revisions and browser delivery.

- [Personal guidance and prompt library](agent-guidance.md)

- [Mission: what Kanvas is for](mission.md)
- [Markdown reading](templates/markdown.md), [text size and split screens](templates/split-screen.md)
- [Pointing](sessions/pointing.md), [split screen](templates/split-screen.md), [message board](integration/message-board.md)
- [Monitor streams](integration/monitor-streams.md), [connector identity](integration/connector-identity.md), [task list](templates/task-list.md), [colour](templates/colour.md), [icon and font pickers](templates/pickers.md), [JSON raw view and tool call details](templates/tool-call-details.md)

## Start here

- [Agent workflows](integration/agent-workflows.md)
- [Publishing examples](integration/publishing-paths.md)
- [Template catalog](templates/README.md)
- [Self-hosting](operations/self-hosting.md)
- [PostgreSQL and upgrades](operations/postgresql.md)
- [Architecture](architecture/system-overview.md)
- [Hosted boundary](architecture/core-and-hosted-boundary.md)
- [OAuth lifecycle](integration/oauth-lifecycle.md)
- [Multiple displays](sessions/multiple-displays.md)
- [Sharing and guests](sessions/sharing-and-guests.md)
- [Rendering guarantees](display/implemented-rendering.md)
- [Map provider configuration](operations/maps-and-provider-options.md)

## Live reference

On your own instance, `/docs/` provides task-oriented help for navigation, accounts/teams, invitations, access, images, pointing, feedback, events, installation and device presentation. `/docs/index.json` lists current templates and tools; `/docs/reference` and `/docs/operations/<operationId>.json` provide exact operation contracts (the two public tool envelopes are also available by tool name). The server-generated reference is authoritative when a prose example and runtime schema differ.

Source code lives under `src/shared` (contracts), `src/server` (service) and `src/client` (receiving UI). Tests use only synthetic/disposable data. Contributor and reporting guidance are in the root CONTRIBUTING and SECURITY documents.

- [Two-tool MCP discovery, catalog/search decisions and migration](architecture/mcp-discovery.md)

