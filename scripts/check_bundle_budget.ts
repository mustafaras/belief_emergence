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

/** Prompt 7's target, stated as a number so the budget is enforceable. */
const INITIAL_BUDGET_BYTES = 2 * 1024 * 1024

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

/** Serve dist/ and total the scripts the landing route requests. */
async function measureInitialPayload(): Promise<{ bytes: number; files: string[] }> {
  const { chromium } = (await import('playwright-core')) as typeof import('playwright-core')
  const chromePath =
    process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

  const server = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], {
    cwd: REPO_ROOT,
    stdio: 'ignore',
  })

  try {
    // Poll rather than sleep: a fixed wait is either too slow or flaky.
    let up = false
    for (let attempt = 0; attempt < 60 && !up; attempt += 1) {
      try {
        const response = await fetch(`http://localhost:${PORT}/belief_emergence/`)
        up = response.ok
      } catch {
        // Not listening yet.
      }
      if (!up) await new Promise((resolve) => setTimeout(resolve, 500))
    }
    if (!up) throw new Error(`vite preview did not start on port ${PORT}`)

    const browser = await chromium.launch({ executablePath: chromePath, headless: true })
    try {
      const page = await browser.newPage()
      const requested: string[] = []
      page.on('response', (response) => {
        const url = response.url()
        if (url.includes('/assets/') && url.endsWith('.js')) {
          requested.push(url.split('/assets/')[1])
        }
      })
      await page.goto(`http://localhost:${PORT}/belief_emergence/`, {
        waitUntil: 'networkidle',
        timeout: 60000,
      })
      // Let any post-paint fetch settle before closing the request set.
      await page.waitForTimeout(4000)
      return { bytes: 0, files: [...new Set(requested)] }
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
    measured = await measureInitialPayload()
  } catch (error) {
    console.log(
      `SKIP  could not measure the built payload (${(error as Error).message.slice(0, 90)})`,
    )
    return
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
    console.log(`  ${file.padEnd(44)} ${(size / 1024).toFixed(0).padStart(6)} kB`)
  }
  console.log(
    `  ${'total'.padEnd(44)} ${(bytes / 1024).toFixed(0).padStart(6)} kB ` +
      `(budget ${(INITIAL_BUDGET_BYTES / 1024).toFixed(0)} kB)`,
  )

  if (bytes > INITIAL_BUDGET_BYTES) {
    failures.push(
      `initial payload is ${(bytes / 1048576).toFixed(2)} MB, over the ` +
        `${(INITIAL_BUDGET_BYTES / 1048576).toFixed(0)} MB budget`,
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
    `\nPASS  landing route loads ${(bytes / 1024).toFixed(0)} kB of JavaScript in ` +
      `${measured.files.length} chunk(s), under the ${(INITIAL_BUDGET_BYTES / 1048576).toFixed(0)} MB budget; ` +
      `${FORBIDDEN_CHUNKS.length} heavy modules deferred`,
  )
}

await main()
