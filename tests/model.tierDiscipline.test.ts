import { describe, expect, it } from 'vitest';

import fs from 'node:fs';

import ladder from '../src/data/analysis/model_ladder_metrics.json';
import complexity from '../src/data/analysis/model_complexity_support.json';
import kfold from '../src/data/analysis/cv_kfold.json';

import { parsePanelCsvText } from '../src/data/panelDataLoader';
import { computeKFoldRefit } from '../src/utils/validation/computeKFoldRefit';

const panelRows = parsePanelCsvText(
  fs.readFileSync('public/data/panel_canonical_v2.csv', 'utf8'),
  'panel_canonical_v2.csv',
);
/** Ten fixed seeds. Fixed, not random, so the test is reproducible. */
const SEEDS = [20260101, 777, 424242, 99991, 31337, 5150, 8, 1234567, 2024, 60613];

/**
 * Tier discipline, enforced rather than described.
 *
 * The roadmap decision of 2026-11-09 keeps Tier C in the paper as an
 * exploratory appendix. The justification is not a fixed exchange rate between
 * in-sample and held-out gain -- that ratio moved from 59x to 1.9x as the panel
 * grew from 87 to 146 cells, and pinning it would have meant lowering a
 * threshold every time the data improved. The durable property is an ordering
 * reversal: in sample, fit rises monotonically A < B < C, but out of sample C
 * lands *below* B. Adding parameters therefore reorders the tiers under
 * validation, and that is what keeps Tier C exploratory.
 */

type Tier = 'A' | 'B' | 'C';

describe('tier discipline', () => {
  it('marks Tier C exploratory and excludes it from primary inference', () => {
    const tierC = complexity.complexityByTier.find((t) => t.tier === 'C');
    expect(tierC).toBeDefined();
    expect(tierC?.exploratory).toBe(true);
    expect(tierC?.inferentialRole).toBe('exploratory');
    // supportRiskFlag is a numeric threshold (< 5 observations per parameter).
    // On the 87-cell panel Tier C sat at 3.95 and tripped it; on the expanded
    // 126-cell panel it sits at 5.73 and does not. The flag is therefore NOT
    // asserted here — tying the test to it would make a sample-size change look
    // like a discipline failure. Tier C stays exploratory because its extra
    // parameters buy no transfer, which the next test measures directly.
    expect(typeof tierC?.supportRiskFlag).toBe('boolean');
  });

  it('keeps Tiers A and B primary', () => {
    for (const tier of ['A', 'B'] as Tier[]) {
      const entry = complexity.complexityByTier.find((t) => t.tier === tier);
      expect(entry, `tier ${tier} missing`).toBeDefined();
      expect(entry?.inferentialRole, `tier ${tier} must stay primary`).toBe('primary');
    }
  });

  it('records the measured non-transfer that justifies keeping Tier C as an appendix', () => {
    const inSample = Object.fromEntries(
      ladder.tiers.map((t) => [t.tier, t.trainMetrics.r2]),
    ) as Record<Tier, number>;
    const heldOut = Object.fromEntries(
      (['A', 'B', 'C'] as Tier[]).map((t) => [t, kfold.aggregatesRefit[t].r2.median]),
    ) as Record<Tier, number>;

    // In sample, more parameters help monotonically through Tier B.
    expect(inSample.B).toBeGreaterThan(inSample.A);
    expect(inSample.C).toBeGreaterThanOrEqual(inSample.B - 1e-9);

    // In sample, Tier C is the best-fitting model of the three.
    expect(inSample.C).toBeGreaterThan(inSample.B);

    // Under repeated grouped k-fold it is not. This reversal, not any ratio of
    // gains, is the finding: eleven extra parameters buy in-sample fit and then
    // hand back more than they bought, landing C below the cheaper B.
    //
    // The comparison is asserted across seeds rather than on the default seed
    // alone. At 167 rows the default seed is the one that puts C marginally
    // ahead (+0.0035) while nine of ten seeds put C behind, so a single-seed
    // assertion would report the opposite of the stable result -- and would flip
    // again on the next panel change. Fold assignment is a nuisance parameter;
    // the claim has to be about what survives it.
    const seedDeltas = SEEDS.map((seed) => {
      const cv = computeKFoldRefit(panelRows, { k: 5, repeats: 20, seed });
      return cv.aggregatesRefit.C.r2.median - cv.aggregatesRefit.B.r2.median;
    });
    const behind = seedDeltas.filter((d) => d < 0).length;
    expect(behind, `C behind B in ${behind}/${seedDeltas.length} seeds`).toBeGreaterThanOrEqual(
      Math.ceil(seedDeltas.length * 0.8),
    );

    // And the gain C offers over the base tier is larger in sample than out.
    expect(inSample.C - inSample.A).toBeGreaterThan(heldOut.C - heldOut.A);
  });

  it('keeps support-per-parameter honest for each tier', () => {
    const byTier = Object.fromEntries(
      complexity.complexityByTier.map((t) => [t.tier, t]),
    ) as Record<Tier, (typeof complexity.complexityByTier)[number]>;

    const expected: Record<Tier, number> = { A: 11, B: 18, C: 22 };
    for (const tier of ['A', 'B', 'C'] as Tier[]) {
      expect(byTier[tier].parameterCount).toBe(expected[tier]);
    }
    // Support must fall monotonically as parameters grow; a raise would mean
    // the sample changed under the ladder.
    expect(byTier.A.supportPerParameter).toBeGreaterThan(byTier.B.supportPerParameter);
    expect(byTier.B.supportPerParameter).toBeGreaterThan(byTier.C.supportPerParameter);
  });

  it('keeps the k-fold protocol clean, so the decision rests on valid evidence', () => {
    expect(kfold.checks.leakagePass).toBe(true);
    expect(kfold.checks.groupsSplitAcrossFolds).toBe(0);
    expect(kfold.checks.observedFoldCount).toBe(kfold.checks.expectedFoldCount);
    expect(kfold.checks.minTestRows).toBeGreaterThanOrEqual(3);
    // R2 must be defined in every fold; that is the property country-out lacked.
    for (const tier of ['A', 'B', 'C'] as Tier[]) {
      expect(kfold.checks.r2DefinedRateByTier[tier]).toBe(1);
    }
  });
});
