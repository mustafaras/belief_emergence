/**
 * Verify that the current Data & Support route renders source-backed claims and the
 * canonical country-year support matrix accessibly at desktop and mobile widths.
 *
 * Requires a running Vite server and Chromium. The check is intentionally strict: a
 * missing server or browser is a failure, not a skipped verification.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright-core'

import { parsePanelCsvText } from '../src/data/panelDataLoader'
import { buildSupportMatrix } from '../src/sections/data/supportMatrix'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const PANEL_CSV = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv')
const PORT = process.env.RENDER_CHECK_PORT || '5199'
const BASE_PATH = process.env.ROUTE_CHECK_BASE || '/belief_emergence/'
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const failures: string[] = []

if (!fs.existsSync(PANEL_CSV)) throw new Error(`Canonical panel is missing: ${PANEL_CSV}`)
if (!fs.existsSync(CHROME)) throw new Error(`Chrome is missing at ${CHROME}; set CHROME_PATH`)

const panelRows = parsePanelCsvText(fs.readFileSync(PANEL_CSV, 'utf8'), PANEL_CSV)
const matrix = buildSupportMatrix(panelRows)
const constructAudit = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'src', 'data', 'analysis', 'wvs_construct_audit.json'), 'utf8')) as {
  respondentsScanned: number
  countryYears: number
  constructs: { Z_belief_outcome: { cellsEmitted: number } }
}
const integer = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
const expectedClaims = [
  { id: 'audit.respondents', label: 'Respondents scanned', value: integer(constructAudit.respondentsScanned), artifact: 'wvs_construct_audit.json' },
  { id: 'audit.countryYears', label: 'Country-years scanned', value: integer(constructAudit.countryYears), artifact: 'wvs_construct_audit.json' },
  { id: 'audit.Z.cells', label: 'Z construct cells', value: integer(constructAudit.constructs.Z_belief_outcome.cellsEmitted), artifact: 'wvs_construct_audit.json' },
  { id: 'data.panelRows', label: 'Canonical panel rows', value: integer(panelRows.length), artifact: 'panel_canonical_v2.csv' },
]

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const pageErrors: string[] = []
page.on('pageerror', error => pageErrors.push(error.message))

try {
  await page.goto(`http://127.0.0.1:${PORT}${BASE_PATH}?v=data`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  })
  await page.getByRole('heading', { level: 1, name: 'Data & Support' }).waitFor({ timeout: 45000 })
  await page.getByRole('img', { name: 'Canonical panel support by country and year' }).waitFor({ timeout: 45000 })

  const claimNodes = await page.locator('[data-claim-id]').evaluateAll(nodes => nodes.map(node => ({
    id: node.getAttribute('data-claim-id'),
    value: node.textContent?.trim() ?? '',
  })))
  for (const expected of expectedClaims) {
    const actual = claimNodes.find(node => node.id === expected.id)
    if (!actual) {
      failures.push(`missing rendered claim ${expected.id}`)
      continue
    }
    if (actual.value !== expected.value) {
      failures.push(`${expected.id} renders ${actual.value}, registry says ${expected.value}`)
    }

    await page.locator(`[data-claim-id="${expected.id}"]`).click()
    const dialog = page.getByRole('dialog', { name: 'Claim inspector' })
    await dialog.waitFor({ timeout: 10000 })
    const inspectorText = await dialog.innerText()
    if (!inspectorText.includes(expected.label) || !inspectorText.includes(expected.value) || !inspectorText.includes(expected.artifact)) {
      failures.push(`${expected.id} inspector does not show its registry label, value, and artifact`)
    }
    await dialog.getByRole('button', { name: 'Close popover' }).click()
    await dialog.waitFor({ state: 'detached', timeout: 10000 })
  }

  // Figure 1.2 is plotted from covariate_blocker_attribution.json. The check asserts
  // both series against the artifact, and asserts that the overlap is disclosed —
  // a figure that showed only the overlapping bars would invite the reader to add
  // them up, which is the defect this artifact exists to prevent.
  const attribution = JSON.parse(fs.readFileSync(
    path.join(REPO_ROOT, 'src', 'data', 'analysis', 'covariate_blocker_attribution.json'),
    'utf8',
  )) as {
    frame: { atRiskCells: number }
    exposure: { covariate: string; label: string; cells: number }[]
    firstFailure: { covariate: string; cells: number }[]
    exposureIsPartition: boolean
  }

  const figure12 = page.locator('main figure').filter({ has: page.getByRole('heading', { name: 'Which driver is short, and how often' }) })
  const figure12Text = await figure12.innerText()
  if (!figure12Text.includes('do not sum to') && !figure12Text.includes('must not be read as a partition')) {
    failures.push('Figure 1.2 does not disclose that the exposure counts overlap')
  }
  if (attribution.exposureIsPartition) {
    failures.push('artifact reports exposureIsPartition=true, but the manuscript sentence requires overlapping exposure')
  }
  const figure12Rows = await figure12.locator('table tbody tr').evaluateAll(rows =>
    rows.map(row => Array.from(row.querySelectorAll('td'), cell => cell.textContent?.trim() ?? '')),
  )
  for (const row of attribution.exposure) {
    const label = row.label
    const first = attribution.firstFailure.find(entry => entry.covariate === row.covariate)
    const rendered = figure12Rows.find(cells => cells[0]?.includes(label))
    if (!rendered) {
      failures.push(`Figure 1.2 has no row for covariate ${row.covariate} (${label})`)
      continue
    }
    if (!rendered.some(cell => cell === row.cells.toFixed(3))) {
      failures.push(`Figure 1.2 row ${row.covariate} does not carry its exposure count ${row.cells}`)
    }
    if (first && !rendered.some(cell => cell === first.cells.toFixed(3))) {
      failures.push(`Figure 1.2 row ${row.covariate} does not carry its first-failure count ${first.cells}`)
    }
  }
  if (!figure12Text.includes(String(attribution.frame.atRiskCells))) {
    failures.push(`Figure 1.2 does not state the at-risk total ${attribution.frame.atRiskCells}`)
  }
  if (await figure12.locator('[data-covariate], .support-blocker-table, .support-stage').count()) {
    failures.push('Figure 1.2 contains fabricated or obsolete blocker rows')
  }

  const group = page.getByRole('group', {
    name: 'Canonical panel support by country and year; scroll horizontally to inspect every year',
  })
  const actualTable = await group.locator('table').evaluate(table => ({
    headers: Array.from(table.querySelectorAll('thead th'), cell => cell.textContent?.trim() ?? ''),
    rows: Array.from(table.querySelectorAll('tbody tr'), row =>
      Array.from(row.querySelectorAll('td'), cell => cell.textContent?.trim() ?? ''),
    ),
  }))
  const expectedHeaders = ['Row', ...matrix.years.map(String)]
  if (actualTable.headers.length !== 35 || JSON.stringify(actualTable.headers) !== JSON.stringify(expectedHeaders)) {
    failures.push(`accessible heatmap has ${actualTable.headers.length} columns or a year order that differs from the canonical panel`)
  }
  if (actualTable.rows.length !== 83 || actualTable.rows.length !== matrix.countries.length) {
    failures.push(`accessible heatmap has ${actualTable.rows.length} country rows; canonical panel expects ${matrix.countries.length}`)
  }
  for (let rowIndex = 0; rowIndex < matrix.countries.length; rowIndex += 1) {
    const expectedRow = [matrix.countries[rowIndex].iso3, ...matrix.values[rowIndex].map(value => value === null ? 'Not observed' : 'Observed estimation row')]
    if (JSON.stringify(actualTable.rows[rowIndex]) !== JSON.stringify(expectedRow)) {
      failures.push(`accessible heatmap row ${matrix.countries[rowIndex].iso3} differs from the canonical country-year matrix`)
      break
    }
  }

  const scopeText = await page.locator('main figure').filter({ has: page.getByRole('heading', { name: 'Country × year estimation support' }) }).innerText()
  if (!scopeText.includes(`${matrix.countries.length} countries × ${matrix.years.length} calendar years`)) {
    failures.push('Figure 1.3 scope does not match the canonical matrix dimensions')
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  await group.evaluate(element => {
    element.scrollLeft = 0
    ;(element as HTMLElement).focus()
  })
  const mobileBefore = await page.evaluate(() => {
    const element = document.querySelector('[aria-label="Canonical panel support by country and year; scroll horizontally to inspect every year"]') as HTMLElement | null
    return {
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      scrollLeft: element?.scrollLeft ?? -1,
      clientWidth: element?.clientWidth ?? 0,
      scrollWidth: element?.scrollWidth ?? 0,
    }
  })
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(100)
  const mobileAfter = await page.evaluate(() => {
    const element = document.querySelector('[aria-label="Canonical panel support by country and year; scroll horizontally to inspect every year"]') as HTMLElement | null
    return element?.scrollLeft ?? -1
  })

  if (mobileBefore.viewportWidth !== 390 || mobileBefore.pageWidth > 390) {
    failures.push(`mobile page width ${mobileBefore.pageWidth} exceeds the 390px viewport`)
  }
  if (mobileBefore.scrollWidth <= mobileBefore.clientWidth) {
    failures.push('heatmap has no horizontal scrollable overflow on mobile')
  }
  if (mobileAfter <= mobileBefore.scrollLeft) {
    failures.push('ArrowRight did not move the focused heatmap scroll container')
  }
  if (pageErrors.length) failures.push(`uncaught page error: ${pageErrors[0]}`)

  console.log(
    `      rendered: ${expectedClaims.length} source-backed claims, Figure 1.2 caution, ` +
      `${actualTable.rows.length} countries × ${actualTable.headers.length - 1} years; ` +
      `mobile ${mobileBefore.pageWidth}/${mobileBefore.viewportWidth}px, ` +
      `heatmap scroll ${mobileBefore.scrollWidth}/${mobileBefore.clientWidth}px, keyboard ${mobileBefore.scrollLeft}→${mobileAfter}`,
  )
} finally {
  await browser.close()
}

if (failures.length) {
  console.error(`\nFAIL  Data & Support route (${failures.length} problem(s)):`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('PASS  Data & Support route matches the claim registry and canonical panel at desktop and mobile widths')
