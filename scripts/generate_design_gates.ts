/**
 * generate_design_gates.ts — the four design gates, on both panels.
 *
 * WHY THIS EXISTS
 * ---------------
 * The manuscript states that all four design gates failed on the submitted panel and all
 * four pass on the rebuilt one. Both halves were prose: no script produced them, so the
 * app could only have retyped the numbers. This measures them.
 *
 * THE TWO ORIGINAL PANELS, AND WHY ONLY ONE IS RECOMPUTABLE
 * ---------------------------------------------------------
 *   - `panel_canonical_23_countries_v1.csv` (630 rows) is read from git. The four gates are
 *     well defined on it and are recomputed here.
 *   - `rawdata/panel_model_data.csv` (1,128 rows) is where the paper's "maximum absolute
 *     deviation 4.4e-15 over 1,128 rows" comes from. It is licence-restricted and
 *     gitignored, so a clean clone cannot measure it. When it is present it is measured;
 *     when it is absent the recorded figure is carried with `source: "recorded"` and the
 *     file it came from. The artifact never presents a recorded number as measured.
 *
 * Usage:
 *   npm run generate:design-gates
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Papa from 'papaparse'

import { parsePanelCsvText } from '../src/data/panelDataLoader'
import {
  evaluateOriginalPanel,
  evaluateRebuiltPanel,
  THRESHOLDS,
  type DesignGates,
  type OriginalPanelProvenance,
} from '../src/utils/validation/designGates'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const PANEL = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv')
const OUT = path.join(REPO_ROOT, 'src', 'data', 'analysis', 'design_gates.json')

/**
 * The commit that still carries the v1 panel.
 *
 * `b3477ee` removed it from the tree; `8f5c06b` is the last commit that has it. Reading a
 * deleted file from history is the only way to measure the original design matrix without
 * reintroducing a 630-row CSV into the working tree for the sole purpose of being measured
 * once.
 */
const V1_COMMIT = '8f5c06b'
const V1_PATH = 'public/data/panel_canonical_23_countries_v1.csv'

/**
 * Where the restricted upstream extract might be.
 *
 * `rawdata/` is gitignored, so a fresh clone never has it and this worktree usually does
 * not either. But the sibling worktree of the same repository often does, and reading it
 * turns a recorded figure into a measured one. The search is explicit and reported, so the
 * artifact can say which of the three happened.
 */
const UPSTREAM_CANDIDATES = [
  process.env.PANEL_MODEL_DATA,
  path.join(REPO_ROOT, 'rawdata', 'panel_model_data.csv'),
  path.join(REPO_ROOT, '..', 'repo', 'rawdata', 'panel_model_data.csv'),
].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0)

const UPSTREAM = UPSTREAM_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ?? UPSTREAM_CANDIDATES[1]

/** Recorded in the manuscript and KI-01; used only when the upstream file is absent. */
const RECORDED_UPSTREAM = {
  rows: 1128,
  maxAbsDeviation: 4.4e-15,
  recordedFrom: 'rawdata/panel_model_data.csv (KI-01, manuscript §3 Step 3)',
} as const

function readV1Panel(): string | null {
  try {
    return execFileSync('git', ['show', `${V1_COMMIT}:${V1_PATH}`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return null
  }
}

/**
 * Measure the upstream identity: Z against the z-score of C_religiosity_index.
 *
 * The paper's 4.4e-15 is not `corr`, it is the maximum absolute deviation between the
 * outcome and the standardised upstream item — a different and stricter statement, which
 * is why it is reported separately from r = 1.0 rather than folded into it.
 */
function measureUpstream(): OriginalPanelProvenance['upstreamIdentity'] {
  if (!fs.existsSync(UPSTREAM)) {
    return { ...RECORDED_UPSTREAM, source: 'recorded' }
  }
  // PapaParse, not `split(',')`. The extract quotes country names, and a naive split shifts
  // every column after the first quoted field: the first version of this measured 1,181
  // rows with a deviation of 5.78, because it was reading the wrong columns for some rows.
  // The same mistake cost four cells in the P19 blocker generator.
  const text = fs.readFileSync(UPSTREAM, 'utf8')
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: true,
  })
  const pairs: Array<[number, number]> = []
  for (const row of parsed.data) {
    const c = Number.parseFloat(row.C_religiosity_index ?? '')
    const z = Number.parseFloat(row.Z_belief_outcome ?? '')
    if (Number.isFinite(c) && Number.isFinite(z)) pairs.push([c, z])
  }
  if (pairs.length === 0) return { ...RECORDED_UPSTREAM, source: 'recorded' }

  /**
   * Compensated (Kahan) summation for the mean.
   *
   * The quantity being reported is the floating-point residue of an exact identity, so its
   * magnitude is set by rounding error, not by the data. A plain `reduce` sum over 1,128
   * values gave 1.13e-14; compensating gave 4.44e-15, which is the figure the manuscript
   * prints. The difference is not cosmetic — it is the difference between reproducing the
   * published number and reporting a larger error than the paper claims.
   */
  const kahanSum = (values: number[]): number => {
    let sum = 0
    let compensation = 0
    for (const value of values) {
      const y = value - compensation
      const t = sum + y
      compensation = t - sum - y
      sum = t
    }
    return sum
  }

  const mean = kahanSum(pairs.map(([c]) => c)) / pairs.length
  const variance = kahanSum(pairs.map(([c]) => (c - mean) ** 2)) / (pairs.length - 1)
  const sd = Math.sqrt(variance)
  const maxAbsDeviation = pairs.reduce((worst, [c, z]) => {
    const standardised = (c - mean) / sd
    return Math.max(worst, Math.abs(z - standardised))
  }, 0)

  return {
    rows: pairs.length,
    // Significand-and-exponent, not a fixed decimal count. The quantity IS the floating-point
    // residue of an exact identity, so it lives around 1e-15: rounding to twelve places
    // reported it as 0 and turned the paper's 4.4e-15 into a claim of perfect equality.
    maxAbsDeviation: Number(maxAbsDeviation.toPrecision(3)),
    source: 'recomputed',
    recordedFrom: path.relative(REPO_ROOT, UPSTREAM),
  }
}

function main(): void {
  const v1Text = readV1Panel()
  if (v1Text === null) {
    console.error(
      `FAIL  could not read ${V1_PATH} from ${V1_COMMIT}. The original panel's gates cannot be ` +
        'measured without it, and a recorded-only artifact would silently drop half the claim.',
    )
    process.exitCode = 1
    return
  }

  const v1Rows = parsePanelCsvText(v1Text, `${V1_COMMIT}:${V1_PATH}`)
  const rebuiltRows = parsePanelCsvText(fs.readFileSync(PANEL, 'utf8'), PANEL)

  const original = evaluateOriginalPanel(v1Rows)
  const rebuilt = evaluateRebuiltPanel(rebuiltRows)

  const provenance: OriginalPanelProvenance = {
    designMatrix: {
      source: `${V1_COMMIT}:${V1_PATH}`,
      rows: original.rows,
      countries: new Set(v1Rows.map((row) => row.iso3)).size,
      distinctCountryYears: new Set(v1Rows.map((row) => `${row.iso3}|${row.year}`)).size,
    },
    upstreamIdentity: measureUpstream(),
  }

  const payload: DesignGates = {
    schemaVersion: 'phase1.design_gates.v1',
    generatedAtIso: new Date().toISOString(),
    purpose:
      'Apply the four design rules to the panel originally submitted and to the rebuilt panel, so the claim that all four failed and now all four pass is a measurement rather than a restatement.',
    thresholds: THRESHOLDS,
    original,
    rebuilt,
    originalProvenance: provenance,
    interpretation:
      'On the submitted panel every rule fails. Its outcome was an exact affine rescaling of the ' +
      'cultural-intensity predictor (r = 1), two predictors were the same variable with opposite ' +
      'sign, and the design matrix was one column short of full rank. On the rebuilt panel all ' +
      'four pass with margin. The identity failure is the one that matters: it made every ' +
      'reported out-of-sample metric an algebraic identity rather than evidence.',
  }

  fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  const report = (label: string, panel: typeof original) => {
    console.log(`\n  ${label}: ${panel.rows} rows, ${panel.predictors.length} predictors`)
    for (const gate of panel.gates) {
      const mark = gate.pass ? 'PASS' : 'FAIL'
      console.log(`    ${mark}  ${gate.id.padEnd(16)} ${gate.rule.padEnd(28)} measured ${gate.measured.toFixed(6)}  (${gate.detail})`)
    }
    console.log(`    ${panel.allPass ? 'all four pass' : 'not all pass'}`)
  }

  console.log(`✅ ${path.relative(REPO_ROOT, OUT)}`)
  report('original', original)
  report('rebuilt', rebuilt)
  console.log(`\n  upstream identity: ${provenance.upstreamIdentity.rows} rows, max deviation ${provenance.upstreamIdentity.maxAbsDeviation} (${provenance.upstreamIdentity.source})`)

  if (original.allPass) {
    console.error('  WARNING: the original panel now passes every gate; the manuscript claims all four failed.')
    process.exitCode = 1
  }
  if (!rebuilt.allPass) {
    console.error('  WARNING: the rebuilt panel fails a gate; the manuscript claims all four pass.')
    process.exitCode = 1
  }
}

main()
