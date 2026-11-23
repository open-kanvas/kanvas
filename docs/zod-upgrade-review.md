# Reviewing Zod upgrades

Zod is part of the runtime validation and MCP JSON Schema boundary. The exact dependency and notice versions live in package.json, package-lock.json and [the licence inventory](licenses/README.md), not in a dated review snapshot here.

## Selection and provenance

For an authorized update, record the exact candidate, publication time and requested stability/age policy. Check official release notes and security advisories. Verify the downloaded tarball against registry integrity, registry signatures and available provenance; compare the attested source, npm gitHead, release tag and official release workflow. Inspect package lifecycle hooks and the source/licence diff. Explicitly explain any history-rewrite or provenance mismatch rather than waiving it.

An advisory search or matching source archive does not establish absence of unknown vulnerabilities or malicious build tooling. State whether compiled outputs were independently reproduced. Keep timestamped metadata, hashes, advisory responses and exact-commit test receipts in external evidence or the PR, not this reference directory.

## Compatibility checks

Exercise lazy error-map materialization, collection bounds before element validation, composed JSON Schema bounds, recursive parsing and the formats actually used by the application. Include email behavior and schema conversion, template examples, schema compaction, public MCP contracts, request bounds and application-error recovery. A recursive correctness test does not measure retained heap. Keep media’s separate canonical base64 and byte-size validation and the MCP prevalidation request bounds intact.

Use isolated test data and the repository’s shared build lock on constrained hosts. Report the exact tests, failures/corrective reruns and uncovered behaviors; do not claim a full suite when only focused checks ran.

## Notices and release identity

Update the locked inventory’s package version, tarball/integrity, authentic licence notice and lockfile digest. An application version bump must refresh inventory packageVersion and lockfileSha256 again. Preserve unrelated licence caveats. Dependency approval alone does not authorize application deployment.

References: [npm registry](https://registry.npmjs.org/zod), [official releases](https://github.com/colinhacks/zod/releases), [OSV](https://osv.dev/), and [MCP request bounds](integration/mcp-request-limits.md).
