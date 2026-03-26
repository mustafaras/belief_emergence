import type { PanelRowCanonical } from '../../types/panel';
import { fitAndEvaluateTier, type ModelTier, type RefitMetrics } from './fitModelTier';
import type { CountryOutRefitSummary } from './computeLeaveOneCountryOutRefit';
import type { RollingOriginRefitSummary } from './computeRollingOriginRefit';

type ProtocolRefitAggregate = {
  rmseMedian: number;
  maeMedian: number;
  coverage95Median: number;
  failureRate: number;
};

type DevelopmentReferenceByTier = {
  countryOut: ProtocolRefitAggregate;
  rollingOrigin: ProtocolRefitAggregate;
  pooledRefitRmseMedian: number | null;
  pooledRefitMaeMedian: number | null;
  pooledRefitCoverage95Median: number | null;
};

type LockboxTierEvaluation = {
  tier: ModelTier;
  converged: boolean;
  failureReason?: string;
  nTrainRows: number;
  nTestRows: number;
  nTestUniqueCountryYears: number;
  lowVarianceObservedTest: boolean;
  testMetricsRefit: RefitMetrics;
  testMetricsSupportCollapsedRefit: RefitMetrics;
  predictionIntervalCoverage95: number | null;
  predictionIntervalCoverage95Empirical: number | null;
  predictionIntervalCoverage95Gaussian: number | null;
  predictionIntervalMethod95:
    | 'empirical_quantile_shifted'
    | 'gaussian_symmetric_train_residual_std'
    | 'none';
};

type LockboxVsDevelopmentDelta = {
  rmseMinusCountryOutMedian: number | null;
  rmseMinusRollingMedian: number | null;
  maeMinusCountryOutMedian: number | null;
  maeMinusRollingMedian: number | null;
  coverage95MinusCountryOutMedian: number | null;
  coverage95MinusRollingMedian: number | null;
};

type LockboxSplitSummary = {
  minRowsPerHeldoutCell: number;
  medianRowsPerHeldoutCell: number;
  maxRowsPerHeldoutCell: number;
};

export type LockboxHoldoutSummary = {
  schemaVersion: 'phase1.lockbox_holdout.v1';
  generatedAtIso: string;
  source: {
    datasetPath?: string;
    datasetSha256?: string;
    nRows: number;
    nCountries: number;
    yearMin: number | null;
    yearMax: number | null;
  };
  release: {
    cycleId: string;
    rerunPolicy: 'single_compute_per_cycle';
  };
  splitPolicy: {
    policyVersion: 'lockbox.country_year_hash.v1';
    hashSalt: string;
    lockboxCellFraction: number;
    minLockboxCells: number;
    nCellsTotal: number;
    nDevCells: number;
    nLockboxCells: number;
    lockboxCellFingerprint: string;
    devCellFingerprint: string;
    lockboxCells: string[];
  };
  developmentReference: Record<ModelTier, DevelopmentReferenceByTier>;
  lockboxEvaluation: {
    byTier: Record<ModelTier, LockboxTierEvaluation>;
    comparisonVsDevelopmentByTier: Record<ModelTier, LockboxVsDevelopmentDelta>;
  };
  checks: {
    overlapPass: boolean;
    lockboxSupportSummary: LockboxSplitSummary;
    minLockboxCellsRequired: number;
    minLockboxRowsRequired: number;
    lockboxSizePass: boolean;
    releaseCycleGuardPass: boolean;
    protocolViolationFlags: string[];
  };
  limitations: string[];
};

const TIERS: ModelTier[] = ['A', 'B', 'C'];
const POLICY_VERSION = 'lockbox.country_year_hash.v1' as const;

function safeFinite(values: number[]): number[] {
  return values.filter(Number.isFinite);
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

function maybeMean(values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function maybeDelta(left: number | null, right: number): number | null {
  if (left === null || !Number.isFinite(left) || !Number.isFinite(right)) return null;
  return left - right;
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function scoreForKey(key: string, hashSalt: string): number {
  const hash = fnv1a32(`${POLICY_VERSION}|${hashSalt}|${key}`);
  return hash / 0xffffffff;
}

function fingerprintKeys(keys: string[]): string {
  const canonical = [...keys].sort((left, right) => left.localeCompare(right)).join('|');
  const hash = fnv1a32(`${POLICY_VERSION}|${canonical}`);
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

function rowKey(row: PanelRowCanonical): string {
  return `${row.iso3}::${row.year}`;
}

function buildDevelopmentReference(
  cvCountryOut: CountryOutRefitSummary,
  cvRollingOrigin: RollingOriginRefitSummary,
): Record<ModelTier, DevelopmentReferenceByTier> {
  return TIERS.reduce<Record<ModelTier, DevelopmentReferenceByTier>>((acc, tier) => {
    const countryOut = cvCountryOut.aggregatesRefit[tier];
    const rolling = cvRollingOrigin.aggregatesRefit[tier];

    const countryOutSummary: ProtocolRefitAggregate = {
      rmseMedian: countryOut.rmse.median,
      maeMedian: countryOut.mae.median,
      coverage95Median: countryOut.coverage95.median,
      failureRate: countryOut.failureRate,
    };
    const rollingSummary: ProtocolRefitAggregate = {
      rmseMedian: rolling.rmse.median,
      maeMedian: rolling.mae.median,
      coverage95Median: rolling.coverage95.median,
      failureRate: rolling.failureRate,
    };

    acc[tier] = {
      countryOut: countryOutSummary,
      rollingOrigin: rollingSummary,
      pooledRefitRmseMedian: maybeMean([countryOutSummary.rmseMedian, rollingSummary.rmseMedian]),
      pooledRefitMaeMedian: maybeMean([countryOutSummary.maeMedian, rollingSummary.maeMedian]),
      pooledRefitCoverage95Median: maybeMean([countryOutSummary.coverage95Median, rollingSummary.coverage95Median]),
    };

    return acc;
  }, { A: undefined as never, B: undefined as never, C: undefined as never });
}

export function computeLockboxHoldoutSummary(
  rows: PanelRowCanonical[],
  cvCountryOut: CountryOutRefitSummary,
  cvRollingOrigin: RollingOriginRefitSummary,
  options?: {
    releaseCycleId?: string;
    datasetPath?: string;
    datasetSha256?: string;
    lockboxCellFraction?: number;
    minLockboxCells?: number;
    minLockboxRows?: number;
    hashSalt?: string;
  },
): LockboxHoldoutSummary {
  const lockboxCellFraction = options?.lockboxCellFraction ?? 0.2;
  const minLockboxCells = options?.minLockboxCells ?? 6;
  const minLockboxRows = options?.minLockboxRows ?? 24;
  const hashSalt = options?.hashSalt ?? 'phase1_lockbox_split_seed_v1';

  const groupedRows = new Map<string, PanelRowCanonical[]>();
  for (const row of rows) {
    const key = rowKey(row);
    const current = groupedRows.get(key);
    if (current) current.push(row);
    else groupedRows.set(key, [row]);
  }

  const cellKeys = Array.from(groupedRows.keys());
  const sortedByScore = [...cellKeys].sort((left, right) => {
    const scoreDelta = scoreForKey(left, hashSalt) - scoreForKey(right, hashSalt);
    if (scoreDelta !== 0) return scoreDelta;
    return left.localeCompare(right);
  });

  const totalCells = sortedByScore.length;
  const requestedLockboxCells = Math.max(Math.round(totalCells * lockboxCellFraction), minLockboxCells, 1);
  const selectedLockboxCells = sortedByScore.slice(0, Math.max(0, Math.min(totalCells - 1, requestedLockboxCells)));
  const lockboxSet = new Set(selectedLockboxCells);

  const lockboxRows = rows.filter((row) => lockboxSet.has(rowKey(row)));
  const developmentRows = rows.filter((row) => !lockboxSet.has(rowKey(row)));

  const overlapPass = (() => {
    const devKeys = new Set(developmentRows.map(rowKey));
    for (const key of lockboxSet) {
      if (devKeys.has(key)) return false;
    }
    return true;
  })();

  const lockboxRowsPerCell = selectedLockboxCells.map((key) => groupedRows.get(key)?.length ?? 0);
  const lockboxRowsPerCellSorted = safeFinite(lockboxRowsPerCell).sort((left, right) => left - right);

  const lockboxSupportSummary: LockboxSplitSummary = {
    minRowsPerHeldoutCell:
      lockboxRowsPerCellSorted.length > 0 ? lockboxRowsPerCellSorted[0] : NaN,
    medianRowsPerHeldoutCell:
      lockboxRowsPerCellSorted.length > 0 ? quantile(lockboxRowsPerCellSorted, 0.5) : NaN,
    maxRowsPerHeldoutCell:
      lockboxRowsPerCellSorted.length > 0 ? lockboxRowsPerCellSorted[lockboxRowsPerCellSorted.length - 1] : NaN,
  };

  const byTier = TIERS.reduce<Record<ModelTier, LockboxTierEvaluation>>((acc, tier) => {
    const evalResult = fitAndEvaluateTier(developmentRows, lockboxRows, tier);

    acc[tier] = {
      tier,
      converged: evalResult.converged,
      failureReason: evalResult.failureReason,
      nTrainRows: evalResult.nTrain,
      nTestRows: evalResult.nTest,
      nTestUniqueCountryYears: evalResult.nTestUniqueCountryYears ?? 0,
      lowVarianceObservedTest: evalResult.lowVarianceObservedTest ?? false,
      testMetricsRefit: evalResult.testMetricsRefit,
      testMetricsSupportCollapsedRefit: evalResult.testMetricsSupportCollapsedRefit ?? evalResult.testMetricsRefit,
      predictionIntervalCoverage95: evalResult.predictionIntervalCoverage95,
      predictionIntervalCoverage95Empirical: evalResult.predictionIntervalCoverage95Empirical ?? null,
      predictionIntervalCoverage95Gaussian: evalResult.predictionIntervalCoverage95Gaussian ?? null,
      predictionIntervalMethod95: evalResult.predictionIntervalMethod95 ?? 'none',
    };

    return acc;
  }, { A: undefined as never, B: undefined as never, C: undefined as never });

  const developmentReference = buildDevelopmentReference(cvCountryOut, cvRollingOrigin);

  const comparisonVsDevelopmentByTier = TIERS.reduce<Record<ModelTier, LockboxVsDevelopmentDelta>>((acc, tier) => {
    const lockboxTier = byTier[tier];
    const devTier = developmentReference[tier];

    acc[tier] = {
      rmseMinusCountryOutMedian: maybeDelta(lockboxTier.testMetricsRefit.rmse, devTier.countryOut.rmseMedian),
      rmseMinusRollingMedian: maybeDelta(lockboxTier.testMetricsRefit.rmse, devTier.rollingOrigin.rmseMedian),
      maeMinusCountryOutMedian: maybeDelta(lockboxTier.testMetricsRefit.mae, devTier.countryOut.maeMedian),
      maeMinusRollingMedian: maybeDelta(lockboxTier.testMetricsRefit.mae, devTier.rollingOrigin.maeMedian),
      coverage95MinusCountryOutMedian: maybeDelta(lockboxTier.predictionIntervalCoverage95, devTier.countryOut.coverage95Median),
      coverage95MinusRollingMedian: maybeDelta(lockboxTier.predictionIntervalCoverage95, devTier.rollingOrigin.coverage95Median),
    };

    return acc;
  }, { A: undefined as never, B: undefined as never, C: undefined as never });

  const violations: string[] = [];
  if (totalCells < 2) {
    violations.push('insufficient_country_year_cells_for_lockbox_split');
  }
  if (!overlapPass) {
    violations.push('lockbox_overlap_detected_between_development_and_holdout');
  }
  if (selectedLockboxCells.length < minLockboxCells) {
    violations.push('lockbox_cells_below_minimum_threshold');
  }
  if (lockboxRows.length < minLockboxRows) {
    violations.push('lockbox_rows_below_minimum_threshold');
  }
  if (developmentRows.length === 0) {
    violations.push('development_split_empty');
  }
  if (lockboxRows.length === 0) {
    violations.push('lockbox_split_empty');
  }
  for (const tier of TIERS) {
    if (!byTier[tier].converged) {
      violations.push(`lockbox_refit_nonconverged_tier_${tier}`);
    }
  }

  const years = safeFinite(rows.map((row) => row.year));
  const countries = new Set(rows.map((row) => row.iso3));

  return {
    schemaVersion: 'phase1.lockbox_holdout.v1',
    generatedAtIso: new Date().toISOString(),
    source: {
      datasetPath: options?.datasetPath,
      datasetSha256: options?.datasetSha256,
      nRows: rows.length,
      nCountries: countries.size,
      yearMin: years.length > 0 ? Math.min(...years) : null,
      yearMax: years.length > 0 ? Math.max(...years) : null,
    },
    release: {
      cycleId: options?.releaseCycleId ?? 'unspecified_release_cycle',
      rerunPolicy: 'single_compute_per_cycle',
    },
    splitPolicy: {
      policyVersion: POLICY_VERSION,
      hashSalt,
      lockboxCellFraction,
      minLockboxCells,
      nCellsTotal: totalCells,
      nDevCells: totalCells - selectedLockboxCells.length,
      nLockboxCells: selectedLockboxCells.length,
      lockboxCellFingerprint: fingerprintKeys(selectedLockboxCells),
      devCellFingerprint: fingerprintKeys(sortedByScore.filter((key) => !lockboxSet.has(key))),
      lockboxCells: [...selectedLockboxCells],
    },
    developmentReference,
    lockboxEvaluation: {
      byTier,
      comparisonVsDevelopmentByTier,
    },
    checks: {
      overlapPass,
      lockboxSupportSummary,
      minLockboxCellsRequired: minLockboxCells,
      minLockboxRowsRequired: minLockboxRows,
      lockboxSizePass: selectedLockboxCells.length >= minLockboxCells && lockboxRows.length >= minLockboxRows,
      releaseCycleGuardPass: true,
      protocolViolationFlags: violations,
    },
    limitations: [
      'Lockbox evaluation is split at (iso3,year) cell level to prevent within-cell leakage, but coverage remains constrained by the same sparse support envelope.',
      'Single lockbox partition per release cycle reduces metric peeking, but does not replace external-data validation.',
      'Tier C lockbox metrics are reported for transparency and remain exploratory under the established tier contract.',
    ],
  };
}
