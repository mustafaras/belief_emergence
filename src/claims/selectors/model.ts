import { z } from 'zod'
import signDiagnostics from '../../data/analysis/sign_diagnostics.json'
import coefficientBootstrapArtifact from '../../data/analysis/coefficient_bootstrap.json'
import coefficientFitArtifact from '../../data/analysis/coefficient_fit.json'
import failureLogArtifact from '../../data/analysis/failure_log.json'
import parameterStabilityArtifact from '../../data/analysis/parameter_stability.json'
import { INTERACTION_TERMS, OPTIMIZED_SIGMOID_COEFFICIENTS } from '../../data/feCoefficients'
import type { Claim } from '../types'

const finite = z.number().finite()
const tierSchema = z.enum(['A', 'B', 'C'])
const fitSchema = z.object({
  nRows: z.number().int().positive(),
  nCountries: z.number().int().positive(),
  parameters: z.object({
    phi0: finite,
    alpha: finite,
    beta: finite,
    k: finite,
    c_M: finite,
    c_T: finite,
    c_E: finite,
    c_R: finite,
    c_tr: finite,
    c_yr: finite
  }).passthrough()
}).passthrough()
const bootstrapParameterSchema = z.object({
  estimate: finite,
  lo: finite,
  hi: finite,
  excludesZero: z.boolean()
}).passthrough()
const bootstrapSchema = z.object({
  resamples: z.number().int().positive(),
  nCountries: z.number().int().positive(),
  parameters: z.record(z.string(), bootstrapParameterSchema)
}).passthrough()
const failureTierSchema = z.object({
  totalFolds: z.number().int().nonnegative(),
  failedFolds: z.number().int().nonnegative(),
  failureRate: finite,
  reasons: z.array(z.unknown())
})
const failureSchema = z.object({
  entries: z.array(z.object({
    protocol: z.enum(['country_out', 'rolling_origin']),
    tier: tierSchema,
    converged: z.boolean()
  }).passthrough()),
  byTier: z.object({ A: failureTierSchema, B: failureTierSchema, C: failureTierSchema })
}).passthrough()
const stabilityTierSchema = z.object({
  nConvergedFolds: z.number().int().nonnegative(),
  unstableCount: z.number().int().nonnegative()
}).passthrough()
const stabilitySchema = z.object({
  byProtocol: z.object({
    country_out: z.object({ A: stabilityTierSchema, B: stabilityTierSchema, C: stabilityTierSchema }),
    rolling_origin: z.object({ A: stabilityTierSchema, B: stabilityTierSchema, C: stabilityTierSchema })
  }),
  pooledByTier: z.object({
    A: z.object({ medianSignConsistency: finite, unstableCount: z.number().int().nonnegative() }),
    B: z.object({ medianSignConsistency: finite, unstableCount: z.number().int().nonnegative() }),
    C: z.object({ medianSignConsistency: finite, unstableCount: z.number().int().nonnegative() })
  })
}).passthrough()

const fit = fitSchema.parse(coefficientFitArtifact)
const bootstrap = bootstrapSchema.parse(coefficientBootstrapArtifact)
const failures = failureSchema.parse(failureLogArtifact)
const stability = stabilitySchema.parse(parameterStabilityArtifact)

if (fit.nCountries !== bootstrap.nCountries) {
  throw new Error('Coefficient fit and bootstrap artifacts have different country counts.')
}

for (const key of ['c_M', 'c_T', 'c_E', 'c_R', 'c_tr', 'c_yr'] as const) {
  if (bootstrap.parameters[key]?.estimate !== fit.parameters[key]) {
    throw new Error(`Bootstrap estimate for ${key} does not match the shipped fit.`)
  }
}

const productionValues = {
  c_M: OPTIMIZED_SIGMOID_COEFFICIENTS.c2,
  c_T: OPTIMIZED_SIGMOID_COEFFICIENTS.c3,
  c_E: OPTIMIZED_SIGMOID_COEFFICIENTS.c6,
  c_R: OPTIMIZED_SIGMOID_COEFFICIENTS.c8,
  c_tr: INTERACTION_TERMS.c_tr,
  c_yr: INTERACTION_TERMS.c_yr
} as const

for (const key of Object.keys(productionValues) as (keyof typeof productionValues)[]) {
  if (productionValues[key] !== fit.parameters[key]) {
    throw new Error(`Production coefficient ${key} does not match coefficient_fit.json.`)
  }
}

const coefficientKeys = {
  E: 'c_E',
  R: 'c_R',
  M: 'c_M',
  T: 'c_T',
  tr: 'c_tr',
  yr: 'c_yr'
} as const

export type ModelCoefficient = keyof typeof coefficientKeys
export const withdrawnConstructs = ['C', 'D', 'G', 'S'] as const

const withdrawnProductionValues = {
  C: OPTIMIZED_SIGMOID_COEFFICIENTS.c1,
  D: OPTIMIZED_SIGMOID_COEFFICIENTS.c4,
  G: OPTIMIZED_SIGMOID_COEFFICIENTS.c5,
  S: OPTIMIZED_SIGMOID_COEFFICIENTS.c7
} as const

if (withdrawnConstructs.some(construct => withdrawnProductionValues[construct] !== 0)) {
  throw new Error('A withdrawn construct has a nonzero production coefficient.')
}

if (Object.keys(fit.parameters).length !== 10) {
  throw new Error(`Expected 10 fitted parameters; found ${Object.keys(fit.parameters).length}.`)
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

const coefficientClaims: Claim[] = (Object.keys(coefficientKeys) as ModelCoefficient[]).map(name => {
  const key = coefficientKeys[name]
  const label = name === 'tr' ? 'Trauma × welfare interaction coefficient' :
    name === 'yr' ? 'Inequality × welfare interaction coefficient' :
      `${name} production coefficient`
  return claim(`model.c.${name}`, label, fit.parameters[key], 'signed2', 'coefficient_fit.json', `parameters.${key}`)
})

const bootstrapClaims: Claim[] = (Object.keys(coefficientKeys) as ModelCoefficient[]).flatMap(name => {
  const key = coefficientKeys[name]
  const interval = bootstrap.parameters[key]
  if (!interval) throw new Error(`Bootstrap artifact is missing ${key}.`)
  const note = `Country-level cluster bootstrap (${bootstrap.resamples} resamples), local refits conditional on the shipped basin.`
  return [
    claim(`model.bootstrap.${key}.lo`, `Bootstrap lower bound for ${key}`, interval.lo, 'signed2', 'coefficient_bootstrap.json', `parameters.${key}.lo`, note),
    claim(`model.bootstrap.${key}.hi`, `Bootstrap upper bound for ${key}`, interval.hi, 'signed2', 'coefficient_bootstrap.json', `parameters.${key}.hi`, note)
  ]
})

const phi0MinusLnK = bootstrap.parameters.phi0_minus_lnk
if (!phi0MinusLnK) throw new Error('Bootstrap artifact is missing phi0_minus_lnk.')

const failureCount = (['A', 'B', 'C'] as const).reduce((total, tier) => total + failures.byTier[tier].failedFolds, 0)
for (const tier of ['A', 'B', 'C'] as const) {
  const observedCount = failures.entries.filter(entry => entry.tier === tier).length
  if (observedCount !== failures.byTier[tier].totalFolds) {
    throw new Error(`Failure log entry count does not match its summary for tier ${tier}.`)
  }
  const observedFailures = failures.entries.filter(entry => entry.tier === tier && !entry.converged).length
  if (observedFailures !== failures.byTier[tier].failedFolds) {
    throw new Error(`Failure log convergence count does not match its summary for tier ${tier}.`)
  }
}

/**
 * Sign diagnostics for the media channel.
 *
 * The execution prompt asked Table 4.1 to say "sign flipped across panels; not identified" for
 * M. Nothing recorded a flip, so it was measured, and the answer splits: the marginal
 * association reverses sign while the partial coefficient does not — and the partial
 * coefficient's interval includes zero, so neither sign is a finding. Both numbers are
 * claimed so the table can show which is which.
 */
const signSchema = z.object({
  panels: z.array(z.object({
    panel: z.enum(['original', 'rebuilt']),
    panelRows: z.number().int().nonnegative(),
    marginalCorrelation: z.number(),
    marginalSlope: z.number(),
    partialCoefficient: z.number(),
    partialInterval: z.object({
      lo: z.number(),
      hi: z.number(),
      excludesZero: z.boolean(),
    }).nullable(),
  }).passthrough()),
  finding: z.object({
    marginalFlips: z.boolean(),
    partialFlips: z.boolean(),
    partialIdentified: z.boolean(),
    statement: z.string(),
  }).passthrough(),
}).passthrough()

const signs = signSchema.parse(signDiagnostics)
const signOf = (panel: 'original' | 'rebuilt') => {
  const found = signs.panels.find((entry) => entry.panel === panel)
  if (!found) throw new Error(`sign_diagnostics.json has no ${panel} panel entry`)
  return found
}

export const signClaims: Claim[] = [
  claim('model.sign.original.marginal', 'M: marginal correlation with the outcome, submitted panel', signOf('original').marginalCorrelation, 'signed2', 'sign_diagnostics.json', 'panels[panel=original].marginalCorrelation'),
  claim('model.sign.rebuilt.marginal', 'M: marginal correlation with the outcome, rebuilt panel', signOf('rebuilt').marginalCorrelation, 'signed2', 'sign_diagnostics.json', 'panels[panel=rebuilt].marginalCorrelation'),
  claim('model.sign.original.partial', 'M: partial coefficient, submitted panel', signOf('original').partialCoefficient, 'signed2', 'sign_diagnostics.json', 'panels[panel=original].partialCoefficient'),
  claim('model.sign.rebuilt.partial', 'M: partial coefficient, rebuilt panel', signOf('rebuilt').partialCoefficient, 'signed2', 'sign_diagnostics.json', 'panels[panel=rebuilt].partialCoefficient'),
  claim('model.sign.original.rows', 'M: complete rows on the submitted panel', signOf('original').panelRows, 'int', 'sign_diagnostics.json', 'panels[panel=original].panelRows'),
  claim('model.sign.rebuilt.rows', 'M: complete rows on the rebuilt panel', signOf('rebuilt').panelRows, 'int', 'sign_diagnostics.json', 'panels[panel=rebuilt].panelRows'),
]

export const signDiagnosticsData = signs

export const modelClaims: Claim[] = [
  ...coefficientClaims,
  ...signClaims,
  claim('model.params', 'Fitted model parameters', Object.keys(fit.parameters).length, 'int', 'coefficient_fit.json', 'parameters'),
  ...bootstrapClaims,
  claim('model.identified.phi0MinusLnK', 'Identified combination phi0 minus log(k)', phi0MinusLnK.estimate, 'p3', 'coefficient_bootstrap.json', 'parameters.phi0_minus_lnk.estimate', 'The combination is identified; phi0 and k are not separately identified.'),
  claim('model.identified.phi0MinusLnK.lo', 'Bootstrap lower bound for phi0 minus log(k)', phi0MinusLnK.lo, 'p3', 'coefficient_bootstrap.json', 'parameters.phi0_minus_lnk.lo'),
  claim('model.identified.phi0MinusLnK.hi', 'Bootstrap upper bound for phi0 minus log(k)', phi0MinusLnK.hi, 'p3', 'coefficient_bootstrap.json', 'parameters.phi0_minus_lnk.hi'),
  claim('model.folds.total', 'Recorded model evaluation folds', failures.entries.length, 'int', 'failure_log.json', 'entries.length'),
  claim('model.folds.failed', 'Nonconverged model evaluation folds', failureCount, 'int', 'failure_log.json', 'byTier'),
  ...(['A', 'B', 'C'] as const).flatMap(tier => [
    claim(`model.folds.failed.${tier}`, `Nonconverged tier ${tier} folds`, failures.byTier[tier].failedFolds, 'int', 'failure_log.json', `byTier.${tier}.failedFolds`),
    claim(`model.stability.${tier}.medianSignConsistency`, `Tier ${tier} pooled median coefficient sign consistency`, stability.pooledByTier[tier].medianSignConsistency, 'p3', 'parameter_stability.json', `pooledByTier.${tier}.medianSignConsistency`),
    claim(`model.stability.${tier}.unstableCount`, `Tier ${tier} pooled unstable coefficient terms`, stability.pooledByTier[tier].unstableCount, 'int', 'parameter_stability.json', `pooledByTier.${tier}.unstableCount`)
  ])
]

const coefficientBootstrapKey = {
  E: 'c_E',
  R: 'c_R',
  M: 'c_M',
  T: 'c_T',
  tr: 'c_tr',
  yr: 'c_yr'
} as const

/** Only coefficients with a zero-excluding bootstrap interval may be called distinguishable. */
export function isCoefficientDistinguishableFromZero(name: ModelCoefficient): boolean {
  if (name !== 'E' && name !== 'yr') return false
  return bootstrap.parameters[coefficientBootstrapKey[name]].excludesZero
}
