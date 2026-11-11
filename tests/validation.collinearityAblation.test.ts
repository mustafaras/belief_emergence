import fs from 'node:fs';
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
  it('reports the Tier C ordering as unstable rather than claiming a reversal', () => {
    // At 167 cells the reversal does not hold across specifications: the full
    // design and the without-E ablation put C marginally ahead of B. The test
    // therefore asserts what is measured -- a small, sign-unstable difference --
    // instead of a stable reversal the data no longer support. What must stay
    // true is that the difference is small enough to be uninformative.
    expect(ablation.specs.length).toBe(4);
    for (const spec of ablation.specs) {
      expect(Math.abs(spec.cMinusB), `${spec.label}: |C-B| must be small`).toBeLessThan(0.06);
    }
    expect(ablation.reversalStable).toBe(false);
    // At least one specification must put C behind B, or the exploratory label
    // would rest on nothing at all.
    expect(ablation.specs.some((s) => s.cMinusB < 0)).toBe(true);
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
    // Read the panel rather than a literal: this assertion was written as toBe(167)
    // and failed the moment the window widened to 207, which tests the constant and
    // not the agreement between the two artifacts.
    const panelCsv = fs.readFileSync('public/data/panel_canonical_v2.csv', 'utf8');
    const rows = panelCsv.trim().split(String.fromCharCode(10)).length - 1;
    expect(vif.n).toBe(ablation.n);
    expect(vif.n).toBe(rows);
  });
});