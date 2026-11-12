import { describe, expect, it } from 'vitest'
import {
  formatRowCount,
  formatTimestamp,
  readArtifactFacts,
} from '../src/evidence/artifactFacts'

/**
 * The evidence index prints a schema version, timestamp and row count for 31 artifacts
 * that were generated at different times and do not agree on their own key names. These
 * cases pin each declared shape, and — more importantly — pin the fallbacks, because a
 * guessed row count is exactly the kind of number this project has already shipped
 * wrong once.
 */
describe('readArtifactFacts', () => {
  it('reads the common schemaVersion / generatedAtIso / nRows shape', () => {
    const facts = readArtifactFacts({
      schemaVersion: 'phase1.example.v1',
      generatedAtIso: '2026-11-11T14:47:09.111Z',
      nRows: 207,
    })
    expect(facts.schemaVersion).toBe('phase1.example.v1')
    expect(facts.generatedAt).toBe('2026-11-11T14:47:09.111Z')
    expect(facts.rowCount).toBe(207)
  })

  it('reads the snake_case variant', () => {
    const facts = readArtifactFacts({
      schema_version: 'phase1.data_code_provenance.v1',
      generated_at: '2026-11-09T11:30:00.000Z',
    })
    expect(facts.schemaVersion).toBe('phase1.data_code_provenance.v1')
    expect(facts.generatedAt).toBe('2026-11-09T11:30:00.000Z')
  })

  it('reads the bare `schema` / `generated` variant', () => {
    const facts = readArtifactFacts({ schema: 'notation.v1', generated: '2026-11-09T11:15:00Z' })
    expect(facts.schemaVersion).toBe('notation.v1')
    expect(facts.generatedAt).toBe('2026-11-09T11:15:00Z')
  })

  it('falls back to the nested source.nRows', () => {
    expect(readArtifactFacts({ source: { nRows: 87 } }).rowCount).toBe(87)
  })

  it('does not read a timestamp from a key that merely contains "date"', () => {
    // Regression: a heuristic over "any key containing date" reported
    // manuscript_update_recommendations as the generation time.
    const facts = readArtifactFacts({
      manuscript_update_recommendations: '2026-11-01',
      generated: '2026-11-09T11:20:00Z',
    })
    expect(facts.generatedAt).toBe('2026-11-09T11:20:00Z')
  })

  it('does not read a recommendation list as a generation time', () => {
    const facts = readArtifactFacts({ manuscript_update_recommendations: 'anything' })
    expect(facts.generatedAt).toBeUndefined()
  })

  it('never infers a row count from array length', () => {
    // `folds` is the fold count, not the sample size. Reporting it as rows would be a
    // fabricated number.
    const facts = readArtifactFacts({ folds: [{}, {}, {}], perRepeatRefit: [] })
    expect(facts.rowCount).toBeUndefined()
  })

  it('reports no facts for a non-object artifact', () => {
    expect(readArtifactFacts([1, 2, 3])).toEqual({})
    expect(readArtifactFacts(null)).toEqual({})
    expect(readArtifactFacts('string')).toEqual({})
  })

  it('ignores a non-finite or non-numeric row count', () => {
    expect(readArtifactFacts({ nRows: Number.NaN }).rowCount).toBeUndefined()
    expect(readArtifactFacts({ nRows: '207' }).rowCount).toBeUndefined()
  })

  it('prefers the top-level count over the nested one', () => {
    expect(readArtifactFacts({ nRows: 207, source: { nRows: 87 } }).rowCount).toBe(207)
  })

  it('reads a count shared by every variant', () => {
    // r_collinearity_case: two specifications, both fitted on 207 rows.
    const facts = readArtifactFacts({ variants: [{ n: 207 }, { n: 207 }] })
    expect(facts.rowCount).toBe(207)
  })

  it('does not invent a count when variants disagree', () => {
    expect(readArtifactFacts({ variants: [{ n: 207 }, { n: 146 }] }).rowCount).toBeUndefined()
  })

  it('uses only the first split as the sample', () => {
    // zero_fill_sensitivity: the "full panel" split is the panel; the second entry is
    // the same panel with 42 rows deleted and must not overwrite it.
    const facts = readArtifactFacts({
      splits: [{ label: 'full panel', n: 207 }, { label: 'zero-anchor rows removed', n: 165 }],
    })
    expect(facts.rowCount).toBe(207)
  })

  it('reads the support mask country-year count', () => {
    expect(readArtifactFacts({ supportMask: { nUniqueCountryYears: 207 } }).rowCount).toBe(207)
  })
})

describe('formatRowCount / formatTimestamp', () => {
  it('renders an em dash rather than a zero when a count is absent', () => {
    // A missing count must not read as "0 rows".
    expect(formatRowCount(undefined)).toBe('—')
  })

  it('groups thousands', () => {
    expect(formatRowCount(1234)).toBe('1,234')
  })

  it('shortens an ISO timestamp to minute precision', () => {
    expect(formatTimestamp('2026-11-11T14:47:09.111Z')).toBe('2026-11-11 14:47')
  })

  it('renders an em dash for a missing timestamp', () => {
    expect(formatTimestamp(undefined)).toBe('—')
  })

  it('keeps a present but unparseable timestamp rather than hiding it', () => {
    expect(formatTimestamp('not-a-timestamp')).toBe('not-a-timestamp')
  })
})
