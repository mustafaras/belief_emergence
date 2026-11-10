import { describe, expect, it } from 'vitest';

import zeroFill from '../src/data/analysis/zero_fill_sensitivity.json';

/**
 * The trauma backfill imputed T = -1.4923 for 29 country-years where EM-DAT
 * records no qualifying disaster. Those are inferences, not measurements, and
 * the paper discloses them. This test makes sure the disclosure is not hiding
 * the load-bearing role: if the reported ordering only holds while the imputed
 * rows are present, the result rests on imputation and the prose is wrong.
 */

describe('the result does not depend on the imputed zero-death rows', () => {
  it('identifies the zero-anchor rows it is testing', () => {
    expect(zeroFill.nZeroAnchor).toBe(30);
    const full = zeroFill.splits.find((s) => s.label === 'full panel');
    const reduced = zeroFill.splits.find((s) => s.label === 'zero-anchor rows removed');
    expect(full?.n).toBe(167);
    expect(reduced?.n).toBe(167 - zeroFill.nZeroAnchor);
  });

  it('keeps Tier C below Tier B with those rows deleted', () => {
    const reduced = zeroFill.splits.find((s) => s.label === 'zero-anchor rows removed')!;
    expect(reduced.cMinusB).toBeLessThan(0);
    expect(reduced.perRepeatMedianCminusB).toBeLessThan(0);
    expect(zeroFill.resultSurvivesRemoval).toBe(true);
  });

  it('does not become stronger or weaker in a way the prose overstates', () => {
    // Removing the imputed rows makes the gap wider, not narrower. If that ever
    // flips, the sentence "the gap does not depend on the imputations" needs
    // revisiting rather than silently staying in the manuscript.
    const full = zeroFill.splits.find((s) => s.label === 'full panel')!;
    const reduced = zeroFill.splits.find((s) => s.label === 'zero-anchor rows removed')!;
    expect(reduced.cMinusB).toBeLessThan(full.cMinusB);
  });
});
