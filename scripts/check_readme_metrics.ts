/**
 * Fail when the README's generated block is stale, or when a withdrawn number reappears.
 *
 * Two separate failures, both of which happened:
 *
 *   1. The generated block was not regenerated after a claim changed, so the README printed
 *      a figure the application no longer shows.
 *   2. A number was typed back into the prose by hand. The generator owns only its block;
 *      the surrounding 3,800 lines are hand-written, and that is where 630 and 0.8461 lived
 *      for months.
 *
 * The second check is what `check:no-hardcoded-headline` does for `.tsx`, applied to the
 * README: the withdrawn values are forbidden anywhere in the file, with two documented
 * exceptions (a historical note about commit `8f5c06b`, and Lighthouse scores, which are a
 * different measurement that happens to be expressed over 100).
 *
 * Usage:
 *   npm run check:readme-metrics
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildMetrics, renderBlock } from './generate_readme'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const README = path.join(REPO_ROOT, 'README.md')

const START = '<!-- claims:start -->'
const END = '<!-- claims:end -->'

/**
 * Values that must not appear in the README.
 *
 * Each is a number the panel no longer produces or a fit that was withdrawn. `630` and
 * `23 countries` describe the retired panel; `0.8461`, `0.9488`, `0.1005` and `0.1212` are
 * the withdrawn fit's metrics; `84.61%` is that fit expressed as a share.
 */
const FORBIDDEN: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /0\.8461\b/, why: 'the withdrawn fit\'s R² (current: read from eval.headline.r2)' },
  { pattern: /0\.9488\b/, why: 'the withdrawn fit\'s correlation' },
  { pattern: /0\.1005\b/, why: 'the withdrawn fit\'s MAE' },
  { pattern: /0\.1212\b/, why: 'the withdrawn fit\'s RMSE' },
  { pattern: /84\.61\s*%/, why: 'the withdrawn fit expressed as explained variance' },
  { pattern: /\b630[ -](?:row|obs|observation|country-year)/i, why: 'the retired 630-row panel' },
  { pattern: /\bN\s*=\s*630\b/, why: 'the retired panel size' },
  { pattern: /\b23 (?:OECD|countries|nations)\b/, why: 'the retired panel\'s country count' },
  { pattern: /\b100\s*\/\s*100\b(?![^\n]*Lighthouse)/, why: 'a test count that was never current' },
  /*
   * Performance figures nothing in this repository measures.
   *
   * They were not wrong by a little — the bundle was stated as 447 KB against a measured 179 KiB,
   * and FCP as 0.8 s against a measured 96 ms — but the failure was that no check looked at them,
   * so they survived every gate run for months while `ci:gate` reported 99/99. The gate covered
   * artifacts and rendered numbers; nothing covered prose about performance.
   *
   * The honest replacement names each figure in a table of what was removed, which is why the
   * exemption below exists. That is a deliberate, visible exception, not a quiet one.
   */
  { pattern: /\b447\s*KB\b/, why: 'the retired bundle figure (measured: 179 KiB gzipped)' },
  { pattern: /\bweb-vitals\b(?!.*(?:dependency|beacon|removed))/i, why: 'a monitoring integration this project does not have' },
  { pattern: /\/api\/analytics\b/, why: 'an endpoint this static site does not serve' },
  { pattern: /i7-12700K|RTX\s*3080/i, why: 'a benchmark machine that never ran anything here' },
  { pattern: /\bLighthouse\b/i, why: 'a Lighthouse score: not a dependency, never runs here' },
  // The render-timing and heap tables. A paint time stated to one decimal in seconds is a
  // different measurement from the gate's milliseconds, and nothing here produces either.
  { pattern: /\b\d\.\ds\b/, why: 'a render timing from the removed benchmark table (the gate reports ms)' },
  { pattern: /\b(?:2[89]|[4-9]\d|1\d\d)\s*MB\b/, why: 'a heap size: nothing here measures memory' },
  { pattern: /\b(?:12|45|180|720)\s*ms\b(?![^\n]*(?:median|previously quoted|removed))/, why: 'a surface benchmark from the removed table' },
]

/**
 * Lines where a forbidden value is correct and must stay.
 *
 * A check with no exemptions forces the documentation to forget its own history; a check
 * with quiet ones is how the last set of numbers survived. Both are named here.
 */
const ALLOWED_CONTEXT = [
  /8f5c06b/,                       // historical note: where the v1 panel still lives
  /*
   * `Lighthouse` used to be exempted on its own, which excused any sentence containing the word —
   * the negative test for this file's own guards walked straight through it with
   * "Our Lighthouse score is 98." A score is the retired claim, not the word. Narrowed to the
   * table cell that reports a removed category score.
   */
  /\|\s*\*{0,2}Lighthouse scores\*{0,2}\s*\|/,  // the removal table's row for those scores
  /\|\s*100\/100\s*\|/,            // a table cell, i.e. a Lighthouse category score
  /*
   * The table that records what was removed and why. Every retired figure in it is correct, and
   * deleting the table to satisfy the guard would remove the only record that those numbers were
   * ever there. Narrow on purpose: a row of this table, not any line mentioning a retired value.
   */
  /^\|\s*`?(?:Removed|Bundle breakdown|Render performance|Surface benchmarks|Memory usage|Lighthouse scores|web-vitals)`?[^|]*\|/,
]


/**
 * Every line carrying a retired value, with the reason it is retired.
 *
 * Exported because the guards need their own test. The first version of this list exempted the
 * word `Lighthouse` on its own, which excused any sentence containing it — and the only way that
 * was found was by appending a fake claim to the README and re-running the check. A guard whose
 * exemptions are never exercised is a guard that silently stops guarding.
 */
export function findRetiredValues(source: string): Array<{ line: number; value: string; why: string }> {
  const hits: Array<{ line: number; value: string; why: string }> = []
  source.split('\n').forEach((text, index) => {
    if (ALLOWED_CONTEXT.some((allowed) => allowed.test(text))) return
    for (const { pattern, why } of FORBIDDEN) {
      if (pattern.test(text)) {
        hits.push({ line: index + 1, value: text.trim().slice(0, 120), why })
        break
      }
    }
  })
  return hits
}

function main(): void {
  const source = readFileSync(README, 'utf8')

  const start = source.indexOf(START)
  const end = source.indexOf(END)
  if (start === -1 || end === -1) {
    console.error(`FAIL  README.md is missing ${START} / ${END}; the generator cannot own a block that is not marked`)
    process.exit(1)
  }

  const committed = source.slice(start, end + END.length)
  const expected = renderBlock(buildMetrics())

  let failed = false

  if (committed !== expected) {
    failed = true
    const a = committed.split('\n')
    const b = expected.split('\n')
    console.error('FAIL  the README claims block is stale')
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      if (a[i] !== b[i]) {
        console.error(`      first difference at line ${i + 1} of the block`)
        console.error(`      committed: ${(a[i] ?? '(end)').trim().slice(0, 150)}`)
        console.error(`      derived:   ${(b[i] ?? '(end)').trim().slice(0, 150)}`)
        break
      }
    }
    console.error('      run `npm run readme:metrics && npm run generate:readme` and commit the result')
  }

  const hits = findRetiredValues(source)

  if (hits.length > 0) {
    failed = true
    console.error(`FAIL  ${hits.length} retired value(s) appear in README.md`)
    for (const hit of hits) {
      console.error(`      line ${hit.line}: ${hit.value}`)
      console.error(`        ${hit.why}`)
    }
  }

  if (failed) process.exit(1)

  const metrics = buildMetrics()
  console.log(
    `PASS  README claims block is current and carries no retired value ` +
      `(${metrics.panelRows} rows, ${metrics.countries} countries, r² ${metrics.r2})`,
  )
}

// Only when run as a script. Without this, importing the file to test its guards runs the whole
// check — which reads the built metrics and exits the process.
if (process.argv[1]?.endsWith('check_readme_metrics.ts')) main()
