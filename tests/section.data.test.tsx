// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InspectorProvider } from '../src/claims/ClaimInspector'
import type { PanelRowCanonical } from '../src/types/panel'
import DataSection from '../src/sections/data'
import blockers from '../src/data/analysis/covariate_blocker_attribution.json'
import { buildSupportMatrix } from '../src/sections/data/supportMatrix'

const { panelRows } = vi.hoisted(() => ({
  panelRows: [
    { iso3: 'USA', country_name: 'United States', year: 1990, Z: 0.1, X: 0.2, Y: 0.3, C: null, M: 0.4, T: 0.5, D: null, G: null, E: 0.6, S: null, R: 0.7 },
    { iso3: 'USA', country_name: 'United States', year: 1992, Z: 0.2, X: 0.3, Y: 0.4, C: null, M: 0.5, T: 0.6, D: null, G: null, E: 0.7, S: null, R: 0.8 },
    { iso3: 'CAN', country_name: 'Canada', year: 1991, Z: 0.3, X: 0.4, Y: 0.5, C: null, M: 0.6, T: 0.7, D: null, G: null, E: 0.8, S: null, R: 0.9 },
    { iso3: 'CAN', country_name: 'Canada', year: 1992, Z: 0.4, X: 0.5, Y: 0.6, C: null, M: 0.7, T: 0.8, D: null, G: null, E: 0.9, S: null, R: 1.0 },
    { iso3: 'FRA', country_name: 'France', year: 1990, Z: 0.5, X: 0.6, Y: 0.7, C: null, M: 0.8, T: 0.9, D: null, G: null, E: 1.0, S: null, R: 1.1 },
  ] as PanelRowCanonical[],
}))

vi.mock('../src/contexts/DataContext', () => ({
  useDataContext: () => ({ panelData: panelRows, loading: false, error: null }),
}))

describe('Data & Support section', () => {
  afterEach(() => cleanup())

  it('orders countries by row count and represents missing country-years as blank cells', () => {
    const matrix = buildSupportMatrix(panelRows)
    expect(matrix.countries).toEqual([
      { iso3: 'CAN', rowCount: 2 },
      { iso3: 'USA', rowCount: 2 },
      { iso3: 'FRA', rowCount: 1 },
    ])
    expect(matrix.years).toEqual([1990, 1991, 1992])
    expect(matrix.values).toEqual([
      [null, 1, 1],
      [1, null, 1],
      [1, null, null],
    ])
  })

  it('renders the four funnel claims as inspectable values, the blocker bars, and the DataContext support map', async () => {
    const { container } = render(<InspectorProvider><DataSection /></InspectorProvider>)

    expect(screen.getByRole('heading', { level: 1, name: 'Data & Support' })).toBeTruthy()
    for (const claimId of ['audit.respondents', 'audit.countryYears', 'audit.Z.cells', 'data.panelRows']) {
      expect(container.querySelector(`[data-claim-id="${claimId}"]`)).toBeTruthy()
    }
    expect(screen.getByRole('img', { name: 'Canonical panel support by country and year' })).toBeTruthy()

    // Figure 1.2 is now plotted from the attribution artifact. The two series are
    // asserted separately because the whole point of the figure is that the
    // overlapping counts do not sum to the frame while the disjoint ones do.
    const blockerChart = screen.getByRole('group', { name: 'Covariate blocker counts' })
    const blockerRows = blockerChart.closest('figure')?.querySelector('table')?.textContent ?? ''
    expect(blockerRows).toContain('Cells short of this driver')
    expect(blockerRows).toContain('Cells attributed on first failure')
    expect(screen.queryByText(/No blocker counts are shown/)).toBeNull()
    for (const covariate of ['X', 'Y', 'T', 'E', 'R', 'M']) {
      if (blockers.exposure.some(row => row.covariate === covariate)) {
        expect(container.querySelector(`[data-claim-id="data.blocker.${covariate}.exposure"]`)).toBeTruthy()
      }
    }

    expect(screen.getByRole('group', { name: 'Canonical panel support by country and year; scroll horizontally to inspect every year' }).getAttribute('tabindex')).toBe('0')
    const heatmap = screen.getByRole('img', { name: 'Canonical panel support by country and year' })
    const axisLabels = Array.from(heatmap.querySelectorAll('text'), node => node.textContent)
    expect(axisLabels).toContain('1990')
    expect(axisLabels).not.toContain('1991')
    expect(axisLabels).toContain('1992')
    expect(heatmap.closest('figure')?.querySelector('table')?.textContent).toContain('1991')

    fireEvent.click(screen.getByRole('button', { name: 'Respondents scanned: 442,026' }))
    const dialog = await screen.findByRole('dialog', { name: 'Claim inspector' })
    expect(dialog.textContent).toContain('wvs_construct_audit.json')
    expect(dialog.textContent).toContain('respondentsScanned')
  })
})
