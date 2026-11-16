import { z } from 'zod'
import constructPrevalence from '../../data/analysis/construct_prevalence.json'
import wvsConstructAudit from '../../data/analysis/wvs_construct_audit.json'
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
  frame: z.object({ canonicalCompleteCases: z.number().int().nonnegative() }).passthrough()
}).passthrough()

const audit = auditSchema.parse(wvsConstructAudit)
const prevalence = prevalenceSchema.parse(constructPrevalence)

function claim(
  id: string,
  label: string,
  value: number,
  format: Claim['format'],
  path: string,
  note?: string
): Claim {
  return { id, label, value, format, artifact: 'wvs_construct_audit.json', path, note }
}

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
  claim('audit.failedCount', 'Failed non-outcome constructs', failedCount, 'int', 'constructs', 'Derived as uncomputable or below the configured reliability floor; Z is excluded.')
]
