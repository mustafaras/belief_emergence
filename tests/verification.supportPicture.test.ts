import { describe, expect, it } from 'vitest'
import panelAudit from '../public/data/panel_canonical_v2.audit.json'
import constructAudit from '../src/data/analysis/wvs_construct_audit.json'
import {
  buildSupportPicture,
  type PanelAudit,
} from '../src/verification/supportPicture'

/**
 * The support picture's arithmetic.
 *
 * The panel builder attributes every dropped cell exactly once, so `scanned − losses`
 * must equal the complete-case count. That identity is the check that a stale figure
 * cannot hide behind a plausible one.
 */
const constructs = {
  respondentsScanned: constructAudit.respondentsScanned,
  countryYears: constructAudit.countryYears,
  zComputableCells: constructAudit.constructs.Z_belief_outcome.cellsEmitted,
}

const picture = buildSupportPicture(panelAudit as unknown as PanelAudit, constructs)

describe('buildSupportPicture against the real audit', () => {
  it('reconciles scanned minus losses to the complete-case count', () => {
    expect(picture.reconciles).toBe(true)
    const lost =
      picture.covariateDropouts + picture.otherDropouts.reduce((s, d) => s + d.cells, 0)
    expect(picture.scannedCountryYears - lost).toBe(picture.completeCases)
  })

  it('computes utilisation rather than carrying a literal', () => {
    // The documents said 54.8% when the panel had 167 rows. At 207 it is 67.9%.
    expect(picture.frameUtilisation).toBeCloseTo(207 / 305, 12)
    expect(picture.frameUtilisation).not.toBeCloseTo(0.548, 3)
  })

  it('attributes every covariate loss to a named covariate', () => {
    const attributed = picture.blockers.reduce((s, b) => s + b.cells, 0)
    expect(attributed).toBe(picture.covariateDropouts)
    expect(attributed).toBe(61)
  })

  it('names Gini as the binding constraint', () => {
    const binding = picture.blockers.filter((b) => b.binding)
    expect(binding).toHaveLength(1)
    expect(binding[0].covariate).toBe('Y')
    expect(binding[0].cells).toBe(31)
    // Shares are of the covariate losses, not of the whole frame.
    expect(binding[0].share).toBeCloseTo(31 / 61, 6)
  })

  it('sorts blockers so the largest is first', () => {
    const cells = picture.blockers.map((b) => b.cells)
    expect(cells).toEqual([...cells].sort((a, b) => b - a))
  })

  it('reports the respondents and the computable-outcome count from the construct audit', () => {
    expect(picture.respondents).toBe(442026)
    expect(picture.scannedCountryYears).toBe(305)
    expect(picture.zComputableCells).toBe(287)
  })
})

describe('when the audit carries no per-covariate attribution', () => {
  const withoutAttribution: PanelAudit = {
    ...(panelAudit as unknown as PanelAudit),
    missingByCovariate: undefined,
  }
  const built = buildSupportPicture(withoutAttribution, constructs)

  it('names no binding constraint', () => {
    // Claiming one would be invention: the audit would only say 61 cells were lost to
    // *some* covariate.
    expect(built.blockers).toEqual([])
    expect(built.blockers.find((b) => b.binding)).toBeUndefined()
  })

  it('still reconciles, because the bucket total is unchanged', () => {
    expect(built.reconciles).toBe(true)
    expect(built.covariateDropouts).toBe(61)
  })
})

describe('contradictory input', () => {
  it('reports non-reconciliation instead of hiding it', () => {
    const broken: PanelAudit = {
      rows: 300,
      countries: 83,
      attrition: { noIso: 11, noMacro: 8, missingCovariate: 61, missingOutcome: 18 },
      missingByCovariate: { Y: 31 },
    }
    const built = buildSupportPicture(broken, constructs)
    expect(built.reconciles).toBe(false)
  })
})
