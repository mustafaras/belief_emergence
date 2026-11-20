import { readFileSync } from 'node:fs'
import path from 'node:path'
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

/**
 * How many constructs the audit admits at a reliability floor, read from the artifact.
 *
 * The referee journey asserts that moving the slider changes the counter. A literal `2` would
 * test the artifact rather than the wiring: if a construct's alpha changed, the test would
 * fail on a page that is behaving correctly. Deriving the expectation from the same file the
 * interface reads means a passing test says "the control is connected", which is the claim.
 *
 * Two conditions, both of which the first version of this function got wrong by checking only
 * the second:
 *
 *   - `computable` must be true. `S_social_support` has alpha 0.753 — above every floor a
 *     reader will try — but is marked not computable, so the audit never admits it. Counting
 *     it produced 3 where the interface correctly showed 2, and the mismatch is exactly the
 *     kind of silent disagreement an artifact-derived expectation is supposed to catch.
 *   - `cronbachAlpha` must be a number at or above the floor. A construct with no alpha
 *     ("withheld") never counts, at any floor, so null is excluded rather than treated as 0.
 */
export function admittedAt(floor: number): number {
  const artifact = JSON.parse(
    readFileSync(path.join(process.cwd(), 'src/data/analysis/wvs_construct_audit.json'), 'utf8'),
  ) as {
    constructs: Record<string, { cronbachAlpha?: number | null; computable?: boolean }>
  }
  return Object.values(artifact.constructs).filter(
    (construct) =>
      construct.computable === true &&
      typeof construct.cronbachAlpha === 'number' &&
      construct.cronbachAlpha >= floor,
  ).length
}
