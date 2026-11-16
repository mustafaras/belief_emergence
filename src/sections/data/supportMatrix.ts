import type { PanelRowCanonical } from '../../types/panel'

export type SupportMatrix = {
  countries: Array<{ iso3: string; rowCount: number }>
  years: number[]
  values: Array<Array<1 | null>>
}

export function buildSupportMatrix(panelRows: readonly PanelRowCanonical[]): SupportMatrix {
  if (panelRows.length === 0) return { countries: [], years: [], values: [] }

  const countries = new Map<string, { rowCount: number; years: Set<number> }>()
  const observedYears = new Set<number>()

  for (const row of panelRows) {
    const country = countries.get(row.iso3) ?? { rowCount: 0, years: new Set<number>() }
    country.rowCount += 1
    country.years.add(row.year)
    countries.set(row.iso3, country)
    observedYears.add(row.year)
  }

  const minimumYear = Math.min(...observedYears)
  const maximumYear = Math.max(...observedYears)
  const years = Array.from({ length: maximumYear - minimumYear + 1 }, (_, index) => minimumYear + index)
  const orderedCountries = [...countries.entries()]
    .map(([iso3, summary]) => ({ iso3, rowCount: summary.rowCount, observedYears: summary.years }))
    .sort((left, right) => right.rowCount - left.rowCount || left.iso3.localeCompare(right.iso3))

  return {
    countries: orderedCountries.map(({ iso3, rowCount }) => ({ iso3, rowCount })),
    years,
    values: orderedCountries.map(country => years.map(year => country.observedYears.has(year) ? 1 : null))
  }
}
