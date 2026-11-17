// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ProtocolsSection from '../src/sections/evaluation/Protocols'
import { InspectorProvider } from '../src/claims/ClaimInspector'
import { seedDeltas, kfoldFoldSeries } from '../src/claims/selectors/protocols'

const renderProtocols = () => render(<InspectorProvider><ProtocolsSection /></InspectorProvider>)

describe('Evaluation protocols', () => {
  afterEach(() => {
    cleanup()
    window.history.replaceState(null, '', '/belief_emergence/')
  })

  it('offers four protocol tabs and mirrors the selection into the URL', () => {
    renderProtocols()
    expect(screen.getAllByRole('tab')).toHaveLength(4)
    fireEvent.click(screen.getByRole('tab', { name: /Coverage/ }))
    expect(window.location.search).toContain('tab=coverage')
    // The default tab is dropped rather than written, so a clean link stays clean.
    fireEvent.click(screen.getByRole('tab', { name: /Grouped k-fold/ }))
    expect(window.location.search).not.toContain('tab=')
  })

  it('reports how many seeds put Tier C behind Tier B', () => {
    renderProtocols()
    const fails = seedDeltas.filter((entry) => !entry.cAhead).length
    expect(screen.getByTestId('seed-fails').textContent).toBe(String(fails))
    // The count is the section's argument, so it must be a majority here; if it ever stopped
    // being one, the prose calling C exploratory for this reason would be wrong.
    expect(fails).toBeGreaterThan(seedDeltas.length / 2)
  })

  it('updates the per-seed readout when the seed changes', () => {
    renderProtocols()
    const first = seedDeltas[0]
    expect(screen.getByTestId('seed-delta').textContent).toContain(first.delta.toFixed(3).replace('-', '−'))
    const options = screen.getAllByRole('radio')
    fireEvent.click(options[options.length - 1])
    const last = seedDeltas[seedDeltas.length - 1]
    expect(screen.getByTestId('seed-delta').textContent).toContain(Math.abs(last.delta).toFixed(3))
  })

  it('plots the raw fold series it was given', () => {
    const { container } = renderProtocols()
    // 100 folds per tier: a strip drawn from quartiles would carry three rows, not 100 marks.
    expect(kfoldFoldSeries('A').length).toBe(100)
    expect(container.textContent).toContain('100')
  })

  it('badges Tier C as exploratory in the tier row and the ladder table', () => {
    renderProtocols()
    const badges = screen.getAllByText('exploratory')
    expect(badges.length).toBeGreaterThanOrEqual(2)
  })

  it('states that the country-out per-fold median is degenerate', () => {
    renderProtocols()
    fireEvent.click(screen.getByRole('tab', { name: /Leave-one-country-out/ }))
    expect(screen.getByText(/Degenerate/i)).toBeTruthy()
    expect(screen.getByText(/Pooled R²/i)).toBeTruthy()
  })
})
