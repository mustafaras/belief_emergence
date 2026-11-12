/**
 * Does the rendered construct audit say what the artifact says?
 *
 * Prompt 3 gives three assertions, and they exist because the table has one trap in it:
 * `S_social_support` carries `cronbachAlpha: 0.753` beside `cellsEmitted: 0` and
 * `computable: false`. Printing that alpha shows a reliability figure above the floor for
 * a construct with no observations — a reader would take it as a pass, which is the
 * opposite of the paper's claim.
 *
 *   1. rendered row count == construct count in the artifact;
 *   2. the S row says "not computable" and does not contain the leftover alpha anywhere;
 *   3. every non-retained construct names a reason.
 *
 * The third assertion is checked against the artifact rather than the DOM alone, so a row
 * that renders a verdict with an empty explanation fails here rather than looking fine.
 *
 * Usage:  npm run check:construct-audit
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildConstructRows,
  RELIABILITY_FLOOR,
  requiredItems,
  summarise,
  type AuditArtifact,
  type ItemAvailability,
} from '../src/verification/constructAudit'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const AUDIT_PATH = path.join(REPO_ROOT, 'src', 'data', 'analysis', 'wvs_construct_audit.json')
const AVAILABILITY_PATH = path.join(
  REPO_ROOT,
  'src',
  'data',
  'analysis',
  'construct_item_availability.json',
)

/** The value that must never appear on a row whose construct emitted no cells. */
const LEFTOVER_ALPHA = '0.753'

const failures: string[] = []

/* ---- artifact-level assertions, independent of any browser ---- */
if (!fs.existsSync(AUDIT_PATH)) {
  console.error(`FAIL  ${path.relative(REPO_ROOT, AUDIT_PATH)} is missing`)
  process.exit(1)
}

const artifact = JSON.parse(fs.readFileSync(AUDIT_PATH, 'utf8')) as AuditArtifact

if (!fs.existsSync(AVAILABILITY_PATH)) {
  console.error(`FAIL  ${path.relative(REPO_ROOT, AVAILABILITY_PATH)} is missing`)
  process.exit(1)
}
const availability = (
  JSON.parse(fs.readFileSync(AVAILABILITY_PATH, 'utf8')) as {
    constructs: Record<string, ItemAvailability>
  }
).constructs

const rows = buildConstructRows(artifact, availability)
const summary = summarise(rows)

if (rows.length !== Object.keys(artifact.constructs).length) {
  failures.push(
    `built ${rows.length} rows for ${Object.keys(artifact.constructs).length} constructs`,
  )
}

for (const row of rows) {
  if (row.verdict !== 'retained' && row.reason.trim().length <= 20) {
    failures.push(`${row.id}: verdict "${row.verdict}" carries no usable reason`)
  }
  if (row.verdict === 'uncomputable' && row.alpha !== null) {
    failures.push(`${row.id}: uncomputable row exposes an alpha (${row.alpha})`)
  }
}

const sRow = rows.find((r) => r.id === 'S_social_support')
if (!sRow) {
  failures.push('S_social_support is missing from the audit')
} else {
  if (sRow.verdict !== 'uncomputable') {
    failures.push(`S_social_support verdict is "${sRow.verdict}", expected "uncomputable"`)
  }
  if (sRow.alpha !== null) {
    failures.push('S_social_support exposes an alpha despite emitting no cells')
  }
  if (!sRow.suppressedAlpha) {
    failures.push(
      'S_social_support carries a leftover alpha that is not marked as suppressed — a ' +
        'renderer could print it',
    )
  }

  // The reason must describe the real shortfall, not infer one from an empty itemsUsed.
  // Reporting "7 of 7 items unavailable" when four are absent states a different fact.
  const sAvailability = availability.S_social_support
  if (sAvailability) {
    const absent = sAvailability.absentItems.length
    const available = sAvailability.availableItems.length
    if (absent !== 4) {
      failures.push(`S_social_support: expected 4 absent items, artifact records ${absent}`)
    }
    if (!sRow.reason.includes(`${absent} of ${sRow.itemsConfigured}`)) {
      failures.push(
        `S_social_support reason does not state "${absent} of ${sRow.itemsConfigured}" ` +
          `— a reason that claims every item is missing misreports the audit`,
      )
    }
    if (!sRow.reason.includes(`requires ${requiredItems(sRow.itemsConfigured)}`)) {
      failures.push('S_social_support reason does not name the coverage floor it fails')
    }
    for (const item of sAvailability.absentItems) {
      if (!sRow.reason.includes(item)) {
        failures.push(`S_social_support reason omits the absent item ${item}`)
      }
    }
    if (available !== 3) {
      failures.push(`S_social_support: expected 3 available items, artifact records ${available}`)
    }
  }

}

/** The paper's headline: three of four fail. */
if (summary.total !== 4 || summary.retained !== 1) {
  failures.push(
    `expected 4 constructs with 1 retained, got ${summary.total} with ${summary.retained}`,
  )
}
if (Math.abs(summary.failureRate - 0.75) > 1e-9) {
  failures.push(`failure rate is ${summary.failureRate}, expected 0.75`)
}

/* ---- rendered assertions ---- */
async function checkRendered(): Promise<void> {
  const { chromium } = (await import('playwright-core')) as typeof import('playwright-core')
  const chromePath =
    process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (!fs.existsSync(chromePath)) {
    console.log(`SKIP  rendered assertions: no Chrome at ${chromePath}`)
    return
  }

  const browser = await chromium.launch({ executablePath: chromePath, headless: true })
  const page = await browser.newPage()
  const port = process.env.RENDER_CHECK_PORT || '5199'
  try {
    await page.goto(`http://localhost:${port}/belief_emergence/`, {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    })
    await page.waitForTimeout(9000)
  } catch (e) {
    console.log(`SKIP  rendered assertions: no dev server on port ${port} (${(e as Error).message.slice(0, 60)})`)
    await browser.close()
    return
  }

  const rendered = await page.evaluate(() => {
    const tableRows = [...document.querySelectorAll('.construct-audit-table tbody tr')]
    const s = tableRows.find((r) => r.getAttribute('data-construct') === 'S_social_support')
    const nonRetained = tableRows.filter(
      (r) => r.getAttribute('data-verdict') !== 'retained',
    )
    return {
      rowCount: tableRows.length,
      sText: s ? (s as HTMLElement).innerText : '',
      nonRetainedCount: nonRetained.length,
      scopeText: (document.querySelector('.construct-audit-scope') as HTMLElement | null)?.innerText ?? '',
      nonRetainedWithReason: nonRetained.filter((r) => {
        const cells = [...r.children]
        const last = cells[cells.length - 1] as HTMLElement
        return last && last.innerText.trim().length > 20
      }).length,
      pageHasLeftoverAlpha: new RegExp('0\\.753').test(document.body.innerText),
    }
  })

  await browser.close()

  if (rendered.rowCount !== rows.length) {
    failures.push(`rendered ${rendered.rowCount} rows, artifact has ${rows.length} constructs`)
  }
  if (!/not computable/i.test(rendered.sText)) {
    failures.push('the S_social_support row does not say "not computable"')
  }
  if (rendered.sText.includes(LEFTOVER_ALPHA)) {
    failures.push(`the S_social_support row prints the leftover alpha ${LEFTOVER_ALPHA}`)
  }
  if (rendered.pageHasLeftoverAlpha) {
    failures.push(`${LEFTOVER_ALPHA} appears somewhere on the page`)
  }
  // The audit tests four constructs; the paper reports three of eight proposed channels.
  // Those are different counts, and the interface must reconcile them rather than let a
  // reader compare 3/4 with 3/8 and conclude one of the two is wrong.
  for (const phrase of ['Eight', 'four', 'not estimated']) {
    if (!rendered.scopeText.toLowerCase().includes(phrase.toLowerCase())) {
      failures.push(`the audit scope note does not mention "${phrase}"`)
    }
  }

  if (rendered.nonRetainedWithReason !== rendered.nonRetainedCount) {
    failures.push(
      `${rendered.nonRetainedCount - rendered.nonRetainedWithReason} non-retained row(s) render no reason`,
    )
  }

  console.log(
    `      rendered: ${rendered.rowCount} rows, ${rendered.nonRetainedCount} not retained, ` +
      `all with reasons`,
  )
}

await checkRendered()

if (failures.length > 0) {
  console.error(`\nFAIL  construct audit (${failures.length} problem(s)):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

console.log(
  `PASS  construct audit: ${summary.total} constructs, ${summary.retained} retained, ` +
    `${summary.withdrawn} withdrawn, ${summary.uncomputable} uncomputable ` +
    `(failure rate ${(summary.failureRate * 100).toFixed(0)}%, floor ${RELIABILITY_FLOOR.toFixed(2)})`,
)
