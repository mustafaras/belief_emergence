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
]

/**
 * Lines where a forbidden value is correct and must stay.
 *
 * A check with no exemptions forces the documentation to forget its own history; a check
 * with quiet ones is how the last set of numbers survived. Both are named here.
 */
const ALLOWED_CONTEXT = [
  /8f5c06b/,                       // historical note: where the v1 panel still lives
  /Lighthouse/,                    // performance scores, a different measure
  /\|\s*100\/100\s*\|/,            // a table cell, i.e. a Lighthouse category score
]

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

  const lines = source.split('\n')
  const hits: Array<{ line: number; value: string; why: string }> = []
  lines.forEach((text, index) => {
    if (ALLOWED_CONTEXT.some((allowed) => allowed.test(text))) return
    for (const { pattern, why } of FORBIDDEN) {
      if (pattern.test(text)) {
        hits.push({ line: index + 1, value: text.trim().slice(0, 120), why })
        break
      }
    }
  })

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

main()
