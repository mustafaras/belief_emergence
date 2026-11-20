import { expect, test } from '@playwright/test'
import { gotoRoute } from './helpers'

/**
 * The replicator's journey: find a number, learn where it came from, read the file.
 *
 * This is the path a reviewer takes when they doubt a figure. It has three steps and each one
 * is a different component — the command palette, the claim inspector, the artifact drawer —
 * so a break in any of them leaves the number inspectable in principle and not in practice.
 */
test('⌘K → claim → inspector → artifact JSON', async ({ page }) => {
  await gotoRoute(page, 'evaluation')

  // 1. Open the palette from the keyboard, the way it is advertised.
  await page.keyboard.press('Meta+k')
  const palette = page.getByRole('dialog', { name: /command palette/i })
  const opened = await palette.isVisible().catch(() => false)
  if (!opened) {
    // Linux and Windows bind Ctrl; `Meta` alone is macOS-only.
    await page.keyboard.press('Control+k')
  }
  await expect(palette).toBeVisible()

  // 2. Search for the k-fold artifact and choose it.
  const search = palette.getByRole('searchbox').or(palette.locator('input')).first()
  await search.fill('kfold')
  await page.waitForTimeout(400)

  // The first result is the artifact itself, which navigates straight to the file. The journey
  // under test is the claim path — value → inspector → provenance → file — so a claim result is
  // chosen deliberately rather than taking whatever sorts first.
  const results = palette.getByRole('list', { name: /search results/i })
  // Results carry a kind label in their first span; the artifact itself sorts first and would
  // navigate away from the journey under test.
  const buttons = results.locator('button')
  const kinds = await buttons.locator('span:first-child').allInnerTexts()
  const claimIndex = kinds.findIndex((kind) => kind.trim() === 'CLAIM')
  expect(claimIndex, 'the palette offers at least one claim for "kfold"').toBeGreaterThanOrEqual(0)
  await buttons.nth(claimIndex).click()

  // 3. The inspector opens on the claim, not on the page that contained it.
  const inspector = page.getByRole('dialog')
  await expect(inspector.first()).toBeVisible()

  // 4. "Open artifact" leads to the JSON, and the JSON is the committed file.
  const openArtifact = page.getByRole('link', { name: /open artifact/i }).first()
  await expect(openArtifact).toBeVisible()
  await openArtifact.click()

  await expect(page).toHaveURL(/artifact=/)
  // The drawer renders the artifact's own keys; `aggregatesCanonical` is in cv_kfold.json and
  // in nothing else, so finding it proves the payload was read rather than the path echoed.
  const tree = page.getByRole('tree')
  await expect(tree).toBeVisible()
  await expect(tree.getByText(/aggregatesCanonical/)).toBeVisible()
})
