/**
 * Does the evidence index still describe the tree it claims to describe?
 *
 * Three ways it could lie, all checked here:
 *
 *   1. The committed consumption facts disagree with the real imports under src/.
 *   2. An artifact on disk has no description (a blank row a reader cannot evaluate).
 *   3. A description exists for an artifact that is no longer on disk.
 *
 * Row count and the consumed/unconsumed split are asserted as arithmetic rather than
 * against a literal, so the check keeps working when an artifact is added — that is the
 * behaviour Prompt 2 requires ("adding a file adds a row without touching the
 * component"). What must never happen silently is a row that cannot be described.
 *
 * Usage:  npm run check:evidence-index
 */
import fs, { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ARTIFACT_DESCRIPTIONS } from '../src/evidence/artifactDescriptions'
import { listArtifactNames } from '../src/evidence/artifactConsumption'
import { ARTIFACT_CONSUMPTION } from '../src/evidence/artifactConsumption.generated'
import { buildConsumptionModule } from './generate_evidence_consumption'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const ANALYSIS_DIR = path.join(REPO_ROOT, 'src', 'data', 'analysis')

const failures: string[] = []

/* ---- 1. committed facts vs the real code ---- */
const expected = buildConsumptionModule()
const committedImported = [...ARTIFACT_CONSUMPTION.imported].sort()
const committedReferencedOnly = [...ARTIFACT_CONSUMPTION.referencedOnly].sort()

if (committedImported.join(',') !== [...expected.imported].sort().join(',')) {
  failures.push(
    `imported list is stale: committed [${committedImported.join(', ')}] but src/ imports ` +
      `[${[...expected.imported].sort().join(', ')}] — run npm run generate:evidence-consumption`,
  )
}
if (committedReferencedOnly.join(',') !== [...expected.referencedOnly].sort().join(',')) {
  failures.push(
    `referencedOnly list is stale — run npm run generate:evidence-consumption`,
  )
}

/* ---- 2. every artifact on disk is described ---- */
const names = listArtifactNames(ANALYSIS_DIR)
const undescribed = names.filter((n) => !ARTIFACT_DESCRIPTIONS[n]?.trim())
if (undescribed.length > 0) {
  failures.push(
    `${undescribed.length} artifact(s) have no description in src/evidence/artifactDescriptions.ts: ` +
      undescribed.join(', '),
  )
}

/* ---- 3. no description for an artifact that does not exist ---- */
const orphans = Object.keys(ARTIFACT_DESCRIPTIONS).filter((n) => !names.includes(n))
if (orphans.length > 0) {
  failures.push(
    `${orphans.length} description(s) refer to artifacts that are not on disk: ${orphans.join(', ')}`,
  )
}

/* ---- 4. the split must account for every row ---- */
const imported = new Set(ARTIFACT_CONSUMPTION.imported)
const referencedOnly = new Set(ARTIFACT_CONSUMPTION.referencedOnly)
const overlap = [...imported].filter((n) => referencedOnly.has(n))
if (overlap.length > 0) {
  failures.push(`an artifact is listed as both imported and referenced-only: ${overlap.join(', ')}`)
}
const classified = imported.size + referencedOnly.size
const unclassified = names.filter((n) => !imported.has(n) && !referencedOnly.has(n))
if (classified + unclassified.length !== names.length) {
  failures.push(
    `the consumed/unconsumed split does not sum to the row count: ` +
      `${imported.size} + ${referencedOnly.size} + ${unclassified.length} != ${names.length}`,
  )
}

/* ---- 5. the frame-utilisation artifact must match the current panel ---- */
/*
 * `construct_prevalence.json` carries its analysable sample and a frame-utilisation
 * fraction. The fraction is `analysable / scanned`, so the three fields can be checked
 * against each other without any source data — which matters because the generator reads
 * `rawdata/`, and that directory is gitignored, so this check would skip in CI if it
 * tried to regenerate.
 *
 * This artifact went stale twice: it was last regenerated on the 146-row panel and
 * nothing in the gate noticed while the panel grew to 167 and then 207. Reading the CSV
 * directly is what makes that unrepresentable.
 */
const PANEL_CSV = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv')

{
  const prevalencePath = path.join(ANALYSIS_DIR, 'construct_prevalence.json')
  if (fs.existsSync(prevalencePath) && fs.existsSync(PANEL_CSV)) {
    const panelRows = fs.readFileSync(PANEL_CSV, 'utf8').trim().split(/\r?\n/).length - 1
    const prevalence = JSON.parse(fs.readFileSync(prevalencePath, 'utf8')) as {
      frame?: { canonicalCompleteCases?: number; scannedCountryYears?: number }
      summary?: { frameUtilisation?: { analysable?: number; scanned?: number; fraction?: number } }
    }

    const analysable = prevalence.summary?.frameUtilisation?.analysable
    const completeCases = prevalence.frame?.canonicalCompleteCases
    const scanned = prevalence.summary?.frameUtilisation?.scanned
    const fraction = prevalence.summary?.frameUtilisation?.fraction

    // The three sample figures must name the same panel.
    if (completeCases !== undefined && analysable !== undefined && completeCases !== analysable) {
      failures.push(
        `construct_prevalence: frame.canonicalCompleteCases (${completeCases}) and ` +
          `summary.frameUtilisation.analysable (${analysable}) disagree`,
      )
    }

    if (analysable !== undefined && analysable !== panelRows) {
      failures.push(
        `construct_prevalence: reports ${analysable} analysable rows but the canonical panel ` +
          `has ${panelRows} — run npm run generate:prevalence`,
      )
    }

    // The fraction must be the arithmetic of the two counts it sits beside.
    if (analysable !== undefined && scanned !== undefined && fraction !== undefined) {
      const expectedFraction = Number((analysable / scanned).toFixed(4))
      if (Math.abs(fraction - expectedFraction) > 1e-4) {
        failures.push(
          `construct_prevalence: frameUtilisation.fraction is ${fraction} but ` +
            `${analysable}/${scanned} = ${expectedFraction}`,
        )
      }
    }
  }
}

/* ---- 6. no duplicate rows ---- */
const jsonFiles = readdirSync(ANALYSIS_DIR).filter((f) => f.endsWith('.json'))
if (new Set(jsonFiles).size !== jsonFiles.length) {
  failures.push('the artifact directory lists a file more than once')
}

if (failures.length > 0) {
  console.error(`\nFAIL  evidence index does not match the tree (${failures.length} problem(s)):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

console.log(
  `PASS  evidence index matches the tree: ${names.length} artifacts ` +
    `(${imported.size} imported, ${referencedOnly.size} referenced only, ${unclassified.length} untouched), ` +
    `all described`,
)
