// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import LimitsSection from '../src/sections/limits'
import { InspectorProvider } from '../src/claims/ClaimInspector'
import { outlier2006, rCase, vifEntries } from '../src/claims/selectors/limits'

const renderLimits = () => render(<InspectorProvider><LimitsSection /></InspectorProvider>)

describe('Limits: collinearity, lockbox and 2006', () => {
  afterEach(() => cleanup())

  it('lists one VIF row per retained covariate, R first', () => {
    const { container } = renderLimits()
    const rows = [...container.querySelectorAll('tr[data-covariate]')]
    expect(rows.length).toBe(6)
    expect(rows[0].getAttribute('data-covariate')).toBe('R')
    expect(vifEntries[0].flagged).toBe(true)
    expect(vifEntries.slice(1).every((entry) => !entry.flagged)).toBe(true)
  })

  it('does not claim the lab view is the reported model without saying so', () => {
    renderLimits()
    expect(screen.queryByTestId('counterfactual-banner')).toBeNull()
    fireEvent.click(screen.getByRole('switch', { name: /Remove R/i }))
    // The banner is not decoration: while the counterfactual is on screen a reader could
    // otherwise take the lower VIF for the model this paper reports.
    expect(screen.getByTestId('counterfactual-banner')).toBeTruthy()
    expect(screen.getByTestId('lab-max-vif').textContent).toBe(rCase.withoutR.maxVif.toFixed(2))
  })

  it('shows that dropping R improves the fit, then refuses to act on it', () => {
    renderLimits()
    fireEvent.click(screen.getByRole('switch', { name: /Remove R/i }))
    // The counterfactual is genuinely better in sample and marginally better out of sample;
    // the point is that acting on it would be post-hoc specification selection.
    expect(rCase.withoutR.maxVif).toBeLessThan(rCase.withR.maxVif)
    expect(rCase.withoutR.inSampleR2).toBeLessThan(rCase.withR.inSampleR2)
    expect(screen.getByText(/post-hoc specification selection/i)).toBeTruthy()
  })

  it('reports the lockbox size without overstating what it buys', () => {
    const { container } = renderLimits()
    const text = container.textContent ?? ''
    expect(text).toMatch(/17\b/)
    expect(text).toMatch(/11\b/)
    expect(text).toMatch(/not blind/i)
    expect(text).toMatch(/do not substitute for external data/i)
  })

  it('reports the 2006 construct correlation against the median elsewhere', () => {
    renderLimits()
    expect(screen.getByTestId('year-2006-corr').textContent).toBe(outlier2006.constructCorrelation2006.toFixed(3))
    expect(outlier2006.constructCorrelation2006).toBeLessThan(outlier2006.constructCorrelationMedian)
    // The median appears in both the prose and the card, so query all rather than one.
    expect(screen.getAllByText(/0\.932/).length).toBeGreaterThan(0)
  })
})
