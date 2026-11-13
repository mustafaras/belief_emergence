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
  deriveAiTokenCount,
  deriveFormulaEffectEstimates,
  derivePanelConstants,
  derivePhiContributions,
  deriveLimitArithmetic,
  deriveSliderBounds,
  deriveCountryMeans,
  deriveCountryR2Median,
  deriveFormulaMetrics,
  derivePanelStats,
  DEFAULT_UI_PARAMS,
} from '../src/verification/derivedValues'
import { ALLOWLIST, isAllowlisted } from '../src/verification/allowlist'
import { ARTIFACT_CONSUMPTION } from '../src/evidence/artifactConsumption.generated'
import { computePresetCountryAlignment } from '../src/utils/validation/presetCountryAlignment'
import { computePanelFitSummary } from '../src/utils/validation/computePanelFitSummary'
import { predictFromPanelRow } from '../src/utils/validation/panelPredict'
import { computeBias } from '../src/utils/metrics'
import { getProductionHeadlineMetrics } from '../src/data/modelMetrics'
import { formatNumeric } from '../src/utils/formatNumeric'
import constructAuditArtifact from '../src/data/analysis/wvs_construct_audit.json'
import constructAvailabilityArtifact from '../src/data/analysis/construct_item_availability.json'
import { buildConstructRows, type AuditArtifact, type ItemAvailability } from '../src/verification/constructAudit'
import type { PanelRowCanonical } from '../src/data/panelDataLoader'
import { SITEMAP } from '../src/router/routes'
// The preset table, now generated from the canonical panel.
//
// It used to be hand-maintained, which made this check circular: reading the table from the
// module the modal renders meant a wrong value matched itself. The table is derived by
// `scripts/generate_presets.ts` and `check:presets` re-derives it, so the values are
// verified against the panel rather than against their own copy.
import { GENERATED_PRESETS as PRESET_TABLE } from '../src/data/presets.generated'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const ANALYSIS_DIR = path.join(REPO_ROOT, 'src', 'data', 'analysis')
const PANEL_CSV = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv')

/** Prompt 6: an allowlist that grows is a check that has stopped checking. */
const MAX_ALLOWLIST_ENTRIES = 10

/** Scan the router's whole sitemap, including modal routes such as AI Interpreter. */
const ROUTES = ['', ...SITEMAP.map(({ id }) => id)]

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
   * the slider defaults in `src/App.tsx`.
   *
   * Restricting the corpus to imported artifacts means a value either comes from something
   * the interface can reach, or it is derived, or it is a declared constant. There is no
   * fourth category.
   */
  const imported = new Set<string>(ARTIFACT_CONSUMPTION.imported)
  const artifacts: unknown[] = fs
    .readdirSync(ANALYSIS_DIR)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => imported.has(f.replace(/\.json$/, '')))
    .map((f) => JSON.parse(fs.readFileSync(path.join(ANALYSIS_DIR, f), 'utf8')))

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
      deriveAiTokenCount(),
      derivePhiContributions(DEFAULT_UI_PARAMS),
      derivePanelConstants(),
      deriveFormulaEffectEstimates(DEFAULT_UI_PARAMS),
      deriveFormulaMetrics(DEFAULT_UI_PARAMS),
      derivePanelStats(panelRows.map((r) => ({ Z: r.Z }))),
      deriveCountryMeans(panelRows as unknown as Array<Record<string, unknown>>),
      deriveCountryR2Median(panelRows),
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
  const presetAudit = route === 'presets'
    ? validatePresetRows(renderedPresetRows, sources.sourced.presetRows)
    : { validTokens: new Set<string>(), failures: [] as string[] }
  for (const failure of presetAudit.failures) report.unresolved.push({ token: '<row>', line: failure })
  const constructAudit = route === 'landing'
    ? validateConstructRows(renderedConstructRows, sources.sourced.constructRows)
    : { validTokens: new Set<string>(), failures: [] as string[] }
  for (const failure of constructAudit.failures) report.unresolved.push({ token: '<row>', line: failure })

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    const previousLine = lines[lineIndex - 1]?.trim() ?? ''
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

    for (const token of extractTokens(line)) {
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
      if (route === 'ai-interpreter') {
        // Opening this modal auto-submits its starter prompt. Keep the audit local and
        // deterministic: a browser check must not spend an API key or depend on a reply.
        await page.route('**/api/ai/interpret', (request) =>
          request.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'AI requests are disabled during automated verification.' }),
          }),
        )
      }
      const target = route ? `${baseUrl}?v=${route}` : baseUrl
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 90000 })
      await page.waitForFunction(() => document.body.innerText.length > 200, { timeout: 30000 }).catch(() => {})
      await page.waitForTimeout(2500)
      const { text, presetRows, constructRows } = await page.evaluate(() => ({
        text: document.body.innerText,
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

      reports.push(auditText(text, sources, route || 'landing', presetRows, constructRows))
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
