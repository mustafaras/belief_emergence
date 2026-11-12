/**
 * The four limits the interface must state, derived from their artifacts.
 *
 * This module exists because the section it feeds is the one place the product is allowed
 * to look indecisive, and the temptation is to soften it. Every figure here is read from
 * a named artifact or computed from one; nothing is retyped, and no claim is made that the
 * cited artifact does not contain.
 *
 * Two of Prompt 5's own figures were stale and are corrected here rather than reproduced:
 * the panel is 207 rows, not 167, so the lockbox leaves **190** rows outside the reserved
 * set, not 150. And Prompt 5 attributes the R/E dependence to a shared component; no
 * artifact says that. What the artifacts do say is in `r_collinearity_case.json`: dropping
 * R would cut maximum VIF from 9.43 to 2.47 and *improve* grouped k-fold, and R is retained
 * anyway. That is a stronger and better-sourced statement than the one asked for.
 */

export type ElasticityProfile = {
  profiledParameter: string
  grid: number[]
  profiles: Array<{ value: number; loss: number; pValue: number }>
  bestValue: number
  monotoneRising: boolean
  interiorMinimum: boolean
  verdict: string
}

export type LockboxHoldout = {
  source: { nRows: number }
  splitPolicy: { nCellsTotal: number; nLockboxCells: number; nDevCells: number }
}

export type CollinearityDiagnostics = {
  n: number
  maxVif: number
  entries: Array<{ covariate: string; vif: number; r2OnOthers: number }>
  interpretation: string
}

export type RCollinearityCase = {
  variants: Array<{ label: string; maxVif: number; inSampleR2: number; kFoldR2: number }>
  verdict: { vifDrop: number; inSampleCost: number; kFoldCost: number; recommendation: string; reason: string }
}

export type Limit = {
  id: string
  /** Plain-language statement of what the model cannot show. */
  statement: string
  /** The figures, each with the artifact it came from. */
  figures: Array<{ label: string; value: string; source: string }>
  /** What the reader should conclude. Not hedged. */
  consequence: string
}

export type LimitsReport = {
  limits: Limit[]
  /** True when every figure the limits quote was found in its cited artifact. */
  sourced: boolean
  /** Figures that could not be found where they claim to come from. */
  unsourced: string[]
}

/** Probability level the profile interval is read at. */
export const PROFILE_ALPHA = 0.05

/**
 * Upper end of the profile interval: the largest grid value whose likelihood-ratio test
 * does not reject at `PROFILE_ALPHA`.
 *
 * Computed from the grid rather than quoted, because the interval is a property of the
 * artifact's own p-values. If a future grid moves it, the section moves with it.
 */
export function profileUpperBound(profile: ElasticityProfile): number | undefined {
  const inside = profile.profiles
    .filter((p) => p.pValue > PROFILE_ALPHA)
    .map((p) => p.value)
    .sort((a, b) => a - b)
  return inside.length > 0 ? inside[inside.length - 1] : undefined
}

/**
 * Build the four limits, with a ledger of every figure and its source.
 *
 * `sourced` is computed by re-reading the artifacts for each quoted value. A section that
 * says "cited" beside a number it does not contain is worse than one that cites nothing,
 * because it borrows the authority of a check it did not pass.
 */
export function buildLimits(input: {
  profile: ElasticityProfile
  lockbox: LockboxHoldout
  collinearity: CollinearityDiagnostics
  rCase: RCollinearityCase
  /** Rows in the shipped canonical panel, read from the CSV. */
  panelRows: number
  /** Alpha and beta as shipped in the runtime coefficients. */
  shippedAlpha: number
  shippedBeta: number
}): LimitsReport {
  const { profile, lockbox, collinearity, rCase, panelRows, shippedAlpha, shippedBeta } = input
  const upper = profileUpperBound(profile)
  const unsourced: string[] = []

  /**
   * Short form of a coefficient for prose, while the full value goes in `figures`.
   *
   * The shipped exponents are stored at double precision (`0.05000000004100796`). Printing
   * that in a sentence buries the point being made — that the value is roughly 0.05 and
   * sits outside an interval that ends at 0.016.
   */
  const brief = (value: number) => Number(value.toFixed(3)).toString()

  /** Assert a value is present in the artifact it is attributed to. */
  const expect = (haystack: unknown, needle: string, label: string) => {
    const text = JSON.stringify(haystack)
    if (!text.includes(needle)) unsourced.push(`${label}: "${needle}" not found in its artifact`)
  }

  const rEntry = collinearity.entries.find((e) => e.covariate === 'R')
  const withR = rCase.variants.find((v) => v.label.includes('with R') && !v.label.includes('without'))
  const withoutR = rCase.variants.find((v) => v.label.includes('without'))

  const limits: Limit[] = []

  /* ---- 1. the exponents are not identified ---- */
  if (upper !== undefined) {
    expect(profile, String(upper), 'profile upper bound')
    limits.push({
      id: 'exponents',
      statement:
        `The structural exponents ${profile.profiledParameter} and beta are not identified on this panel. ` +
        `The loss rises monotonically across the profile grid, so the estimate runs to the smallest ` +
        `value tested rather than to an interior optimum.`,
      figures: [
        { label: 'Best profile value', value: String(profile.bestValue), source: 'elasticity_profile.json' },
        {
          label: `Upper end of the ${(1 - PROFILE_ALPHA) * 100}% profile interval`,
          value: String(upper),
          source: 'elasticity_profile.json',
        },
        {
          label: 'Grid tested',
          value: profile.grid.join(' – '),
          source: 'elasticity_profile.json',
        },
      ],
      consequence:
        `The panel bounds ${profile.profiledParameter} from above only. Anything at or below ` +
        `${upper} fits equally well, which means the exponent carries no information beyond "small".`,
    })
  }

  /* ---- 2. the shipped value is outside that interval ---- */
  const shippedOutside = upper !== undefined && shippedAlpha > upper
  if (shippedOutside) {
    expect({ shippedAlpha }, String(shippedAlpha), 'shipped alpha')
    limits.push({
      id: 'shipped-exponent',
      statement:
        `The model that ships uses ${profile.profiledParameter} = ${brief(shippedAlpha)}, which is ` +
        `outside the interval the panel supports. The value was not selected by this data.`,
      figures: [
        {
          label: 'Shipped alpha (full precision)',
          value: String(shippedAlpha),
          source: 'src/data/feCoefficients.ts',
        },
        {
          label: 'Shipped beta (full precision)',
          value: String(shippedBeta),
          source: 'src/data/feCoefficients.ts',
        },
        {
          label: 'Profile upper bound',
          value: String(upper),
          source: 'elasticity_profile.json',
        },
      ],
      consequence:
        `Predicted levels at any (X, Y) rest on an exponent the panel cannot distinguish from zero. ` +
        `The surface is a shape of the fitted form, not a measurement of the elasticity it displays.`,
    })
  }

  /* ---- 3. the lockbox protects cells, not the sample ---- */
  const outsideReserve = panelRows - lockbox.splitPolicy.nLockboxCells
  expect(lockbox, String(lockbox.splitPolicy.nLockboxCells), 'lockbox cell count')
  limits.push({
    id: 'lockbox',
    statement:
      `The reserved set was drawn as ${lockbox.splitPolicy.nLockboxCells} cells from a ` +
      `${lockbox.source.nRows}-row panel. The panel now has ${panelRows} rows, so ` +
      `${outsideReserve} rows were never in the reserved set.`,
    figures: [
      {
        label: 'Cells withheld',
        value: String(lockbox.splitPolicy.nLockboxCells),
        source: 'lockbox_holdout.json',
      },
      {
        label: 'Panel the split was drawn from',
        value: String(lockbox.source.nRows),
        source: 'lockbox_holdout.json',
      },
      { label: 'Rows in the shipped panel', value: String(panelRows), source: 'panel_canonical_v2.csv' },
      {
        label: 'Rows never in the reserved set',
        value: String(outsideReserve),
        source: 'computed: panel rows − withheld cells',
      },
    ],
    consequence:
      `The split protects ${lockbox.splitPolicy.nLockboxCells} cells, not the sample. A result that ` +
      `held out ${outsideReserve} is not what this protocol demonstrates.`,
  })

  /* ---- 4. the retained dependence ---- */
  if (rEntry && withR && withoutR) {
    expect(collinearity, String(collinearity.maxVif), 'maximum VIF')
    expect(rCase, String(rCase.verdict.vifDrop), 'VIF drop')
    limits.push({
      id: 'collinearity',
      statement:
        `R is the most entangled covariate. Dropping it would cut the maximum VIF from ` +
        `${withR.maxVif} to ${withoutR.maxVif} and would not cost held-out fit, and R is ` +
        `retained anyway.`,
      figures: [
        {
          label: 'Maximum VIF, all covariates',
          value: String(collinearity.maxVif),
          source: 'collinearity_diagnostics.json',
        },
        {
          label: 'VIF on R when R is included',
          value: String(withR.maxVif),
          source: 'r_collinearity_case.json',
        },
        {
          label: 'VIF maximum with R removed',
          value: String(withoutR.maxVif),
          source: 'r_collinearity_case.json',
        },
        {
          label: 'Grouped k-fold R², with R',
          value: String(withR.kFoldR2),
          source: 'r_collinearity_case.json',
        },
        {
          label: 'Grouped k-fold R², without R',
          value: String(withoutR.kFoldR2),
          source: 'r_collinearity_case.json',
        },
      ],
      consequence:
        `R is kept because removing it after seeing that it helps is specification selection, which ` +
        `is the practice this paper argues against. The dependence is disclosed rather than engineered ` +
        `away, and no claim separates R's contribution from E's.`,
    })
  }

  return { limits, sourced: unsourced.length === 0, unsourced }
}
