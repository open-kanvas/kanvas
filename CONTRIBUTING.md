# Contributing

## The yardstick: ask this before accepting any change

Kanvas is your agent's screen: a light visual surface with no intelligence inside. The [full philosophy statement](src/shared/philosophy.ts) is the measure for every change, including feedback items. Before accepting one, ask:

1. Does it serve the surface rather than add an application?
2. Does its update behavior fit what the person asked for, without inventing a session mode or tempo setting?
3. Does it reduce time to clarity for the agent or the person, or at least not increase it?
4. Does it keep intelligence on the agent side?

We prefer changes that keep Kanvas lightweight and leave intelligence and agent-side logic in the agent. The same four questions head the feedback review process: write the answers next to each item you implement.

Use Node.js 24+, npm and an isolated PostgreSQL instance. Do not use customer or production data in tests, screenshots, fixtures or reports. Keep credentials and local configuration outside git.

## Development and checks

```sh
npm ci
npm run check:all
npm test -- --maxWorkers=2
npm run build
npm run test:e2e -- --workers=1
```

Vitest requires `KANVAS_TEST_PG_HOST` and accepts `KANVAS_TEST_PG_PORT`, `KANVAS_TEST_PG_USER`, and `KANVAS_TEST_PG_DATABASE`. Tests create unique disposable schemas and remove them afterwards. The Playwright server also requires these test-specific settings and owns a fresh schema; it never inherits production database settings. Browser traces/video are disabled because authentication flows are real.

Run heavy jobs sequentially on small hosts. Full Playwright coverage includes desktop and phone Chromium with one worker; it does not substitute for physical-device or cross-browser testing.

## Changes

Keep source contracts under `src/shared`, enforce authorization in domain operations, and preserve exact source values. New templates need validator, example, renderer and meaningful source/delivery tests. MCP changes must update the public operation table, discovery examples, guides and per-operation/HTTP contract tests without weakening response budgets. The only callable tools are `kanvas_discover` and `kanvas_call`; do not add profile aliases or a second operation registry. A prepared receipt is not a browser acknowledgement.

When behaviour changes, review what describes it in the same change: the help entry (`src/shared/help.ts`), tool/operation description and discovery hint, template guidance/schema/example, reader pages under `docs/`, and public website claims where relevant. In the PR, list each affected surface as updated, checked unchanged, or deferred with a reason; do not equate a title inventory or schema-valid example with a visual/behavioral audit. Website changes have their own repository and release authority.

For a lightweight documentation guard, run `npx vitest run tests/core/documentation-current.test.ts tests/core/public-documentation.test.ts --maxWorkers=1`. These checks need no database: they cover local links, current executable operation references, complete JSON examples and public reference generation. Extend the feature-named checks for corrected drift-prone statements; run affected schema/renderer/operation tests separately when behavior changes. The guard is not a full semantic or browser review.

Use logical commits and document compatibility/migrations. Do not commit operational archives, local databases, credentials, generated releases or private reports. Run `git diff --check` and inspect all staged files before committing. Keep third-party notices with redistributed material; see [the licence index](docs/licenses/README.md).

## Test organization

Name test files after the behaviour or feature they test, never a date, release round or time of day. Add bug-fix coverage to the feature file, not a new report-named file. Keep suite harnesses and operation fixtures shared. When moving tests, preserve every test and assertion, compare exact suite counts, and retain literal duplicates with a `duplicate-of` comment until a separately approved pruning change.

New templates get their own feature-named renderer, stylesheet and schema from the start; never name source files after a date or release round.
