import { z } from 'zod'
import collinearityAblationArtifact from '../../data/analysis/collinearity_ablation.json'
import cvKfoldArtifact from '../../data/analysis/cv_kfold.json'
import functionalFormArtifact from '../../data/analysis/functional_form_comparison.json'
import metricsArtifact from '../../data/analysis/metrics_authoritative.json'
import modelLadderArtifact from '../../data/analysis/model_ladder_metrics.json'
import intervalCoverageArtifact from '../../data/analysis/prediction_interval_coverage.json'
import zeroFillArtifact from '../../data/analysis/zero_fill_sensitivity.json'
import type { Claim } from '../types'

const finite = z.number().finite()
const tierSchema = z.enum(['A', 'B', 'C'])
const rangeSchema = z.object({ median: finite, q25: finite, q75: finite, n: z.number().int().positive() })
const functionalFormSchema = z.object({
  kfold: z.object({ folds: z.number().int().positive() }),
  models: z.array(z.object({
    model: z.enum(['linear_baseline', 'saturating_bounded']),
    inSample: z.object({ r2: finite }),
    kfold: rangeSchema,
    countryOutPooled: z.object({ r2: finite })
  })),
  pairedKfold: z.object({
    n: z.number().int().positive(),
    median: finite,
    q25: finite,
    q75: finite,
    shareSaturatingAhead: finite
  })
})
const foldTierSchema = z.object({ testMetricsRefit: z.object({ r2: finite }) }).passthrough()
const cvKfoldSchema = z.object({
  config: z.object({ repeats: z.number().int().positive(), seeds: z.array(z.number().int()) }),
  folds: z.array(z.object({
    repeat: z.number().int().nonnegative(),
    foldIndex: z.number().int().nonnegative(),
    tierResults: z.object({ A: foldTierSchema, B: foldTierSchema, C: foldTierSchema })
  }).passthrough()),
  aggregatesRefit: z.object({
    A: z.object({ r2: rangeSchema }),
    B: z.object({ r2: rangeSchema }),
    C: z.object({ r2: rangeSchema })
  })
})
const coverageTierSchema = z.object({
  meanCoverage95: finite,
  underCoverageRate: finite,
  nFolds: z.number().int().positive()
})
const intervalCoverageSchema = z.object({
  intervalMethods: z.object({ primary: z.string() }),
  byProtocolEmpirical: z.object({
    country_out: z.object({ A: coverageTierSchema, B: coverageTierSchema, C: coverageTierSchema }),
    rolling_origin: z.object({ A: coverageTierSchema, B: coverageTierSchema, C: coverageTierSchema })
  })
})
const modelLadderSchema = z.object({
  tiers: z.array(z.object({ tier: tierSchema, trainMetrics: z.object({ r2: finite }) }))
})
const metricsSchema = z.object({
  n: z.number().int().positive(),
  // `r2` was in the artifact from the start and was never read, so the headline fit had no
  // registered claim — the README carried the withdrawn 0.8461 for months partly because
  // there was nothing to compare it against.
  r2: finite,
  corr: finite,
  mae: finite,
  rmse: finite,
  bias: finite
})
const collinearitySchema = z.object({ specs: z.array(z.object({ label: z.string(), cMinusB: finite })) })
const zeroFillSchema = z.object({
  splits: z.array(z.object({ label: z.string(), perRepeatMedianCminusB: finite }))
})

const functionalForm = functionalFormSchema.parse(functionalFormArtifact)
const cvKfold = cvKfoldSchema.parse(cvKfoldArtifact)
const intervalCoverage = intervalCoverageSchema.parse(intervalCoverageArtifact)
const modelLadder = modelLadderSchema.parse(modelLadderArtifact)
const metrics = metricsSchema.parse(metricsArtifact)
const collinearity = collinearitySchema.parse(collinearityAblationArtifact)
const zeroFill = zeroFillSchema.parse(zeroFillArtifact)

const linear = functionalForm.models.find(model => model.model === 'linear_baseline')
const bounded = functionalForm.models.find(model => model.model === 'saturating_bounded')
const fullDesign = collinearity.specs.find(spec => spec.label === 'full design')
const fullPanel = zeroFill.splits.find(split => split.label === 'full panel')
if (!linear || !bounded || !fullDesign || !fullPanel) {
  throw new Error('Evaluation artifacts are missing a required model or full-panel record.')
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

const coverageClaims: Claim[] = (['rolling_origin', 'country_out'] as const).flatMap(protocol => {
  const id = protocol === 'rolling_origin' ? 'rolling' : 'countryOut'
  return (['A', 'B', 'C'] as const).flatMap(tier => {
    const coverage = intervalCoverage.byProtocolEmpirical[protocol][tier]
    const sourcePath = `byProtocolEmpirical.${protocol}.${tier}`
    const methodNote = `Primary empirical interval method: ${intervalCoverage.intervalMethods.primary}; ${coverage.nFolds} folds. Coverage is fold-conditional, not a universal calibration guarantee.`
    return [
      claim(`eval.coverage.${id}.${tier}`, `Mean 95% interval coverage (${protocol}, tier ${tier})`, coverage.meanCoverage95, 'pct1', 'prediction_interval_coverage.json', `${sourcePath}.meanCoverage95`, methodNote),
      claim(`eval.coverage.${id}.${tier}.underRate`, `Fold under-coverage rate (${protocol}, tier ${tier})`, coverage.underCoverageRate, 'pct1', 'prediction_interval_coverage.json', `${sourcePath}.underCoverageRate`, methodNote)
    ]
  })
})

export const evaluationClaims: Claim[] = [
  claim('eval.linear.inSample', 'Linear model in-sample R²', linear.inSample.r2, 'r2', 'functional_form_comparison.json', 'models[model=linear_baseline].inSample.r2'),
  claim('eval.bounded.inSample', 'Bounded model in-sample R²', bounded.inSample.r2, 'r2', 'functional_form_comparison.json', 'models[model=saturating_bounded].inSample.r2'),
  claim('eval.linear.kfold', 'Linear model grouped k-fold R² median', linear.kfold.median, 'r2', 'functional_form_comparison.json', 'models[model=linear_baseline].kfold.median'),
  claim('eval.bounded.kfold', 'Bounded model grouped k-fold R² median', bounded.kfold.median, 'r2', 'functional_form_comparison.json', 'models[model=saturating_bounded].kfold.median'),
  claim('eval.linear.pooledLoo', 'Pooled country-out R² (linear; diagnostic)', linear.countryOutPooled.r2, 'r2', 'functional_form_comparison.json', 'models[model=linear_baseline].countryOutPooled.r2', 'Pooled spatial stress-test metric; country-out is not the primary OOS inference family.'),
  claim('eval.bounded.pooledLoo', 'Pooled country-out R² (bounded; diagnostic)', bounded.countryOutPooled.r2, 'r2', 'functional_form_comparison.json', 'models[model=saturating_bounded].countryOutPooled.r2', 'Pooled spatial stress-test metric; country-out is not the primary OOS inference family.'),
  ...(['A', 'B', 'C'] as const).map(tier => claim(
    `eval.kfold.median.${tier}`,
    `Tier ${tier} grouped k-fold refit R² median`,
    cvKfold.aggregatesRefit[tier].r2.median,
    'r2',
    'cv_kfold.json',
    `aggregatesRefit.${tier}.r2.median`,
    'Primary repeated grouped k-fold refit family; Tier C remains exploratory.'
  )),
  claim('eval.kfold.folds', 'Grouped k-fold evaluation folds', cvKfold.folds.length, 'int', 'cv_kfold.json', 'folds.length'),
  claim('eval.headline.n', 'Headline metric observations', metrics.n, 'int', 'metrics_authoritative.json', 'n'),
  claim('eval.headline.r2', 'Headline in-sample R²', metrics.r2, 'r2', 'metrics_authoritative.json', 'r2'),
  claim('eval.headline.corr', 'Headline correlation', metrics.corr, 'p4', 'metrics_authoritative.json', 'corr'),
  claim('eval.headline.mae', 'Headline mean absolute error', metrics.mae, 'p4', 'metrics_authoritative.json', 'mae'),
  claim('eval.headline.rmse', 'Headline root mean squared error', metrics.rmse, 'p4', 'metrics_authoritative.json', 'rmse'),
  claim('eval.headline.bias', 'Headline mean observed-minus-predicted bias', metrics.bias, 'p4', 'metrics_authoritative.json', 'bias', 'Sign convention is mean(observed - predicted).'),
  ...coverageClaims,
  claim('eval.paired.n', 'Paired grouped k-fold comparisons', functionalForm.pairedKfold.n, 'int', 'functional_form_comparison.json', 'pairedKfold.n'),
  claim('eval.paired.shareBoundedAhead', 'Share of folds with bounded model ahead', functionalForm.pairedKfold.shareSaturatingAhead, 'pct1', 'functional_form_comparison.json', 'pairedKfold.shareSaturatingAhead'),
  claim('eval.paired.median', 'Paired bounded-minus-linear R² median difference', functionalForm.pairedKfold.median, 'exact', 'functional_form_comparison.json', 'pairedKfold.median', 'Fold results are dependent; no significance test or p-value is reported.'),
  ...modelLadder.tiers.map(tier => claim(
    `eval.tier.inSample.${tier.tier}`,
    `Tier ${tier.tier} in-sample R²`,
    tier.trainMetrics.r2,
    'r2',
    'model_ladder_metrics.json',
    `tiers[tier=${tier.tier}].trainMetrics.r2`,
    tier.tier === 'C' ? 'Exploratory sensitivity tier; excluded from headline inference.' : 'Primary evidence tier; interpretation remains support-conditioned.'
  )),
  claim('eval.tier.cMinusB.median', 'Full-design Tier C minus Tier B grouped k-fold median R²', fullDesign.cMinusB, 'p4', 'collinearity_ablation.json', 'specs[label=full design].cMinusB'),
  claim('eval.tier.cMinusB.repeatMedian', 'Full-panel per-repeat median Tier C minus Tier B R²', fullPanel.perRepeatMedianCminusB, 'p4', 'zero_fill_sensitivity.json', 'splits[label=full panel].perRepeatMedianCminusB')
]

export type EvaluationSeriesPoint = {
  tier: 'A' | 'B' | 'C'
  seed: number
  repeat: number
  foldIndex: number
  r2: number
}

export function selectEvaluationSeries(): EvaluationSeriesPoint[] {
  if (cvKfold.config.seeds.length !== cvKfold.config.repeats) {
    throw new Error('K-fold seed count does not match its configured repeat count.')
  }

  return cvKfold.folds.flatMap(fold => {
    const seed = cvKfold.config.seeds[fold.repeat]
    if (seed === undefined) throw new Error(`No seed is recorded for k-fold repeat ${fold.repeat}.`)
    return (['A', 'B', 'C'] as const).map(tier => ({
      tier,
      seed,
      repeat: fold.repeat,
      foldIndex: fold.foldIndex,
      r2: fold.tierResults[tier].testMetricsRefit.r2
    }))
  })
}
