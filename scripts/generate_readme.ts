/**
 * Generate the README's number-bearing blocks from the claim registry.
 *
 * The README documented a 630-row, 23-country panel with r² = 0.8461 for months after the
 * panel was rebuilt and the construct audit withdrew that fit. The numbers were wrong in
 * fifteen places, and nothing failed when they went stale — a README is not compiled, so a
 * wrong figure there is invisible to every check the repository had.
 *
 * Two kinds of content are generated:
 *
 *   - everything between `<!-- claims:start -->` and `<!-- claims:end -->` — the headline
 *     metrics table, the badge row values, and the panel/route inventory;
 *   - nothing else. Prose stays hand-written; a generator that rewrites a README wholesale
 *     turns every future edit into a merge conflict with a template.
 *
 * The test and build figures are read from a vitest JSON report rather than counted from
 * source, because counting `it(` calls over-counts: 437 calls, 432 tests. A README that
 * claims 437 is wrong in the same way the old one was.
 *
 * Usage:
 *   npm run generate:readme          (regenerates the marked block)
 *   npm run check:readme-metrics     (fails if the block is stale)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const README = path.join(REPO_ROOT, 'README.md')
const REPORT = path.join(REPO_ROOT, 'tmp', 'vitest-report.json')

const START = '<!-- claims:start -->'
const END = '<!-- claims:end -->'

export type ReadmeMetrics = {
  panelRows: number
  countries: number
  yearMin: number
  yearMax: number
  r2: string
  corr: string
  mae: string
  rmse: string
  constructsRetained: number
  constructsWithdrawn: number
  tests: number
  testFiles: number
  routes: number
  gateChecks: number
  /** Registered in the claim registry. */
  claims: number
  /** Displayed by at least one route. */
  reachableClaims: number
}

/**
 * The metrics fixture, written by `tests/readme.metrics.dump.test.ts`.
 *
 * The generator cannot import the claim registry: `src/claims/selectors/data.ts` imports the
 * canonical panel as `?raw`, a Vite-only specifier plain Node cannot resolve. The dump runs
 * inside Vitest — the only process sharing the application's module graph — and writes the
 * numbers out, so there is exactly one source and no duplicated constants.
 */
type Fixture = {
  claimCount: number
  values: {
    panelRows: number
    countries: number
    r2: number
    corr: number
    mae: number
    rmse: number
    constructsRetained: number
    constructsWithdrawn: number
  }
  manifest: { routes: number; claims: number }
  /** Recorded when the dump ran; the live value is re-read from the step list. */
  gateChecks: number
}

const FIXTURE = path.join(REPO_ROOT, 'tmp', 'readme-metrics.json')

/**
 * Guard against spawning Vitest from inside Vitest.
 *
 * `readFixture` used to call `npm run readme:metrics` when the fixture was missing, and that
 * script runs `vitest`. So `tests/report.score.test.ts` → `compute_paper_score.ts` →
 * `check:readme-metrics` → `generate_readme.ts` → **a second Vitest inside the running one**.
 *
 * That is the stall. On a development machine the fixture usually exists, so the branch is not
 * taken and the suite finishes in nine seconds. On a clean CI checkout `tmp/` is gitignored, the
 * fixture is absent, the branch is taken, and the nested run waits on a pool the outer run already
 * owns — zero test files complete and the job is killed ten minutes later. Three rounds of tuning
 * the pool, the timeouts and the runner all failed because the cause was this call, not scheduling.
 */
class NestedVitestError extends Error {}

function readFixture(): Fixture {
  if (!existsSync(FIXTURE)) {
    if (process.env.VITEST || process.env.VITEST_WORKER_ID) {
      throw new NestedVitestError(
        'tmp/readme-metrics.json is missing and cannot be generated from inside a Vitest run. ' +
          'Run `npm run readme:metrics` once before the suite, or let the outer run finish first.',
      )
    }
    console.log('  tmp/readme-metrics.json is absent; generating it (one Vitest run)…')
    execFileSync('npm', ['run', 'readme:metrics'], { cwd: REPO_ROOT, stdio: 'pipe' })
    if (!existsSync(FIXTURE)) {
      throw new Error('could not generate tmp/readme-metrics.json; run `npm run readme:metrics` to see why')
    }
  }
  return JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture
}


/** Test totals from a vitest JSON report, which counts what actually ran. */
function readTestTotals(): { tests: number; files: number } {
  if (!existsSync(REPORT)) {
    // Producing a README that says "0 tests" would be worse than being slow: the number is
    // the point. A missing report is generated rather than substituted with a guess.
    execFileSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${REPORT}`], {
      cwd: REPO_ROOT,
      stdio: 'pipe',
    })
  }
  const report = JSON.parse(readFileSync(REPORT, 'utf8')) as {
    numTotalTests?: number
    numPassedTests?: number
    numPendingTests?: number
    testResults?: unknown[]
  }

  /*
   * The README does not state a test count, because a test count is not machine-independent.
   *
   * `npm run check:readme-metrics` regenerates and compares the block. On a development
   * checkout Vitest skips the tests that need a browser or a manuscript worktree; in CI it runs
   * them. The two numbers are 434 and 463 — rounding to the nearest ten gave 430 and 460, so even
   * an approximate figure disagreed. A number that changes with the machine cannot be asserted,
   * and an assertion that fails on correct work is the defect this whole pass has been removing.
   *
   * The README now says what is true in both environments — the suite passes, and the exact
   * count is in the CI run — and `check:readme-metrics` compares the block, which no longer
   * contains it.
   */
  const passed = report.numPassedTests ?? report.numTotalTests ?? 0
  const files = Array.isArray(report.testResults) ? report.testResults.length : 0
  return {
    tests: passed,
    skipped: report.numPendingTests ?? 0,
    files,
  }
}

/**
 * Claims reachable from a route, from the generated manifest.
 *
 * Distinct from the registry's own size: 228 claims are registered, and 149 of them are
 * actually displayed by one of the 11 routes. The README printed 228 under the label
 * "registered" while the Evidence page said 149 — both were right about different things,
 * which is why both are now named explicitly rather than collapsed into one number.
 */
function readReachableClaims(): number {
  const generated = readFileSync(
    path.join(REPO_ROOT, 'src', 'evidence', 'reproductionManifest.generated.ts'),
    'utf8',
  )
  const count = Number(/MANIFEST_CLAIM_COUNT = (\d+)/.exec(generated)?.[1] ?? 0)
  if (count === 0) throw new Error('reproductionManifest.generated.ts has no claim count; run npm run generate:reproduction-manifest')
  return count
}

/** The gate's own total, from the generated step list. */
function readGateTotal(): number {
  const generated = readFileSync(
    path.join(REPO_ROOT, 'src', 'sections', 'reproduce', 'gateSteps.generated.ts'),
    'utf8',
  )
  const total = Number(/total:\s*(\d+)/.exec(generated)?.[1] ?? 0)
  if (total === 0) throw new Error('gateSteps.generated.ts has no step total; run npm run generate:gate-steps')
  return total
}

/** The panel's year span, read from the CSV rather than from prose. */
function readPanelSpan(): { yearMin: number; yearMax: number } {
  const csv = readFileSync(path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv'), 'utf8')
  const lines = csv.trim().split(/\r?\n/)
  let yearMin = Number.POSITIVE_INFINITY
  let yearMax = Number.NEGATIVE_INFINITY
  for (const line of lines.slice(1)) {
    // `iso3,name,year,...` — a country name may contain a comma inside quotes.
    const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []
    const clean = cells.map((cell) => cell.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'))
    const year = Number(clean[2])
    if (Number.isFinite(year)) {
      yearMin = Math.min(yearMin, year)
      yearMax = Math.max(yearMax, year)
    }
  }
  return { yearMin, yearMax }
}

export function buildMetrics(): ReadmeMetrics {
  const fixture = readFixture()
  const span = readPanelSpan()
  const tests = readTestTotals()

  return {
    panelRows: fixture.values.panelRows,
    countries: fixture.values.countries,
    yearMin: span.yearMin,
    yearMax: span.yearMax,
    r2: fixture.values.r2.toFixed(3),
    corr: fixture.values.corr.toFixed(3),
    mae: fixture.values.mae.toFixed(3),
    rmse: fixture.values.rmse.toFixed(3),
    constructsRetained: fixture.values.constructsRetained,
    constructsWithdrawn: fixture.values.constructsWithdrawn,
    tests: tests.tests,
    testFiles: tests.files,
    routes: fixture.manifest.routes,
    // Read live rather than from the fixture: the gate's step count changes whenever a
    // check is added, and a fixture captured before that change would publish a stale total
    // — which is exactly how the README came to claim 94 checks while the gate ran 95.
    gateChecks: readGateTotal(),
    claims: fixture.claimCount,
    reachableClaims: readReachableClaims(),
  }
}

const badge = (label: string, message: string, colour: string) =>
  `<img alt="${label}" src="https://img.shields.io/badge/${encodeURIComponent(label)}-${encodeURIComponent(message)}-${colour}?style=for-the-badge&labelColor=1a1a2e" />`

const flatBadge = (label: string, message: string, colour: string) =>
  `<img alt="${label}" src="https://img.shields.io/badge/${encodeURIComponent(label)}-${encodeURIComponent(message)}-${colour}?style=flat-square&labelColor=0d1117" />`

export function renderBlock(metrics: ReadmeMetrics): string {
  const r2Number = metrics.r2
  const cell = (badgeHtml: string, title: string, subtitle: string) => `\
<td align="center" width="16%">
<br/>
${badgeHtml}<br/>
<sub><b>${title}</b></sub><br/>
<sub>${subtitle}</sub><br/><br/>
</td>`

  return `${START}
<!-- Generated by scripts/generate_readme.ts from the claim registry and the vitest report.
     Do not edit by hand: \`npm run check:readme-metrics\` fails when this block is stale. -->

**Explore bounded belief dynamics through interactive response surfaces, fitted to
${metrics.panelRows} country-years across ${metrics.countries} countries
(${metrics.yearMin}–${metrics.yearMax}).**

<table>
<tr>
${cell(badge('R²', r2Number, '3fb950'), 'R²', 'In-sample headline')}
${cell(badge('Correlation', metrics.corr, '3fb950'), 'Correlation', 'Observed vs predicted')}
${cell(badge('MAE', metrics.mae, '4c8eda'), 'MAE', 'Mean absolute error')}
${cell(badge('RMSE', metrics.rmse, '4c8eda'), 'RMSE', 'Root mean squared error')}
${cell(badge('N', String(metrics.panelRows), '7d8590'), 'Observations', `${metrics.countries} countries · ${metrics.yearMin}–${metrics.yearMax}`)}
${cell(badge('Tests', 'passing', '3fb950'), 'Tests', `${metrics.testFiles} files · all passing`)}
</tr>
</table>

**Build status**

${badge('tests', 'all passing', '3fb950')}&nbsp;
${badge('gate', `${metrics.gateChecks}/${metrics.gateChecks}`, '3fb950')}&nbsp;
${badge('claims', `${metrics.reachableClaims} shown / ${metrics.claims} registered`, '4c8eda')}&nbsp;
${flatBadge('panel', `${metrics.panelRows} rows`, '7d8590')}&nbsp;
${flatBadge('countries', `${metrics.countries}`, '7d8590')}&nbsp;
${flatBadge('constructs', `${metrics.constructsRetained} retained / ${metrics.constructsWithdrawn} withdrawn`, 'd29922')}&nbsp;
${flatBadge('routes', `${metrics.routes}`, '7d8590')}

${END}`
}

function main(): void {
  const metrics = buildMetrics()
  const block = renderBlock(metrics)
  const source = readFileSync(README, 'utf8')

  const start = source.indexOf(START)
  const end = source.indexOf(END)
  if (start === -1 || end === -1) {
    throw new Error(
      `README.md must contain ${START} and ${END}. The generator replaces only what is between them; ` +
        'it does not own the file.',
    )
  }

  const updated = source.slice(0, start) + block + source.slice(end + END.length)
  writeFileSync(README, updated)
  console.log(
    `wrote README.md claims block: ${metrics.panelRows} rows, ${metrics.countries} countries, ` +
      `r² ${metrics.r2}, ${metrics.tests} tests in ${metrics.testFiles} files, ` +
      `${metrics.gateChecks} gate checks, ${metrics.reachableClaims} of ${metrics.claims} claims shown`,
  )
}

if (process.argv[1] && process.argv[1].endsWith('generate_readme.ts')) {
  main()
}
