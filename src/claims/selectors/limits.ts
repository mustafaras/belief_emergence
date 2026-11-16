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
  profiles: z.array(z.object({ value: finite, loss: finite, lrStatistic: finite, pValue: finite })).min(1)
})
const boundSensitivitySchema = z.object({
  runs: z.array(z.object({ lowerBound: finite, alpha: finite, beta: finite, r2: finite, atBound: z.boolean() })).min(2)
})
const collinearitySchema = z.object({
  conditionNumber: finite,
  maxVif: finite,
  entries: z.array(z.object({ covariate: z.string(), r2OnOthers: finite, vif: finite }))
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

function profileUpperBound(pThreshold: number): number {
  const admissible = profile.profiles.filter(point => point.pValue > pThreshold)
  if (admissible.length === 0) throw new Error(`No elasticity profile point exceeds p threshold ${pThreshold}.`)
  return Math.max(...admissible.map(point => point.value))
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

const vifClaim = (covariate: string) => {
  const entry = collinearity.entries.find(item => item.covariate === covariate)
  if (!entry) throw new Error(`Collinearity artifact has no VIF record for ${covariate}.`)
  return claim(`limits.vif.${covariate}`, `${covariate} variance inflation factor`, entry.vif, 'p2', 'collinearity_diagnostics.json', `entries[covariate=${covariate}].vif`)
}

export const limitsClaims: Claim[] = [
  claim('limits.alpha.shipped', 'Shipped structural exponent alpha', shippedRun.alpha, 'p3', 'elasticity_bound_sensitivity.json', 'runs[lowerBound=0.05].alpha'),
  claim('limits.profile.ci95Upper', 'Largest profiled alpha with p above 0.05', profileUpperBound(0.05), 'p3', 'elasticity_profile.json', 'profiles'),
  claim('limits.profile.bonferroniUpper', 'Largest profiled alpha above Bonferroni p threshold', profileUpperBound(0.05 / profile.profiles.length), 'p3', 'elasticity_profile.json', 'profiles', `Computed with p > 0.05/${profile.profiles.length}.`),
  claim('limits.bound.r2.before', 'In-sample R² at shipped alpha/beta lower bound', shippedRun.r2, 'r2', 'elasticity_bound_sensitivity.json', 'runs[lowerBound=0.05].r2'),
  claim('limits.bound.r2.after', 'In-sample R² after relaxing alpha/beta lower bound', relaxedRun.r2, 'r2', 'elasticity_bound_sensitivity.json', 'runs[lowerBound=0.001].r2'),
  vifClaim('R'),
  vifClaim('E'),
  claim('limits.vif.max', 'Maximum covariate variance inflation factor', collinearity.maxVif, 'p2', 'collinearity_diagnostics.json', 'maxVif'),
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
