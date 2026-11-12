/**
 * Build the artifact fact table the evidence index renders.
 *
 * WHY THIS EXISTS
 * ---------------
 * The index shows each artifact's schema version, generation time and declared row count.
 * It used to read those three fields by importing every artifact payload, which meant the
 * landing route requested 3.3 MB of JSON — `cv_kfold.json` alone is 1.8 MB — to print 33
 * rows of metadata. That put the initial payload over budget on its own, and it made the
 * first screen of an evidence surface depend on the largest files in the repository.
 *
 * This script reads them once at build time and writes the three fields to a single small
 * module. The index then renders immediately, and a payload is only fetched if a reader
 * asks for something that needs it.
 *
 * The extraction rules must match `src/evidence/artifactFacts.ts`, which is what the
 * runtime uses for any artifact fetched on demand. They are duplicated here rather than
 * imported because this runs in Node against raw JSON, and the browser module is typed for
 * the app. `check:evidence-index` compares the two outputs, so a divergence fails the gate
 * instead of producing two different answers.
 *
 * Usage:  npm run generate:artifact-facts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { listArtifactNames } from '../src/evidence/artifactConsumption'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const ANALYSIS_DIR = path.join(REPO_ROOT, 'src', 'data', 'analysis')
const OUT = path.join(REPO_ROOT, 'src', 'data', 'generated', 'artifactFacts.json')

const SCHEMA_KEYS = ['schemaVersion', 'schema_version', 'schema'] as const
const TIMESTAMP_KEYS = ['generatedAtIso', 'generated_at', 'generated', 'timestamp'] as const
const ROW_COUNT_KEYS = ['n', 'nRows', 'rows', 'totalRows', 'fullPanelNRows', 'nUniqueCountryYears'] as const

const firstString = (source: Record<string, unknown>, keys: readonly string[]) => {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

const firstNumber = (source: Record<string, unknown>, keys: readonly string[]) => {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return undefined
}

/** A number every element reports identically, else undefined. */
function sharedNumber(items: unknown[], key: string): number | undefined {
  const values = items.map((item) =>
    item && typeof item === 'object'
      ? firstNumber(item as Record<string, unknown>, [key])
      : undefined,
  )
  if (values.some((v) => v === undefined)) return undefined
  return new Set(values).size === 1 ? (values[0] as number) : undefined
}

export type ArtifactFacts = {
  schemaVersion?: string
  generatedAt?: string
  rowCount?: number
}

/** Mirrors `readArtifactFacts` in src/evidence/artifactFacts.ts. */
export function extractFacts(parsed: unknown): ArtifactFacts {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const record = parsed as Record<string, unknown>

  let rowCount = firstNumber(record, ROW_COUNT_KEYS)

  if (rowCount === undefined && record.source && typeof record.source === 'object') {
    rowCount = firstNumber(record.source as Record<string, unknown>, ['nRows'])
  }
  if (rowCount === undefined && record.frame && typeof record.frame === 'object') {
    rowCount = firstNumber(record.frame as Record<string, unknown>, ['canonicalCompleteCases'])
  }
  if (rowCount === undefined && Array.isArray(record.variants)) {
    rowCount = sharedNumber(record.variants, 'n')
  }
  if (rowCount === undefined && Array.isArray(record.splits) && record.splits.length > 0) {
    const first = record.splits[0]
    if (first && typeof first === 'object') {
      rowCount = firstNumber(first as Record<string, unknown>, ['n'])
    }
  }
  if (rowCount === undefined && record.supportMask && typeof record.supportMask === 'object') {
    rowCount = firstNumber(record.supportMask as Record<string, unknown>, ['nUniqueCountryYears'])
  }

  // Omit undefined keys entirely: a JSON `null` would render as a value, and the renderer
  // distinguishes "declares nothing" (em dash) from "declares zero".
  const facts: ArtifactFacts = {}
  const schemaVersion = firstString(record, SCHEMA_KEYS)
  const generatedAt = firstString(record, TIMESTAMP_KEYS)
  if (schemaVersion) facts.schemaVersion = schemaVersion
  if (generatedAt) facts.generatedAt = generatedAt
  if (rowCount !== undefined) facts.rowCount = rowCount
  return facts
}

export function buildFactsTable(): Record<string, ArtifactFacts> {
  const table: Record<string, ArtifactFacts> = {}
  for (const name of listArtifactNames(ANALYSIS_DIR)) {
    try {
      const parsed = JSON.parse(readFileSync(path.join(ANALYSIS_DIR, `${name}.json`), 'utf8'))
      table[name] = extractFacts(parsed)
    } catch {
      // An unreadable artifact renders with em dashes, which is the honest answer.
      table[name] = {}
    }
  }
  return table
}

function main(): void {
  const table = buildFactsTable()
  const payload = {
    schemaVersion: 'phase1.artifact_facts.v1',
    purpose:
      'Schema version, generation time and declared row count for every analysis artifact, so the evidence index renders without fetching the payloads.',
    generator: 'scripts/generate_artifact_facts.ts',
    note:
      'Regenerate with npm run generate:artifact-facts. check:evidence-index fails if this disagrees with the artifacts on disk.',
    facts: table,
  }
  writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  const withRows = Object.values(table).filter((f) => f.rowCount !== undefined).length
  console.log(
    `✅ ${path.relative(REPO_ROOT, OUT)} (${Object.keys(table).length} artifacts, ` +
      `${withRows} declaring a row count)`,
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main()
}
