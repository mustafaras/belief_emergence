import { z } from 'zod'
import constructAvailability from '../../data/analysis/construct_item_availability.json'
import constructPrevalence from '../../data/analysis/construct_prevalence.json'
import wvsConstructAudit from '../../data/analysis/wvs_construct_audit.json'
import { buildConstructRows, RELIABILITY_FLOOR, summarise, type AuditArtifact, type ItemAvailability } from '../../verification/constructAudit'
import type { Claim } from '../types'

const constructSchema = z.object({
  cellsEmitted: z.number().int().nonnegative(),
  computable: z.boolean(),
  cronbachAlpha: z.number()
}).passthrough()

const auditSchema = z.object({
  respondentsScanned: z.number().int().nonnegative(),
  countryYears: z.number().int().nonnegative(),
  constructs: z.object({
    Z_belief_outcome: constructSchema,
    C_cultural_intensity: constructSchema,
    D_social_atomization: constructSchema,
    S_social_support: constructSchema
  })
}).passthrough()

const prevalenceSchema = z.object({
  reliabilityFloor: z.number(),
  frame: z.object({
    canonicalCompleteCases: z.number().int().nonnegative(),
    zComputableCells: z.number().int().nonnegative(),
    scannedCountryYears: z.number().int().nonnegative(),
  }).passthrough(),
  summary: z.object({
    configuredConstructs: z.number().int().nonnegative(),
    retained: z.number().int().nonnegative(),
    withdrawn: z.number().int().nonnegative(),
    uncomputable: z.number().int().nonnegative(),
    failureRate: z.number().min(0).max(1),
  }).passthrough()
}).passthrough()

const audit = auditSchema.parse(wvsConstructAudit)
const prevalence = prevalenceSchema.parse(constructPrevalence)

const availability = (
  JSON.parse(JSON.stringify(constructAvailability)) as {
    constructs: Record<string, ItemAvailability>
  }
).constructs

/**
 * The reliability floor the paper sets for itself.
 *
 * Read from the artifact rather than typed, so the decision lab's slider starts where the
 * manuscript says it should. `constructAudit.ts` carries the same number as a constant for
 * the verdict rule; the two are asserted equal at module load so they cannot drift.
 */
export const PAPER_RELIABILITY_FLOOR = prevalence.reliabilityFloor

if (prevalence.reliabilityFloor !== RELIABILITY_FLOOR) {
  throw new Error(
    `construct_prevalence.json records a floor of ${prevalence.reliabilityFloor}, but the verdict rule uses ${RELIABILITY_FLOOR}.`,
  )
}

/** Rows the audit table renders, built by the same module the CLI check uses. */
export const constructRows = buildConstructRows(
  audit as unknown as AuditArtifact,
  availability,
)

export const constructSummary = summarise(constructRows)

/**
 * How many constructs clear an arbitrary floor.
 *
 * The lab's counter is this function, not a stored verdict: `verdictFor` decides at the
 * paper's floor, but a reader moving the slider is asking a different question — "how many
 * would survive *my* threshold" — and answering it by re-filtering the alpha is the only
 * honest way to do that. Withheld alphas are excluded, so S never counts as admitted.
 */
export function admittedAt(floor: number): number {
  return constructRows.filter(row => row.alpha !== null && row.alpha >= floor).length
}

function claim(
  id: string,
  label: string,
  value: number,
  format: Claim['format'],
  path: string,
  note?: string,
  artifact: string = 'wvs_construct_audit.json',
): Claim {
  return { id, label, value, format, artifact, path, note }
}

/** Verdict counts and the floor live in the prevalence artifact, not the audit. */
const fromPrevalence = (
  id: string,
  label: string,
  value: number,
  format: Claim['format'],
  path: string,
  note?: string,
): Claim => claim(id, label, value, format, path, note, 'construct_prevalence.json')

const measuredConstructs = Object.entries(audit.constructs).filter(
  ([name]) => name !== 'Z_belief_outcome'
)
const constructCount = Object.keys(audit.constructs).length
const failedCount = measuredConstructs.filter(
  ([, construct]) => !construct.computable || construct.cronbachAlpha < prevalence.reliabilityFloor
).length

export const auditClaims: Claim[] = [
  claim('audit.respondents', 'Respondents scanned', audit.respondentsScanned, 'int', 'respondentsScanned'),
  claim('audit.countryYears', 'Country-years scanned', audit.countryYears, 'int', 'countryYears'),
  claim('audit.constructCount', 'Configured constructs', constructCount, 'int', 'constructs', 'Count of the four configured constructs, including the outcome.'),
  claim('audit.Z.alpha', 'Z construct alpha', audit.constructs.Z_belief_outcome.cronbachAlpha, 'p3', 'constructs.Z_belief_outcome.cronbachAlpha'),
  claim('audit.Z.cells', 'Z construct cells', audit.constructs.Z_belief_outcome.cellsEmitted, 'int', 'constructs.Z_belief_outcome.cellsEmitted'),
  claim('audit.C.alpha', 'C construct alpha', audit.constructs.C_cultural_intensity.cronbachAlpha, 'p3', 'constructs.C_cultural_intensity.cronbachAlpha'),
  claim('audit.C.cells', 'C construct cells', audit.constructs.C_cultural_intensity.cellsEmitted, 'int', 'constructs.C_cultural_intensity.cellsEmitted'),
  claim('audit.D.alpha', 'D construct alpha', audit.constructs.D_social_atomization.cronbachAlpha, 'p3', 'constructs.D_social_atomization.cronbachAlpha'),
  claim('audit.D.cells', 'D construct cells', audit.constructs.D_social_atomization.cellsEmitted, 'int', 'constructs.D_social_atomization.cellsEmitted'),
  claim('audit.S.cells', 'S computable cells', audit.constructs.S_social_support.cellsEmitted, 'int', 'constructs.S_social_support.cellsEmitted', 'S is uncomputable; no alpha claim is made.'),
  claim('audit.failedCount', 'Failed non-outcome constructs', failedCount, 'int', 'constructs', 'Derived as uncomputable or below the configured reliability floor; Z is excluded.'),
  // The audit route's own counts. Named separately from `audit.constructCount` because that
  // one counts the four rows including the outcome, while these describe the *verdict*
  // split the table shows. Both are true and they are not interchangeable.
  fromPrevalence('audit.constructs.retained', 'Constructs retained', prevalence.summary.retained, 'int', 'summary.retained', 'Retained by the reliability and dimensionality rule.'),
  fromPrevalence('audit.constructs.withdrawn', 'Constructs withdrawn', prevalence.summary.withdrawn, 'int', 'summary.withdrawn'),
  fromPrevalence('audit.constructs.uncomputable', 'Constructs not computable', prevalence.summary.uncomputable, 'int', 'summary.uncomputable'),
  fromPrevalence('audit.constructs.failureRate', 'Share of configured constructs that fail', prevalence.summary.failureRate, 'pct1', 'summary.failureRate'),
  fromPrevalence('audit.floor', "The paper's reliability floor", PAPER_RELIABILITY_FLOOR, 'p2', 'reliabilityFloor'),
  fromPrevalence('audit.frame.zCells', 'Outcome cells with a computable Z', prevalence.frame.zComputableCells, 'int', 'frame.zComputableCells')
]
