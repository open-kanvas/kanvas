# MCP request bounds

Kanvas supports data-heavy tools without a per-account tool-call rate quota.
The HTTP entry point applies per-request abuse bounds before SDK/schema validation:

- 15 MiB decoded JSON body, including requests parsed by the parent application.
- At most 100 JSON-RPC messages per batch (where supported by the negotiated protocol).
- 1,500,000 aggregate array elements and object properties per request.
- 128 nested object/array levels.

The element budget counts the request envelope too, not only tool arguments.
The element ceiling preserves the published 20,000-row × 64-column import envelope.
Strings count as values rather than one element per character; large text/media
payloads still fit within the byte limit. Split inputs above these bounds into
separate tool calls. Accepted calls still obey each operation's documented limits.
A size rejection is HTTP 413; batch/structure bounds return HTTP 400 with a
JSON-RPC invalid-request error. Authentication remains required before dispatch.

The structural guard is iterative and runs before both modern and legacy SDK
handlers. It also covers discovery inputs and nested operation arguments because
Kanvas uses the SDK's low-level Server rather than McpServer. SDK upgrades alone
do not apply McpServer-only validation limits to that path.

These are not global denial-of-service guarantees. Operators should size process
memory and connection limits for expected concurrency and protect the public
origin at their proxy. Existing session/subscription capacity limits remain;
normal repeated tool calls are not newly throttled.
