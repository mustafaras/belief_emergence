/**
 * The four design gates, as measurements rather than assertions.
 *
 * WHY THIS EXISTS
 * ---------------
 * The manuscript claims that on the panel originally submitted for publication all four
 * design gates failed, and that on the rebuilt panel all four pass. Both halves were
 * prose. Nothing in the tree computed them, so the app could not render the comparison
 * without retyping the numbers the paper prints — which is the failure mode this
 * repository keeps finding.
 *
 * WHAT IS RECOMPUTED AND WHAT IS RECORDED
 * ---------------------------------------
 * Two inputs exist for the original panel, and they are not interchangeable:
 *
 *   - The committed 630-row `panel_canonical_23_countries_v1.csv` (23 countries, 34
 *     distinct country-years, one row per survey wave). This is a *design matrix*, and the
 *     four gates are well defined on it. It is read from git, so it is recomputed here.
 *   - The 1,128-row upstream model panel (`rawdata/panel_model_data.csv`), which is where
 *     the paper's "maximum absolute deviation 4.4e-15 over 1,128 rows" comes from. That
 *     file is licence-restricted and gitignored, so a clean clone cannot recompute it.
 *     When it is present it is measured; when it is absent the recorded figure is carried
 *     with `source: "recorded"` and the file it came from, never silently as if measured.
 *
 * The distinction is not pedantic: r = 1.0 is reproducible from git, 4.4e-15 is not, and
 * an artifact that presented both as measured would overstate what a reader can check.
 */

import type { PanelRowCanonical } from '../../types/panel'

/** One gate's rule, measurement and verdict. */
export type GateResult = {
  id: 'identity' | 'duplicates' | 'rank' | 'singlePredictor'
  /** The rule as the manuscript states it, with the threshold in place. */
  rule: string
  /** The measured value the rule is applied to. */
  measured: number
  /** The threshold the measurement is compared against. */
  threshold: number
  pass: boolean
  /** Which predictor, or which pair, produced the measurement. */
  detail: string
}

export type PanelGates = {
  panel: 'original' | 'rebuilt'
  rows: number
  predictors: string[]
  gates: GateResult[]
  allPass: boolean
}

export type OriginalPanelProvenance = {
  /** Where the design matrix came from, so a reader knows what was measured. */
  designMatrix: { source: string; rows: number; countries: number; distinctCountryYears: number }
  /**
   * The upstream figures the manuscript prints alongside the gates. Recomputed when the
   * restricted file is present, otherwise carried as recorded values.
   */
  upstreamIdentity: {
    rows: number
    maxAbsDeviation: number
    /** `recomputed` when the model panel was read; `recorded` when it was not. */
    source: 'recomputed' | 'recorded'
    recordedFrom: string
  }
}

export type DesignGates = {
  schemaVersion: 'phase1.design_gates.v1'
  generatedAtIso: string
  purpose: string
  thresholds: { identityCorrelation: number; duplicateCorrelation: number; singlePredictorR2: number }
  original: PanelGates
  rebuilt: PanelGates
  originalProvenance: OriginalPanelProvenance
  interpretation: string
}

export const THRESHOLDS = {
  /** |corr(x_j, Z)| must stay below this: a predictor may not restate the outcome. */
  identityCorrelation: 0.999,
  /** |corr(x_j, x_k)| must stay below this: no two predictors may be duplicates. */
  duplicateCorrelation: 0.9999,
  /** R²(x_j -> Z) must stay below this: no single predictor may explain the outcome. */
  singlePredictorR2: 0.99,
} as const

type Column = number[]

const mean = (values: Column): number => values.reduce((sum, v) => sum + v, 0) / values.length

/** Pearson correlation. Returns NaN for a constant column, which must not pass a gate. */
export function pearson(a: Column, b: Column): number {
  const ma = mean(a)
  const mb = mean(b)
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] - ma
    const y = b[i] - mb
    num += x * y
    da += x * x
    db += y * y
  }
  const den = Math.sqrt(da * db)
  return den === 0 ? Number.NaN : num / den
}

/**
 * Matrix rank by Gaussian elimination with partial pivoting.
 *
 * A deliberate tolerance: columns that differ only by floating-point noise are the same
 * column, and treating them as independent would report a full rank for exactly the
 * duplicate the gate exists to catch.
 */
export function matrixRank(matrix: number[][], tolerance = 1e-10): number {
  if (matrix.length === 0) return 0
  const a = matrix.map((row) => [...row])
  const rows = a.length
  const cols = a[0].length
  let rank = 0
  for (let col = 0; col < cols; col += 1) {
    let pivot = -1
    let best = tolerance
    for (let row = rank; row < rows; row += 1) {
      if (Math.abs(a[row][col]) > best) {
        best = Math.abs(a[row][col])
        pivot = row
      }
    }
    if (pivot === -1) continue
    ;[a[rank], a[pivot]] = [a[pivot], a[rank]]
    const pivotValue = a[rank][col]
    for (let c = col; c < cols; c += 1) a[rank][c] /= pivotValue
    for (let row = 0; row < rows; row += 1) {
      if (row === rank) continue
      const factor = a[row][col]
      if (factor === 0) continue
      for (let c = col; c < cols; c += 1) a[row][c] -= factor * a[rank][c]
    }
    rank += 1
    if (rank === rows) break
  }
  return rank
}

export type GateInput = {
  /** One column per predictor, aligned with `outcome`. */
  predictors: Record<string, Column>
  outcome: Column
}

/** Apply the four rules to one design matrix. */
export function evaluateGates(input: GateInput, panel: 'original' | 'rebuilt'): PanelGates {
  const names = Object.keys(input.predictors)
  const gates: GateResult[] = []

  // 1. No predictor may restate the outcome.
  let worstIdentity = { name: '', value: 0 }
  for (const name of names) {
    const value = Math.abs(pearson(input.predictors[name], input.outcome))
    if (value > worstIdentity.value) worstIdentity = { name, value }
  }
  gates.push({
    id: 'identity',
    rule: `|corr(x_j, Z)| < ${THRESHOLDS.identityCorrelation}`,
    measured: worstIdentity.value,
    threshold: THRESHOLDS.identityCorrelation,
    pass: worstIdentity.value < THRESHOLDS.identityCorrelation,
    detail: `largest is ${worstIdentity.name}`,
  })

  // 2. No two predictors may be duplicates.
  let worstPair = { pair: '', value: 0 }
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const value = Math.abs(pearson(input.predictors[names[i]], input.predictors[names[j]]))
      if (value > worstPair.value) worstPair = { pair: `${names[i]} / ${names[j]}`, value }
    }
  }
  gates.push({
    id: 'duplicates',
    rule: `|corr(x_j, x_k)| < ${THRESHOLDS.duplicateCorrelation}`,
    measured: worstPair.value,
    threshold: THRESHOLDS.duplicateCorrelation,
    pass: worstPair.value < THRESHOLDS.duplicateCorrelation,
    detail: worstPair.pair === '' ? 'no pairs to compare' : `largest is ${worstPair.pair}`,
  })

  // 3. The design matrix must be full rank.
  const matrix = input.outcome.map((_, rowIndex) => names.map((name) => input.predictors[name][rowIndex]))
  const rank = matrixRank(matrix)
  gates.push({
    id: 'rank',
    rule: `rank(X) = ${names.length}`,
    measured: rank,
    threshold: names.length,
    pass: rank === names.length,
    detail: `rank ${rank} of ${names.length} predictors`,
  })

  // 4. No single predictor may explain the outcome alone.
  let worstR2 = { name: '', value: 0 }
  for (const name of names) {
    const value = pearson(input.predictors[name], input.outcome) ** 2
    if (value > worstR2.value) worstR2 = { name, value }
  }
  gates.push({
    id: 'singlePredictor',
    rule: `R²(x_j → Z) < ${THRESHOLDS.singlePredictorR2}`,
    measured: worstR2.value,
    threshold: THRESHOLDS.singlePredictorR2,
    pass: worstR2.value < THRESHOLDS.singlePredictorR2,
    detail: `largest is ${worstR2.name}`,
  })

  return {
    panel,
    rows: input.outcome.length,
    predictors: names,
    gates,
    allPass: gates.every((gate) => gate.pass),
  }
}

/**
 * Columns of the original panel that formed its design matrix.
 *
 * `S_support_index` is included and `M_internet_daily` is not, because that is what the
 * submitted model estimated. Narrowing the list to the columns with full coverage silently
 * raises the rank gate from 7/8 to 7/7 and turns a failing gate into a passing one — the
 * exact error this module exists to prevent, so the list is explicit rather than derived.
 */
export const ORIGINAL_PREDICTORS = ['C', 'D', 'X', 'Y', 'T', 'E', 'R', 'S'] as const

/** Columns of the rebuilt panel's design matrix. */
export const REBUILT_PREDICTORS = ['X', 'Y', 'T', 'E', 'R', 'M'] as const

const column = (rows: PanelRowCanonical[], key: string): Column =>
  rows.map((row) => {
    const value = (row as unknown as Record<string, unknown>)[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN
  })

/** Drop rows with any missing value so every gate sees one complete design matrix. */
function completeCases(
  rows: PanelRowCanonical[],
  predictors: readonly string[],
  outcomeKey: string,
): PanelRowCanonical[] {
  return rows.filter((row) => {
    const record = row as unknown as Record<string, unknown>
    const outcome = record[outcomeKey]
    if (typeof outcome !== 'number' || !Number.isFinite(outcome)) return false
    return predictors.every((key) => {
      const value = record[key]
      return typeof value === 'number' && Number.isFinite(value)
    })
  })
}

function toInput(
  rows: PanelRowCanonical[],
  predictors: readonly string[],
  outcomeKey: string,
): GateInput {
  const complete = completeCases(rows, predictors, outcomeKey)
  return {
    predictors: Object.fromEntries(predictors.map((key) => [key, column(complete, key)])),
    outcome: column(complete, outcomeKey),
  }
}

/**
 * The original panel's gates.
 *
 * `parsePanelCsvText` normalises both panels onto the canonical short schema (`Z`, `C`,
 * `D`, …), so the column ids here are the canonical ones rather than the v1 file's verbose
 * headers. That is deliberate: it means the two panels are measured by one code path and
 * a schema change cannot make one of them silently produce zero rows.
 */
export const evaluateOriginalPanel = (rows: PanelRowCanonical[]): PanelGates =>
  evaluateGates(toInput(rows, ORIGINAL_PREDICTORS, 'Z'), 'original')

export const evaluateRebuiltPanel = (rows: PanelRowCanonical[]): PanelGates =>
  evaluateGates(toInput(rows, REBUILT_PREDICTORS, 'Z'), 'rebuilt')

/** Rows actually used by a panel's gates, after the complete-case filter. */
export const usedRowCount = (
  rows: PanelRowCanonical[],
  predictors: readonly string[],
  outcomeKey: string,
): number => completeCases(rows, predictors, outcomeKey).length
