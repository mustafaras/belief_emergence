// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import evaluationSummary from '../src/data/analysis/evaluation_summary.json'
import { getClaim } from '../src/claims/registry'

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

  /*
   * The tier medians must equal the median of the per-fold series they summarise.
   *
   * This used to read `cv_kfold.json` directly, which put a 289 KiB artifact on the landing
   * route — 68% of the initial payload — to check four numbers. The projection carries the same
   * series, so the same arithmetic is still checked, and the claim now points at the file it
   * actually reads. What is lost is the seed resolved per fold data (repeat, fold index, seed):
   * `selectEvaluationSeries` was its only reader, no component imported it, and it went with
   * the artifact.
   */
  it('sources each tier median from the series it summarises', () => {
    for (const tier of ['A', 'B', 'C'] as const) {
      const values = [...evaluationSummary.kfold.series[tier]].sort((a, b) => a - b)
      expect(values).toHaveLength(100)
      const median = (values[49] + values[50]) / 2
      expect(median).toBeCloseTo(getClaim(`eval.kfold.median.${tier}`).value, 10)
    }
    expect(evaluationSummary.kfold.folds).toBe(getClaim('eval.kfold.folds').value)
    expect(new Set(evaluationSummary.seeds.map((entry) => entry.seed)).size).toBe(20)
  })

  it('sources tier fit and C-minus-B summaries from their current artifacts', () => {
    expect(getClaim('eval.tier.inSample.A').value).toBeCloseTo(0.462273066, 9)
    expect(getClaim('eval.tier.inSample.B').value).toBeCloseTo(0.559057473, 9)
    expect(getClaim('eval.tier.inSample.C').value).toBeCloseTo(0.563414150, 9)
    expect(getClaim('eval.tier.cMinusB.median').value).toBe(-0.039203)
    expect(getClaim('eval.tier.cMinusB.repeatMedian').value).toBe(-0.007917)
  })
})
