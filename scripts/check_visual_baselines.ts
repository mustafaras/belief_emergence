/**
 * Compare one committed, deterministic browser screenshot for every application route.
 *
 * Usage:
 *   npm run check:visual-baselines
 *   npm run check:visual-baselines -- --update
 *
 * `--update` is deliberately explicit: normal CI runs never rewrite their references.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import { LANDING_ROUTE, SITEMAP, type AppRoute } from '../src/router/routes'
import { buildAppUrl } from '../src/utils/urlState'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BASELINE_DIR = path.join(ROOT, 'tests', 'visual-baselines')
const PORT = process.env.VISUAL_CHECK_PORT || '5199'
const BASE_URL = (process.env.VISUAL_BASE_URL || `http://127.0.0.1:${PORT}/belief_emergence/`).replace(/\/$/, '') + '/'
const VIEWPORT = { width: 1600, height: 1000 }
const ROUTES: readonly AppRoute[] = [LANDING_ROUTE, ...SITEMAP.map(({ id }) => id)]

function readNonNegativeInteger(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw == null || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer; received ${JSON.stringify(raw)}`)
  }
  return value
}

const MAX_CHANGED_PIXELS = readNonNegativeInteger('VISUAL_MAX_CHANGED_PIXELS', 5000)
const CHANNEL_TOLERANCE = readNonNegativeInteger('VISUAL_CHANNEL_TOLERANCE', 20)
const updateBaselines = process.argv.slice(2).includes('--update')
const unknownArgs = process.argv.slice(2).filter((arg) => arg !== '--update')
if (unknownArgs.length) throw new Error(`unknown argument(s): ${unknownArgs.join(', ')}`)

type DecodedPng = { width: number; height: number; rgba: Buffer }

/** Decode the 8-bit RGB/RGBA non-interlaced PNGs emitted by Playwright Chromium. */
function decodePng(buffer: Buffer): DecodedPng {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(signature)) throw new Error('not a PNG image')

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
    const start = offset + 8
    const end = start + length
    if (end + 4 > buffer.length) throw new Error('truncated PNG chunk')
    const data = buffer.subarray(start, end)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') imageData.push(data)
    else if (type === 'IEND') break
    offset = end + 4
  }

  if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) {
    throw new Error(`unsupported PNG format: ${width}x${height}, depth=${bitDepth}, color=${colorType}, interlace=${interlace}`)
  }
  const channels = colorType === 6 ? 4 : 3
  const rowBytes = width * channels
  const stride = rowBytes + 1
  const filtered = inflateSync(Buffer.concat(imageData))
  if (filtered.length !== stride * height) throw new Error('PNG scanline data has an unexpected size')
  const decoded = Buffer.alloc(rowBytes * height)

  for (let y = 0; y < height; y += 1) {
    const source = y * stride
    const target = y * rowBytes
    const filter = filtered[source]
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = filtered[source + x + 1]
      const left = x >= channels ? decoded[target + x - channels] : 0
      const up = y > 0 ? decoded[target + x - rowBytes] : 0
      const upperLeft = y > 0 && x >= channels ? decoded[target + x - rowBytes - channels] : 0
      let predictor = 0
      if (filter === 1) predictor = left
      else if (filter === 2) predictor = up
      else if (filter === 3) predictor = Math.floor((left + up) / 2)
      else if (filter === 4) {
        const estimate = left + up - upperLeft
        const leftDistance = Math.abs(estimate - left)
        const upDistance = Math.abs(estimate - up)
        const upperLeftDistance = Math.abs(estimate - upperLeft)
        predictor = leftDistance <= upDistance && leftDistance <= upperLeftDistance
          ? left
          : upDistance <= upperLeftDistance ? up : upperLeft
      } else if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}`)
      decoded[target + x] = (raw + predictor) & 0xff
    }
  }

  if (channels === 4) return { width, height, rgba: decoded }
  const rgba = Buffer.alloc(width * height * 4)
  for (let source = 0, target = 0; source < decoded.length; source += 3, target += 4) {
    rgba[target] = decoded[source]
    rgba[target + 1] = decoded[source + 1]
    rgba[target + 2] = decoded[source + 2]
    rgba[target + 3] = 255
  }
  return { width, height, rgba }
}

function changedPixelCount(expected: DecodedPng, actual: DecodedPng): number {
  if (expected.width !== actual.width || expected.height !== actual.height) return Infinity
  let changed = 0
  for (let i = 0; i < expected.rgba.length; i += 4) {
    if (
      Math.abs(expected.rgba[i] - actual.rgba[i]) > CHANNEL_TOLERANCE ||
      Math.abs(expected.rgba[i + 1] - actual.rgba[i + 1]) > CHANNEL_TOLERANCE ||
      Math.abs(expected.rgba[i + 2] - actual.rgba[i + 2]) > CHANNEL_TOLERANCE ||
      Math.abs(expected.rgba[i + 3] - actual.rgba[i + 3]) > CHANNEL_TOLERANCE
    ) changed += 1
  }
  return changed
}

async function startServer(): Promise<() => void> {
  const server = spawn(process.execPath, [
    path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--host', '127.0.0.1', '--port', PORT, '--strictPort',
  ], {
    cwd: ROOT,
    stdio: 'ignore',
  })
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode != null) throw new Error(`Vite exited before listening (code ${server.exitCode})`)
    try {
      const response = await fetch(BASE_URL)
      if (response.ok) return () => server.kill('SIGTERM')
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  server.kill('SIGTERM')
  throw new Error(`Vite did not become ready at ${BASE_URL}`)
}

async function captureRoutes(): Promise<Map<AppRoute, Buffer>> {
  const { chromium } = await import('playwright-core')
  const executablePath = process.env.CHROME_PATH || chromium.executablePath()
  const browser = await chromium.launch({ executablePath, headless: true })
  const screenshots = new Map<AppRoute, Buffer>()

  try {
    for (const route of ROUTES) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 1,
        colorScheme: 'dark',
        reducedMotion: 'reduce',
        locale: 'en-US',
        timezoneId: 'UTC',
      })
      try {
        await context.addInitScript(`
          try { window.localStorage.setItem('belief-emergence-theme', 'dark') } catch {}
          const style = document.createElement('style')
          style.textContent = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;scroll-behavior:auto!important;caret-color:transparent!important}'
          const root = document.documentElement || document.head
          if (root) root.appendChild(style)
          else {
            const observer = new MutationObserver((records, watcher) => {
              const readyRoot = document.documentElement || document.head
              if (readyRoot) { readyRoot.appendChild(style); watcher.disconnect() }
            })
            observer.observe(document, { childList: true, subtree: true })
          }
        `)
        const page = await context.newPage()
        const pageErrors: string[] = []
        page.on('pageerror', (error) => pageErrors.push(error.message))
        if (route === 'ai-interpreter') {
          await page.route('**/api/ai/interpret', (request) => request.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'AI requests are disabled during visual baseline capture.' }),
          }))
        }

        const url = buildAppUrl({ params: {}, route }, BASE_URL)
        await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 })
        await page.waitForSelector(`.top-bar-content[data-route="${route}"]`, { timeout: 45000 })
        await page.waitForFunction(() => document.body.innerText.length > 500, undefined, { timeout: 45000 })
        if (route === 'documentation') await page.waitForSelector('.interactive-documentation', { timeout: 45000 })
        if (route === 'ai-interpreter') await page.waitForSelector('.ai-modal', { timeout: 45000 })
        if (route === 'presets') await page.waitForSelector('.preset-modal', { timeout: 45000 })
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(300)
        if (pageErrors.length) throw new Error(`browser errors: ${pageErrors.join(' | ')}`)
        screenshots.set(route, await page.screenshot({ type: 'png', animations: 'disabled' }))
        console.log(`CAPTURE ${route} ${VIEWPORT.width}x${VIEWPORT.height}`)
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }
  return screenshots
}

async function main(): Promise<void> {
  const stopServer = process.env.VISUAL_BASE_URL ? () => undefined : await startServer()
  try {
    const screenshots = await captureRoutes()
    if (screenshots.size !== ROUTES.length) throw new Error(`captured ${screenshots.size}/${ROUTES.length} routes`)
    fs.mkdirSync(BASELINE_DIR, { recursive: true })
    const failures: string[] = []

    for (const route of ROUTES) {
      const actual = screenshots.get(route)!
      const baselinePath = path.join(BASELINE_DIR, `${route}.png`)
      if (updateBaselines) {
        fs.writeFileSync(baselinePath, actual)
        console.log(`UPDATE ${route}: ${path.relative(ROOT, baselinePath)}`)
        continue
      }
      if (!fs.existsSync(baselinePath)) {
        failures.push(`${route}: missing committed baseline ${path.relative(ROOT, baselinePath)} (run with --update)`)
        console.error(`FAIL ${route}: baseline missing`)
        continue
      }
      const expected = decodePng(fs.readFileSync(baselinePath))
      const observed = decodePng(actual)
      const changed = changedPixelCount(expected, observed)
      if (changed > MAX_CHANGED_PIXELS) {
        failures.push(`${route}: ${changed} changed pixels exceeds ${MAX_CHANGED_PIXELS}`)
        console.error(`FAIL ${route}: ${changed} changed pixels (limit ${MAX_CHANGED_PIXELS})`)
      } else {
        console.log(`PASS ${route}: ${changed} changed pixels (limit ${MAX_CHANGED_PIXELS})`)
      }
    }

    if (!updateBaselines) {
      const expectedNames = new Set(ROUTES.map((route) => `${route}.png`))
      for (const filename of fs.readdirSync(BASELINE_DIR).filter((name) => name.endsWith('.png'))) {
        if (!expectedNames.has(filename)) failures.push(`unexpected baseline ${filename}; route coverage has drifted`)
      }
    }
    if (failures.length) {
      console.error(`\nFAIL visual baselines (${failures.length} issue(s)):`)
      failures.forEach((failure) => console.error(`  - ${failure}`))
      process.exitCode = 1
      return
    }
    console.log(`\nPASS visual baselines: ${ROUTES.length} routes, ${VIEWPORT.width}x${VIEWPORT.height}, ` +
      `channel tolerance ${CHANNEL_TOLERANCE}, changed-pixel limit ${MAX_CHANGED_PIXELS}`)
  } finally {
    stopServer()
  }
}

await main()
