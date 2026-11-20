// @vitest-environment jsdom
import { cleanup, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ModelSection from '../src/sections/model'
import { InspectorProvider } from '../src/claims/ClaimInspector'
import { signDiagnosticsData } from '../src/claims/selectors/model'

const renderModel = () => render(<InspectorProvider><ModelSection /></InspectorProvider>)

describe('Model section', () => {
  afterEach(() => cleanup())

  it('renders the four equivalent forms as KaTeX', () => {
    const { container } = renderModel()
    // Saturation, logit and logistic are one model stated four ways; the section must show all
    // four or the claim that they are equivalent is unsupported by the page.
    expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(4)
  })

  it('separates estimated terms from named-but-not-estimated ones', () => {
    const { container } = renderModel()
    const estimated = container.querySelector('[aria-label="Estimated terms in the field"]')
    const withdrawn = container.querySelector('[aria-label="Withdrawn terms"]')
    expect(within(estimated as HTMLElement).getAllByRole('listitem')).toHaveLength(6)
    expect(within(withdrawn as HTMLElement).getAllByRole('listitem')).toHaveLength(4)
    // The withdrawn chips must say why, not merely look struck through.
    expect((withdrawn as HTMLElement).textContent).toMatch(/not computable/)
    expect((withdrawn as HTMLElement).textContent).toMatch(/does not load|do not load/i)
  })

  it('marks exactly the terms whose bootstrap interval excludes zero as identified', () => {
    const { container } = renderModel()
    const rows = [...container.querySelectorAll('tbody tr[data-term]')]
    expect(rows).toHaveLength(6)
    const identified = rows.filter((row) => row.textContent?.includes('identified') && !row.textContent?.includes('not identified'))
    expect(identified.map((row) => row.getAttribute('data-term')).sort()).toEqual(['E', 'yr'])
  })

  it('reports the M row with both quantities rather than only the flip', () => {
    const { container } = renderModel()
    const text = container.textContent ?? ''
    // The prompt's shorthand is true of the marginal association and false of the partial
    // coefficient. Printing either alone would state something the artifact does not.
    expect(text).toContain(signDiagnosticsData.finding.statement)
    expect(signDiagnosticsData.finding.marginalFlips).toBe(true)
    expect(signDiagnosticsData.finding.partialFlips).toBe(false)
    expect(signDiagnosticsData.finding.partialIdentified).toBe(false)
  })

  it('gives every estimated term a clickable coefficient', () => {
    const { container } = renderModel()
    for (const key of ['M', 'T', 'E', 'R', 'tr', 'yr']) {
      expect(container.querySelector(`[data-claim-id="model.c.${key}"]`)).toBeTruthy()
    }
  })

  it('renders one specification card per tier plus the linear baseline', () => {
    const { container } = renderModel()
    expect(container.querySelectorAll('article').length).toBe(4)
  })
})
