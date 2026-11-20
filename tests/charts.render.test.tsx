// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  Calibration,
  CompareBars,
  DistStrip,
  Funnel,
  Heatmap,
  HexScatter,
  LineProfile
} from '../src/charts'

function expectChart(title: string, rowCount: number, role: 'img' | 'group' = 'img') {
  const chart = screen.getByRole(role, { name: title })
  const figure = chart.closest('figure')
  expect(figure).not.toBeNull()
  const table = within(figure as HTMLElement).getByRole('table')
  expect(table.querySelectorAll('tbody tr')).toHaveLength(rowCount)
  expect(within(figure as HTMLElement).getByText(title, { exact: true, selector: 'figcaption' })).toBeTruthy()
}

describe('accessible chart kit', () => {
  it('renders grouped bars with a matching data table', () => {
    render(<CompareBars
      title="Model comparison"
      description="Grouped model scores."
      groups={[{ label: 'Observed', values: [{ series: 'linear', value: 0.4 }, { series: 'bounded', value: 0.5 }] }, { label: 'Holdout', values: [{ series: 'linear', value: 0.3 }, { series: 'bounded', value: 0.45 }] }]}
      series={[{ key: 'linear', label: 'Linear', color: 'var(--linear)' }, { key: 'bounded', label: 'Bounded', color: 'var(--accent)' }]}
    />)
    expectChart('Model comparison', 2)
  })

  it('renders distribution summaries and a matching data table', () => {
    render(<DistStrip title="Fold distribution" description="Scores by model."
      series={[{ key: 'a', label: 'Tier A', color: 'var(--tier-a)', values: [0.2, 0.4, 0.5, 0.8] }, { key: 'b', label: 'Tier B', color: 'var(--tier-b)', values: [0.1, 0.3, 0.6, 0.7] }]}
    />)
    expectChart('Fold distribution', 2)
  })

  it('renders line profiles with one table row per point', () => {
    render(<LineProfile title="Profile" description="Predicted response."
      points={[{ x: 1, y: 0.2 }, { x: 2, y: 0.4 }, { x: 3, y: 0.7 }]}
      xLabel="Input" yLabel="Response"
    />)
    expectChart('Profile', 3)
  })

  it('renders heatmaps with one table row per source row', () => {
    render(<Heatmap title="Support map" description="Country by year support."
      rows={['A', 'B']} cols={['1990', '2000', '2010']} values={[[0.1, 0.2, null], [0.3, 0.4, 0.5]]}
      scale="viridis" legendLabel="Support"
    />)
    expectChart('Support map', 2)
  })

  it('renders funnel steps with a matching data table', () => {
    render(<Funnel title="Evidence funnel" description="Rows retained at each audit stage."
      steps={[{ label: 'Respondents', claimId: 'audit.respondents', unit: 'respondents' }, { label: 'Country-years', claimId: 'audit.countryYears', unit: 'country-years' }, { label: 'Outcome cells', claimId: 'audit.Z.cells', unit: 'country-years' }, { label: 'Panel rows', claimId: 'data.panelRows', unit: 'country-years' }]}
    />)
    expectChart('Evidence funnel', 4, 'group')
    expect(screen.getByText('−18 lost')).toBeTruthy()
    expect(screen.getByText('−80 lost')).toBeTruthy()
    expect(screen.queryByText('−441,721 lost')).toBeNull()
  })

  it('renders hex scatter points with a matching data table', () => {
    render(<HexScatter title="Country observations" description="Observed and predicted values."
      points={[{ x: 0.1, y: 0.2 }, { x: 0.2, y: 0.3 }, { x: 0.6, y: 0.5 }, { x: 0.8, y: 0.7 }]}
      xLabel="Observed" yLabel="Predicted"
    />)
    expectChart('Country observations', 4)
  })

  it('renders calibration points with a matching data table', () => {
    render(<Calibration title="Calibration" description="Predicted against observed."
      points={[{ predicted: 0.2, observed: 0.25 }, { predicted: 0.5, observed: 0.48 }, { predicted: 0.8, observed: 0.82 }]}
    />)
    expectChart('Calibration', 3)
  })

  it('shows an ErrorState for empty data', () => {
    render(<CompareBars title="Empty comparison" description="No rows." groups={[]} series={[]} />)
    expect(screen.getByRole('alert').textContent).toContain('No data')
  })
})
