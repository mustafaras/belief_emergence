import { z } from 'zod'
import canonicalPanelCsv from '../../../public/data/panel_canonical_v2.csv?raw'
import constructPrevalence from '../../data/analysis/construct_prevalence.json'
import covariateBlockers from '../../data/analysis/covariate_blocker_attribution.json'
import giniWindowSensitivity from '../../data/analysis/gini_window_sensitivity.json'
import zeroFillSensitivity from '../../data/analysis/zero_fill_sensitivity.json'
import type { Claim } from '../types'

const prevalenceSchema = z.object({
  frame: z.object({ canonicalCompleteCases: z.number().int().nonnegative() }).passthrough(),
  summary: z.object({
    frameUtilisation: z.object({ fraction: z.number().min(0).max(1) }).passthrough()
  }).passthrough()
}).passthrough()

const giniSchema = z.object({
  rows: z.array(z.object({
    window: z.number().int().nonnegative(),
    completeCaseRows: z.number().int().nonnegative(),
    giniBackfilled: z.number().int().nonnegative()
  }).passthrough())
}).passthrough()

const splitSchema = z.object({
  label: z.string(),
  n: z.number().int().nonnegative(),
  cMinusB: z.number(),
  perRepeatMedianCminusB: z.number(),
  kFold: z.object({ A: z.number(), B: z.number(), C: z.number() }).passthrough()
}).passthrough()

const zeroFillSchema = z.object({
  nZeroAnchor: z.number().int().nonnegative(),
  splits: z.array(splitSchema),
  resultSurvivesRemoval: z.boolean()
}).passthrough()

const panelSummarySchema = z.object({
  rowCount: z.number().int().positive(),
  countryCount: z.number().int().positive()
})

const blockerSchema = z.object({
  frame: z.object({ atRiskCells: z.number().int().nonnegative() }).passthrough(),
  exposure: z.array(z.object({
    covariate: z.string(),
    label: z.string(),
    cells: z.number().int().nonnegative()
  }).passthrough()),
  firstFailure: z.array(z.object({
    covariate: z.string(),
    cells: z.number().int().nonnegative()
  }).passthrough()),
  exposureIsPartition: z.boolean(),
  resolution: z.object({
    permanentlyLost: z.number().int().nonnegative(),
    rescuedByBackfill: z.number().int().nonnegative()
  }).passthrough()
}).passthrough()

const prevalence = prevalenceSchema.parse(constructPrevalence)
const gini = giniSchema.parse(giniWindowSensitivity)
const zeroFill = zeroFillSchema.parse(zeroFillSensitivity)
const panelSummary = panelSummarySchema.parse(summarizePanel(canonicalPanelCsv))
const blockers = blockerSchema.parse(covariateBlockers)

if (panelSummary.rowCount !== prevalence.frame.canonicalCompleteCases) {
  throw new Error('Canonical panel row count does not match construct prevalence artifact.')
}

function summarizePanel(csv: string): { rowCount: number; countryCount: number } {
  const [headerLine, ...dataLines] = csv.trim().split(/\r?\n/)
  const iso3Index = headerLine?.split(',').indexOf('iso3') ?? -1
  if (iso3Index < 0) throw new Error('Canonical panel CSV is missing the iso3 column.')
  const countries = new Set(dataLines.map(line => line.split(',')[iso3Index]).filter(Boolean))
  return { rowCount: dataLines.length, countryCount: countries.size }
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

const giniClaims = gini.rows.flatMap(row => [
  claim(
    `data.gini.window.${row.window}.rows`,
    `Complete cases at Gini window ±${row.window} years`,
    row.completeCaseRows,
    'int',
    'gini_window_sensitivity.json',
    `rows[window=${row.window}].completeCaseRows`
  ),
  claim(
    `data.gini.window.${row.window}.recovered`,
    `Gini cells borrowed from a neighbouring year at window ±${row.window}`,
    row.giniBackfilled,
    'int',
    'gini_window_sensitivity.json',
    `rows[window=${row.window}].giniBackfilled`
  )
])

const fullPanel = zeroFill.splits.find(split => split.label === 'full panel')
const withoutZeroAnchor = zeroFill.splits.find(split => split.label === 'zero-anchor rows removed')
if (!fullPanel || !withoutZeroAnchor) throw new Error('Zero-fill sensitivity splits are incomplete.')

const blockerClaims = blockers.exposure.map((row) => {
  const first = blockers.firstFailure.find((f) => f.covariate === row.covariate)
  return claim(
    `data.blocker.${row.covariate}.exposure`,
    `${row.label} — cells short of this driver`,
    row.cells,
    'int',
    'covariate_blocker_attribution.json',
    `exposure[covariate=${row.covariate}].cells`,
    first === undefined
      ? 'Exposure count: overlapping, so it does not partition the at-risk frame.'
      : `Exposure count (overlapping). Disjoint first-failure count: ${first.cells}.`
  )
})

export const dataClaims: Claim[] = [
  claim('data.panelRows', 'Canonical panel rows', panelSummary.rowCount, 'int', 'panel_canonical_v2.csv', 'rows'),
  claim('data.countries', 'Countries in the canonical panel', panelSummary.countryCount, 'int', 'panel_canonical_v2.csv', 'iso3'),
  claim('data.frameShare', 'Canonical cases as a share of scanned country-years', prevalence.summary.frameUtilisation.fraction, 'pct1', 'construct_prevalence.json', 'summary.frameUtilisation.fraction'),
  ...giniClaims,
  claim('data.blockers.atRisk', 'Cells short of at least one driver', blockers.frame.atRiskCells, 'int', 'covariate_blocker_attribution.json', 'frame.atRiskCells'),
  ...blockerClaims,
  claim('data.blockers.rescued', 'Cells rescued by the covariate backfill', blockers.resolution.rescuedByBackfill, 'int', 'covariate_blocker_attribution.json', 'resolution.rescuedByBackfill'),
  claim('data.blockers.lost', 'Cells still lost to a missing covariate', blockers.resolution.permanentlyLost, 'int', 'covariate_blocker_attribution.json', 'resolution.permanentlyLost'),
  claim('data.zeroAnchor.rows', 'Zero-anchor rows', zeroFill.nZeroAnchor, 'int', 'zero_fill_sensitivity.json', 'nZeroAnchor'),
  claim('data.zeroAnchor.fullPanel.cMinusB', 'Tier C minus Tier B k-fold R² with all rows', fullPanel.cMinusB, 'signed3', 'zero_fill_sensitivity.json', 'splits[full panel].cMinusB'),
  claim('data.zeroAnchor.fullPanel.perRepeat', 'Tier C minus Tier B per-repeat median with all rows', fullPanel.perRepeatMedianCminusB, 'signed3', 'zero_fill_sensitivity.json', 'splits[full panel].perRepeatMedianCminusB'),
  claim('data.zeroAnchor.fullPanel.n', 'Rows with all zero-anchor cells retained', fullPanel.n, 'int', 'zero_fill_sensitivity.json', 'splits[full panel].n'),
  claim('data.zeroAnchor.withoutRows.cMinusB', 'Tier C minus Tier B k-fold R² without zero-anchor rows', withoutZeroAnchor.cMinusB, 'signed3', 'zero_fill_sensitivity.json', 'splits[zero-anchor rows removed].cMinusB'),
  claim('data.zeroAnchor.withoutRows.perRepeat', 'Tier C minus Tier B per-repeat median without zero-anchor rows', withoutZeroAnchor.perRepeatMedianCminusB, 'signed3', 'zero_fill_sensitivity.json', 'splits[zero-anchor rows removed].perRepeatMedianCminusB'),
  claim('data.zeroAnchor.withoutRows.n', 'Rows after deleting the zero-anchor cells', withoutZeroAnchor.n, 'int', 'zero_fill_sensitivity.json', 'splits[zero-anchor rows removed].n')
]
