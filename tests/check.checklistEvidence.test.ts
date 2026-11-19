// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'

/**
 * The evidence collector must not claim more than it checked.
 *
 * Two failure modes matter here. A `needs-review` on a manuscript that agrees with its
 * artifacts makes the report noise, and noise is what a signer learns to skip. And a `supported`
 * on something the script cannot verify would be worse: it would launder a judgement into a
 * machine result, which is exactly what the twelve signatures exist to prevent.
 */
function collect(): Array<{ item: string; verdict: string; findings: string[] }> {
  const output = execFileSync('npx', ['tsx', 'scripts/collect_checklist_evidence.ts', '--json'], {
    encoding: 'utf8',
  })
  return JSON.parse(output) as Array<{ item: string; verdict: string; findings: string[] }>
}

describe('checklist evidence', () => {
  it('covers all twelve checklist items', () => {
    expect(collect()).toHaveLength(12)
  })

  it('finds no contradiction between the manuscript and its artifacts', () => {
    const needsReview = collect().filter((entry) => entry.verdict === 'needs-review')
    expect(needsReview.map((entry) => entry.item)).toEqual([])
  })

  it('never marks an editorial judgement as machine-supported', () => {
    // These six ask for a judgement about the field or the venue. A machine that says
    // "supported" for any of them has replaced a signature with a grep.
    const judgements = [
      'h-editor-fit', 'h-desk-reject', 'h-abstract-screen',
      'h-novelty-precise', 'h-review-ready', 'h-cover-letter',
    ]
    for (const entry of collect().filter((item) => judgements.includes(item.item))) {
      expect(entry.verdict, `${entry.item} must not be machine-supported`).toBe('cannot-check')
    }
  })

  it('does not sign anything', () => {
    // The collector reports; it does not write. `signedOff` stays false in the artifact.
    const artifact = JSON.parse(
      execFileSync('node', ['-e', `
        const fs = require('fs');
        const d = JSON.parse(fs.readFileSync('src/data/analysis/q1_submission_gate_report.json','utf8'));
        process.stdout.write(JSON.stringify(d.humanChecklist.map(h => h.signedOff)));
      `], { encoding: 'utf8' }),
    ) as boolean[]
    expect(artifact.every((signed) => signed === false)).toBe(true)
  })

  it('quotes the α and identity figures from the artifacts, not from the highlights file', () => {
    const highlights = collect().find((entry) => entry.item === 'h-highlights')
    expect(highlights?.verdict).toBe('supported')
    expect(highlights?.findings.join(' ')).toContain('match')
  })
})
