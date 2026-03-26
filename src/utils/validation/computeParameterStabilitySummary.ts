import type { ModelTier, TierFeatureName } from './fitModelTier';
import type { CountryOutRefitSummary } from './computeLeaveOneCountryOutRefit';
import type { RollingOriginRefitSummary } from './computeRollingOriginRefit';

type CoefficientStability = {
  name: string;
  signConsistency: number;
  median: number;
  q25: number;
  q75: number;
  nFolds: number;
  unstable: boolean;
};

export type ParameterStabilitySummary = {
  schemaVersion: 'phase1.parameter_stability.v1';
  generatedAtIso: string;
  thresholdSignConsistency: number;
  thresholdsByTier: Record<ModelTier, number>;
  byProtocol: Record<'country_out' | 'rolling_origin', Record<ModelTier, {
    nConvergedFolds: number;
    coefficients: CoefficientStability[];
    unstableCount: number;
  }>>;
  pooledByTier: Record<ModelTier, {
    medianSignConsistency: number;
    unstableCount: number;
    unstableTerms: string[];
  }>;
};

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

function coefficientStability(
  names: string[],
  vectors: number[][],
  threshold: number
): CoefficientStability[] {
  return names.map((name, idx) => {
    const values = vectors.map((vector) => vector[idx]).filter(Number.isFinite);
    const sorted = values.slice().sort((a, b) => a - b);

    let pos = 0;
    let neg = 0;
    let zero = 0;
    for (const value of values) {
      if (Math.abs(value) < 1e-9) zero += 1;
      else if (value > 0) pos += 1;
      else neg += 1;
    }

    const n = values.length;
    const signConsistency = n > 0 ? Math.max(pos, neg, zero) / n : NaN;

    return {
      name,
      signConsistency,
      median: quantile(sorted, 0.5),
      q25: quantile(sorted, 0.25),
      q75: quantile(sorted, 0.75),
      nFolds: n,
      unstable: Number.isFinite(signConsistency) ? signConsistency < threshold : true,
    };
  });
}

function buildProtocolTierSummary(
  tier: ModelTier,
  folds: Array<{ tierResults: Record<ModelTier, { converged: boolean; intercept: number; coefficients: number[]; featureNames: TierFeatureName[] }> }>,
  threshold: number
): {
  nConvergedFolds: number;
  coefficients: CoefficientStability[];
  unstableCount: number;
} {
  const converged = folds
    .map((fold) => fold.tierResults[tier])
    .filter((result) => result.converged);

  if (!converged.length) {
    return { nConvergedFolds: 0, coefficients: [], unstableCount: 0 };
  }

  const names = ['intercept', ...converged[0].featureNames];
  const vectors = converged.map((result) => [result.intercept, ...result.coefficients]);
  const coeffs = coefficientStability(names, vectors, threshold);

  return {
    nConvergedFolds: converged.length,
    coefficients: coeffs,
    unstableCount: coeffs.filter((entry) => entry.unstable).length,
  };
}

export function computeParameterStabilitySummary(
  countryOut: CountryOutRefitSummary,
  rollingOrigin: RollingOriginRefitSummary,
  options?: { thresholdSignConsistency?: number; thresholdsByTier?: Partial<Record<ModelTier, number>> }
): ParameterStabilitySummary {
  const legacyThreshold = options?.thresholdSignConsistency ?? 0.7;
  const thresholdsByTier: Record<ModelTier, number> = {
    A: options?.thresholdsByTier?.A ?? 0.7,
    B: options?.thresholdsByTier?.B ?? 0.8,
    C: options?.thresholdsByTier?.C ?? 0.6,
  };
  const tiers: ModelTier[] = ['A', 'B', 'C'];

  const byProtocol: ParameterStabilitySummary['byProtocol'] = {
    country_out: { A: undefined as never, B: undefined as never, C: undefined as never },
    rolling_origin: { A: undefined as never, B: undefined as never, C: undefined as never },
  };

  for (const tier of tiers) {
    byProtocol.country_out[tier] = buildProtocolTierSummary(tier, countryOut.folds, thresholdsByTier[tier]);
    byProtocol.rolling_origin[tier] = buildProtocolTierSummary(tier, rollingOrigin.folds, thresholdsByTier[tier]);
  }

  const pooledByTier = tiers.reduce<ParameterStabilitySummary['pooledByTier']>((acc, tier) => {
    const pooled = [
      ...byProtocol.country_out[tier].coefficients,
      ...byProtocol.rolling_origin[tier].coefficients,
    ];

    const byName = new Map<string, number[]>();
    for (const coefficient of pooled) {
      if (!byName.has(coefficient.name)) byName.set(coefficient.name, []);
      byName.get(coefficient.name)!.push(coefficient.signConsistency);
    }

    const terms = Array.from(byName.entries()).map(([name, signs]) => {
      const finite = signs.filter(Number.isFinite).sort((a, b) => a - b);
      return {
        name,
        medianSign: quantile(finite, 0.5),
      };
    });

    const unstableTerms = terms
      .filter((term) => Number.isFinite(term.medianSign) && term.medianSign < thresholdsByTier[tier])
      .map((term) => term.name)
      .sort((a, b) => a.localeCompare(b));

    const medians = terms.map((term) => term.medianSign).filter(Number.isFinite).sort((a, b) => a - b);

    acc[tier] = {
      medianSignConsistency: quantile(medians, 0.5),
      unstableCount: unstableTerms.length,
      unstableTerms,
    };

    return acc;
  }, { A: undefined as never, B: undefined as never, C: undefined as never });

  return {
    schemaVersion: 'phase1.parameter_stability.v1',
    generatedAtIso: new Date().toISOString(),
    thresholdSignConsistency: legacyThreshold,
    thresholdsByTier,
    byProtocol,
    pooledByTier,
  };
}
