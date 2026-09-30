# Self-hosted and hosted boundary

The hosted service runs the same application as self-hosters. There is no separate commercial feature repository or billing implementation in this source tree.

Deployment owners provide PostgreSQL, HTTPS, email delivery if enabled, map tiles if desired, backups and operational monitoring. Instance-specific paths, service units, account identifiers and credentials do not belong in the public repository. External agents connect through ordinary MCP and OAuth boundaries.

A future extension can retrieve or process source data independently and publish prepared views. That does not require embedding its processing engine inside Kanvas.
