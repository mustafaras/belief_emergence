// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/**
 * The submission-state report must agree with the tree it describes.
 *
 * This is the last gate before a submission run, so the two ways it can be wrong both matter:
 * a false negative lets an unsigned checklist reach a portal, and a false positive teaches its
 * reader to ignore it. The tests below pin the parts that are checkable without a person.
 */
function report(): string {
  try {
    return execFileSync('npx', ['tsx', 'scripts/check_submission_state.ts'], { encoding: 'utf8' })
  } catch (error) {
    // The script exits 1 while anything is outstanding, which is the normal state.
    return String((error as { stdout?: string }).stdout ?? '')
  }
}

describe('submission state', () => {
  it('reports no stale documents', () => {
    const output = report()
    expect(output).toMatch(/STALE — DOCUMENT DISAGREES WITH THE TREE \(0\)/)
  })

  it('finds the submission bundle in the manuscript worktree', () => {
    const output = report()
    expect(output).toMatch(/MISSING FROM THE SUBMISSION BUNDLE \(0\)/)
    expect(output).toContain('01_manuscript.pdf')
  })

  it('counts the human signatures from the Q1 artifact rather than from a constant', () => {
    const artifact = JSON.parse(
      readFileSync('src/data/analysis/q1_submission_gate_report.json', 'utf8'),
    ) as { humanChecklist: Array<{ signedOff: boolean }> }
    const unsigned = artifact.humanChecklist.filter((item) => !item.signedOff).length
    expect(report()).toContain(`BLOCKING — HUMAN SIGNATURE REQUIRED (${unsigned})`)
  })

  it('states the panel size the CSV actually has', () => {
    const csv = readFileSync('public/data/panel_canonical_v2.csv', 'utf8')
    const rows = csv.trim().split(/\r?\n/).length - 1
    expect(report()).toContain(`${rows} rows`)
  })

  it('does not carry a stale panel figure in the support checklist question', () => {
    const artifact = JSON.parse(
      readFileSync('src/data/analysis/q1_submission_gate_report.json', 'utf8'),
    ) as { humanChecklist: Array<{ id: string; question: string }> }
    const support = artifact.humanChecklist.find((item) => item.id === 'h-support')
    const csv = readFileSync('public/data/panel_canonical_v2.csv', 'utf8')
    const rows = csv.trim().split(/\r?\n/).length - 1
    // The question once said n=146 — the sample two rebuilds ago — inside the check that
    // exists to stop documents describing a different panel.
    expect(support?.question).toContain(`n=${rows} country-years`)
  })
})
