import { describe, expect, it } from 'vitest'
import {
  buildCorpus,
  extractTokens,
  printedDecimals,
  resolveToken,
  roundsToToken,
} from '../src/verification/numberResolution'
import { ALLOWLIST, isAllowlisted } from '../src/verification/allowlist'

/**
 * The rules that decide whether a number on screen is backed by something.
 *
 * Every case here corresponds to a real failure found while building the check, so these
 * are regressions, not hypotheticals.
 */
describe('extractTokens', () => {
  it('keeps the sign', () => {
    // A bare \d+(\.\d+)? turned -0.0856 into 0.0856, which made a sign error undetectable.
    expect(extractTokens('Panel mean (μ)\t-0.0856\t[-0.2244, 0.0533]')).toEqual([
      '-0.0856',
      '-0.2244',
      '0.0533',
    ])
  })

  it('finds integers and decimals together', () => {
    expect(extractTokens('Panel N = 207, R2 = 0.3461')).toEqual(['207', '2', '0.3461'])
  })
})

describe('roundsToToken', () => {
  it('accepts a real rounding relationship at four places', () => {
    // 0.08555143 is the panel Z mean; printed at four places it is 0.0856.
    expect(roundsToToken(0.08555143762850088, '0.0856')).toBe(true)
    // 0.085539 is a different value and correctly rounds to 0.0855 instead.
    expect(roundsToToken(0.085539, '0.0856')).toBe(false)
  })

  it('rejects a coarse token whose source is barely more precise', () => {
    // `0.69` has a half-unit window of 0.005. A two-place token is only accepted when the
    // source carries at least four decimals, so a loosely-matching coarse value is
    // rejected; 0.6912 -> 0.69 is a real rounding and is accepted below.
    expect(roundsToToken(0.691, '0.69')).toBe(false)
  })

  it('accepts a precise source rounding to two places', () => {
    // 9.4274 -> 9.43 is how the VIF is printed; refusing it would drop real coverage.
    expect(roundsToToken(9.4274, '9.43')).toBe(true)
  })

  it('still accepts an exact match at coarse precision', () => {
    expect(roundsToToken(0.69, '0.69')).toBe(true)
    expect(roundsToToken(207, '207')).toBe(true)
  })

  it('rejects a value outside the printed precision', () => {
    expect(roundsToToken(0.08565, '0.0856')).toBe(false)
  })
})

describe('resolveToken', () => {
  const corpus = buildCorpus([{ a: 0.08553902592545931, b: 207, c: 'ratio 0.6787' }])

  it('resolves an exact value', () => {
    expect(resolveToken('207', corpus)).toEqual({ status: 'resolved', how: 'exact' })
  })

  it('resolves a genuine rounding at four places', () => {
    // 0.08553902 printed at four places is 0.0855, which is a rounding, not an exact hit.
    expect(resolveToken('0.0855', corpus)).toEqual({ status: 'resolved', how: 'rounded' })
  })

  it('resolves numbers embedded in artifact strings', () => {
    expect(resolveToken('0.6787', corpus)).toEqual({ status: 'resolved', how: 'exact' })
  })

  it('reports an unrelated number as unresolved', () => {
    expect(resolveToken('1234.5', corpus).status).toBe('unresolved')
  })

  it('never matches on substring', () => {
    // 135.2561 contains "35.2561"; a substring check would resolve 35.2561 here.
    const narrow = buildCorpus([{ v: 135.2561 }])
    expect(resolveToken('35.2551', narrow).status).toBe('unresolved')
  })

  it('applies the permissive policy only when asked', () => {
    // The derived corpus holds the interface's own arithmetic, so a 1dp display of it is
    // legitimate; the artifact corpus is too dense for that allowance.
    const derived = buildCorpus([{ v: 0.892031 }])
    expect(resolveToken('0.9', derived).status).toBe('unresolved')
    expect(resolveToken('0.9', derived, 'permissive')).toEqual({
      status: 'resolved',
      how: 'rounded',
    })
  })
})

describe('allowlist', () => {
  it('stays under the cap Prompt 6 sets', () => {
    expect(ALLOWLIST.length).toBeLessThan(10)
  })

  it('gives every entry a source and a reason', () => {
    for (const entry of ALLOWLIST) {
      expect(entry.source.length).toBeGreaterThan(0)
      expect(entry.reason.length).toBeGreaterThan(20)
    }
  })

  it('matches exactly, not by rounding', () => {
    // Round-to matching let a deliberate 0.001 shift through.
    expect(isAllowlisted('2.61')).toBe(true)
    expect(isAllowlisted('2.62')).toBe(false)
  })
})

describe('printedDecimals', () => {
  it('counts places after the point', () => {
    expect(printedDecimals('207')).toBe(0)
    expect(printedDecimals('0.69')).toBe(2)
    expect(printedDecimals('0.0856')).toBe(4)
  })
})
