import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';

// Load .env so ASR_BASE_URL, ASR_API_KEY etc. are set before tests run
dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  /* Run tests in files in parallel */
  fullyParallel: false, // Set to false for API tests to avoid rate limiting
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: 1, // Run sequentially for API tests
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['./scripts/playwright-sheet-reporter.ts', {}],
    ['./scripts/playwright-debug-reporter.ts', {}],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'], // Console reporter
  ],
  /* Output directory for test artifacts */
  outputDir: 'test-results',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    // baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for API testing, UI testing, and Smoke testing */
  projects: [
    {
      name: 'api-tests',
      testDir: './src/tests/backend',
      testMatch: 'exhaustiveMasterAPI.spec.ts',
      timeout: 120000,
    },
    {
      name: 'playground-ui',
      testDir: './src/tests/ui',
      testMatch: 'exhaustiveMasterUI.spec.ts',
      fullyParallel: false,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        baseURL: process.env.PLAYGROUND_URL || 'https://playground.shunyalabs.ai',
        storageState: path.resolve(__dirname, 'auth', 'playground-auth.json'),
      },
      timeout: 120000, // 2 min per UI test (prevents long timeouts from blocking others)
      retries: 0, // No retries — failures should fail fast so the daily run fits the 3h cadence
    },
    {
      name: 'smoke-api',
      testDir: './src/tests/smoke',
      testMatch: 'smokeBackend.spec.ts',
      timeout: 60000,
    },
    {
      name: 'smoke-ui',
      testDir: './src/tests/smoke',
      testMatch: 'smokeUI.spec.ts',
      fullyParallel: false,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        baseURL: process.env.PLAYGROUND_URL || 'https://playground.shunyalabs.ai',
        storageState: path.resolve(__dirname, 'auth', 'playground-auth.json'),
      },
      timeout: 60000,
      retries: 0,
    },
  ],

  /* Cap the entire `playwright test` invocation. Belt-and-suspenders alongside the
   * shell-level `timeout` wrapper in run-playground-daily.sh — guards against hung
   * browser processes that ignore per-test timeouts.
   */
  globalTimeout: 3600000, // 15 min per `playwright test` invocation (each suite call)

  /* Global timeout for tests */
  timeout: 600000, // 10 minutes per test (for processing multiple audio files)
  
  /* Expect timeout for assertions */
  expect: {
    timeout: 10000, // 10 seconds for assertions
  },
});
