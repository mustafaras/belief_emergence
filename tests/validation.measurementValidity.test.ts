/**
 * Measurement Validity Gate — regression tests
 *
 * These tests pin the behaviour of Gate 7 in scripts/q1_submission_gate.ts.
 * They exist because the repository shipped for months with a model whose
 * main predictor was an exact rescaling of its outcome, while 100/100 tests
 * and an 18/18 submission gate both passed. Nothing in the suite asked
 * whether the model was identifiable.
 *
 * Each test states the defect it prevents.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PANEL = path.join(ROOT, 'public', 'data', 'panel_canonical_23_countries_v1.csv');
const ANALYSIS = path.join(ROOT, 'src', 'data', 'analysis');

const PREDICTORS = [
  'X_urbanization',
  'Y_gini',
  'C_cultural_intensity',
  'M_media_environment',
  'T_trauma_shock',
  'D_social_atomization',
  'G_redistribution_capacity',
  'E_education_capacity',
  'S_social_support',
  'R_welfare_capacity',
];
const OUTCOME = 'Z_belief_outcome';

function readPanel(): Record<string, string>[] {
  const text = fs.readFileSync(PANEL, 'utf-8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row: Record<string, string> = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

function col(rows: Record<string, string>[], name: string): number[] {
  return rows.map((r) => Number.parseFloat(r[name])).filter(Number.isFinite);
}

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

const rows = readPanel();
const outcome = col(rows, OUTCOME);

describe('Gate 7 — Measurement Validity', () => {
  it('loads the canonical panel', () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(outcome.length).toBe(rows.length);
  });

  /**
   * KI-01. Before the fix, corr(C_cultural_intensity, Z_belief_outcome)
   * was exactly 1.0. If this test ever fails with a high value again, the
   * WVS ingestion has regressed to building C from A006.
   */
  it('KI-01: no predictor is an identity rescaling of the outcome', () => {
    const hits: string[] = [];
    for (const p of PREDICTORS) {
      const r = pearson(col(rows, p), outcome);
      if (Number.isFinite(r) && Math.abs(r) > 0.999) {
        hits.push(`${p} r=${r}`);
      }
    }
    expect(hits, `Predictors indistinguishable from outcome: ${hits.join(', ')}`).toEqual([]);
  });

  /**
   * KI-03. D_social_atomization and S_social_support were one variable with
   * opposite sign (r = -1), which also made the design matrix rank deficient.
   */
  it('KI-03: no two predictors are duplicates', () => {
    const hits: string[] = [];
    for (let i = 0; i < PREDICTORS.length; i += 1) {
      for (let j = i + 1; j < PREDICTORS.length; j += 1) {
        const r = pearson(col(rows, PREDICTORS[i]), col(rows, PREDICTORS[j]));
        if (Number.isFinite(r) && Math.abs(r) > 0.9999) {
          hits.push(`${PREDICTORS[i]} ~ ${PREDICTORS[j]} r=${r}`);
        }
      }
    }
    expect(hits, `Duplicate predictors: ${hits.join('; ')}`).toEqual([]);
  });

  /**
   * KI-01. A predictor that alone explains >99% of the outcome is a
   * restatement of the outcome, not a finding.
   */
  it('KI-01: no single predictor reaches R2 > 0.99', () => {
    const hits: string[] = [];
    for (const p of PREDICTORS) {
      const r = pearson(col(rows, p), outcome);
      if (Number.isFinite(r) && r * r > 0.99) {
        hits.push(`${p} R2=${(r * r).toFixed(6)}`);
      }
    }
    expect(hits, `Single-predictor tautology: ${hits.join(', ')}`).toEqual([]);
  });

  /**
   * KI-01. Out-of-sample RMSE of ~1e-6 against an outcome with SD ~0.97 is
   * algebraically impossible for a genuine predictive model.
   */
  it('KI-01: out-of-sample performance is empirically plausible', () => {
    const cv = JSON.parse(
      fs.readFileSync(path.join(ANALYSIS, 'cv_country_out.json'), 'utf-8'),
    ) as Record<string, Record<string, Record<string, Record<string, number>>>>;
    const agg = cv.aggregatesRefit ?? {};
    const sd = (() => {
      const n = outcome.length;
      const m = outcome.reduce((s, v) => s + v, 0) / n;
      return Math.sqrt(outcome.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1));
    })();
    expect(sd).toBeGreaterThan(0.5);

    for (const tier of Object.keys(agg)) {
      const r2 = agg[tier]?.r2?.median;
      const rmse = agg[tier]?.rmse?.median;
      if (typeof r2 === 'number') {
        expect(r2, `Tier ${tier} OOS R2 is impossibly high`).toBeLessThan(0.999);
      }
      if (typeof rmse === 'number') {
        expect(rmse, `Tier ${tier} OOS RMSE is impossibly small`).toBeGreaterThan(1e-4);
      }
    }
  });

  /**
   * KI-05. The canonical (fixed-coefficient) metric family must not be
   * silently negative. If it is, the manuscript must discuss it.
   */
  it('KI-05: canonical OOS R2 is not negative, or is disclosed', () => {
    const cv = JSON.parse(
      fs.readFileSync(path.join(ANALYSIS, 'cv_country_out.json'), 'utf-8'),
    ) as Record<string, Record<string, Record<string, Record<string, number>>>>;
    const canon = cv.aggregatesCanonical ?? {};
    const negatives = Object.keys(canon)
      .filter((t) => (canon[t]?.r2?.median ?? 0) < 0);
    expect(
      negatives,
      `Negative canonical R2 in tier(s) ${negatives.join(', ')} — must be reported in the manuscript`,
    ).toEqual([]);
  });
});
