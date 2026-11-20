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

  it('reports the submission bundle honestly, wherever it is running', () => {
    /*
     * The bundle is built by the workflow's assemble step, so it exists on a developer machine
     * that has run it and does not exist on a fresh CI checkout. The first version of this test
     * asserted `MISSING (0)` unconditionally and failed in CI for a reason that was not a defect.
     *
     * What the script must guarantee is the property, not the count: every one of the five
     * expected files is either present in the READY list or named in the MISSING list. A file
     * that appears in neither would be silently dropped.
     */
    const output = report()
    const expected = [
      '01_manuscript.pdf',
      '02_supplementary.pdf',
      '03_title_page.pdf',
      '04_cover_letter.pdf',
      '05_highlights.pdf',
    ]
    const missingSection = /MISSING FROM THE SUBMISSION BUNDLE \((\d+)\)([\s\S]*?)(?:\n\n|$)/.exec(output)
    const readySection = /READY \(\d+\)([\s\S]*)$/.exec(output)
    const missingCount = Number(missingSection?.[1] ?? '0')

    for (const file of expected) {
      const inMissing = (missingSection?.[2] ?? '').includes(file)
      const inReady = (readySection?.[1] ?? '').includes(file)
      expect(inMissing || inReady, `${file} is in neither list`).toBe(true)
    }
    expect(missingCount).toBe(expected.filter((file) => (missingSection?.[2] ?? '').includes(file)).length)
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
