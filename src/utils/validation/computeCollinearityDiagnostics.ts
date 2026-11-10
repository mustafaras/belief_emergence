/**
 * Variance-inflation diagnostics for the retained covariate block.
 *
 * The manuscript discloses collinearity; this module is what makes the
 * disclosure checkable. VIF_j is 1 / (1 - R2_j), where R2_j comes from
 * regressing covariate j on all the others, so it measures how much of a
 * covariate's variance is already carried by its neighbours.
 *
 * Computed on the complete-case panel rows, using exactly the six retained
 * covariates. The previous table listed C, D, G and S as infinite-VIF columns;
 * those channels are not in the design matrix at all (they are constant zero on
 * the v2 panel), so reporting their VIF described a design that is not fitted.
 */

import type { PanelRowCanonical } from '../../types/panel';

export const RETAINED_COVARIATES = ['X', 'Y', 'T', 'E', 'R', 'M'] as const;
export type RetainedCovariate = (typeof RETAINED_COVARIATES)[number];

export type VifEntry = {
  covariate: RetainedCovariate;
  vif: number;
  r2OnOthers: number;
};

export type CollinearityDiagnostics = {
  schemaVersion: 'phase1.collinearity_diagnostics.v1';
  generatedAtIso: string;
  n: number;
  covariates: readonly RetainedCovariate[];
  conditionNumber: number;
  /** Sorted by VIF, descending, so the worst offender reads first. */
  entries: VifEntry[];
  maxVif: number;
  interpretation: string;
};

function invert(matrix: number[][]): number[][] {
  const n = matrix.length;
  const a = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) throw new Error('singular design matrix');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const d = a[col][col];
    for (let j = 0; j < 2 * n; j += 1) a[col][j] /= d;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const f = a[row][col];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j += 1) a[row][j] -= f * a[col][j];
    }
  }
  return a.map((row) => row.slice(n));
}

function solve(matrix: number[][], rhs: number[]): number[] {
  const inv = invert(matrix);
  return inv.map((row) => row.reduce((s, v, i) => s + v * rhs[i], 0));
}

/** R2 from regressing column `j` on every other column plus an intercept. */
function r2OnOthers(X: number[][], j: number): number {
  const n = X.length;
  const predictors = X.map((row) => row.filter((_, k) => k !== j));
  const p = predictors[0].length;
  const y = X.map((row) => row[j]);

  // Normal equations on [1, predictors].
  const design = predictors.map((row) => [1, ...row]);
  const xtx: number[][] = Array.from({ length: p + 1 }, () => new Array(p + 1).fill(0));
  const xty: number[] = new Array(p + 1).fill(0);
  for (let i = 0; i < n; i += 1) {
    for (let a = 0; a <= p; a += 1) {
      xty[a] += design[i][a] * y[i];
      for (let b = 0; b <= p; b += 1) xtx[a][b] += design[i][a] * design[i][b];
    }
  }
  const beta = solve(xtx, xty);
  const mean = y.reduce((s, v) => s + v, 0) / n;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i += 1) {
    const pred = design[i].reduce((s, v, k) => s + v * beta[k], 0);
    ssRes += (y[i] - pred) ** 2;
    ssTot += (y[i] - mean) ** 2;
  }
  return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
}

export function computeCollinearityDiagnostics(rows: PanelRowCanonical[]): CollinearityDiagnostics {
  const used = rows.filter((row) => RETAINED_COVARIATES.every((c) => Number.isFinite(row[c] as number)));
  if (used.length < RETAINED_COVARIATES.length + 2) {
    throw new Error(`too few complete rows for VIF: ${used.length}`);
  }
  const X = used.map((row) => RETAINED_COVARIATES.map((c) => row[c] as number));

  const entries: VifEntry[] = RETAINED_COVARIATES.map((covariate, j) => {
    const r2 = r2OnOthers(X, j);
    return { covariate, r2OnOthers: Number(r2.toFixed(6)), vif: Number((1 / (1 - r2)).toFixed(4)) };
  }).sort((a, b) => b.vif - a.vif);

  // Condition number of the design with intercept: sqrt of the ratio of the
  // extreme eigenvalues of X'X. The smallest eigenvalue comes from inverse
  // power iteration, which is stable; iterating on a shifted matrix (the obvious
  // shortcut) loses all precision once the ratio exceeds a few orders of
  // magnitude.
  const withIntercept = X.map((row) => [1, ...row]);
  const p = withIntercept[0].length;
  const xtx: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  for (const row of withIntercept) {
    for (let a = 0; a < p; a += 1) for (let b = 0; b < p; b += 1) xtx[a][b] += row[a] * row[b];
  }
  const apply = (v: number[], m: number[][]) => m.map((row) => row.reduce((s, x, i) => s + x * v[i], 0));
  const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  const rayleigh = (v: number[], m: number[][]) => {
    const w = apply(v, m);
    return v.reduce((s, x, i) => s + x * w[i], 0);
  };

  let v = new Array(p).fill(1 / Math.sqrt(p));
  let lambdaMax = 0;
  for (let it = 0; it < 800; it += 1) {
    const w = apply(v, xtx);
    const nw = norm(w);
    if (nw === 0) break;
    v = w.map((x) => x / nw);
    lambdaMax = rayleigh(v, xtx);
  }

  const inverse = invert(xtx);
  let u = new Array(p).fill(1 / Math.sqrt(p));
  for (let it = 0; it < 800; it += 1) {
    const w = apply(u, inverse);
    const nw = norm(w);
    if (nw === 0) break;
    u = w.map((x) => x / nw);
  }
  // Rayleigh quotient on the inverse gives 1/lambdaMin.
  const inverseRayleigh = rayleigh(u, inverse);
  const lambdaMin = inverseRayleigh > 0 ? 1 / inverseRayleigh : 1e-12;
  const conditionNumber = lambdaMin > 0 ? Number(Math.sqrt(lambdaMax / lambdaMin).toFixed(2)) : Number.POSITIVE_INFINITY;

  const maxVif = Math.max(...entries.map((e) => e.vif));
  return {
    schemaVersion: 'phase1.collinearity_diagnostics.v1',
    generatedAtIso: new Date().toISOString(),
    n: used.length,
    covariates: RETAINED_COVARIATES,
    conditionNumber: Number.isFinite(conditionNumber) ? conditionNumber : 0,
    entries,
    maxVif,
    interpretation: maxVif < 5
      ? 'All retained covariates sit below the conventional VIF of 5.'
      : `Maximum VIF is ${maxVif}, above the conventional threshold of 5; coefficients on the affected covariates are reported as association under a fixed design, not as separately identified effects.`,
  };
}
