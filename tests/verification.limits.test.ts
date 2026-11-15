import { describe, expect, it } from 'vitest'
import profileArtifact from '../src/data/analysis/elasticity_profile.json'
import lockboxArtifact from '../src/data/analysis/lockbox_holdout.json'
import collinearityArtifact from '../src/data/analysis/collinearity_diagnostics.json'
import rCaseArtifact from '../src/data/analysis/r_collinearity_case.json'
import { OPTIMIZED_STRUCTURAL_PARAMS } from '../src/data/feCoefficients'
import {
  PROFILE_ALPHA,
  buildLimits,
  largestNonRejectedProfileValue,
  type CollinearityDiagnostics,
  type ElasticityProfile,
  type LockboxHoldout,
  type RCollinearityCase,
} from '../src/verification/limits'

/**
 * The limits section is the one place the interface is allowed to look indecisive, and
 * the one place a softened number would be hardest to notice. These cases pin both the
 * arithmetic and the sourcing.
 */
const profile = profileArtifact as unknown as ElasticityProfile
const lockbox = lockboxArtifact as unknown as LockboxHoldout
const collinearity = collinearityArtifact as unknown as CollinearityDiagnostics
const rCase = rCaseArtifact as unknown as RCollinearityCase

const build = (panelRows = 207) =>
  buildLimits({
    profile,
    lockbox,
    collinearity,
    rCase,
    panelRows,
    shippedAlpha: OPTIMIZED_STRUCTURAL_PARAMS.alpha,
    shippedBeta: OPTIMIZED_STRUCTURAL_PARAMS.beta,
  })

describe('largestNonRejectedProfileValue', () => {
  it('returns the largest tested grid value the likelihood-ratio test does not reject', () => {
    const inside = profile.profiles.filter((p) => p.pValue > PROFILE_ALPHA).map((p) => p.value)
    expect(largestNonRejectedProfileValue(profile)).toBe(Math.max(...inside))
    expect(largestNonRejectedProfileValue(profile)).toBe(0.064)
  })

  it('does not infer a profile cutoff when no tested value is rejected', () => {
    const rejected = profile.profiles.filter((p) => p.pValue <= PROFILE_ALPHA).map((p) => p.value)
    expect(rejected).toEqual([])
    expect(largestNonRejectedProfileValue(profile)).toBe(Math.max(...profile.grid))
  })
})

describe('buildLimits against the real artifacts', () => {
  const report = build()

  it('states the three current evidence limits', () => {
    expect(report.limits.map((l) => l.id)).toEqual([
      'exponents',
      'lockbox',
      'collinearity',
    ])
  })

  it('sources every figure it quotes', () => {
    expect(report.sourced).toBe(true)
    expect(report.unsourced).toEqual([])
  })

  it('reports the largest tested non-rejected alpha value, not a confidence bound', () => {
    const limit = report.limits.find((l) => l.id === 'exponents')
    const endpoint = limit?.figures.find((f) => f.label.includes('Largest tested alpha value'))
    expect(endpoint?.value).toBe('0.064')
    expect(limit?.statement).toMatch(/beta was not separately profiled/)
    expect(limit?.consequence).toMatch(/does not exclude the shipped alpha/)
  })

  it('does not claim the shipped alpha is rejected by the tested profile', () => {
    expect(report.limits.find((l) => l.id === 'shipped-exponent')).toBeUndefined()
    const limit = report.limits.find((l) => l.id === 'exponents')
    expect(limit?.figures.find((f) => f.label === 'Shipped alpha')?.value).toMatch(/^0\.05/)
  })

  it('computes the rows outside the reserve from the panel, not from a literal', () => {
    // The documents said 150 when the panel had 167 rows. At 207 it is 190.
    const limit = report.limits.find((l) => l.id === 'lockbox')
    const outside = limit?.figures.find((f) => f.source.startsWith('computed:'))
    expect(outside?.value).toBe(String(207 - lockbox.splitPolicy.nLockboxCells))
    expect(outside?.value).toBe('190')
  })

  it('moves that figure when the panel changes', () => {
    const wider = build(250)
    const outside = wider.limits
      .find((l) => l.id === 'lockbox')
      ?.figures.find((f) => f.source.startsWith('computed:'))
    expect(outside?.value).toBe(String(250 - lockbox.splitPolicy.nLockboxCells))
  })

  it('describes the R dependence as retention, which is what the artifact says', () => {
    // The artifact's verdict is "retain": dropping R would cut VIF and improve k-fold,
    // and it is kept anyway. That is stronger than "R and E share a component", which no
    // artifact states.
    expect(rCase.verdict.recommendation).toBe('retain')
    const limit = report.limits.find((l) => l.id === 'collinearity')
    expect(limit?.statement).toMatch(/retained anyway/i)
    expect(limit?.consequence).toMatch(/specification selection/i)
  })

  it('quotes the k-fold comparison in the direction the artifact reports', () => {
    const without = rCase.variants.find((v) => v.label.includes('without'))
    const withR = rCase.variants.find((v) => v.label.includes('with R') && !v.label.includes('without'))
    // Dropping R raises k-fold, so the statement "would not cost held-out fit" is true.
    expect(without!.kFoldR2).toBeGreaterThan(withR!.kFoldR2)
  })
})
