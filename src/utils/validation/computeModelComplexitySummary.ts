import type { ModelLadderSummary } from './buildModelLadder';
import type { SupportMaskSummary } from './computeSupportMaskSummary';

export type ModelComplexitySupportSummary = {
  schemaVersion: 'phase1.model_complexity_support.v1';
  generatedAtIso: string;
  complexityByTier: Array<{
    tier: 'A' | 'B' | 'C';
    parameterCount: number;
    supportPerParameter: number;
    supportRiskFlag: boolean;
    exploratory: boolean;
    inferentialRole: 'primary' | 'exploratory';
  }>;
  supportMask: SupportMaskSummary;
  supportConstrainedInference: {
    effectiveSupportUnits: number;
    supportDensityNote: string;
    highDimensionalTermsGuardrail: string;
    tierDiscipline: {
      primary: Array<'A' | 'B'>;
      exploratory: Array<'C'>;
    };
  };
  interpretationBoundary: {
    tierCExploratory: boolean;
    note: string;
    guardrails: string[];
  };
};

export function computeModelComplexitySummary(
  ladder: ModelLadderSummary,
  supportMask: SupportMaskSummary,
  options?: { minSupportPerParameter?: number }
): ModelComplexitySupportSummary {
  const minSupportPerParameter = options?.minSupportPerParameter ?? 5;
  const effectiveSupportUnits = supportMask.nUniqueCountryYears;

  return {
    schemaVersion: 'phase1.model_complexity_support.v1',
    generatedAtIso: new Date().toISOString(),
    complexityByTier: ladder.tiers.map((tier) => ({
      tier: tier.tier,
      parameterCount: tier.parameterCount,
      supportPerParameter: tier.supportPerParameter,
      supportRiskFlag: Number.isFinite(tier.supportPerParameter) ? tier.supportPerParameter < minSupportPerParameter : true,
      exploratory: tier.exploratory,
      inferentialRole: tier.exploratory ? 'exploratory' : 'primary',
    })),
    supportMask,
    supportConstrainedInference: {
      effectiveSupportUnits,
      supportDensityNote:
        `Inference is conditioned on ${effectiveSupportUnits} unique country-years with uneven regime occupancy; evidence is support-bounded rather than population-general.`,
      highDimensionalTermsGuardrail:
        'Higher-dimensional interaction/curvature terms are interpreted as support-constrained diagnostics and are excluded from headline claims unless independently stabilized.',
      tierDiscipline: {
        primary: ['A', 'B'],
        exploratory: ['C'],
      },
    },
    interpretationBoundary: {
      tierCExploratory: true,
      note: 'Tier C remains exploratory unless independent stability and OOS performance are adequate, and interpretation remains support-constrained even for Tier A/B.',
      guardrails: [
        'Tier A/B provide the primary inferential pathway under refit OOS protocols.',
        'Tier C is exploratory and should not be used for headline inferential claims.',
        'All claims are bounded by thin effective support and uneven regime coverage.',
        'All reported effects remain descriptive/model-implied and do not establish causal effects.',
      ],
    },
  };
}
