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

import { buildCorpus, extractTokens, resolveToken } from '../src/verification/numberResolution'
import {
  deriveComputedValues,
  deriveContractConstants,
  deriveLimitArithmetic,
  deriveSliderBounds,
  deriveCountryMeans,
  deriveFormulaMetrics,
  derivePanelStats,
  DEFAULT_UI_PARAMS,
} from '../src/verification/derivedValues'
import { ALLOWLIST, isAllowlisted } from '../src/verification/allowlist'
import { computePresetCountryAlignment } from '../src/utils/validation/presetCountryAlignment'
import type { PanelRowCanonical } from '../src/data/panelDataLoader'
// The preset table is transcribed panel data (documented at its definition). Reading it
// from the component keeps the check honest: the rendered number is compared against the
// table the interface actually holds, not a copy that could drift from it.
import { presets as PRESET_TABLE } from '../src/data/presets'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const ANALYSIS_DIR = path.join(REPO_ROOT, 'src', 'data', 'analysis')
const PANEL_CSV = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv')

/** Prompt 6: an allowlist that grows is a check that has stopped checking. */
const MAX_ALLOWLIST_ENTRIES = 10

/** Routes to scan. The landing view carries the most, but every panel is checked. */
const ROUTES = [
  '',
  'component-analysis',
  'field-dynamics',
  'statistical-analysis',
  'sensitivity-analysis',
  'emergence-analysis',
  'model-diagnostics',
  'advanced-parameters',
  'phi-contributions',
  'documentation',
  'presets',
]

export type TokenReport = {
  route: string
  tokens: number
  exact: number
  rounded: number
  derived: number
  allowlisted: number
  unresolved: { token: string; line: string }[]
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
export function buildSources(): { corpus: ReturnType<typeof buildCorpus>; derived: ReturnType<typeof buildCorpus> } {
  const artifacts: unknown[] = fs
    .readdirSync(ANALYSIS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(ANALYSIS_DIR, f), 'utf8')))

  // The panel CSV and its audit are evidence too: several displayed statistics are read
  // from the loaded rows rather than from an analysis artifact.
  artifacts.push(fs.readFileSync(PANEL_CSV, 'utf8'))
  const auditPath = PANEL_CSV.replace(/\.csv$/, '.audit.json')
  if (fs.existsSync(auditPath)) artifacts.push(JSON.parse(fs.readFileSync(auditPath, 'utf8')))

  const panelRows = readPanelRows()

  // The preset table's Success(%) is 100*(1-MAE) per country, computed from the panel.
  const alignment = computePresetCountryAlignment(panelRows)

  return {
    corpus: buildCorpus(artifacts),
    derived: buildCorpus([
      deriveComputedValues(DEFAULT_UI_PARAMS),
      deriveFormulaMetrics(DEFAULT_UI_PARAMS),
      derivePanelStats(panelRows.map((r) => ({ Z: r.Z }))),
      deriveCountryMeans(panelRows as unknown as Array<Record<string, unknown>>),
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
      deriveSliderBounds(
        fs.readFileSync(path.join(REPO_ROOT, 'src', 'components', 'sidebar', 'ModernSidebar.tsx'), 'utf8'),
      ),
      Object.values(PRESET_TABLE).flatMap((p) => Object.values(p.values)),
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
): TokenReport {
  const lines = text.split('\n')
  const seen = new Set<string>()
  const report: TokenReport = {
    route,
    tokens: 0,
    exact: 0,
    rounded: 0,
    derived: 0,
    allowlisted: 0,
    unresolved: [],
  }

  for (const line of lines) {
    for (const token of extractTokens(line)) {
      if (seen.has(token)) continue
      seen.add(token)
      report.tokens += 1

      const inCorpus = resolveToken(token, sources.corpus)
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

  try {
    for (const route of ROUTES) {
      const page = await browser.newPage()
      const target = route ? `${baseUrl}?v=${route}` : baseUrl
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 90000 })
      await page.waitForFunction(() => document.body.innerText.length > 200, { timeout: 30000 }).catch(() => {})
      await page.waitForTimeout(2500)
      const text = await page.evaluate(() => document.body.innerText)
      await page.close()

      reports.push(auditText(text, sources, route || 'landing'))
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
        String(r.derived).padStart(9) +
        String(r.allowlisted).padStart(8) +
        String(r.unresolved.length).padStart(12),
    )
    for (const u of r.unresolved) {
      failures += 1
      console.error(`\n  FAIL  ${r.route}: ${u.token}  in "${u.line}"`)
    }
  }

  // Prove the check can fail on this tree. A check that cannot be made to fail has not
  // been tested (Prompt 6), and this one's weakest class — a value resolved only because
  // some artifact happens to contain a nearby number — cannot be exercised from outside.
  // So the self-test asserts the *strongest* class works: an exact value is rejected when
  // it is not in the corpus.
  const selfTest = resolveToken('1234567.891', sources.corpus)
  if (selfTest.status !== 'unresolved') {
    failures += 1
    console.error('\n  FAIL  self-test: a value that appears nowhere in the corpus resolved')
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
      `${roundedTotal} resolved by rounding to artifact precision — the weakest class, ` +
      `and the reason a deliberate 0.001 shift in a 4-decimal value can still coincide ` +
      `with an unrelated artifact number.`,
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  void main()
}
