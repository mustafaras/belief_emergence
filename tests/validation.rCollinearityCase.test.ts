import { describe, expect, it } from 'vitest';

import rCase from '../src/data/analysis/r_collinearity_case.json';

/**
 * The R decision is recorded, not just described.
 *
 * Dropping R removes the collinearity and would raise the reported fit. The
 * paper retains R anyway. That is a substantive choice and it has to survive
 * review: if someone later "fixes" the collinearity by dropping R, this test
 * fails and the argument in the manuscript becomes false.
 */

describe('R is retained despite the temptation to drop it', () => {
  it('records both designs', () => {
    expect(rCase.variants.length).toBe(2);
    const withR = rCase.variants.find((v) => v.label === 'with R')!;
    const withoutR = rCase.variants.find((v) => v.label === 'without R')!;
    expect(withR.covariates).toContain('R');
    expect(withoutR.covariates).not.toContain('R');
    expect(withR.n).toBe(167);
  });

  it('retains R even though dropping it looks better', () => {
    expect(rCase.verdict.recommendation).toBe('retain');
    // The temptation is real: dropping R removes the dependence and improves fit.
    const withR = rCase.variants.find((v) => v.label === 'with R')!;
    const withoutR = rCase.variants.find((v) => v.label === 'without R')!;
    expect(withoutR.maxVif).toBeLessThan(withR.maxVif);
    expect(withoutR.kFoldR2).toBeGreaterThan(withR.kFoldR2);
  });

  it('states the cost of the decision in the manuscript', () => {
    expect(rCase.verdict.inSampleCost).toBeGreaterThan(0);
    expect(rCase.verdict.inSampleCost).toBeLessThan(0.01);
    expect(rCase.verdict.reason).toMatch(/post-hoc|post hoc/i);
  });

  it('discloses the dependence it declines to remove', () => {
    const withR = rCase.variants.find((v) => v.label === 'with R')!;
    expect(withR.maxVif).toBeGreaterThan(5);
  });
});
