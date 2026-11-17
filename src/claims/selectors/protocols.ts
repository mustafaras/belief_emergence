import { z } from 'zod'
import cvKfold from '../../data/analysis/cv_kfold.json'
import cvCountryOut from '../../data/analysis/cv_country_out.json'
import cvRolling from '../../data/analysis/cv_rolling_origin.json'
import coverage from '../../data/analysis/prediction_interval_coverage.json'
import ladder from '../../data/analysis/model_ladder_metrics.json'
import type { Claim } from '../types'

/**
 * Per-protocol evaluation claims.
 *
 * These come from four artifacts that describe the same models under four different
 * evaluations. Keeping them in one selector is deliberate: the section's whole argument is
 * that the protocol changes the answer, so a claim that names its protocol and its tier is
 * easier to trust than one that says only "R²".
 */
/**
 * A metric block.
 *
 * Quartiles can be null: leave-one-country-out folds with one or two rows have no
 * measurable variance, so R² is undefined rather than small. The claim layer must accept
 * that instead of coercing it to zero, which would report a perfect fit for a fold that
 * could not be scored at all.
 */
const maybeNumber = z.number().nullable()
const blockSchema = z.object({
  median: maybeNumber,
  q25: maybeNumber,
  q75: maybeNumber,
  /** Present on k-fold aggregates, absent on country-out, where most folds cannot be scored. */
  n: z.number().int().nonnegative().optional(),
}).passthrough()

const kfoldSchema = z.object({
  config: z.object({
    k: z.number().int().positive(),
    repeats: z.number().int().positive(),
    seeds: z.array(z.number()),
  }).passthrough(),
  folds: z.array(z.object({
    repeat: z.number().int().nonnegative(),
    tierResults: z.record(z.string(), z.object({
      testMetricsRefit: z.object({ r2: maybeNumber, rmse: maybeNumber }).passthrough(),
    }).passthrough()),
  }).passthrough()),
  aggregatesRefit: z.record(z.string(), z.object({ r2: blockSchema }).passthrough()),
  perRepeatRefit: z.array(z.record(z.string(), z.object({ r2: maybeNumber }).passthrough())),
}).passthrough()

const protocolSchema = z.object({
  folds: z.array(z.object({
    tierResults: z.record(z.string(), z.object({
      testMetricsRefit: z.object({ r2: maybeNumber, rmse: maybeNumber }).passthrough(),
    }).passthrough()),
  }).passthrough()),
  aggregatesRefit: z.record(z.string(), z.object({ r2: blockSchema }).passthrough()),
}).passthrough()

const coverageSchema = z.object({
  nominalCoverage: z.number(),
  byProtocol: z.record(
    z.string(),
    z.record(z.string(), z.object({
      meanCoverage95: z.number(),
      underCoverageRate: z.number(),
      nFolds: z.number().int().nonnegative(),
    }).passthrough()),
  ),
}).passthrough()

const kfold = kfoldSchema.parse(cvKfold)
const loo = protocolSchema.parse(cvCountryOut)
const cov = coverageSchema.parse(coverage)
const tiers = ['A', 'B', 'C'] as const

const claim = (
  id: string, label: string, value: number, format: Claim['format'],
  artifact: string, path: string, note?: string,
): Claim => ({ id, label, value, format, artifact, path, note })

/* ---- per-seed Tier C minus B, the quantity Lab 5 explores ---- */

export type SeedDelta = { seed: number; delta: number; cAhead: boolean }

/**
 * One entry per repeat.
 *
 * `seeds` in the artifact has one value per planned repeat, and `perRepeatRefit` has one
 * entry per completed repeat. Zipping them is correct only while the two lengths agree; if
 * a repeat had failed, the arrays would misalign and every seed would be attributed to the
 * wrong delta. The length check makes that a loud failure instead.
 */
export const seedDeltas: SeedDelta[] = (() => {
  const { seeds } = kfold.config
  const repeats = kfold.perRepeatRefit
  if (seeds.length !== repeats.length) {
    throw new Error(
      `cv_kfold.json has ${seeds.length} seeds but ${repeats.length} completed repeats; `
      + 'per-seed attribution would be wrong.',
    )
  }
  return seeds.flatMap((seed, index) => {
    const c = repeats[index].C.r2
    const b = repeats[index].B.r2
    // A repeat whose R² is undefined carries no ordering information; dropping it is
    // correct, inventing a zero would bias the count of seeds where C trails B.
    if (c === null || b === null) return []
    const delta = c - b
    return [{ seed, delta, cAhead: delta > 0 }]
  })
})()

const seedsWithCFailing = seedDeltas.filter((entry) => !entry.cAhead).length

/* ---- fold-series helpers (raw, for the strip plots) ---- */

export const kfoldFoldSeries = (tier: string): number[] =>
  kfold.folds
    .map((fold) => fold.tierResults[tier]?.testMetricsRefit.r2)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

export const looFoldSeries = (tier: string): number[] =>
  loo.folds
    .map((fold) => fold.tierResults[tier]?.testMetricsRefit.r2)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

export type RollingPoint = { year: number; rmse: number }

export const rollingSeries = (tier: string): RollingPoint[] =>
  (cvRolling as { folds: Array<{ testYear: number; tierResults: Record<string, { testMetricsRefit: { rmse: number } }> }> })
    .folds
    .map((fold) => ({ year: fold.testYear, rmse: fold.tierResults[tier]?.testMetricsRefit.rmse }))
    .filter((point): point is RollingPoint => typeof point.rmse === 'number' && Number.isFinite(point.rmse))
    .sort((a, b) => a.year - b.year)

export const coverageByProtocol = cov.byProtocol
export const nominalCoverage = cov.nominalCoverage

/* ---- aggregate claims ---- */

const tierClaims = (protocol: 'kfold' | 'loo', aggregates: typeof kfold.aggregatesRefit): Claim[] => {
  const artifact = `${protocol === 'kfold' ? 'cv_kfold' : 'cv_country_out'}.json`
  const protocolLabel = protocol === 'kfold' ? 'grouped k-fold' : 'leave-one-country-out'
  const out: Claim[] = []
  for (const tier of tiers) {
    const block = aggregates[tier]?.r2
    if (!block) continue
    // A null quartile is a fold set that could not be scored, not a zero; it is skipped.
    for (const [suffix, value, label] of [
      ['median', block.median, 'median'],
      ['q25', block.q25, '25th percentile'],
      ['q75', block.q75, '75th percentile'],
    ] as const) {
      if (value === null) continue
      out.push(claim(
        `eval.${protocol}.${tier}.${suffix}`,
        `${tier} ${protocolLabel} R² ${label}`,
        value,
        'r2',
        artifact,
        `aggregatesRefit.${tier}.r2.${suffix}`,
      ))
    }
  }
  return out
}

export const protocolClaims: Claim[] = [
  ...tierClaims('kfold', kfold.aggregatesRefit),
  ...tierClaims('loo', loo.aggregatesRefit),
  claim('eval.seeds.total', 'Planned k-fold repeats (one seed each)', kfold.config.seeds.length, 'int', 'cv_kfold.json', 'config.seeds'),
  claim('eval.seeds.cFails', 'Repeats where Tier C trails Tier B', seedsWithCFailing, 'int', 'cv_kfold.json', 'perRepeatRefit', 'Counted per repeat: a repeat is one seed.'),
  claim('eval.protocol.kfold.folds', 'Grouped k-fold folds', kfold.folds.length, 'int', 'cv_kfold.json', 'folds'),
  claim('eval.protocol.loo.folds', 'Leave-one-country-out folds', loo.folds.length, 'int', 'cv_country_out.json', 'folds'),
  claim('eval.protocol.rolling.folds', 'Rolling-origin folds', (cvRolling as { folds: unknown[] }).folds.length, 'int', 'cv_rolling_origin.json', 'folds'),
  claim('eval.nominalCoverage', 'Nominal interval coverage', cov.nominalCoverage, 'pct1', 'prediction_interval_coverage.json', 'nominalCoverage'),
  ...(['country_out', 'rolling_origin'] as const).flatMap((protocol) =>
    tiers.flatMap((tier) => {
      const entry = cov.byProtocol[protocol]?.[tier]
      if (!entry) return []
      return [
        claim(`eval.coverage.${protocol}.${tier}`, `Mean ${protocol === 'country_out' ? 'country-out' : 'rolling-origin'} coverage, tier ${tier}`, entry.meanCoverage95, 'pct1', 'prediction_interval_coverage.json', `byProtocol.${protocol}.${tier}.meanCoverage95`),
        claim(`eval.coverage.${protocol}.${tier}.under`, `Fold under-coverage rate, ${protocol} tier ${tier}`, entry.underCoverageRate, 'pct1', 'prediction_interval_coverage.json', `byProtocol.${protocol}.${tier}.underCoverageRate`),
      ]
    }),
  ),
  claim('eval.ladder.nRows', 'Rows behind the model ladder', ladder.nRows, 'int', 'model_ladder_metrics.json', 'nRows'),
]

/** Per-seed claims, so Lab 5's readout is inspectable too. */
export const seedClaims: Claim[] = seedDeltas.map((entry) =>
  claim(
    `eval.seed.${entry.seed}.cMinusB`,
    `Tier C minus Tier B R² at seed ${entry.seed}`,
    entry.delta,
    'signed3',
    'cv_kfold.json',
    // A per-seed delta is `perRepeatRefit[i].C.r2 - perRepeatRefit[i].B.r2`: no single field
    // in the artifact equals it. The path therefore names the repeat the value was taken from
    // rather than pretending the difference is stored.
    'perRepeatRefit',
    `Derived: perRepeatRefit[${seedDeltas.indexOf(entry)}].C.r2 minus B.r2 for the repeat seeded ${entry.seed}.`,
  ),
)
