import type { PanelRowCanonical } from '../../types/panel';
import { computeBias, computeMAE, computePearsonCorr, computeR2, computeRMSE } from '../metrics';
import { PANEL_X_MAX, PANEL_X_MIN, PANEL_Y_MAX, PANEL_Y_MIN, STRUCTURAL_MAX, STRUCTURAL_MIN } from '../modelContract';
import { panelRowToModelInputs, normalizeObservedZ } from './panelPredict';

export type ModelTier = 'A' | 'B' | 'C';

export type TierFeatureName =
  | 'x_safe'
  | 'y_safe'
  | 'c_std'
  | 'm'
  | 't'
  | 'd'
  | 'g'
  | 'e'
  | 's'
  | 'r'
  | 'y_safe:r'
  | 't:r'
  | 'x_safe:y_safe'
  | 'c_std:m'
  | 'e:s'
  | 'd:t'
  | 'g:r'
  | 'c_std^2'
  | 'm^2'
  | 't^2'
  | 'e^2';

export type TierContract = {
  tier: ModelTier;
  label: string;
  exploratory: boolean;
  featureNames: TierFeatureName[];
};

export const TIER_CONTRACTS: Record<ModelTier, TierContract> = {
  A: {
    tier: 'A',
    label: 'Tier A (baseline linear/FE-equivalent)',
    exploratory: false,
    featureNames: ['x_safe', 'y_safe', 'c_std', 'm', 't', 'd', 'g', 'e', 's', 'r'],
  },
  B: {
    tier: 'B',
    label: 'Tier B (parsimonious nonlinear core)',
    exploratory: false,
    featureNames: [
      'x_safe',
      'y_safe',
      'c_std',
      'm',
      't',
      'd',
      'g',
      'e',
      's',
      'r',
      'y_safe:r',
      't:r',
      'x_safe:y_safe',
      'c_std:m',
      'e:s',
      'c_std^2',
      'm^2',
    ],
  },
  C: {
    tier: 'C',
    label: 'Tier C (full nonlinear sensitivity)',
    exploratory: true,
    featureNames: [
      'x_safe',
      'y_safe',
      'c_std',
      'm',
      't',
      'd',
      'g',
      'e',
      's',
      'r',
      'y_safe:r',
      't:r',
      'x_safe:y_safe',
      'c_std:m',
      'e:s',
      'd:t',
      'g:r',
      'c_std^2',
      'm^2',
      't^2',
      'e^2',
    ],
  },
};

export type RefitMetrics = {
  n: number;
  r2: number;
  corr: number;
  mae: number;
  rmse: number;
  bias: number;
};

export type FittedTierModel = {
  tier: ModelTier;
  label: string;
  featureNames: TierFeatureName[];
  coefficients: number[];
  intercept: number;
  lambda: number;
  nTrain: number;
  converged: boolean;
  failureReason?: string;
  trainMetrics: RefitMetrics;
};

export type TierEvaluationResult = {
  tier: ModelTier;
  converged: boolean;
  failureReason?: string;
  nTrain: number;
  nTest: number;
  nTestUniqueCountryYears?: number;
  featureNames: TierFeatureName[];
  intercept: number;
  coefficients: number[];
  trainMetrics: RefitMetrics;
  testMetricsRefit: RefitMetrics;
  testMetricsSupportCollapsedRefit?: RefitMetrics;
  // Backward compatibility aliases for legacy consumers.
  testMetrics: RefitMetrics;
  testMetricsSupportCollapsed?: RefitMetrics;
  testMetricsCanonical?: RefitMetrics;
  testMetricsSupportCollapsedCanonical?: RefitMetrics;
  lowVarianceObservedTest?: boolean;
  predictionIntervalCoverage95: number | null;
  predictionIntervalCoverage95Empirical?: number | null;
  predictionIntervalCoverage95Gaussian?: number | null;
  predictionIntervalMethod95?: 'empirical_quantile_shifted' | 'gaussian_symmetric_train_residual_std' | 'none';
  residualStdTrain: number | null;
  residualQuantileIntervalTrain95?: {
    q025: number | null;
    q975: number | null;
    centerShift: number | null;
    width: number | null;
  };
};

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function toStructuralX(xRaw: number): number {
  if (!Number.isFinite(xRaw)) return STRUCTURAL_MIN;
  const t = clamp01((xRaw - PANEL_X_MIN) / (PANEL_X_MAX - PANEL_X_MIN));
  return STRUCTURAL_MIN + t * (STRUCTURAL_MAX - STRUCTURAL_MIN);
}

function toStructuralY(yRaw: number): number {
  if (!Number.isFinite(yRaw)) return STRUCTURAL_MIN;
  const t = clamp01((yRaw - PANEL_Y_MIN) / (PANEL_Y_MAX - PANEL_Y_MIN));
  return STRUCTURAL_MIN + t * (STRUCTURAL_MAX - STRUCTURAL_MIN);
}

function clampStructural(value: number): number {
  if (!Number.isFinite(value)) return STRUCTURAL_MIN;
  return Math.min(Math.max(value, STRUCTURAL_MIN), STRUCTURAL_MAX);
}

function buildFeatureMap(row: PanelRowCanonical): Record<TierFeatureName, number> {
  const standardized = panelRowToModelInputs(row);
  const xSafe = toStructuralX(row.X);
  const ySafe = toStructuralY(row.Y);
  const cStd = standardized.C;
  const m = standardized.M;
  const t = standardized.T;
  const e = standardized.E;
  const r = standardized.R;
  // C, D, S and G are structurally unavailable in the v2 panel. They are
  // neutralized to 0 (the mean of a standardized channel) so that legacy
  // full-feature code paths still run; tiers that include them are reported as
  // not assessable rather than silently estimated. See docs/KNOWN_ISSUES.md.
  const d = standardized.D ?? 0;
  const g = standardized.G ?? 0;
  const s = standardized.S ?? 0;

  return {
    x_safe: xSafe,
    y_safe: ySafe,
    c_std: cStd ?? 0,
    m,
    t,
    d,
    g,
    e,
    s,
    r,
    'y_safe:r': ySafe * r,
    't:r': t * r,
    'x_safe:y_safe': xSafe * ySafe,
    'c_std:m': (cStd ?? 0) * m,
    'e:s': e * s,
    'd:t': d * t,
    'g:r': g * r,
    'c_std^2': (cStd ?? 0) * (cStd ?? 0),
    'm^2': m * m,
    't^2': t * t,
    'e^2': e * e,
  };
}

function buildMatrix(rows: PanelRowCanonical[], featureNames: TierFeatureName[]): {
  matrix: number[][];
  observed: number[];
  usedRows: PanelRowCanonical[];
} {
  const matrix: number[][] = [];
  const observed: number[] = [];
  const usedRows: PanelRowCanonical[] = [];

  for (const row of rows) {
    const zObs = normalizeObservedZ(row.Z);
    if (!Number.isFinite(zObs)) continue;
    const fm = buildFeatureMap(row);
    const featureVector = featureNames.map((name) => fm[name]);
    if (!featureVector.every(Number.isFinite)) continue;
    observed.push(zObs);
    matrix.push(featureVector);
    usedRows.push(row);
  }

  return { matrix, observed, usedRows };
}

function solveLinearSystem(a: number[][], b: number[]): number[] | null {
  const n = a.length;
  if (n === 0 || b.length !== n) return null;

  const aug: number[][] = a.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row;
    }

    if (Math.abs(aug[pivot][col]) < 1e-12) return null;

    if (pivot !== col) {
      const tmp = aug[col];
      aug[col] = aug[pivot];
      aug[pivot] = tmp;
    }

    const pivotVal = aug[col][col];
    for (let j = col; j <= n; j += 1) {
      aug[col][j] /= pivotVal;
    }

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = aug[row][col];
      if (factor === 0) continue;
      for (let j = col; j <= n; j += 1) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  return aug.map((row) => row[n]);
}

function fitRidge(matrix: number[][], observed: number[], lambda: number): number[] | null {
  const n = matrix.length;
  if (!n) return null;
  const p = matrix[0].length;

  const xtx = Array.from({ length: p + 1 }, () => Array.from({ length: p + 1 }, () => 0));
  const xty = Array.from({ length: p + 1 }, () => 0);

  for (let i = 0; i < n; i += 1) {
    const xi = matrix[i];
    const yi = observed[i];
    const withIntercept = [1, ...xi];

    for (let r = 0; r <= p; r += 1) {
      xty[r] += withIntercept[r] * yi;
      for (let c = 0; c <= p; c += 1) {
        xtx[r][c] += withIntercept[r] * withIntercept[c];
      }
    }
  }

  for (let d = 1; d <= p; d += 1) {
    xtx[d][d] += lambda;
  }

  return solveLinearSystem(xtx, xty);
}

function predictFromCoefficients(features: number[][], intercept: number, coefficients: number[]): number[] {
  return features.map((row) => {
    let y = intercept;
    for (let i = 0; i < coefficients.length; i += 1) {
      y += coefficients[i] * row[i];
    }
    return clampStructural(y);
  });
}

function computeRefitMetrics(observed: number[], predicted: number[]): RefitMetrics {
  return {
    n: Math.min(observed.length, predicted.length),
    r2: computeR2(observed, predicted),
    corr: computePearsonCorr(observed, predicted),
    mae: computeMAE(observed, predicted),
    rmse: computeRMSE(observed, predicted),
    bias: computeBias(observed, predicted),
  };
}

function computeStd(values: number[]): number | null {
  const finite = values.filter(Number.isFinite);
  if (finite.length < 2) return null;
  const mean = finite.reduce((acc, value) => acc + value, 0) / finite.length;
  const varSample = finite.reduce((acc, value) => {
    const d = value - mean;
    return acc + d * d;
  }, 0) / (finite.length - 1);
  if (!Number.isFinite(varSample) || varSample < 0) return null;
  return Math.sqrt(varSample);
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const t = Math.min(Math.max(q, 0), 1);
  const pos = (sorted.length - 1) * t;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const w = pos - lo;
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function computeVariance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
  let sumSq = 0;
  for (const value of values) {
    const d = value - mean;
    sumSq += d * d;
  }
  return sumSq / (values.length - 1);
}

function computeSupportCollapsedMetrics(
  observed: number[],
  predicted: number[],
  rows: PanelRowCanonical[]
): { metrics: RefitMetrics; nUniqueCountryYears: number } {
  const collapsed = new Map<string, { obsSum: number; predSum: number; n: number }>();
  const nUniqueCountryYears = new Set(rows.map((row) => `${row.iso3}::${row.year}`)).size;
  const n = Math.min(observed.length, predicted.length, rows.length);

  for (let i = 0; i < n; i += 1) {
    const obs = observed[i];
    const pred = predicted[i];
    if (!Number.isFinite(obs) || !Number.isFinite(pred)) continue;

    const row = rows[i];
    const key = `${row.iso3}::${row.year}`;
    const current = collapsed.get(key);
    if (current) {
      current.obsSum += obs;
      current.predSum += pred;
      current.n += 1;
    } else {
      collapsed.set(key, { obsSum: obs, predSum: pred, n: 1 });
    }
  }

  const collapsedObserved: number[] = [];
  const collapsedPredicted: number[] = [];
  for (const cell of collapsed.values()) {
    collapsedObserved.push(cell.obsSum / cell.n);
    collapsedPredicted.push(cell.predSum / cell.n);
  }

  return {
    metrics: computeRefitMetrics(collapsedObserved, collapsedPredicted),
    nUniqueCountryYears,
  };
}

export function fitModelTier(
  trainRows: PanelRowCanonical[],
  tier: ModelTier,
  options?: { lambda?: number; minRows?: number }
): FittedTierModel {
  const contract = TIER_CONTRACTS[tier];
  const lambda = options?.lambda ?? 1e-3;
  const minRows = options?.minRows ?? 24;

  const prepared = buildMatrix(trainRows, contract.featureNames);
  const p = contract.featureNames.length;

  if (prepared.matrix.length < Math.max(minRows, p + 2)) {
    return {
      tier,
      label: contract.label,
      featureNames: contract.featureNames,
      coefficients: Array.from({ length: p }, () => 0),
      intercept: NaN,
      lambda,
      nTrain: prepared.matrix.length,
      converged: false,
      failureReason: `insufficient_rows(n=${prepared.matrix.length}, required>=${Math.max(minRows, p + 2)})`,
      trainMetrics: {
        n: prepared.matrix.length,
        r2: NaN,
        corr: NaN,
        mae: NaN,
        rmse: NaN,
        bias: NaN,
      },
    };
  }

  const beta = fitRidge(prepared.matrix, prepared.observed, lambda);
  if (!beta) {
    return {
      tier,
      label: contract.label,
      featureNames: contract.featureNames,
      coefficients: Array.from({ length: p }, () => 0),
      intercept: NaN,
      lambda,
      nTrain: prepared.matrix.length,
      converged: false,
      failureReason: 'linear_solver_failed',
      trainMetrics: {
        n: prepared.matrix.length,
        r2: NaN,
        corr: NaN,
        mae: NaN,
        rmse: NaN,
        bias: NaN,
      },
    };
  }

  const intercept = beta[0];
  const coefficients = beta.slice(1);
  const trainPred = predictFromCoefficients(prepared.matrix, intercept, coefficients);

  return {
    tier,
    label: contract.label,
    featureNames: contract.featureNames,
    coefficients,
    intercept,
    lambda,
    nTrain: prepared.matrix.length,
    converged: true,
    trainMetrics: computeRefitMetrics(prepared.observed, trainPred),
  };
}

export function evaluateTierModel(
  model: FittedTierModel,
  testRows: PanelRowCanonical[]
): { metrics: RefitMetrics; observed: number[]; predicted: number[]; usedRows: PanelRowCanonical[] } {
  const prepared = buildMatrix(testRows, model.featureNames);
  if (!model.converged || !Number.isFinite(model.intercept)) {
    return {
      metrics: {
        n: prepared.matrix.length,
        r2: NaN,
        corr: NaN,
        mae: NaN,
        rmse: NaN,
        bias: NaN,
      },
      observed: prepared.observed,
      predicted: Array.from({ length: prepared.observed.length }, () => NaN),
      usedRows: prepared.usedRows,
    };
  }

  const predicted = predictFromCoefficients(prepared.matrix, model.intercept, model.coefficients);
  return {
    metrics: computeRefitMetrics(prepared.observed, predicted),
    observed: prepared.observed,
    predicted,
    usedRows: prepared.usedRows,
  };
}

export function fitAndEvaluateTier(
  trainRows: PanelRowCanonical[],
  testRows: PanelRowCanonical[],
  tier: ModelTier,
  options?: { lambda?: number; minRows?: number }
): TierEvaluationResult {
  const model = fitModelTier(trainRows, tier, options);
  const testEval = evaluateTierModel(model, testRows);
  const trainEval = evaluateTierModel(model, trainRows);
  const supportCollapsed = computeSupportCollapsedMetrics(testEval.observed, testEval.predicted, testEval.usedRows);
  const lowVarianceObservedTest = computeVariance(testEval.observed) < 1e-10;

  let coverage95Primary: number | null = null;
  let coverage95Empirical: number | null = null;
  let coverage95Gaussian: number | null = null;
  let intervalMethod95: TierEvaluationResult['predictionIntervalMethod95'] = 'none';
  let residualStd: number | null = null;
  let q025Residual: number | null = null;
  let q975Residual: number | null = null;

  if (model.converged && trainEval.observed.length > 1 && testEval.observed.length > 0) {
    const trainResiduals = trainEval.observed.map((obs, i) => obs - trainEval.predicted[i]);
    const finiteResiduals = trainResiduals.filter(Number.isFinite).sort((a, b) => a - b);
    residualStd = computeStd(finiteResiduals);

    // Comparator interval: symmetric Gaussian approximation from train residual std.
    if (residualStd !== null && Number.isFinite(residualStd)) {
      const halfWidth = 1.96 * residualStd;
      let inside = 0;
      for (let i = 0; i < testEval.observed.length; i += 1) {
        const obs = testEval.observed[i];
        const pred = testEval.predicted[i];
        if (Number.isFinite(obs) && Number.isFinite(pred) && Math.abs(obs - pred) <= halfWidth) {
          inside += 1;
        }
      }
      coverage95Gaussian = testEval.observed.length > 0 ? inside / testEval.observed.length : null;
    }

    // Primary interval: empirical residual quantiles (captures bias/asymmetry without normality assumption).
    q025Residual = quantile(finiteResiduals, 0.025);
    q975Residual = quantile(finiteResiduals, 0.975);

    if (
      q025Residual !== null
      && q975Residual !== null
      && Number.isFinite(q025Residual)
      && Number.isFinite(q975Residual)
      && q975Residual >= q025Residual
    ) {
      let insideEmpirical = 0;
      for (let i = 0; i < testEval.observed.length; i += 1) {
        const obs = testEval.observed[i];
        const pred = testEval.predicted[i];
        if (!Number.isFinite(obs) || !Number.isFinite(pred)) continue;
        const lower = pred + q025Residual;
        const upper = pred + q975Residual;
        if (obs >= lower && obs <= upper) insideEmpirical += 1;
      }
      coverage95Empirical = testEval.observed.length > 0 ? insideEmpirical / testEval.observed.length : null;
    }

    if (coverage95Empirical !== null && Number.isFinite(coverage95Empirical)) {
      coverage95Primary = coverage95Empirical;
      intervalMethod95 = 'empirical_quantile_shifted';
    } else if (coverage95Gaussian !== null && Number.isFinite(coverage95Gaussian)) {
      coverage95Primary = coverage95Gaussian;
      intervalMethod95 = 'gaussian_symmetric_train_residual_std';
    }
  }

  return {
    tier,
    converged: model.converged,
    failureReason: model.failureReason,
    nTrain: model.nTrain,
    nTest: testEval.metrics.n,
    featureNames: model.featureNames,
    intercept: model.intercept,
    coefficients: model.coefficients,
    trainMetrics: model.trainMetrics,
    testMetricsRefit: testEval.metrics,
    testMetricsSupportCollapsedRefit: supportCollapsed.metrics,
    // Keep legacy names in sync with explicit refit fields.
    testMetrics: testEval.metrics,
    testMetricsSupportCollapsed: supportCollapsed.metrics,
    nTestUniqueCountryYears: supportCollapsed.nUniqueCountryYears,
    lowVarianceObservedTest,
    predictionIntervalCoverage95: coverage95Primary,
    predictionIntervalCoverage95Empirical: coverage95Empirical,
    predictionIntervalCoverage95Gaussian: coverage95Gaussian,
    predictionIntervalMethod95: intervalMethod95,
    residualStdTrain: residualStd,
    residualQuantileIntervalTrain95: {
      q025: q025Residual,
      q975: q975Residual,
      centerShift:
        q025Residual !== null && q975Residual !== null
          ? (q025Residual + q975Residual) / 2
          : null,
      width:
        q025Residual !== null && q975Residual !== null
          ? q975Residual - q025Residual
          : null,
    },
  };
}
