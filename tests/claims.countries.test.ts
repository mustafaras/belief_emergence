import { describe, expect, it } from 'vitest'
import { selectCountries, selectCountryFailureLists } from '../src/claims/selectors/countries'

describe('country alignment selector', () => {
  it('maps all 83 source rows into the table contract and validates preset coverage', () => {
    const countries = selectCountries()
    expect(countries).toHaveLength(83)
    expect(countries.filter(country => country.isPreset)).toHaveLength(34)
    expect(countries.find(country => country.iso3 === 'CHN')).toMatchObject({
      iso3: 'CHN',
      name: 'China',
      years: 3,
      zObs: 0.9890435643770834,
      zPred: 0.4669518739766086,
      mae: 0.5220916904004748,
      verdict: 'poor',
      isPreset: true
    })
  })

  it("returns the artifact's preset and all-country failure sets at MAE above 0.25", () => {
    expect(selectCountryFailureLists()).toEqual({
      preset: ['CHN', 'CZE', 'FRA', 'GEO', 'ITA', 'POL'],
      all: ['CHN', 'CZE', 'FRA', 'GEO', 'ITA', 'PSE', 'POL', 'UGA', 'VNM']
    })
  })
})
