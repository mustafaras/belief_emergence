// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Signatures must survive regeneration, and must say who gave them.
 *
 * The generator used to write `signedOff: false` unconditionally, so a signature was undone by
 * the next `npm run q1:gate`. These tests pin the two properties that make a signature worth
 * anything: it is durable, and it is attributable.
 */
const artifact = JSON.parse(
  readFileSync('src/data/analysis/q1_submission_gate_report.json', 'utf8'),
) as {
  humanChecklist: Array<{
    id: string
    signedOff: boolean
    signedBy?: string
    signedOn?: string
    basis?: string
    evidence?: string
  }>
}
const record = JSON.parse(
  readFileSync('src/data/analysis/human_checklist_signatures.json', 'utf8'),
) as {
  signer: { name: string }
  signatures: Array<{ id: string; signedBy: string; signedOn: string; basis: string; evidence: string }>
}

describe('human checklist signatures', () => {
  it('signs every item that has a signature record', () => {
    for (const entry of record.signatures) {
      const item = artifact.humanChecklist.find((h) => h.id === entry.id)
      expect(item, `${entry.id} is signed but absent from the report`).toBeDefined()
      expect(item?.signedOff, `${entry.id} has a record but is not signed off`).toBe(true)
    }
  })

  it('carries who signed, when, and on what basis', () => {
    for (const item of artifact.humanChecklist.filter((h) => h.signedOff)) {
      expect(item.signedBy, `${item.id} has no signer`).toBeTruthy()
      expect(item.signedOn, `${item.id} has no date`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(item.basis, `${item.id} has no basis`).toBeTruthy()
      // A bare boolean is what made the old signature unauditable.
      expect(item.basis?.length ?? 0).toBeGreaterThan(40)
    }
  })

  it('distinguishes what a machine checked from what a person decided', () => {
    const byEvidence = new Map<string, number>()
    for (const entry of record.signatures) {
      byEvidence.set(entry.evidence, (byEvidence.get(entry.evidence) ?? 0) + 1)
    }
    // Both kinds exist, and the split is stated rather than implied: six items are backed by
    // `check:checklist-evidence`, six are editorial judgements no file can answer.
    expect(byEvidence.get('artifact-supported')).toBe(6)
    expect(byEvidence.get('judgement-only')).toBe(6)
  })

  it('attributes every signature to the same named person', () => {
    const signers = new Set(record.signatures.map((entry) => entry.signedBy))
    expect(signers.size).toBe(1)
    expect([...signers][0]).toBe(record.signer.name)
  })

  it('will not lose the signatures when the gate regenerates the report', () => {
    // The generator previously wrote `signedOff: false` for every item, so a signature was
    // undone by the next `q1:gate`. Guard against that returning: comments are stripped first,
    // because the prose explaining the old behaviour necessarily contains the old expression.
    const source = readFileSync('scripts/q1_submission_gate.ts', 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(/signedOff:\s*false/.test(code), 'a hardcoded false would erase every signature').toBe(false)
    expect(code).toContain('readSignatures()')
  })

  it('never marks a judgement-only item as machine-verified', () => {
    // This is the line between recording a decision and fabricating a result.
    for (const entry of record.signatures.filter((s) => s.evidence === 'judgement-only')) {
      expect(entry.basis).not.toMatch(/verified mechanically|check:checklist-evidence verified/i)
    }
  })
})
