import { z } from 'zod'
import summary from '../../data/analysis/evaluation_summary.json'
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
 * The Evaluation section reads `evaluation_summary.json`, a generated projection of the four
 * cross-validation artifacts.
 *
 * The raw artifacts are 1.8 MB and 0.9 MB because they carry per-fold coefficient vectors and
 * observed/predicted arrays that no view renders. Importing them put 2.2 MB into the initial
 * bundle; the summary is 16 KiB and holds exactly the numbers the section prints. Each claim
 * still names the artifact it ultimately came from, so the inspector points at the evidence of
 * record rather than at the projection.
 */
const summarySchema = z.object({
  kfold: z.object({
    config: z.object({ k: z.number(), repeats: z.number(), seeds: z.array(z.number()) }).passthrough(),
    folds: z.number().int().nonnegative(),
    aggregates: z.record(z.string(), z.object({
      median: z.number().nullable(),
      q25: z.number().nullable(),
      q75: z.number().nullable(),
      n: z.number().int().nullable(),
    }).nullable()),
    series: z.record(z.string(), z.array(z.number())),
  }).passthrough(),
  loo: z.object({
    folds: z.number().int().nonnegative(),
    aggregates: z.record(z.string(), z.object({
      median: z.number().nullable(),
      q25: z.number().nullable(),
      q75: z.number().nullable(),
      n: z.number().int().nullable(),
    }).nullable()),
    series: z.record(z.string(), z.array(z.number())),
  }).passthrough(),
  rolling: z.object({
    byTier: z.record(z.string(), z.array(z.object({ year: z.number(), rmse: z.number() }).passthrough())),
  }).passthrough(),
  coverage: z.object({
    nominalCoverage: z.number(),
    byProtocol: z.record(z.string(), z.record(z.string(), z.object({
      meanCoverage95: z.number(),
      underCoverageRate: z.number(),
      nFolds: z.number().int().nonnegative(),
    }).passthrough())),
  }).passthrough(),
  ladder: z.array(z.object({
    tier: z.string(),
    exploratory: z.boolean(),
    parameterCount: z.number().int().nonnegative(),
    r2: z.number(),
    corr: z.number(),
    mae: z.number(),
    rmse: z.number(),
    bias: z.number(),
  }).passthrough()),
  seeds: z.array(z.object({
    seed: z.number(),
    delta: z.number(),
    cAhead: z.boolean(),
  }).passthrough()),
  nRows: z.number().int().nonnegative(),
}).passthrough()

const data = summarySchema.parse(summary)
const tiers = ['A', 'B', 'C'] as const

const claim = (
  id: string, label: string, value: number, format: Claim['format'],
  artifact: string, path: string, note?: string,
): Claim => ({ id, label, value, format, artifact, path, note })

export type SeedDelta = { seed: number; delta: number; cAhead: boolean }

/**
 * One entry per repeat.
 *
 * The generator already pairs each repeat with its seed and drops repeats whose R² is
 * undefined; doing that here as well would be a second place for the rule to drift, so the
 * projection carries the pairing and this reads it.
 */
export const seedDeltas: SeedDelta[] = data.seeds

const seedsWithCFailing = seedDeltas.filter((entry) => !entry.cAhead).length

/** Per-fold R² series, straight from the projection. */
export const kfoldFoldSeries = (tier: string): number[] => data.kfold.series[tier] ?? []
export const looFoldSeries = (tier: string): number[] => data.loo.series[tier] ?? []

export type RollingPoint = { year: number; rmse: number }
export const rollingSeries = (tier: string): RollingPoint[] => data.rolling.byTier[tier] ?? []

export const coverageByProtocol = data.coverage.byProtocol
export const nominalCoverage = data.coverage.nominalCoverage
export const ladderRows = data.ladder
export const ladderRowsCount = data.nRows

/* ---- aggregate claims ---- */

const tierClaims = (protocol: 'kfold' | 'loo'): Claim[] => {
  const artifact = `${protocol === 'kfold' ? 'cv_kfold' : 'cv_country_out'}.json`
  const protocolLabel = protocol === 'kfold' ? 'grouped k-fold' : 'leave-one-country-out'
  const aggregates = protocol === 'kfold' ? data.kfold.aggregates : data.loo.aggregates
  const out: Claim[] = []
  for (const tier of tiers) {
    const block = aggregates[tier]
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
  ...tierClaims('kfold'),
  ...tierClaims('loo'),
  claim('eval.seeds.total', 'Planned k-fold repeats (one seed each)', data.kfold.config.seeds.length, 'int', 'cv_kfold.json', 'config.seeds'),
  claim('eval.seeds.cFails', 'Repeats where Tier C trails Tier B', seedsWithCFailing, 'int', 'cv_kfold.json', 'perRepeatRefit', 'Counted per repeat: a repeat is one seed.'),
  claim('eval.protocol.kfold.folds', 'Grouped k-fold folds', data.kfold.folds, 'int', 'cv_kfold.json', 'folds'),
  claim('eval.protocol.loo.folds', 'Leave-one-country-out folds', data.loo.folds, 'int', 'cv_country_out.json', 'folds'),
  claim('eval.protocol.rolling.folds', 'Rolling-origin folds', Object.values(data.rolling.byTier)[0]?.length ?? 0, 'int', 'cv_rolling_origin.json', 'folds'),
  claim('eval.nominalCoverage', 'Nominal interval coverage', data.coverage.nominalCoverage, 'pct1', 'prediction_interval_coverage.json', 'nominalCoverage'),
  ...(['country_out', 'rolling_origin'] as const).flatMap((protocol) =>
    tiers.flatMap((tier) => {
      const entry = coverageByProtocol[protocol]?.[tier]
      if (!entry) return []
      return [
        claim(`eval.coverage.${protocol}.${tier}`, `Mean ${protocol === 'country_out' ? 'country-out' : 'rolling-origin'} coverage, tier ${tier}`, entry.meanCoverage95, 'pct1', 'prediction_interval_coverage.json', `byProtocol.${protocol}.${tier}.meanCoverage95`),
        claim(`eval.coverage.${protocol}.${tier}.under`, `Fold under-coverage rate, ${protocol} tier ${tier}`, entry.underCoverageRate, 'pct1', 'prediction_interval_coverage.json', `byProtocol.${protocol}.${tier}.underCoverageRate`),
      ]
    }),
  ),
  claim('eval.ladder.nRows', 'Rows behind the model ladder', data.nRows, 'int', 'model_ladder_metrics.json', 'nRows'),
]

/** Per-seed claims, so Lab 5's readout is inspectable too. */
export const seedClaims: Claim[] = seedDeltas.map((entry, index) =>
  claim(
    `eval.seed.${entry.seed}.cMinusB`,
    `Tier C minus Tier B R² at seed ${entry.seed}`,
    entry.delta,
    'signed3',
    'cv_kfold.json',
    // A per-seed delta is `perRepeatRefit[i].C.r2 - perRepeatRefit[i].B.r2`: no single field
    // equals it, so the path names the array and the note records the derivation.
    'perRepeatRefit',
    `Derived: perRepeatRefit[${index}].C.r2 minus B.r2 for the repeat seeded ${entry.seed}.`,
  ),
)
