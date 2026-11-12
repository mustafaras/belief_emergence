/**
 * Are the artifact descriptions still one sentence each, and are the numbers in them
 * still true?
 *
 * Prompt 2 asks for "a one-sentence description". That was a rule with no enforcement, so
 * it held only for as long as someone remembered it — seven of the first thirty-one were
 * two sentences. This check makes both halves of the rule mechanical:
 *
 *   1. every description is exactly one sentence;
 *   2. every number in a description either has a declared source in
 *      `src/evidence/descriptionNumbers.ts` and matches it, or is listed as prose.
 *
 * The second rule is the one that matters. A VIF typed into a sentence is a displayed
 * number with no artifact behind it, which is the defect this whole plan exists to close.
 *
 * Usage:  npm run check:description-numbers
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ARTIFACT_DESCRIPTIONS } from '../src/evidence/artifactDescriptions'
import { DESCRIPTION_NUMBERS, extractNumericClaims } from '../src/evidence/descriptionNumbers'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const ANALYSIS_DIR = path.join(REPO_ROOT, 'src', 'data', 'analysis')

const failures: string[] = []
let sentencesChecked = 0
let numbersChecked = 0

/**
 * Split into sentences without being fooled by the abbreviations this prose uses.
 *
 * Simple `(?<=[.!?])\s+` splitting is enough here because the descriptions contain no
 * "e.g." or "i.e.", but a trailing em dash or a decimal ("9.43") must not create a break.
 */
function countSentences(description: string): number {
  const trimmed = description.trim()
  if (!trimmed) return 0
  const parts = trimmed
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map((p) => p.trim())
    .filter(Boolean)
  return parts.length
}

for (const [name, rawDescription] of Object.entries(ARTIFACT_DESCRIPTIONS)) {
  const description = rawDescription.trim()

  /* ---- 1. exactly one sentence ---- */
  const sentences = countSentences(description)
  sentencesChecked += 1
  if (sentences !== 1) {
    failures.push(`${name}: description has ${sentences} sentences; Prompt 2 asks for one`)
  }

  /* ---- 2. every number is accounted for ---- */
  const tokens = extractNumericClaims(description)
  if (tokens.length === 0) continue

  const claims = DESCRIPTION_NUMBERS[name]
  if (!claims || claims.length === 0) {
    failures.push(
      `${name}: description states ${tokens.join(', ')} but no claim is declared in ` +
        `src/evidence/descriptionNumbers.ts — either derive it from its artifact or ` +
        `record why it is prose`,
    )
    continue
  }

  for (const claim of claims) {
    numbersChecked += 1

    if (claim.kind === 'literal') {
      if (!description.includes(claim.value)) {
        failures.push(
          `${name}: declared prose value "${claim.value}" (${claim.reason}) does not appear ` +
            `in the description`,
        )
      }
      continue
    }

    const artifactPath = path.join(ANALYSIS_DIR, `${claim.artifact}.json`)
    let artifact: Record<string, unknown>
    try {
      artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as Record<string, unknown>
    } catch {
      failures.push(`${name}: cannot read artifact ${claim.artifact}.json`)
      continue
    }

    const expected = claim.compute(artifact)
    if (expected === undefined) {
      failures.push(
        `${name}: could not derive ${claim.label} from ${claim.artifact}.json — ` +
          `the artifact's shape changed, so the description's number is now unverified`,
      )
      continue
    }
    if (!description.includes(String(expected))) {
      failures.push(
        `${name}: description does not quote the derived ${claim.label}. ` +
          `Artifact gives ${expected}`,
      )
    }
  }

  // Any numeric token the declared claims cannot account for is still a bare claim.
  const declared = claims
    .map((c) => (c.kind === 'derived' ? String(c.compute(
      JSON.parse(readFileSync(path.join(ANALYSIS_DIR, `${c.artifact}.json`), 'utf8')) as Record<string, unknown>,
    ) ?? '') : c.value))
    .filter(Boolean)
  const unexplained = tokens.filter((token) => !declared.some((d) => d.includes(token)))
  if (unexplained.length > 0) {
    failures.push(
      `${name}: number(s) ${unexplained.join(', ')} are in the description but not covered by ` +
        `a declared claim`,
    )
  }
}

if (failures.length > 0) {
  console.error(`\nFAIL  artifact descriptions (${failures.length} problem(s)):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

console.log(
  `PASS  ${sentencesChecked} descriptions are one sentence each; ` +
    `${numbersChecked} numeric claim(s) match their artifacts`,
)
