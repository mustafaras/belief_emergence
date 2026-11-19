/**
 * Visual baselines: 11 routes × 2 viewports × 2 themes = 44 screenshots.
 *
 * Every other check in this repository asks a question about one property — does the text
 * overlap, is the contrast sufficient, does the number trace to an artifact. None of them can
 * answer "does this page still look like itself". A stylesheet edit that reorders a grid, a
 * padding change that collapses a section, or a font that fails to load all leave every one of
 * those checks passing and the page visibly wrong.
 *
 * The comparison uses the same decoder and the same tolerance as `check:surface-snapshot`:
 * a pixel counts as changed when any channel differs by more than 24, and the image fails when
 * more than 100 pixels change. Tight enough to catch a moved button, loose enough that
 * antialiasing on a different rasteriser does not fail the build.
 *
 * Usage:
 *   npm run generate:visual-baselines   (capture or re-capture the 44 images)
 *   npm run check:visual-baselines      (compare against them)
 *
 * Requires the Vite server (RENDER_CHECK_PORT, default 5199) and a local Chrome.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

import { decodePng } from './lib/png'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BASELINE_DIR = path.join(REPO_ROOT, 'tests', 'visual-baselines')
const PORT = process.env.RENDER_CHECK_PORT || '5199'
const BASE = `http://127.0.0.1:${PORT}/belief_emergence/`
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const CHANNEL_TOLERANCE = 24
const MAX_CHANGED_PIXELS = 100

/**
 * The route list is duplicated from `src/app/routes.ts` on purpose.
 *
 * A new route must not silently escape the baseline set, which is what importing the list
 * would allow: it would grow with the application and the baselines would quietly cover less
 * of it than they claim. A hardcoded list fails loudly instead — by the missing image.
 */
const ROUTES = [
  'overview',
  'data',
  'audit',
  'gates',
  'model',
  'evaluation',
  'limits',
  'countries',
  'geometry',
  'reproduce',
  'glossary',
] as const

const VIEWPORTS = [
  { id: '390', width: 390, height: 844 },
  { id: '1440', width: 1440, height: 900 },
] as const

const THEMES = ['light', 'dark'] as const

type Case = { route: string; viewport: string; theme: string; file: string }

const CASES: Case[] = ROUTES.flatMap((route) =>
  VIEWPORTS.flatMap((viewport) =>
    THEMES.map((theme) => ({
      route,
      viewport: viewport.id,
      theme,
      file: `${route}-${viewport.id}-${theme}.png`,
    })),
  ),
)

/**
 * Capture one case: a fixed 1600x2400 window at the top of the page.
 *
 * Three attempts bracket this, and each was caught by looking at the images rather than by the
 * script exiting zero.
 *
 *   1. Clamping a full-page capture to 2400px cut the Geometry route short — it is 2630px at
 *      1440 and 3682px at 390 — so the Capture A/B controls and the companion section were
 *      missing from a baseline that is meant to detect their regressions.
 *   2. Capturing the whole document is honest but 19.7 MB across 44 files; the Data route alone
 *      is 7888px tall on a phone. That is not a set anyone will review, and reviewing it is the
 *      point.
 *   3. Downscaling to half saved only a third of the bytes and blurred the thing being compared.
 *
 * So the baseline is a fixed window rather than the document. What that costs is stated
 * plainly instead of hidden: content below 2400px is **not** covered by these images. It is
 * covered by `check:layout`, which walks every route at three viewports, and by the e2e
 * journeys, which scroll to the sections they assert on. What the screenshots uniquely catch is
 * the class of regression those cannot name — a heading that moved, a card that lost its
 * border, a chart that stopped drawing — and that class shows up in the first screens.
 */
async function capture(browser: Awaited<ReturnType<typeof chromium.launch>>, item: Case): Promise<Buffer> {
  const viewport = VIEWPORTS.find((entry) => entry.id === item.viewport)
  if (!viewport) throw new Error(`unknown viewport ${item.viewport}`)

  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: item.theme,
    // A fixed device pixel ratio keeps the raster identical between runs on one machine.
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  try {
    await page.goto(`${BASE}?v=${item.route}`, { waitUntil: 'networkidle', timeout: 60000 })
    /*
     * Settle deterministically before the capture.
     *
     * A fixed timeout was not enough under load: running the 44 captures back to back, the
     * Countries route produced two variants across three runs, while the same combination
     * repeated in isolation was identical five times out of five. The difference is the web
     * fonts — they are fetched once per context, and a page that paints before they arrive
     * lays out in the fallback face and shifts when they land.
     *
     * `document.fonts.ready` waits for the font set the page actually uses, which is the
     * event a timeout was approximating. The timeout stays as a floor because chart canvases
     * (Plotly, the evaluation strips) paint on the next frames after fonts resolve.
     */
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(item.route === 'geometry' ? 3500 : 1200)
    // One more frame after the last paint, so the capture is of the settled document.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    // A fixed window, not `fullPage`: see the note on this function. `clip` keeps the capture
    // identical in size across routes, which is also what makes a dimension mismatch meaningful.
    return await page.screenshot({
      clip: { x: 0, y: 0, width: viewport.width, height: Math.min(2400, viewport.height * 3) },
    })
  } finally {
    await context.close()
  }
}

function diff(expected: Buffer, actual: Buffer): { changed: number; dimensionsMatch: boolean; expectedSize: string; actualSize: string } {
  const a = decodePng(expected)
  const b = decodePng(actual)
  if (a.width !== b.width || a.height !== b.height) {
    return {
      changed: -1,
      dimensionsMatch: false,
      expectedSize: `${a.width}x${a.height}`,
      actualSize: `${b.width}x${b.height}`,
    }
  }
  let changed = 0
  for (let i = 0; i < a.rgba.length; i += 4) {
    for (let channel = 0; channel < 4; channel += 1) {
      if (Math.abs(a.rgba[i + channel] - b.rgba[i + channel]) > CHANNEL_TOLERANCE) {
        changed += 1
        break
      }
    }
  }
  return { changed, dimensionsMatch: true, expectedSize: `${a.width}x${a.height}`, actualSize: `${b.width}x${b.height}` }
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write')

  if (write) {
    if (!existsSync(BASELINE_DIR)) mkdirSync(BASELINE_DIR, { recursive: true })
    const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
    try {
      for (const item of CASES) {
        const png = await capture(browser, item)
        writeFileSync(path.join(BASELINE_DIR, item.file), png)
        const decoded = decodePng(png)
        console.log(`  wrote ${item.file}  ${decoded.width}x${decoded.height}  ${Math.round(png.length / 1024)} KiB`)
      }
    } finally {
      await browser.close()
    }
    // A stale image left behind by a renamed route would be compared against nothing and
    // never fail; the set is verified to be exactly the expected files.
    const orphans = readdirSync(BASELINE_DIR)
      .filter((file) => file.endsWith('.png'))
      .filter((file) => !CASES.some((item) => item.file === file))
    if (orphans.length > 0) {
      console.error(`FAIL  ${orphans.length} baseline(s) do not correspond to a case: ${orphans.join(', ')}`)
      process.exit(1)
    }
    console.log(`\nwrote ${CASES.length} baselines to tests/visual-baselines/`)
    return
  }

  /*
   * The baselines are captured on macOS, and text rasterisation differs by platform. Comparing
   * them on Linux would fail on every run for a reason that is not a defect — which is exactly
   * what happened in CI: the gate has a `process.platform === 'darwin'` branch, but both of its
   * branches were identical, so the check ran everywhere.
   *
   * SKIP, not PASS: a skip is reported distinctly by the gate and does not count as a pass.
   */
  if (process.platform !== 'darwin') {
    console.log(
      `SKIP  visual baselines were captured on macOS; comparison is not meaningful on ${process.platform}`,
    )
    return
  }

  // Compare mode. A missing directory or a partial set is a SKIP, not a pass: the baselines
  // are generated on macOS and a fresh clone has none until they are regenerated.
  if (!existsSync(BASELINE_DIR)) {
    console.log('SKIP  no visual baselines committed; run `npm run generate:visual-baselines` on macOS')
    return
  }
  const missing = CASES.filter((item) => !existsSync(path.join(BASELINE_DIR, item.file)))
  if (missing.length === CASES.length) {
    console.log('SKIP  no visual baselines committed; run `npm run generate:visual-baselines` on macOS')
    return
  }
  if (missing.length > 0) {
    console.error(`FAIL  ${missing.length} of ${CASES.length} baselines are missing: ${missing.map((item) => item.file).join(', ')}`)
    process.exit(1)
  }

  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
  const failures: string[] = []
  try {
    for (const item of CASES) {
      const expected = readFileSync(path.join(BASELINE_DIR, item.file))
      const actual = await capture(browser, item)
      const result = diff(expected, actual)
      if (!result.dimensionsMatch) {
        failures.push(`${item.file}: ${result.actualSize} captured, ${result.expectedSize} expected`)
        writeFileSync(path.join(BASELINE_DIR, `..`, `${item.file}.actual.png`), actual)
        continue
      }
      if (result.changed > MAX_CHANGED_PIXELS) {
        failures.push(`${item.file}: ${result.changed} pixels changed (limit ${MAX_CHANGED_PIXELS})`)
        writeFileSync(path.join(BASELINE_DIR, '..', `${item.file}.actual.png`), actual)
      }
    }
  } finally {
    await browser.close()
  }

  if (failures.length === 0) {
    console.log(
      `PASS  ${CASES.length} visual baselines match within ${MAX_CHANGED_PIXELS} pixels ` +
        `(channel tolerance ${CHANNEL_TOLERANCE})`,
    )
    return
  }
  console.error(`FAIL  ${failures.length} of ${CASES.length} visual baselines differ`)
  for (const failure of failures) console.error(`      ${failure}`)
  console.error('      the captures were written beside the baselines as *.actual.png')
  process.exit(1)
}

main().catch((error) => {
  console.error('FAIL  the visual baseline check could not run')
  console.error(error)
  process.exit(1)
})
