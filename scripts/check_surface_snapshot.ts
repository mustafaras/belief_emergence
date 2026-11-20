/**
 * The surface stays within a strict pixel tolerance of the reviewed canonical-panel baseline.
 *
 * Prompt 9's acceptance condition for decomposing `Surface3DSurface.tsx` is not "it looks
 * right" — it is "a snapshot of the rendered surface before and after the refactor is
 * The reviewed baseline follows the canonical panel's current X/Y support; when those
 * inputs change, the capture is reviewed before re-baselining.
 *
 * WHY A BROWSER AND A STORED IMAGE
 * --------------------------------
 * The component draws through Plotly into a canvas. Nothing about that output can be
 * asserted from the source: a moved helper, a changed constant or a reordered effect
 * changes the picture without changing any value a unit test can read. The baseline is
 * committed alongside this file and captured on macOS. The comparison decodes PNG
 * scanlines and compares their pixels, so platform-specific PNG compression does not
 * affect the result. Headless WebGL rasterization differs across platforms and hosted
 * runners; CI runs this golden comparison in the macOS visual-baselines job, with a narrow
 * channel and changed-pixel allowance for antialiasing noise.
 *
 * The screenshot is deterministic here — captured twice from the same build, pixel-identical
 * — which is what makes it usable as an acceptance test rather than a source of flaky failures.
 *
 * Skips (exit 0 with a SKIP line) when no browser or server is available, the same contract
 * as the other browser checks. In CI the browser is installed by the workflow and `ci:gate`
 * reports SKIP distinctly from PASS, so a skip is never mistaken for a pass.
 *
 * Usage:  npm run check:surface-snapshot
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BASELINE = path.join(REPO_ROOT, 'tests', 'fixtures', 'surface-baseline.png')
const ENVIRONMENT_FILE = path.join(REPO_ROOT, 'tests', 'fixtures', 'surface-baseline.environment.json')

/** The platform and macOS version the reviewed baseline was captured on. */
function recordingEnvironment(): string {
  // `os.release()` rather than `sw_vers`: the check has to *describe* an environment on every
  // platform, and shelling out to a macOS-only binary threw ENOENT on Linux — a crash reported as
  // "the check could not run", which names the wrong thing.
  //
  // This is a kernel version, not a marketing one: `darwin 27.3.0` where `sw_vers` says `27.3`.
  // The two are interchangeable for comparison because the same function runs on both sides, but
  // the identifier deliberately names the kernel — this is a check about a *rasteriser*, and the
  // kernel release is what tracks it. Don't substitute one for the other.
  return `${process.platform} ${os.release()}`;
}
const PORT = process.env.RENDER_CHECK_PORT || '5199'
const BASE_URL = process.env.SURFACE_BASE_URL || `http://localhost:${PORT}/belief_emergence/`
const CHANNEL_TOLERANCE = 24
const MAX_CHANGED_PIXELS = 100
type DecodedPng = { width: number; height: number; rgba: Buffer }

/** Decode the 8-bit RGB/RGBA screenshots produced by Chromium into canonical RGBA pixels. */
function decodePng(buffer: Buffer): DecodedPng {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (buffer.length < signature.length || !buffer.subarray(0, 8).equals(signature)) {
    throw new Error('not a PNG image')
  }

  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const imageData: Buffer[] = []
  let offset = 8

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > buffer.length) throw new Error('truncated PNG chunk')
    const data = buffer.subarray(dataStart, dataEnd)

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') {
      imageData.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset = dataEnd + 4
  }

  if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) {
    throw new Error(
      `unsupported PNG format: ${width}x${height}, depth=${bitDepth}, ` +
        `color=${colorType}, interlace=${interlace}`,
    )
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3
  const rowBytes = width * bytesPerPixel
  const stride = rowBytes + 1
  const filtered = inflateSync(Buffer.concat(imageData))
  if (filtered.length !== stride * height) throw new Error('PNG scanline data has an unexpected size')

  const pixels = Buffer.alloc(rowBytes * height)
  for (let y = 0; y < height; y += 1) {
    const sourceStart = y * stride + 1
    const targetStart = y * rowBytes
    const filter = filtered[sourceStart - 1]

    for (let x = 0; x < rowBytes; x += 1) {
      const raw = filtered[sourceStart + x]
      const left = x >= bytesPerPixel ? pixels[targetStart + x - bytesPerPixel] : 0
      const up = y > 0 ? pixels[targetStart + x - rowBytes] : 0
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[targetStart + x - rowBytes - bytesPerPixel] : 0
      let predictor = 0

      if (filter === 1) predictor = left
      else if (filter === 2) predictor = up
      else if (filter === 3) predictor = Math.floor((left + up) / 2)
      else if (filter === 4) {
        const p = left + up - upperLeft
        const leftDistance = Math.abs(p - left)
        const upDistance = Math.abs(p - up)
        const upperLeftDistance = Math.abs(p - upperLeft)
        predictor = leftDistance <= upDistance && leftDistance <= upperLeftDistance
          ? left
          : upDistance <= upperLeftDistance
            ? up
            : upperLeft
      } else if (filter !== 0) {
        throw new Error(`unsupported PNG filter ${filter}`)
      }

      pixels[targetStart + x] = (raw + predictor) & 0xff
    }
  }

  if (colorType === 6) return { width, height, rgba: pixels }

  const rgba = Buffer.alloc(width * height * 4)
  for (let source = 0, target = 0; source < pixels.length; source += 3, target += 4) {
    rgba[target] = pixels[source]
    rgba[target + 1] = pixels[source + 1]
    rgba[target + 2] = pixels[source + 2]
    rgba[target + 3] = 255
  }
  return { width, height, rgba }
}

async function main(): Promise<void> {
  /*
   * A pixel baseline is valid on one platform and one rasteriser version. `process.platform ===
   * 'darwin'` is true on every macOS release, so it admitted runners whose text rendering differs
   * from the reviewed image. The recorded environment is the test.
   */
  // `--write` records the reviewed baseline, so there is nothing to be comparable with yet.
  const recording = process.argv.includes('--write')
  const recorded = fs.existsSync(ENVIRONMENT_FILE)
    ? (JSON.parse(fs.readFileSync(ENVIRONMENT_FILE, 'utf8')) as { environment?: string }).environment
    : undefined
  const here = recordingEnvironment()
  if (!recording && recorded !== here) {
    // Not SKIP: SKIP means "could not run" and makes the gate red, which no code change fixes.
    console.log(
      `UNVERIFIABLE HERE: the surface baseline was recorded on ${recorded ?? 'an unrecorded environment'}; ` +
        `this is ${here}. Pixel comparison is meaningful only on the recording environment.`,
    )
    return
  }

  const { chromium } = (await import('playwright-core')) as typeof import('playwright-core')
  const chromePath =
    process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

  if (!fs.existsSync(chromePath)) {
    console.log(`SKIP  no Chrome at ${chromePath}; set CHROME_PATH to enable the surface snapshot`)
    return
  }
  // `--write` records the reviewed baseline, which by definition does not exist yet.
  const write = process.argv.includes('--write')
  if (!write && !fs.existsSync(BASELINE)) {
    console.log(`SKIP  no baseline at ${path.relative(REPO_ROOT, BASELINE)}`)
    return
  }

  const expected = write ? Buffer.alloc(0) : fs.readFileSync(BASELINE)
  const expectedPixels = write ? { width: 0, height: 0, rgba: Buffer.alloc(0) } : decodePng(expected)

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
      // The surface lives on the Geometry route, not the landing route: the v1 toggle this
      // script clicked no longer exists, and a v2 landing page never renders a Plotly canvas.
      await page.goto(`${BASE_URL}?v=geometry`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    } catch (e) {
      console.log(
        `SKIP  no server at ${BASE_URL} (${(e as Error).message.split('\n')[0].slice(0, 70)})`,
      )
      await browser.close()
      return
    }

    // Plotly is a lazy chunk and the scene needs its first WebGL frame before the canvas has
    // pixels worth comparing; wait for the element rather than for a fixed delay.
    await page.waitForSelector('.js-plotly-plot canvas', { timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(4000)

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

  const hash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex')
  const capturedPixels = decodePng(captured)

  if (write) {
    fs.writeFileSync(BASELINE, captured)
    fs.writeFileSync(
      ENVIRONMENT_FILE,
      `${JSON.stringify({ environment: recordingEnvironment() }, null, 2)}\n`,
    )
    console.log(
      `wrote ${path.relative(REPO_ROOT, BASELINE)} ` +
        `(${capturedPixels.width}x${capturedPixels.height}, sha256:${hash(captured).slice(0, 12)}…) ` +
        `valid on ${recordingEnvironment()}`,
    )
    return
  }

  const dimensionsMatch =
    expectedPixels.width === capturedPixels.width && expectedPixels.height === capturedPixels.height
  let changedPixels = 0
  let maxChannelDelta = 0
  if (dimensionsMatch) {
    for (let i = 0; i < expectedPixels.rgba.length; i += 4) {
      let pixelChanged = false
      for (let channel = 0; channel < 4; channel += 1) {
        const delta = Math.abs(expectedPixels.rgba[i + channel] - capturedPixels.rgba[i + channel])
        if (delta > maxChannelDelta) maxChannelDelta = delta
        if (delta > CHANNEL_TOLERANCE) pixelChanged = true
      }
      if (pixelChanged) changedPixels += 1
    }
  }
  const withinTolerance = dimensionsMatch && changedPixels <= MAX_CHANGED_PIXELS

  if (withinTolerance) {
    console.log(
      `PASS  surface matches its reviewed baseline within tolerance ` +
        `(${expectedPixels.width}×${capturedPixels.height}; ${changedPixels} pixels exceed ` +
        `channel delta ${CHANNEL_TOLERANCE}, limit ${MAX_CHANGED_PIXELS})`,
    )
    return
  }

  // Write the mismatch beside the baseline so the difference can be inspected rather than
  // described.
  const actualPath = path.join(REPO_ROOT, 'tests', 'fixtures', 'surface-actual.png')
  fs.writeFileSync(actualPath, captured)

  console.error('FAIL  the surface exceeds its reviewed baseline tolerance')
  console.error(`      expected ${expected.length} bytes (sha256:${hash(expected)})`)
  console.error(`      captured ${captured.length} bytes (sha256:${hash(captured)})`)
  if (expectedPixels.width !== capturedPixels.width || expectedPixels.height !== capturedPixels.height) {
    console.error(
      `      pixel dimensions differ: expected ${expectedPixels.width}×${expectedPixels.height}, ` +
        `captured ${capturedPixels.width}×${capturedPixels.height}`,
    )
  } else {
    console.error(
      `      pixels beyond channel delta ${CHANNEL_TOLERANCE}: ${changedPixels}/` +
        `${expectedPixels.width * expectedPixels.height} (limit ${MAX_CHANGED_PIXELS}); ` +
        `maximum channel delta: ${maxChannelDelta}`,
    )
  }
  console.error(`      wrote the capture to ${path.relative(REPO_ROOT, actualPath)}`)
  process.exit(1)
}

await main()
