/**
 * Does the Tier C reversal survive removal of the collinear channels?
 *
 * R and E are dependent (r = 0.885) because R is an affine rescaling of HDI and
 * HDI contains an education component. A caveat would be cheap; the useful
 * question is whether the result depends on those two covariates being present.
 * This neutralises each in turn and re-runs the same ladder and the same folds.
 */

import type { PanelRowCanonical } from '../../types/panel';
import { buildModelLadder } from './buildModelLadder';
import { computeKFoldRefit } from './computeKFoldRefit';

export type AblationSpec = {
  label: string;
  neutralised: string[];
  inSample: { A: number; B: number; C: number };
  kFold: { A: number; B: number; C: number };
  /** k-fold C minus k-fold B. Negative means C ranks below B. */
  cMinusB: number;
};

export type CollinearityAblation = {
  schemaVersion: 'phase1.collinearity_ablation.v1';
  generatedAtIso: string;
  n: number;
  specs: AblationSpec[];
  /** True when every specification puts C below B out of sample. */
  reversalStable: boolean;
  /** True when every specification keeps A < B < C in sample. */
  orderingStableInSample: boolean;
  interpretation: string;
};

const SPECS: { label: string; neutralised: string[] }[] = [
  { label: 'full design', neutralised: [] },
  { label: 'without R', neutralised: ['R'] },
  { label: 'without E', neutralised: ['E'] },
  { label: 'without R and E', neutralised: ['R', 'E'] },
];

export function computeCollinearityAblation(rows: PanelRowCanonical[]): CollinearityAblation {
  const specs: AblationSpec[] = SPECS.map(({ label, neutralised }) => {
    const mutated = rows.map((row) => {
      if (neutralised.length === 0) return row;
      const copy = { ...row } as Record<string, unknown>;
      for (const c of neutralised) copy[c] = 0;
      return copy as unknown as PanelRowCanonical;
    });

    const ladder = buildModelLadder(mutated);
    const kf = computeKFoldRefit(mutated, { k: 5, repeats: 20 });
    const pick = (tier: 'A' | 'B' | 'C') => ladder.tiers.find((t) => t.tier === tier)!.trainMetrics.r2;
    const inSample = { A: pick('A'), B: pick('B'), C: pick('C') };
    const kFold = {
      A: kf.aggregatesRefit.A.r2.median,
      B: kf.aggregatesRefit.B.r2.median,
      C: kf.aggregatesRefit.C.r2.median,
    };
    return {
      label,
      neutralised,
      inSample: {
        A: Number(inSample.A.toFixed(6)),
        B: Number(inSample.B.toFixed(6)),
        C: Number(inSample.C.toFixed(6)),
      },
      kFold: {
        A: Number(kFold.A.toFixed(6)),
        B: Number(kFold.B.toFixed(6)),
        C: Number(kFold.C.toFixed(6)),
      },
      cMinusB: Number((kFold.C - kFold.B).toFixed(6)),
    };
  });

  const reversalStable = specs.every((s) => s.kFold.C < s.kFold.B);
  const orderingStableInSample = specs.every((s) => s.inSample.A < s.inSample.B && s.inSample.B < s.inSample.C);

  return {
    schemaVersion: 'phase1.collinearity_ablation.v1',
    generatedAtIso: new Date().toISOString(),
    n: rows.length,
    specs,
    reversalStable,
    orderingStableInSample,
    interpretation: reversalStable && orderingStableInSample
      ? 'Tier C ranks below Tier B out of sample in every ablation, and in-sample fit stays monotone A < B < C. The reversal does not depend on the dependent covariates.'
      : 'The Tier C ordering is NOT stable across ablations; the reversal must not be reported as robust.',
  };
}
