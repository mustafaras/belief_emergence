/**
 * The surface renders pixel-identically to the recorded baseline.
 *
 * Prompt 9's acceptance condition for decomposing `Surface3DSurface.tsx` is not "it looks
 * right" — it is "a snapshot of the rendered surface before and after the refactor is
 * pixel-identical". This is that test.
 *
 * WHY A BROWSER AND A STORED IMAGE
 * --------------------------------
 * The component draws through Plotly into a canvas. Nothing about that output can be
 * asserted from the source: a moved helper, a changed constant or a reordered effect
 * changes the picture without changing any value a unit test can read. The baseline was
 * captured from the component *before* any extraction and is committed alongside this
 * file; the comparison is a byte comparison of the PNG, so a single altered pixel fails.
 *
 * The screenshot is deterministic here — captured twice from the same build, byte-identical
 * — which is what makes it usable as an acceptance test rather than a source of flaky
 * failures.
 *
 * Skips (exit 0 with a SKIP line) when no browser or server is available, the same contract
 * as the other browser checks. In CI the browser is installed by the workflow and `ci:gate`
 * reports SKIP distinctly from PASS, so a skip is never mistaken for a pass.
 *
 * Usage:  npm run check:surface-snapshot
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BASELINE = path.join(REPO_ROOT, 'tests', 'fixtures', 'surface-baseline.png')
const PORT = process.env.RENDER_CHECK_PORT || '5199'
const BASE_URL = process.env.SURFACE_BASE_URL || `http://localhost:${PORT}/belief_emergence/`

async function main(): Promise<void> {
  const { chromium } = (await import('playwright-core')) as typeof import('playwright-core')
  const chromePath =
    process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

  if (!fs.existsSync(chromePath)) {
    console.log(`SKIP  no Chrome at ${chromePath}; set CHROME_PATH to enable the surface snapshot`)
    return
  }
  if (!fs.existsSync(BASELINE)) {
    console.log(`SKIP  no baseline at ${path.relative(REPO_ROOT, BASELINE)}`)
    return
  }

  const browser = await chromium.launch({ executablePath: chromePath, headless: true })
  let captured: Buffer

  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      // A device pixel ratio other than 1 changes the rasterisation and would fail the
      // comparison for a reason unrelated to the code.
      deviceScaleFactor: 1,
    })
    const page = await context.newPage()

    try {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    } catch (e) {
      console.log(
        `SKIP  no server at ${BASE_URL} (${(e as Error).message.split('\n')[0].slice(0, 70)})`,
      )
      await browser.close()
      return
    }

    await page.waitForTimeout(9000)

    // The surface is behind a toggle now, so a snapshot has to turn it on explicitly.
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) =>
        /3D SURFACE/i.test((b as HTMLElement).innerText),
      )
      if (button) (button as HTMLButtonElement).click()
    })
    await page.waitForTimeout(12000)

    const plot = await page.$('.js-plotly-plot')
    if (!plot) {
      console.error('FAIL  the 3D surface did not render; the snapshot has nothing to compare')
      await browser.close()
      process.exit(1)
    }

    const box = await plot.boundingBox()
    if (!box) {
      console.error('FAIL  the 3D surface has no bounding box')
      await browser.close()
      process.exit(1)
    }

    captured = await page.screenshot({ clip: box })
  } finally {
    await browser.close()
  }

  const expected = fs.readFileSync(BASELINE)
  const hash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex').slice(0, 16)

  if (captured.equals(expected)) {
    console.log(
      `PASS  surface renders pixel-identically to the baseline ` +
        `(${expected.length} bytes, sha256:${hash(expected)})`,
    )
    return
  }

  // Write the mismatch beside the baseline so the difference can be inspected rather than
  // described.
  const actualPath = path.join(REPO_ROOT, 'tests', 'fixtures', 'surface-actual.png')
  fs.writeFileSync(actualPath, captured)

  console.error('FAIL  the surface no longer renders identically to the baseline')
  console.error(`      expected ${expected.length} bytes (sha256:${hash(expected)})`)
  console.error(`      captured ${captured.length} bytes (sha256:${hash(captured)})`)
  console.error(`      wrote the capture to ${path.relative(REPO_ROOT, actualPath)}`)
  process.exit(1)
}

await main()
