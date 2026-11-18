import type { Page } from '@playwright/test'

/**
 * Shared navigation helpers.
 *
 * The application keeps its route in `?v=`, so "go to the audit" is a URL, not a click on the
 * sidebar. Both are exercised: `gotoRoute` is what a shared link does, and the journeys that
 * are about navigation click the sidebar instead.
 */
export const ROUTES = [
  'overview',
  'data',
  'audit',
  'gates',
  'model',
  'evaluation',
  'limits',
  'countries',
  'geometry',
  'reproduce',
  'glossary',
] as const

export type Route = (typeof ROUTES)[number]

/** Navigate and wait for the route's own content rather than for the network. */
export async function gotoRoute(page: Page, route: Route, extraQuery = ''): Promise<void> {
  await page.goto(`?v=${route}${extraQuery}`, { waitUntil: 'networkidle' })
  // The header is rendered by the shell on every route, so its presence means React mounted
  // rather than that the HTML arrived.
  await page.locator('header').first().waitFor({ state: 'visible' })
  // Geometry and evaluation import Plotly/KaTeX lazily; give the first paint a beat.
  await page.waitForTimeout(route === 'geometry' ? 2500 : 600)
}

/** The set of theme names the application toggles between. */
export async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  const current = await page.evaluate(() => document.documentElement.dataset.theme ?? '')
  if (current === theme) return
  await page.getByRole('button', { name: /Switch to (light|dark) theme/i }).click()
  await page.waitForFunction(
    (expected) => document.documentElement.dataset.theme === expected,
    theme,
    { timeout: 5000 },
  )
}
