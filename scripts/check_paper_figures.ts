/**
 * Fail when the README's screenshots and the capture specs disagree.
 *
 * The README displayed thirteen v1 screenshots for months. Nothing failed, because an image
 * either loads or does not — and these all loaded: they showed a product that no longer
 * existed, still printing `Panel N = 630`. A picture cannot be checked against a claim the way
 * a number can, but its *existence and coverage* can: every image the README shows must have a
 * capture spec, and every spec must be shown.
 *
 * Usage:
 *   npm run check:paper-figures
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

try {
  const output = execFileSync('npx', ['tsx', 'scripts/capture_paper_figures.ts', '--check'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  })
  const summary = output.split('\n').filter((line) => line.startsWith('PASS')).join('\n')
  console.log(summary || 'PASS  paper figure specs match the README')
} catch (error) {
  const detail = error instanceof Error && 'stdout' in error ? String(error.stdout) : String(error)
  console.error(detail.trim())
  process.exit(1)
}
