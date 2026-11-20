/**
 * Generate the gate step list from the gate itself.
 *
 * `scripts/ci_gate.ts` is the authority on what the gate checks: it declares its phases as
 * arrays of `{ label, cmd }`. The Evidence page lists those steps, so it reads them from
 * that source instead of holding a copy. `npm run check:gate-steps` re-derives the list and
 * fails on drift — a gate that grew a check the page does not mention is a documentation
 * bug that this makes impossible.
 *
 * Usage:
 *   npm run generate:gate-steps
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const GATE = path.join(REPO_ROOT, 'scripts', 'ci_gate.ts')
const OUT = path.join(REPO_ROOT, 'src', 'sections', 'reproduce', 'gateSteps.generated.ts')

type Step = { phase: string; label: string; needs: string }

const source = readFileSync(GATE, 'utf8')

/** The `console.log('\n── Phase N: Name ──')` calls, in file order. */
const phases: Array<{ at: number; name: string }> = []
{
  const pattern = /console\.log\(\s*'\\n── ([^']+?) ──'\s*\)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    phases.push({ at: match.index, name: match[1].trim() })
  }
}

/**
 * `{ label: 'X', cmd: 'npm run y' }` entries plus the bare `{ label: 'X', cmd: ... }`
 * forms, each attributed to the phase that precedes it.
 */
const steps: Step[] = []
{
  const pattern = /\{\s*label:\s*'([^']+)'\s*,\s*cmd:\s*'([^']+)'[^}]*\}/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    const [, label, command] = match
    const phase = [...phases].reverse().find((entry) => entry.at < (match as RegExpExecArray).index)
    const needs = /render|browser|surface-snapshot|routes/.test(command)
      ? 'a browser and a running server'
      : /python3|\.py/.test(command)
        ? 'Python 3'
        : 'Node only'
    steps.push({ phase: phase?.name ?? 'Preflight', label, needs })
  }
}

/**
 * Steps declared as `record(...)` calls with a literal label, which covers the phases that
 * are code rather than a table: the canonical fingerprint, artifact presence and schema
 * checks each record one or many rows without going through `runCommand`.
 */
{
  // Only a quoted first argument is a literal label. Accepting a bare identifier matched the
  // helper's own signature (`record(step: string, pass: boolean, …)`), which published a step
  // called "step: string" on the Evidence page. A template literal stays excluded on purpose: a
  // label built from data cannot be listed without evaluating the loop that builds it.
  //
  // A record whose verdict is the literal `false` describes an *error* branch — "the metrics file
  // is missing", "regeneration failed" — and contributes no row to a run that passes. Counting
  // those overstated the total by three. A label that also appears with a real verdict keeps its
  // row, because the pairing means one of the two always fires.
  const pattern = /record\(\s*(?:'(?<sq>[^']+)'|"(?<dq>[^"]+)")\s*,\s*(?<verdict>[^,]+),/g
  const literal: Array<{ at: number; label: string; always: boolean }> = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    const label = (match.groups?.sq ?? match.groups?.dq ?? '').trim()
    if (!label) continue
    literal.push({
      at: match.index,
      label,
      always: (match.groups?.verdict ?? '').trim() !== 'false',
    })
  }
  const hasAlways = new Set(literal.filter((entry) => entry.always).map((entry) => entry.label))
  for (const entry of literal) {
    if (!hasAlways.has(entry.label)) continue
    if (steps.some((step) => step.label === entry.label)) continue
    const phase = [...phases].reverse().find((declared) => declared.at < entry.at)
    steps.push({ phase: phase?.name ?? 'Preflight', label: entry.label, needs: 'Node only' })
  }
}

const unique: Step[] = []
for (const step of steps) {
  if (!unique.some((entry) => entry.label === step.label && entry.phase === step.phase)) unique.push(step)
}

/**
 * Steps the gate emits from a loop rather than as a literal.
 *
 * Artifact presence and schema versions each record one row per expected file, so the
 * static list above undercounts what the gate actually runs. Both counts are derived from
 * the tables the loops iterate, and both are reported: "28 declarations, 91 checks" is the
 * honest description, and it is what the Evidence page prints.
 */
const expectedArtifacts = (() => {
  // Named REQUIRED_ARTIFACTS, and each entry is `path.join(ANALYSIS, 'x.json')`.
  const block = /REQUIRED_ARTIFACTS[^=]*=\s*\[([\s\S]*?)\n\]/.exec(source)
  if (!block) return 0
  return (block[1].match(/path\.join\([^)]*\.(?:json|csv)'\)/g) ?? []).length
})()

const expectedSchemas = (() => {
  const block = /EXPECTED_SCHEMAS[^=]*=\s*\{([\s\S]*?)\n\}/.exec(source)
  if (!block) return 0
  return (block[1].match(/^\s*'[^']+':\s*\{/gm) ?? []).length
})()

const expectedMetrics = (() => {
  // CANONICAL_METRICS records one row per key: `{ key: 'x', expected: 1, tolerance: 1e-9 }`.
  const block = /CANONICAL_METRICS[^=]*=\s*\[([\s\S]*?)\n\]/.exec(source)
  if (!block) return 0
  return (block[1].match(/\bkey:\s*'/g) ?? []).length
})()

const loopGenerated = expectedArtifacts + expectedSchemas + expectedMetrics

const list = unique
  .map((step) => `  { phase: ${JSON.stringify(step.phase)}, label: ${JSON.stringify(step.label)}, needs: ${JSON.stringify(step.needs)} },`)
  .join('\n')

const output = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Produced by \`npm run generate:gate-steps\` from the step declarations in
 * \`scripts/ci_gate.ts\`. \`npm run check:gate-steps\` fails when the two disagree, so this
 * page cannot describe a gate the repository does not run.
 */
import type { GateStep } from './gateSteps'

/** Steps written as a literal in the gate. */
export const GATE_STEPS: GateStep[] = [
${list}
]

/**
 * Additional checks the gate runs from inside a loop: one per expected artifact and one per
 * expected schema version. Together with GATE_STEPS these account for every row the gate
 * prints, so a page can say "91 checks" without hardcoding the number.
 */
export const GATE_LOOP_CHECKS = {
  artifactPresence: ${expectedArtifacts},
  schemaVersions: ${expectedSchemas},
  canonicalMetrics: ${expectedMetrics},
  total: ${unique.length + loopGenerated},
} as const
`

writeFileSync(OUT, output)
console.log(
  `wrote ${path.relative(REPO_ROOT, OUT)}: ${unique.length} literal steps + ` +
    `${loopGenerated} loop checks (${expectedArtifacts} artifacts, ${expectedSchemas} schemas, ${expectedMetrics} metrics) = ` +
    `${unique.length + loopGenerated} total across ${new Set(unique.map((s) => s.phase)).size} phases`,
)
for (const phase of new Set(unique.map((s) => s.phase))) {
  console.log(`  ${phase}: ${unique.filter((s) => s.phase === phase).length}`)
}
