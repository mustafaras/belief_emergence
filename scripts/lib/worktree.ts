/**
 * Where the manuscript lives, in either checkout layout.
 *
 * This repository is developed as two worktrees — `repo/` on the manuscript branch and
 * `repo-app-v2/` on this one — and shipped as a single checkout (CI, a clean clone). Three
 * scripts needed the manuscript and each resolved it slightly differently, which produced a
 * defect that only appeared in one of the two layouts:
 *
 *   - In the two-worktree layout, this branch has no `paper/` of its own, so the sibling is the
 *     manuscript.
 *   - In a single checkout, this branch **does** carry a `paper/` — an older copy than the
 *     manuscript branch — and reading the sibling instead means reading a manuscript nobody is
 *     editing.
 *
 * The previous order put the sibling first. In a clean clone that directory does not exist, so
 * it worked there; in the two-worktree layout it read the stale copy and the checklist collector
 * reported that the paper states no country-year counts. The rule is now: prefer a directory
 * that actually contains `paper/main/main.tex`, nearest first.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

export function resolveManuscriptRoot(appRoot: string): string {
  const worktree = path.resolve(appRoot, '..')
  const candidates = [
    // The app's own parent: correct in a single checkout, absent in the two-worktree layout.
    worktree,
    path.join(worktree, 'repo'),
    path.join(worktree, '..'),
  ]
  return (
    candidates.find((candidate) => existsSync(path.join(candidate, 'paper', 'main', 'main.tex'))) ??
    worktree
  )
}
