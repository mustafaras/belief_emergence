/**
 * The case for and against dropping R from the design.
 *
 * R is an affine rescaling of the Human Development Index, and HDI contains an
 * education component, so R and E are dependent by construction (VIF 8.74 for R
 * when both are present). Three questions decide whether R should stay:
 *
 *   1. Does dropping it remove the dependence? (VIF)
 *   2. What explanatory power does it cost? (in-sample and held-out)
 *   3. Does the paper's Tier C conclusion depend on it? (already answered by the
 *      collinearity ablation, but repeated here on the current panel)
 */

import type { PanelRowCanonical } from '../../types/panel';
import { buildModelLadder } from './buildModelLadder';
import { computeKFoldRefit } from './computeKFoldRefit';
import { computeCollinearityDiagnostics } from './computeCollinearityDiagnostics';

export type RCaseVariant = {
  label: string;
  covariates: string[];
  n: number;
  maxVif: number;
  conditionNumber: number;
  inSampleR2: number;
  kFoldR2: number;
  /** Tier C minus Tier B, the ordering the Tier C decision rests on. */
  cMinusB: number;
};

export type RCollinearityCase = {
  schemaVersion: 'phase1.r_collinearity_case.v1';
  generatedAtIso: string;
  variants: RCaseVariant[];
  /** Cost of dropping R, in in-sample R2 and in k-fold R2 for Tier A. */
  verdict: {
    vifDrop: number;
    inSampleCost: number;
    kFoldCost: number;
    recommendation: 'retain' | 'drop';
    reason: string;
  };
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

export function computeRCollinearityCase(rows: PanelRowCanonical[]): RCollinearityCase {
  const variants: RCaseVariant[] = [];

  for (const drop of [[], ['R']] as string[][]) {
    const data = drop.length === 0
      ? rows
      : rows.map((row) => {
          const copy = { ...row } as Record<string, unknown>;
          for (const c of drop) copy[c] = 0;
          return copy as unknown as PanelRowCanonical;
        });

    const ladder = buildModelLadder(data);
    const cv = computeKFoldRefit(data, { k: 5, repeats: 200, seed: 20260101 });
    // VIF is only meaningful when every column still varies.
    const vif = drop.length === 0 ? computeCollinearityDiagnostics(data) : null;

    variants.push({
      label: drop.length === 0 ? 'with R' : 'without R',
      covariates: ['X', 'Y', 'T', 'E', 'M', ...(drop.length === 0 ? ['R'] : [])],
      n: data.length,
      maxVif: vif ? Number(vif.maxVif.toFixed(4)) : computeVifWithoutR(data),
      conditionNumber: vif ? vif.conditionNumber : 0,
      inSampleR2: Number(ladder.tiers.find((t) => t.tier === 'A')!.trainMetrics.r2.toFixed(6)),
      kFoldR2: Number(median(cv.perRepeatRefit.map((r) => r.A.r2)).toFixed(6)),
      cMinusB: Number(
        (median(cv.perRepeatRefit.map((r) => r.C.r2)) - median(cv.perRepeatRefit.map((r) => r.B.r2))).toFixed(6),
      ),
    });
  }

  const [withR, withoutR] = variants;
  const inSampleCost = Number((withR.inSampleR2 - withoutR.inSampleR2).toFixed(6));
  const kFoldCost = Number((withR.kFoldR2 - withoutR.kFoldR2).toFixed(6));
  const vifDrop = Number((withR.maxVif - withoutR.maxVif).toFixed(4));

  // Dropping R is recommended only when it removes the dependence and costs
  // little. The thresholds are stated rather than hidden: dependence above the
  // Dropping R would remove the dependence (VIF 8.74 -> 2.49) at a cost of
  // 0.0029 in-sample R2, and would *improve* grouped k-fold for Tiers A and B.
  // That is precisely why it must not be done.
  //
  // R entered the design before any of these numbers existed, for a
  // Meltzer-Richard reason about welfare-state capacity. Removing it after
  // observing that the fit improves is post-hoc specification selection, and
  // this paper's argument is that a model tuned against the evaluation it
  // reports cannot then be judged by that evaluation. Acting on a collinearity
  // diagnostic to raise a score would reproduce, in one line, the error the
  // manuscript spends thirty pages describing.
  //
  // The cost and the benefit are recorded so a reader can see exactly what was
  // forgone; the dependence is disclosed instead of engineered away.
  const postHocTemptation = vifDrop > 0 && withoutR.maxVif < 5 && inSampleCost < 0.01;
  const worthIt = false;

  return {
    schemaVersion: 'phase1.r_collinearity_case.v1',
    generatedAtIso: new Date().toISOString(),
    variants,
    verdict: {
      vifDrop,
      inSampleCost,
      kFoldCost,
      recommendation: worthIt ? 'drop' : 'retain',
      reason: postHocTemptation
        ? `Dropping R would lower the maximum VIF from ${withR.maxVif.toFixed(2)} to ${withoutR.maxVif.toFixed(2)}, cost only ${inSampleCost.toFixed(4)} of in-sample R2, and raise grouped k-fold from ${withR.kFoldR2.toFixed(4)} to ${withoutR.kFoldR2.toFixed(4)}. It is retained anyway: acting on that improvement after seeing it is post-hoc specification selection, which is the practice this paper argues against. The dependence is disclosed instead of engineered away.`
        : `Dropping R leaves the maximum VIF at ${withoutR.maxVif.toFixed(2)}, which is not below the conventional threshold, or costs more in-sample R2 than this panel can resolve; R is retained and the dependence is disclosed.`,
    },
  };
}

/** VIF for the five-covariate design where R has been neutralised. */
function computeVifWithoutR(rows: PanelRowCanonical[]): number {
  const cols = ['X', 'Y', 'T', 'E', 'M'] as const;
  const data = rows.map((row) => cols.map((c) => row[c] as number));
  let max = 0;
  for (let j = 0; j < cols.length; j += 1) {
    const y = data.map((r) => r[j]);
    const A = data.map((r) => [1, ...r.filter((_, k) => k !== j)]);
    // Normal equations, 5 unknowns.
    const p = A[0].length;
    const xtx = Array.from({ length: p }, () => new Array(p).fill(0));
    const xty = new Array(p).fill(0);
    for (let i = 0; i < A.length; i += 1) {
      for (let a = 0; a < p; a += 1) {
        xty[a] += A[i][a] * y[i];
        for (let b = 0; b < p; b += 1) xtx[a][b] += A[i][a] * A[i][b];
      }
    }
    // Gaussian elimination with partial pivoting.
    const M = xtx.map((row, i) => [...row, xty[i]]);
    for (let col = 0; col < p; col += 1) {
      let piv = col;
      for (let r = col + 1; r < p; r += 1) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      [M[col], M[piv]] = [M[piv], M[col]];
      for (let r = 0; r < p; r += 1) {
        if (r === col || M[col][col] === 0) continue;
        const f = M[r][col] / M[col][col];
        for (let c2 = col; c2 <= p; c2 += 1) M[r][c2] -= f * M[col][c2];
      }
    }
    const beta = M.map((row, i) => (M[i][i] === 0 ? 0 : row[p] / M[i][i]));
    const mean = y.reduce((s, v) => s + v, 0) / y.length;
    let ssRes = 0;
    let ssTot = 0;
    for (let i = 0; i < y.length; i += 1) {
      const pred = A[i].reduce((s, v, k) => s + v * beta[k], 0);
      ssRes += (y[i] - pred) ** 2;
      ssTot += (y[i] - mean) ** 2;
    }
    const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
    max = Math.max(max, 1 / (1 - r2));
  }
  return Number(max.toFixed(4));
}
