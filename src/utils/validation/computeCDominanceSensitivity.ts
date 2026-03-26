/**
 * C-Dominance Sensitivity Analysis
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Quantifies how much of cultural intensity (C)'s predictive contribution
 * reflects substantive signal versus mechanical shared-source correlation
 * with outcome Z (both WVS-derived).
 *
 * Three analyses:
 *   1. C-excluded model: re-fit tiers A/B/C without C features.
 *   2. C-permuted model: 200 iterations with randomly shuffled C.
 *   3. Partial R² ranking: drop each predictor one at a time, rank by R² loss.
 */

import type { PanelRowCanonical } from '../../types/panel';
import {
  fitModelTier,
  TIER_CONTRACTS,
  type ModelTier,
  type TierFeatureName,
  type FittedTierModel,
  type RefitMetrics,
} from './fitModelTier';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CDominanceTierResult = {
  tier: ModelTier;
  fullModel: { r2: number; rmse: number; mae: number };
  cExcluded: { r2: number; rmse: number; mae: number; deltaR2: number; deltaRmse: number; deltaMae: number };
  cPermuted: { meanR2: number; q05R2: number; q95R2: number; pValue: number };
};

export type PartialR2Entry = {
  predictor: string;
  fullR2: number;
  excludedR2: number;
  partialR2: number;
  rank: number;
};

export type CDominanceSensitivitySummary = {
  schemaVersion: 'phase1.c_dominance_sensitivity.v1';
  generatedAtIso: string;
  nRows: number;
  nPermutations: number;
  seed: number;
  tierResults: CDominanceTierResult[];
  partialR2Ranking: PartialR2Entry[];
  signStabilityUnderCExclusion: {
    tier: ModelTier;
    nCoeffs: number;
    nSignRetained: number;
    fractionRetained: number;
  }[];
  verdict: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple seeded PRNG (xorshift32) for deterministic permutation tests. */
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

/** Fisher-Yates shuffle using provided RNG. */
function shuffleArray<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * Math.max(0, Math.min(1, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (1 - (pos - lo)) + sorted[hi] * (pos - lo);
}

/** Base predictor names (the 10 main-effect features). */
const BASE_PREDICTORS: TierFeatureName[] = [
  'x_safe', 'y_safe', 'c_std', 'm', 't', 'd', 'g', 'e', 's', 'r',
];

/** Map from base predictor to all feature names that depend on it. */
function featuresInvolvingPredictor(predictor: TierFeatureName): Set<TierFeatureName> {
  const involved = new Set<TierFeatureName>([predictor]);
  // Check interactions and quadratics
  const interactionMap: Record<string, TierFeatureName[]> = {
    'x_safe': ['x_safe:y_safe'],
    'y_safe': ['y_safe:r', 'x_safe:y_safe'],
    'c_std': ['c_std:m', 'c_std^2'],
    'm': ['c_std:m', 'm^2'],
    't': ['t:r', 'd:t', 't^2'],
    'd': ['d:t'],
    'g': ['g:r'],
    'e': ['e:s', 'e^2'],
    's': ['e:s'],
    'r': ['y_safe:r', 't:r', 'g:r'],
  };
  const extras = interactionMap[predictor];
  if (extras) {
    for (const f of extras) involved.add(f);
  }
  return involved;
}

/** Remove features involving a predictor from a tier's feature list. */
function excludePredictor(tier: ModelTier, predictor: TierFeatureName): TierFeatureName[] {
  const toRemove = featuresInvolvingPredictor(predictor);
  return TIER_CONTRACTS[tier].featureNames.filter(f => !toRemove.has(f));
}

/**
 * Fit a model with a custom feature set (subset of the tier's features).
 * Uses the same ridge regression as fitModelTier but with a restricted feature list.
 */
function fitWithFeatures(
  rows: PanelRowCanonical[],
  features: TierFeatureName[],
  tier: ModelTier,
): FittedTierModel {
  // Temporarily override the tier contract
  const originalFeatures = TIER_CONTRACTS[tier].featureNames;
  (TIER_CONTRACTS[tier] as { featureNames: TierFeatureName[] }).featureNames = features;
  try {
    return fitModelTier(rows, tier, { minRows: 10 });
  } finally {
    (TIER_CONTRACTS[tier] as { featureNames: TierFeatureName[] }).featureNames = originalFeatures;
  }
}

// ---------------------------------------------------------------------------
// Core analysis
// ---------------------------------------------------------------------------

export function computeCDominanceSensitivity(
  rows: PanelRowCanonical[],
  options?: { nPermutations?: number; seed?: number },
): CDominanceSensitivitySummary {
  const nPerm = options?.nPermutations ?? 200;
  const seed = options?.seed ?? 42;
  const rng = createRng(seed);

  const tiers: ModelTier[] = ['A', 'B', 'C'];

  // ── 1. Full model training metrics ──────────────────────────────────────
  const fullModels: Record<ModelTier, FittedTierModel> = {} as Record<ModelTier, FittedTierModel>;
  const fullMetrics: Record<ModelTier, RefitMetrics> = {} as Record<ModelTier, RefitMetrics>;
  for (const tier of tiers) {
    fullModels[tier] = fitModelTier(rows, tier);
    fullMetrics[tier] = fullModels[tier].trainMetrics;
  }

  // ── 2. C-excluded model ─────────────────────────────────────────────────
  const cExcludedModels: Record<ModelTier, FittedTierModel> = {} as Record<ModelTier, FittedTierModel>;
  for (const tier of tiers) {
    const features = excludePredictor(tier, 'c_std');
    cExcludedModels[tier] = fitWithFeatures(rows, features, tier);
  }

  // ── 3. Sign stability under C-exclusion ─────────────────────────────────
  const signStability = tiers.map(tier => {
    const fullCoeffs = fullModels[tier].coefficients;
    const fullNames = fullModels[tier].featureNames;
    const excModel = cExcludedModels[tier];
    const excNames = excModel.featureNames;

    let nShared = 0;
    let nRetained = 0;
    for (let i = 0; i < excNames.length; i++) {
      const idx = fullNames.indexOf(excNames[i]);
      if (idx >= 0) {
        nShared++;
        if (Math.sign(fullCoeffs[idx]) === Math.sign(excModel.coefficients[i]) || excModel.coefficients[i] === 0) {
          nRetained++;
        }
      }
    }
    return {
      tier,
      nCoeffs: nShared,
      nSignRetained: nRetained,
      fractionRetained: nShared > 0 ? nRetained / nShared : 1,
    };
  });

  // ── 4. C-permuted model (200 iterations) ────────────────────────────────
  const permR2: Record<ModelTier, number[]> = { A: [], B: [], C: [] };

  for (let iter = 0; iter < nPerm; iter++) {
    // Shuffle C values across all rows
    const cValues = rows.map(r => r.C);
    const shuffledC = shuffleArray(cValues, rng);
    const permutedRows: PanelRowCanonical[] = rows.map((r, i) => ({
      ...r,
      C: shuffledC[i],
    }));

    for (const tier of tiers) {
      const model = fitModelTier(permutedRows, tier);
      permR2[tier].push(model.trainMetrics.r2);
    }
  }

  // ── 5. Partial R² ranking (Tier A, drop one at a time) ─────────────────
  const fullR2A = fullMetrics.A.r2;
  const partialEntries: PartialR2Entry[] = [];

  for (const pred of BASE_PREDICTORS) {
    const features = excludePredictor('A', pred);
    const model = fitWithFeatures(rows, features, 'A');
    const excludedR2 = model.trainMetrics.r2;
    const partialR2 = fullR2A - excludedR2;
    const label = pred === 'c_std' ? 'C' :
      pred === 'x_safe' ? 'X' :
      pred === 'y_safe' ? 'Y' :
      pred.toUpperCase();
    partialEntries.push({
      predictor: label,
      fullR2: fullR2A,
      excludedR2,
      partialR2,
      rank: 0, // filled below
    });
  }
  partialEntries.sort((a, b) => b.partialR2 - a.partialR2);
  partialEntries.forEach((e, i) => { e.rank = i + 1; });

  // ── 6. Assemble tier results ────────────────────────────────────────────
  const tierResults: CDominanceTierResult[] = tiers.map(tier => {
    const full = fullMetrics[tier];
    const exc = cExcludedModels[tier].trainMetrics;

    const sortedPermR2 = [...permR2[tier]].sort((a, b) => a - b);
    const meanPermR2 = sortedPermR2.reduce((s, v) => s + v, 0) / sortedPermR2.length;
    const q05 = quantile(sortedPermR2, 0.05);
    const q95 = quantile(sortedPermR2, 0.95);
    const pValue = sortedPermR2.filter(v => v >= full.r2).length / sortedPermR2.length;

    return {
      tier,
      fullModel: { r2: full.r2, rmse: full.rmse, mae: full.mae },
      cExcluded: {
        r2: exc.r2,
        rmse: exc.rmse,
        mae: exc.mae,
        deltaR2: full.r2 - exc.r2,
        deltaRmse: exc.rmse - full.rmse,
        deltaMae: exc.mae - full.mae,
      },
      cPermuted: {
        meanR2: meanPermR2,
        q05R2: q05,
        q95R2: q95,
        pValue,
      },
    };
  });

  // ── 7. Verdict ──────────────────────────────────────────────────────────
  const deltaA = tierResults[0].cExcluded.deltaR2;
  const pValA = tierResults[0].cPermuted.pValue;
  // Only check primary inferential tiers (A, B) for sign stability; Tier C is exploratory.
  const primarySignOk = signStability
    .filter(s => s.tier === 'A' || s.tier === 'B')
    .every(s => s.fractionRetained >= 0.75);

  let verdict: string;
  if (deltaA > 0.01 && pValA < 0.05 && primarySignOk) {
    verdict = 'C carries substantive predictive content beyond shared-source overlap; primary-tier sign structure retained under exclusion.';
  } else if (deltaA > 0.005) {
    verdict = 'C carries modest predictive content; shared-source overlap partially contributes but does not fully explain C dominance.';
  } else {
    verdict = 'C contribution is minimal after accounting for shared-source overlap; interpret with caution.';
  }

  return {
    schemaVersion: 'phase1.c_dominance_sensitivity.v1',
    generatedAtIso: new Date().toISOString(),
    nRows: rows.length,
    nPermutations: nPerm,
    seed,
    tierResults,
    partialR2Ranking: partialEntries,
    signStabilityUnderCExclusion: signStability,
    verdict,
  };
}
