# Contributing

Draft for maintainer review before public release.

## The yardstick: ask this before accepting any change

Kanvas is your agent's screen: a light visual surface with no intelligence inside. The [mission](docs/mission.md) is the measure for every change, including feedback items. Before accepting one, ask:

1. Does it serve the surface rather than add an application?
2. At which tempo (live, kept-up, static), and does it fit that tempo?
3. Does it reduce time to clarity for the agent or the person, or at least not increase it?
4. Does it keep intelligence on the agent side?

A change that fails the first or the last question is out of scope however useful it looks. The same four questions head the feedback review process: write the answers next to each item you implement.

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

Keep source contracts under `src/shared`, enforce authorization in domain operations, and preserve exact source values. New templates need validator, example, renderer and meaningful source/delivery tests. MCP changes must update every profile, examples, guides and parity/budget tests without weakening budgets. A prepared receipt is not a browser acknowledgement.

When behaviour changes, review what describes it in the same change: the help entry (`src/shared/help.ts`), the tool description and discovery hint, the template guidance and example, and the page under `docs/`. `tests/core/documentation-current.test.ts` and the per-release feedback tests assert the statements most likely to drift; add an assertion for each statement you had to correct.

Use logical commits and document compatibility/migrations. Do not commit operational archives, local databases, credentials, generated releases or private reports. Run `git diff --check` and inspect all staged files before committing. A license and public contribution process are still awaiting maintainer review.

## Test organization

Name test files after the behaviour or feature they test, never a date, release round or time of day. Add bug-fix coverage to the feature file, not a new report-named file. Keep suite harnesses and operation fixtures shared. When moving tests, preserve every test and assertion, compare exact suite counts, and retain literal duplicates with a `duplicate-of` comment until a separately approved pruning change.
