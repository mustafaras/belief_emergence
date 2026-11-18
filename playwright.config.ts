import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end journeys, run against a real dev server.
 *
 * The `npm run check:*` scripts each measure one property of one page. This suite is for the
 * things that property checks cannot see: whether a reader can actually get from the overview
 * to the audit, move a slider, and find the gate result — a sequence that spans routes and
 * state, and where every individual page can be perfectly correct.
 *
 * Serial, not parallel: the five specs all drive the same dev server, and two of them change
 * application state through the URL. `fullyParallel: false` with `workers: 1` costs about a
 * minute and removes an entire class of flake.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  // One retry: a chart that imports Plotly lazily can miss a 5s window on a cold start, and
  // the failure is a timeout rather than a defect.
  retries: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${process.env.RENDER_CHECK_PORT ?? '5199'}/belief_emergence/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.CHROME_PATH ? { launchOptions: { executablePath: process.env.CHROME_PATH } } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
      // Only the specs that are about phones run at phone size.
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  // The developer runs `npm run dev` themselves; CI starts one. Reusing an existing server is
  // what lets this suite run against the same instance the other checks use.
  webServer: process.env.E2E_START_SERVER
    ? {
        command: `npm run dev -- --port ${process.env.RENDER_CHECK_PORT ?? '5199'} --host 127.0.0.1`,
        url: `http://127.0.0.1:${process.env.RENDER_CHECK_PORT ?? '5199'}/belief_emergence/`,
        reuseExistingServer: true,
        timeout: 120_000,
      }
    : undefined,
})
