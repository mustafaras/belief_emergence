/**
 * Capture the UI screenshots the README shows.
 *
 * The fourteen PNGs under `figures/screenshots/` are from the v1 interface: the dashboard
 * shot still prints `Panel N = 630`, a `3D SURFACE OFF` toggle, and an `EXPORT PDF` button —
 * none of which exist in the rebuilt application. The README displays thirteen of them, so
 * the repository's front page has been showing a retired product.
 *
 * This script drives the real application and writes the same filenames, so the README needs
 * no edit. What it does **not** do is invent a picture for a caption that no longer has a
 * subject. Three of the fourteen described panels the rebuild removed — the amplifiers and
 * suppressors panels (withdrawn constructs) and the AI interpreter (endpoint deleted) — so
 * those images and their README blocks were removed, and `figures/screenshots/` now holds
 * only pictures of the application that exists. That is a human decision, recorded in
 * `docs/APP_V2_LOG.md`, not something a script should silently decide.
 *
 * Usage:
 *   npm run generate:paper-figures            (writes figures/screenshots/*.png)
 *   npm run generate:paper-figures -- --check (fails if any caption has no subject)
 *
 * Requires a running dev server; `RENDER_CHECK_PORT` selects the port.
 */
import { chromium, type Browser, type Page } from 'playwright'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT_DIR = path.join(REPO_ROOT, 'figures', 'screenshots')
const README = path.join(REPO_ROOT, 'README.md')
const PORT = process.env.RENDER_CHECK_PORT ?? '5173'
const BASE = `http://127.0.0.1:${PORT}/belief_emergence/`
const CHROME = process.env.CHROME_PATH

/** A file the README displays, and the view that now shows its subject. */
export type FigureSpec = {
  /** Filename under figures/screenshots/, unchanged so the README needs no edit. */
  file: string
  /** The caption the README prints, so a mismatch is visible in review. */
  caption: string
  /** Query string of the route to capture, including any state. */
  query: string
  /** Where on the page the subject is, so the shot frames it rather than the whole page. */
  focus?: { selector: string; pad?: number }
  /** Full-page capture when the subject is the page itself. */
  fullPage?: boolean
  /**
   * Interactions to perform before capturing.
   *
   * `figure_8` documents the A/B comparison, whose difference table does not exist until two
   * configurations have been captured. Photographing the page without pressing the buttons
   * produced a blank 2 KiB PNG of an empty container — a figure that looks like a rendering
   * failure rather than a missing prerequisite.
   */
  actions?: Array<
    | { role: 'button' | 'tab'; name: RegExp | string }
    /**
     * Move one slider, by its label prefix, to an absolute value.
     *
     * A page navigation would reload the route and discard the first capture, so the A/B
     * figure cannot be built by changing the URL between the two clicks. Driving the slider
     * keeps the component's state alive, which is what makes the difference table appear.
     */
    | { slider: string; value: number }
  >
  /**
   * Trim uniform margins from the captured image.
   *
   * The Plotly container is 34rem tall and the scene is drawn in the middle of it; capturing
   * the container gives a figure that is two-thirds white. Trimming the empty border is a
   * crop of nothing, so it cannot misrepresent the content.
   */
  trim?: boolean
  /**
   * Cap the captured height.
   *
   * An element screenshot of a scrollable region captures its full scroll height: the country
   * table came out 1,916 by 8,496 — every one of 83 rows, unreadable inline. A figure shows
   * what the reader would see, so the capture is clipped to the viewport.
   */
  maxHeight?: number
  /**
   * Scroll the region before capturing it, when its content is wider than the container.
   *
   * The country table is wider than a 1440px viewport; its left columns were clipped and the
   * heading read "eometry" instead of the page title. Scrolling to the start is what makes the
   * capture show the figure from its beginning.
   */
  scrollToStart?: boolean
  /** Viewport width; wide shots need room for a table, narrow ones read better cropped. */
  width?: number
  height?: number
  /**
   * Set when the caption describes something the rebuild removed. The capture is skipped and
   * reported, because a picture of the nearest surviving page would misrepresent the caption.
   */
  noSubject?: string
}

/**
 * The mapping, read against the captions in README.md.
 *
 * The file names are historical and kept deliberately: renaming them would mean editing
 * thirteen `<img src>` lines and the manuscript's figure list for no gain. What changed is
 * which page each one shows.
 */
export const FIGURES: FigureSpec[] = [
  {
    file: 'figure_7_ui_dashboard.png',
    caption: 'Dashboard overview — the landing route with the paper argument',
    query: '?v=overview',
    fullPage: false,
    width: 1600,
    height: 1000,
  },
  {
    file: 'figure_A4_ui_screenshot_1.png',
    caption: 'Quick start view — Data & Support with the attrition funnel',
    query: '?v=data',
    fullPage: true,
    width: 1440,
    height: 1000,
  },
  {
    file: 'figure_A5_ui_screenshot_2.png',
    caption: 'Interactive visual analytics — the fitted response surface',
    query: '?v=geometry',
    focus: { selector: '.js-plotly-plot', pad: 24 },
    trim: true,
    width: 1440,
    height: 1000,
  },
  {
    file: 'figure_9_ui_presets.png',
    caption: 'Country table — sortable per-country alignment with residuals',
    query: '?v=countries',
    focus: { selector: 'table', pad: 16 },
    maxHeight: 900,
    // The table is wider than a 1440px viewport, so the page scrolls horizontally and the
    // capture began mid-column — the page heading read "eometry". Resizing the viewport fixes
    // the cause; resetting the element's own scrollLeft did not, because the scrolling
    // ancestor is the document.
    width: 2000,
    height: 1000,
  },
  {
    file: 'figure_8_ui_pinned_inspection.png',
    caption: 'A/B scenario comparison — two captured configurations and their difference',
    // Two configurations that differ. Capturing the same state twice produced a table whose
    // every Δ was +0.000 — accurate and useless as a figure. Changing the URL between the
    // clicks does not work either: navigation remounts the section and the first capture is
    // lost. The sliders are moved in place instead, so both snapshots share one page.
    query: '?v=geometry&X=0.2&Y=-1.0',
    actions: [
      { role: 'button', name: /^Capture A$/ },
      { slider: 'X', value: 0.9 },
      { slider: 'Y', value: 5 },
      { role: 'button', name: /^Capture B$/ },
    ],
    // The difference table is smaller than the heatmap's accessible table, so "largest
    // match" picks the wrong one. A caption-specific selector is the honest way to say what
    // the figure is.
    focus: { selector: 'table:has(caption:text-matches("Difference between capture"))', pad: 16 },
    width: 1440,
    height: 1100,
  },
  {
    file: 'figure_A6_ui_screenshot_3.png',
    caption: 'URL state persistence — a shared link reproducing the geometry view',
    query: '?v=geometry&X=0.62&Y=0.40&iso=EST',
    fullPage: false,
    width: 1440,
    height: 1000,
  },
  {
    file: 'figure_A7_ui_screenshot_4.png',
    caption: 'Export & reporting — the evidence bundle downloaded from the header',
    query: '?v=reproduce',
    fullPage: true,
    width: 1440,
    height: 1000,
  },
  {
    file: 'figure_A9_belief_equation_panel.png',
    caption: 'Field expansion — Φ term map with identified and withdrawn channels',
    query: '?v=model',
    focus: { selector: '[role="table"], table', pad: 16 },
    width: 1440,
    height: 1100,
  },
  {
    file: 'figure_A10_core_variables_panel.png',
    caption: 'Core variables — X and Y across their realised ranges',
    query: '?v=data',
    focus: { selector: '[role="img"]', pad: 20 },
    maxHeight: 900,
    scrollToStart: true,
    width: 1440,
    height: 1000,
  },
  {
    file: 'figure_A13_mathematical_analysis_panel.png',
    caption: 'Coefficient diagnostics — VIF table and the collinearity case',
    query: '?v=limits',
    focus: { selector: 'table', pad: 16 },
    width: 1440,
    height: 1100,
  },
  {
    file: 'figure_A14_system_dynamics_panel.png',
    caption: 'Provenance chain — microdata through to the rendered application',
    query: '?v=reproduce',
    focus: { selector: 'ol', pad: 16 },
    width: 1440,
    height: 1100,
  },
]

export type CaptureResult = {
  file: string
  status: 'captured' | 'skipped'
  reason?: string
  bytes?: number
}

/**
 * Crop a PNG to its non-white bounding box.
 *
 * Done in the page rather than with an image library: the file is loaded into a canvas, the
 * opaque pixels are found, and only that rectangle is written back. No dependency, and the
 * pixels are the same pixels — this is a crop, not a re-render.
 */
async function trimImage(page: Page, file: string): Promise<void> {
  const base64 = readFileSync(file).toString('base64')
  const trimmed = await page.evaluate(async (data) => {
    const image = new Image()
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
      image.src = `data:image/png;base64,${data}`
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(image, 0, 0)
    const { data: pixels } = context.getImageData(0, 0, image.width, image.height)

    // The background is the corner pixel, not white: a Plotly container paints its own
    // surface colour to the edge, so a "darker than white" test finds content everywhere and
    // crops nothing. Comparing against the actual corner colour is what makes this work on
    // both the paper-white pages and the tinted chart surface.
    // Written inline rather than as a named helper: esbuild wraps a named inner function in
    // its own `__name()` helper, and a serialised `page.evaluate` body that references
    // `__name` throws ReferenceError in the browser.
    // Row/column based crop. A per-pixel colour test cannot separate Plotly's paper from
    // its plot area — both are near-white and the boundary is a gradient. What is unambiguous
    // is that a row (or column) with *no* ink at all is empty, so the figure is the bounding
    // box of the rows and columns that contain something darker than the page.
    const rowHasInk: boolean[] = new Array(image.height).fill(false)
    const colHasInk: boolean[] = new Array(image.width).fill(false)
    let minX = image.width
    let minY = image.height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const p = (y * image.width + x) * 4
        const inked = pixels[p + 3] > 8 && (pixels[p] < 200 || pixels[p + 1] < 200 || pixels[p + 2] < 200)
        if (!inked) continue
        rowHasInk[y] = true
        colHasInk[x] = true
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
    if (maxX < 0) return null

    const pad = 24
    const left = Math.max(0, minX - pad)
    const top = Math.max(0, minY - pad)
    const width = Math.min(image.width - left, maxX - minX + pad * 2)
    const height = Math.min(image.height - top, maxY - minY + pad * 2)

    const out = document.createElement('canvas')
    out.width = width
    out.height = height
    out.getContext('2d')?.drawImage(canvas, left, top, width, height, 0, 0, width, height)
    return { dataUrl: out.toDataURL('image/png'), width, height }
  }, base64)

  if (!trimmed) {
    // Reported rather than swallowed: a trim that silently does nothing produces a figure
    // that looks fine in a thumbnail and is two-thirds empty at full size.
    console.log(`          trim found no content outside the background in ${path.basename(file)}`)
    return
  }
  const payload = trimmed.dataUrl.replace(/^data:image\/png;base64,/, '')
  writeFileSync(file, Buffer.from(payload, 'base64'))
  console.log(`          trimmed ${path.basename(file)} to ${trimmed.width}x${trimmed.height}`)
}

/** Clip a PNG to at most `maxHeight` pixels, keeping the top. */
async function cropToHeight(page: Page, file: string, maxHeight: number): Promise<void> {
  const base64 = readFileSync(file).toString('base64')
  const cropped = await page.evaluate(
    async (payload) => {
      const image = new Image()
      await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = reject
        image.src = `data:image/png;base64,${payload.data}`
      })
      if (image.height <= payload.maxHeight) return null
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = payload.maxHeight
      canvas.getContext('2d')?.drawImage(image, 0, 0)
      return { dataUrl: canvas.toDataURL('image/png'), width: image.width, height: payload.maxHeight }
    },
    { data: base64, maxHeight },
  )
  if (!cropped) return
  writeFileSync(file, Buffer.from(cropped.dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'))
  console.log(`          capped ${path.basename(file)} to ${cropped.width}x${cropped.height}`)
}

async function capture(browser: Browser, spec: FigureSpec): Promise<CaptureResult> {
  if (spec.noSubject) {
    return { file: spec.file, status: 'skipped', reason: spec.noSubject }
  }

  // A full-page capture at 2x produced a 2880x14676 PNG: sharp, 2 MB, and unusable inline.
  // Only element captures need the extra density, and only one of those is a full page.
  const context = await browser.newContext({
    viewport: { width: spec.width ?? 1440, height: spec.height ?? 1000 },
    deviceScaleFactor: spec.fullPage ? 1 : 2,
  })
  const page: Page = await context.newPage()
  try {
    await page.goto(`${BASE}${spec.query}`, { waitUntil: 'networkidle', timeout: 60000 })
    // Plotly draws on a canvas after layout; KaTeX and the tables render on the first frame,
    // but a surface captured at 500 ms is a picture of a loading state.
    await page.waitForTimeout(spec.focus?.selector.includes('plotly') ? 4000 : 1500)

    for (const action of spec.actions ?? []) {
      if ('slider' in action) {
        const slider = page.getByRole('slider', { name: new RegExp(action.slider, 'i') }).first()
        // `fill` on a range input sets the value and dispatches `input`, which is what React
        // listens for; keyboard nudges would need dozens of presses to cross the range.
        await slider.fill(String(action.value))
        await slider.dispatchEvent('change')
        await page.waitForTimeout(600)
      } else {
        await page.getByRole(action.role, { name: action.name }).first().click()
        await page.waitForTimeout(600)
      }
    }

    const target = path.join(OUT_DIR, spec.file)
    if (spec.focus) {
      // Picking the first match is wrong twice over. Every chart carries a screen-reader
      // table that is clipped to 1px, and tabs keep their unselected panels mounted at zero
      // size — both have an `offsetParent`, so Playwright's `visible=true` accepts them and
      // the screenshot is a blank rectangle. The only reliable filter is a measured box.
      // A threshold alone is not enough: a chart's screen-reader table is a few hundred pixels
      // square, so "at least 200 by 80" accepts it and the capture is a blank rectangle. The
      // figure is the largest match — the accessible tables are always smaller than what they
      // describe.
      const candidates = page.locator(spec.focus.selector)
      const total = await candidates.count()
      let best: { index: number; area: number; width: number; height: number } | null = null
      for (let i = 0; i < total; i += 1) {
        const box = await candidates.nth(i).boundingBox()
        if (!box || box.width < 200 || box.height < 80) continue
        const area = box.width * box.height
        if (!best || area > best.area) best = { index: i, area, width: box.width, height: box.height }
      }
      if (!best) {
        return {
          file: spec.file,
          status: 'skipped',
          reason: `none of ${total} element(s) matching ${spec.focus.selector} has a box large enough to be the figure`,
        }
      }
      const element = candidates.nth(best.index)
      await element.scrollIntoViewIfNeeded()
      if (spec.scrollToStart) {
        await element.evaluate((node) => {
          node.scrollLeft = 0
          node.scrollTop = 0
        })
      }
      await page.waitForTimeout(600)
      const box = await element.boundingBox()
      if (!box || box.width < 200 || box.height < 80) {
        return {
          file: spec.file,
          status: 'skipped',
          reason: `matched element is ${Math.round(box?.width ?? 0)}x${Math.round(box?.height ?? 0)}, too small to be the figure`,
        }
      }
      // `element.screenshot()` is the call that works here. A full-page screenshot with a
      // `clip` looked equivalent and produced a blank PNG at `deviceScaleFactor: 2`, because
      // the clip is applied in CSS pixels while the page had already scrolled the element
      // into view — the clip then pointed at empty space above it.
      await element.screenshot({ path: target })
      if (spec.trim) await trimImage(page, target)
      if (spec.maxHeight) await cropToHeight(page, target, spec.maxHeight)
    } else if (spec.fullPage) {
      // A page taller than a few screens is not a figure. Clip to the viewport instead of
      // the document, extended by a little so the fold does not cut a component in half.
      const vp = page.viewportSize() ?? { width: 1440, height: 1000 }
      await page.screenshot({
        path: target,
        clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 1600) },
      })
    } else {
      await page.screenshot({ path: target })
    }

    const bytes = readFileSync(target).byteLength
    // A near-empty PNG is the signature of a blank capture. 8 KiB is well under the smallest
    // real page in this set (72 KiB) and well over a solid-colour rectangle.
    if (bytes < 8192) {
      return { file: spec.file, status: 'skipped', reason: `captured PNG is only ${bytes} bytes, which is a blank image` }
    }
    return { file: spec.file, status: 'captured', bytes }
  } finally {
    await context.close()
  }
}

/** The screenshots the README actually displays, so the run reports orphans too. */
function readmeScreenshots(): string[] {
  const source = readFileSync(README, 'utf8')
  return [...source.matchAll(/figures\/screenshots\/([A-Za-z0-9_.-]+\.png)/g)].map((match) => match[1])
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check')

  const shown = readmeScreenshots()
  const known = new Set(FIGURES.map((spec) => spec.file))
  const orphans = shown.filter((file) => !known.has(file))
  const unshown = FIGURES.map((spec) => spec.file).filter((file) => !shown.includes(file))

  if (check) {
    let failed = false
    for (const spec of FIGURES) {
      if (spec.noSubject) {
        console.log(`SKIP  ${spec.file}\n      ${spec.noSubject}`)
      }
    }
    if (orphans.length > 0) {
      failed = true
      console.error(`FAIL  ${orphans.length} screenshot(s) in README have no capture spec: ${orphans.join(', ')}`)
    }
    if (unshown.length > 0) {
      failed = true
      console.error(`FAIL  ${unshown.length} capture spec(s) are not shown in README: ${unshown.join(', ')}`)
    }
    if (failed) process.exit(1)
    console.log(`PASS  all ${shown.length} screenshots the README shows have a capture spec`)
    return
  }

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
  const results: CaptureResult[] = []
  try {
    for (const spec of FIGURES) {
      const result = await capture(browser, spec)
      results.push(result)
      if (result.status === 'captured') {
        console.log(`captured  ${spec.file}  (${Math.round((result.bytes ?? 0) / 1024)} KiB)`)
      } else {
        console.log(`skipped   ${spec.file}\n          ${result.reason}`)
      }
    }
  } finally {
    await browser.close()
  }

  const report = {
    base: BASE,
    captured: results.filter((r) => r.status === 'captured').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    results,
  }
  writeFileSync(path.join(REPO_ROOT, 'tmp', 'paper-figures.json'), JSON.stringify(report, null, 1))

  console.log(
    `\n${report.captured} captured, ${report.skipped} skipped (no subject in the rebuild), ` +
      `${orphans.length} README screenshot(s) without a spec`,
  )
}

if (process.argv[1] && process.argv[1].endsWith('capture_paper_figures.ts')) {
  await main()
}
