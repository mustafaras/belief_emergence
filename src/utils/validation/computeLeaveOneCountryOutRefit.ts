import type { PanelRowCanonical } from '../../types/panel';
import { fitAndEvaluateTier, type ModelTier, type TierEvaluationResult } from './fitModelTier';
import { computeBias, computeMAE, computePearsonCorr, computeR2, computeRMSE } from '../metrics';
import { predictFromPanelRow } from './panelPredict';

type FoldAggregate = {
  median: number;
  q25: number;
  q75: number;
};

type TierAggregate = {
  rmse: FoldAggregate;
  mae: FoldAggregate;
  r2: FoldAggregate;
  corr: FoldAggregate;
  bias: FoldAggregate;
};

type TierAggregateRefit = TierAggregate & {
  coverage95: FoldAggregate;
  failureRate: number;
};

export type CountryOutFold = {
  foldId: string;
  holdoutCountry: string;
  nTrainRows: number;
  nTestRows: number;
  trainYearMin?: number;
  trainYearMax?: number;
  testYearMin?: number;
  testYearMax?: number;
  tierResults: Record<ModelTier, TierEvaluationResult>;
};

export type CountryOutRefitSummary = {
  schemaVersion: 'phase1.cv_country_out.v1';
  generatedAtIso: string;
  protocol: 'leave_one_country_out_refit';
  folds: CountryOutFold[];
  aggregatesRefit: Record<ModelTier, TierAggregateRefit>;
  aggregatesRefitSupportCollapsed: Record<ModelTier, TierAggregate>;
  aggregatesCanonical: Record<ModelTier, TierAggregate>;
  aggregatesCanonicalSupportCollapsed: Record<ModelTier, TierAggregate>;
  // Backward compatibility aliases (map to refit families)
  aggregates: Record<ModelTier, TierAggregateRefit>;
  aggregatesSupportCollapsed: Record<ModelTier, TierAggregate>;
  provenance: {
    metricSemanticsNotes: string[];
    inferentialContract: {
      primaryEvidenceFamily: 'aggregatesRefit';
      diagnosticFamily: 'aggregatesCanonical';
      foldPrimaryField: 'testMetricsRefit';
      foldDiagnosticField: 'testMetricsCanonical';
      primaryUse: 'inferential';
      diagnosticUse: 'descriptive_only';
    };
  };
  checks: {
    expectedFoldCount: number;
    observedFoldCount: number;
    foldCompletenessPass: boolean;
    modelSemantics: 'canonical_structural';
    supportOverlapPass: boolean;
    effectiveSampleSizeByTier: Record<ModelTier, number>;
    lowVarianceFoldFlags: string[];
    metricFamilies: {
      primary: 'refit';
      refit: {
        source: 'fold_specific_fitted_model';
        intendedUse: 'primary_inferential';
        foldTierRowField: 'testMetricsRefit';
        foldTierSupportCollapsedField: 'testMetricsSupportCollapsedRefit';
        aggregateRowField: 'aggregatesRefit';
        aggregateSupportCollapsedField: 'aggregatesRefitSupportCollapsed';
      };
      canonical: {
        source: 'fixed_canonical_model';
        intendedUse: 'diagnostic_only';
        foldTierRowField: 'testMetricsCanonical';
        foldTierSupportCollapsedField: 'testMetricsSupportCollapsedCanonical';
        aggregateRowField: 'aggregatesCanonical';
        aggregateSupportCollapsedField: 'aggregatesCanonicalSupportCollapsed';
      };
    };
  };
};

function ablationForTier(tier: ModelTier): 'main' | 'main+int' | 'full' {
  if (tier === 'A') return 'main';
  if (tier === 'B') return 'main+int';
  return 'full';
}

function computeVariance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  let sumSq = 0;
  for (const value of values) {
    const d = value - mean;
    sumSq += d * d;
  }
  return sumSq / (values.length - 1);
}

function computeCanonicalTierMetrics(testRows: PanelRowCanonical[], tier: ModelTier): {
  rowMetrics: {
    n: number;
    r2: number;
    corr: number;
    mae: number;
    rmse: number;
    bias: number;
  };
  supportCollapsedMetrics: {
    n: number;
    r2: number;
    corr: number;
    mae: number;
    rmse: number;
    bias: number;
  };
  nUniqueCountryYears: number;
  lowVarianceObservedTest: boolean;
} {
  const observed: number[] = [];
  const predicted: number[] = [];
  const collapsed = new Map<string, { obsSum: number; predSum: number; n: number }>();

  for (const row of testRows) {
    const result = predictFromPanelRow(row, { ablation: ablationForTier(tier) });
    if (!Number.isFinite(result.zObs) || !Number.isFinite(result.zPred)) continue;
    observed.push(result.zObs);
    predicted.push(result.zPred);

    const key = `${row.iso3}::${row.year}`;
    const current = collapsed.get(key);
    if (current) {
      current.obsSum += result.zObs;
      current.predSum += result.zPred;
      current.n += 1;
    } else {
      collapsed.set(key, { obsSum: result.zObs, predSum: result.zPred, n: 1 });
    }
  }

  const collapsedObserved: number[] = [];
  const collapsedPredicted: number[] = [];
  for (const cell of collapsed.values()) {
    collapsedObserved.push(cell.obsSum / cell.n);
    collapsedPredicted.push(cell.predSum / cell.n);
  }

  const rowMetrics = {
    n: observed.length,
    r2: computeR2(observed, predicted),
    corr: computePearsonCorr(observed, predicted),
    mae: computeMAE(observed, predicted),
    rmse: computeRMSE(observed, predicted),
    bias: computeBias(observed, predicted),
  };

  const supportCollapsedMetrics = {
    n: collapsedObserved.length,
    r2: computeR2(collapsedObserved, collapsedPredicted),
    corr: computePearsonCorr(collapsedObserved, collapsedPredicted),
    mae: computeMAE(collapsedObserved, collapsedPredicted),
    rmse: computeRMSE(collapsedObserved, collapsedPredicted),
    bias: computeBias(collapsedObserved, collapsedPredicted),
  };

  return {
    rowMetrics,
    supportCollapsedMetrics,
    nUniqueCountryYears: collapsed.size,
    lowVarianceObservedTest: computeVariance(observed) < 1e-10,
  };
}

function hasSupportOverlap(trainRows: PanelRowCanonical[], testRows: PanelRowCanonical[]): boolean {
  const trainKeys = new Set(trainRows.map((row) => `${row.iso3}::${row.year}`));
  for (const row of testRows) {
    if (trainKeys.has(`${row.iso3}::${row.year}`)) return true;
  }
  return false;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const t = Math.min(Math.max(q, 0), 1);
  const pos = (sorted.length - 1) * t;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const w = pos - lo;
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function aggregate(values: number[]): FoldAggregate {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  return {
    median: quantile(finite, 0.5),
    q25: quantile(finite, 0.25),
    q75: quantile(finite, 0.75),
  };
}

function minMaxYears(rows: PanelRowCanonical[]): { min?: number; max?: number } {
  const years = rows.map((row) => row.year).filter(Number.isFinite);
  if (!years.length) return {};
  return { min: Math.min(...years), max: Math.max(...years) };
}

export function computeLeaveOneCountryOutRefit(
  rows: PanelRowCanonical[],
  options?: { lambda?: number; minRows?: number }
): CountryOutRefitSummary {
  const countries = Array.from(new Set(rows.map((row) => row.iso3).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const folds: CountryOutFold[] = [];
  const lowVarianceFoldFlags: string[] = [];
  let supportOverlapPass = true;

  for (const holdoutCountry of countries) {
    const testRows = rows.filter((row) => row.iso3 === holdoutCountry);
    const trainRows = rows.filter((row) => row.iso3 !== holdoutCountry);

    const trainYears = minMaxYears(trainRows);
    const testYears = minMaxYears(testRows);
    supportOverlapPass = supportOverlapPass && !hasSupportOverlap(trainRows, testRows);

    const tierResults: Record<ModelTier, TierEvaluationResult> = {
      A: fitAndEvaluateTier(trainRows, testRows, 'A', options),
      B: fitAndEvaluateTier(trainRows, testRows, 'B', options),
      C: fitAndEvaluateTier(trainRows, testRows, 'C', options),
    };

    for (const tier of ['A', 'B', 'C'] as ModelTier[]) {
      const canonical = computeCanonicalTierMetrics(testRows, tier);
      tierResults[tier].testMetricsCanonical = canonical.rowMetrics;
      tierResults[tier].testMetricsSupportCollapsedCanonical = canonical.supportCollapsedMetrics;
      if (tierResults[tier].lowVarianceObservedTest) {
        lowVarianceFoldFlags.push(`country_out:${holdoutCountry}:${tier}`);
      }
    }

    folds.push({
      foldId: `country_out:${holdoutCountry}`,
      holdoutCountry,
      nTrainRows: trainRows.length,
      nTestRows: testRows.length,
      trainYearMin: trainYears.min,
      trainYearMax: trainYears.max,
      testYearMin: testYears.min,
      testYearMax: testYears.max,
      tierResults,
    });
  }

  const aggregatesRefit = (['A', 'B', 'C'] as ModelTier[]).reduce<CountryOutRefitSummary['aggregatesRefit']>((acc, tier) => {
    const tierOut = folds.map((fold) => fold.tierResults[tier]);
    const failures = tierOut.filter((result) => !result.converged).length;

    acc[tier] = {
      rmse: aggregate(tierOut.map((result) => result.testMetricsRefit.rmse)),
      mae: aggregate(tierOut.map((result) => result.testMetricsRefit.mae)),
      r2: aggregate(tierOut.map((result) => result.testMetricsRefit.r2)),
      corr: aggregate(tierOut.map((result) => result.testMetricsRefit.corr)),
      bias: aggregate(tierOut.map((result) => result.testMetricsRefit.bias)),
      coverage95: aggregate(tierOut.map((result) => result.predictionIntervalCoverage95 ?? NaN)),
      failureRate: tierOut.length > 0 ? failures / tierOut.length : NaN,
    };
    return acc;
  }, { A: undefined as never, B: undefined as never, C: undefined as never });

  const aggregatesRefitSupportCollapsed = (['A', 'B', 'C'] as ModelTier[]).reduce<CountryOutRefitSummary['aggregatesRefitSupportCollapsed']>((acc, tier) => {
    const tierOut = folds.map((fold) => fold.tierResults[tier]);

    acc[tier] = {
      rmse: aggregate(tierOut.map((result) => result.testMetricsSupportCollapsedRefit?.rmse ?? NaN)),
      mae: aggregate(tierOut.map((result) => result.testMetricsSupportCollapsedRefit?.mae ?? NaN)),
      r2: aggregate(tierOut.map((result) => result.testMetricsSupportCollapsedRefit?.r2 ?? NaN)),
      corr: aggregate(tierOut.map((result) => result.testMetricsSupportCollapsedRefit?.corr ?? NaN)),
      bias: aggregate(tierOut.map((result) => result.testMetricsSupportCollapsedRefit?.bias ?? NaN)),
    };
    return acc;
  }, { A: undefined as never, B: undefined as never, C: undefined as never });

  const aggregatesCanonical = (['A', 'B', 'C'] as ModelTier[]).reduce<CountryOutRefitSummary['aggregatesCanonical']>((acc, tier) => {
    const tierOut = folds.map((fold) => fold.tierResults[tier]);

    acc[tier] = {
      rmse: aggregate(tierOut.map((result) => result.testMetricsCanonical?.rmse ?? NaN)),
      mae: aggregate(tierOut.map((result) => result.testMetricsCanonical?.mae ?? NaN)),
      r2: aggregate(tierOut.map((result) => result.testMetricsCanonical?.r2 ?? NaN)),
      corr: aggregate(tierOut.map((result) => result.testMetricsCanonical?.corr ?? NaN)),
      bias: aggregate(tierOut.map((result) => result.testMetricsCanonical?.bias ?? NaN)),
    };
    return acc;
  }, { A: undefined as never, B: undefined as never, C: undefined as never });

  const aggregatesCanonicalSupportCollapsed = (['A', 'B', 'C'] as ModelTier[]).reduce<CountryOutRefitSummary['aggregatesCanonicalSupportCollapsed']>((acc, tier) => {
    const tierOut = folds.map((fold) => fold.tierResults[tier]);

    acc[tier] = {
      rmse: aggregate(tierOut.map((result) => result.testMetricsSupportCollapsedCanonical?.rmse ?? NaN)),
      mae: aggregate(tierOut.map((result) => result.testMetricsSupportCollapsedCanonical?.mae ?? NaN)),
      r2: aggregate(tierOut.map((result) => result.testMetricsSupportCollapsedCanonical?.r2 ?? NaN)),
      corr: aggregate(tierOut.map((result) => result.testMetricsSupportCollapsedCanonical?.corr ?? NaN)),
      bias: aggregate(tierOut.map((result) => result.testMetricsSupportCollapsedCanonical?.bias ?? NaN)),
    };
    return acc;
  }, { A: undefined as never, B: undefined as never, C: undefined as never });

  const effectiveSampleSizeByTier = (['A', 'B', 'C'] as ModelTier[]).reduce<Record<ModelTier, number>>((acc, tier) => {
    acc[tier] = aggregate(
      folds.map((fold) => fold.tierResults[tier].nTestUniqueCountryYears ?? NaN)
    ).median;
    return acc;
  }, { A: NaN, B: NaN, C: NaN });

  return {
    schemaVersion: 'phase1.cv_country_out.v1',
    generatedAtIso: new Date().toISOString(),
    protocol: 'leave_one_country_out_refit',
    folds,
    aggregatesRefit,
    aggregatesRefitSupportCollapsed,
    aggregatesCanonical,
    aggregatesCanonicalSupportCollapsed,
    aggregates: aggregatesRefit,
    aggregatesSupportCollapsed: aggregatesRefitSupportCollapsed,
    provenance: {
      metricSemanticsNotes: [
        'Primary OOS inference uses fold-specific refit metrics (testMetricsRefit / aggregatesRefit).',
        'Canonical fixed-model metrics are diagnostic-only and stored separately (testMetricsCanonical / aggregatesCanonical).',
      ],
      inferentialContract: {
        primaryEvidenceFamily: 'aggregatesRefit',
        diagnosticFamily: 'aggregatesCanonical',
        foldPrimaryField: 'testMetricsRefit',
        foldDiagnosticField: 'testMetricsCanonical',
        primaryUse: 'inferential',
        diagnosticUse: 'descriptive_only',
      },
    },
    checks: {
      expectedFoldCount: countries.length,
      observedFoldCount: folds.length,
      foldCompletenessPass: folds.length === countries.length,
      modelSemantics: 'canonical_structural',
      supportOverlapPass,
      effectiveSampleSizeByTier,
      lowVarianceFoldFlags,
      metricFamilies: {
        primary: 'refit',
        refit: {
          source: 'fold_specific_fitted_model',
          intendedUse: 'primary_inferential',
          foldTierRowField: 'testMetricsRefit',
          foldTierSupportCollapsedField: 'testMetricsSupportCollapsedRefit',
          aggregateRowField: 'aggregatesRefit',
          aggregateSupportCollapsedField: 'aggregatesRefitSupportCollapsed',
        },
        canonical: {
          source: 'fixed_canonical_model',
          intendedUse: 'diagnostic_only',
          foldTierRowField: 'testMetricsCanonical',
          foldTierSupportCollapsedField: 'testMetricsSupportCollapsedCanonical',
          aggregateRowField: 'aggregatesCanonical',
          aggregateSupportCollapsedField: 'aggregatesCanonicalSupportCollapsed',
        },
      },
    },
  };
}
