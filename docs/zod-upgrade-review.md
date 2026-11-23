# Zod 4.6.7 review (2026-11-23)

Zod is pinned exactly to 4.6.7. Official npm metadata dates this release to
2026-10-12T16:29:37.778Z, making it the newest stable release older than the
conservative seven-full-day cutoff (2026-11-16T00:00Z).

## Supply-chain checks

- The downloaded tarball matches npm SHA-512 integrity and provenance subjects.
- npm 11.17.0 audit signatures verified its registry signature and attestation.
- The attested source commit, npm gitHead, v4.6.7 tag and successful official
  release workflow all identify b500a2ee95134f81d74da7911d7378dd2853d042.
- All 333 shipped source/licence files match the upstream archive at that commit.
- No install lifecycle hooks or reviewed September-loader indicators occur in
  the selected package. This is not an exhaustive malware analysis.

The September compromise is real according to GitHub/npm incident advisory
208477 and Zod's 4.6.6 release notes. Upstream says six malicious commits were
reverted in PR 6620 on September 21, subsequently removed from main history,
and never published to npm. These publishing outcomes are upstream
incident-response statements, not independently reconstructed registry history.
4.6.6 has a documented pre-/post-history-rewrite provenance difference; 4.6.7
instead matches the rewritten source commit directly, so no mismatch is waived.

Upstream GitHub advisories, the exact-version OSV query and Snyk's version page
showed no known direct advisory for 4.6.7 at review time. Database coverage and
source/provenance checks do not establish absence of unknown vulnerabilities or
malicious build tooling. Compiled outputs were not independently reproduced.

## Compatibility scope

The focused regression test covers lazy error-map materialization, pre-element
array/set/map caps, conjunctive JSON Schema bounds, emoji component rejection,
numeric enum options, email acceptance/patterns, multi-megabyte composed base64
and recursive parse correctness. Existing template, schema-compaction, MCP
public contract, request-limit and application-error tests cover integration.
The recursive correctness test does not claim to measure retained heap.

No application global error-map switching or emoji/numeric-enum/base64 Zod
format reliance was identified. Email and schema conversion are used directly.
Media retains its separate canonical base64 and byte-size validation. No MCP
request bounds were removed and no new rate quota was introduced.

The licence inventory changes only Zod's version, tarball/integrity, unchanged
MIT notice and the lockfile digest. Other licence caveats remain in the existing
inventory documentation. A later application version bump must refresh the
inventory packageVersion and lockfileSha256 again.

## Primary sources

- https://registry.npmjs.org/zod
- https://registry.npmjs.org/-/npm/v1/attestations/zod@4.6.7
- https://github.com/colinhacks/zod/releases/tag/v4.6.7
- https://github.com/colinhacks/zod/releases/tag/v4.6.6
- https://github.com/colinhacks/zod/releases/tag/v4.6.0
- https://github.com/colinhacks/zod/actions/runs/38270975828/attempts/1
- https://github.com/orgs/community/discussions/208477
- https://github.com/colinhacks/zod/pull/6620
- https://security.snyk.io/package/npm/zod/4.6.7
