/**
 * Does the preset table still reproduce from the canonical panel?
 *
 * The table was hand-maintained for two revisions and drifted: of 115 values checkable
 * against the shipped panel, 113 did not reproduce. The scales were mixed — Australia
 * `X = 0.85` matched the raw panel mean while `T = -1.57` was standardised — and several
 * values matched neither. Nothing noticed, because nothing derived them.
 *
 * This re-derives the table from the panel and compares. It is the check that would have
 * caught the drift on the day it happened.
 *
 * Usage:  npm run check:presets
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Papa from 'papaparse'

import { buildPresets } from './generate_presets'
import { GENERATED_PRESETS } from '../src/data/presets.generated'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const PANEL = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv')

const failures: string[] = []

if (!fs.existsSync(PANEL)) {
  console.error('FAIL  the canonical panel is missing')
  process.exit(1)
}

const parsed = Papa.parse<Record<string, string>>(fs.readFileSync(PANEL, 'utf8'), {
  header: true,
  skipEmptyLines: true,
})
const derived = buildPresets(parsed.data)

/* ---- 1. the same countries, in the same order ---- */
const committedNames = GENERATED_PRESETS.map((p) => p.iso3)
const derivedNames = derived.map((p) => p.iso3)
if (committedNames.join(',') !== derivedNames.join(',')) {
  const missing = derivedNames.filter((n) => !committedNames.includes(n))
  const extra = committedNames.filter((n) => !derivedNames.includes(n))
  failures.push(
    `country set differs: missing [${missing.join(', ')}], extra [${extra.join(', ')}] — ` +
      `run npm run generate:presets`,
  )
}

/* ---- 2. every value reproduces ---- */
const byIso = new Map(derived.map((p) => [p.iso3, p]))
let compared = 0

for (const committed of GENERATED_PRESETS) {
  const expected = byIso.get(committed.iso3)
  if (!expected) continue

  for (const [key, value] of Object.entries(committed.values)) {
    const want = expected.values[key]
    if (want === undefined) {
      failures.push(`${committed.iso3}.${key}: committed but not derivable from the panel`)
      continue
    }
    compared += 1
    // The generator rounds to four places; anything beyond that is a real difference.
    if (Math.abs(value - want) > 1e-4) {
      failures.push(
        `${committed.iso3}.${key}: committed ${value}, panel gives ${want} — ` +
          `run npm run generate:presets`,
      )
    }
  }

  if (committed.observations !== expected.observations) {
    failures.push(
      `${committed.iso3}: committed ${committed.observations} observations, panel has ` +
        `${expected.observations}`,
    )
  }
}

/* ---- 3. the unavailable channels are declared, not silently zero ---- */
for (const preset of GENERATED_PRESETS) {
  for (const column of ['C', 'D', 'S', 'G']) {
    if (!preset.unavailable.includes(column)) {
      failures.push(
        `${preset.iso3}: ${column} is structurally unavailable in the panel but is not ` +
          `listed in \`unavailable\` — a zero that is not declared reads as a measurement`,
      )
    }
    if (preset.values[column] !== 0) {
      failures.push(
        `${preset.iso3}.${column}: unavailable channel carries ${preset.values[column]}, ` +
          `expected the standardised mean 0`,
      )
    }
  }
}

/* ---- 4. X stays on the raw panel scale, which is what the slider is labelled in ---- */
for (const preset of GENERATED_PRESETS) {
  const x = preset.values.X
  if (x < 0 || x > 1) {
    failures.push(`${preset.iso3}.X = ${x} is outside the panel's [0, 1] range`)
  }
}

if (failures.length > 0) {
  console.error(`\nFAIL  presets (${failures.length} problem(s)):`)
  for (const failure of failures.slice(0, 20)) console.error(`  - ${failure}`)
  if (failures.length > 20) console.error(`  … and ${failures.length - 20} more`)
  process.exit(1)
}

console.log(
  `PASS  ${GENERATED_PRESETS.length} presets, ${compared} values reproduce from the panel; ` +
    `C/D/S/G declared unavailable in all of them`,
)
