/**
 * Sensitivity analysis (numerical stability parameters) — no refit, fixed coefficients.
 *
 * Evaluates model metrics across a small grid of numerical stability parameters:
 * - ε band (structural min/max for Z clamping)
 * - Φ clamp magnitude (absolute value threshold)
 * - Panel X/Y bounds (structural mapping bounds)
 *
 * This is a diagnostic sensitivity analysis, NOT a robustness proof.
 * All configurations use identical preprocessing and coefficients.
 */

import type { PanelRowCanonical } from '../../types/panel';
import { calculateModel } from '../calculateModel';
import { panelRowToModelInputs, normalizeObservedZ } from './panelPredict';
import { computeBias, computeMAE, computePearsonCorr, computeR2, computeRMSE } from '../metrics';
import {
  STRUCTURAL_MIN,
  PANEL_X_MIN,
  PANEL_X_MAX,
  PANEL_Y_MIN,
  PANEL_Y_MAX,
} from '../modelContract';

export type RobustnessConfig = {
  id: string;
  eps: number; // structuralMin (ε band minimum)
  phiClampAbs: number; // Φ clamp magnitude
  panelXMin: number;
  panelXMax: number;
  panelYMin: number;
  panelYMax: number;
  boundsLabel: string; // "default" | "wide" | "narrow"
};

export type RobustnessRow = {
  config: RobustnessConfig;
  nTotal: number;
  nUsed: number;
  metrics: {
    r2: number | null;
    corr: number | null;
    mae: number | null;
    rmse: number | null;
    bias: number | null;
    residualP10: number | null;
    residualP50: number | null;
    residualP90: number | null;
  };
};

export type RobustnessSummary = {
  definition: {
    strategy: 'sensitivity analysis (numerical stability parameters)';
    defaults: RobustnessConfig;
    notes: string[];
    filteringRule: string;
  };
  rows: RobustnessRow[];
};

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

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

function computeConfigMetrics(
  zObs: number[],
  zPred: number[],
  residuals: number[],
  minRows: number
) {
  const n = Math.min(zObs.length, zPred.length);
  if (n < minRows) {
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
 * Evaluate metrics for a single robustness configuration.
 */
function evaluateConfig(
  rows: PanelRowCanonical[],
  config: RobustnessConfig,
  minRows: number,
  coefficients?: Record<string, number>
): RobustnessRow {
  const nTotal = rows.length;

  const zObs: number[] = [];
  const zPred: number[] = [];
  const residuals: number[] = [];

  for (const row of rows) {
    // Get model inputs using canonical preprocessing
    const inputs = panelRowToModelInputs(row);

    // Call calculateModel with robustness overrides
    const result = calculateModel(inputs, {
      inputsAreStandardized: false,
      modifiersAreStandardized: true,
      structuralMin: config.eps,
      phiClampAbs: config.phiClampAbs,
      panelXMin: config.panelXMin,
      panelXMax: config.panelXMax,
      panelYMin: config.panelYMin,
      panelYMax: config.panelYMax,
      coefficients,
    });

    if (!Number.isFinite(result.Z)) {
      continue;
    }

    // Use canonical observed Z normalization (NOT affected by config overrides)
    const zObsVal = normalizeObservedZ(row.Z);
    if (!Number.isFinite(zObsVal)) {
      continue;
    }

    zObs.push(zObsVal);
    zPred.push(result.Z);
    residuals.push(zObsVal - result.Z);
  }

  const nUsed = zObs.length;
  const metrics = computeConfigMetrics(zObs, zPred, residuals, minRows);

  return {
    config,
    nTotal,
    nUsed,
    metrics,
  };
}

/**
 * Generate default configuration from current constants.
 */
function getDefaultConfig(): RobustnessConfig {
  return {
    id: 'default',
    eps: STRUCTURAL_MIN,
    phiClampAbs: 50,
    panelXMin: PANEL_X_MIN,
    panelXMax: PANEL_X_MAX,
    panelYMin: PANEL_Y_MIN,
    panelYMax: PANEL_Y_MAX,
    boundsLabel: 'default',
  };
}

/**
 * Generate small sensitivity grid (≤ 12 configs).
 */
function generateRobustnessGrid(): RobustnessConfig[] {
  const defaultCfg = getDefaultConfig();

  // ε values: tight, default, loose
  const epsValues = [1e-5, STRUCTURAL_MIN, 1e-3];

  // Φ clamp values: conservative, default, permissive
  const phiClampValues = [30, 50, 80];

  // Bounds variations: default only (to keep grid small)
  // Could add ±10% variations if needed, but keeping minimal here
  const boundsConfigs = [
    { label: 'default', xMin: PANEL_X_MIN, xMax: PANEL_X_MAX, yMin: PANEL_Y_MIN, yMax: PANEL_Y_MAX },
  ];

  const configs: RobustnessConfig[] = [];

  // Generate grid: eps × phiClamp × bounds
  for (const eps of epsValues) {
    for (const phiClamp of phiClampValues) {
      for (const bounds of boundsConfigs) {
        const isDefault =
          eps === defaultCfg.eps &&
          phiClamp === defaultCfg.phiClampAbs &&
          bounds.label === 'default';

        configs.push({
          id: isDefault ? 'default' : `eps${eps.toExponential(0)}_phi${phiClamp}_${bounds.label}`,
          eps,
          phiClampAbs: phiClamp,
          panelXMin: bounds.xMin,
          panelXMax: bounds.xMax,
          panelYMin: bounds.yMin,
          panelYMax: bounds.yMax,
          boundsLabel: bounds.label,
        });
      }
    }
  }

  // Sort: default first, then by eps, phiClamp, boundsLabel
  configs.sort((a, b) => {
    if (a.id === 'default') return -1;
    if (b.id === 'default') return 1;
    if (a.eps !== b.eps) return a.eps - b.eps;
    if (a.phiClampAbs !== b.phiClampAbs) return a.phiClampAbs - b.phiClampAbs;
    return a.boundsLabel.localeCompare(b.boundsLabel);
  });

  return configs;
}

/**
 * Compute sensitivity analysis across numerical stability parameters.
 *
 * Evaluates model performance under variations of:
 * - ε band (Z clamp bounds)
 * - Φ clamp magnitude
 * - Panel X/Y structural mapping bounds
 *
 * This is a diagnostic tool, NOT a robustness proof. Fixed coefficients; no refit.
 *
 * @param rows - canonical panel rows
 * @param options - configuration options
 *   - configs: custom config grid (default: auto-generated 9-config grid)
 *   - minRows: minimum nUsed for valid metrics (default: 30)
 * @returns RobustnessSummary with default config first, then variations
 */
export function computeRobustnessSummary(
  rows: PanelRowCanonical[],
  options?: {
    configs?: RobustnessConfig[];
    minRows?: number;
    coefficients?: Record<string, number>;
  }
): RobustnessSummary {
  const minRows = options?.minRows ?? 30;
  const configs = options?.configs ?? generateRobustnessGrid();

  const robustnessRows = configs.map((config) => evaluateConfig(rows, config, minRows, options?.coefficients));

  const defaultConfig = getDefaultConfig();

  return {
    definition: {
      strategy: 'sensitivity analysis (numerical stability parameters)',
      defaults: defaultConfig,
      filteringRule: 'finite zObs and zPred',
      notes: [
        'Fixed coefficients; no refit performed.',
        'Evaluates sensitivity to ε band (structural min/max), Φ clamp, and panel bounds.',
        'Default configuration shown first; corresponds to production constants.',
        `minRows=${minRows}: configs with fewer used rows have null metrics.`,
        'Quantiles computed via linear interpolation between closest ranks.',
        'Bias defined as mean(zObs - zPred).',
        'This is a diagnostic sensitivity analysis, not a robustness proof.',
      ],
    },
    rows: robustnessRows,
  };
}
