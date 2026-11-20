import { describe, expect, it } from 'vitest'
import { findRetiredValues } from '../scripts/check_readme_metrics'

/**
 * The guards on the README's prose.
 *
 * These exist because the checker's exemptions had a hole nobody could see by reading it: the
 * list exempted the bare word `Lighthouse`, so "Our Lighthouse score is 98" passed the check that
 * exists to stop exactly that. It was found by appending the sentence to the README and watching
 * the check pass, which is the only way to find an over-broad exemption.
 *
 * So this file tests the guards, not the README: each retired figure must be caught in prose, and
 * each exemption must stay narrow enough to be describable in one line.
 */

const caught = (line: string) => findRetiredValues(line).length > 0

describe('README retired-value guards', () => {
  it('catches a performance figure nothing measures, stated as fact', () => {
    expect(caught('Total bundle: 447 KB gzipped.')).toBe(true)
    expect(caught('FCP is 0.8s on the landing route.')).toBe(true)
    expect(caught('Benchmarks measured on Intel Core i7-12700K with an RTX 3080')).toBe(true)
    expect(caught('Heap stays under 28 MB.')).toBe(true)
  })

  it('catches a Lighthouse score in prose, not just in a table', () => {
    // The word alone is not the claim; the score is. Asserted in prose because that is the form
    // that walked through the previous exemption.
    expect(caught('Our Lighthouse score is 98.')).toBe(true)
    expect(caught('Lighthouse: Performance 94/100')).toBe(true)
  })

  it('catches a monitoring integration this project does not have', () => {
    expect(caught('The beacon posts to /api/analytics.')).toBe(true)
    expect(caught("import { getLCP } from 'web-vitals';")).toBe(true)
  })

  it('catches the retired panel and fit figures', () => {
    expect(caught('The panel has 630 country-year observations.')).toBe(true)
    expect(caught('The model explains 84.61% of variance.')).toBe(true)
  })

  it('still lets the removal table record what was removed', () => {
    // The record that those numbers existed is worth keeping; deleting it to satisfy the guard
    // would lose the only trace of them. Narrow on purpose: a row of that table, nothing else.
    expect(caught('| Bundle breakdown | 447 KB total | the gate measures 179 KiB gzipped |')).toBe(false)
    expect(caught('| Lighthouse scores | 94 / 98 / 100 / 100 | Lighthouse is not a dependency |')).toBe(false)
    expect(caught('| `web-vitals` beacon | posts to `/api/analytics` | no dependency, no endpoint |')).toBe(false)
  })

  it('does not excuse a retired value merely because the line mentions the removal', () => {
    // The failure mode that made the first version useless: an exemption wide enough to swallow
    // the surrounding prose rather than the specific row.
    expect(caught('We removed the old table but our Lighthouse score is still 98.')).toBe(true)
    expect(caught('Bundle breakdown was wrong; the real total is 447 KB.')).toBe(true)
  })

  it('passes a line about performance that states a measured value', () => {
    expect(caught('Initial JavaScript is 179 KiB gzipped, measured by check:bundle-budget.')).toBe(false)
    expect(caught('First contentful paint, 96 ms median of 3 cold runs.')).toBe(false)
  })
})
