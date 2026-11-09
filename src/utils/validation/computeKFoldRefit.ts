/**
 * computeKFoldRefit.ts — grouped k-fold validation over country-years.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Leave-one-country-out (LOO) is the wrong evaluation for this panel. With 87
 * country-years across 48 countries, a country-out fold holds out between one
 * and four rows: four folds have one test row, eight have two, and R² is
 * undefined below three. The reported country-out median R² is therefore the
 * median of twelve degenerate folds, not a statement about the model
 * (docs/KNOWN_ISSUES.md KI-14).
 *
 * This module implements the first remedy KI-14 proposed: repeated grouped
 * k-fold. Countries are assigned to folds as whole units, so no country appears
 * in both train and test — the spatial separation a macro panel needs — while
 * each test fold carries ~17 rows, which is enough for R² to mean something.
 *
 * PROTOCOL
 * --------
 *   groups   = countries (never split across folds)
 *   k        = 5 folds per repeat
 *   repeats  = 20 (independent seeded shuffles)
 *   metrics  = RMSE, MAE, R², correlation, bias
 *   families = refit (fold-specific fit) and canonical (fixed production fit)
 *
 * Reported statistics are distributions across all repeat × fold evaluations,
 * plus a per-repeat series so a reader can see whether one shuffle carried the
 * result.
 */

import type { PanelRowCanonical } from '../../types/panel';
import { fitAndEvaluateTier, type ModelTier, type TierEvaluationResult } from './fitModelTier';
import { predictFromPanelRow } from './panelPredict';
import { computeBias, computeMAE, computePearsonCorr, computeR2, computeRMSE } from '../metrics';

export const KFOLD_DEFAULT_K = 5;
export const KFOLD_DEFAULT_REPEATS = 20;

export type KFoldMetricBlock = {
  median: number;
  q25: number;
  q75: number;
  min: number;
  max: number;
  n: number;
};

export type KFoldTierAggregate = {
  rmse: KFoldMetricBlock;
  mae: KFoldMetricBlock;
  r2: KFoldMetricBlock;
  corr: KFoldMetricBlock;
  bias: KFoldMetricBlock;
  failureRate: number;
  r2DefinedRate: number;
};

export type KFoldFold = {
  repeat: number;
  foldIndex: number;
  foldId: string;
  holdoutCountries: string[];
  nTrainRows: number;
  nTestRows: number;
  tierResults: Record<ModelTier, TierEvaluationResult>;
};

export type KFoldRefitSummary = {
  schemaVersion: 'phase1.cv_kfold.v1';
  generatedAtIso: string;
  protocol: 'repeated_grouped_kfold_refit';
  config: {
    k: number;
    repeats: number;
    groupField: 'iso3';
    seeds: number[];
  };
  folds: KFoldFold[];
  aggregatesRefit: Record<ModelTier, KFoldTierAggregate>;
  aggregatesCanonical: Record<ModelTier, KFoldTierAggregate>;
  perRepeatRefit: Array<Record<ModelTier, { r2: number; rmse: number; mae: number }>>;
  perRepeatCanonical: Array<Record<ModelTier, { r2: number; rmse: number; mae: number }>>;
  checks: {
    leakagePass: boolean;
    foldCompletenessPass: boolean;
    observedFoldCount: number;
    expectedFoldCount: number;
    minTestRows: number;
    minTrainRows: number;
    groupsSplitAcrossFolds: number;
    effectiveSampleSizeByTier: Record<ModelTier, number>;
    r2DefinedRateByTier: Record<ModelTier, number>;
  };
  provenance: {
    metricSemanticsNotes: string[];
    inferentialContract: {
      primaryEvidenceFamily: 'aggregatesRefit';
      diagnosticFamily: 'aggregatesCanonical';
      primaryUse: 'inferential';
      diagnosticUse: 'descriptive_only';
      supersedesForInference: 'cv_country_out.json';
      countryOutStatus: 'spatial_stress_test';
    };
  };
};

/** Deterministic seeded PRNG (xorshift32), matching the C-dominance harness. */
function createRng(seed: number): () => number {
  let state = seed | 0;
  if (state === 0) state = 1;
  return () => {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function shuffle<T>(input: T[], rng: () => number): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const t = Math.min(Math.max(q, 0), 1);
  const pos = (sorted.length - 1) * t;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const w = pos - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function block(values: number[]): KFoldMetricBlock {
  const finite = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (finite.length === 0) {
    return { median: NaN, q25: NaN, q75: NaN, min: NaN, max: NaN, n: 0 };
  }
  return {
    median: quantile(finite, 0.5),
    q25: quantile(finite, 0.25),
    q75: quantile(finite, 0.75),
    min: finite[0],
    max: finite[finite.length - 1],
    n: finite.length,
  };
}

type RowMetrics = {
  n: number;
  r2: number;
  corr: number;
  mae: number;
  rmse: number;
  bias: number;
};

/** Fixed-coefficient evaluation, mirroring the country-out canonical path. */
function canonicalMetrics(testRows: PanelRowCanonical[], tier: ModelTier): RowMetrics {
  const ablation = tier === 'A' ? 'main' : tier === 'B' ? 'main+int' : 'full';
  const observed: number[] = [];
  const predicted: number[] = [];
  for (const row of testRows) {
    const result = predictFromPanelRow(row, { ablation });
    if (!Number.isFinite(result.zObs) || !Number.isFinite(result.zPred)) continue;
    observed.push(result.zObs);
    predicted.push(result.zPred);
  }
  return {
    n: observed.length,
    r2: computeR2(observed, predicted),
    corr: computePearsonCorr(observed, predicted),
    mae: computeMAE(observed, predicted),
    rmse: computeRMSE(observed, predicted),
    bias: computeBias(observed, predicted),
  };
}

function aggregateTier(
  results: Array<{ refit: RowMetrics; canonical: RowMetrics; converged: boolean }>,
  family: 'refit' | 'canonical',
): KFoldTierAggregate {
  const pick = (r: { refit: RowMetrics; canonical: RowMetrics }) => (family === 'refit' ? r.refit : r.canonical);
  const r2s = results.map((r) => pick(r).r2);
  const defined = r2s.filter((v) => Number.isFinite(v));
  const failures = results.filter((r) => !r.converged).length;
  return {
    rmse: block(results.map((r) => pick(r).rmse)),
    mae: block(results.map((r) => pick(r).mae)),
    r2: block(r2s),
    corr: block(results.map((r) => pick(r).corr)),
    bias: block(results.map((r) => pick(r).bias)),
    failureRate: results.length > 0 ? failures / results.length : NaN,
    r2DefinedRate: results.length > 0 ? defined.length / results.length : NaN,
  };
}

/** Assign whole countries to k folds; returns fold index per country. */
function assignGroups(countries: string[], k: number, rng: () => number): Map<string, number> {
  const shuffled = shuffle(countries, rng);
  const assignment = new Map<string, number>();
  shuffled.forEach((country, i) => assignment.set(country, i % k));
  return assignment;
}

export function computeKFoldRefit(
  rows: PanelRowCanonical[],
  options?: {
    k?: number;
    repeats?: number;
    seed?: number;
    lambda?: number;
    minRows?: number;
  },
): KFoldRefitSummary {
  const k = options?.k ?? KFOLD_DEFAULT_K;
  const repeats = options?.repeats ?? KFOLD_DEFAULT_REPEATS;
  const baseSeed = options?.seed ?? 20260101;

  const usable = rows.filter((row) => Boolean(row.iso3) && Number.isFinite(row.year));
  const countries = Array.from(new Set(usable.map((row) => row.iso3))).sort((a, b) => a.localeCompare(b));

  const tiers: ModelTier[] = ['A', 'B', 'C'];
  const folds: KFoldFold[] = [];
  const perRepeatRefit: KFoldRefitSummary['perRepeatRefit'] = [];
  const perRepeatCanonical: KFoldRefitSummary['perRepeatCanonical'] = [];
  const seeds: number[] = [];

  let leakagePass = true;
  let groupsSplitAcrossFolds = 0;
  let minTestRows = Number.POSITIVE_INFINITY;
  let minTrainRows = Number.POSITIVE_INFINITY;

  for (let repeat = 0; repeat < repeats; repeat += 1) {
    const seed = baseSeed + repeat;
    seeds.push(seed);
    const rng = createRng(seed);
    const assignment = assignGroups(countries, k, rng);

    const repeatRefit: Record<ModelTier, { r2: number[]; rmse: number[]; mae: number[] }> = {
      A: { r2: [], rmse: [], mae: [] },
      B: { r2: [], rmse: [], mae: [] },
      C: { r2: [], rmse: [], mae: [] },
    };
    const repeatCanonical = structuredClone(repeatRefit);

    for (let foldIndex = 0; foldIndex < k; foldIndex += 1) {
      const holdoutCountries = countries.filter((c) => assignment.get(c) === foldIndex);
      const holdoutSet = new Set(holdoutCountries);
      const testRows = usable.filter((row) => holdoutSet.has(row.iso3));
      const trainRows = usable.filter((row) => !holdoutSet.has(row.iso3));

      // A country must live in exactly one fold, so a holdout country can never
      // appear in train. Assert rather than assume.
      const trainCountries = new Set(trainRows.map((row) => row.iso3));
      for (const country of holdoutCountries) {
        if (trainCountries.has(country)) {
          leakagePass = false;
          groupsSplitAcrossFolds += 1;
        }
      }

      minTestRows = Math.min(minTestRows, testRows.length);
      minTrainRows = Math.min(minTrainRows, trainRows.length);

      const tierResults: Record<ModelTier, TierEvaluationResult> = {
        A: fitAndEvaluateTier(trainRows, testRows, 'A', options),
        B: fitAndEvaluateTier(trainRows, testRows, 'B', options),
        C: fitAndEvaluateTier(trainRows, testRows, 'C', options),
      };

      for (const tier of tiers) {
        const canonical = canonicalMetrics(testRows, tier);
        tierResults[tier].testMetricsCanonical = canonical;
        repeatRefit[tier].r2.push(tierResults[tier].testMetricsRefit.r2);
        repeatRefit[tier].rmse.push(tierResults[tier].testMetricsRefit.rmse);
        repeatRefit[tier].mae.push(tierResults[tier].testMetricsRefit.mae);
        repeatCanonical[tier].r2.push(canonical.r2);
        repeatCanonical[tier].rmse.push(canonical.rmse);
        repeatCanonical[tier].mae.push(canonical.mae);
      }

      folds.push({
        repeat,
        foldIndex,
        foldId: `kfold:r${repeat}:f${foldIndex}`,
        holdoutCountries: [...holdoutCountries].sort((a, b) => a.localeCompare(b)),
        nTrainRows: trainRows.length,
        nTestRows: testRows.length,
        tierResults,
      });
    }

    const summarise = (src: Record<ModelTier, { r2: number[]; rmse: number[]; mae: number[] }>) => {
      const out = {} as Record<ModelTier, { r2: number; rmse: number; mae: number }>;
      for (const tier of tiers) {
        out[tier] = {
          r2: quantile([...src[tier].r2].filter(Number.isFinite).sort((a, b) => a - b), 0.5),
          rmse: quantile([...src[tier].rmse].filter(Number.isFinite).sort((a, b) => a - b), 0.5),
          mae: quantile([...src[tier].mae].filter(Number.isFinite).sort((a, b) => a - b), 0.5),
        };
      }
      return out;
    };
    perRepeatRefit.push(summarise(repeatRefit));
    perRepeatCanonical.push(summarise(repeatCanonical));
  }

  const collect = (tier: ModelTier) =>
    folds.map((fold) => {
      const result = fold.tierResults[tier];
      return {
        refit: result.testMetricsRefit as RowMetrics,
        canonical: result.testMetricsCanonical as RowMetrics,
        converged: result.converged,
      };
    });

  const buildAggregates = (family: 'refit' | 'canonical') => {
    const out = {} as Record<ModelTier, KFoldTierAggregate>;
    for (const tier of tiers) out[tier] = aggregateTier(collect(tier), family);
    return out;
  };

  const aggregatesRefit = buildAggregates('refit');
  const aggregatesCanonical = buildAggregates('canonical');

  const effectiveSampleSizeByTier = {} as Record<ModelTier, number>;
  const r2DefinedRateByTier = {} as Record<ModelTier, number>;
  for (const tier of tiers) {
    effectiveSampleSizeByTier[tier] = aggregatesRefit[tier].rmse.n;
    r2DefinedRateByTier[tier] = aggregatesRefit[tier].r2DefinedRate;
  }

  const expectedFoldCount = k * repeats;

  return {
    schemaVersion: 'phase1.cv_kfold.v1',
    generatedAtIso: new Date().toISOString(),
    protocol: 'repeated_grouped_kfold_refit',
    config: {
      k,
      repeats,
      groupField: 'iso3',
      seeds,
    },
    folds,
    aggregatesRefit,
    aggregatesCanonical,
    perRepeatRefit,
    perRepeatCanonical,
    checks: {
      leakagePass,
      foldCompletenessPass: folds.length === expectedFoldCount,
      observedFoldCount: folds.length,
      expectedFoldCount,
      minTestRows: Number.isFinite(minTestRows) ? minTestRows : 0,
      minTrainRows: Number.isFinite(minTrainRows) ? minTrainRows : 0,
      groupsSplitAcrossFolds,
      effectiveSampleSizeByTier,
      r2DefinedRateByTier,
    },
    provenance: {
      metricSemanticsNotes: [
        'Countries are the grouping unit: no country appears in both train and test of a fold.',
        `k=${k} folds per repeat, ${repeats} seeded repeats, ${expectedFoldCount} total evaluations.`,
        'R² is computed per fold on that fold\u2019s test rows; a fold contributes to the R² distribution only where the statistic is defined.',
        'Distributions are reported instead of a single point estimate because the repeats are independent shuffles.',
        'Supersedes cv_country_out.json for inference: country-out holds out 1-4 rows per fold, below the three-pair floor for R² (KI-14).',
      ],
      inferentialContract: {
        primaryEvidenceFamily: 'aggregatesRefit',
        diagnosticFamily: 'aggregatesCanonical',
        primaryUse: 'inferential',
        diagnosticUse: 'descriptive_only',
        supersedesForInference: 'cv_country_out.json',
        countryOutStatus: 'spatial_stress_test',
      },
    },
  };
}
