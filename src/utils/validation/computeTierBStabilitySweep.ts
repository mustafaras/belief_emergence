/**
 * Tier B Stability Threshold Sweep
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Sweeps sign-consistency thresholds (0.75–0.95) across LOO country-out
 * refits for all Tier B parameters. Verifies that the "primary inferential"
 * classification is robust, or identifies specific terms for demotion.
 *
 * Uses the pre-computed parameter_stability.json artifact (country_out
 * protocol, Tier B) rather than re-running LOO refits.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TierBCoefficientEntry = {
  name: string;
  signConsistency: number;
  nFolds: number;
  median: number;
};

export type ThresholdResult = {
  threshold: number;
  nMeeting: number;
  nFailing: number;
  failing: string[];
};

export type TierBStabilitySweepSummary = {
  schemaVersion: 'phase1.tier_b_stability_sweep.v1';
  generatedAtIso: string;
  source: string;
  protocol: 'country_out';
  nFolds: number;
  nParameters: number;
  parameters: TierBCoefficientEntry[];
  thresholdSweep: ThresholdResult[];
  minimumSignConsistency: number;
  minimumSignConsistencyParameter: string;
  demotionCandidates: string[];
  verdict: string;
};

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

export function computeTierBStabilitySweep(
  parameterStability: {
    byProtocol: {
      country_out: {
        B: {
          nConvergedFolds: number;
          coefficients: Array<{
            name: string;
            signConsistency: number;
            nFolds: number;
            median: number;
          }>;
        };
      };
    };
  },
): TierBStabilitySweepSummary {
  const tierB = parameterStability.byProtocol.country_out.B;
  const coefficients = tierB.coefficients;
  const nFolds = tierB.nConvergedFolds;

  // Extract parameter entries
  const parameters: TierBCoefficientEntry[] = coefficients.map((c) => ({
    name: c.name,
    signConsistency: c.signConsistency,
    nFolds: c.nFolds,
    median: c.median,
  }));

  // Sweep thresholds
  const thresholds = [0.75, 0.80, 0.85, 0.90, 0.95];
  const thresholdSweep: ThresholdResult[] = thresholds.map((threshold) => {
    const failing = parameters.filter((p) => p.signConsistency < threshold).map((p) => p.name);
    return {
      threshold,
      nMeeting: parameters.length - failing.length,
      nFailing: failing.length,
      failing,
    };
  });

  // Minimum sign-consistency
  let minSC = Infinity;
  let minParam = '';
  for (const p of parameters) {
    if (p.signConsistency < minSC) {
      minSC = p.signConsistency;
      minParam = p.name;
    }
  }

  // Demotion candidates: sign-consistency < 0.80
  const demotionCandidates = parameters
    .filter((p) => p.signConsistency < 0.80)
    .map((p) => p.name);

  // Verdict
  let verdict: string;
  if (demotionCandidates.length > 0) {
    verdict = `CAVEAT: ${demotionCandidates.length} parameter(s) below 0.80 sign-consistency — review for exploratory demotion: ${demotionCandidates.join(', ')}.`;
  } else if (minSC >= 0.85) {
    verdict = `ROBUST: All ${parameters.length} Tier B parameters maintain ≥0.85 sign-consistency across ${nFolds} LOO refits. Classification as primary inferential is supported.`;
  } else {
    verdict = `SUPPORTED: All ${parameters.length} Tier B parameters maintain ≥0.75 sign-consistency (min=${minSC.toFixed(3)} for ${minParam}). Tier B classification as primary inferential holds under the disclosed thin-support constraint.`;
  }

  return {
    schemaVersion: 'phase1.tier_b_stability_sweep.v1',
    generatedAtIso: new Date().toISOString(),
    source: 'parameter_stability.json (country_out protocol, Tier B)',
    protocol: 'country_out',
    nFolds,
    nParameters: parameters.length,
    parameters,
    thresholdSweep,
    minimumSignConsistency: minSC,
    minimumSignConsistencyParameter: minParam,
    demotionCandidates,
    verdict,
  };
}
