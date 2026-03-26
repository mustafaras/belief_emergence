/**
 * Fixed-coefficient ablation evaluation (no refit, no UI integration).
 *
 * Computes descriptive metrics under three model configurations (ablation modes)
 * using the canonical panel prediction pipeline. This evaluates the contribution
 * of interaction and quadratic terms by comparing:
 * - "main": baseline + main effects only
 * - "main+int": baseline + main + interactions
 * - "full": baseline + main + interactions + quadratic (canonical model)
 *
 * All modes share identical preprocessing (C z-scoring, X/Y normalization).
 * Coefficients remain fixed; no retraining occurs.
 */

import type { PanelRowCanonical } from '../../types/panel';
import { predictFromPanelRow } from './panelPredict';
import { computeBias, computeMAE, computePearsonCorr, computeR2, computeRMSE } from '../metrics';

export type AblationMode = 'main' | 'main+int' | 'full';

export type AblationRow = {
  mode: AblationMode;
  label: string; // human-readable label
  nTotal: number;
  nUsed: number;
  metrics: {
    r2: number | null;
    corr: number | null;
    mae: number | null;
    rmse: number | null;
    bias: number | null; // mean(zObs - zPred)
    residualP10: number | null;
    residualP50: number | null;
    residualP90: number | null;
  };
};

export type AblationSummary = {
  definition: {
    strategy: 'fixed-coefficient ablation evaluation';
    notes: string[];
    filteringRule: string;
  };
  rows: AblationRow[];
};

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/**
 * Quantile computation using linear interpolation between closest ranks.
 * Deterministic for sorted arrays. q=0 → min, q=1 → max.
 */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const t = clamp01(q);
  const pos = (sorted.length - 1) * t;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const w = pos - lo;
  if (lo === hi) return sorted[lo];
  return (1 - w) * sorted[lo] + w * sorted[hi];
}

function computeResidualStats(residuals: number[]): { p10: number; p50: number; p90: number } {
  const xs = residuals.filter(Number.isFinite).slice().sort((a, b) => a - b);
  return {
    p10: quantile(xs, 0.1),
    p50: quantile(xs, 0.5),
    p90: quantile(xs, 0.9),
  };
}

function computeModeMetrics(
  zObs: number[],
  zPred: number[],
  residuals: number[],
  minRows: number
) {
  const n = Math.min(zObs.length, zPred.length);
  if (n < minRows) {
    // insufficient sample; return null metrics
    return {
      r2: null,
      corr: null,
      mae: null,
      rmse: null,
      bias: null,
      residualP10: null,
      residualP50: null,
      residualP90: null,
    };
  }

  const bias = computeBias(zObs, zPred);

  const resSummary = computeResidualStats(residuals);

  return {
    r2: computeR2(zObs, zPred),
    corr: computePearsonCorr(zObs, zPred),
    mae: computeMAE(zObs, zPred),
    rmse: computeRMSE(zObs, zPred),
    bias,
    residualP10: resSummary.p10,
    residualP50: resSummary.p50,
    residualP90: resSummary.p90,
  };
}

/**
 * Compute metrics for a single ablation mode using fixed coefficients.
 */
function computeAblationMode(
  rows: PanelRowCanonical[],
  mode: AblationMode,
  minRows: number,
  coefficients?: Record<string, number>
): AblationRow {
  const nTotal = rows.length;

  // Collect finite zObs/zPred pairs for this ablation mode
  const zObs: number[] = [];
  const zPred: number[] = [];
  const residuals: number[] = [];

  for (const row of rows) {
    // Use canonical prediction pipeline with ablation mode
    const prediction = predictFromPanelRow(row, { ablation: mode, coefficients });
    
    if (!Number.isFinite(prediction.zPred)) {
      continue;
    }
    if (!Number.isFinite(prediction.zObs)) {
      continue;
    }

    zObs.push(prediction.zObs);
    zPred.push(prediction.zPred);
    residuals.push(prediction.zObs - prediction.zPred);
  }

  const nUsed = zObs.length;

  const metrics = computeModeMetrics(zObs, zPred, residuals, minRows);

  // Human-readable labels
  const labelMap: Record<AblationMode, string> = {
    main: 'Main effects',
    'main+int': 'Main + interactions',
    full: 'Full (main + int + quadratic)',
  };

  return {
    mode,
    label: labelMap[mode],
    nTotal,
    nUsed,
    metrics,
  };
}

/**
 * Compute fixed-coefficient ablation evaluation metrics.
 *
 * Evaluates three model configurations on the same panel data:
 * - "main": baseline + main effects only
 * - "main+int": adds interactions
 * - "full": adds quadratic terms (canonical model)
 *
 * All modes use identical preprocessing (C z-scoring, X/Y normalization).
 * Coefficients remain fixed; no retraining occurs.
 *
 * @param rows - canonical panel rows
 * @param options - configuration options
 *   - minRows: minimum nUsed for valid metrics (default: 30)
 * @returns AblationSummary with metrics for each mode
 */
export function computeAblationSummary(
  rows: PanelRowCanonical[],
  options?: { minRows?: number; coefficients?: Record<string, number> }
): AblationSummary {
  const minRows = options?.minRows ?? 30;

  // Fixed ordering: main → main+int → full
  const modes: AblationMode[] = ['main', 'main+int', 'full'];
  const ablationRows = modes.map((mode) => computeAblationMode(rows, mode, minRows, options?.coefficients));

  return {
    definition: {
      strategy: 'fixed-coefficient ablation evaluation',
      filteringRule: 'finite zObs and zPred',
      notes: [
        'Fixed coefficients; no refit performed.',
        'All modes share identical preprocessing (C z-scoring, X/Y normalization).',
        'Only Φ term inclusion differs across ablation modes.',
        'Filtering: rows with finite zObs and zPred contribute to metrics.',
        `minRows=${minRows}: modes with fewer used rows have null metrics.`,
        'Quantiles computed via linear interpolation between closest ranks.',
        'Bias defined as mean(zObs - zPred).',
      ],
    },
    rows: ablationRows,
  };
}
