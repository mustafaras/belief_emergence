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
 * file; the comparison decodes PNG scanlines and compares their pixels, so platform-specific
 * PNG compression does not affect the result.
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
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BASELINE = path.join(REPO_ROOT, 'tests', 'fixtures', 'surface-baseline.png')
const PORT = process.env.RENDER_CHECK_PORT || '5199'
const BASE_URL = process.env.SURFACE_BASE_URL || `http://localhost:${PORT}/belief_emergence/`

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

  const expected = fs.readFileSync(BASELINE)
  const expectedPixels = decodePng(expected)

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

    // The graph's responsive parent can land on adjacent fractional CSS heights on macOS
    // and Linux. Fix the graph element to the recorded pixel dimensions before capture so
    // both browsers rasterize the same viewport rather than rounding 420.5px differently.
    await page.evaluate(({ width, height }) => {
      const graph = document.querySelector('.js-plotly-plot') as HTMLElement | null
      if (!graph) throw new Error('3D surface disappeared before sizing the snapshot')
      graph.style.width = `${width}px`
      graph.style.height = `${height}px`
      window.dispatchEvent(new Event('resize'))
    }, { width: expectedPixels.width, height: expectedPixels.height })
    await page.waitForTimeout(500)

    const normalizedBox = await plot.boundingBox()
    if (!normalizedBox) {
      console.error('FAIL  the resized 3D surface has no bounding box')
      await browser.close()
      process.exit(1)
    }
    captured = await page.screenshot({ clip: normalizedBox })
  } finally {
    await browser.close()
  }

  const hash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex').slice(0, 16)

  const capturedPixels = decodePng(captured)
  const pixelIdentical =
    expectedPixels.width === capturedPixels.width &&
    expectedPixels.height === capturedPixels.height &&
    expectedPixels.rgba.equals(capturedPixels.rgba)

  if (pixelIdentical) {
    console.log(
      `PASS  surface renders pixel-identically to the baseline ` +
        `(${expectedPixels.width}×${expectedPixels.height} pixels; PNG encoding ignored)`,
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
  if (expectedPixels.width !== capturedPixels.width || expectedPixels.height !== capturedPixels.height) {
    console.error(
      `      pixel dimensions differ: expected ${expectedPixels.width}×${expectedPixels.height}, ` +
        `captured ${capturedPixels.width}×${capturedPixels.height}`,
    )
  } else {
    let differingPixels = 0
    let maxChannelDelta = 0
    for (let i = 0; i < expectedPixels.rgba.length; i += 4) {
      let pixelDiffers = false
      for (let channel = 0; channel < 4; channel += 1) {
        const delta = Math.abs(expectedPixels.rgba[i + channel] - capturedPixels.rgba[i + channel])
        if (delta > 0) pixelDiffers = true
        if (delta > maxChannelDelta) maxChannelDelta = delta
      }
      if (pixelDiffers) differingPixels += 1
    }
    console.error(
      `      differing pixels: ${differingPixels}/${expectedPixels.width * expectedPixels.height}; ` +
        `maximum channel delta: ${maxChannelDelta}`,
    )
  }
  console.error(`      wrote the capture to ${path.relative(REPO_ROOT, actualPath)}`)
  process.exit(1)
}

await main()
