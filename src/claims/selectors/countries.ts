import { z } from 'zod'
import presetCountryAlignmentArtifact from '../../data/analysis/preset_country_alignment.json'
import { GENERATED_PRESETS } from '../../data/presets.generated'

const finite = z.number().finite()
const countrySchema = z.object({
  iso3: z.string().regex(/^[A-Z]{3}$/),
  name: z.string().min(1),
  isPreset: z.boolean(),
  nYears: z.number().int().positive(),
  meanObservedZ: finite,
  meanPredictedZ: finite,
  mae: finite,
  verdictClass: z.enum(['good', 'acceptable', 'poor'])
}).passthrough()
const alignmentSchema = z.object({
  nCountries: z.number().int().positive(),
  nPresetCountries: z.number().int().positive(),
  failureMae: finite,
  thresholds: z.object({ goodMaeMax: finite, acceptableMaeMax: finite }),
  presetFailures: z.array(z.string().regex(/^[A-Z]{3}$/)),
  allCountryFailures: z.array(z.string().regex(/^[A-Z]{3}$/)),
  countries: z.array(countrySchema)
}).passthrough()

const alignment = alignmentSchema.parse(presetCountryAlignmentArtifact)
const isoCodes = alignment.countries.map(country => country.iso3)
if (alignment.countries.length !== alignment.nCountries || new Set(isoCodes).size !== isoCodes.length) {
  throw new Error('Country alignment count is inconsistent or contains duplicate ISO3 codes.')
}

const presetRows = alignment.countries.filter(country => country.isPreset)
const generatedPresetCodes = GENERATED_PRESETS.map(preset => preset.iso3).sort()
const artifactPresetCodes = presetRows.map(country => country.iso3).sort()
if (generatedPresetCodes.length !== alignment.nPresetCountries ||
  JSON.stringify(generatedPresetCodes) !== JSON.stringify(artifactPresetCodes)) {
  throw new Error('Generated preset countries do not match the preset alignment artifact.')
}

const sortedUnique = (values: string[]) => [...new Set(values)].sort()
const expectedPresetFailures = presetRows.filter(country => country.mae > alignment.failureMae).map(country => country.iso3)
const expectedAllCountryFailures = alignment.countries.filter(country => country.mae > alignment.failureMae).map(country => country.iso3)
if (JSON.stringify(sortedUnique(alignment.presetFailures)) !== JSON.stringify(sortedUnique(expectedPresetFailures)) ||
  JSON.stringify(sortedUnique(alignment.allCountryFailures)) !== JSON.stringify(sortedUnique(expectedAllCountryFailures))) {
  throw new Error('Country failure lists do not match the recorded MAE threshold and country values.')
}

export type CountryAlignment = {
  iso3: string
  name: string
  years: number
  zObs: number
  zPred: number
  mae: number
  verdict: 'good' | 'acceptable' | 'poor'
  isPreset: boolean
}

export function selectCountries(): CountryAlignment[] {
  return alignment.countries.map(country => ({
    iso3: country.iso3,
    name: country.name,
    years: country.nYears,
    zObs: country.meanObservedZ,
    zPred: country.meanPredictedZ,
    mae: country.mae,
    verdict: country.verdictClass,
    isPreset: country.isPreset
  }))
}

export function selectCountryFailureLists(): { preset: string[]; all: string[] } {
  return { preset: [...alignment.presetFailures], all: [...alignment.allCountryFailures] }
}
