/**
 * Fixed-coefficient per-country slice evaluation (no refit, no UI integration).
 *
 * Computes descriptive metrics for each country using the canonical panel
 * prediction pipeline (predictFromPanelRow). This is a per-country in-sample
 * slice view: coefficients remain fixed; no retraining occurs. This is NOT
 * leave-one-country-out cross-validation.
 */

import type { PanelRowCanonical } from '../../types/panel';
import { predictFromPanelRow } from './panelPredict';
import { computeBias, computeMAE, computePearsonCorr, computeR2, computeRMSE } from '../metrics';

export type CountrySliceRow = {
  country: string; // canonical display id (ISO3 if available)
  nTotal: number;
  nUsed: number;
  yearMin?: number;
  yearMax?: number;
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

export type CountrySliceSummary = {
  definition: {
    strategy: 'fixed-coefficient country-slice evaluation';
    countryField: string; // the column/key used
    filteringRule: string; // short description
    notes: string[];
  };
  global: CountrySliceRow; // "ALL" aggregate
  rows: CountrySliceRow[]; // per-country
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

function computeSliceMetrics(
  zObs: number[],
  zPred: number[],
  residuals: number[],
  minRowsPerCountry: number
) {
  const n = Math.min(zObs.length, zPred.length);
  if (n < minRowsPerCountry) {
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
 * Compute metrics for a single country slice using fixed coefficients.
 * Returns nTotal (all rows), nUsed (rows with finite zObs and zPred),
 * and computed metrics if nUsed >= minRowsPerCountry, else null metrics.
 */
function computeCountrySlice(
  rows: PanelRowCanonical[],
  countryKey: string,
  minRowsPerCountry: number,
  coefficients?: Record<string, number>
): CountrySliceRow {
  const nTotal = rows.length;

  // Collect finite zObs/zPred pairs
  const zObs: number[] = [];
  const zPred: number[] = [];
  const residuals: number[] = [];
  const finiteYears: number[] = [];

  for (const row of rows) {
    // Use canonical prediction pipeline
    const prediction = predictFromPanelRow(row, { coefficients });
    if (!Number.isFinite(prediction.zPred)) {
      continue;
    }
    // Use canonical observed Z normalization from predictFromPanelRow.
    const zObsVal = prediction.zObs;
    if (!Number.isFinite(zObsVal)) {
      continue;
    }
    zObs.push(zObsVal);
    zPred.push(prediction.zPred);
    residuals.push(zObsVal - prediction.zPred);

    if (Number.isFinite(row.year)) {
      finiteYears.push(row.year);
    }
  }

  const nUsed = zObs.length;

  // Compute year range
  const yearMin = finiteYears.length > 0 ? Math.min(...finiteYears) : undefined;
  const yearMax = finiteYears.length > 0 ? Math.max(...finiteYears) : undefined;

  const metrics = computeSliceMetrics(zObs, zPred, residuals, minRowsPerCountry);

  return {
    country: countryKey,
    nTotal,
    nUsed,
    yearMin,
    yearMax,
    metrics,
  };
}

/**
 * Deterministic comparator for sorting CountrySliceRow.
 * Ensures stable, reproducible ordering.
 */
function compareCountries(
  a: CountrySliceRow,
  b: CountrySliceRow,
  sortBy: 'country' | 'nUsed_desc' | 'r2_desc'
): number {
  if (sortBy === 'country') {
    // alphabetical by country (case-insensitive)
    return a.country.toLowerCase().localeCompare(b.country.toLowerCase());
  } else if (sortBy === 'nUsed_desc') {
    // descending nUsed, tie-breaker by country alphabetical
    if (b.nUsed !== a.nUsed) return b.nUsed - a.nUsed;
    return a.country.toLowerCase().localeCompare(b.country.toLowerCase());
  } else {
    // r2_desc: descending r2 (nulls last), tie-breaker by nUsed desc then country alphabetical
    const aR2 = a.metrics.r2;
    const bR2 = b.metrics.r2;
    if (aR2 === null && bR2 === null) {
      // both null: tie-breaker
      if (b.nUsed !== a.nUsed) return b.nUsed - a.nUsed;
      return a.country.toLowerCase().localeCompare(b.country.toLowerCase());
    }
    if (aR2 === null) return 1; // a is null → a comes after b
    if (bR2 === null) return -1; // b is null → b comes after a
    // both finite: sort descending
    if (bR2 !== aR2) return bR2 - aR2;
    // tie on r2: use nUsed desc
    if (b.nUsed !== a.nUsed) return b.nUsed - a.nUsed;
    // tie on nUsed: alphabetical
    return a.country.toLowerCase().localeCompare(b.country.toLowerCase());
  }
}

/**
 * Compute fixed-coefficient per-country slice evaluation metrics.
 *
 * This is an in-sample per-country view: for each country, we compute metrics
 * on rows belonging to that country using the fixed coefficients (no refit).
 * This is NOT leave-one-country-out cross-validation.
 *
 * @param rows - canonical panel rows
 * @param options - configuration options
 *   - minRowsPerCountry: minimum nUsed for valid metrics (default: 30)
 *   - sortBy: "country" | "nUsed_desc" | "r2_desc" (default: "nUsed_desc")
 *   - maxCountries: optional cap on number of countries returned (default: unlimited)
 * @returns CountrySliceSummary with global and per-country rows
 */
export function computeCountrySliceSummary(
  rows: PanelRowCanonical[],
  options?: {
    minRowsPerCountry?: number;
    sortBy?: 'country' | 'nUsed_desc' | 'r2_desc';
    maxCountries?: number;
    coefficients?: Record<string, number>;
  }
): CountrySliceSummary {
  const minRowsPerCountry = options?.minRowsPerCountry ?? 30;
  const sortBy = options?.sortBy ?? 'nUsed_desc';
  const maxCountries = options?.maxCountries;

  // Group rows by ISO3 (stable, short country identifier)
  const countryField = 'iso3';
  const grouped = new Map<string, PanelRowCanonical[]>();
  for (const row of rows) {
    const key = row.iso3;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(row);
  }

  // Compute per-country metrics
  const countrySlices: CountrySliceRow[] = [];
  for (const [iso3, countryRows] of grouped.entries()) {
    const slice = computeCountrySlice(countryRows, iso3, minRowsPerCountry, options?.coefficients);
    countrySlices.push(slice);
  }

  // Sort deterministically
  countrySlices.sort((a, b) => compareCountries(a, b, sortBy));

  // Apply maxCountries cap if specified
  const truncated = maxCountries !== undefined && countrySlices.length > maxCountries;
  const finalRows = truncated ? countrySlices.slice(0, maxCountries) : countrySlices;

  // Compute global aggregate row using all rows (fixed coefficients)
  const globalSlice = computeCountrySlice(rows, 'ALL', minRowsPerCountry, options?.coefficients);

  const notes: string[] = [
    'Fixed coefficients; no refit performed.',
    'Filtering: rows with finite zObs and zPred contribute to metrics.',
    `minRowsPerCountry=${minRowsPerCountry}: countries with fewer used rows have null metrics.`,
    'Quantiles computed via linear interpolation between closest ranks.',
    'Bias defined as mean(zObs - zPred).',
  ];

  if (truncated) {
    notes.push(`Output truncated to maxCountries=${maxCountries}.`);
  }

  return {
    definition: {
      strategy: 'fixed-coefficient country-slice evaluation',
      countryField,
      filteringRule: 'finite zObs and zPred',
      notes,
    },
    global: globalSlice,
    rows: finalRows,
  };
}
