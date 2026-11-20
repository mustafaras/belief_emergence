// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AuditReplay } from '../src/sections/overview/AuditReplay'
import { designGateData, GATE_ORDER } from '../src/claims/selectors/gates'
import { InspectorProvider } from '../src/claims/ClaimInspector'

const renderReplay = () => render(<InspectorProvider><AuditReplay /></InspectorProvider>)

describe('Audit replay', () => {
  afterEach(() => cleanup())

  it('opens with no gate passing, because the replay starts at the submitted panel', () => {
    renderReplay()
    // Step 0 is the published panel: every gate failed on it, and the replay may not start
    // from the repaired state or the reader loses the before/after contrast.
    expect(screen.getByTestId('replay-passing').textContent).toBe('0')
    expect(designGateData.original.allPass).toBe(false)
  })

  it('renders one panel-state row per gate', () => {
    const { container } = renderReplay()
    const rows = container.querySelectorAll('ul li')
    expect(rows.length).toBe(GATE_ORDER.length)
    for (const label of ['restates the outcome', 'duplicates', 'full rank', 'single predictor']) {
      expect(container.textContent).toMatch(new RegExp(label, 'i'))
    }
  })

  it('names what each step repairs and withdraws', () => {
    const { container } = renderReplay()
    const text = container.textContent ?? ''
    expect(text).toMatch(/Cultural intensity/)
    expect(text).toMatch(/Social atomization/)
    expect(text).toMatch(/Not computable: social support/)
  })

  it('derives the model comparison rather than typing it', () => {
    const { container } = renderReplay()
    // The bounded-vs-linear gap is 7.1e-6. Printed at four places it reads "0.0000", which is
    // both a tie and a zero depending on the sentence around it; the replay shows six.
    expect(container.textContent).toContain('0.000007')
  })

  it('offers a step button for every step, including the starting state', () => {
    const { container } = renderReplay()
    const nav = container.querySelector('nav[aria-label="Replay steps"]')
    expect(nav?.querySelectorAll('button').length).toBe(5)
  })
})
