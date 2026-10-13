# Kanvas

## Use hosted KANVAS

Connect your MCP client to **https://kanvas.host/mcp** — no self-hosting required.
Visit [open-kanvas.ai](https://open-kanvas.ai) or manage your account in the [console](https://console.kanvas.host).

For self-hosted installations, use the MCP endpoint on your configured public origin.


Kanvas is a shared visual workspace for agents and people. Agents publish structured content through the Model Context Protocol (MCP); signed-in or explicitly approved browsers receive responsive views and return real interaction and delivery receipts.

Release: **0.21.0**. Publication candidate; no license has been selected yet.

## What it does

- Displays exact supplied text, data, charts, maps, images, documents, code and other structured views.
- Supports multiple independent screens, presentations, navigation, drafting, schedules and explicit collaboration.
- Preserves source data and validates template contracts. Browser acknowledgement is separate from preparation.
- Uses PostgreSQL, account/session permissions, OAuth, revision checks and idempotent mutations.

Kanvas does not run a language model, listen to audio, translate text, or generate missing source content. An external agent can do those tasks and send the results to Kanvas. Supplied transcription and translation layouts remain available.

## Agent connection

Connect an MCP client to `https://<your-host>/mcp` and complete its OAuth flow. Every connection exposes exactly two tools: `kanvas_discover` and `kanvas_call`. Discover takes `catalog: tools | templates | help` and `action: list | search | get`. List returns all IDs/descriptions in concise plain text with no default pagination. Search returns ranked short summaries (default five), never full detail; get retrieves one exact ID’s complete schema or help content. Get an unfamiliar template or operation before calling it. For example, discover an operation, get its exact schema, then execute:

```json
{
  "name": "kanvas_call",
  "arguments": {
    "operationId": "kanvas.submit",
    "arguments": {
      "requestId": "first-visual",
      "view": {"version": 1, "template": "fact", "data": {"text": "Exact supplied words."}}
    }
  }
}
```

Indices are exhaustive across pages: follow `nextCursor` until null, and search an exact ID for details. [Discovery architecture and migration](docs/architecture/mcp-discovery.md).

The result identifies the session, display, update and actual viewer URL. A URL locates a view; it does not grant access. Continue with the returned target reference, check publication status, and verify receiving-browser delivery before claiming it was shown.

## Self-host

Use Node.js 24+ and PostgreSQL 15+. Copy `.env.example` to a private local configuration, provision a dedicated database and run:

```sh
npm ci
npm run build
npm start
```

The application reads process environment; it does not automatically load `.env`. With Node, a local start can use `node --env-file=.env dist/server/index.js`. Configure your public HTTPS origin and authentication before exposing the service. See [self-hosting](docs/operations/self-hosting.md) and [PostgreSQL operations](docs/operations/postgresql.md). `compose.yaml` connects to a separately provisioned PostgreSQL service; it does not expose a database port.

## Develop

```sh
npm ci
npm run dev
# In another terminal for the client:
npm run dev:client
```

Set `KANVAS_DEV_CLIENT=true` for the development client origin. Use a separate database for development and tests. `npm run check:all`, `npm test -- --maxWorkers=2`, `npm run build`, and `npm run test:e2e -- --workers=1` form the full validation sequence. Test database settings and cleanup are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

- [Documentation map](docs/README.md)
- [Architecture](docs/architecture/system-overview.md)
- [Agent workflows](docs/integration/agent-workflows.md)
- [Publishing contracts and examples](docs/integration/publishing-paths.md)
- [Templates](docs/templates/README.md)
- [Security policy draft](SECURITY.md)

Every running instance serves current human guidance at `/docs/`, machine-readable help at `/docs/index.json`, and exact schemas at `/docs/templates/<template>.json`. These are generated from the same contracts used at runtime.

The hosted service and self-hosted application use the same code. The package remains `private: true` to prevent accidental npm publication. Third-party assets retain their own notices; no repository-wide license grant is implied before a license is selected.
