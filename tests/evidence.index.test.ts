import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { listArtifactNames, computeArtifactConsumption } from '../src/evidence/artifactConsumption'
import { ARTIFACT_CONSUMPTION } from '../src/evidence/artifactConsumption.generated'
import { ARTIFACT_DESCRIPTIONS } from '../src/evidence/artifactDescriptions'
import { buildEvidenceIndex, withFacts } from '../src/evidence/evidenceIndex'

/**
 * The evidence index's numbers must describe the tree, not a memory of it.
 *
 * These assertions run against the real directory rather than fixtures: the failure mode
 * being guarded is a committed consumption list that has drifted from the code, and a
 * fixture cannot catch that.
 */
const ANALYSIS_DIR = path.resolve(__dirname, '../src/data/analysis')
const SRC_ROOT = path.resolve(__dirname, '../src')

describe('evidence index matches the tree', () => {
  const names = listArtifactNames(ANALYSIS_DIR)
  const consumption = computeArtifactConsumption(names, SRC_ROOT)

  it('discovers every artifact on disk, with no duplicates', () => {
    expect(new Set(names).size).toBe(names.length)
    expect(names.length).toBeGreaterThan(0)
  })

  it('describes every artifact', () => {
    const undescribed = names.filter((n) => !ARTIFACT_DESCRIPTIONS[n]?.trim())
    expect(undescribed).toEqual([])
  })

  it('describes each artifact in exactly one sentence', () => {
    // Prompt 2 asks for a one-sentence description. Seven of the first thirty-one were
    // two sentences, so the rule is asserted rather than remembered.
    const offenders = Object.entries(ARTIFACT_DESCRIPTIONS)
      .map(([name, description]) => {
        const sentences = description
          .trim()
          .split(/(?<=[.!?])\s+(?=[A-Z(])/)
          .filter((p) => p.trim()).length
        return { name, sentences }
      })
      .filter((e) => e.sentences !== 1)
    expect(offenders).toEqual([])
  })

  it('renders no \\u escape as literal text', () => {
    // The descriptions were written with JSON-style escapes in a TS string literal,
    // which reached the DOM as "/u2019" and also leaked the digits 2019 into the page.
    const escaped = Object.entries(ARTIFACT_DESCRIPTIONS).filter(([, d]) => /\\u[0-9a-fA-F]{4}/.test(d))
    expect(escaped).toEqual([])
  })

  it('carries no description for an artifact that is not on disk', () => {
    const orphans = Object.keys(ARTIFACT_DESCRIPTIONS).filter((n) => !names.includes(n))
    expect(orphans).toEqual([])
  })

  it('agrees with the committed consumption facts', () => {
    const importedNow = consumption
      .filter((c) => c.imported)
      .map((c) => c.name)
      .sort()
    expect([...ARTIFACT_CONSUMPTION.imported].sort()).toEqual(importedNow)
  })

  it('splits every artifact into imported, named-only or untouched', () => {
    const imported = new Set<string>(ARTIFACT_CONSUMPTION.imported)
    const namedOnly = new Set<string>(ARTIFACT_CONSUMPTION.referencedOnly)

    expect([...imported].filter((n) => namedOnly.has(n))).toEqual([])
    const classified = imported.size + namedOnly.size
    const untouched = names.filter((n) => !imported.has(n) && !namedOnly.has(n)).length
    expect(classified + untouched).toBe(names.length)
  })

  it('reports the imported count the interface prints', () => {
    // The headline claim is "10 of 33" after Prompt 5 wired the three limit artifacts from
    // rawdata/ to a committed artifact for Prompt 3. Pinned here so a changed number has
    // to be changed deliberately, alongside the sentence that states it.
    expect(names.length).toBe(33)
    expect(ARTIFACT_CONSUMPTION.imported.length).toBe(10)
    expect(ARTIFACT_CONSUMPTION.referencedOnly.length).toBe(11)
  })

  it('flags an artifact whose declared sample predates the current panel', () => {
    // construct_prevalence was last generated 2026-11-09 and still reports 146
    // complete cases while every 2026-11-11 artifact reports 207. Printing 146 beside
    // 207 without comment would present a superseded sample as current.
    const index = buildEvidenceIndex(ARTIFACT_CONSUMPTION)
    const facts = {
      construct_prevalence: { rowCount: 146 },
      metrics_authoritative: { rowCount: 207 },
      coefficient_fit: { rowCount: 207 },
      collinearity_diagnostics: { rowCount: 207 },
    }
    const built = withFacts(index, facts)
    const row = built.rows.find((r) => r.name === 'construct_prevalence')
    expect(row?.conflictsWithRows).toBe(207)
    expect(row?.rowCountIsSubset).toBe(false)
  })

  it('does not flag a legitimate sub-sample as stale', () => {
    // lockbox_holdout reports 87 because the reserved set was drawn from an 87-cell
    // panel. That is correct, and flagging it as stale would train the reader to
    // ignore the marker that matters.
    const index = buildEvidenceIndex(ARTIFACT_CONSUMPTION)
    const facts = {
      lockbox_holdout: { rowCount: 87 },
      metrics_authoritative: { rowCount: 207 },
      coefficient_fit: { rowCount: 207 },
    }
    const built = withFacts(index, facts)
    const row = built.rows.find((r) => r.name === 'lockbox_holdout')
    expect(row?.conflictsWithRows).toBe(207)
    expect(row?.rowCountIsSubset).toBe(true)
  })

  it('flags nothing when every artifact reports the same sample', () => {
    const index = buildEvidenceIndex(ARTIFACT_CONSUMPTION)
    const built = withFacts(index, {
      metrics_authoritative: { rowCount: 207 },
      coefficient_fit: { rowCount: 207 },
    })
    expect(built.rows.filter((r) => r.conflictsWithRows !== undefined)).toEqual([])
  })

  it('counts a prose mention as named-only, not as imported', () => {
    // These three are the ones the plan miscounted. They are named in
    // MathematicalAnalysisSection as <code>file.json</code> and never imported.
    for (const name of ['reviewer_red_team', 'q1_submission_gate_report', 'data_code_provenance']) {
      const entry = consumption.find((c) => c.name === name)
      expect(entry?.imported, `${name} must not count as imported`).toBe(false)
      expect(entry?.referenced, `${name} is named in source`).toBe(true)
    }
  })
})
