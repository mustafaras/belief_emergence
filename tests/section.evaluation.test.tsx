// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import EvaluationSection from '../src/sections/evaluation'
import { InspectorProvider } from '../src/claims/ClaimInspector'
import comparison from '../src/data/analysis/functional_form_comparison.json'

const renderEvaluation = () => render(<InspectorProvider><EvaluationSection /></InspectorProvider>)

describe('Evaluation section', () => {
  afterEach(() => cleanup())

  it('renders the hero comparison and the per-fold strip', () => {
    const { container } = renderEvaluation()
    // Two charts: the grouped comparison and the fold distribution.
    expect(container.querySelectorAll('svg[role="group"], svg[role="img"]').length).toBe(2)
    expect(container.textContent).toContain('Bounded vs linear across three evaluations')
    expect(container.textContent).toContain('Per-fold distribution')
  })

  it('prints the held-out gap at a precision that shows it is not zero', () => {
    const { container } = renderEvaluation()
    // 7.1e-6 at four places reads "0.0000", which contradicts the sentence saying the
    // models differ only slightly.
    const bounded = comparison.models.find((m) => m.model === 'saturating_bounded')!
    const linear = comparison.models.find((m) => m.model === 'linear_baseline')!
    const gap = Math.abs(bounded.kfold.median - linear.kfold.median)
    expect(gap).toBeGreaterThan(0)
    expect(gap).toBeLessThan(1e-4)
    expect(container.textContent).toContain(gap.toFixed(6))
  })

  it('makes both headline numbers inspectable rather than plain text', () => {
    const { container } = renderEvaluation()
    expect(container.querySelector('button[data-claim-id="eval.bounded.kfold"]')).toBeTruthy()
    expect(container.querySelector('button[data-claim-id="eval.linear.kfold"]')).toBeTruthy()
  })

  it('opens the claim inspector from the headline', async () => {
    renderEvaluation()
    fireEvent.click(screen.getByRole('button', { name: /Bounded model grouped k-fold/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Claim inspector' })
    expect(dialog.textContent).toMatch(/functional_form_comparison\.json/)
  })

  it('warns that the country-out bars are a stress test, not the primary protocol', () => {
    const { container } = renderEvaluation()
    // The bars are plotted together; without this the reader would read them as three
    // estimates of one quantity.
    expect(container.textContent).toMatch(/spatial stress test/i)
    expect(container.textContent).toMatch(/not the primary/i)
  })

  it('records that the earlier decisive-win claim was withdrawn', () => {
    const { container } = renderEvaluation()
    expect(container.textContent).toMatch(/withdrawn/i)
    expect(container.textContent).toMatch(/could not be regenerated/i)
  })

  it('plots the per-fold series it was given, not an invented shape', () => {
    const { container } = renderEvaluation()
    const bounded = comparison.models.find((m) => m.model === 'saturating_bounded')!
    // The artifact must carry the raw folds; a strip built from quartiles alone would be a
    // drawing of the summary rather than of the data.
    expect(Array.isArray(bounded.kfold.values)).toBe(true)
    expect(bounded.kfold.values.length).toBe(bounded.kfold.n)
    expect(container.textContent).toContain(String(bounded.kfold.n))
  })
})
