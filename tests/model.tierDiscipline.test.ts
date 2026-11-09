import { describe, expect, it } from 'vitest';

import ladder from '../src/data/analysis/model_ladder_metrics.json';
import complexity from '../src/data/analysis/model_complexity_support.json';
import kfold from '../src/data/analysis/cv_kfold.json';

/**
 * Tier discipline, enforced rather than described.
 *
 * The roadmap decision of 2026-11-09 keeps Tier C in the paper as an
 * exploratory appendix: eleven extra parameters buy +0.111 in-sample R2 and
 * -0.009 held-out R2, and that non-transfer is itself the finding. The decision
 * only holds if Tier C cannot later drift into a headline claim, so these tests
 * assert the machine-readable properties that make it exploratory.
 */

type Tier = 'A' | 'B' | 'C';

describe('tier discipline', () => {
  it('marks Tier C exploratory and excludes it from primary inference', () => {
    const tierC = complexity.complexityByTier.find((t) => t.tier === 'C');
    expect(tierC).toBeDefined();
    expect(tierC?.exploratory).toBe(true);
    expect(tierC?.inferentialRole).toBe('exploratory');
    expect(tierC?.supportRiskFlag).toBe(true);
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

    // In sample, more parameters help monotonically.
    expect(inSample.B).toBeGreaterThan(inSample.A);
    expect(inSample.C).toBeGreaterThan(inSample.B);

    // Out of sample, they do not: Tier C must not beat Tier A.
    expect(heldOut.C).toBeLessThanOrEqual(heldOut.A + 1e-9);

    // The gap the decision is based on, stated so a silent regeneration fails
    // the suite instead of quietly changing the paper's argument.
    expect(inSample.C - inSample.A).toBeGreaterThan(0.05);
    expect(heldOut.C - heldOut.A).toBeLessThan(0.02);
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
