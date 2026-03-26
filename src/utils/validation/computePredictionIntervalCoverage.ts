import type { ModelTier } from './fitModelTier';
import type { CountryOutRefitSummary } from './computeLeaveOneCountryOutRefit';
import type { RollingOriginRefitSummary } from './computeRollingOriginRefit';

type ProtocolKey = 'country_out' | 'rolling_origin';
type SupportRegimeKey = 'thin_support' | 'moderate_support' | 'broader_support';
type IntervalMethod = 'empirical_quantile_shifted' | 'gaussian_symmetric_train_residual_std' | 'none';

export type CoverageStats = {
  medianCoverage95: number;
  q25Coverage95: number;
  q75Coverage95: number;
  meanCoverage95: number;
  stdCoverage95: number;
  iqrWidthCoverage95: number;
  meanGapToNominal: number;
  medianGapToNominal: number;
  underCoverageRate: number;
  severeUnderCoverageRate: number;
  nFolds: number;
};

type PooledCoverageStats = {
  meanCoverage95: number;
  nFolds: number;
  meanGapToNominal: number;
  underCoverageRate: number;
  severeUnderCoverageRate: number;
};

type MethodComparisonStats = {
  primaryMeanCoverage95: number;
  gaussianMeanCoverage95: number;
  deltaMeanCoverage95: number;
  primaryAbsGapToNominal: number;
  gaussianAbsGapToNominal: number;
};

type AssumptionAuditStats = {
  lowVarianceFoldRate: number;
  thinSupportFoldRate: number;
  medianResidualStdTrain: number;
  residualStdCv: number;
  medianResidualCenterShift: number;
  empiricalVsGaussianMeanDelta: number;
  fallbackToGaussianRate: number;
  nComparableFolds: number;
};

export type PredictionIntervalCoverageSummary = {
  schemaVersion: 'phase1.prediction_interval_coverage.v2';
  generatedAtIso: string;
  nominalCoverage: number;
  severeUnderCoverageThreshold: number;
  intervalMethods: {
    primary: 'empirical_quantile_shifted';
    comparator: 'gaussian_symmetric_train_residual_std';
    fallback: 'gaussian_when_empirical_unavailable';
  };
  byProtocol: Record<ProtocolKey, Record<ModelTier, CoverageStats>>;
  byProtocolEmpirical: Record<ProtocolKey, Record<ModelTier, CoverageStats>>;
  byProtocolGaussian: Record<ProtocolKey, Record<ModelTier, CoverageStats>>;
  pooledByTier: Record<ModelTier, PooledCoverageStats>;
  pooledByTierGaussian: Record<ModelTier, PooledCoverageStats>;
  methodComparisonByTier: Record<ModelTier, MethodComparisonStats>;
  assumptionAudit: {
    byProtocol: Record<ProtocolKey, Record<ModelTier, AssumptionAuditStats>>;
    supportRegimeCoveragePrimary: Record<ProtocolKey, Record<ModelTier, Record<SupportRegimeKey, CoverageStats>>>;
  };
  limitations: string[];
};

type FoldTierSignal = {
  coveragePrimary: number;
  coverageEmpirical: number;
  coverageGaussian: number;
  lowVariance: boolean;
  nSupport: number;
  residualStdTrain: number;
  residualCenterShift: number;
  method: IntervalMethod;
};

const TIERS: ModelTier[] = ['A', 'B', 'C'];
const PROTOCOLS: ProtocolKey[] = ['country_out', 'rolling_origin'];

function finite(values: number[]): number[] {
  return values.filter(Number.isFinite);
}

function emptyCoverageStats(): CoverageStats {
  return {
    medianCoverage95: NaN,
    q25Coverage95: NaN,
    q75Coverage95: NaN,
    meanCoverage95: NaN,
    stdCoverage95: NaN,
    iqrWidthCoverage95: NaN,
    meanGapToNominal: NaN,
    medianGapToNominal: NaN,
    underCoverageRate: NaN,
    severeUnderCoverageRate: NaN,
    nFolds: 0,
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function std(values: number[]): number {
  if (values.length < 2) return NaN;
  const m = mean(values);
  const variance = values.reduce((sum, value) => {
    const d = value - m;
    return sum + d * d;
  }, 0) / (values.length - 1);
  return variance >= 0 ? Math.sqrt(variance) : NaN;
}

function rate(values: number[], predicate: (value: number) => boolean): number {
  if (values.length === 0) return NaN;
  return values.filter(predicate).length / values.length;
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

function supportRegimeFromUniqueCount(nSupport: number): SupportRegimeKey {
  if (nSupport <= 2) return 'thin_support';
  if (nSupport <= 4) return 'moderate_support';
  return 'broader_support';
}

function initializeProtocolTierRecord<T>(factory: () => T): Record<ProtocolKey, Record<ModelTier, T>> {
  return {
    country_out: { A: factory(), B: factory(), C: factory() },
    rolling_origin: { A: factory(), B: factory(), C: factory() },
  };
}

function initializeSupportRegimeRecord(): Record<SupportRegimeKey, number[]> {
  return {
    thin_support: [],
    moderate_support: [],
    broader_support: [],
  };
}

function summarizeCoverage(values: number[], nominalCoverage: number, severeThreshold: number): CoverageStats {
  const sorted = finite(values).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return emptyCoverageStats();
  }

  const medianCoverage95 = quantile(sorted, 0.5);
  const q25Coverage95 = quantile(sorted, 0.25);
  const q75Coverage95 = quantile(sorted, 0.75);
  const meanCoverage95 = mean(sorted);
  const stdCoverage95 = std(sorted);

  return {
    medianCoverage95,
    q25Coverage95,
    q75Coverage95,
    meanCoverage95,
    stdCoverage95,
    iqrWidthCoverage95: q75Coverage95 - q25Coverage95,
    meanGapToNominal: meanCoverage95 - nominalCoverage,
    medianGapToNominal: medianCoverage95 - nominalCoverage,
    underCoverageRate: rate(sorted, (value) => value < nominalCoverage),
    severeUnderCoverageRate: rate(sorted, (value) => value < severeThreshold),
    nFolds: sorted.length,
  };
}

function collectProtocolSignals(
  protocol: ProtocolKey,
  countryOut: CountryOutRefitSummary,
  rollingOrigin: RollingOriginRefitSummary,
): Record<ModelTier, FoldTierSignal[]> {
  const signalsByTier: Record<ModelTier, FoldTierSignal[]> = { A: [], B: [], C: [] };
  const folds = protocol === 'country_out' ? countryOut.folds : rollingOrigin.folds;

  for (const fold of folds) {
    for (const tier of TIERS) {
      const result = fold.tierResults[tier];
      const coveragePrimary = result.predictionIntervalCoverage95 ?? NaN;
      const coverageEmpirical = result.predictionIntervalCoverage95Empirical
        ?? (result.predictionIntervalMethod95 === 'empirical_quantile_shifted' ? coveragePrimary : NaN);
      const coverageGaussian = result.predictionIntervalCoverage95Gaussian
        ?? (result.predictionIntervalMethod95 === 'gaussian_symmetric_train_residual_std' ? coveragePrimary : NaN);

      signalsByTier[tier].push({
        coveragePrimary,
        coverageEmpirical,
        coverageGaussian,
        lowVariance: result.lowVarianceObservedTest === true,
        nSupport: result.nTestUniqueCountryYears ?? NaN,
        residualStdTrain: result.residualStdTrain ?? NaN,
        residualCenterShift: result.residualQuantileIntervalTrain95?.centerShift ?? NaN,
        method: result.predictionIntervalMethod95 ?? 'none',
      });
    }
  }

  return signalsByTier;
}

function summarizePooledCoverage(
  values: number[],
  nominalCoverage: number,
  severeThreshold: number,
): PooledCoverageStats {
  const summary = summarizeCoverage(values, nominalCoverage, severeThreshold);
  return {
    meanCoverage95: summary.meanCoverage95,
    nFolds: summary.nFolds,
    meanGapToNominal: summary.meanGapToNominal,
    underCoverageRate: summary.underCoverageRate,
    severeUnderCoverageRate: summary.severeUnderCoverageRate,
  };
}

function methodComparison(
  primaryValues: number[],
  gaussianValues: number[],
  nominalCoverage: number,
): MethodComparisonStats {
  const primaryMeanCoverage95 = mean(finite(primaryValues));
  const gaussianMeanCoverage95 = mean(finite(gaussianValues));

  return {
    primaryMeanCoverage95,
    gaussianMeanCoverage95,
    deltaMeanCoverage95:
      Number.isFinite(primaryMeanCoverage95) && Number.isFinite(gaussianMeanCoverage95)
        ? primaryMeanCoverage95 - gaussianMeanCoverage95
        : NaN,
    primaryAbsGapToNominal:
      Number.isFinite(primaryMeanCoverage95)
        ? Math.abs(primaryMeanCoverage95 - nominalCoverage)
        : NaN,
    gaussianAbsGapToNominal:
      Number.isFinite(gaussianMeanCoverage95)
        ? Math.abs(gaussianMeanCoverage95 - nominalCoverage)
        : NaN,
  };
}

export function computePredictionIntervalCoverage(
  countryOut: CountryOutRefitSummary,
  rollingOrigin: RollingOriginRefitSummary,
): PredictionIntervalCoverageSummary {
  const nominalCoverage = 0.95;
  const severeUnderCoverageThreshold = 0.8;

  const byProtocol = initializeProtocolTierRecord<CoverageStats>(emptyCoverageStats);
  const byProtocolEmpirical = initializeProtocolTierRecord<CoverageStats>(emptyCoverageStats);
  const byProtocolGaussian = initializeProtocolTierRecord<CoverageStats>(emptyCoverageStats);

  const assumptionAuditByProtocol = initializeProtocolTierRecord<AssumptionAuditStats>(() => ({
    lowVarianceFoldRate: NaN,
    thinSupportFoldRate: NaN,
    medianResidualStdTrain: NaN,
    residualStdCv: NaN,
    medianResidualCenterShift: NaN,
    empiricalVsGaussianMeanDelta: NaN,
    fallbackToGaussianRate: NaN,
    nComparableFolds: 0,
  }));

  const supportRegimeCoveragePrimary = initializeProtocolTierRecord<Record<SupportRegimeKey, CoverageStats>>(() => ({
    thin_support: emptyCoverageStats(),
    moderate_support: emptyCoverageStats(),
    broader_support: emptyCoverageStats(),
  }));

  const signalsByProtocol: Record<ProtocolKey, Record<ModelTier, FoldTierSignal[]>> = {
    country_out: collectProtocolSignals('country_out', countryOut, rollingOrigin),
    rolling_origin: collectProtocolSignals('rolling_origin', countryOut, rollingOrigin),
  };

  for (const protocol of PROTOCOLS) {
    for (const tier of TIERS) {
      const signals = signalsByProtocol[protocol][tier];
      const primaryValues = signals.map((signal) => signal.coveragePrimary);
      const empiricalValues = signals.map((signal) => signal.coverageEmpirical);
      const gaussianValues = signals.map((signal) => signal.coverageGaussian);

      byProtocol[protocol][tier] = summarizeCoverage(primaryValues, nominalCoverage, severeUnderCoverageThreshold);
      byProtocolEmpirical[protocol][tier] = summarizeCoverage(empiricalValues, nominalCoverage, severeUnderCoverageThreshold);
      byProtocolGaussian[protocol][tier] = summarizeCoverage(gaussianValues, nominalCoverage, severeUnderCoverageThreshold);

      const supportValues = finite(signals.map((signal) => signal.nSupport));
      const residualStdValues = finite(signals.map((signal) => signal.residualStdTrain));
      const residualCenterShiftValues = finite(signals.map((signal) => signal.residualCenterShift));

      const comparableDeltas = signals
        .filter((signal) => Number.isFinite(signal.coverageEmpirical) && Number.isFinite(signal.coverageGaussian))
        .map((signal) => signal.coverageEmpirical - signal.coverageGaussian);

      const meanResidualStd = mean(residualStdValues);
      const stdResidualStd = std(residualStdValues);

      assumptionAuditByProtocol[protocol][tier] = {
        lowVarianceFoldRate:
          signals.length > 0
            ? signals.filter((signal) => signal.lowVariance).length / signals.length
            : NaN,
        thinSupportFoldRate:
          supportValues.length > 0
            ? supportValues.filter((value) => value <= 2).length / supportValues.length
            : NaN,
        medianResidualStdTrain:
          residualStdValues.length > 0
            ? quantile(residualStdValues.sort((a, b) => a - b), 0.5)
            : NaN,
        residualStdCv:
          Number.isFinite(meanResidualStd)
          && Math.abs(meanResidualStd) > 1e-12
          && Number.isFinite(stdResidualStd)
            ? stdResidualStd / Math.abs(meanResidualStd)
            : NaN,
        medianResidualCenterShift:
          residualCenterShiftValues.length > 0
            ? quantile(residualCenterShiftValues.sort((a, b) => a - b), 0.5)
            : NaN,
        empiricalVsGaussianMeanDelta: mean(comparableDeltas),
        fallbackToGaussianRate:
          signals.length > 0
            ? signals.filter((signal) => signal.method === 'gaussian_symmetric_train_residual_std').length / signals.length
            : NaN,
        nComparableFolds: comparableDeltas.length,
      };

      const regimeBuckets = initializeSupportRegimeRecord();
      for (const signal of signals) {
        if (!Number.isFinite(signal.nSupport) || !Number.isFinite(signal.coveragePrimary)) continue;
        const regime = supportRegimeFromUniqueCount(signal.nSupport);
        regimeBuckets[regime].push(signal.coveragePrimary);
      }

      supportRegimeCoveragePrimary[protocol][tier] = {
        thin_support: summarizeCoverage(regimeBuckets.thin_support, nominalCoverage, severeUnderCoverageThreshold),
        moderate_support: summarizeCoverage(regimeBuckets.moderate_support, nominalCoverage, severeUnderCoverageThreshold),
        broader_support: summarizeCoverage(regimeBuckets.broader_support, nominalCoverage, severeUnderCoverageThreshold),
      };
    }
  }

  const pooledByTier = TIERS.reduce<Record<ModelTier, PooledCoverageStats>>((acc, tier) => {
    const pooledPrimary = PROTOCOLS.flatMap((protocol) =>
      signalsByProtocol[protocol][tier].map((signal) => signal.coveragePrimary)
    );
    acc[tier] = summarizePooledCoverage(pooledPrimary, nominalCoverage, severeUnderCoverageThreshold);
    return acc;
  }, {
    A: { meanCoverage95: NaN, nFolds: 0, meanGapToNominal: NaN, underCoverageRate: NaN, severeUnderCoverageRate: NaN },
    B: { meanCoverage95: NaN, nFolds: 0, meanGapToNominal: NaN, underCoverageRate: NaN, severeUnderCoverageRate: NaN },
    C: { meanCoverage95: NaN, nFolds: 0, meanGapToNominal: NaN, underCoverageRate: NaN, severeUnderCoverageRate: NaN },
  });

  const pooledByTierGaussian = TIERS.reduce<Record<ModelTier, PooledCoverageStats>>((acc, tier) => {
    const pooledGaussian = PROTOCOLS.flatMap((protocol) =>
      signalsByProtocol[protocol][tier].map((signal) => signal.coverageGaussian)
    );
    acc[tier] = summarizePooledCoverage(pooledGaussian, nominalCoverage, severeUnderCoverageThreshold);
    return acc;
  }, {
    A: { meanCoverage95: NaN, nFolds: 0, meanGapToNominal: NaN, underCoverageRate: NaN, severeUnderCoverageRate: NaN },
    B: { meanCoverage95: NaN, nFolds: 0, meanGapToNominal: NaN, underCoverageRate: NaN, severeUnderCoverageRate: NaN },
    C: { meanCoverage95: NaN, nFolds: 0, meanGapToNominal: NaN, underCoverageRate: NaN, severeUnderCoverageRate: NaN },
  });

  const methodComparisonByTier = TIERS.reduce<Record<ModelTier, MethodComparisonStats>>((acc, tier) => {
    const pooledPrimary = PROTOCOLS.flatMap((protocol) =>
      signalsByProtocol[protocol][tier].map((signal) => signal.coveragePrimary)
    );
    const pooledGaussian = PROTOCOLS.flatMap((protocol) =>
      signalsByProtocol[protocol][tier].map((signal) => signal.coverageGaussian)
    );
    acc[tier] = methodComparison(pooledPrimary, pooledGaussian, nominalCoverage);
    return acc;
  }, {
    A: {
      primaryMeanCoverage95: NaN,
      gaussianMeanCoverage95: NaN,
      deltaMeanCoverage95: NaN,
      primaryAbsGapToNominal: NaN,
      gaussianAbsGapToNominal: NaN,
    },
    B: {
      primaryMeanCoverage95: NaN,
      gaussianMeanCoverage95: NaN,
      deltaMeanCoverage95: NaN,
      primaryAbsGapToNominal: NaN,
      gaussianAbsGapToNominal: NaN,
    },
    C: {
      primaryMeanCoverage95: NaN,
      gaussianMeanCoverage95: NaN,
      deltaMeanCoverage95: NaN,
      primaryAbsGapToNominal: NaN,
      gaussianAbsGapToNominal: NaN,
    },
  });

  return {
    schemaVersion: 'phase1.prediction_interval_coverage.v2',
    generatedAtIso: new Date().toISOString(),
    nominalCoverage,
    severeUnderCoverageThreshold,
    intervalMethods: {
      primary: 'empirical_quantile_shifted',
      comparator: 'gaussian_symmetric_train_residual_std',
      fallback: 'gaussian_when_empirical_unavailable',
    },
    byProtocol,
    byProtocolEmpirical,
    byProtocolGaussian,
    pooledByTier,
    pooledByTierGaussian,
    methodComparisonByTier,
    assumptionAudit: {
      byProtocol: assumptionAuditByProtocol,
      supportRegimeCoveragePrimary,
    },
    limitations: [
      'Coverage is fold-conditional and sensitive to sparse support; pooled means should not be interpreted as universal calibration guarantees.',
      'Low-variance and saturation-prone folds can compress interval width and inflate apparent precision; use support-regime diagnostics jointly with coverage.',
      'Empirical residual-quantile intervals reduce strict normality dependence but still assume train-to-test residual transportability within each fold.',
    ],
  };
}
