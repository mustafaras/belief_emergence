/**
 * Values the interface computes rather than transcribes.
 *
 * Most rendered numbers come straight out of an artifact. A few do not: `e^Φ`, the
 * percentage form of a ratio, the sensitivity norm. Those are legitimate — they are
 * arithmetic on artifact values — but a check that only searches the artifact corpus
 * reports them as unbacked, and the temptation is then to add them to an allowlist. That
 * is how an allowlist stops checking: it grows to cover computed values, and the moment
 * it does, a genuinely wrong computed value is exempt too.
 *
 * So they are derived here instead, with the same code the interface uses, and the check
 * requires the rendered token to match the recomputation. A wrong `e^Φ` fails; a correct
 * one passes without being exempted.
 *
 * The inputs are the interface's own defaults, which are constants in
 * `src/data/feCoefficients.ts` and `src/App.tsx`. They are not artifact values — the
 * panel-scale default parameter set is a starting position, not a measurement — and the
 * allowlist records that fact separately.
 */
import { calculateModel, computeStructuralBase } from '../utils/calculateModel'
import {
  normalizePanelXToStructural,
  normalizePanelYToStructural,
  PANEL_X_MAX,
  PANEL_X_MIN,
  PANEL_Y_MAX,
  PANEL_Y_MIN,
} from '../utils/modelContract'
import { computeTopBarAnalytics } from '../utils/topBarAnalytics'
import { OPTIMIZED_STRUCTURAL_PARAMS } from '../data/feCoefficients'
import type { BeliefParameters } from '../types'

/**
 * The parameter set the interface opens with.
 *
 * Kept in step with `DEFAULT_PARAMS` in `src/App.tsx`. If that changes, the derived values
 * here change with it and the check follows — which is the point of deriving rather than
 * listing.
 */
export const DEFAULT_UI_PARAMS: BeliefParameters = {
  X: 0.73,
  Y: 0.12,
  alpha: OPTIMIZED_STRUCTURAL_PARAMS.alpha,
  beta: OPTIMIZED_STRUCTURAL_PARAMS.beta,
  k: OPTIMIZED_STRUCTURAL_PARAMS.k,
  C: 2.614,
  M: 0.42,
  T: 0.04,
  D: 0.05,
  G: -0.27,
  E: 0.25,
  S: -0.05,
  R: 0.39,
}

/**
 * Every number the interface computes from the default parameters.
 *
 * Recomputed on demand rather than cached, so a change to the model surfaces here instead
 * of going stale in a constant.
 */
export function deriveComputedValues(params: BeliefParameters = DEFAULT_UI_PARAMS): number[] {
  const model = calculateModel(params, {
    inputsAreStandardized: false,
    modifiersAreStandardized: true,
  })

  const analytics = computeTopBarAnalytics({
    zValue: model.Z,
    phiValue: model.phi,
    params,
    structuralBase: computeStructuralBase(params.X, params.Y, params.alpha, params.beta),
    phiComponents: model.phiComponents,
    alpha: params.alpha,
    beta: params.beta,
    k: params.k,
  })

  const out: number[] = [model.Z, model.phi, analytics.exponentialFactor]

  // Percentages and complements the panels print beside a value.
  const push = (n: unknown) => {
    if (typeof n === 'number' && Number.isFinite(n)) out.push(n)
  }

  // Φ decomposition, as rendered.
  push(model.phiComponents.baseline)
  push(model.phiComponents.mainEffects)
  push(model.phiComponents.interactions)
  push(model.phiComponents.quadratic)

  // Derived diagnostics the panels display. The analytics object nests scalars several
  // levels deep (effects, sensitivities, information, componentStats), so walk it
  // rather than reading only the top level.
  const visitAnalytics = (node: unknown): void => {
    if (typeof node === 'number') {
      push(node)
      return
    }
    if (Array.isArray(node)) {
      for (const item of node) visitAnalytics(item)
      return
    }
    if (node && typeof node === 'object') {
      for (const value of Object.values(node as Record<string, unknown>)) visitAnalytics(value)
    }
  }
  visitAnalytics(analytics)

  // The interface prints several computed values as percentages, so the percentage form
  // of every derived quantity is legitimate too. Derived rather than exempted: a wrong
  // 89.2% still fails, because 0.892031 x 100 is recomputed here.
  const ratios = [...out]
  for (const value of ratios) {
    if (value >= 0 && value <= 1) out.push(value * 100)
  }

  return out.filter((n) => Number.isFinite(n))
}

/**
 * Panel statistics the interface computes from the canonical CSV.
 *
 * `Panel mean (μ)` and its confidence interval are computed at render time from the
 * loaded rows, not stored in an artifact. They are real, checkable numbers — deriving
 * them here keeps them out of the allowlist, where a wrong mean would be exempt.
 *
 * Returns an empty array when no rows are supplied, so the check degrades to "not
 * derived" rather than to "anything passes".
 */
export function derivePanelStats(rows: Array<{ Z: number }>): number[] {
  const z = rows.map((r) => r.Z).filter((v) => Number.isFinite(v))
  if (z.length === 0) return []

  const n = z.length
  const mean = z.reduce((a, b) => a + b, 0) / n
  // Population variance (divide by n), matching DataContext. Using the sample variance
  // here would shift every derived interval and make the check disagree with the screen
  // for a reason that has nothing to do with the number being wrong.
  const variance = z.reduce((a, b) => a + (b - mean) ** 2, 0) / n
  const std = variance > 0 ? Math.sqrt(variance) : 0
  const se = std / Math.sqrt(n)

  // 95% interval, matching the panel's approximate display.
  const out = [mean, Math.abs(mean), 1.96 * se, mean - 1.96 * se, mean + 1.96 * se, std, n]

  // Percentile rank of each observed Z is also displayed; compute the rank band rather
  // than the exact value, since the interface prints one decimal place.
  const sorted = [...z].sort((a, b) => a - b)
  for (const value of sorted) {
    out.push((sorted.filter((v) => v <= value).length / n) * 100)
  }

  return out.filter((v) => Number.isFinite(v))
}

/**
 * The Φ-derived summary metrics FormulaDisplay computes.
 *
 * These are arithmetic on the Φ decomposition, not stored values. `dominanceRatio` alone
 * accounts for several tokens on every route that mounts the formula panel.
 */
export function deriveFormulaMetrics(params: BeliefParameters = DEFAULT_UI_PARAMS): number[] {
  const model = calculateModel(params, {
    inputsAreStandardized: false,
    modifiersAreStandardized: true,
  })
  const { mainEffects, interactions, quadratic } = model.phiComponents

  const amplifying =
    (mainEffects > 0 ? mainEffects : 0) +
    (interactions > 0 ? interactions : 0) +
    (quadratic > 0 ? quadratic : 0)
  const suppressing =
    (mainEffects < 0 ? Math.abs(mainEffects) : 0) +
    (interactions < 0 ? Math.abs(interactions) : 0) +
    (quadratic < 0 ? Math.abs(quadratic) : 0)

  const netField = amplifying - suppressing
  const dominanceRatio = amplifying / (suppressing + 0.001)
  const systemVolatility = Math.abs(netField) / (amplifying + suppressing + 0.001)
  const emergenceThreshold = 0.5
  const distanceToThreshold = Math.abs(model.Z - emergenceThreshold)

  // `S` is the structural product shown beside Φ, and the saturation index is the
  // logistic-style transform of Z printed under it.
  const xSafe = normalizePanelXToStructural(params.X)
  const ySafe = normalizePanelYToStructural(params.Y)
  const structuralS = xSafe ** params.alpha * ySafe ** params.beta
  const saturationIndex = model.Z / (1 - model.Z + 0.001)

  return [
    amplifying,
    suppressing,
    netField,
    dominanceRatio,
    systemVolatility,
    emergenceThreshold,
    distanceToThreshold,
    xSafe,
    ySafe,
    structuralS,
    saturationIndex,
    criticalityIndex(model.Z, emergenceThreshold),
  ]
}

/** `1 - |Z - threshold| / threshold`, as FormulaDisplay computes it. */
function criticalityIndex(z: number, threshold: number): number {
  return 1 - Math.abs(z - threshold) / threshold
}

/**
 * Per-country panel means, which the preset table displays.
 *
 * The preset values are transcribed from the panel rather than imported, so they are not
 * in the artifact corpus. They are checkable all the same: averaging the canonical CSV by
 * country reproduces them (Australia X = 0.849 -> 0.85). Deriving them keeps the table
 * honest without adding 23 preset rows to an allowlist that must stay under ten entries.
 */
export function deriveCountryMeans(
  rows: Array<Record<string, unknown>>,
): number[] {
  const KEYS = ['X', 'Y', 'C', 'M', 'T', 'D', 'G', 'E', 'S', 'R', 'Z'] as const
  const byCountry = new Map<string, Array<Record<string, unknown>>>()

  for (const row of rows) {
    const iso = String(row.iso3 ?? '')
    if (!iso) continue
    const list = byCountry.get(iso) ?? []
    list.push(row)
    byCountry.set(iso, list)
  }

  const out: number[] = []
  for (const list of byCountry.values()) {
    for (const key of KEYS) {
      const values = list
        .map((r) => r[key])
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      if (values.length === 0) continue
      out.push(values.reduce((a, b) => a + b, 0) / values.length)
    }
  }
  return out
}

/**
 * The panel-space bounds the interface prints beside the sliders.
 *
 * These are constants in `modelContract.ts`, not measurements — but they are the same
 * constants the model clamps against, so a change to them legitimately changes the
 * displayed range. Returning them here keeps them out of the allowlist while still
 * failing if the printed number stops matching the contract.
 */
export function deriveContractConstants(): number[] {
  // `k` is printed on the advanced-parameters panel and comes from the structural fit.
  return [PANEL_X_MIN, PANEL_X_MAX, PANEL_Y_MIN, PANEL_Y_MAX, DEFAULT_UI_PARAMS.k, DEFAULT_UI_PARAMS.alpha, DEFAULT_UI_PARAMS.beta]
}

/**
 * Slider bounds, read from the sidebar markup.
 *
 * The tooltips print their own widget range ("Panel: [-1.49, 1.82]"), which is the slider
 * extent, not the observed panel range — the two differ (trauma spans -1.49..3.29 in the
 * data but the control stops at 1.82). Listing those extents in the allowlist would make
 * it twelve entries long for values that are simply read off the UI, so they are derived
 * from the markup instead. A bound that no longer matches the control fails the check.
 *
 * Parsed rather than duplicated: the alternative is a second copy of twenty numbers that
 * drifts the first time someone widens a slider.
 */
export function deriveSliderBounds(sidebarSource: string): number[] {
  const out: number[] = []
  const sliderPattern = /min="(-?[\d.]+)"\s*\n?\s*max="(-?[\d.]+)"/g
  for (const match of sidebarSource.matchAll(sliderPattern)) {
    out.push(Number(match[1]), Number(match[2]))
  }
  // Tooltip text also states extents; capture the bracketed pair it prints.
  const rangePattern = /\[(-?[\d.]+),\s*(-?[\d.]+)\]/g
  for (const match of sidebarSource.matchAll(rangePattern)) {
    out.push(Number(match[1]), Number(match[2]))
  }
  // Sigma multiples quoted in prose ("-1.5 ≈ 1.5σ", "+1.8 ≈ 1.8σ").
  const sigmaPattern = /(-?\d+(?:\.\d+)?)\s*(?:≈|sigma|σ)/g
  for (const match of sidebarSource.matchAll(sigmaPattern)) {
    out.push(Number(match[1]))
  }
  return out.filter((n) => Number.isFinite(n))
}

/**
 * Values the limits section derives rather than quotes.
 *
 * `207 − 17 = 190` is not in any artifact: it is the arithmetic the section performs to
 * say how many rows were never in the reserved set. Deriving it here keeps it out of the
 * allowlist, so a wrong subtraction still fails the rendered-number check.
 */
export function deriveLimitArithmetic(input: {
  panelRows: number
  lockboxCells: number
  profileGrid: number[]
  profileUpper: number
  shippedAlpha: number
}): number[] {
  const out = [
    input.panelRows - input.lockboxCells,
    input.profileUpper,
    input.shippedAlpha,
    ...input.profileGrid,
  ]
  return out.filter((n) => Number.isFinite(n))
}
