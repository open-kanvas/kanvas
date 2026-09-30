# Contributing

Draft for maintainer review before public release.

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

Use logical commits and document compatibility/migrations. Do not commit operational archives, local databases, credentials, generated releases or private reports. Run `git diff --check` and inspect all staged files before committing. A license and public contribution process are still awaiting maintainer review.
