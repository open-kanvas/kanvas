# Kanvas

Kanvas is your agent's screen: a visual surface for people and their AI agents, in any browser, at any size. There is no intelligence inside Kanvas; the agent decides what to show, and Kanvas renders it and reports back.

You talk or type to your agent, and the relevant thing appears on the screen while you speak: a chart, a checklist, a map, a code snippet, a plan. You react, it changes. The goal is the shortest time to clarity, like working through a problem with a colleague at a whiteboard. Full statement: [docs/mission.md](docs/mission.md).

## What is in this repository

The complete Kanvas application: the server, the web client and the agent-facing MCP interface, in one TypeScript package.

- Two MCP tools. Agents use exactly kanvas_discover and kanvas_call. Discovery lists, searches and explains; call executes one of ~190 operations (publish, patch, navigate, point, share, monitor, checklists, settings...).
- Native templates. Charts, tables, code, maps, diagrams, itineraries, checklists, planners, signage, media and more, each with a schema the agent fills in. Templates are what make Kanvas fast: the agent sends data, not markup, so a view appears while you are still talking.
- Custom HTML. For anything the templates do not cover, the agent can publish its own HTML. Slower to produce and less uniform, so it is the fallback, not the default.
- Multi-screen sessions. A phone, a laptop and a room display can each show a different view of the same session; views are retained and browsable.
- Accounts and access. Email sign-in, device approval, session permissions, sharing and invitations.
- Hosted Kanvas. Available at [kanvas.host](https://kanvas.host), with the MCP server at [kanvas.host/mcp](https://kanvas.host/mcp). More at [open-kanvas.ai](https://open-kanvas.ai).

Kanvas does not run a language model, fetch your source data or listen to your microphone. Content is preserved as supplied and private unless you choose otherwise.

## How the code is organised

```text
src/server/ — Node server: HTTP app, domain model, PostgreSQL store, auth
src/server/mcp/ — the two tools, operation registry, discovery, guidance
src/client/ — React viewer, workspace and one renderer per template
src/shared/ — template schemas, types and the help catalog used by both
docs/ — architecture, integration, operations, templates
tests/ — unit (vitest), MCP contract and end-to-end (playwright)
```

A template lives in three places: its schema in src/shared/view-schemas.ts, its renderer in src/client/renderers/, and its help entry in src/shared/help.ts. Start there to add or change one.

## Run it

Self-hosting needs Node.js 24+, PostgreSQL 15+ and a public HTTPS origin. Follow [docs/operations/self-hosting.md](docs/operations/self-hosting.md), or hand this repository URL to your agent and ask it to install and verify it.

## Contribute

Kanvas has a deliberate philosophy: a light visual surface with no intelligence inside, native templates first, built for low-latency, live interaction between a person and their agent. Before proposing a feature, read [docs/mission.md](docs/mission.md) and the yardstick in [CONTRIBUTING.md](CONTRIBUTING.md). Changes that turn Kanvas into a mini-app or an orchestration layer are outside the surface and will not be merged; new and better templates are the most welcome kind of contribution.

[CONTRIBUTING.md](CONTRIBUTING.md) covers local development and tests. Documentation map: [docs/README.md](docs/README.md). Security policy: [SECURITY.md](SECURITY.md).

Schemas are always taken from the running instance at /docs/; release identity lives in package.json and /version.json.

## License

Kanvas is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE). Third-party assets retain their own notices; see [NOTICE](NOTICE) and [docs/licenses/](docs/licenses/). "Kanvas" and the Kanvas logo are trademarks of the project and are not covered by the license.
