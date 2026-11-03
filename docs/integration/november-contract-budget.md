# November contract regression accounting
This commit is test-only. No product schema or authorization changes.

Exact JSON byte metric: stringify the name,description,inputSchema for every tool returned by listToolDefinitions(profile), then Buffer.byteLength. Not token estimation or tool-count savings. Actual isolated DEV measurement:

| Source | Operations | Grouped bytes | Legacy bytes | Grouped bytes/op |
|---|---:|---:|---:|---:|
| main490b8f9 |166|152313|289387|917.5482|
| frozen56edb8a |172|161413|304254|938.4477|

Grouped payload grew9100bytes (includes template/schema feature growth), legacy grew14867. Grouped reduction versus legacy is142841bytes, up from137074. Keep grouped<legacy and unchanged960bytes/op assertions. Preserve the prior153KiB baseline inventory allowance and allocate6×960bytes for six independently inventoried and real-SDK-tested new operations: absolute cap162432bytes. Current frozen payload leaves1019bytes headroom; no unlimited inventory-generated ceiling. Assert manifest length exactly6 so subsequent additions require deliberate review.

Independent mapping: guidance suggestions list/save/delete/import,satisfaction.read,window.viewport. Both modern/legacy SDK HTTP tests execute all6 on actual stores, check persisted source/copy independence,stale/admin/read-only boundaries,server rating counts and foreign denial,window-scoped command retry/applied receipt/sibling isolation. Existing original fixture parity/inventory equality and detached schema poisoning assertions remain.

The optional suggested-guidance guard correction is separate on D2/PR27. Parent will remeasure/retest combined source after integration. No live connected-MCP success claim: these are ephemeral local authenticated test servers.
