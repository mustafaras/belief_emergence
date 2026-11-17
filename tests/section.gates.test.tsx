// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import GatesSection from '../src/sections/gates'
import { designGateData } from '../src/claims/selectors/gates'
import { InspectorProvider } from '../src/claims/ClaimInspector'

const renderGates = () => render(<InspectorProvider><GatesSection /></InspectorProvider>)

describe('Design Gates section', () => {
  afterEach(() => {
    cleanup()
    window.history.replaceState(null, '', '/belief_emergence/')
  })

  it('opens on the original panel with all four gates failing', () => {
    renderGates()
    expect(screen.getByTestId('gate-summary').textContent).toBe('0')
    const badges = screen.getAllByText('Fail')
    expect(badges.length).toBe(4)
    expect(designGateData.original.allPass).toBe(false)
  })

  it('switches to the rebuilt panel and reports four passes', () => {
    renderGates()
    fireEvent.click(screen.getByRole('radio', { name: 'Rebuilt panel' }))
    expect(screen.getByTestId('gate-summary').textContent).toBe('4')
    expect(screen.getAllByText('Pass').length).toBe(4)
    expect(designGateData.rebuilt.allPass).toBe(true)
  })

  it('writes the panel choice to the query string and reads it back', () => {
    renderGates()
    fireEvent.click(screen.getByRole('radio', { name: 'Rebuilt panel' }))
    expect(window.location.search).toContain('panel=rebuilt')
    fireEvent.click(screen.getByRole('radio', { name: 'Original panel' }))
    // The default is the original panel, so the key is dropped rather than set to it.
    expect(window.location.search).not.toContain('panel=')
  })

  it('renders a claim-backed measured value for every gate', () => {
    const { container } = renderGates()
    for (const id of ['identity', 'duplicates', 'rank', 'singlePredictor']) {
      expect(container.querySelector(`[data-claim-id="gates.original.${id}"]`)).toBeTruthy()
    }
    fireEvent.click(screen.getByRole('radio', { name: 'Rebuilt panel' }))
    for (const id of ['identity', 'duplicates', 'rank', 'singlePredictor']) {
      expect(container.querySelector(`[data-claim-id="gates.rebuilt.${id}"]`)).toBeTruthy()
    }
  })

  it('states whether the upstream deviation was measured or recorded', () => {
    const { container } = renderGates()
    const text = container.textContent ?? ''
    // A clean clone cannot read rawdata/, so the artifact carries `source`. The page must
    // say which one happened rather than presenting a recorded figure as measured.
    const source = designGateData.originalProvenance.upstreamIdentity.source
    expect(text).toMatch(source === 'recomputed' ? /recomputed here from/ : /recorded rather than recomputed/)
    expect(text).toContain('originalProvenance')
  })
})
