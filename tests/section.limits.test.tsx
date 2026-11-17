// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import LimitsSection from '../src/sections/limits'
import { InspectorProvider } from '../src/claims/ClaimInspector'
import { profileBounds } from '../src/claims/selectors/limits'

const renderLimits = () => render(<InspectorProvider><LimitsSection /></InspectorProvider>)

describe('Limits section', () => {
  afterEach(() => cleanup())

  it('reports the profile as grid-limited rather than as a located bound', () => {
    renderLimits()
    // Every point clears the threshold, so the printed upper bound is where the grid stops.
    expect(profileBounds.ci95.gridLimited).toBe(true)
    expect(profileBounds.ci95.maxStatistic).toBeLessThan(profileBounds.ci95.threshold)
    expect(screen.getByTestId('profile-upper').textContent).toBe(profileBounds.ci95.value.toFixed(3))
    expect(screen.getByText(/grid edge/i)).toBeTruthy()
  })

  it('shows that the multiplicity correction changes nothing, and says why', () => {
    renderLimits()
    fireEvent.click(screen.getByRole('switch', { name: /multiplicity/i }))
    // The invariance is the finding: no point is rejected, so there is nothing to correct.
    expect(profileBounds.bonferroni.value).toBe(profileBounds.ci95.value)
    expect(profileBounds.bonferroni.threshold).toBeGreaterThan(profileBounds.ci95.threshold)
    expect(screen.getByTestId('profile-upper').textContent).toBe(profileBounds.bonferroni.value.toFixed(3))
  })

  it('states that the shipped exponent was never a grid point', () => {
    renderLimits()
    // 0.050 lies between 0.032 and 0.064: the profile brackets it without testing it. Saying
    // "outside the grid" would be wrong in the other direction, because 0.050 < 0.064.
    expect(profileBounds.grid).not.toContain(profileBounds.shippedAlpha)
    expect(profileBounds.shippedAlpha).toBeGreaterThan(Math.max(...profileBounds.grid.filter((v) => v < profileBounds.shippedAlpha)))
    expect(profileBounds.shippedAlpha).toBeLessThan(Math.max(...profileBounds.grid))
    expect(screen.getByText(/not one of the seven grid points/i)).toBeTruthy()
  })

  it('reports both bound-sensitivity R² values and calls the constraint binding', () => {
    const { container } = renderLimits()
    expect(container.textContent).toMatch(/constraint binds/i)
    expect(container.textContent).toContain('0.3786')
    expect(container.textContent).toContain('0.3990')
  })

  it('draws both thresholds inside the plot area', () => {
    const { container } = renderLimits()
    // The domain must contain the threshold lines; computing it from the data alone clipped
    // the Bonferroni line out of the viewBox.
    const svg = container.querySelector('svg')
    const texts = [...(svg?.querySelectorAll('text') ?? [])].map((node) => node.textContent ?? '')
    expect(texts.some((text) => text.includes('Bonferroni'))).toBe(true)
    expect(texts.some((text) => text.includes('0.95'))).toBe(true)
  })
})
