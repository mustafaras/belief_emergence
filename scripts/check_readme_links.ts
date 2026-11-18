/**
 * Fail when the README links to a file that is not in the tree.
 *
 * Deleting a module leaves its documentation behind, and a dead link is worse than no link:
 * a reader who follows it concludes the checkout is broken rather than that the file moved.
 * The P32 work deleted three files and found five such links, two of which predated it.
 *
 * Paths deliberately exempt:
 *   - anything outside the repository (http, mailto)
 *   - `rawdata/`, which is gitignored by design and absent from a fresh clone
 *   - links into git history, written as a commit hash in prose rather than as a path
 *
 * Usage:
 *   npm run check:readme-links
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const README = path.join(REPO_ROOT, 'README.md')

const EXEMPT = ['rawdata/', 'rawdata']

const source = readFileSync(README, 'utf8')
const broken: string[] = []
const seen = new Set<string>()

// `[label](target)` — label may contain brackets, so the target is captured from the last
// parenthesis of the link. Anchors-only links (`#section`) are not file references.
const pattern = /\[[^\]]*\]\(([^)\s]+)\)/g
let match: RegExpExecArray | null
while ((match = pattern.exec(source)) !== null) {
  const target = match[1].split('#')[0].trim()
  if (!target) continue
  if (/^(https?:|mailto:|tel:)/.test(target)) continue
  if (EXEMPT.includes(target)) continue
  if (seen.has(target)) continue
  seen.add(target)
  const resolved = path.join(REPO_ROOT, target)
  if (!existsSync(resolved)) broken.push(target)
}

if (broken.length === 0) {
  console.log(`PASS  every relative link in README.md resolves (${seen.size} checked)`)
  process.exit(0)
}

console.error(`FAIL  ${broken.length} link(s) in README.md point at files that do not exist`)
for (const target of broken) console.error(`      ${target}`)
console.error('      either add the file, fix the path, or state where it lives instead of linking it')
process.exit(1)
