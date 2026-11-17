/**
 * Every number on screen must be backed by something.
 *
 * The interface printed 409 numeric tokens on the landing route alone. Nothing checked
 * them: `check:ui-artifacts` compares 26 hand-listed values at the data layer, which
 * catches a wrong artifact but not a wrong render. This walks the rendered text and, for
 * every numeric token, requires one of:
 *
 *   1. an exact numeric value from an artifact (or the canonical panel CSV);
 *   2. a value that artifact rounds to at the token's printed precision;
 *   3. a value derived from artifact values by the same code the interface uses;
 *   4. an entry in the allowlist, which is capped and commented.
 *
 * Substring matching is deliberately not used. `35.2` appearing inside `135.2561` is not
 * evidence that 35.2 is correct, and a check built on `includes()` reports success for
 * exactly the numbers it should catch.
 *
 * Usage:
 *   npm run check:dom-numbers            # requires a dev/preview server
 *   npm run check:dom-numbers -- --url http://localhost:5199/belief_emergence/
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Papa from 'papaparse'

import { buildCorpus, extractTokens, printedDecimals, resolveToken } from '../src/verification/numberResolution'
import {
  deriveComputedValues,
  deriveContractConstants,
  deriveDefaultParams,
  deriveFormulaEffectEstimates,
  derivePanelConstants,
  derivePhiContributions,
  deriveLimitArithmetic,
  deriveCountryMeans,
  deriveCountryR2Median,
  deriveFormulaMetrics,
  derivePanelStats,
  deriveLabDisplayValues,
  deriveConstructAuditDisplays,
  DEFAULT_UI_PARAMS,
} from '../src/verification/derivedValues'
import { ALLOWLIST, isAllowlisted } from '../src/verification/allowlist'
import { ARTIFACT_CONSUMPTION } from '../src/evidence/artifactConsumption.generated'
import { DESCRIPTION_NUMBERS } from '../src/evidence/descriptionNumbers'
import { buildSupportPicture, type PanelAudit } from '../src/verification/supportPicture'
import { computePresetCountryAlignment } from '../src/utils/validation/presetCountryAlignment'
import { computePanelFitSummary } from '../src/utils/validation/computePanelFitSummary'
import { predictFromPanelRow } from '../src/utils/validation/panelPredict'
import { computeBias } from '../src/utils/metrics'
import { getProductionHeadlineMetrics } from '../src/data/modelMetrics'
import { formatNumeric } from '../src/utils/formatNumeric'
import constructAuditArtifact from '../src/data/analysis/wvs_construct_audit.json'
import constructAvailabilityArtifact from '../src/data/analysis/construct_item_availability.json'
import prevalenceArtifact from '../src/data/analysis/construct_prevalence.json'
import designGatesArtifact from '../src/data/analysis/design_gates.json'
import functionalFormArtifact from '../src/data/analysis/functional_form_comparison.json'
import modelComplexityArtifact from '../src/data/analysis/model_complexity_support.json'
import ladderArtifact from '../src/data/analysis/model_ladder_metrics.json'
import kfoldArtifact from '../src/data/analysis/cv_kfold.json'
import elasticityProfileArtifact from '../src/data/analysis/elasticity_profile.json'
import { buildConstructRows, type AuditArtifact, type ItemAvailability } from '../src/verification/constructAudit'
import type { PanelRowCanonical } from '../src/data/panelDataLoader'
import { APP_ROUTES } from '../src/app/routes'
import { buildSupportMatrix } from '../src/sections/data/supportMatrix'
// The preset table, now generated from the canonical panel.
//
// It used to be hand-maintained, which made this check circular: reading the table from the
// module the modal renders meant a wrong value matched itself. The table is derived by
// `scripts/generate_presets.ts` and `check:presets` re-derives it, so the values are
// verified against the panel rather than against their own copy.
import { GENERATED_PRESETS as PRESET_TABLE } from '../src/data/presets.generated'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const ANALYSIS_DIR = path.join(REPO_ROOT, 'src', 'data', 'analysis')

/** Standard-normal quantile, Acklam's approximation; chi2_1 is the square of a normal. */
function inverseNormalCdf(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - 0.02425) {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  const q = p - 0.5
  const r = q * q
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}
const PANEL_CSV = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv')

/** Prompt 6: an allowlist that grows is a check that has stopped checking. */
const MAX_ALLOWLIST_ENTRIES = 10

/** Scan all eleven routes in the current application shell. */
const ROUTES = APP_ROUTES.map(({ id }) => id)

/** Direct parameter values in TopBar are tied to the named UI defaults. */
const DEFAULT_PARAMETER_LABELS: readonly {
  label: string
  keys: readonly (keyof typeof DEFAULT_UI_PARAMS)[]
}[] = [
  { label: 'X', keys: ['X'] },
  { label: 'Y', keys: ['Y'] },
  { label: 'α,β', keys: ['alpha', 'beta'] },
  { label: 'C', keys: ['C'] },
  { label: 'M', keys: ['M'] },
  { label: 'T', keys: ['T'] },
  { label: 'D', keys: ['D'] },
  { label: 'G', keys: ['G'] },
  { label: 'E', keys: ['E'] },
  { label: 'S', keys: ['S'] },
  { label: 'R', keys: ['R'] },
]

export type TokenReport = {
  route: string
  tokens: number
  exact: number
  rounded: number
  sourcedRounded: number
  derived: number
  allowlisted: number
  unresolved: { token: string; line: string }[]
}

export type RenderedPresetRow = { name: string; tokens: string[] }
export type RenderedConstructRow = { id: string; alpha: string | null; reason: string }

type SourcedRounding = {
  headline: ReturnType<typeof getProductionHeadlineMetrics>
  runtime: Pick<ReturnType<typeof computePanelFitSummary>, 'r2' | 'corr' | 'mae' | 'rmse'>
  residualMean: number
  residualSd: number
  constructRows: ReturnType<typeof buildConstructRows>
  presetRows: Array<{ name: string; tokens: string[] }>
}

function normalizeCountryName(value: string): string {
  return value.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

type SourceBoundCheck = { status: 'match' } | { status: 'mismatch'; expected: string } | null

/** Validate labeled displays against the exact UI source that owns each value. */
function sourceBoundToken(
  token: string,
  line: string,
  sourced: SourcedRounding,
): SourceBoundCheck {
  if (/Production headline|Real-World Applications/.test(line)) {
    const metricBindings: Array<[RegExp, number]> = [
      [/R²\s*=\s*(-?\d+(?:\.\d+)?)/u, sourced.headline.r2],
      [/\br\s*=\s*(-?\d+(?:\.\d+)?)/u, sourced.headline.correlation],
      [/\bMAE\s*=\s*(-?\d+(?:\.\d+)?)/u, sourced.headline.mae],
      [/\bRMSE\s*=\s*(-?\d+(?:\.\d+)?)/u, sourced.headline.rmse],
      [/\bBias[^·]*?[≈=]\s*(-?\d+(?:\.\d+)?)/u, sourced.headline.bias],
    ]
    for (const [pattern, value] of metricBindings) {
      const shown = pattern.exec(line)?.[1]
      if (shown === token) {
        const expected = value.toFixed(printedDecimals(shown))
        return expected === shown ? { status: 'match' } : { status: 'mismatch', expected }
      }
    }
  }

  const runtimeIndex = line.indexOf('Runtime:')
  if (runtimeIndex !== -1) {
    const runtimeLine = line.slice(runtimeIndex)
    const runtimeBindings: Array<[RegExp, number]> = [
      [/R²\s*=?\s*(-?\d+(?:\.\d+)?)/u, sourced.runtime.r2],
      [/\br\s*=?\s*(-?\d+(?:\.\d+)?)/u, sourced.runtime.corr],
      [/\bMAE\s*=?\s*(-?\d+(?:\.\d+)?)/u, sourced.runtime.mae],
      [/\bRMSE\s*=?\s*(-?\d+(?:\.\d+)?)/u, sourced.runtime.rmse],
    ]
    for (const [pattern, value] of runtimeBindings) {
      const shown = pattern.exec(runtimeLine)?.[1]
      if (shown === token) {
        const expected = value.toFixed(printedDecimals(shown))
        return expected === shown ? { status: 'match' } : { status: 'mismatch', expected }
      }
    }
  }

  const residuals = /Residuals:\s*mean\s*(-?\d+(?:\.\d+)?)\s*[·]\s*SD\s*(-?\d+(?:\.\d+)?)/u.exec(line)
  if (residuals) {
    const value = residuals[1] === token
      ? sourced.residualMean
      : residuals[2] === token
        ? sourced.residualSd
        : null
    if (value != null) {
      const expected = value.toFixed(printedDecimals(token))
      return expected === token ? { status: 'match' } : { status: 'mismatch', expected }
    }
  }
  return null
}

function validatePresetRows(
  renderedRows: readonly RenderedPresetRow[],
  sourceRows: SourcedRounding['presetRows'],
): { validTokens: Set<string>; failures: string[] } {
  const validTokens = new Set<string>()
  const failures: string[] = []
  for (const rendered of renderedRows) {
    const source = sourceRows.find((row) => normalizeCountryName(row.name) === normalizeCountryName(rendered.name))
    if (!source || source.tokens.length !== rendered.tokens.length || source.tokens.some((token, i) => token !== rendered.tokens[i])) {
      failures.push(`preset row ${rendered.name} does not match its generated preset and panel-alignment values`)
      continue
    }
    for (const token of rendered.tokens) validTokens.add(token)
  }
  return { validTokens, failures }
}

function validateConstructRows(
  renderedRows: readonly RenderedConstructRow[],
  sourceRows: SourcedRounding['constructRows'],
): { validTokens: Set<string>; failures: string[] } {
  const validTokens = new Set<string>()
  const failures: string[] = []
  for (const rendered of renderedRows) {
    const source = sourceRows.find((row) => row.id === rendered.id)
    const expectedAlpha = source?.alpha == null ? null : source.alpha.toFixed(3)
    if (!source || rendered.alpha !== expectedAlpha || rendered.reason !== source.reason) {
      failures.push(`construct row ${rendered.id} does not match the construct-audit source and formatter`)
      continue
    }
    if (expectedAlpha) validTokens.add(expectedAlpha)
    for (const token of extractTokens(source.reason)) validTokens.add(token)
  }
  return { validTokens, failures }
}

/** Parse the canonical panel with a real CSV reader, keeping the columns the app uses. */
function readPanelRows(): PanelRowCanonical[] {
  const text = fs.readFileSync(PANEL_CSV, 'utf8')
  // Papaparse, not `split(',')`: "Palestine, State of" contains a comma, and splitting on
  // it shifts every column on that row — which silently produced a panel mean of 9.65.
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
  const num = (v: string | undefined) => {
    const n = Number(v)
    return v == null || v === '' || v === 'NA' || !Number.isFinite(n) ? null : n
  }
  return parsed.data.map((row) => ({
    iso3: row.iso3,
    country_name: row.country_name,
    year: Number(row.year),
    Z: Number(row.Z),
    X: Number(row.X),
    Y: Number(row.Y),
    C: num(row.C),
    M: Number(row.M),
    T: Number(row.T),
    D: num(row.D),
    G: num(row.G),
    E: Number(row.E),
    S: num(row.S),
    R: Number(row.R),
  })) as unknown as PanelRowCanonical[]
}

/** Build every source of legitimate numbers. */
/**
 * Read `(id, artifact, path)` out of the claim specs without importing them.
 *
 * A static import would drag `public/data/panel_canonical_v2.csv?raw` into Node, which
 * only Vite can resolve. Parsing the specs keeps this check dependency-free and keeps the
 * binding explicit: the token on screen is tied to the artifact field the component says
 * it reads, not merely to "a number that rounds to it".
 */
/** Follow a dotted/bracketed path such as `splits[full panel].cMinusB`. */
export function readArtifactPath(value: unknown, path: string): number | undefined {
  let current: unknown = value
  for (const rawSegment of path.split('.')) {
    const segment = rawSegment.trim()
    const bracket = segment.match(/^([A-Za-z0-9_]+)\[([^\]]+)\]$/)
    if (bracket) {
      const collection = (current as Record<string, unknown>)?.[bracket[1]]
      if (!Array.isArray(collection)) return undefined
      current = collection.find((entry) => {
        if (!entry || typeof entry !== 'object') return false
        const record = entry as Record<string, unknown>
        return Object.values(record).some((field) => String(field) === bracket[2].trim())
      })
      continue
    }
    if (segment.endsWith(']')) return undefined
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return typeof current === 'number' && Number.isFinite(current) ? current : undefined
}

export function buildSources(): {
  corpus: ReturnType<typeof buildCorpus>
  derived: ReturnType<typeof buildCorpus>
  sourced: SourcedRounding
} {
  /**
   * Only artifacts the application actually imports.
   *
   * The corpus used to be every file in `src/data/analysis/`, which made the check weaker
   * than it looked: a displayed value could be "verified" against an artifact no module
   * reads. That is not verification, it is coincidence with a large enough haystack. An
   * audit found 35 of 139 tokens resolving only through unimported artifacts — `0.42`
   * matched a CV fold metric to four places, `0.04` matched another, and both are simply
   * the verification defaults in `src/verification/derivedValues.ts`.
   *
   * Restricting the corpus to imported artifacts means a value either comes from something
   * the interface can reach, or it is derived, or it is a declared constant. There is no
   * fourth category.
   */
  // The two Data labs print artifact fields at a chosen precision. Both are JSON (no
  // Vite-only import), so they are read directly here and the same rounding the component
  // applies is applied again — a wrong component would print a value this list lacks.
  const giniWindowArtifact = JSON.parse(
    fs.readFileSync(path.join(ANALYSIS_DIR, 'gini_window_sensitivity.json'), 'utf8'),
  ) as { rows: Array<{ window: number; completeCaseRows: number; giniBackfilled: number }> }
  const zeroFillArtifact = JSON.parse(
    fs.readFileSync(path.join(ANALYSIS_DIR, 'zero_fill_sensitivity.json'), 'utf8'),
  ) as { nZeroAnchor: number; splits: Array<{ n: number; cMinusB: number; perRepeatMedianCminusB: number }> }

  const imported = new Set<string>(ARTIFACT_CONSUMPTION.imported)
  const artifacts: unknown[] = fs
    .readdirSync(ANALYSIS_DIR)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => imported.has(f.replace(/\.json$/, '')))
    .map((f) => JSON.parse(fs.readFileSync(path.join(ANALYSIS_DIR, f), 'utf8')))

  // Artifact-index descriptions have their own source-bound numeric registry. Recompute
  // those values from the named artifacts so a rounded prose value such as VIF 9.43 is
  // checked against its source, not exempted or accepted by a corpus coincidence.
  const descriptionClaimValues = Object.entries(DESCRIPTION_NUMBERS).flatMap(([name, claims]) => {
    const artifactPath = path.join(ANALYSIS_DIR, `${name}.json`)
    if (!fs.existsSync(artifactPath)) return []
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as Record<string, unknown>
    return claims.flatMap((claim) => {
      if (claim.kind !== 'derived') return []
      const value = claim.compute(artifact)
      const numeric = typeof value === 'number' ? value : Number(value)
      return Number.isFinite(numeric) ? [numeric] : []
    })
  })

  // The headline metrics live in `src/data/metrics/`, not `src/data/analysis/`, and are
  // imported by `modelMetrics.ts`. They were outside the corpus, so the R², correlation,
  // MAE and RMSE printed in the equation section resolved only by coincidence against CV
  // fold metrics — or not at all.
  const headlinePath = path.join(REPO_ROOT, 'src', 'data', 'metrics', 'headline_metrics_authoritative.json')
  if (fs.existsSync(headlinePath)) {
    artifacts.push(JSON.parse(fs.readFileSync(headlinePath, 'utf8')))
  }

  // The panel CSV and its audit are evidence too: several displayed statistics are read
  // from the loaded rows rather than from an analysis artifact.
  artifacts.push(fs.readFileSync(PANEL_CSV, 'utf8'))
  const auditPath = PANEL_CSV.replace(/\.csv$/, '.audit.json')
  if (fs.existsSync(auditPath)) artifacts.push(JSON.parse(fs.readFileSync(auditPath, 'utf8')))

  const panelRows = readPanelRows()
  const supportMatrix = buildSupportMatrix(panelRows)

  // The attrition panel computes percentages from the tracked panel audit and WVS audit.
  // Derive its rounded percentages from the same builder so displayed values remain tied
  // to the exact numerator and denominator rather than a manually entered 67.9.
  const panelAudit = JSON.parse(
    fs.readFileSync(PANEL_CSV.replace(/\.csv$/, '.audit.json'), 'utf8'),
  ) as PanelAudit
  const constructAudit = JSON.parse(
    fs.readFileSync(path.join(ANALYSIS_DIR, 'wvs_construct_audit.json'), 'utf8'),
  ) as {
    respondentsScanned?: number
    countryYears?: number
    constructs: Record<string, { cellsEmitted: number }>
  }
  const supportPicture = buildSupportPicture(panelAudit, {
    respondentsScanned: constructAudit.respondentsScanned,
    countryYears: constructAudit.countryYears,
    zComputableCells: constructAudit.constructs.Z_belief_outcome?.cellsEmitted,
  })
  const supportPercentages = [
    ...supportPicture.stages.map((stage) => stage.ofPrevious * 100),
    ...supportPicture.blockers.map((blocker) => blocker.share * 100),
    supportPicture.frameUtilisation * 100,
  ]

  // The preset table's Success(%) is 100*(1-MAE) per country, computed from the panel.
  const alignment = computePresetCountryAlignment(panelRows)
  const alignmentByName = new Map(alignment.map((row) => [normalizeCountryName(row.countryName), row]))
  const presetRows = PRESET_TABLE.map((preset) => {
    const metrics = alignmentByName.get(normalizeCountryName(preset.name))
    const printed: string[] = []
    const formatPresetValue = (value: number) => `${value >= 0 ? '+' : ''}${formatNumeric(value, 2)}`
    for (const key of ['C', 'M', 'E', 'R'] as const) {
      printed.push(...extractTokens(formatPresetValue(preset.values[key] ?? 0)))
    }
    if (metrics) {
      printed.push(...extractTokens(formatNumeric(metrics.meanObservedZ, 3)))
      printed.push(...extractTokens(formatNumeric(metrics.meanPredictedZ, 3)))
      printed.push(...extractTokens(formatNumeric(metrics.mae, 3)))
      printed.push(...extractTokens(formatNumeric(metrics.successPct, 1)))
      printed.push(...extractTokens(formatNumeric(metrics.bias, 2)))
    }
    return { name: preset.name, tokens: printed }
  })

  const predictions = panelRows
    .map((row) => predictFromPanelRow(row as unknown as Parameters<typeof predictFromPanelRow>[0]))
    .filter((prediction) => Number.isFinite(prediction.zObs) && Number.isFinite(prediction.zPred))
  const observed = predictions.map((prediction) => prediction.zObs)
  const predicted = predictions.map((prediction) => prediction.zPred)
  const residualMean = computeBias(observed, predicted)
  const residualSd = Math.sqrt(
    predictions.reduce((sum, prediction) => {
      const residual = prediction.zObs - prediction.zPred
      return sum + (residual - residualMean) ** 2
    }, 0) / predictions.length,
  )
  const availability = (constructAvailabilityArtifact as unknown as {
    constructs: Record<string, ItemAvailability>
  }).constructs
  const constructRows = buildConstructRows(constructAuditArtifact as unknown as AuditArtifact, availability)
  const runtime = computePanelFitSummary(panelRows as unknown as Parameters<typeof computePanelFitSummary>[0])

  // Rounded display values carry their provenance as `(artifact, path)` in the claim
  // spec, rendered as `data-claim-id`. Resolving the *path* is stronger than corpus
  // rounding: it says this token came from that field of that artifact, not that some
  // number in a 77,000-value corpus happens to sit inside its rounding window.
  //
  // The registry module itself is not imported: it pulls a Vite-only `?raw` CSV import
  // into this Node process. Only the specs are read, with a regex, and they are small.
  return {
    corpus: buildCorpus(artifacts),
    sourced: {
      headline: getProductionHeadlineMetrics(),
      runtime,
      residualMean,
      residualSd,
      constructRows,
      presetRows,
    },
    derived: buildCorpus([
      deriveComputedValues(DEFAULT_UI_PARAMS),
      deriveDefaultParams(DEFAULT_UI_PARAMS),
      derivePhiContributions(DEFAULT_UI_PARAMS),
      derivePanelConstants(),
      deriveFormulaEffectEstimates(DEFAULT_UI_PARAMS),
      deriveFormulaMetrics(DEFAULT_UI_PARAMS),
      derivePanelStats(panelRows.map((r) => ({ Z: r.Z }))),
      deriveCountryMeans(panelRows as unknown as Array<Record<string, unknown>>),
      deriveCountryR2Median(panelRows),
      supportMatrix.years,
      supportPicture,
      supportPercentages,
      descriptionClaimValues,
      deriveLabDisplayValues(giniWindowArtifact, zeroFillArtifact, { rows: 0, signed: 3 }),
      // The audit table prints alpha at two places and the summary prints the failure
      // rate as a percentage; both are formatted artifact values, not new measurements.
      // The gates section prints the upstream deviation in scientific notation
      // ("4.44 × 10⁻¹⁵"). The scanner reads the significand as its own token, so the value
      // it must resolve is the mantissa, not the raw 4.44e-15. Derived from the artifact
      // rather than allowlisted: it is the artifact's measurement, only re-expressed.
      Number(designGatesArtifact.originalProvenance.upstreamIdentity.maxAbsDeviation.toExponential(2).split('e')[0]),
      // The replay prints the bounded-minus-linear gap at six places, and the mini chart
      // prints each form's k-fold R² at three. Both are derivations of one artifact, so they
      // are recomputed rather than allowlisted.
      Number((
        (functionalFormArtifact.models.find((m) => m.model === 'saturating_bounded')?.kfold.median ?? 0) -
        (functionalFormArtifact.models.find((m) => m.model === 'linear_baseline')?.kfold.median ?? 0)
      ).toFixed(6)),
      Number((functionalFormArtifact.models.find((m) => m.model === 'saturating_bounded')?.kfold.median ?? 0).toFixed(3)),
      Number((functionalFormArtifact.models.find((m) => m.model === 'linear_baseline')?.kfold.median ?? 0).toFixed(3)),
      // The limits section prints the profile's thresholds and statistics: the chi-square
      // quantiles the toggles compare against, and the per-point LR statistic shown in the
      // chart's accessible table.
      ...(() => {
        const profiles = (elasticityProfileArtifact as { profiles: Array<{ lrStatistic: number; pValue: number }> })
          .profiles
        const chi = (p: number): number => 2 * inverseNormalCdf(1 - p / 2) ** 2 / 2 // chi2_1 = z^2
        const threshold95 = chi(0.05)
        const thresholdBonferroni = chi(0.05 / profiles.length)
        const maxStatistic = Math.max(...profiles.map((point) => point.lrStatistic))
        return [
          Number(threshold95.toFixed(2)),
          Number(thresholdBonferroni.toFixed(2)),
          Number(maxStatistic.toFixed(2)),
          ...profiles.flatMap((point) => [Number(point.lrStatistic.toFixed(3))]),
        ]
      })(),
      // The protocol tabs print:
      //   - each tier's in-sample fit at four places (the ladder table),
      //   - k-fold R² quartiles at three places (the strip's accessible table),
      //   - the per-seed Tier C − B delta at three places (Lab 5's readout).
      ...ladderArtifact.tiers.flatMap((tier) => [
        Number(tier.trainMetrics.r2.toFixed(4)),
        Number(tier.trainMetrics.corr.toFixed(4)),
        Number(tier.trainMetrics.mae.toFixed(4)),
        Number(tier.trainMetrics.rmse.toFixed(4)),
        Number(tier.trainMetrics.bias.toFixed(2)),
      ]),
      ...['A', 'B', 'C'].flatMap((tier) => {
        const block = (kfoldArtifact as { aggregatesRefit: Record<string, { r2: Record<string, number | null> }> })
          .aggregatesRefit[tier]?.r2
        if (!block) return []
        // The strip's accessible table prints four places; the tier cards print four places
        // too (r2). Both forms are derived so neither can drift from the artifact.
        return [block.q25, block.median, block.q75]
          .filter((value): value is number => typeof value === 'number')
          .flatMap((value) => [Number(value.toFixed(3)), Number(value.toFixed(4))])
      }),
      ...(kfoldArtifact as { perRepeatRefit: Array<Record<string, { r2: number | null }>> })
        .perRepeatRefit.flatMap((repeat) => {
          const c = repeat.C?.r2
          const b = repeat.B?.r2
          if (c === null || c === undefined || b === null || b === undefined) return []
          return [Number((c - b).toFixed(3))]
        }),
      // The evaluation section prints held-out R² at four places (r2) and the fold strip's
      // table at three (p3), plus the degenerate per-fold medians. All are formatted artifact
      // values, recomputed here rather than widening the corpus policy.
      ...functionalFormArtifact.models.flatMap((model) => [
        Number(model.inSample.r2.toFixed(4)),
        Number(model.inSample.r2.toFixed(3)),
        Number(model.kfold.median.toFixed(4)),
        Number(model.kfold.median.toFixed(3)),
        Number(model.kfold.q25.toFixed(4)),
        Number(model.kfold.q25.toFixed(3)),
        Number(model.kfold.q75.toFixed(4)),
        Number(model.kfold.q75.toFixed(3)),
        Number(model.countryOutPooled.r2.toFixed(4)),
        Number(model.countryOutPooled.r2.toFixed(3)),
        Number(model.countryOutPerFold.median.toFixed(4)),
        Number(model.countryOutPerFold.median.toFixed(3)),
      ]),
      // The model section prints observations-per-parameter at three places, derived from the
      // same artifact the tier cards read.
      ...modelComplexityArtifact.complexityByTier.map((tier) => Number(tier.supportPerParameter.toFixed(3))),
      deriveConstructAuditDisplays(
        constructAuditArtifact.constructs
          ? Object.values(constructAuditArtifact.constructs).map((entry) =>
              entry.computable ? entry.cronbachAlpha : null,
            )
          : [],
        prevalenceArtifact.summary.failureRate,
      ),
      deriveContractConstants(),
      deriveLimitArithmetic({
        panelRows: readPanelRows().length,
        lockboxCells: JSON.parse(
          fs.readFileSync(path.join(ANALYSIS_DIR, 'lockbox_holdout.json'), 'utf8'),
        ).splitPolicy.nLockboxCells,
        profileGrid: JSON.parse(
          fs.readFileSync(path.join(ANALYSIS_DIR, 'elasticity_profile.json'), 'utf8'),
        ).grid,
        profileUpper: (() => {
          const p = JSON.parse(
            fs.readFileSync(path.join(ANALYSIS_DIR, 'elasticity_profile.json'), 'utf8'),
          )
          const inside = p.profiles.filter((x: { pValue: number }) => x.pValue > 0.05)
          return Math.max(...inside.map((x: { value: number }) => x.value))
        })(),
        shippedAlpha: DEFAULT_UI_PARAMS.alpha,
      }),
      PRESET_TABLE.flatMap((p) => Object.values(p.values)),
      alignment.flatMap((row) => [row.successPct, row.mae, row.meanObservedZ, row.meanPredictedZ]),
    ]),
  }
}

/**
 * Resolve every token on one page.
 *
 * `text` is the rendered `innerText`; lines are kept so a failure can name the offending
 * token *and* the sentence it appears in, which is what makes the message actionable.
 */
export function auditText(
  text: string,
  sources: ReturnType<typeof buildSources>,
  route: string,
  renderedPresetRows: readonly RenderedPresetRow[] = [],
  renderedConstructRows: readonly RenderedConstructRow[] = [],
): TokenReport {
  const lines = text.split('\n')
  const seen = new Set<string>()
  const report: TokenReport = {
    route,
    tokens: 0,
    exact: 0,
    rounded: 0,
    sourcedRounded: 0,
    derived: 0,
    allowlisted: 0,
    unresolved: [],
  }
  const presetAudit = route === 'countries'
    ? validatePresetRows(renderedPresetRows, sources.sourced.presetRows)
    : { validTokens: new Set<string>(), failures: [] as string[] }
  for (const failure of presetAudit.failures) report.unresolved.push({ token: '<row>', line: failure })
  const constructAudit = route === 'overview'
    ? validateConstructRows(renderedConstructRows, sources.sourced.constructRows)
    : { validTokens: new Set<string>(), failures: [] as string[] }
  for (const failure of constructAudit.failures) report.unresolved.push({ token: '<row>', line: failure })

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    const previousLine = lines[lineIndex - 1]?.trim() ?? ''
    const previousPreviousLine = lines[lineIndex - 2]?.trim() ?? ''
    const trimmedLine = line.trim()
    const separatedMathMinus =
      /^\d+(?:\.\d+)?$/.test(trimmedLine) &&
      (previousLine === '−' || previousLine === '-')
    const parenthesizedMathMinus =
      /^\d+(?:\.\d+)?$/.test(trimmedLine) &&
      previousLine === '(' &&
      (previousPreviousLine === '−' || previousPreviousLine === '-')
    const tokenLine = separatedMathMinus || parenthesizedMathMinus ? `−${trimmedLine}` : line
    const parameterSource = DEFAULT_PARAMETER_LABELS.find(({ label }) =>
      previousLine.startsWith(`${label} →`),
    )

    // These values are tied to the control label immediately above them. Resolve them
    // against their actual code source so an unrelated nearby artifact value cannot hide
    // a small mutation (for example 0.730 -> 0.729).
    if (parameterSource) {
      const parameterTokens = extractTokens(line)
      for (let tokenIndex = 0; tokenIndex < parameterTokens.length; tokenIndex += 1) {
        const token = parameterTokens[tokenIndex]
        const wasSeen = seen.has(token)
        if (!wasSeen) {
          seen.add(token)
          report.tokens += 1
        }

        const key = parameterSource.keys[tokenIndex]
        if (!key) {
          report.unresolved.push({
            token,
            line: `${line.trim()} (unexpected ${parameterSource.label} parameter value)`,
          })
          continue
        }

        const expected = DEFAULT_UI_PARAMS[key].toFixed(printedDecimals(token))
        if (token !== expected) {
          report.unresolved.push({
            token,
            line: `${line.trim()} (expected ${expected} from DEFAULT_UI_PARAMS.${key})`,
          })
        } else if (!wasSeen) {
          report.derived += 1
        }
      }

      for (const key of parameterSource.keys.slice(parameterTokens.length)) {
        report.unresolved.push({
          token: '<missing>',
          line: `${line.trim()} (missing DEFAULT_UI_PARAMS.${key} value)`,
        })
      }
      continue
    }

    for (const token of extractTokens(tokenLine)) {
      if (seen.has(token)) continue
      seen.add(token)
      report.tokens += 1

      const sourceCheck = sourceBoundToken(token, line, sources.sourced)
      if (sourceCheck?.status === 'match' || presetAudit.validTokens.has(token) || constructAudit.validTokens.has(token)) {
        report.sourcedRounded += 1
        continue
      }
      if (sourceCheck?.status === 'mismatch') {
        report.unresolved.push({ token, line: `${line.trim().slice(0, 140)} (expected ${sourceCheck.expected} from the labeled source)` })
        continue
      }

      const inCorpus = resolveToken(token, sources.corpus, 'exact')
      if (inCorpus.status === 'resolved') {
        if (inCorpus.how === 'exact') report.exact += 1
        else report.rounded += 1
        continue
      }

      if (resolveToken(token, sources.derived, 'permissive').status === 'resolved') {
        report.derived += 1
        continue
      }

      if (isAllowlisted(token)) {
        report.allowlisted += 1
        continue
      }

      report.unresolved.push({ token, line: line.trim().slice(0, 140) })
    }
  }

  return report
}

async function main(): Promise<void> {
  const urlArgIndex = process.argv.indexOf('--url')
  const baseUrl =
    urlArgIndex !== -1 && process.argv[urlArgIndex + 1]
      ? process.argv[urlArgIndex + 1]
      : 'http://localhost:5199/belief_emergence/'

  if (ALLOWLIST.length >= MAX_ALLOWLIST_ENTRIES) {
    console.error(
      `FAIL  allowlist has ${ALLOWLIST.length} entries; the cap is under ${MAX_ALLOWLIST_ENTRIES}. ` +
        `A growing allowlist is a check that has stopped checking — derive the value instead.`,
    )
    process.exit(1)
  }

  // `playwright-core` is a dev dependency used by the other browser checks.
  const { chromium } = (await import('playwright-core')) as typeof import('playwright-core')
  const chromePath =
    process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

  if (!fs.existsSync(chromePath)) {
    console.log(`SKIP  no Chrome at ${chromePath}; set CHROME_PATH to enable the DOM number check`)
    return
  }

  const sources = buildSources()
  const browser = await chromium.launch({ executablePath: chromePath, headless: true })
  const reports: TokenReport[] = []

  // A missing server is a skip, not a crash and not a pass.
  //
  // The first route is probed before the loop so an unreachable server reports itself
  // once instead of throwing from the middle of the scan with an unhandled rejection —
  // which the gate would have read as a command failure with no diagnostic.
  const probe = await browser.newPage()
  try {
    await probe.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
  } catch (e) {
    console.log(
      `SKIP  no server at ${baseUrl} (${(e as Error).message.split('\n')[0].slice(0, 70)}). ` +
        `Start one with "npm run dev" or pass --url.`,
    )
    await browser.close()
    return
  }
  await probe.close()

  try {
    for (const route of ROUTES) {
      const page = await browser.newPage()
      const target = `${baseUrl}?v=${route}`
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 90000 })
      await page.waitForFunction(() => document.body.innerText.length > 200, { timeout: 30000 }).catch(() => {})
      await page.waitForTimeout(2500)
      const { text, presetRows, constructRows } = await page.evaluate(() => ({
        // Labels are not measurements: d3-chosen axis ticks and table/figure numbers
        // (`Table 4.1`, `Figure 1.1`). `innerText` is layout-aware for HTML but aggregates
        // SVG `<text>` regardless of `display`, so hiding them is not enough: the marked
        // nodes are detached, the text is read, and they are put back in place. Only the
        // subtree explicitly marked `data-scale-label` is removed, so a value printed
        // anywhere else is still audited — and removing a label cannot hide a number,
        // because a label that were also a measurement would not be marked.
        text: (() => {
          const marked = Array.from(document.querySelectorAll('[data-scale-label]'))
          const slots = marked.map(node => ({
            node,
            parent: node.parentNode,
            next: node.nextSibling,
          }))
          marked.forEach(node => node.remove())
          const value = document.body.innerText
          for (const slot of slots) slot.parent?.insertBefore(slot.node, slot.next)
          return value
        })(),
        presetRows: Array.from(document.querySelectorAll<HTMLElement>('.preset-table-row')).map((row) => ({
          name: row.querySelector('.preset-name')?.textContent?.trim() ?? '',
          tokens: Array.from(row.querySelectorAll('td')).flatMap((cell) =>
            cell.innerText.match(/-?\d+(?:\.\d+)?/g) ?? [],
          ),
        })),
        constructRows: Array.from(document.querySelectorAll<HTMLElement>('.construct-audit-table tbody tr[data-construct]')).map((row) => ({
          id: row.dataset.construct ?? '',
          alpha: row.querySelector('.construct-alpha')?.innerText.match(/-?\d+(?:\.\d+)?/)?.[0] ?? null,
          reason: row.querySelector('.construct-reason')?.textContent?.trim() ?? '',
        })),
      }))
      await page.close()

      reports.push(auditText(text, sources, route, presetRows, constructRows))
    }
  } finally {
    await browser.close()
  }

  let failures = 0
  console.log('\nNumbers on screen (distinct tokens per route):')
  console.log(
    '  ' +
      'route'.padEnd(24) +
      'tokens'.padStart(8) +
      'exact'.padStart(8) +
      'round'.padStart(8) +
      'sourced'.padStart(9) +
      'derived'.padStart(9) +
      'listed'.padStart(8) +
      'unresolved'.padStart(12),
  )
  for (const r of reports) {
    console.log(
      '  ' +
        r.route.padEnd(24) +
        String(r.tokens).padStart(8) +
        String(r.exact).padStart(8) +
        String(r.rounded).padStart(8) +
        String(r.sourcedRounded).padStart(9) +
        String(r.derived).padStart(9) +
        String(r.allowlisted).padStart(8) +
        String(r.unresolved.length).padStart(12),
    )
    for (const u of r.unresolved) {
      failures += 1
      console.error(`\n  FAIL  ${r.route}: ${u.token}  in "${u.line}"`)
    }
  }

  // Prove the check rejects both an absent value and a realistic nearby-artifact mutation.
  const selfTest = resolveToken('1234567.891', sources.corpus)
  if (selfTest.status !== 'unresolved') {
    failures += 1
    console.error('\n  FAIL  self-test: a value that appears nowhere in the corpus resolved')
  }

  const shiftedDefaultX = (DEFAULT_UI_PARAMS.X - 0.001).toFixed(3)
  const mutationSelfTest = auditText(`X → Settlement\n${shiftedDefaultX}`, sources, 'self-test')
  if (!mutationSelfTest.unresolved.some((item) => item.token === shiftedDefaultX)) {
    failures += 1
    console.error(
      `\n  FAIL  self-test: a 0.001 mutation of DEFAULT_UI_PARAMS.X (${shiftedDefaultX}) was accepted`,
    )
  }

  if (failures > 0) {
    console.error(
      `\nFAIL  ${failures} rendered number(s) have no artifact, derivation or allowlist entry.`,
    )
    process.exit(1)
  }

  const total = reports.reduce((a, r) => a + r.tokens, 0)
  const roundedTotal = reports.reduce((a, r) => a + r.rounded, 0)
  console.log(
    `\nPASS  ${total} distinct rendered numbers across ${reports.length} routes; ` +
      `all resolved (allowlist: ${ALLOWLIST.length} entries). ` +
      `${roundedTotal} resolved by source-independent artifact rounding; ` +
      `${reports.reduce((a, r) => a + r.sourcedRounded, 0)} rounded display(s) were checked against ` +
      `their named UI/data source.`,
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  void main()
}
