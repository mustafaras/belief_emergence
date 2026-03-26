import type { ModelTier } from './fitModelTier';
import type { CountryOutRefitSummary } from './computeLeaveOneCountryOutRefit';
import type { RollingOriginRefitSummary } from './computeRollingOriginRefit';

export type FailureLogEntry = {
  protocol: 'country_out' | 'rolling_origin';
  foldId: string;
  tier: ModelTier;
  converged: boolean;
  failureReason?: string;
  nTrain: number;
  nTest: number;
};

export type FailureLogSummary = {
  schemaVersion: 'phase1.failure_log.v1';
  generatedAtIso: string;
  entries: FailureLogEntry[];
  byTier: Record<ModelTier, {
    totalFolds: number;
    failedFolds: number;
    failureRate: number;
    reasons: Array<{ reason: string; count: number }>;
  }>;
};

function summarizeReasons(entries: FailureLogEntry[]): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.converged) continue;
    const reason = entry.failureReason ?? 'unknown_failure';
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

export function computeFailureLogSummary(
  countryOut: CountryOutRefitSummary,
  rollingOrigin: RollingOriginRefitSummary
): FailureLogSummary {
  const entries: FailureLogEntry[] = [];
  const tiers: ModelTier[] = ['A', 'B', 'C'];

  for (const fold of countryOut.folds) {
    for (const tier of tiers) {
      const result = fold.tierResults[tier];
      entries.push({
        protocol: 'country_out',
        foldId: fold.foldId,
        tier,
        converged: result.converged,
        failureReason: result.failureReason,
        nTrain: result.nTrain,
        nTest: result.nTest,
      });
    }
  }

  for (const fold of rollingOrigin.folds) {
    for (const tier of tiers) {
      const result = fold.tierResults[tier];
      entries.push({
        protocol: 'rolling_origin',
        foldId: fold.foldId,
        tier,
        converged: result.converged,
        failureReason: result.failureReason,
        nTrain: result.nTrain,
        nTest: result.nTest,
      });
    }
  }

  const byTier = tiers.reduce<FailureLogSummary['byTier']>((acc, tier) => {
    const tierEntries = entries.filter((entry) => entry.tier === tier);
    const failed = tierEntries.filter((entry) => !entry.converged);

    acc[tier] = {
      totalFolds: tierEntries.length,
      failedFolds: failed.length,
      failureRate: tierEntries.length > 0 ? failed.length / tierEntries.length : NaN,
      reasons: summarizeReasons(tierEntries),
    };

    return acc;
  }, { A: undefined as never, B: undefined as never, C: undefined as never });

  return {
    schemaVersion: 'phase1.failure_log.v1',
    generatedAtIso: new Date().toISOString(),
    entries,
    byTier,
  };
}
