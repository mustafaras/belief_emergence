import { describe, expect, it } from 'vitest'
import elasticityProfileArtifact from '../src/data/analysis/elasticity_profile.json'
import structuralWindowArtifact from '../src/data/analysis/structural_window_sensitivity.json'
import { getClaim } from '../src/claims/registry'
import { selectProfileSeries } from '../src/claims/selectors/limits'

describe('limits and robustness claims', () => {
  it('computes profile thresholds from the live grid and p values', () => {
    const series = selectProfileSeries()
    expect(series).toHaveLength(7)
    expect(series[0]).toEqual({
      alpha: elasticityProfileArtifact.profiles[0].value,
      loss: elasticityProfileArtifact.profiles[0].loss,
      lrStatistic: elasticityProfileArtifact.profiles[0].lrStatistic,
      pValue: elasticityProfileArtifact.profiles[0].pValue
    })
    expect(getClaim('limits.profile.ci95Upper').value).toBe(0.064)
    expect(getClaim('limits.profile.bonferroniUpper').value).toBe(0.064)
    expect(getClaim('limits.alpha.shipped').value).toBe(0.05)
  })

  it('uses current lower-bound, VIF, and R-ablation measurements', () => {
    expect(getClaim('limits.bound.r2.before').value).toBe(0.3786)
    expect(getClaim('limits.bound.r2.after').value).toBe(0.399)
    expect(getClaim('limits.vif.R').value).toBe(9.4274)
    expect(getClaim('limits.vif.E').value).toBe(4.8275)
    expect(getClaim('limits.dropR.maxVif').value).toBe(2.4722)
    expect(getClaim('limits.dropR.inSampleR2.delta').value).toBe(0.011514)
    expect(getClaim('limits.dropR.kFoldR2.delta').value).toBe(-0.000013)
  })

  it('derives lockbox country count from its cell list', () => {
    expect(getClaim('limits.lockbox.cells').value).toBe(17)
    expect(getClaim('limits.lockbox.countries').value).toBe(11)
  })

  it('reports window and anchor values from the structural sensitivity artifact', () => {
    expect(getClaim('limits.window.r2.fitting').value).toBeCloseTo(0.3785627879, 10)
    expect(getClaim('limits.window.r2.evaluationContract').value).toBeCloseTo(0.3785627879, 10)
    expect(getClaim('limits.window.r2.realisedRange').value).toBeCloseTo(0.3785627879, 10)
    expect(getClaim('limits.window.refit.r2').value).toBeCloseTo(structuralWindowArtifact.refitRealisedRange.r2, 12)
    expect(getClaim('limits.window.refit.nExponentsOnBound').value).toBe(2)
    expect(structuralWindowArtifact.refitRealisedRange.alphaOnLowerBound).toBe(true)
    expect(structuralWindowArtifact.refitRealisedRange.betaOnLowerBound).toBe(true)
    expect(getClaim('limits.anchors.boundedR2.fit').value).toBeCloseTo(0.4061554099, 10)
    expect(getClaim('limits.anchors.boundedR2.evaluation').value).toBeCloseTo(0.4061554099, 10)
  })

  it('exposes the 2006 leave-one-year-out sensitivity for later sections', () => {
    expect(getClaim('limits.year2006.rowsExcluded').value).toBe(20)
    expect(getClaim('limits.year2006.remainingRows').value).toBe(187)
    expect(getClaim('limits.year2006.corr').value).toBe(0.6993)
    expect(getClaim('limits.year2006.corrMedianOtherYears').value).toBe(0.9322)
    expect(getClaim('limits.year2006.r2Delta.A').value).toBeCloseTo(-0.605633752, 9)
    expect(getClaim('limits.year2006.r2Delta.B').value).toBeCloseTo(-0.815466035, 9)
    expect(getClaim('limits.year2006.r2Delta.C').value).toBeCloseTo(-1.270208368, 9)
    expect(getClaim('limits.year2006.signRetained.C').value).toBeCloseTo(20 / 21, 12)
  })
})
