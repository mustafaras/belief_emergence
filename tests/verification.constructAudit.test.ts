import { describe, expect, it } from 'vitest'
import auditArtifact from '../src/data/analysis/wvs_construct_audit.json'
import {
  RELIABILITY_FLOOR,
  buildConstructRows,
  requiredItems,
  summarise,
  verdictFor,
  type AuditArtifact,
  type AuditConstruct,
} from '../src/verification/constructAudit'

/**
 * The construct audit's verdict rule.
 *
 * The `S_social_support` case is the reason this module exists as a pure function rather
 * than as JSX: the artifact carries a plausible-looking alpha (0.753) for a construct
 * that emitted zero cells, and the wrong ordering of two `if` statements turns the
 * paper's central finding into its opposite.
 */
const base: AuditConstruct = {
  itemsConfigured: 6,
  itemsUsed: ['a', 'b', 'c', 'd', 'e', 'f'],
  cellsEmitted: 300,
  cellsRejected: 5,
  computable: true,
  cronbachAlpha: 0.82,
  unidimensional: true,
}

describe('verdictFor', () => {
  it('retains a computable, unidimensional construct above the floor', () => {
    expect(verdictFor(base).verdict).toBe('retained')
  })

  it('withdraws a construct whose alpha is below the floor', () => {
    const result = verdictFor({ ...base, cronbachAlpha: 0.35 })
    expect(result.verdict).toBe('withdrawn')
    expect(result.reason).toMatch(/below/i)
  })

  it('withdraws a multi-dimensional construct even with a high alpha', () => {
    // A high alpha with items that do not load on one factor is still not a construct.
    const result = verdictFor({ ...base, cronbachAlpha: 0.91, unidimensional: false })
    expect(result.verdict).toBe('withdrawn')
    expect(result.reason).toMatch(/single dimension/i)
  })

  it('withdraws a negative alpha', () => {
    expect(verdictFor({ ...base, cronbachAlpha: -1.23 }).verdict).toBe('withdrawn')
  })

  it('reports not-computable for a construct that emitted no cells, whatever its alpha', () => {
    // The trap: 0.753 is above the 0.70 floor, so a rule that reads alpha before
    // `computable` calls this "retained" — a reliability figure for zero observations.
    const trap: AuditConstruct = {
      itemsConfigured: 7,
      itemsUsed: [],
      cellsEmitted: 0,
      cellsRejected: 305,
      computable: false,
      cronbachAlpha: 0.753,
      unidimensional: true,
    }
    const result = verdictFor(trap)
    expect(result.verdict).toBe('uncomputable')
    expect(result.reason).toMatch(/not computable/i)
    expect(result.reason).not.toContain('0.753')
    // Without availability data the reason must NOT invent a shortfall: itemsUsed is
    // empty because the composite was never assembled, not because every item is missing.
    expect(result.reason).not.toMatch(/7 of 7/)
    expect(result.reason).toMatch(/could not be assembled/i)
  })

  it('states the real item shortfall when availability is known', () => {
    // KI-11: four of seven items are absent (A101, A106, F185, F186); three survive where
    // the coverage floor requires four. This is what the paper reports, and what the
    // interface must say — "7 of 7 unavailable" is a different and false statement.
    const trap: AuditConstruct = {
      itemsConfigured: 7,
      itemsUsed: [],
      cellsEmitted: 0,
      cellsRejected: 305,
      computable: false,
      cronbachAlpha: 0.753,
      unidimensional: true,
    }
    const result = verdictFor(trap, {
      count: 3,
      items: ['A101', 'A106', 'F185', 'F186'],
    })
    expect(result.reason).toMatch(/4 of 7/)
    expect(result.reason).toMatch(/A101/)
    expect(result.reason).toMatch(/leaving 3/)
    expect(result.reason).toMatch(/requires 4/)
    expect(result.reason).not.toContain('0.753')
  })

  it('derives the coverage floor the build applies', () => {
    // min_item_coverage = 0.5 from config/wvs_items.yaml defaults.
    expect(requiredItems(7)).toBe(4)
    expect(requiredItems(6)).toBe(3)
    expect(requiredItems(5)).toBe(3)
  })

  it('treats computable-with-zero-cells as uncomputable', () => {
    // Defensive: a contradictory artifact must not produce an alpha-bearing row.
    const contradictory: AuditConstruct = { ...base, cellsEmitted: 0, computable: true }
    expect(verdictFor(contradictory).verdict).toBe('uncomputable')
  })

  it('treats a null alpha on a computable construct as uncomputable', () => {
    expect(verdictFor({ ...base, cronbachAlpha: null }).verdict).toBe('uncomputable')
  })
})

describe('buildConstructRows against the real artifact', () => {
  const rows = buildConstructRows(auditArtifact as unknown as AuditArtifact)

  it('emits one row per construct', () => {
    expect(rows).toHaveLength(Object.keys(auditArtifact.constructs).length)
  })

  it('never exposes an alpha for the uncomputable construct', () => {
    const s = rows.find((r) => r.id === 'S_social_support')
    expect(s).toBeDefined()
    expect(s?.verdict).toBe('uncomputable')
    expect(s?.alpha).toBeNull()
    expect(s?.suppressedAlpha).toBe(true)
  })

  it('records the suppression rather than dropping the fact', () => {
    // The artifact does carry 0.753; the row must say so is suppressed, not pretend the
    // field was absent.
    expect(auditArtifact.constructs.S_social_support.cronbachAlpha).toBeCloseTo(0.753, 3)
    const s = rows.find((r) => r.id === 'S_social_support')
    expect(s?.suppressedAlpha).toBe(true)
  })

  it('gives every non-retained row a reason', () => {
    for (const row of rows.filter((r) => r.verdict !== 'retained')) {
      expect(row.reason.length).toBeGreaterThan(20)
    }
  })

  it('reproduces the paper’s three-of-four finding', () => {
    const summary = summarise(rows)
    expect(summary.total).toBe(4)
    expect(summary.retained).toBe(1)
    expect(summary.withdrawn).toBe(2)
    expect(summary.uncomputable).toBe(1)
    expect(summary.failureRate).toBeCloseTo(0.75, 10)
  })

  it('uses the floor the paper states', () => {
    expect(RELIABILITY_FLOOR).toBe(0.7)
  })
})
