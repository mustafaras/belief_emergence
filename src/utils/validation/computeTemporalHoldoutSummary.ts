/**
 * Fixed-coefficient temporal slice evaluation (no refit, no UI integration).
 *
 * Computes descriptive metrics across year-based slices using the canonical
 * panel prediction pipeline (predictFromPanelRow). This is a descriptive
 * holdout-by-time view: coefficients remain fixed; no retraining occurs.
 */

import type { PanelRowCanonical } from '../../types/panel';
import { predictFromPanelRow } from './panelPredict';
import { computeBias, computeMAE, computePearsonCorr, computeR2, computeRMSE } from '../metrics';

export type TemporalHoldoutSlice = {
  label: string;
  yearMin?: number;
  yearMax?: number;
  nTotal: number;
  nUsed: number;
  metrics: {
    r2: number | null;
    corr: number | null;
    mae: number | null;
    rmse: number | null;
    bias: number | null; // defined as mean(zObs - zPred)
    residualP10: number | null;
    residualP50: number | null;
    residualP90: number | null;
  };
};

export type TemporalHoldoutSummary = {
  definition: {
    splitYears: number[];
    strategy: 'fixed-coefficient temporal slice evaluation';
    notes: string[];
  };
  global: TemporalHoldoutSlice;
  slices: TemporalHoldoutSlice[];
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

function computeSliceMetrics(
  zObs: number[],
  zPred: number[],
  residuals: number[],
  minRowsPerSlice: number
) {
  const n = Math.min(zObs.length, zPred.length);
  if (n < minRowsPerSlice) {
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

  const r2 = computeR2(zObs, zPred);
  const corr = computePearsonCorr(zObs, zPred);
  const mae = computeMAE(zObs, zPred);
  const rmse = computeRMSE(zObs, zPred);

  const bias = computeBias(zObs, zPred);

  const residualStats = computeResidualStats(residuals);

  return {
    r2: Number.isFinite(r2) ? r2 : null,
    corr: Number.isFinite(corr) ? corr : null,
    mae: Number.isFinite(mae) ? mae : null,
    rmse: Number.isFinite(rmse) ? rmse : null,
    bias: Number.isFinite(bias) ? bias : null,
    residualP10: Number.isFinite(residualStats.p10) ? residualStats.p10 : null,
    residualP50: Number.isFinite(residualStats.p50) ? residualStats.p50 : null,
    residualP90: Number.isFinite(residualStats.p90) ? residualStats.p90 : null,
  };
}

function uniqueSortedYears(rows: PanelRowCanonical[]): number[] {
  const years = new Set<number>();
  for (const r of rows) {
    if (Number.isFinite(r.year)) years.add(r.year);
  }
  return Array.from(years).sort((a, b) => a - b);
}

function deriveDefaultSplitYears(rows: PanelRowCanonical[]): number[] {
  const years = uniqueSortedYears(rows);
  if (years.length < 2) return [];
  const idx33 = Math.floor((years.length - 1) * 0.33);
  const idx66 = Math.floor((years.length - 1) * 0.66);
  const b1 = years[idx33];
  const b2 = years[idx66];
  const boundaries = new Set<number>();
  boundaries.add(b1);
  if (b2 !== b1) boundaries.add(b2);
  if (boundaries.size === 1) {
    const mid = years[Math.floor((years.length - 1) * 0.5)];
    if (mid !== b1) boundaries.add(mid);
  }
  return Array.from(boundaries).sort((a, b) => a - b);
}

type SliceDef = { yearMin?: number; yearMax?: number; label: string };

function buildSlices(splitYears: number[]): SliceDef[] {
  if (!splitYears.length) {
    return [{ label: 'all years', yearMin: undefined, yearMax: undefined }];
  }
  const slices: SliceDef[] = [];
  const sorted = [...new Set(splitYears.filter(Number.isFinite))].sort((a, b) => a - b);
  if (!sorted.length) return [{ label: 'all years', yearMin: undefined, yearMax: undefined }];

  // First slice: <= first boundary
  slices.push({ label: `≤ ${sorted[0]}`, yearMax: sorted[0] });

  // Middle slices
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr === prev) continue;
    slices.push({ label: `${prev + 1}–${curr}`, yearMin: prev, yearMax: curr });
  }

  // Last slice: > last boundary
  slices.push({ label: `> ${sorted[sorted.length - 1]}`, yearMin: sorted[sorted.length - 1] });

  return slices;
}

function evaluateSlice(
  rows: PanelRowCanonical[],
  slice: SliceDef,
  minRowsPerSlice: number,
  coefficients?: Record<string, number>
): TemporalHoldoutSlice {
  let nTotal = 0;
  const zObs: number[] = [];
  const zPred: number[] = [];
  const residuals: number[] = [];

  for (const row of rows) {
    if (!Number.isFinite(row.year)) continue;
    const y = row.year;
    const withinLower = slice.yearMin === undefined ? true : y > slice.yearMin;
    const withinUpper = slice.yearMax === undefined ? true : y <= slice.yearMax;
    if (!withinLower || !withinUpper) continue;

    nTotal += 1;
    const result = predictFromPanelRow(row, { coefficients });
    const pred = result.zPred;
    const obs = result.zObs;
    if (!Number.isFinite(pred) || !Number.isFinite(obs)) continue;
    zPred.push(pred);
    zObs.push(obs);
    residuals.push(obs - pred);
  }

  const nUsed = Math.min(zObs.length, zPred.length);
  const metrics = computeSliceMetrics(zObs, zPred, residuals, minRowsPerSlice);

  return {
    label: slice.label ?? 'slice',
    yearMin: slice.yearMin,
    yearMax: slice.yearMax,
    nTotal,
    nUsed,
    metrics,
  };
}

export function computeTemporalHoldoutSummary(
  rows: PanelRowCanonical[],
  options?: {
    splitYears?: number[];
    minRowsPerSlice?: number;
    coefficients?: Record<string, number>;
  }
): TemporalHoldoutSummary {
  const minRowsPerSlice = options?.minRowsPerSlice ?? 50;

  const providedBoundaries = options?.splitYears?.filter(Number.isFinite) ?? [];
  const splitYears = providedBoundaries.length ? [...new Set(providedBoundaries)].sort((a, b) => a - b) : deriveDefaultSplitYears(rows);

  const sliceDefs = buildSlices(splitYears);
  const slices = sliceDefs.map((def) => evaluateSlice(rows, def, minRowsPerSlice, options?.coefficients));

  // Global slice (all years)
  const globalSlice = evaluateSlice(
    rows,
    { label: 'all years', yearMin: undefined, yearMax: undefined },
    minRowsPerSlice,
    options?.coefficients
  );

  const notes = [
    'Fixed-coefficient evaluation; no refit performed.',
    'Rows require finite year, zPred, and zObs; others are counted as total but excluded from metrics.',
    'Residuals defined as zObs - zPred; quantiles p10/p50/p90 via linear interpolation of sorted residuals.',
    'Slices use <= first boundary, (prev, boundary], and > last boundary.',
    `Minimum rows per slice for metrics: ${minRowsPerSlice}.`,
  ];

  return {
    definition: {
      splitYears,
      strategy: 'fixed-coefficient temporal slice evaluation',
      notes,
    },
    global: globalSlice,
    slices,
  };
}
