// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import cvKfoldArtifact from '../src/data/analysis/cv_kfold.json'
import { getClaim } from '../src/claims/registry'
import { selectEvaluationSeries } from '../src/claims/selectors/evaluation'

describe('evaluation claims', () => {
  it('uses current functional-form and grouped k-fold artifact values', () => {
    expect(getClaim('eval.linear.inSample').value).toBeCloseTo(0.462273068, 9)
    expect(getClaim('eval.bounded.inSample').value).toBeCloseTo(0.406140133, 9)
    expect(getClaim('eval.linear.kfold').value).toBeCloseTo(0.407413296, 9)
    expect(getClaim('eval.bounded.kfold').value).toBeCloseTo(0.407420431, 9)
    expect(getClaim('eval.kfold.median.A').value).toBeCloseTo(0.407420431, 9)
    expect(getClaim('eval.kfold.median.B').value).toBeCloseTo(0.521620596, 9)
    expect(getClaim('eval.kfold.median.C').value).toBeCloseTo(0.482417536, 9)
    expect(getClaim('eval.kfold.folds').value).toBe(100)
  })

  it('uses the authoritative headline and protocol coverage artifacts', () => {
    expect(getClaim('eval.headline.corr').value).toBeCloseTo(0.639340222, 9)
    expect(getClaim('eval.headline.mae').value).toBeCloseTo(0.138743267, 9)
    expect(getClaim('eval.headline.rmse').value).toBeCloseTo(0.1799492054, 10)
    expect(getClaim('eval.headline.bias').value).toBeCloseTo(0.00482700884, 10)
    expect(getClaim('eval.headline.bias').format).toBe('p4')
    expect(getClaim('eval.coverage.rolling.A').value).toBeCloseTo(0.867404762, 9)
    expect(getClaim('eval.coverage.rolling.B.underRate').value).toBe(0.48)
    expect(getClaim('eval.coverage.countryOut.C').value).toBeCloseTo(0.907630522, 9)
    expect(getClaim('eval.coverage.countryOut.A.underRate').value).toBeCloseTo(0.156626506, 9)
  })

  it('reports paired model differences without an independence or significance claim', () => {
    expect(getClaim('eval.paired.n').value).toBe(100)
    expect(getClaim('eval.paired.shareBoundedAhead').value).toBe(0.56)
    expect(getClaim('eval.paired.median').value).toBeCloseTo(0.000001926431755, 14)
    expect(getClaim('eval.paired.median').note).toContain('no significance test')
  })

  it('keeps seed-resolved refit fold data for charts', () => {
    const series = selectEvaluationSeries()
    expect(series).toHaveLength(300)
    expect(new Set(series.map(point => point.seed).values())).toHaveProperty('size', 20)
    expect(series.slice(0, 3).map(point => [point.tier, point.seed, point.repeat, point.foldIndex, point.r2])).toEqual([
      ['A', 20260101, 0, 0, cvKfoldArtifact.folds[0].tierResults.A.testMetricsRefit.r2],
      ['B', 20260101, 0, 0, cvKfoldArtifact.folds[0].tierResults.B.testMetricsRefit.r2],
      ['C', 20260101, 0, 0, cvKfoldArtifact.folds[0].tierResults.C.testMetricsRefit.r2]
    ])

    for (const tier of ['A', 'B', 'C'] as const) {
      const values = series.filter(point => point.tier === tier).map(point => point.r2).sort((a, b) => a - b)
      expect(values).toHaveLength(100)
      const median = (values[49] + values[50]) / 2
      expect(median).toBeCloseTo(getClaim(`eval.kfold.median.${tier}`).value, 10)
    }
  })

  it('sources tier fit and C-minus-B summaries from their current artifacts', () => {
    expect(getClaim('eval.tier.inSample.A').value).toBeCloseTo(0.462273066, 9)
    expect(getClaim('eval.tier.inSample.B').value).toBeCloseTo(0.559057473, 9)
    expect(getClaim('eval.tier.inSample.C').value).toBeCloseTo(0.563414150, 9)
    expect(getClaim('eval.tier.cMinusB.median').value).toBe(-0.039203)
    expect(getClaim('eval.tier.cMinusB.repeatMedian').value).toBe(-0.007917)
  })
})
