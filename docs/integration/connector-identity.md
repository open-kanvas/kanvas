# Connector identity: logo, version, website, title

What Kanvas publishes about itself to MCP clients, where each client is known to look, and what cannot be controlled from the server.

## What the server publishes

| Where | Field | Value |
| --- | --- | --- |
| MCP `initialize` → `serverInfo` | `name` | `kanvas` |
| | `title` | `Kanvas` |
| | `version` | the running release (`src/shared/version.ts`, same as `/version.json`); never a fixed number |
| | `description` | the short product description |
| | `websiteUrl` | `KANVAS_WEBSITE_URL`, default `https://open-kanvas.ai`; set it to an empty value to omit |
| | `icons` | 48, 192 and 512 px PNG plus the SVG mark, each with `mimeType` and `sizes` |
| OAuth protected-resource metadata | `resource_name`, `resource_documentation` | name and the website |
| OAuth authorization-server metadata | `service_documentation` | the website |
| Origin root | `/favicon.ico`, `/favicon.svg`, `/favicon-16/32/48.png`, `/icons/kanvas-192.png`, `/icons/kanvas-512.png`, `/icons/apple-touch-icon.png` | public files |

Icon addresses carry `?v=<release>`, so a client that cached an older image fetches the current one after an upgrade. All of these files are served without sign-in, without a redirect and with their real content type; this is covered by an automated browser test (the public asset and connector acceptance checks).

`websiteUrl` and `icons` are optional fields of the MCP implementation information (specification revision 2025-11-25 and later). Older clients ignore them.

## What the server cannot set

- **Category** ("other" in ChatGPT): there is no MCP or OAuth field for a category. It is chosen by the client or its directory.
- **Developer** (the account owner's name in ChatGPT): assigned by the client to whoever added a custom connector.
- **OAuth `logo_uri`**: this is client registration metadata. It describes the *client* application to the authorization server, not the server to the client, so it cannot carry the Kanvas logo.
- Whether a client shows any of the published fields. A client may use its own artwork for custom connectors regardless of what a server publishes.

## How to check from outside

```sh
curl -sI https://<host>/icons/kanvas-512.png   # 200, image/png, no Location header
curl -sI https://<host>/favicon.svg            # 200, image/svg+xml
curl -s  https://<host>/.well-known/oauth-protected-resource/mcp
```

Then inspect the `initialize` result of an MCP client for `serverInfo`.
