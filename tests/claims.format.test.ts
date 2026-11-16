import { describe, expect, it } from 'vitest'
import { formatClaim } from '../src/claims/format'
import { getClaim } from '../src/claims/registry'

describe('formatClaim', () => {
  it('formats grouped integers', () => {
    expect(formatClaim(442026, 'int')).toBe('442,026')
    expect(formatClaim(1200, 'int')).toBe('1,200')
  })

  it('formats r2 values to four decimals', () => {
    expect(formatClaim(0.4061, 'r2')).toBe('0.4061')
    expect(formatClaim(1, 'r2')).toBe('1.0000')
  })

  it('formats p4 values to four decimals', () => {
    expect(formatClaim(0.1387, 'p4')).toBe('0.1387')
    expect(formatClaim(0.0048, 'p4')).toBe('0.0048')
  })

  it('formats p3 values to three decimals', () => {
    expect(formatClaim(1.23456, 'p3')).toBe('1.235')
    expect(formatClaim(0, 'p3')).toBe('0.000')
  })

  it('formats p2 values to two decimals', () => {
    expect(formatClaim(1.234, 'p2')).toBe('1.23')
    expect(formatClaim(0, 'p2')).toBe('0.00')
  })

  it('formats proportions as one-decimal percentages', () => {
    expect(formatClaim(0.679, 'pct1')).toBe('67.9%')
    expect(formatClaim(1, 'pct1')).toBe('100.0%')
  })

  it('preserves the exact number string', () => {
    expect(formatClaim(42, 'exact')).toBe('42')
    expect(formatClaim(0.4061, 'exact')).toBe('0.4061')
  })

  it('formats signed values with an explicit sign and a real minus', () => {
    expect(formatClaim(0.39, 'signed2')).toBe('+0.39')
    expect(formatClaim(-0.14, 'signed2')).toBe('−0.14')
  })

  it('keeps three places for signed values that cross zero in the third', () => {
    // The zero-fill lab rests on a gap that moves from −0.0079 to +0.0005. At two
    // places the crossing prints as "+0.00" and the finding is invisible, which is
    // the precise way this lab can stop being true while still rendering.
    expect(formatClaim(-0.007917, 'signed3')).toBe('−0.008')
    expect(formatClaim(0.000452, 'signed3')).toBe('+0.000')
    expect(formatClaim(-0.028747, 'signed3')).toBe('−0.029')
    expect(formatClaim(-0.007917, 'signed3')).not.toBe(formatClaim(-0.007917, 'signed2'))
  })

  it('throws for unknown claim ids', () => {
    expect(() => getClaim('missing.claim')).toThrow()
  })
})
