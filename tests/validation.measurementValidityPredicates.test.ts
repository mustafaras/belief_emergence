/**
 * Proves the Gate 7 predicates are not vacuous.
 *
 * validation.measurementValidity.test.ts asserts that the real panel PASSES
 * the validity predicates. That assertion is only meaningful if the same
 * predicates FAIL on data that carries the defect. This file feeds both a
 * clean synthetic panel and a defective one into the same logic and asserts
 * the outcomes differ.
 */

import { describe, expect, it } from 'vitest';

const PREDICTORS = ['p1', 'p2', 'p3', 'p4'];

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let sa = 0; let sb = 0;
  for (let i = 0; i < n; i += 1) { sa += a[i]; sb += b[i]; }
  const ma = sa / n; const mb = sb / n;
  let num = 0; let da = 0; let db = 0;
  for (let i = 0; i < n; i += 1) {
    const xa = a[i] - ma; const xb = b[i] - mb;
    num += xa * xb; da += xa * xa; db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? NaN : num / den;
}

/** Deterministic pseudo-random series so the test cannot flake. */
function series(seed: number, n: number): number[] {
  const out: number[] = [];
  let x = seed;
  for (let i = 0; i < n; i += 1) {
    x = (x * 1103515245 + 12345) % 2147483648;
    out.push(x / 2147483648);
  }
  return out;
}

const N = 200;

function buildClean(): { predictors: Record<string, number[]>; outcome: number[] } {
  const predictors: Record<string, number[]> = {};
  PREDICTORS.forEach((p, i) => { predictors[p] = series(i + 7, N); });
  // Outcome is a genuine mix: no single predictor dominates.
  const outcome = predictors.p1.map((_, i) =>
    0.3 * predictors.p1[i] + 0.4 * predictors.p2[i] - 0.2 * predictors.p3[i] + 0.1 * predictors.p4[i]);
  return { predictors, outcome };
}

function buildDefective(): { predictors: Record<string, number[]>; outcome: number[] } {
  const clean = buildClean();
  // Reproduce KI-01: outcome is an exact rescaling of one predictor.
  const outcome = clean.predictors.p3.map((v) => 1.786775474284 * v - 4.530191968676);
  return { predictors: clean.predictors, outcome };
}

function identityHits(predictors: Record<string, number[]>, outcome: number[]): string[] {
  return PREDICTORS.filter((p) => Math.abs(pearson(predictors[p], outcome)) > 0.999);
}

function singleR2Hits(predictors: Record<string, number[]>, outcome: number[]): string[] {
  return PREDICTORS.filter((p) => {
    const r = pearson(predictors[p], outcome);
    return Number.isFinite(r) && r * r > 0.99;
  });
}

function duplicateHits(predictors: Record<string, number[]>): string[] {
  const hits: string[] = [];
  for (let i = 0; i < PREDICTORS.length; i += 1) {
    for (let j = i + 1; j < PREDICTORS.length; j += 1) {
      if (Math.abs(pearson(predictors[PREDICTORS[i]], predictors[PREDICTORS[j]])) > 0.9999) {
        hits.push(`${PREDICTORS[i]}~${PREDICTORS[j]}`);
      }
    }
  }
  return hits;
}

describe('Gate 7 predicates are discriminating (not vacuous)', () => {
  it('a clean panel passes every predicate', () => {
    const { predictors, outcome } = buildClean();
    expect(identityHits(predictors, outcome)).toEqual([]);
    expect(singleR2Hits(predictors, outcome)).toEqual([]);
    expect(duplicateHits(predictors)).toEqual([]);
  });

  it('a panel carrying KI-01 fails the identity predicate', () => {
    const { predictors, outcome } = buildDefective();
    expect(identityHits(predictors, outcome)).toContain('p3');
  });

  it('a panel carrying KI-01 fails the single-predictor R2 predicate', () => {
    const { predictors, outcome } = buildDefective();
    expect(singleR2Hits(predictors, outcome)).toContain('p3');
  });

  it('a panel carrying KI-03 fails the duplicate predicate', () => {
    const { predictors } = buildClean();
    predictors.p4 = predictors.p2.map((v) => -v);
    expect(duplicateHits(predictors)).toContain('p2~p4');
  });
});
