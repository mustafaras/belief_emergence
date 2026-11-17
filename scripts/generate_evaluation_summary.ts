/**
 * generate_evaluation_summary.ts — a compact projection of the four CV artifacts.
 *
 * WHY THIS EXISTS
 * ---------------
 * `cv_kfold.json` is 1.8 MB and `cv_country_out.json` another 0.9 MB, because each carries
 * the full per-fold coefficient vectors and the observed/predicted arrays for every fold.
 * The Evaluation section needs none of that: it prints medians, quartiles, per-fold R², a
 * per-year RMSE series, coverage rates, and the in-sample ladder — a few hundred numbers.
 *
 * Importing the raw artifacts put 2.2 MB into the initial bundle and broke the 2 MB budget.
 * The repository already knows this hazard: `src/evidence/evidenceIndex.ts` loads artifacts
 * with `eager: false` for exactly this reason. The projection keeps the raw artifacts as the
 * evidence of record (they stay on disk, in the evidence index, and reproducible) while the
 * interface reads a summary small enough to ship.
 *
 * The projection is generated, not hand-maintained: every number here is read from the raw
 * artifact at build time, so the summary cannot drift from its source.
 *
 * Usage:
 *   npm run generate:evaluation-summary
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const ANALYSIS = path.join(REPO_ROOT, 'src', 'data', 'analysis')
const OUT = path.join(ANALYSIS, 'evaluation_summary.json')

const read = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(ANALYSIS, name), 'utf8')) as T

type Block = { median: number | null; q25: number | null; q75: number | null; n?: number }
type TierResult = { testMetricsRefit: { r2: number | null; rmse: number | null } }

const kfold = read<{
  config: { k: number; repeats: number; seeds: number[] }
  folds: Array<{ repeat: number; tierResults: Record<string, TierResult> }>
  aggregatesRefit: Record<string, { r2: Block }>
  perRepeatRefit: Array<Record<string, { r2: number | null }>>
}>('cv_kfold.json')

const loo = read<{
  folds: Array<{ tierResults: Record<string, TierResult> }>
  aggregatesRefit: Record<string, { r2: Block }>
}>('cv_country_out.json')

const rolling = read<{
  folds: Array<{ testYear: number; tierResults: Record<string, TierResult> }>
}>('cv_rolling_origin.json')

const coverage = read<{
  nominalCoverage: number
  byProtocol: Record<string, Record<string, { meanCoverage95: number; underCoverageRate: number; nFolds: number }>>
}>('prediction_interval_coverage.json')

const ladder = read<{
  nRows: number
  tiers: Array<{
    tier: string
    exploratory: boolean
    parameterCount: number
    trainMetrics: { r2: number; corr: number; mae: number; rmse: number; bias: number }
  }>
}>('model_ladder_metrics.json')

const TIERS = ['A', 'B', 'C'] as const

/** Per-fold R² series, which is all a strip plot needs. */
const r2Series = (folds: Array<{ tierResults: Record<string, TierResult> }>): Record<string, number[]> =>
  Object.fromEntries(
    TIERS.map((tier) => [
      tier,
      folds
        .map((fold) => fold.tierResults[tier]?.testMetricsRefit.r2)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
    ]),
  )

/**
 * One entry per repeat, paired with its seed.
 *
 * A repeat whose R² is undefined carries no ordering information and is dropped, the same
 * rule the interface applies; inventing a zero would bias the count of seeds where C trails B.
 */
const seeds = kfold.config.seeds.flatMap((seed, index) => {
  const repeat = kfold.perRepeatRefit[index]
  const c = repeat?.C?.r2
  const b = repeat?.B?.r2
  if (c === null || c === undefined || b === null || b === undefined) return []
  const delta = c - b
  return [{ seed, delta, cAhead: delta > 0 }]
})

const block = (entry: Block | undefined) => entry === undefined
  ? null
  : { median: entry.median, q25: entry.q25, q75: entry.q75, n: entry.n ?? null }

const payload = {
  schemaVersion: 'phase1.evaluation_summary.v1',
  generatedAtIso: new Date().toISOString(),
  purpose:
    'A projection of the cross-validation artifacts onto the values the Evaluation section renders, so the interface does not ship the full per-fold coefficient vectors. The raw artifacts remain the evidence of record.',
  sourceArtifacts: ['cv_kfold.json', 'cv_country_out.json', 'cv_rolling_origin.json', 'prediction_interval_coverage.json', 'model_ladder_metrics.json'],
  kfold: {
    config: kfold.config,
    folds: kfold.folds.length,
    aggregates: Object.fromEntries(TIERS.map((tier) => [tier, block(kfold.aggregatesRefit[tier]?.r2)])),
    series: r2Series(kfold.folds),
  },
  loo: {
    folds: loo.folds.length,
    aggregates: Object.fromEntries(TIERS.map((tier) => [tier, block(loo.aggregatesRefit[tier]?.r2)])),
    series: r2Series(loo.folds),
  },
  rolling: {
    /** RMSE by test year, per tier: a trajectory, not a sample. */
    byTier: Object.fromEntries(
      TIERS.map((tier) => [
        tier,
        rolling.folds
          .map((fold) => ({ year: fold.testYear, rmse: fold.tierResults[tier]?.testMetricsRefit.rmse }))
          .filter((point): point is { year: number; rmse: number } => typeof point.rmse === 'number' && Number.isFinite(point.rmse))
          .sort((a, b) => a.year - b.year),
      ]),
    ),
  },
  coverage: {
    nominalCoverage: coverage.nominalCoverage,
    byProtocol: coverage.byProtocol,
  },
  ladder: ladder.tiers.map((tier) => ({
    tier: tier.tier,
    exploratory: tier.exploratory,
    parameterCount: tier.parameterCount,
    ...tier.trainMetrics,
  })),
  seeds,
  nRows: ladder.nRows,
}

fs.writeFileSync(OUT, `${JSON.stringify(payload)}\n`, 'utf8')

const bytes = fs.statSync(OUT).size
console.log(`✅ ${path.relative(REPO_ROOT, OUT)}  (${(bytes / 1024).toFixed(0)} KiB)`)
console.log(`   k-fold ${kfold.folds.length} folds, LOO ${loo.folds.length} folds, rolling ${rolling.folds.length} folds`)
console.log(`   ${seeds.length} seeds, ${seeds.filter((entry) => !entry.cAhead).length} with Tier C behind B`)
