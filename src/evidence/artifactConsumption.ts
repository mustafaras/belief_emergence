/**
 * Which artifacts any module actually consumes.
 *
 * Derived from real import statements in `src/`, so the answer cannot drift from the
 * code. Two different questions are answered, because collapsing them is what let the
 * plan understate the gap:
 *
 *   imported  — a module imports the JSON and can use its values.
 *   referenced — a module only names the file in prose (e.g. `<code>a.json</code>`),
 *               which a reader can mistake for the artifact being wired in.
 *
 * Only `imported` counts as consumed. At the time of writing that is 5 of 31; the
 * documents said 7 because three prose mentions were counted as consumption.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

export type ArtifactConsumption = {
  /** Basename without `.json`. */
  name: string
  /** The artifact's JSON is imported somewhere under `src/`. */
  imported: boolean
  /** The artifact is named in source, whether imported or only mentioned. */
  referenced: boolean
  /** Source files that import it. */
  importedBy: string[]
}

const IMPORT_PATTERN = /from\s+['"][^'"]*data\/analysis\/([A-Za-z0-9_.-]+)\.json['"]/g
const DYNAMIC_IMPORT_PATTERN = /import\(\s*['"][^'"]*data\/analysis\/([A-Za-z0-9_.-]+)\.json['"]\s*\)/g
const GLOB_PATTERN = /import\.meta\.glob\(\s*['"][^'"]*data\/analysis[^'"]*['"]/

function listSourceFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        // Skip the artifact directory itself: artifacts are data, not consumers.
        if (path.basename(full) === 'analysis') continue
        walk(full)
        continue
      }
      if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
    }
  }
  walk(root)
  return out
}

/**
 * Scan `src/` and report consumption for every artifact basename passed in.
 *
 * A glob loader would consume every artifact; if one is introduced, every artifact is
 * reported as imported rather than guessed at per-file.
 */
export function computeArtifactConsumption(
  artifactNames: string[],
  srcRoot: string,
): ArtifactConsumption[] {
  const files = listSourceFiles(srcRoot)
  const importedBy = new Map<string, string[]>()
  let globWired = false

  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    if (GLOB_PATTERN.test(text)) globWired = true

    for (const pattern of [IMPORT_PATTERN, DYNAMIC_IMPORT_PATTERN]) {
      pattern.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1]
        const existing = importedBy.get(name) ?? []
        const rel = path.relative(path.dirname(srcRoot), file)
        if (!existing.includes(rel)) existing.push(rel)
        importedBy.set(name, existing)
      }
    }
  }

  return artifactNames.map((name) => {
    const importers = importedBy.get(name) ?? []
    // A prose mention is any source file naming the artifact that is not one of the
    // importers. Checked per file rather than with a substring count so an import is
    // not double-counted as a reference.
    const mentioned = files.some((file) => {
      const rel = path.relative(path.dirname(srcRoot), file)
      if (importers.includes(rel)) return false
      return readFileSync(file, 'utf8').includes(`${name}.json`)
    })

    return {
      name,
      imported: globWired || importers.length > 0,
      referenced: importers.length > 0 || mentioned,
      importedBy: importers,
    }
  })
}

/** Names of every `.json` artifact currently on disk. */
export function listArtifactNames(analysisDir: string): string[] {
  return readdirSync(analysisDir)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => statSync(path.join(analysisDir, f)).isFile())
    .map((f) => f.slice(0, -'.json'.length))
    .sort()
}
