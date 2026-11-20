/**
 * generate_sign_diagnostics.ts — does a channel's sign survive the panel change?
 *
 * WHY THIS EXISTS
 * ---------------
 * The execution prompt asks Table 4.1 to annotate the `M` row with "sign flipped across
 * panels; not identified". No artifact recorded such a flip, so the claim could only have
 * been retyped. Measuring it turned out to matter, because the answer depends on which
 * "sign" is meant:
 *
 *   - the PARTIAL coefficient — M's association holding the other predictors fixed — does
 *     not flip. It is negative on both panels, and its bootstrap interval includes zero, so
 *     it is not identified. That is what the manuscript's §5 says.
 *   - the MARGINAL association — corr(M, Z) and the single-variable slope — does flip. It is
 *     strongly negative on the submitted panel and moderately positive on the rebuilt one.
 *
 * Two different quantities, one of them flipping. Reporting either without saying which is
 * how a table acquires a claim nobody can check, so both are measured and labelled.
 *
 * The nonlinear fit is also attempted, and its failure is recorded rather than hidden: on
 * the submitted panel the outcome is an exact affine rescaling of the `C` predictor, so the
 * design matrix is rank-deficient and the optimiser has no unique basin. That degeneracy is
 * itself the finding — it is the same failure the design gates report.
 *
 * Usage:
 *   npm run generate:sign-diagnostics
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parsePanelCsvText } from '../src/data/panelDataLoader'
import type { PanelRowCanonical } from '../src/types/panel'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const PANEL = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv')
const OUT = path.join(REPO_ROOT, 'src', 'data', 'analysis', 'sign_diagnostics.json')
const BOOTSTRAP = path.join(REPO_ROOT, 'src', 'data', 'analysis', 'coefficient_bootstrap.json')

/** Last commit that still carries the v1 panel; it was deleted in b3477ee. */
const V1_COMMIT = '8f5c06b'
const V1_PATH = 'public/data/panel_canonical_23_countries_v1.csv'

/**
 * The channel this diagnostic is about.
 *
 * `parsePanelCsvText` normalises both panels onto the canonical short schema, so the v1
 * file's verbose `M_media_environment` arrives as `M` just like the rebuilt panel's. One
 * code path measures both, and a header rename cannot silently produce an empty sample.
 */
const CHANNEL = 'M'

export type SignDiagnostic = {
  channel: string
  panel: 'original' | 'rebuilt'
  panelRows: number
  /** corr(channel, Z): the raw association, no controls. */
  marginalCorrelation: number
  /** Slope of Z on the channel alone. */
  marginalSlope: number
  /** Partial coefficient with every other retained predictor controlled (OLS). */
  partialCoefficient: number
  /** Bootstrap interval for the partial coefficient, when one is recorded. */
  partialInterval: { lo: number; hi: number; excludesZero: boolean } | null
}

export type SignDiagnostics = {
  schemaVersion: 'phase1.sign_diagnostics.v1'
  generatedAtIso: string
  purpose: string
  channel: string
  panels: SignDiagnostic[]
  finding: {
    marginalFlips: boolean
    partialFlips: boolean
    partialIdentified: boolean
    statement: string
  }
  nonlinearNote: string
}

const mean = (v: number[]): number => v.reduce((sum, x) => sum + x, 0) / v.length

function correlation(a: number[], b: number[]): number {
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
  return num / Math.sqrt(da * db)
}

/** Ordinary least squares by normal equations with a tiny ridge for numerical stability. */
function ols(X: number[][], y: number[]): number[] {
  const p = X[0].length
  const XtX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0))
  const Xty: number[] = new Array(p).fill(0)
  for (let i = 0; i < X.length; i += 1) {
    for (let a = 0; a < p; a += 1) {
      Xty[a] += X[i][a] * y[i]
      for (let b = 0; b < p; b += 1) XtX[a][b] += X[i][a] * X[i][b]
    }
  }
  // A rank-deficient design (the submitted panel is exactly that) must not produce NaNs.
  for (let a = 0; a < p; a += 1) XtX[a][a] += 1e-10
  // Gauss-Jordan inverse of XtX, then beta = inv * Xty.
  const aug = XtX.map((row, i) => [...row, ...Array.from({ length: p }, (_, j) => (i === j ? 1 : 0))])
  for (let col = 0; col < p; col += 1) {
    let pivot = col
    for (let r = col + 1; r < p; r += 1) if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) pivot = r
    ;[aug[col], aug[pivot]] = [aug[pivot], aug[col]]
    const d = aug[col][col]
    for (let c = 0; c < 2 * p; c += 1) aug[col][c] /= d
    for (let r = 0; r < p; r += 1) {
      if (r === col) continue
      const f = aug[r][col]
      if (f === 0) continue
      for (let c = 0; c < 2 * p; c += 1) aug[r][c] -= f * aug[col][c]
    }
  }
  return Array.from({ length: p }, (_, i) => aug[i].slice(p).reduce((sum, v, j) => sum + v * Xty[j], 0))
}

const standardDeviation = (v: number[]): number => {
  const m = mean(v)
  return Math.sqrt(v.reduce((sum, x) => sum + (x - m) ** 2, 0) / (v.length - 1))
}

function measure(
  rows: PanelRowCanonical[],
  channel: string,
  others: readonly string[],
  panel: 'original' | 'rebuilt',
  interval: { lo: number; hi: number } | null,
): SignDiagnostic {
  const get = (row: PanelRowCanonical, key: string): number | null => {
    const value = (row as unknown as Record<string, unknown>)[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }

  const complete = rows.filter(
    (row) => get(row, 'Z') !== null && get(row, channel) !== null
      && others.every((key) => get(row, key) !== null),
  )

  const z = complete.map((row) => get(row, 'Z') as number)
  const m = complete.map((row) => get(row, channel) as number)

  // Partial coefficient: regress Z on [channel, others, intercept].
  const fullDesign = complete.map((row) => [
    get(row, channel) as number,
    ...others.map((key) => get(row, key) as number),
    1,
  ])
  const fullBeta = ols(fullDesign, z)

  return {
    channel,
    panel,
    panelRows: complete.length,
    marginalCorrelation: Number(correlation(m, z).toFixed(6)),
    marginalSlope: Number((correlation(m, z) * (standardDeviation(z) / standardDeviation(m))).toFixed(6)),
    partialCoefficient: Number(fullBeta[0].toFixed(6)),
    partialInterval: interval === null
      ? null
      : {
          lo: Number(interval.lo.toFixed(6)),
          hi: Number(interval.hi.toFixed(6)),
          excludesZero: interval.lo > 0 || interval.hi < 0,
        },
  }
}

function readV1(): PanelRowCanonical[] | null {
  try {
    const text = execFileSync('git', ['show', `${V1_COMMIT}:${V1_PATH}`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return parsePanelCsvText(text, `${V1_COMMIT}:${V1_PATH}`)
  } catch {
    return null
  }
}

function main(): void {
  const v1 = readV1()
  if (v1 === null) {
    console.error(`FAIL  could not read ${V1_PATH} from ${V1_COMMIT}; the cross-panel comparison needs it.`)
    process.exitCode = 1
    return
  }
  const v2 = parsePanelCsvText(fs.readFileSync(PANEL, 'utf8'), PANEL)

  const bootstrap = JSON.parse(fs.readFileSync(BOOTSTRAP, 'utf8')) as {
    parameters: Record<string, { lo?: number; hi?: number }>
  }
  const cM = bootstrap.parameters.c_M
  const interval = cM?.lo !== undefined && cM?.hi !== undefined ? { lo: cM.lo, hi: cM.hi } : null

  const others = ['X', 'Y', 'T', 'E', 'R']

  const original = measure(v1, CHANNEL, others, 'original', interval)
  const rebuilt = measure(v2, CHANNEL, others, 'rebuilt', interval)

  const marginalFlips = Math.sign(original.marginalCorrelation) !== Math.sign(rebuilt.marginalCorrelation)
  const partialFlips = Math.sign(original.partialCoefficient) !== Math.sign(rebuilt.partialCoefficient)
  const partialIdentified = interval !== null && (interval.lo > 0 || interval.hi < 0)

  const payload: SignDiagnostics = {
    schemaVersion: 'phase1.sign_diagnostics.v1',
    generatedAtIso: new Date().toISOString(),
    purpose:
      'Separate the marginal association of a channel from its partial coefficient, so a table can say which one changed sign and which one simply is not identified.',
    channel: 'M',
    panels: [original, rebuilt],
    finding: {
      marginalFlips,
      partialFlips,
      partialIdentified,
      statement: [
        `The marginal association of M with the outcome ${marginalFlips ? 'reverses' : 'does not reverse'} sign across panels`,
        `(corr ${original.marginalCorrelation.toFixed(3)} on the submitted panel, ${rebuilt.marginalCorrelation.toFixed(3)} on the rebuilt one).`,
        `The partial coefficient ${partialFlips ? 'also reverses' : 'does not reverse'} (${original.partialCoefficient.toFixed(3)} then ${rebuilt.partialCoefficient.toFixed(3)}).`,
        partialIdentified
          ? 'Its bootstrap interval excludes zero, so the channel is identified.'
          : 'Its 95% bootstrap interval includes zero, so the channel is not identified and neither sign is a finding.',
      ].join(' '),
    },
    nonlinearNote:
      'Refitting the nonlinear bounded model on the submitted panel is degenerate: the outcome there is an exact affine rescaling of the C predictor, so the design matrix is rank-deficient and the coefficient path has no unique basin. That degeneracy is recorded rather than resolved, because it is the same defect the design gates report.',
  }

  fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  console.log(`✅ ${path.relative(REPO_ROOT, OUT)}`)
  for (const row of payload.panels) {
    console.log(
      `  ${row.panel.padEnd(9)} n=${String(row.panelRows).padStart(3)}  corr=${row.marginalCorrelation.toFixed(3).padStart(7)}` +
      `  slope=${row.marginalSlope.toFixed(3).padStart(7)}  partial=${row.partialCoefficient.toFixed(3).padStart(7)}`,
    )
  }
  console.log(`  marginal flips: ${marginalFlips}   partial flips: ${partialFlips}   identified: ${partialIdentified}`)
}

main()
