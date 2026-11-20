import { z } from 'zod'
import failureLogArtifact from '../../data/analysis/failure_log.json'
import ladderArtifact from '../../data/analysis/model_ladder_metrics.json'
import coverageArtifact from '../../data/analysis/prediction_interval_coverage.json'
import stabilityArtifact from '../../data/analysis/parameter_stability.json'

/**
 * The four robustness artifacts, read here so they are read somewhere.
 *
 * The plan's item A6 records that all four were generated and committed and displayed by no
 * component: a reader who wanted to know whether any fold failed, whether the intervals
 * covered, whether coefficients held their sign, or what the nested ladder found, had to open
 * the JSON. These selectors are the smallest thing that makes those answers visible, and every
 * number on the panel is derived here rather than typed into it.
 *
 * They deliberately do not become claims: a claim is a value the paper asserts, and these are
 * diagnostics about the fit rather than findings. They still carry their artifact name on
 * screen, so the path back to the file is one click from the rendered page.
 */

const finite = z.number().finite()

const failureSchema = z.object({
  entries: z.array(z.object({ protocol: z.string(), tier: z.string(), converged: z.boolean() }).passthrough()),
  byTier: z.record(z.string(), z.object({ totalFolds: z.number().int().nonnegative(), failedFolds: z.number().int().nonnegative() }).passthrough()),
}).passthrough()

/*
 * The ladder artifact carries `trainMetrics` only. The first version of this schema expected
 * `testMetrics` and threw a ZodError at import — which blanked the whole route, not just the
 * panel. That is the failure mode a runtime schema is for, and also why the parse happens at
 * module load rather than inside a render.
 */
const ladderSchema = z.object({
  tiers: z.array(z.object({
    tier: z.string(),
    label: z.string(),
    converged: z.boolean(),
    parameterCount: z.number().int().positive(),
    trainMetrics: z.object({ r2: finite }).passthrough(),
  }).passthrough()),
}).passthrough()

const coverageSchema = z.object({
  nominalCoverage: finite,
  severeUnderCoverageThreshold: finite,
  byProtocol: z.record(z.string(), z.record(z.string(), z.object({ medianCoverage95: finite }).passthrough())),
}).passthrough()

const stabilitySchema = z.object({
  thresholdSignConsistency: finite,
  byProtocol: z.record(z.string(), z.record(z.string(), z.object({
    coefficients: z.array(z.object({ name: z.string(), signConsistency: finite }).passthrough()),
  }).passthrough())),
}).passthrough()

const failure = failureSchema.parse(failureLogArtifact)
const ladder = ladderSchema.parse(ladderArtifact)
const coverage = coverageSchema.parse(coverageArtifact)
const stability = stabilitySchema.parse(stabilityArtifact)

/** Total folds across tiers, and how many of them failed to converge. */
const foldTotals = Object.values(failure.byTier).reduce(
  (acc, tier) => ({ total: acc.total + tier.totalFolds, failed: acc.failed + tier.failedFolds }),
  { total: 0, failed: 0 },
)

export const failureLog = {
  artifact: 'failure_log',
  totalFolds: foldTotals.total,
  failedFolds: foldTotals.failed,
}

/**
 * Terms whose coefficient changed sign across repeats, at the configured floor.
 *
 * A term counts as unstable when *any* protocol reports a sign consistency below the floor.
 * Taking the best protocol instead would have reported "all stable" for a specification that
 * is not stable everywhere, which is the kind of averaging that hides the finding.
 */
const unstableTerms = [...new Set(
  Object.values(stability.byProtocol)
    .flatMap((byTier) => Object.values(byTier))
    .flatMap((tier) => tier.coefficients)
    .filter((coefficient) => coefficient.signConsistency < stability.thresholdSignConsistency)
    .map((coefficient) => coefficient.name),
)].sort()

export const parameterStability = {
  artifact: 'parameter_stability',
  threshold: stability.thresholdSignConsistency,
  unstableTerms,
}

/**
 * The worst interval coverage any protocol achieved, against the nominal claim.
 *
 * The worst, not the mean: an interval method that covers 95% on average while covering 60%
 * in one protocol is not a method that covers.
 */
const coverageValues = Object.values(coverage.byProtocol)
  .flatMap((byTier) => Object.values(byTier))
  .map((tier) => tier.medianCoverage95)

export const intervalCoverage = {
  artifact: 'prediction_interval_coverage',
  nominal: coverage.nominalCoverage,
  severeThreshold: coverage.severeUnderCoverageThreshold,
  worstCoverage: Math.min(...coverageValues),
}

/**
 * The nested ladder: parameter count and in-sample R² per tier.
 *
 * The artifact records **in-sample** fit only, so this panel reports in-sample fit. An earlier
 * draft of this file claimed to name "the best held-out tier" — the artifact has no held-out
 * metric to name, and the claim would have been invented. The held-out comparison lives in
 * `functional_form_comparison.json` and is what the rest of this route shows.
 */
const converged = ladder.tiers.filter((tier) => tier.converged)

export const ladderMetrics = {
  artifact: 'model_ladder_metrics',
  tiers: ladder.tiers.length,
  rows: converged.map((tier) => ({
    tier: tier.tier,
    label: tier.label,
    parameters: tier.parameterCount,
    r2: tier.trainMetrics.r2,
  })),
}
