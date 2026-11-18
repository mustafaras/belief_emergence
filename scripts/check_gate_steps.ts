/**
 * Fail when the committed gate step list disagrees with `scripts/ci_gate.ts`.
 *
 * The Evidence page tells a reader what the gate checks and how many checks there are. Both
 * are facts about the gate, so they are generated from it. If the gate grows a step and this
 * list is not regenerated, the page describes a gate the repository does not run — which is
 * the failure mode that makes reproducibility documentation worthless.
 *
 * Usage:
 *   npm run check:gate-steps
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const GENERATED = path.join(REPO_ROOT, 'src', 'sections', 'reproduce', 'gateSteps.generated.ts')

const before = readFileSync(GENERATED, 'utf8')

try {
  execFileSync('npx', ['tsx', 'scripts/generate_gate_steps.ts'], { cwd: REPO_ROOT, stdio: 'pipe' })
} catch (error) {
  console.error('FAIL  the gate step generator did not run')
  console.error(String(error).slice(0, 2000))
  process.exit(1)
}

const after = readFileSync(GENERATED, 'utf8')

if (before === after) {
  const steps = (after.match(/\{ phase: "/g) ?? []).length
  const total = /total: (\d+)/.exec(after)?.[1] ?? '?'
  const documented = /documentedTotal: (\d+)/.exec(after)?.[1]
  console.log(`PASS  gate step list matches scripts/ci_gate.ts (${steps} literal steps, ${total} total)`)
  if (documented && documented !== total) {
    console.error(`FAIL  the gate reported ${documented} checks when the list was reviewed, but now runs ${total}`)
    process.exit(1)
  }
  process.exit(0)
}

writeFileSync(GENERATED, before)

const a = before.split('\n')
const b = after.split('\n')
for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
  if (a[i] !== b[i]) {
    console.error('FAIL  the gate step list disagrees with scripts/ci_gate.ts')
    console.error(`      first difference at line ${i + 1}`)
    console.error(`      committed: ${(a[i] ?? '(end)').trim().slice(0, 140)}`)
    console.error(`      derived:   ${(b[i] ?? '(end)').trim().slice(0, 140)}`)
    break
  }
}
console.error('      run `npm run generate:gate-steps` and commit the result')
process.exit(1)
