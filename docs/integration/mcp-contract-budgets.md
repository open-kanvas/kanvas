# MCP contract budgets

Kanvas advertises two compact wire tools. Operation and template schemas are retrieved by exact catalog ID, rather than bundled into every `tools/list` response. Catalog list/search summaries and full get results serve different purposes; a search result must not quietly grow into a full-schema result.

Measure serialized JSON bytes with `Buffer.byteLength(JSON.stringify(value))`, not a tool count or an estimated token count. The discovery contract checks keep the two advertised definitions under 9,000 JSON characters and independently exercise list, ranked search, exact schemas, examples and continuation. Each public operation has a schema/dispatch contract against the operation table; modern and legacy MCP protocol transports exercise the same public interface.

The response envelope is limited to 96 KiB (`MAX_TOOL_RESULT_BYTES`), and resource content to 256 KiB (`MAX_RESOURCE_BYTES`). Structured source content must not be silently truncated to meet a budget. Preserve explicit continuation or an actionable limit error; never report an incomplete inventory as complete. Composite template schemas retain their documented contract.

Run the discovery, public-operation contract and discovery HTTP suites when changing definitions or response wrapping. Record source commit, test counts, serialized sizes and any failures in the PR evidence, not in a dated document in this folder. A passing isolated protocol test is not evidence that an external host has refreshed its cached tool list.
