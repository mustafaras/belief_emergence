import type { PanelRowCanonical } from '../../types/panel';
import { predictFromPanelRow } from './panelPredict';
import { computeBias } from '../metrics';

export type PanelFitPoint = { x: number; y: number; iso3: string; country: string };

export type PanelFitBin = {
  binStart: number;
  binEnd: number;
  n: number;
  meanPred: number;
  meanObs: number;
  q25Obs: number;
  q75Obs: number;
  meanRes: number;
  q25Res: number;
  q75Res: number;
};

export type PanelFitResidualSummary = {
  n: number;
  meanResidual: number;
  rmse: number;
  bias: number;
};

export type PanelFitSummary = {
  points: PanelFitPoint[];
  residuals: number[];
  bins: PanelFitBin[];
  n: number;
  totalRows: number;
  droppedRows: number;
  r2: number;
  corr: number;
  mae: number;
  rmse: number;
  bias: number;
  residualSummary: PanelFitResidualSummary;
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

function summarizeIqr(values: number[]) {
  const xs = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  return {
    n: xs.length,
    q25: quantile(xs, 0.25),
    q75: quantile(xs, 0.75),
  };
}

/**
 * Computes runtime (in-session) panel-fit summary from canonical panel rows.
 *
 * IMPORTANT: This mirrors the validation logic used in the UI sections to avoid
 * divergence. It uses calculateModel + production coefficients/standardization.
 */
export function computePanelFitSummary(
  panelData: PanelRowCanonical[] | null | undefined,
  options?: { coefficients?: Record<string, number> }
): PanelFitSummary {
  if (!panelData || panelData.length === 0) {
    return {
      points: [],
      residuals: [],
      bins: [],
      n: 0,
      totalRows: 0,
      droppedRows: 0,
      r2: NaN,
      corr: NaN,
      mae: NaN,
      rmse: NaN,
      bias: NaN,
      residualSummary: { n: 0, meanResidual: NaN, rmse: NaN, bias: NaN },
    };
  }

  const totalRows = panelData.length;

  const pts: PanelFitPoint[] = [];
  const residuals: number[] = [];

  let sumX = 0;
  let sumY = 0;
  let sumX2 = 0;
  let sumY2 = 0;
  let sumXY = 0;
  let sse = 0;
  let maeAcc = 0;
  let n = 0;

  for (const r of panelData) {
    // Use canonical panel prediction pipeline
    const result = predictFromPanelRow(r, {
      coefficients: options?.coefficients,
    });
    const zhat = result.zPred;
    const zobs = result.zObs;

    if (!Number.isFinite(zhat) || !Number.isFinite(zobs)) continue;

    pts.push({ x: zhat, y: zobs, iso3: r.iso3, country: r.country_name });
    const e = zobs - zhat;
    residuals.push(e);

    sumX += zhat;
    sumY += zobs;
    sumX2 += zhat * zhat;
    sumY2 += zobs * zobs;
    sumXY += zhat * zobs;
    maeAcc += Math.abs(e);
    sse += e * e;
    n += 1;
  }

  if (!n) {
    return {
      points: [],
      residuals: [],
      bins: [],
      n: 0,
      totalRows,
      droppedRows: totalRows,
      r2: NaN,
      corr: NaN,
      mae: NaN,
      rmse: NaN,
      bias: NaN,
      residualSummary: { n: 0, meanResidual: NaN, rmse: NaN, bias: NaN },
    };
  }

  const meanY = sumY / n;
  const sst = pts.reduce((acc, p) => {
    const d = p.y - meanY;
    return acc + d * d;
  }, 0);
  const SST_EPS = 1e-10;
  const r2 = sst > SST_EPS ? 1 - sse / sst : NaN;

  const cov = sumXY / n - (sumX / n) * (sumY / n);
  const sx2 = sumX2 / n - (sumX / n) * (sumX / n);
  const sy2 = sumY2 / n - (sumY / n) * (sumY / n);
  const sx = Math.sqrt(Math.max(0, sx2));
  const sy = Math.sqrt(Math.max(0, sy2));
  const corr = sx > 0 && sy > 0 ? cov / (sx * sy) : NaN;

  const mae = maeAcc / n;
  const rmse = Math.sqrt(sse / n);

  const bias = computeBias(
    pts.map((p) => p.y),
    pts.map((p) => p.x),
  );

  // Calibration bins by predicted quantiles (10 bins) with IQR bands.
  const sorted = pts.slice().sort((a, b) => a.x - b.x);
  const bins: PanelFitBin[] = [];
  const binsCount = 10;

  for (let i = 0; i < binsCount; i += 1) {
    const start = Math.floor((i * sorted.length) / binsCount);
    const end = Math.floor(((i + 1) * sorted.length) / binsCount);
    const slice = sorted.slice(start, end);
    if (!slice.length) continue;

    const preds = slice.map((p) => p.x);
    const obs = slice.map((p) => p.y);
    const res = slice.map((p) => p.y - p.x);

    const obsIqr = summarizeIqr(obs);
    const resIqr = summarizeIqr(res);

    const meanPred = preds.reduce((a, v) => a + v, 0) / preds.length;
    const meanObs = obs.reduce((a, v) => a + v, 0) / obs.length;
    const meanRes = res.reduce((a, v) => a + v, 0) / res.length;

    bins.push({
      binStart: slice[0].x,
      binEnd: slice[slice.length - 1].x,
      n: slice.length,
      meanPred,
      meanObs,
      q25Obs: obsIqr.q25,
      q75Obs: obsIqr.q75,
      meanRes,
      q25Res: resIqr.q25,
      q75Res: resIqr.q75,
    });
  }

  const droppedRows = Math.max(0, totalRows - n);

  const residualMean = residuals.reduce((a, v) => a + v, 0) / residuals.length;

  return {
    points: pts,
    residuals,
    bins,
    n,
    totalRows,
    droppedRows,
    r2,
    corr,
    mae,
    rmse,
    bias,
    residualSummary: { n, meanResidual: residualMean, rmse, bias },
  };
}
