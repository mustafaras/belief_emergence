import { describe, expect, it } from 'vitest'
import profileArtifact from '../src/data/analysis/elasticity_profile.json'
import lockboxArtifact from '../src/data/analysis/lockbox_holdout.json'
import collinearityArtifact from '../src/data/analysis/collinearity_diagnostics.json'
import rCaseArtifact from '../src/data/analysis/r_collinearity_case.json'
import { OPTIMIZED_STRUCTURAL_PARAMS } from '../src/data/feCoefficients'
import {
  PROFILE_ALPHA,
  buildLimits,
  profileUpperBound,
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

describe('profileUpperBound', () => {
  it('is the largest grid value the likelihood-ratio test does not reject', () => {
    const inside = profile.profiles.filter((p) => p.pValue > PROFILE_ALPHA).map((p) => p.value)
    expect(profileUpperBound(profile)).toBe(Math.max(...inside))
    expect(profileUpperBound(profile)).toBe(0.016)
  })

  it('excludes values that are rejected', () => {
    const rejected = profile.profiles.filter((p) => p.pValue <= PROFILE_ALPHA).map((p) => p.value)
    expect(rejected).toContain(0.032)
    expect(profileUpperBound(profile)).toBeLessThan(0.032)
  })
})

describe('buildLimits against the real artifacts', () => {
  const report = build()

  it('states all four limits', () => {
    expect(report.limits.map((l) => l.id)).toEqual([
      'exponents',
      'shipped-exponent',
      'lockbox',
      'collinearity',
    ])
  })

  it('sources every figure it quotes', () => {
    expect(report.sourced).toBe(true)
    expect(report.unsourced).toEqual([])
  })

  it('reports the profile interval the artifact supports', () => {
    const limit = report.limits.find((l) => l.id === 'exponents')
    const upper = limit?.figures.find((f) => f.label.includes('Upper end'))
    expect(upper?.value).toBe('0.016')
  })

  it('states that the shipped exponent is outside the interval', () => {
    // 0.05 against an interval ending at 0.016.
    const limit = report.limits.find((l) => l.id === 'shipped-exponent')
    expect(limit).toBeDefined()
    expect(limit?.statement).toMatch(/outside the interval/)
    // Rounded for prose; the full value is in the figures.
    expect(limit?.statement).toContain('0.05')
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

describe('when a limit would be unsupported', () => {
  it('omits the shipped-exponent limit if the exponent were inside the interval', () => {
    const inside = buildLimits({
      profile,
      lockbox,
      collinearity,
      rCase,
      panelRows: 207,
      // A value the panel does support.
      shippedAlpha: 0.008,
      shippedBeta: OPTIMIZED_STRUCTURAL_PARAMS.beta,
    })
    expect(inside.limits.find((l) => l.id === 'shipped-exponent')).toBeUndefined()
  })
})
