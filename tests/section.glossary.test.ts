// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { GLOSSARY, regimeTex } from '../src/sections/glossary/glossaryData'
import glossary from '../src/data/analysis/notation_glossary.json'

describe('the notation glossary', () => {
  it('lists every symbol the artifact defines', () => {
    /*
     * Only the list-valued entries are terms. `coefficient_terms` also carries `status_note`, a
     * sentence, and `flat()` spreads a string into its characters — so the old form counted 164
     * rows that do not exist and expected 57 where the artifact defines 56. Both this test and
     * the builder were reading the same field the same wrong way, which is why the mismatch
     * survived: the numbers only disagreed once the builder was fixed.
     */
    const termLists = Object.values(glossary.coefficient_terms).filter(Array.isArray) as unknown[][]
    const expected =
      glossary.model_variables.length +
      glossary.greek_letters.length +
      glossary.derived_quantities.length +
      glossary.hyperparameters.length +
      termLists.flat().length
    expect(GLOSSARY).toHaveLength(expected)
  })

  it('carries a source and a window for every row rather than leaving them blank', () => {
    for (const entry of GLOSSARY) {
      expect(entry.source.trim().length).toBeGreaterThan(0)
      // A window is either a formatted range or an explicit em dash. An empty string would
      // read as "no window" and "not checked" at the same time. The range may be negative:
      // the inequality index is standardised, so its fitted window starts below zero.
      expect(entry.window === '—' || /^-?\d/.test(entry.window)).toBe(true)
    }
  })

  it('states the fitted window for model variables, from the artifact not by hand', () => {
    const x = GLOSSARY.find((entry) => entry.symbol === 'X')
    expect(x?.window).toBe('0.103 to 0.954')
    expect(x?.section).toBe('Model variable')
  })

  it('keeps interaction definitions, which the name alone does not carry', () => {
    const interaction = GLOSSARY.find((entry) => entry.symbol === 'c_xy')
    expect(interaction?.definition).toBe('X · Y')
    expect(GLOSSARY.find((entry) => entry.symbol === 'c_M')?.definition).toContain('M')
  })

  it('converts the five regime operators to TeX', () => {
    for (const regime of glossary.regime_definitions) {
      const tex = regimeTex(regime.formal_definition)
      expect(tex).not.toMatch(/≤|≥|→/)
      expect(tex.length).toBeGreaterThan(0)
    }
    expect(regimeTex('0.33 ≤ Z < 0.67')).toBe('0.33 \\le Z < 0.67')
  })
})
