/**
 * Fail when the committed reproduction manifest disagrees with the source tree.
 *
 * The manifest claims, for every claim id, that a route can reach it — and for every
 * artifact, that a named npm script would rebuild it. Both are derived facts, so both
 * can drift: a claim moves to a new selector, a generator is renamed, an artifact is
 * added without wiring. Each of those makes the committed file quietly wrong, and the
 * Evidence section then tells a reader something untrue about how to reproduce a number.
 *
 * The check regenerates in memory and compares, so the only way to pass is to run
 * `npm run generate:reproduction-manifest` and commit the result.
 *
 * Usage:
 *   npm run check:reproduction-manifest
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const GENERATED = path.join(REPO_ROOT, 'src', 'evidence', 'reproductionManifest.generated.ts')

const before = readFileSync(GENERATED, 'utf8')

// Run the generator as a child process rather than importing it: the generator writes the
// file as a side effect, and importing it here would couple this check to its internals.
try {
  execFileSync('npx', ['tsx', 'scripts/generate_reproduction_manifest.ts'], {
    cwd: REPO_ROOT,
    stdio: 'pipe',
  })
} catch (error) {
  console.error('FAIL  the reproduction manifest generator did not run')
  console.error(String(error).slice(0, 2000))
  process.exit(1)
}

const after = readFileSync(GENERATED, 'utf8')

if (before === after) {
  // Count from the exported object so the pass message states a real measurement rather
  // than a regex's opinion; an earlier version printed "0 routes" while passing.
  const routeCount = (after.match(/"id": "([a-z]+)"/g) ?? []).length
  const artifactCount = (after.match(/"provenance": "(generated|copied|recorded)"/g) ?? []).length
  const claimCount = /MANIFEST_CLAIM_COUNT = (\d+)/.exec(after)?.[1] ?? '?'
  console.log(
    `PASS  reproduction manifest matches the source tree ` +
      `(${routeCount} routes, ${artifactCount} artifacts, ${claimCount} claims)`,
  )
  process.exit(0)
}

// Leave the tree as it was found: a check that rewrites the file it is checking turns a
// red build green on the next run without anyone deciding anything.
writeFileSync(GENERATED, before)

const firstDifference = (() => {
  const a = before.split('\n')
  const b = after.split('\n')
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) return { line: i + 1, committed: a[i] ?? '(end of file)', derived: b[i] ?? '(end of file)' }
  }
  return null
})()

console.error('FAIL  the reproduction manifest disagrees with the source tree')
if (firstDifference) {
  console.error(`      first difference at line ${firstDifference.line}`)
  console.error(`      committed: ${firstDifference.committed.trim().slice(0, 160)}`)
  console.error(`      derived:   ${firstDifference.derived.trim().slice(0, 160)}`)
}
console.error('      run `npm run generate:reproduction-manifest` and commit the result')
process.exit(1)
