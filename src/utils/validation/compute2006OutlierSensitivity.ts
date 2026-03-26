/**
 * 2006 Temporal Outlier Sensitivity Analysis
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Quantifies whether the 2006 year-slice (flagged as the worst construct-Z
 * invariance outlier: inter-item corr = 0.699 vs. median 0.932) materially
 * affects headline LOO metrics and model conclusions.
 *
 * Four analyses:
 *   1. 2006-excluded LOO CV (country-out) for Tiers A/B/C on reduced panel.
 *   2. Comparison table: Δ between 2006-excluded and full-panel LOO aggregates.
 *   3. Construct diagnostics: 2006 vs other-years Z coherence and distribution.
 *   4. Sign-stability check: coefficient sign retention under 2006 exclusion.
 */

import type { PanelRowCanonical } from '../../types/panel';
import {
  fitModelTier,
  type ModelTier,
  type FittedTierModel,
} from './fitModelTier';
import { computeLeaveOneCountryOutRefit } from './computeLeaveOneCountryOutRefit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MetricDelta = {
  fullPanel: number;
  excluded2006: number;
  delta: number;
};

export type TierMetricComparison = {
  tier: ModelTier;
  rmse: MetricDelta;
  mae: MetricDelta;
  r2: MetricDelta;
};

export type ConstructDiagnostics2006 = {
  year2006: {
    nRows: number;
    countries: string[];
    meanZ: number;
    sdZ: number;
  };
  otherYears: {
    nRows: number;
    meanZ: number;
    sdZ: number;
  };
  constructCorrelation2006: number;
  constructCorrelationMedian: number;
};

export type SignStabilityResult = {
  tier: ModelTier;
  nCoeffs: number;
  nSignRetained: number;
  fractionRetained: number;
  flippedFeatures: string[];
};

export type TemporalOutlier2006Summary = {
  schemaVersion: 'phase1.temporal_outlier_2006_sensitivity.v1';
  generatedAtIso: string;
  fullPanelNRows: number;
  excluded2006NRows: number;
  nRowsExcluded: number;
  looComparisonRefit: TierMetricComparison[];
  constructDiagnostics: ConstructDiagnostics2006;
  signStability: SignStabilityResult[];
  verdict: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function sd(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const sumSq = values.reduce((s, v) => s + (v - m) ** 2, 0);
  return Math.sqrt(sumSq / (values.length - 1));
}



// ---------------------------------------------------------------------------
// Core analysis
// ---------------------------------------------------------------------------

export function compute2006OutlierSensitivity(
  rows: PanelRowCanonical[],
): TemporalOutlier2006Summary {
  const tiers: ModelTier[] = ['A', 'B', 'C'];

  // ── 1. Split: 2006 vs non-2006 ─────────────────────────────────────────
  const rows2006 = rows.filter(r => r.year === 2006);
  const rowsExcluded = rows.filter(r => r.year !== 2006);
  const countries2006 = Array.from(new Set(rows2006.map(r => r.iso3).filter(Boolean))).sort();

  // ── 2. Full-panel LOO CV ────────────────────────────────────────────────
  const fullLoo = computeLeaveOneCountryOutRefit(rows);

  // ── 3. 2006-excluded LOO CV ─────────────────────────────────────────────
  const excludedLoo = computeLeaveOneCountryOutRefit(rowsExcluded);

  // ── 4. Comparison table (refit aggregates) ──────────────────────────────
  const looComparison: TierMetricComparison[] = tiers.map(tier => {
    const full = fullLoo.aggregatesRefit[tier];
    const exc = excludedLoo.aggregatesRefit[tier];
    return {
      tier,
      rmse: { fullPanel: full.rmse.median, excluded2006: exc.rmse.median, delta: exc.rmse.median - full.rmse.median },
      mae: { fullPanel: full.mae.median, excluded2006: exc.mae.median, delta: exc.mae.median - full.mae.median },
      r2: { fullPanel: full.r2.median, excluded2006: exc.r2.median, delta: exc.r2.median - full.r2.median },
    };
  });

  // ── 5. Construct diagnostics ────────────────────────────────────────────
  // Z values for 2006 vs other years
  const z2006 = rows2006.map(r => r.Z).filter(Number.isFinite);
  const zOther = rowsExcluded.map(r => r.Z).filter(Number.isFinite);

  // Compute inter-item correlation for 2006 using Z components
  // Z is composed of Z_religion_importance and Z_violence_justifiable
  // These are stored as composite; we compute proxy from the canonical data
  // Using the values from construct_validity_invariance.json:
  // 2006 corr = 0.6993, median across years = 0.9322
  const constructCorrelation2006 = 0.6993;
  const constructCorrelationMedian = 0.9322;

  const constructDiagnostics: ConstructDiagnostics2006 = {
    year2006: {
      nRows: rows2006.length,
      countries: countries2006,
      meanZ: mean(z2006),
      sdZ: sd(z2006),
    },
    otherYears: {
      nRows: rowsExcluded.length,
      meanZ: mean(zOther),
      sdZ: sd(zOther),
    },
    constructCorrelation2006,
    constructCorrelationMedian,
  };

  // ── 6. Sign-stability check ─────────────────────────────────────────────
  const fullModels: Record<ModelTier, FittedTierModel> = {} as Record<ModelTier, FittedTierModel>;
  const excModels: Record<ModelTier, FittedTierModel> = {} as Record<ModelTier, FittedTierModel>;

  for (const tier of tiers) {
    fullModels[tier] = fitModelTier(rows, tier);
    excModels[tier] = fitModelTier(rowsExcluded, tier);
  }

  const signStability: SignStabilityResult[] = tiers.map(tier => {
    const fullCoeffs = fullModels[tier].coefficients;
    const fullNames = fullModels[tier].featureNames;
    const excCoeffs = excModels[tier].coefficients;
    const excNames = excModels[tier].featureNames;

    let nShared = 0;
    let nRetained = 0;
    const flipped: string[] = [];

    for (let i = 0; i < fullNames.length; i++) {
      const excIdx = excNames.indexOf(fullNames[i]);
      if (excIdx >= 0) {
        nShared++;
        const fullSign = Math.sign(fullCoeffs[i]);
        const excSign = Math.sign(excCoeffs[excIdx]);
        if (fullSign === excSign || excCoeffs[excIdx] === 0) {
          nRetained++;
        } else {
          flipped.push(fullNames[i]);
        }
      }
    }

    return {
      tier,
      nCoeffs: nShared,
      nSignRetained: nRetained,
      fractionRetained: nShared > 0 ? nRetained / nShared : 1,
      flippedFeatures: flipped,
    };
  });

  // ── 7. Verdict ──────────────────────────────────────────────────────────
  const maxAbsDeltaR2 = Math.max(...looComparison.map(c => Math.abs(c.r2.delta)));
  const primarySignOk = signStability
    .filter(s => s.tier === 'A' || s.tier === 'B')
    .every(s => s.fractionRetained >= 0.75);

  let verdict: string;
  if (maxAbsDeltaR2 < 0.05 && primarySignOk) {
    verdict = 'Excluding 2006 does not materially alter headline Tier A/B OOS metrics; year-level construct instability is not a driver of reported aggregate patterns.';
  } else if (maxAbsDeltaR2 < 0.10 && primarySignOk) {
    verdict = 'Excluding 2006 produces modest changes in OOS metrics; primary-tier sign structure is retained but metric sensitivity warrants acknowledgment.';
  } else {
    verdict = 'Excluding 2006 materially alters OOS metrics or sign structure; this year-level instability may be a driver of reported aggregate patterns.';
  }

  return {
    schemaVersion: 'phase1.temporal_outlier_2006_sensitivity.v1',
    generatedAtIso: new Date().toISOString(),
    fullPanelNRows: rows.length,
    excluded2006NRows: rowsExcluded.length,
    nRowsExcluded: rows2006.length,
    looComparisonRefit: looComparison,
    constructDiagnostics,
    signStability,
    verdict,
  };
}
