import type { PanelRowCanonical } from '../../types/panel';
import { fitModelTier, type ModelTier, TIER_CONTRACTS } from './fitModelTier';

export type ModelLadderTierSummary = {
  tier: ModelTier;
  label: string;
  exploratory: boolean;
  inferentialRole: 'primary' | 'exploratory';
  interpretationBoundary: string;
  nTrain: number;
  parameterCount: number;
  supportPerParameter: number;
  converged: boolean;
  failureReason?: string;
  trainMetrics: {
    n: number;
    r2: number;
    corr: number;
    mae: number;
    rmse: number;
    bias: number;
  };
};

export type ModelLadderSummary = {
  schemaVersion: 'phase1.model_ladder.v1';
  generatedAtIso: string;
  nRows: number;
  nUniqueCountryYears: number;
  tiers: ModelLadderTierSummary[];
  decisionContext: {
    primaryComparison: 'A_vs_B';
    note: string;
  };
  interpretationGuardrails: {
    effectiveSupport: {
      nUniqueCountryYears: number;
      supportDensityNote: string;
    };
    tierDiscipline: {
      A: 'primary';
      B: 'primary';
      C: 'exploratory';
    };
    headlinePolicy: string;
  };
};

function countUniqueCountryYears(rows: PanelRowCanonical[]): number {
  const keyset = new Set<string>();
  for (const row of rows) {
    if (!row.iso3 || !Number.isFinite(row.year)) continue;
    keyset.add(`${row.iso3}::${row.year}`);
  }
  return keyset.size;
}

export function buildModelLadder(
  rows: PanelRowCanonical[],
  options?: { lambda?: number; minRows?: number }
): ModelLadderSummary {
  const nUnique = countUniqueCountryYears(rows);

  const tierOrder: ModelTier[] = ['A', 'B', 'C'];
  const tiers: ModelLadderTierSummary[] = tierOrder.map((tier) => {
    const fit = fitModelTier(rows, tier, options);
    const p = fit.featureNames.length + 1;
    const inferentialRole = TIER_CONTRACTS[tier].exploratory ? 'exploratory' : 'primary';
    const interpretationBoundary = inferentialRole === 'primary'
      ? 'Primary refit OOS evidence tier; interpretation remains support-conditioned under thin effective support.'
      : 'Exploratory sensitivity tier; not used for headline inference under thin effective support.';

    return {
      tier,
      label: fit.label,
      exploratory: TIER_CONTRACTS[tier].exploratory,
      inferentialRole,
      interpretationBoundary,
      nTrain: fit.nTrain,
      parameterCount: p,
      supportPerParameter: p > 0 ? nUnique / p : NaN,
      converged: fit.converged,
      failureReason: fit.failureReason,
      trainMetrics: fit.trainMetrics,
    };
  });

  return {
    schemaVersion: 'phase1.model_ladder.v1',
    generatedAtIso: new Date().toISOString(),
    nRows: rows.length,
    nUniqueCountryYears: nUnique,
    tiers,
    decisionContext: {
      primaryComparison: 'A_vs_B',
      note: 'Tier A/B are primary inferential candidates; Tier C remains exploratory unless stronger support and independent stability/OOS checks are adequate.',
    },
    interpretationGuardrails: {
      effectiveSupport: {
        nUniqueCountryYears: nUnique,
        supportDensityNote: 'All tiered interpretations are conditioned on thin effective support and should not be read as unrestricted population generalization.',
      },
      tierDiscipline: {
        A: 'primary',
        B: 'primary',
        C: 'exploratory',
      },
      headlinePolicy: 'Headline inferential claims are restricted to Tier A/B evidence families; Tier C is retained for exploratory sensitivity only.',
    },
  };
}
