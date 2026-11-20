# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile.spec.ts >> the contents drawer works and no route scrolls the page sideways
- Location: e2e/mobile.spec.ts:15:1

# Error details

```
Test timeout of 45000ms exceeded.
```

```
Error: locator.waitFor: Test timeout of 45000ms exceeded.
Call log:
  - waiting for locator('header').first() to be visible

```

# Test source

```ts
  1  | import { readFileSync } from 'node:fs'
  2  | import path from 'node:path'
  3  | import type { Page } from '@playwright/test'
  4  | 
  5  | /**
  6  |  * Shared navigation helpers.
  7  |  *
  8  |  * The application keeps its route in `?v=`, so "go to the audit" is a URL, not a click on the
  9  |  * sidebar. Both are exercised: `gotoRoute` is what a shared link does, and the journeys that
  10 |  * are about navigation click the sidebar instead.
  11 |  */
  12 | export const ROUTES = [
  13 |   'overview',
  14 |   'data',
  15 |   'audit',
  16 |   'gates',
  17 |   'model',
  18 |   'evaluation',
  19 |   'limits',
  20 |   'countries',
  21 |   'geometry',
  22 |   'reproduce',
  23 |   'glossary',
  24 | ] as const
  25 | 
  26 | export type Route = (typeof ROUTES)[number]
  27 | 
  28 | /** Navigate and wait for the route's own content rather than for the network. */
  29 | export async function gotoRoute(page: Page, route: Route, extraQuery = ''): Promise<void> {
  30 |   await page.goto(`?v=${route}${extraQuery}`, { waitUntil: 'networkidle' })
  31 |   // The header is rendered by the shell on every route, so its presence means React mounted
  32 |   // rather than that the HTML arrived.
> 33 |   await page.locator('header').first().waitFor({ state: 'visible' })
     |                                        ^ Error: locator.waitFor: Test timeout of 45000ms exceeded.
  34 |   // Geometry and evaluation import Plotly/KaTeX lazily; give the first paint a beat.
  35 |   await page.waitForTimeout(route === 'geometry' ? 2500 : 600)
  36 | }
  37 | 
  38 | /** The set of theme names the application toggles between. */
  39 | export async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  40 |   const current = await page.evaluate(() => document.documentElement.dataset.theme ?? '')
  41 |   if (current === theme) return
  42 |   await page.getByRole('button', { name: /Switch to (light|dark) theme/i }).click()
  43 |   await page.waitForFunction(
  44 |     (expected) => document.documentElement.dataset.theme === expected,
  45 |     theme,
  46 |     { timeout: 5000 },
  47 |   )
  48 | }
  49 | 
  50 | /**
  51 |  * How many constructs the audit admits at a reliability floor, read from the artifact.
  52 |  *
  53 |  * The referee journey asserts that moving the slider changes the counter. A literal `2` would
  54 |  * test the artifact rather than the wiring: if a construct's alpha changed, the test would
  55 |  * fail on a page that is behaving correctly. Deriving the expectation from the same file the
  56 |  * interface reads means a passing test says "the control is connected", which is the claim.
  57 |  *
  58 |  * Two conditions, both of which the first version of this function got wrong by checking only
  59 |  * the second:
  60 |  *
  61 |  *   - `computable` must be true. `S_social_support` has alpha 0.753 — above every floor a
  62 |  *     reader will try — but is marked not computable, so the audit never admits it. Counting
  63 |  *     it produced 3 where the interface correctly showed 2, and the mismatch is exactly the
  64 |  *     kind of silent disagreement an artifact-derived expectation is supposed to catch.
  65 |  *   - `cronbachAlpha` must be a number at or above the floor. A construct with no alpha
  66 |  *     ("withheld") never counts, at any floor, so null is excluded rather than treated as 0.
  67 |  */
  68 | export function admittedAt(floor: number): number {
  69 |   const artifact = JSON.parse(
  70 |     readFileSync(path.join(process.cwd(), 'src/data/analysis/wvs_construct_audit.json'), 'utf8'),
  71 |   ) as {
  72 |     constructs: Record<string, { cronbachAlpha?: number | null; computable?: boolean }>
  73 |   }
  74 |   return Object.values(artifact.constructs).filter(
  75 |     (construct) =>
  76 |       construct.computable === true &&
  77 |       typeof construct.cronbachAlpha === 'number' &&
  78 |       construct.cronbachAlpha >= floor,
  79 |   ).length
  80 | }
  81 | 
```