/**
 * Does the Tier C result depend on the zero-death imputations?
 *
 * Thirty of the 167 rows carry T at the zero anchor, -1.4923, meaning EM-DAT
 * recorded no qualifying disaster: one was already present upstream, 29 were
 * added by the trauma backfill. Those 29 are inferences, not measurements, so
 * the honest question is whether the reported ordering would survive deleting
 * them. If it did not, the result would be an artefact of imputation and the
 * disclosure would have to become a retraction.
 */

import type { PanelRowCanonical } from '../../types/panel';
import { buildModelLadder } from './buildModelLadder';
import { computeKFoldRefit } from './computeKFoldRefit';

/** T for zero recorded deaths: (ln(1 + 0) - LOG_MEAN) / LOG_SD. */
export const T_ZERO_ANCHOR = (0 - 3.11367) / 2.086487;

export type ZeroFillSplit = {
  label: string;
  n: number;
  inSample: { A: number; B: number; C: number };
  kFold: { A: number; B: number; C: number };
  cMinusB: number;
  /** Median of the per-repeat C-B deltas, the quantity the tier test asserts. */
  perRepeatMedianCminusB: number;
};

export type ZeroFillSensitivity = {
  schemaVersion: 'phase1.zero_fill_sensitivity.v1';
  generatedAtIso: string;
  nZeroAnchor: number;
  splits: ZeroFillSplit[];
  /** True when removing every zero-anchor row leaves C below B. */
  resultSurvivesRemoval: boolean;
  interpretation: string;
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

export function computeZeroFillSensitivity(rows: PanelRowCanonical[]): ZeroFillSensitivity {
  const atAnchor = (row: PanelRowCanonical) => Math.abs((row.T as number) - T_ZERO_ANCHOR) < 1e-5;
  const sets: { label: string; data: PanelRowCanonical[] }[] = [
    { label: 'full panel', data: rows },
    { label: 'zero-anchor rows removed', data: rows.filter((row) => !atAnchor(row)) },
  ];

  const splits: ZeroFillSplit[] = sets.map(({ label, data }) => {
    const ladder = buildModelLadder(data);
    const cv = computeKFoldRefit(data, { k: 5, repeats: 200, seed: 20260101 });
    const pick = (tier: 'A' | 'B' | 'C') => ladder.tiers.find((t) => t.tier === tier)!.trainMetrics.r2;
    const kFold = {
      A: median(cv.perRepeatRefit.map((r) => r.A.r2)),
      B: median(cv.perRepeatRefit.map((r) => r.B.r2)),
      C: median(cv.perRepeatRefit.map((r) => r.C.r2)),
    };
    return {
      label,
      n: data.length,
      inSample: {
        A: Number(pick('A').toFixed(6)),
        B: Number(pick('B').toFixed(6)),
        C: Number(pick('C').toFixed(6)),
      },
      kFold: {
        A: Number(kFold.A.toFixed(6)),
        B: Number(kFold.B.toFixed(6)),
        C: Number(kFold.C.toFixed(6)),
      },
      cMinusB: Number((kFold.C - kFold.B).toFixed(6)),
      perRepeatMedianCminusB: Number(
        median(cv.perRepeatRefit.map((r) => r.C.r2 - r.B.r2)).toFixed(6),
      ),
    };
  });

  const full = splits[0];
  const reduced = splits[1];
  const resultSurvivesRemoval = reduced.cMinusB < 0;

  return {
    schemaVersion: 'phase1.zero_fill_sensitivity.v1',
    generatedAtIso: new Date().toISOString(),
    nZeroAnchor: rows.filter(atAnchor).length,
    splits,
    resultSurvivesRemoval,
    interpretation: resultSurvivesRemoval
      ? `Deleting all ${rows.filter(atAnchor).length} rows at the zero anchor leaves the Tier C gap intact (${full.cMinusB} -> ${reduced.cMinusB}), so the report does not depend on the imputed zero-death cells.`
      : 'The Tier C ordering reverses when zero-anchor rows are deleted, which means the reported result is carried by imputation rather than measurement.',
  };
}
