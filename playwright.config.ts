import { defineConfig } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { testDatabase } from './tests/postgres.js';

// Failure-page snapshots can capture transient sign-in or pairing material.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';

const port=process.env.KANVAS_E2E_PORT??'8799';
const baseURL = `http://127.0.0.1:${port}`;
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
// A test-specific PostgreSQL target is mandatory; production settings are never used.
process.env.KANVAS_E2E_RUN_ID ??= randomUUID();
const database = testDatabase(process.env.KANVAS_E2E_RUN_ID);

export default defineConfig({
  testDir: './tests/e2e',
  globalTeardown: './tests/e2e/global-teardown.ts',
  outputDir: 'test-results/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 75_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 15_000,
    locale: 'en-GB',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    // Authentication flows are real; never persist credentials in traces or videos.
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    { name: 'desktop-chromium', use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
    { name: 'phone-chromium', use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `${shellQuote(process.execPath)} dist/server/index.js`,
    url: `${baseURL}/healthz`,
    timeout: 45_000,
    reuseExistingServer: false,
    env: {
      HOST: '127.0.0.1',
      PORT: port,
      KANVAS_PUBLIC_URL: baseURL,
      // Browser workflows use the same two-tool surface as the deployed default.
      KANVAS_MCP_PROFILE: 'discovery',
      KANVAS_DB: '',
      KANVAS_PG_HOST: database.host!,
      KANVAS_PG_PORT: String(database.port),
      KANVAS_PG_DATABASE: database.database!,
      KANVAS_PG_USER: database.user!,
      KANVAS_PG_SCHEMA: database.schema!,
      KANVAS_PG_SSL: 'disable',
      KANVAS_PG_PASSWORD_FILE: '',
      KANVAS_EMAIL_SIGNIN: 'false',
      KANVAS_PUSH_ENABLED: 'false',
      CREDENTIALS_DIRECTORY: '',
      KANVAS_ALLOW_REGISTRATION: 'true',
    },
  },
});
