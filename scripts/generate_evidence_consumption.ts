/**
 * Generate the consumption facts the evidence index renders.
 *
 * The browser cannot scan `src/`, so the "which artifacts are wired in" answer has to
 * be committed data. This script derives it from real imports, and
 * `scripts/check_evidence_index.ts` re-derives it and fails on drift — so the committed
 * answer cannot quietly disagree with the code.
 *
 * Usage:
 *   npm run generate:evidence-consumption
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { computeArtifactConsumption, listArtifactNames } from '../src/evidence/artifactConsumption'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const ANALYSIS_DIR = path.join(REPO_ROOT, 'src', 'data', 'analysis')
const SRC_ROOT = path.join(REPO_ROOT, 'src')
const OUT_PATH = path.join(REPO_ROOT, 'src', 'evidence', 'artifactConsumption.generated.ts')

export function buildConsumptionModule(): { source: string; imported: string[]; referencedOnly: string[] } {
  const names = listArtifactNames(ANALYSIS_DIR)
  const consumption = computeArtifactConsumption(names, SRC_ROOT)

  const imported = consumption.filter((c) => c.imported).map((c) => c.name)
  const referencedOnly = consumption
    .filter((c) => !c.imported && c.referenced)
    .map((c) => c.name)

  const list = (items: string[]) =>
    items.length === 0 ? '[]' : `[\n${items.map((i) => `    '${i}',`).join('\n')}\n  ]`

  const source = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Produced by \`npm run generate:evidence-consumption\` from the real import statements
 * under \`src/\`. \`npm run check:evidence-index\` fails if this file disagrees with the
 * code, so the evidence index cannot claim an artifact is wired in when it is not.
 */
export const ARTIFACT_CONSUMPTION = {
  /** Imported somewhere under src/ — the artifact's values can reach the interface. */
  imported: ${list(imported)},
  /** Named in source but never imported: a reader could mistake this for wired-in. */
  referencedOnly: ${list(referencedOnly)},
} as const
`

  return { source, imported, referencedOnly }
}

function main(): void {
  const { source, imported, referencedOnly } = buildConsumptionModule()
  writeFileSync(OUT_PATH, source, 'utf8')
  const names = listArtifactNames(ANALYSIS_DIR)
  console.log(
    `✅ Evidence consumption -> ${path.relative(REPO_ROOT, OUT_PATH)} ` +
      `(${names.length} artifacts: ${imported.length} imported, ${referencedOnly.length} referenced only, ` +
      `${names.length - imported.length - referencedOnly.length} untouched)`,
  )
}

// Only run when invoked directly, so the check script can import the builder.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main()
}
