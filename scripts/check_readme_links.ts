/**
 * Fail when the README links to a file that is not in the tree, or to a heading that is not
 * in the file.
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

/**
 * GitHub's heading-to-anchor rule, applied exactly: lower-case, drop everything that is not
 * a letter, digit, space or hyphen, then turn spaces into hyphens. Emoji and punctuation
 * disappear; `&` disappears too, which is why `## Citation & Attribution` becomes
 * `#citation--attribution` with two hyphens.
 */
function anchorFor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/ /g, '-')
}

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

// Same-file anchors: `[x](#some-heading)` must match a heading in this README.
const headings = new Set(
  [...source.matchAll(/^#{2,4}\s+(.+)$/gm)].map((match) => anchorFor(match[1].trim())),
)
const brokenAnchors: string[] = []
for (const match of source.matchAll(/\[[^\]]*\]\(#([^)\s]+)\)/g)) {
  const anchor = match[1]
  if (!headings.has(anchor) && !brokenAnchors.includes(anchor)) brokenAnchors.push(anchor)
}

if (broken.length === 0 && brokenAnchors.length === 0) {
  console.log(
    `PASS  every relative link in README.md resolves (${seen.size} files, ${headings.size} headings)`,
  )
  process.exit(0)
}

if (broken.length > 0) {
  console.error(`FAIL  ${broken.length} link(s) in README.md point at files that do not exist`)
  for (const target of broken) console.error(`      ${target}`)
  console.error('      either add the file, fix the path, or state where it lives instead of linking it')
}
if (brokenAnchors.length > 0) {
  console.error(`FAIL  ${brokenAnchors.length} in-page anchor(s) match no heading in README.md`)
  for (const anchor of brokenAnchors) console.error(`      #${anchor}`)
  console.error('      GitHub derives anchors from the heading text; check the heading still exists')
}
process.exit(1)
