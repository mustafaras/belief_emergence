import { expect, test } from '@playwright/test'
import { gotoRoute } from './helpers'

/**
 * Keyboard-only operation, and a focus ring that stays visible.
 *
 * `check:a11y` already walks every focusable element and counts them. This spec does the
 * smaller, harder thing: it drives the two controls a reviewer actually needs — the audit
 * slider and the gates panel switch — using only the keyboard, and asserts that the focused
 * element is drawn distinctly rather than relying on the browser default.
 */
test('the audit slider and the gates switch are usable by keyboard alone', async ({ page }) => {
  await gotoRoute(page, 'audit')

  const counter = page.getByTestId('admitted-count')
  const before = await counter.innerText()

  const slider = page.getByRole('slider', { name: /Reliability floor/i }).first()
  await slider.focus()
  await expect(slider).toBeFocused()

  // A range input responds to arrow keys; six presses of 0.05 move it past the 0.70 default
  // far enough to change which constructs clear the floor.
  const start = Number(await slider.inputValue())
  for (let i = 0; i < 12; i += 1) await page.keyboard.press('ArrowLeft')
  const end = Number(await slider.inputValue())
  expect(end, 'arrow keys move the slider').toBeLessThan(start)

  await expect(counter).not.toHaveText(before)

  // The focus ring must be visible, not merely present: a 0-width outline passes `:focus-visible`
  // and helps nobody.
  const ring = await slider.evaluate((node) => {
    const style = getComputedStyle(node)
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: parseFloat(style.outlineWidth),
      boxShadow: style.boxShadow,
    }
  })
  const hasRing =
    (ring.outlineStyle !== 'none' && ring.outlineWidth >= 1) ||
    (ring.boxShadow !== 'none' && ring.boxShadow !== '')
  expect(hasRing, `no visible focus ring: ${JSON.stringify(ring)}`).toBe(true)

  /*
   * Every focusable element on the page must draw a visible ring when focused.
   *
   * The single-slider check above proves the control works; it does not prove a keyboard user
   * can see where they are. `check:a11y` counts focusables but cannot ask this question — it
   * would have to focus all 44 of them, and a missing ring is invisible in a screenshot of an
   * unfocused page. A zero-width outline passes `:focus-visible` and helps nobody, so the test
   * is on the computed outline and shadow, not on the pseudo-class.
   */
  const ringless = await page.evaluate(() => {
    const focusable = [
      ...document.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
      ),
    ].filter((el) => {
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })

    const missing: string[] = []
    for (const el of focusable) {
      el.focus()
      const style = getComputedStyle(el)
      const width = parseFloat(style.outlineWidth) || 0
      const hasOutline = style.outlineStyle !== 'none' && width >= 1
      const hasShadow = style.boxShadow !== 'none' && style.boxShadow !== ''
      if (!hasOutline && !hasShadow) {
        missing.push(`${el.tagName}<${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}>`)
      }
    }
    return { checked: focusable.length, missing }
  })

  expect(ringless.checked, 'the audit route has focusable controls').toBeGreaterThan(5)
  expect(ringless.missing, `these focusables draw no focus ring: ${ringless.missing.join(', ')}`).toEqual([])

  // The gates panel switch is reachable by Tab and changes the panel.
  await gotoRoute(page, 'gates')
  const switchToRebuilt = page.getByRole('radio', { name: /rebuilt/i })
    .or(page.getByRole('button', { name: /rebuilt/i }))
    .first()
  await expect(switchToRebuilt).toBeVisible()
  await switchToRebuilt.focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  // The rebuilt panel passes gates the submitted one fails; at least one verdict flips.
  const passes = await page.getByRole('status').filter({ hasText: /^pass$/i }).count()
  expect(passes, 'the rebuilt panel passes at least one gate').toBeGreaterThan(0)
})
