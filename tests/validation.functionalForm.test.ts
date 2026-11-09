import { describe, expect, it } from 'vitest';

import artifact from '../src/data/analysis/functional_form_comparison.json';
import { findFunctionalFormProblems } from '../scripts/q1_submission_gate';

/**
 * The gate's functional-form check, exercised directly.
 *
 * A full `npm run q1:gate` cannot demonstrate that this check is live: Gate 6
 * (`ci:gate`) regenerates the artifact before Gate 7 reads it, so tampering the
 * file on disk is always washed out. The predicate is exported for exactly this
 * reason — these tests prove it rejects the failure modes it exists to catch.
 */

type Model = {
  model?: string;
  inSample?: { r2?: number };
  kfold?: { median?: number };
  countryOutPooled?: { r2?: number };
};

type Artifact = {
  provenance?: { sameFolds?: boolean; sameRows?: boolean };
  models?: Model[];
};

function clone(): Artifact {
  return JSON.parse(JSON.stringify(artifact)) as Artifact;
}

describe('functional-form gate predicate', () => {
  it('accepts the committed artifact', () => {
    expect(findFunctionalFormProblems(artifact as unknown as Record<string, unknown>)).toEqual([]);
  });

  it('rejects a missing artifact', () => {
    expect(findFunctionalFormProblems(null)).toEqual(['artifact is absent']);
  });

  it('rejects an artifact that does not assert identical folds', () => {
    const bad = clone();
    bad.provenance!.sameFolds = false;
    expect(findFunctionalFormProblems(bad as unknown as Record<string, unknown>))
      .toContain('sameFolds is not asserted');
  });

  it('rejects an artifact that does not assert identical rows', () => {
    const bad = clone();
    bad.provenance!.sameRows = false;
    expect(findFunctionalFormProblems(bad as unknown as Record<string, unknown>))
      .toContain('sameRows is not asserted');
  });

  it('rejects a held-out R2 near unity, which would mean no real holdout', () => {
    const bad = clone();
    bad.models!.find((m) => m.model === 'linear_baseline')!.kfold!.median = 0.97;
    const problems = findFunctionalFormProblems(bad as unknown as Record<string, unknown>);
    expect(problems.some((p) => p.includes('implausibly high'))).toBe(true);
  });

  it('rejects a non-finite metric', () => {
    const bad = clone();
    bad.models!.find((m) => m.model === 'saturating_bounded')!.kfold!.median = Number.NaN;
    const problems = findFunctionalFormProblems(bad as unknown as Record<string, unknown>);
    expect(problems.some((p) => p.includes('not finite'))).toBe(true);
  });

  it('rejects an artifact that drops one of the two models', () => {
    const bad = clone();
    bad.models = bad.models!.filter((m) => m.model !== 'linear_baseline');
    expect(findFunctionalFormProblems(bad as unknown as Record<string, unknown>))
      .toContain('both models are not present');
  });
});

describe('committed functional-form artifact', () => {
  it('reports both models on identical rows and folds', () => {
    expect(artifact.provenance.sameFolds).toBe(true);
    expect(artifact.provenance.sameRows).toBe(true);
    expect(artifact.nRows).toBe(87);
    expect(artifact.kfold.folds).toBe(100);
  });

  it('does not let in-sample fit masquerade as out-of-sample fit', () => {
    const linear = artifact.models.find((m) => m.model === 'linear_baseline')!;
    const bounded = artifact.models.find((m) => m.model === 'saturating_bounded')!;

    // The linear baseline is ahead in sample. That is a real finding and the
    // text reports it; the test pins it so a silent regeneration is noticed.
    expect(linear.inSample.r2).toBeGreaterThan(bounded.inSample.r2);

    // Out of sample the two must stay within the fold dispersion. A gap larger
    // than ~0.05 would mean one model genuinely predicts better, which would
    // require the manuscript's "near-tie" wording to change.
    const gap = Math.abs((bounded.kfold.median as number) - (linear.kfold.median as number));
    expect(gap).toBeLessThan(0.05);
  });

  it('keeps both held-out R2 values inside the plausible range', () => {
    for (const model of artifact.models) {
      const r2 = model.kfold.median;
      expect(Number.isFinite(r2)).toBe(true);
      expect(r2).toBeGreaterThan(-0.5);
      expect(r2).toBeLessThan(0.9);
    }
  });
});
