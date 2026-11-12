import { describe, expect, it } from 'vitest'
import {
  DESCRIPTION_NUMBERS,
  NON_NUMERIC_PROSE_PATTERN,
  extractNumericClaims,
} from '../src/evidence/descriptionNumbers'
import { ARTIFACT_DESCRIPTIONS } from '../src/evidence/artifactDescriptions'

/**
 * The descriptions are hand-written prose shown verbatim to the reader. A number typed
 * into a sentence is a displayed number with nothing behind it, so the rules that govern
 * them are tested here rather than trusted.
 */
describe('extractNumericClaims', () => {
  it('finds a decimal claim', () => {
    expect(extractNumericClaims('maximum VIF of 9.43 across covariates')).toEqual(['9.43'])
  })

  it('does not treat R2 or the model ladder as a number', () => {
    expect(extractNumericClaims('it does on held-out R2')).toEqual([])
    expect(extractNumericClaims('The A/B/C model ladder with each tier')).toEqual([])
    // Both at once, which is how the real descriptions read.
    expect(extractNumericClaims('The A/B/C ladder, judged on held-out R2')).toEqual([])
  })

  it('still finds a real number hiding beside prose that contains digits', () => {
    // The guard is a pattern list, not "strip all digits", so this must survive.
    expect(extractNumericClaims('The A/B/C ladder reaches R2 with a VIF of 9.43')).toEqual(['9.43'])
  })

  it('finds nothing in a purely qualitative description', () => {
    expect(
      extractNumericClaims('Whether the Tier C ordering survives removing covariates'),
    ).toEqual([])
  })

  it('resets the shared pattern between calls', () => {
    // NON_NUMERIC_PROSE_PATTERN is a /g regex; a stale lastIndex would make the second
    // call disagree with the first.
    const text = 'The A/B/C ladder judged on R2'
    expect(extractNumericClaims(text)).toEqual(extractNumericClaims(text))
    expect(NON_NUMERIC_PROSE_PATTERN.lastIndex).toBeDefined()
  })
})

describe('description claims', () => {
  it('derives the VIF claim at the precision the prose uses', () => {
    const claim = DESCRIPTION_NUMBERS.collinearity_diagnostics?.[0]
    expect(claim?.kind).toBe('derived')
    if (claim?.kind !== 'derived') return
    expect(claim.compute({ maxVif: 9.4274 })).toBe('9.43')
    // A changed artifact must produce a different expected value, not a stale one.
    expect(claim.compute({ maxVif: 8.7412 })).toBe('8.74')
  })

  it('reads the Gini window from the artifact purpose rather than restating it', () => {
    const claim = DESCRIPTION_NUMBERS.gini_window_sensitivity?.[0]
    expect(claim?.kind).toBe('derived')
    if (claim?.kind !== 'derived') return
    expect(
      claim.compute({ purpose: 'The adopted window is +/-5.' }),
    ).toBe('5')
    expect(claim.compute({ purpose: 'no window stated' })).toBeUndefined()
  })

  it('declares a claim for every description that states a number', () => {
    for (const [name, description] of Object.entries(ARTIFACT_DESCRIPTIONS)) {
      const tokens = extractNumericClaims(description)
      if (tokens.length === 0) continue
      expect(DESCRIPTION_NUMBERS[name], `${name} states ${tokens.join(', ')}`).toBeDefined()
    }
  })

  it('has no declared claim for a description that states no number', () => {
    for (const name of Object.keys(DESCRIPTION_NUMBERS)) {
      expect(extractNumericClaims(ARTIFACT_DESCRIPTIONS[name] ?? '')).not.toEqual([])
    }
  })
})
