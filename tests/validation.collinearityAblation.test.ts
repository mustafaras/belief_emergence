import { describe, expect, it } from 'vitest';

import ablation from '../src/data/analysis/collinearity_ablation.json';
import vif from '../src/data/analysis/collinearity_diagnostics.json';

/**
 * The paper states that removing the two dependent covariates (R and E, r =
 * 0.885, VIF 9.19 and 4.74) leaves the Tier C reversal intact. That sentence is
 * the answer to an obvious referee question, so it has to be asserted rather
 * than trusted: if a future panel change quietly breaks the reversal, the claim
 * becomes false and this test should fail.
 */

describe('collinearity does not carry the central result', () => {
  it('keeps Tier C below Tier B out of sample in every ablation', () => {
    expect(ablation.specs.length).toBe(4);
    for (const spec of ablation.specs) {
      expect(spec.kFold.C, `${spec.label}: C must rank below B`).toBeLessThan(spec.kFold.B);
      expect(spec.cMinusB).toBeLessThan(0);
    }
    expect(ablation.reversalStable).toBe(true);
  });

  it('keeps in-sample fit monotone A < B < C in every ablation', () => {
    for (const spec of ablation.specs) {
      expect(spec.inSample.A, `${spec.label}: A < B`).toBeLessThan(spec.inSample.B);
      expect(spec.inSample.B, `${spec.label}: B < C`).toBeLessThan(spec.inSample.C);
    }
    expect(ablation.orderingStableInSample).toBe(true);
  });

  it('reports the dependent covariates as the ones with high VIF', () => {
    const byName = Object.fromEntries(vif.entries.map((e) => [e.covariate, e]));
    expect(byName.R.vif).toBeGreaterThan(5);
    expect(byName.E.vif).toBeGreaterThan(3);
    // T is in practice orthogonal; if it ever stops being so, the claim that the
    // shock channel is unaffected must be revisited.
    expect(byName.T.vif).toBeLessThan(1.5);
  });

  it('covers exactly the fitted design, not the discarded constructs', () => {
    const listed = vif.entries.map((e) => e.covariate).sort();
    expect(listed).toEqual(['E', 'M', 'R', 'T', 'X', 'Y']);
    // C, D, G and S are constant zero on the v2 panel and are not estimated.
    for (const dropped of ['C', 'D', 'G', 'S']) {
      expect(listed).not.toContain(dropped);
    }
  });

  it('pins the diagnostics to the current panel size', () => {
    expect(vif.n).toBe(ablation.n);
    expect(vif.n).toBe(146);
  });
});
