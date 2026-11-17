import { z } from 'zod'
import designGates from '../../data/analysis/design_gates.json'
import type { Claim } from '../types'

/**
 * Design-gate claims.
 *
 * Two things this selector refuses to do, both of which the artifact makes possible to get
 * wrong:
 *
 *   1. Print `measured` for the rank gate as if it were a correlation. Rank is a count
 *      (7 of 8), so it has its own format and its own rule text.
 *   2. Present the upstream identity as measured when it was recorded. The schema carries
 *      `source`, and a recorded figure is claimed with a note naming the file it came from
 *      — a clean clone cannot recompute `rawdata/`, and an artifact that hid that would
 *      overstate what a reader can check.
 */
const gateSchema = z.object({
  id: z.enum(['identity', 'duplicates', 'rank', 'singlePredictor']),
  rule: z.string(),
  measured: z.number(),
  threshold: z.number(),
  pass: z.boolean(),
  detail: z.string(),
}).passthrough()

const panelSchema = z.object({
  panel: z.enum(['original', 'rebuilt']),
  rows: z.number().int().nonnegative(),
  predictors: z.array(z.string()),
  gates: z.array(gateSchema),
  allPass: z.boolean(),
}).passthrough()

const schema = z.object({
  thresholds: z.object({
    identityCorrelation: z.number(),
    duplicateCorrelation: z.number(),
    singlePredictorR2: z.number(),
  }).passthrough(),
  original: panelSchema,
  rebuilt: panelSchema,
  originalProvenance: z.object({
    designMatrix: z.object({
      source: z.string(),
      rows: z.number().int().nonnegative(),
      countries: z.number().int().nonnegative(),
      distinctCountryYears: z.number().int().nonnegative(),
    }).passthrough(),
    upstreamIdentity: z.object({
      rows: z.number().int().nonnegative(),
      maxAbsDeviation: z.number(),
      source: z.enum(['recomputed', 'recorded']),
      recordedFrom: z.string(),
    }).passthrough(),
  }).passthrough(),
}).passthrough()

const gates = schema.parse(designGates)

export const designGateData = gates

/** Gate ids in the order the manuscript states them. */
export const GATE_ORDER = ['identity', 'duplicates', 'rank', 'singlePredictor'] as const

const gateOf = (panel: 'original' | 'rebuilt', id: (typeof GATE_ORDER)[number]) => {
  const found = gates[panel].gates.find((gate) => gate.id === id)
  if (!found) throw new Error(`design_gates.json has no ${id} gate for the ${panel} panel`)
  return found
}

const claim = (
  id: string,
  label: string,
  value: number,
  format: Claim['format'],
  path: string,
  note?: string,
): Claim => ({ id, label, value, format, artifact: 'design_gates.json', path, note })

const upstream = gates.originalProvenance.upstreamIdentity

/**
 * A correlation gate prints at three places; a rank gate prints as an integer. Formatting
 * them uniformly would render "rank 7.000", which reads as a measurement rather than a
 * count of independent columns.
 */
const formatFor = (id: (typeof GATE_ORDER)[number]): Claim['format'] =>
  id === 'rank' ? 'int' : 'p3'

const gateClaims = (panel: 'original' | 'rebuilt'): Claim[] =>
  GATE_ORDER.flatMap((id) => {
    const gate = gateOf(panel, id)
    return [
      claim(
        `gates.${panel}.${id}`,
        `${panel === 'original' ? 'Submitted' : 'Rebuilt'} panel — ${id === 'rank' ? 'design-matrix rank' : gate.rule}`,
        gate.measured,
        formatFor(id),
        `${panel}.gates[id=${id}].measured`,
        `${gate.pass ? 'passes' : 'fails'}: ${gate.detail}`,
      ),
    ]
  })

export const gatesClaims: Claim[] = [
  ...gateClaims('original'),
  ...gateClaims('rebuilt'),
  claim('gates.original.rows', 'Rows in the submitted design matrix', gates.original.rows, 'int', 'original.rows'),
  claim('gates.rebuilt.rows', 'Rows in the rebuilt design matrix', gates.rebuilt.rows, 'int', 'rebuilt.rows'),
  claim(
    'gates.original.identityCorr',
    'Correlation between the submitted outcome and its cultural-intensity predictor',
    gateOf('original', 'identity').measured,
    'p3',
    'original.gates[id=identity].measured',
    'r = 1: the outcome was an exact affine rescaling of a predictor, which made every reported out-of-sample metric an algebraic identity.',
  ),
  claim(
    'gates.upstream.maxAbsDeviation',
    'Maximum absolute deviation between the submitted outcome and the standardised upstream item',
    upstream.maxAbsDeviation,
    'exact',
    'originalProvenance.upstreamIdentity.maxAbsDeviation',
    upstream.source === 'recomputed'
      ? `Recomputed from ${upstream.recordedFrom} over ${upstream.rows} rows.`
      : `Recorded from ${upstream.recordedFrom} over ${upstream.rows} rows; the restricted extract is absent from this checkout, so it was not recomputed here.`,
  ),
  claim('gates.upstream.rows', 'Rows in the upstream model panel', upstream.rows, 'int', 'originalProvenance.upstreamIdentity.rows'),
]
