import { z } from 'zod'
import collinearityDiagnosticsArtifact from '../../data/analysis/collinearity_diagnostics.json'
import elasticityBoundSensitivityArtifact from '../../data/analysis/elasticity_bound_sensitivity.json'
import elasticityProfileArtifact from '../../data/analysis/elasticity_profile.json'
import lockboxHoldoutArtifact from '../../data/analysis/lockbox_holdout.json'
import rCollinearityCaseArtifact from '../../data/analysis/r_collinearity_case.json'
import structuralWindowSensitivityArtifact from '../../data/analysis/structural_window_sensitivity.json'
import temporalOutlier2006Artifact from '../../data/analysis/temporal_outlier_2006_sensitivity.json'
import type { Claim } from '../types'

const finite = z.number().finite()
const profileSchema = z.object({
  profiles: z.array(z.object({ value: finite, loss: finite, lrStatistic: finite, pValue: finite })).min(1),
  // The shape of the profile is the finding: a monotone rise with no interior minimum is what
  // "not identified" looks like, and the section renders it rather than restating it in prose.
  grid: z.array(finite).min(1),
  monotoneRising: z.boolean(),
  interiorMinimum: z.boolean(),
  verdict: z.string().min(1),
})
const boundSensitivitySchema = z.object({
  runs: z.array(z.object({ lowerBound: finite, alpha: finite, beta: finite, r2: finite, atBound: z.boolean() })).min(2)
})
const collinearitySchema = z.object({
  n: z.number().int().nonnegative(),
  conditionNumber: finite,
  maxVif: finite,
  entries: z.array(z.object({ covariate: z.string(), r2OnOthers: finite, vif: finite })),
})
const rCollinearitySchema = z.object({
  variants: z.array(z.object({ label: z.string(), maxVif: finite, inSampleR2: finite, kFoldR2: finite })),
  verdict: z.object({ inSampleCost: finite, kFoldCost: finite, recommendation: z.string() })
})
const lockboxSchema = z.object({
  splitPolicy: z.object({
    nCellsTotal: z.number().int().nonnegative(),
    nDevCells: z.number().int().nonnegative(),
    nLockboxCells: z.number().int().nonnegative(),
    lockboxCells: z.array(z.string()).min(1)
  })
})
const windowSchema = z.object({
  windows: z.object({
    fitting: z.object({ r2: finite }),
    evaluationContract: z.object({ r2: finite }),
    realisedRange: z.object({ r2: finite })
  }),
  anchoring: z.object({ boundedR2UnderFitAnchors: finite, boundedR2UnderEvaluationAnchors: finite }),
  refitRealisedRange: z.object({
    r2: finite,
    alphaOnLowerBound: z.boolean(),
    betaOnLowerBound: z.boolean()
  })
})
const temporalOutlierSchema = z.object({
  fullPanelNRows: z.number().int().positive(),
  excluded2006NRows: z.number().int().positive(),
  nRowsExcluded: z.number().int().positive(),
  looComparisonRefit: z.array(z.object({ tier: z.enum(['A', 'B', 'C']), r2: z.object({ delta: finite }) })),
  constructDiagnostics: z.object({
    year2006: z.object({ nRows: z.number().int().positive(), meanZ: finite, sdZ: finite, countries: z.array(z.string()) }),
    otherYears: z.object({ nRows: z.number().int().positive(), meanZ: finite, sdZ: finite }),
    constructCorrelation2006: finite,
    constructCorrelationMedian: finite
  }),
  signStability: z.array(z.object({ tier: z.enum(['A', 'B', 'C']), fractionRetained: finite }))
})

const profile = profileSchema.parse(elasticityProfileArtifact)
const boundSensitivity = boundSensitivitySchema.parse(elasticityBoundSensitivityArtifact)
const collinearity = collinearitySchema.parse(collinearityDiagnosticsArtifact)
const rCollinearity = rCollinearitySchema.parse(rCollinearityCaseArtifact)
const lockbox = lockboxSchema.parse(lockboxHoldoutArtifact)
const windows = windowSchema.parse(structuralWindowSensitivityArtifact)
const temporalOutlier = temporalOutlierSchema.parse(temporalOutlier2006Artifact)

const shippedRun = boundSensitivity.runs.find(run => run.lowerBound === 0.05)
const relaxedRun = boundSensitivity.runs.find(run => run.lowerBound === 0.001)
const withR = rCollinearity.variants.find(variant => variant.label === 'with R')
const withoutR = rCollinearity.variants.find(variant => variant.label === 'without R')
if (!shippedRun || !relaxedRun || !withR || !withoutR) {
  throw new Error('Limit artifacts are missing the shipped/relaxed bound or R ablation records.')
}

/**
 * The largest profiled alpha whose profile p-value clears a threshold.
 *
 * THE TRAP THIS REPLACES
 * ----------------------
 * The original version returned `max(value | p > threshold)`. On this panel *every* profile
 * point clears the 0.05 threshold — the statistic never reaches 3.84 even at the top of the
 * grid — so the function returned the largest grid value, 0.064, and both the plain and the
 * Bonferroni bound printed the same number. That reads as "the interval ends at 0.064",
 * which is a claim about the data. It is actually a claim about where the grid stops.
 *
 * The honest result is that the profile is *unbounded above within the tested grid*: no
 * point is rejected, so the data do not locate an upper limit at all. Returning the grid
 * maximum with a note that says so is correct; returning it silently is not.
 */
export type ProfileUpperBound = {
  value: number
  /** True when no profile point cleared the threshold, so the bound is the grid edge. */
  gridLimited: boolean
  /** Largest LR statistic in the grid, for the reader to compare against the threshold. */
  maxStatistic: number
  threshold: number
}

export function profileUpperBound(pThreshold: number): ProfileUpperBound {
  // LR ~ chi-square with one degree of freedom, so the p-value threshold maps to a statistic.
  // 3.841 is chi2_1 at 0.95; the general form keeps Bonferroni honest.
  const chiSquareThreshold = chiSquareQuantile1(pThreshold)
  const admissible = profile.profiles.filter(point => point.lrStatistic < chiSquareThreshold)
  const maxStatistic = Math.max(...profile.profiles.map(point => point.lrStatistic))
  if (admissible.length === 0) {
    throw new Error(`No elasticity profile point falls below chi2_1 threshold ${chiSquareThreshold}.`)
  }
  const value = Math.max(...admissible.map(point => point.value))
  // Grid-limited when the admissible set reaches the last tested value.
  const gridMax = Math.max(...profile.profiles.map(point => point.value))
  return {
    value,
    gridLimited: value === gridMax,
    maxStatistic,
    threshold: chiSquareThreshold,
  }
}

/**
 * chi2_1 quantile, by the closed form for one degree of freedom.
 *
 * For k = 1 the chi-square distribution is the square of a standard normal, so the upper
 * quantile at 1 - p is `Phi^{-1}(1 - p/2)^2`. Bonferroni divides the tail probability by the
 * number of grid points, which is why the threshold has to be recomputed rather than typed.
 */
function chiSquareQuantile1(p: number): number {
  return normalQuantile(1 - p / 2) ** 2
}

/** Peter Acklam's rational approximation; accurate to ~1e-9 over the useful range. */
function normalQuantile(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const pLow = 0.02425
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - pLow) {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  const q = p - 0.5
  const r = q * q
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

const ci95Upper = profileUpperBound(0.05)
const bonferroniUpper = profileUpperBound(0.05 / profile.profiles.length)

export const profileBounds = {
  ci95: ci95Upper,
  bonferroni: bonferroniUpper,
  grid: profile.grid,
  points: profile.profiles.map((point) => ({
    value: point.value,
    loss: point.loss,
    lrStatistic: point.lrStatistic,
    pValue: point.pValue,
  })),
  shippedAlpha: shippedRun.alpha,
  monotone: profile.monotoneRising,
  interiorMinimum: profile.interiorMinimum,
  verdict: profile.verdict,
}

const lockboxCountryCount = new Set(lockbox.splitPolicy.lockboxCells.map(cell => cell.split('::')[0])).size
if (lockbox.splitPolicy.lockboxCells.length !== lockbox.splitPolicy.nLockboxCells) {
  throw new Error('Lockbox cell list does not match its recorded cell count.')
}

function claim(
  id: string,
  label: string,
  value: number,
  format: Claim['format'],
  artifact: string,
  path: string,
  note?: string
): Claim {
  return { id, label, value, format, artifact, path, note }
}

/**
 * VIF rows in descending order, with the conventional threshold applied.
 *
 * `flagged` is computed rather than stored: the artifact records the VIFs, and whether one is
 * "high" depends on a convention (5 here) that belongs to the view, not to the measurement.
 */
const VIF_CONVENTIONAL_THRESHOLD = 5

const VIF_LABELS: Record<string, string> = {
  R: 'Welfare capacity',
  E: 'Education capacity',
  X: 'Settlement / urbanisation',
  M: 'Media environment',
  Y: 'Gini (inequality)',
  T: 'Trauma exposure',
}

export const vifEntries = [...collinearity.entries]
  .sort((a, b) => b.vif - a.vif)
  .map((entry) => ({
    covariate: entry.covariate,
    label: VIF_LABELS[entry.covariate] ?? entry.covariate,
    vif: entry.vif,
    flagged: entry.vif > VIF_CONVENTIONAL_THRESHOLD,
  }))

/**
 * The 2006 sensitivity, flattened for the card.
 *
 * The year is not excluded from any reported number; it is reported as a reason the aggregate
 * is fragile. `tierCDeltaR2` is the country-out R² change for Tier C, the tier the sensitivity
 * moves most.
 */
export const outlier2006 = {
  constructCorrelation2006: temporalOutlier.constructDiagnostics.constructCorrelation2006,
  constructCorrelationMedian: temporalOutlier.constructDiagnostics.constructCorrelationMedian,
  nRows2006: temporalOutlier.constructDiagnostics.year2006.nRows,
  nRowsOther: temporalOutlier.constructDiagnostics.otherYears.nRows,
  tierCDeltaR2: temporalOutlier.looComparisonRefit.find((entry) => entry.tier === 'C')?.r2.delta ?? 0,
  excludedNRows: temporalOutlier.excluded2006NRows,
}

/** The two specifications Lab 7 toggles between. */
export const rCase = {
  withR: { maxVif: withR.maxVif, inSampleR2: withR.inSampleR2, kFoldR2: withR.kFoldR2 },
  withoutR: { maxVif: withoutR.maxVif, inSampleR2: withoutR.inSampleR2, kFoldR2: withoutR.kFoldR2 },
  verdict: rCollinearity.verdict,
  conventionalThreshold: VIF_CONVENTIONAL_THRESHOLD,
}

const vifClaim = (covariate: string) => {
  const entry = collinearity.entries.find(item => item.covariate === covariate)
  if (!entry) throw new Error(`Collinearity artifact has no VIF record for ${covariate}.`)
  return claim(`limits.vif.${covariate}`, `${covariate} variance inflation factor`, entry.vif, 'p2', 'collinearity_diagnostics.json', `entries[covariate=${covariate}].vif`)
}

export const limitsClaims: Claim[] = [
  claim('limits.alpha.shipped', 'Shipped structural exponent alpha', shippedRun.alpha, 'p3', 'elasticity_bound_sensitivity.json', 'runs[lowerBound=0.05].alpha'),
  claim('limits.profile.ci95Upper', 'Largest profiled alpha whose profile p-value clears 0.05', ci95Upper.value, 'p3', 'elasticity_profile.json', 'profiles', ci95Upper.gridLimited ? 'No point is rejected: this is the edge of the tested grid, not a located bound.' : undefined),
  claim('limits.profile.bonferroniUpper', 'Largest profiled alpha above the Bonferroni p threshold', bonferroniUpper.value, 'p3', 'elasticity_profile.json', 'profiles', bonferroniUpper.gridLimited ? `Computed with p > 0.05/${profile.profiles.length}; no point is rejected, so this is the grid edge.` : `Computed with p > 0.05/${profile.profiles.length}.`),
  claim('limits.bound.r2.before', 'In-sample R² at shipped alpha/beta lower bound', shippedRun.r2, 'r2', 'elasticity_bound_sensitivity.json', 'runs[lowerBound=0.05].r2'),
  claim('limits.bound.r2.after', 'In-sample R² after relaxing alpha/beta lower bound', relaxedRun.r2, 'r2', 'elasticity_bound_sensitivity.json', 'runs[lowerBound=0.001].r2'),
  vifClaim('R'),
  vifClaim('E'),
  claim('limits.vif.max', 'Maximum covariate variance inflation factor', collinearity.maxVif, 'p2', 'collinearity_diagnostics.json', 'maxVif'),
  claim('limits.collinearity.conditionNumber', 'Condition number of the design matrix', collinearity.conditionNumber, 'p2', 'collinearity_diagnostics.json', 'conditionNumber'),
  claim('limits.collinearity.n', 'Rows behind the collinearity diagnostics', collinearity.n, 'int', 'collinearity_diagnostics.json', 'n'),
  claim('limits.dropR.maxVif', 'Maximum VIF after removing R', withoutR.maxVif, 'p2', 'r_collinearity_case.json', 'variants[label=without R].maxVif', 'Counterfactual specification only; the reported model retains R.'),
  claim('limits.dropR.maxVif.withR', 'Maximum VIF with R retained', withR.maxVif, 'p2', 'r_collinearity_case.json', 'variants[label=with R].maxVif'),
  claim('limits.dropR.inSampleR2.withR', 'In-sample R² with R retained', withR.inSampleR2, 'r2', 'r_collinearity_case.json', 'variants[label=with R].inSampleR2'),
  claim('limits.dropR.inSampleR2.withoutR', 'In-sample R² without R', withoutR.inSampleR2, 'r2', 'r_collinearity_case.json', 'variants[label=without R].inSampleR2', 'Counterfactual specification only; the reported model retains R.'),
  claim('limits.dropR.inSampleR2.delta', 'In-sample R² cost of removing R', rCollinearity.verdict.inSampleCost, 'p4', 'r_collinearity_case.json', 'verdict.inSampleCost'),
  claim('limits.dropR.kFoldR2.withR', 'K-fold R² with R retained', withR.kFoldR2, 'r2', 'r_collinearity_case.json', 'variants[label=with R].kFoldR2'),
  claim('limits.dropR.kFoldR2.withoutR', 'K-fold R² without R', withoutR.kFoldR2, 'r2', 'r_collinearity_case.json', 'variants[label=without R].kFoldR2', 'Counterfactual specification only; the reported model retains R.'),
  claim('limits.dropR.kFoldR2.delta', 'With-R minus without-R k-fold R² difference', rCollinearity.verdict.kFoldCost, 'p4', 'r_collinearity_case.json', 'verdict.kFoldCost'),
  claim('limits.lockbox.cells', 'Country-year cells in the lockbox', lockbox.splitPolicy.nLockboxCells, 'int', 'lockbox_holdout.json', 'splitPolicy.nLockboxCells'),
  claim('limits.lockbox.countries', 'Countries represented in the lockbox', lockboxCountryCount, 'int', 'lockbox_holdout.json', 'splitPolicy.lockboxCells', 'Derived as unique ISO3 prefixes in the lockbox cell list.'),
  ...(['fitting', 'evaluationContract', 'realisedRange'] as const).map(window => claim(
    `limits.window.r2.${window}`,
    `Structural-window R² (${window})`,
    windows.windows[window].r2,
    'r2',
    'structural_window_sensitivity.json',
    `windows.${window}.r2`
  )),
  claim('limits.window.refit.r2', 'Unbounded realised-range refit R²', windows.refitRealisedRange.r2, 'r2', 'structural_window_sensitivity.json', 'refitRealisedRange.r2', 'Both alpha and beta remain at their lower bounds.'),
  claim('limits.window.refit.nExponentsOnBound', 'Structural exponents at lower bound after refit', Number(windows.refitRealisedRange.alphaOnLowerBound) + Number(windows.refitRealisedRange.betaOnLowerBound), 'int', 'structural_window_sensitivity.json', 'refitRealisedRange'),
  claim('limits.anchors.boundedR2.fit', 'Bounded R² under fitting anchors', windows.anchoring.boundedR2UnderFitAnchors, 'r2', 'structural_window_sensitivity.json', 'anchoring.boundedR2UnderFitAnchors'),
  claim('limits.anchors.boundedR2.evaluation', 'Bounded R² under evaluation anchors', windows.anchoring.boundedR2UnderEvaluationAnchors, 'r2', 'structural_window_sensitivity.json', 'anchoring.boundedR2UnderEvaluationAnchors'),
  claim('limits.year2006.rowsExcluded', 'Country-year rows excluded with 2006', temporalOutlier.nRowsExcluded, 'int', 'temporal_outlier_2006_sensitivity.json', 'nRowsExcluded'),
  claim('limits.year2006.remainingRows', 'Rows remaining after excluding 2006', temporalOutlier.excluded2006NRows, 'int', 'temporal_outlier_2006_sensitivity.json', 'excluded2006NRows'),
  claim('limits.year2006.corr', 'Construct correlation in 2006', temporalOutlier.constructDiagnostics.constructCorrelation2006, 'p4', 'temporal_outlier_2006_sensitivity.json', 'constructDiagnostics.constructCorrelation2006'),
  claim('limits.year2006.corrMedianOtherYears', 'Median construct correlation in other years', temporalOutlier.constructDiagnostics.constructCorrelationMedian, 'p4', 'temporal_outlier_2006_sensitivity.json', 'constructDiagnostics.constructCorrelationMedian'),
  ...temporalOutlier.looComparisonRefit.map(comparison => claim(
    `limits.year2006.r2Delta.${comparison.tier}`,
    `Tier ${comparison.tier} refit R² change after excluding 2006`,
    comparison.r2.delta,
    'p4',
    'temporal_outlier_2006_sensitivity.json',
    `looComparisonRefit[tier=${comparison.tier}].r2.delta`,
    'Leave-one-year-out sensitivity; not the reported primary estimate.'
  )),
  ...temporalOutlier.signStability.map(stability => claim(
    `limits.year2006.signRetained.${stability.tier}`,
    `Tier ${stability.tier} coefficient signs retained after excluding 2006`,
    stability.fractionRetained,
    'pct1',
    'temporal_outlier_2006_sensitivity.json',
    `signStability[tier=${stability.tier}].fractionRetained`
  ))
]

export type ProfileSeriesPoint = { alpha: number; loss: number; lrStatistic: number; pValue: number }

export function selectProfileSeries(): ProfileSeriesPoint[] {
  return profile.profiles.map(point => ({
    alpha: point.value,
    loss: point.loss,
    lrStatistic: point.lrStatistic,
    pValue: point.pValue
  }))
}
