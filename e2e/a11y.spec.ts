import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { ROUTES, gotoRoute, setTheme } from './helpers'

/**
 * axe-core across every route in both themes.
 *
 * `npm run check:a11y` already runs axe with a hand-rolled Playwright script, and this spec
 * duplicates it on purpose: it is the copy that runs in the same environment as the journeys,
 * so a route that becomes unreachable fails the accessibility run too. The alternative is an
 * accessibility check that quietly stops covering a page because the page stopped loading.
 *
 * axe is injected from the installed package rather than through `@axe-core/playwright`:
 * one dependency fewer, and the same rule set the existing check uses.
 */
const require = createRequire(import.meta.url)
const AXE_PATH = require.resolve('axe-core/axe.min.js')
const AXE_SOURCE = readFileSync(AXE_PATH, 'utf8')

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

type Violation = { id: string; impact: string | null; nodes: string[] }

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    for (const route of ROUTES) {
      test(`${route} has no violations`, async ({ page }) => {
        await gotoRoute(page, route)
        await setTheme(page, theme)

        await page.addScriptTag({ content: AXE_SOURCE })
        const violations = await page.evaluate(async (tags) => {
          const results = await (window as unknown as {
            axe: { run: (ctx: Document, opts: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: Array<{ target: string[] }> }> }> }
          }).axe.run(document, { runOnly: tags })
          return results.violations.map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            nodes: violation.nodes.slice(0, 2).map((node) => node.target.join(' ')),
          }))
        }, WCAG)

        // A failure names the rule and the element rather than only a count.
        expect(violations as Violation[], JSON.stringify(violations, null, 1)).toEqual([])
      })
    }
  })
}
