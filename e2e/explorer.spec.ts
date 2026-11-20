import { expect, test } from '@playwright/test'
import { gotoRoute } from './helpers'

/**
 * The explorer's journey: a country's rows feed the geometry lab, and the withdrawn channels
 * stay withdrawn.
 *
 * Three properties, each of which a static check would miss because all three depend on state
 * carried across a navigation: the ISO code arrives, the sliders are filled from it, and the
 * channels the construct audit removed are still absent from the controls.
 */
test('countries → TUR → geometry lab is prefilled and still refuses the withdrawn channels', async ({ page }) => {
  await gotoRoute(page, 'countries')

  // 1. Find Turkey in the table. The search box narrows it, which is how a reader would.
  const search = page.locator('input[type="search"]').first()
  await search.fill('TUR')
  await page.waitForTimeout(400)

  const row = page.locator('tr', { hasText: 'TUR' }).first()
  await expect(row).toBeVisible()
  await row.getByRole('button').first().click()

  // 2. The drawer offers the geometry lab for this country.
  const link = page.getByRole('link', { name: /Open in Geometry Lab/i }).first()
  await expect(link).toBeVisible()
  await link.click()

  await expect(page).toHaveURL(/v=geometry/)
  await expect(page).toHaveURL(/iso=TUR/)

  // 3. The sliders are filled from the country's mean row rather than left at the defaults.
  const sliders = page.getByRole('slider')
  await expect(sliders.first()).toBeVisible()
  const values = await sliders.evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLInputElement).value),
  )
  expect(values.length, 'six retained channels have controls').toBe(6)
  expect(new Set(values).size, 'the values are not all the default').toBeGreaterThan(1)

  // 4. The four withdrawn channels have no slider, and the locked list explains why.
  const labels = await page.getByRole('slider').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('aria-label') ?? ''),
  )
  for (const withdrawn of ['C', 'D', 'G', 'S']) {
    const present = labels.some((label) => new RegExp(`\\b${withdrawn}\\b`).test(label))
    expect(present, `${withdrawn} must not have a control`).toBe(false)
  }
  await expect(page.getByText(/withdrawn/i).first()).toBeVisible()
})
