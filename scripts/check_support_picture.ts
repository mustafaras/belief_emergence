/**
 * Does the support picture say what the artifacts say?
 *
 * Prompt 4 asks for three things, and each has a failure mode worth naming:
 *
 *   1. rendered totals equal the artifact totals — retyping 167 or 54.8% survives because
 *      the number looks plausible;
 *   2. the percentage is computed, not written — `207 / 305` must be visible as arithmetic;
 *   3. no cause the artifacts do not support — the panel may only name a binding
 *      constraint when the audit attributes losses to individual covariates.
 *
 * The third is why `missingByCovariate` exists. Before it was written by the panel
 * builder, `missingCovariate: 61` said 61 cells were lost to *some* covariate; naming
 * Gini as the constraint would have been invention. The prompt's own figures (Gini 94,
 * education 82, …) are not in any artifact and do not reconcile with the 61 total, so
 * they are not reproduced here.
 *
 * Usage:  npm run check:support-picture
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildSupportPicture,
  type PanelAudit,
} from '../src/verification/supportPicture'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const PANEL_AUDIT = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.audit.json')
const CONSTRUCT_AUDIT = path.join(REPO_ROOT, 'src', 'data', 'analysis', 'wvs_construct_audit.json')

const failures: string[] = []

for (const [label, file] of [
  ['panel audit', PANEL_AUDIT],
  ['construct audit', CONSTRUCT_AUDIT],
] as const) {
  if (!fs.existsSync(file)) {
    console.error(`FAIL  ${label} missing at ${path.relative(REPO_ROOT, file)}`)
    process.exit(1)
  }
}

const panel = JSON.parse(fs.readFileSync(PANEL_AUDIT, 'utf8')) as PanelAudit
const constructs = JSON.parse(fs.readFileSync(CONSTRUCT_AUDIT, 'utf8')) as {
  respondentsScanned?: number
  countryYears?: number
  constructs: Record<string, { cellsEmitted: number }>
}

const picture = buildSupportPicture(panel, {
  respondentsScanned: constructs.respondentsScanned,
  countryYears: constructs.countryYears,
  zComputableCells: constructs.constructs?.Z_belief_outcome?.cellsEmitted,
})

/* ---- 1. the arithmetic closes ---- */
if (!picture.reconciles) {
  failures.push(
    `scanned (${picture.scannedCountryYears}) minus recorded losses does not equal ` +
      `complete cases (${picture.completeCases})`,
  )
}

/* ---- 2. the per-covariate attribution is consistent with the total ---- */
const attributed = picture.blockers.reduce((sum, b) => sum + b.cells, 0)
if (attributed !== picture.covariateDropouts) {
  failures.push(
    `per-covariate attribution sums to ${attributed} but the audit records ` +
      `${picture.covariateDropouts} cells lost to a missing covariate`,
  )
}

/* ---- 3. exactly one binding constraint, and it is the largest ---- */
const bindingRows = picture.blockers.filter((b) => b.binding)
if (picture.blockers.length > 0) {
  if (bindingRows.length !== 1) {
    failures.push(`expected exactly one binding constraint, found ${bindingRows.length}`)
  }
  const largest = [...picture.blockers].sort((a, b) => b.cells - a.cells)[0]
  if (bindingRows[0] && bindingRows[0].covariate !== largest.covariate) {
    failures.push(
      `binding constraint is ${bindingRows[0].covariate} but ${largest.covariate} blocks more cells`,
    )
  }
}

/* ---- 4. the utilisation figure matches the two counts it is made of ---- */
const expectedUtilisation = picture.completeCases / picture.scannedCountryYears
if (Math.abs(picture.frameUtilisation - expectedUtilisation) > 1e-12) {
  failures.push(
    `frame utilisation ${picture.frameUtilisation} is not ${picture.completeCases}/${picture.scannedCountryYears}`,
  )
}

/* ---- 5. no stale figure survives ---- */
const STALE = ['54.8', '167 complete', 'Gini 94', 'education 82']
for (const stale of STALE) {
  if (JSON.stringify(picture).includes(stale)) {
    failures.push(`the support picture still carries a stale figure: ${stale}`)
  }
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

  const port = process.env.RENDER_CHECK_PORT || '5199'
  const browser = await chromium.launch({ executablePath: chromePath, headless: true })
  const page = await browser.newPage()
  try {
    await page.goto(`http://localhost:${port}/belief_emergence/`, {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    })
    await page.waitForTimeout(11000)
  } catch (e) {
    console.log(
      `SKIP  rendered assertions: no dev server on port ${port} (${(e as Error).message.slice(0, 60)})`,
    )
    await browser.close()
    return
  }

  const rendered = await page.evaluate(() => {
    const stages = [...document.querySelectorAll('.support-stage')].map((s) => ({
      id: s.getAttribute('data-stage') ?? '',
      value: (s.querySelector('.support-stage-value') as HTMLElement | null)?.innerText ?? '',
    }))
    const blockers = [...document.querySelectorAll('.support-blocker-table tbody tr')].map((t) => ({
      covariate: t.getAttribute('data-covariate') ?? '',
      binding: t.getAttribute('data-binding') === 'true',
      cells: Number((t.children[1] as HTMLElement).innerText.replace(/[^0-9]/g, '')),
    }))
    return {
      stages,
      blockers,
      utilisationText: (document.querySelector('.support-utilisation') as HTMLElement | null)?.innerText ?? '',
      reconciles: document.querySelector('.support-reconciliation')?.getAttribute('data-reconciles'),
      bodyText: document.body.innerText,
    }
  })

  await browser.close()

  const byId = new Map(rendered.stages.map((s) => [s.id, Number(s.value.replace(/[^0-9]/g, ''))]))
  if (byId.get('scanned') !== picture.scannedCountryYears) {
    failures.push(`rendered scanned total ${byId.get('scanned')}, artifact says ${picture.scannedCountryYears}`)
  }
  if (byId.get('complete') !== picture.completeCases) {
    failures.push(`rendered complete cases ${byId.get('complete')}, artifact says ${picture.completeCases}`)
  }
  if (picture.respondents > 0 && byId.get('respondents') !== picture.respondents) {
    failures.push(`rendered respondents ${byId.get('respondents')}, artifact says ${picture.respondents}`)
  }

  // The percentage must be shown as arithmetic on the two counts, not as a bare figure.
  const expectedPct = (picture.frameUtilisation * 100).toFixed(1)
  if (!rendered.utilisationText.includes(expectedPct)) {
    failures.push(`utilisation text does not contain ${expectedPct}%`)
  }
  if (!rendered.utilisationText.includes(String(picture.completeCases))) {
    failures.push('utilisation text does not show the numerator it is computed from')
  }
  if (!rendered.utilisationText.includes(String(picture.scannedCountryYears))) {
    failures.push('utilisation text does not show the denominator it is computed from')
  }

  if (rendered.reconciles !== 'true') {
    failures.push('the rendered panel reports that the audit does not reconcile')
  }

  const renderedBinding = rendered.blockers.filter((b) => b.binding)
  if (renderedBinding.length !== 1) {
    failures.push(`rendered ${renderedBinding.length} binding constraints, expected 1`)
  }

  for (const stale of STALE) {
    if (rendered.bodyText.includes(stale)) {
      failures.push(`the rendered page still carries a stale figure: ${stale}`)
    }
  }

  console.log(
    `      rendered: ${rendered.stages.length} stages, ${rendered.blockers.length} blockers, ` +
      `utilisation ${expectedPct}%, reconciles ${rendered.reconciles}`,
  )
}

await checkRendered()

if (failures.length > 0) {
  console.error(`\nFAIL  support picture (${failures.length} problem(s)):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

const binding = picture.blockers.find((b) => b.binding)
console.log(
  `PASS  support picture: ${picture.respondents.toLocaleString('en-US')} respondents -> ` +
    `${picture.scannedCountryYears} country-years -> ${picture.completeCases} complete cases ` +
    `(${(picture.frameUtilisation * 100).toFixed(1)}% of frame); binding constraint ` +
    `${binding?.covariate ?? 'none'} at ${binding?.cells ?? 0} cells`,
)
