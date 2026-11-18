import { expect, test } from '@playwright/test'
import { gotoRoute } from './helpers'

/**
 * The phone journey: a table may scroll, the page may not.
 *
 * `check:layout` measures this across every route and viewport. This spec walks it as a reader
 * would — open the contents drawer, navigate to evaluation, look at a wide table — because the
 * rule and the journey can disagree: a drawer that traps scroll, or a table that pushes the
 * document when it is opened, would pass the static rule only if the rule happened to visit the
 * same state.
 */
test.use({ viewport: { width: 390, height: 844 } })

test('the contents drawer works and no route scrolls the page sideways', async ({ page }) => {
  await gotoRoute(page, 'overview')

  // 1. Below 1024px the sidebar is hidden and Contents is a drawer.
  const contents = page.getByRole('button', { name: /Contents/i }).first()
  await expect(contents).toBeVisible()
  await contents.click()

  const drawer = page.getByRole('dialog', { name: /Contents/i })
  await expect(drawer).toBeVisible()

  // The contents list is anchors, not buttons: each is a real href so it can be opened in a
  // new tab, with a click handler that intercepts a plain left click.
  await drawer.getByRole('link', { name: /Evaluation/i }).first().click()
  await expect(page).toHaveURL(/v=evaluation/)
  await page.locator('header').first().waitFor({ state: 'visible' })
  await page.waitForTimeout(600)

  // 2. The evaluation table is wider than a phone and must scroll inside its own box.
  //
  // Every clause here is asserted rather than guarded by `if`. The first version wrapped the
  // whole check in `if (await scrollBoxes.count())` and then in `if (sw > cw)`, so a page with
  // no scrollable box at all passed — which is precisely the regression this is meant to catch.
  const scrollBox = page.locator('[class*="tableScroll"]').first()
  await expect(scrollBox).toBeVisible()
  const metrics = await scrollBox.evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
    overflowX: getComputedStyle(node).overflowX,
  }))
  expect(metrics.scrollWidth, 'the table is wider than its box on a phone').toBeGreaterThan(
    metrics.clientWidth,
  )
  expect(['auto', 'scroll'], 'the box scrolls rather than clipping').toContain(metrics.overflowX)

  // 3. Scrolling that box moves it, and does not move the page.
  const beforeScroll = await page.evaluate(() => window.scrollX)
  await scrollBox.evaluate((node) => { node.scrollLeft = 120 })
  const afterScroll = await page.evaluate(() => window.scrollX)
  expect(afterScroll, 'scrolling the table does not scroll the document').toBe(beforeScroll)

  // 3. The document itself does not scroll horizontally, on any route.
  for (const route of ['overview', 'evaluation', 'countries', 'reproduce', 'glossary'] as const) {
    await gotoRoute(page, route)
    const width = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }))
    expect(width.scroll, `${route} scrolls horizontally`).toBeLessThanOrEqual(width.client + 1)
  }
})
