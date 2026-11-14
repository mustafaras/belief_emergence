/**
 * The initial bundle budget.
 *
 * The production build was one 6.6 MB chunk containing Plotly, jsPDF, html2canvas and
 * KaTeX, none of which the landing route needs. Splitting it is only half the work: without
 * a budget the next `import` at the top of `App.tsx` quietly puts it back, and the
 * regression stays invisible until someone opens the site on a slow connection.
 *
 * WHAT "INITIAL PAYLOAD" MEANS HERE, AND WHY IT IS MEASURED RATHER THAN INFERRED
 * -----------------------------------------------------------------------------
 * Static analysis of the entry chunk cannot answer this question. Rollup writes every lazy
 * chunk name into a `__vite__mapDeps` table at the top of the entry, so the entry always
 * *mentions* Plotly whether or not it loads it — and `React.lazy(() => import(...))` is
 * byte-identical to the bug it is supposed to prevent. Grepping the bundle cannot tell
 * deferred from eager.
 *
 * So the payload is measured the way a browser measures it: serve `dist/`, open the
 * landing route, and total the JavaScript the page actually requests. Anything it does not
 * request is deferred, by definition rather than by inspection.
 *
 * Usage:  npm run check:bundle-budget
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const ASSETS = path.join(REPO_ROOT, 'dist', 'assets')
const PORT = process.env.BUNDLE_CHECK_PORT || '5401'

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw == null || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer; received ${JSON.stringify(raw)}`)
  }
  return value
}

/** Workflow values are numeric and explicit; defaults keep the local command usable. */
const INITIAL_BUDGET_KIB = readPositiveInteger('INITIAL_CHUNK_BUDGET_KIB', 2048)
const INITIAL_BUDGET_BYTES = INITIAL_BUDGET_KIB * 1024
const FIRST_CONTENTFUL_PAINT_BUDGET_MS = readPositiveInteger('FIRST_CONTENTFUL_PAINT_BUDGET_MS', 2500)
const PAINT_SAMPLES = 3

/** Chunks that must never be requested to paint the landing route. */
const FORBIDDEN_CHUNKS = [
  { name: 'Plotly (the 3D surface)', pattern: /^Surface3DOverlay-/ },
  { name: 'jsPDF', pattern: /^jspdf\./ },
  { name: 'html2canvas', pattern: /^html2canvas\./ },
  { name: 'InteractiveDocumentation (KaTeX)', pattern: /^InteractiveDocumentation-/ },
]

if (!fs.existsSync(ASSETS)) {
  console.error('FAIL  dist/assets is missing; run "npm run build" first')
  process.exit(1)
}

const failures: string[] = []

/** Serve dist/, total the initial JavaScript, and measure cold landing-route FCP. */
async function measureInitialPayload(): Promise<{ files: string[]; firstContentfulPaintMs: number[] }> {
  const { chromium } = (await import('playwright-core')) as typeof import('playwright-core')
  const chromePath = process.env.CHROME_PATH || chromium.executablePath()

  const server = spawn(process.execPath, [
    path.join(REPO_ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
    'preview', '--host', '127.0.0.1', '--port', PORT, '--strictPort',
  ], {
    cwd: REPO_ROOT,
    stdio: 'ignore',
  })

  try {
    // Poll rather than sleep: a fixed wait is either too slow or flaky.
    let up = false
    for (let attempt = 0; attempt < 60 && !up; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${PORT}/belief_emergence/`)
        up = response.ok
      } catch {
        // Not listening yet.
      }
      if (!up) await new Promise((resolve) => setTimeout(resolve, 500))
    }
    if (!up) throw new Error(`vite preview did not start on port ${PORT}`)

    const browser = await chromium.launch({ executablePath: chromePath, headless: true })
    try {
      const requested = new Set<string>()
      const firstContentfulPaintMs: number[] = []
      for (let sample = 0; sample < PAINT_SAMPLES; sample += 1) {
        const context = await browser.newContext({
          viewport: { width: 1600, height: 1000 },
          deviceScaleFactor: 1,
          reducedMotion: 'reduce',
        })
        try {
          const page = await context.newPage()
          page.on('response', (response) => {
            const url = response.url()
            if (url.includes('/assets/') && url.endsWith('.js')) {
              requested.add(url.split('/assets/')[1])
            }
          })
          await page.goto(`http://127.0.0.1:${PORT}/belief_emergence/`, {
            waitUntil: 'networkidle',
            timeout: 60000,
          })
          const paintTime = await page.evaluate(() =>
            performance.getEntriesByType('paint')
              .find((entry) => entry.name === 'first-contentful-paint')?.startTime ?? null,
          )
          if (typeof paintTime !== 'number' || !Number.isFinite(paintTime)) {
            throw new Error(`browser did not report first-contentful-paint on sample ${sample + 1}`)
          }
          firstContentfulPaintMs.push(paintTime)
        } finally {
          await context.close()
        }
      }
      return { files: [...requested], firstContentfulPaintMs }
    } finally {
      await browser.close()
    }
  } finally {
    try {
      server.kill('SIGTERM')
    } catch {
      // Already exited.
    }
  }
}

async function main(): Promise<void> {
  let measured: { bytes: number; files: string[] }
  try {
    const rawMeasurement = await measureInitialPayload()
    measured = { bytes: 0, files: rawMeasurement.files }
    const sortedPaintTimes = [...rawMeasurement.firstContentfulPaintMs].sort((a, b) => a - b)
    const medianPaintMs = sortedPaintTimes[Math.floor(sortedPaintTimes.length / 2)]
    console.log(
      `First contentful paint (cold landing, ${PAINT_SAMPLES} runs): ` +
        `${rawMeasurement.firstContentfulPaintMs.map((ms) => ms.toFixed(0)).join(', ')} ms; ` +
        `median ${medianPaintMs.toFixed(0)} ms (budget ${FIRST_CONTENTFUL_PAINT_BUDGET_MS} ms)`,
    )
    if (medianPaintMs > FIRST_CONTENTFUL_PAINT_BUDGET_MS) {
      failures.push(
        `median first contentful paint is ${medianPaintMs.toFixed(0)} ms, over the ` +
          `${FIRST_CONTENTFUL_PAINT_BUDGET_MS} ms budget`,
      )
    }
  } catch (error) {
    console.error(`FAIL  could not measure built payload/performance: ${(error as Error).message}`)
    process.exit(1)
  }

  const sizes = new Map<string, number>()
  for (const file of measured.files) {
    const full = path.join(ASSETS, file)
    if (fs.existsSync(full)) sizes.set(file, fs.statSync(full).size)
  }

  const bytes = [...sizes.values()].reduce((sum, n) => sum + n, 0)
  const sorted = [...sizes.entries()].sort((a, b) => b[1] - a[1])

  console.log('\nJavaScript requested to paint the landing route:')
  for (const [file, size] of sorted) {
      console.log(`  ${file.padEnd(44)} ${(size / 1024).toFixed(0).padStart(6)} KiB`)
  }
  console.log(
    `  ${'total'.padEnd(44)} ${(bytes / 1024).toFixed(0).padStart(6)} KiB ` +
      `(budget ${INITIAL_BUDGET_KIB} KiB)`,
  )

  if (bytes > INITIAL_BUDGET_BYTES) {
    failures.push(
      `initial payload is ${(bytes / 1048576).toFixed(2)} MiB, over the ` +
        `${INITIAL_BUDGET_KIB} KiB budget`,
    )
  }

  for (const forbidden of FORBIDDEN_CHUNKS) {
    const hit = measured.files.find((f) => forbidden.pattern.test(f))
    if (hit) {
      failures.push(
        `${forbidden.name} is requested by the landing route (${hit}) — it must stay behind ` +
          `a lazy boundary`,
      )
    }
  }

  // A measurement of nothing is not a pass.
  if (measured.files.length === 0) {
    failures.push('no JavaScript chunks were requested, so the budget measured nothing')
  }

  // The heavy chunk must still exist: deferring is not deleting.
  const all = fs.readdirSync(ASSETS).filter((f) => f.endsWith('.js'))
  if (!all.some((f) => /^Surface3DOverlay-/.test(f))) {
    failures.push('no Surface3DOverlay chunk was emitted — the 3D surface may have been removed')
  }

  if (failures.length > 0) {
    console.error(`\nFAIL  bundle budget (${failures.length} problem(s)):`)
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exit(1)
  }

  console.log(
    `\nPASS  landing route loads ${(bytes / 1024).toFixed(0)} KiB of JavaScript in ` +
      `${measured.files.length} chunk(s), under the ${INITIAL_BUDGET_KIB} KiB budget; ` +
      `${FORBIDDEN_CHUNKS.length} heavy modules deferred; ` +
      `median FCP is within ${FIRST_CONTENTFUL_PAINT_BUDGET_MS} ms`,
  )
}

await main()
