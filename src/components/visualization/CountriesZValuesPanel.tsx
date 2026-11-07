import React, { useEffect, useMemo } from 'react';
import { useDataContext } from '../../contexts/DataContext';
import type { PanelRowCanonical } from '../../types/panel';
import { formatNumeric } from '../../utils/formatNumeric';
import { predictFromPanelRow } from '../../utils/validation/panelPredict';
import { STRUCTURAL_MAX, STRUCTURAL_MIN } from '../../utils/modelContract';
import { downloadCsv } from '../../utils/csv/exportCsv';
import {
  PRESET_VERDICT_THRESHOLDS,
  verdictClassFromMae,
} from '../../utils/validation/presetCountryAlignment';
import './CountriesZValuesPanel.css';

/**
 * PANEL MODIFIER SCALE CONVENTION
 * ════════════════════════════════════════════════════════════════════════════
 * In CountriesZValuesPanel, we compute predictedZ for panel rows using panel data.
 *
 * CRITICAL: Panel data has MIXED scales:
 *   - C (Cultural Intensity): RAW panel scale (mean≈2.613602, std≈0.542138)
 *     → MUST z-score before passing to calculateModel
 *   - M, T, D, G, E, S, R: Already standardized in production CSV (mean≈0, std≈1)
 *     → Use as-is, do NOT re-standardize
 *
 * For each row, we:
 *   1. Z-score raw C using PRODUCTION_C_MEAN and PRODUCTION_C_STD
 *   2. Pass all modifiers with modifiersAreStandardized=true (to skip re-standardization)
 *   3. Compare measured Z (normalized to the structural band) with predictedZ
 *
 * This ensures panel predictions match the Python preprocessing exactly.
 */

type CountryYearPair = {
  year: number;
  measuredZ: number;
  predictedZ: number;
};

function normalizeCountryName(value: string): string {
  return value.trim().toLowerCase();
}

function computeCountrySeries(
  rows: PanelRowCanonical[],
  selectedCountryName: string,
): {
  countryName: string;
  iso3: string | null;
  series: CountryYearPair[];
  measuredMean: number | null;
  predictedMean: number | null;
  mae: number | null;
  bias: number | null;
  successPct: number | null;
  verdictClass: 'good' | 'acceptable' | 'poor' | null;
} {
  const target = normalizeCountryName(selectedCountryName);
  const filtered = rows.filter((r) => normalizeCountryName(r.country_name) === target);

  // Aggregate multiple observations per year into a single year-average.
  // NOTE: panel_canonical_v2.csv includes repeated rows per country-year (different redistribution scenarios).
  const byYear = new Map<number, { measuredSum: number; predictedSum: number; n: number }>();

  for (const r of filtered) {
    if (!Number.isFinite(r.year)) continue;

    // Use canonical panel prediction pipeline
    const result = predictFromPanelRow(r);
    const measuredZ = result.zObs;
    const predictedZ = result.zPred;

    if (!Number.isFinite(measuredZ) || !Number.isFinite(predictedZ)) continue;

    const year = r.year;
    const agg = byYear.get(year) ?? { measuredSum: 0, predictedSum: 0, n: 0 };
    agg.measuredSum += measuredZ;
    agg.predictedSum += predictedZ;
    agg.n += 1;
    byYear.set(year, agg);
  }

  const series = Array.from(byYear.entries())
    .map(([year, agg]) => ({
      year,
      measuredZ: agg.measuredSum / agg.n,
      predictedZ: agg.predictedSum / agg.n,
    }))
    .sort((a, b) => a.year - b.year);

  let measuredSum = 0;
  let predictedSum = 0;
  let absErrorSum = 0;
  let residualSum = 0;
  let n = 0;
  for (const p of series) {
    measuredSum += p.measuredZ;
    predictedSum += p.predictedZ;
    const residual = p.measuredZ - p.predictedZ;
    absErrorSum += Math.abs(residual);
    residualSum += residual;
    n += 1;
  }

  const iso3 = filtered.length > 0 && filtered[0].iso3 ? String(filtered[0].iso3) : null;

  return {
    countryName: filtered.length > 0 ? filtered[0].country_name : selectedCountryName,
    iso3,
    series,
    measuredMean: n > 0 ? measuredSum / n : null,
    predictedMean: n > 0 ? predictedSum / n : null,
    mae: n > 0 ? absErrorSum / n : null,
    bias: n > 0 ? residualSum / n : null,
    successPct: n > 0 ? 100 * (1 - absErrorSum / n) : null,
    verdictClass: n > 0 ? verdictClassFromMae(absErrorSum / n) : null,
  };
}

export interface CountriesZValuesPanelProps {
  selectedCountryName?: string;
  currentParams?: {
    X: number;
    Y: number;
    C: number;
    M: number;
    T: number;
    D: number;
    G: number;
    E: number;
    S: number;
    R: number;
    alpha: number;
    beta: number;
    k: number;
  };
  currentModelZ?: number;
  onCountrySummary?: (summary: {
    countryName: string;
    iso3: string | null;
    measuredZ: number | null;
    predictedZFromPanelInputs: number | null;
    panelMae: number | null;
    panelSuccessPct: number | null;
    panelVerdictClass: 'good' | 'acceptable' | 'poor' | null;
  } | null) => void;
}

export const CountriesZValuesPanel: React.FC<CountriesZValuesPanelProps> = ({
  selectedCountryName,
  currentParams: _currentParams, // Reserved for future use
  currentModelZ,
  onCountrySummary,
}) => {
  void _currentParams;
  const { panelData, loading, error } = useDataContext();

  const structuralBandLabel = `${STRUCTURAL_MIN.toFixed(4)}–${STRUCTURAL_MAX.toFixed(4)}`;

  const country = useMemo(() => {
    if (!panelData || !selectedCountryName) return null;
    return computeCountrySeries(panelData, selectedCountryName);
  }, [panelData, selectedCountryName]);

  const metrics = useMemo(() => {
    if (!country) return null;
    const measured = country.measuredMean;
    if (measured === null) return null;

    const modelFromCurrentInputs = currentModelZ;
    const modelFromPanelInputs = country.predictedMean;

    const sliderDiff =
      modelFromCurrentInputs === undefined || !Number.isFinite(modelFromCurrentInputs)
        ? null
        : Math.abs(modelFromCurrentInputs - measured);

    const panelFitDiff =
      modelFromPanelInputs === null || !Number.isFinite(modelFromPanelInputs)
        ? null
        : Math.abs(modelFromPanelInputs - measured);

    return {
      measured,
      modelFromCurrentInputs,
      modelFromPanelInputs,
      sliderDiff,
      panelFitDiff,
      mae: country.mae,
      bias: country.bias,
      successPct: country.successPct,
      verdictClass: country.verdictClass,
    };
  }, [country, currentModelZ]);

  useEffect(() => {
    if (!onCountrySummary) return;
    if (!selectedCountryName) {
      onCountrySummary(null);
      return;
    }
    onCountrySummary({
      countryName: country?.countryName ?? selectedCountryName,
      iso3: country?.iso3 ?? null,
      measuredZ: metrics?.measured ?? null,
      predictedZFromPanelInputs: metrics?.modelFromPanelInputs ?? null,
      panelMae: metrics?.mae ?? null,
      panelSuccessPct: metrics?.successPct ?? null,
      panelVerdictClass: metrics?.verdictClass ?? null,
    });
  }, [country, metrics, onCountrySummary, selectedCountryName]);

  return (
    <div className="countries-z-panel" aria-label="Measured panel Z values">
      <div className="countries-z-header">
        <div className="countries-z-title">MODEL VS DATA (PANEL)</div>
        <div className="countries-z-subtitle">Predicted Z comes from the current model inputs; measured Z comes from the panel outcome.</div>
        {country && country.series.length > 0 && (
          <button
            type="button"
            className="countries-z-download"
            title="Download country predictions as CSV"
            onClick={() => {
              const headers = ['iso3', 'country_name', 'year', 'Z_observed', 'Z_predicted', 'residual'];
              const rows = country.series.map(p => [
                country.iso3 ?? '',
                country.countryName,
                p.year,
                p.measuredZ,
                p.predictedZ,
                +(p.measuredZ - p.predictedZ).toFixed(6),
              ] as (string | number)[]);
              downloadCsv('belief_emergence_country_predictions.csv', headers, rows);
            }}
            style={{
              background: 'none',
              border: '1px solid var(--border-default, #444)',
              borderRadius: 4,
              color: 'var(--text-secondary, #aaa)',
              cursor: 'pointer',
              fontSize: '0.75rem',
              padding: '2px 8px',
              marginLeft: 'auto',
            }}
          >
            ⬇ CSV
          </button>
        )}
      </div>

      <div className="z-stack">
        {currentModelZ !== undefined && (
          <div className="z-card model" aria-label="Model-predicted Z (current inputs)">
            <div className="z-card-label-row">
              <div className="z-card-label">PREDICTED Z (CURRENT INPUTS)</div>
              <span className="z-band-tag">Z ∈ (0,1), clipped to {structuralBandLabel}</span>
            </div>
            <div className="z-card-value predicted">{formatNumeric(currentModelZ, 4)}</div>
            <div className="z-card-subrow">
              <div className="z-subitem">
                <span className="z-sub-label">Probability</span>
                <span className="z-sub-value predicted">{formatNumeric(currentModelZ * 100, 1)}%</span>
              </div>
              <div className="z-subitem">
                <span className="z-sub-label">State</span>
                <span className="z-sub-value success">
                  {currentModelZ > 0.7 ? 'HIGH' : currentModelZ > 0.4 ? 'TRANSITIONAL' : 'LOW'}
                </span>
              </div>
            </div>
          </div>
        )}

        {metrics && (
          <div className="z-card measured" aria-label="Panel measured vs model">
            <div className="z-card-label-row">
              <div className="z-card-label">MEASURED Z (PANEL)</div>
              <span className="z-band-tag">band: {structuralBandLabel} (panel norm)</span>
            </div>
            <div className="z-card-value measured">{formatNumeric(metrics.measured, 4)}</div>
            <div className="z-card-subrow">
              <div className="z-subitem">
                <span className="z-sub-label">Model Z (current inputs)</span>
                <span className="z-sub-value predicted">
                  {metrics.modelFromCurrentInputs === undefined ? '—' : formatNumeric(metrics.modelFromCurrentInputs, 4)}
                </span>
              </div>
              <div className="z-subitem">
                <span className="z-sub-label">Absolute error |Δ|</span>
                <span className="z-sub-value success">
                  {metrics.sliderDiff == null ? '—' : formatNumeric(metrics.sliderDiff, 3)}
                </span>
              </div>
            </div>

            <div className="z-card-subrow">
              <div className="z-subitem">
                <span className="z-sub-label">Panel MAE (year-avg)</span>
                <span className="z-sub-value success">
                  {metrics.mae == null ? '—' : formatNumeric(metrics.mae, 3)}
                </span>
              </div>
              <div className="z-subitem">
                <span className="z-sub-label">Success(%)</span>
                <span className="z-sub-value success">
                  {metrics.successPct == null ? '—' : `${formatNumeric(metrics.successPct, 1)}%`}
                </span>
              </div>
              <div className="z-subitem">
                <span className="z-sub-label">Verdict</span>
                <span className="z-sub-value success">
                  {metrics.verdictClass === null
                    ? '—'
                    : metrics.verdictClass === 'good'
                      ? `Good (≤${PRESET_VERDICT_THRESHOLDS.goodMaeMax.toFixed(2)})`
                      : metrics.verdictClass === 'acceptable'
                        ? `Acceptable (≤${PRESET_VERDICT_THRESHOLDS.acceptableMaeMax.toFixed(2)})`
                        : 'Poor'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {loading && <div className="countries-z-status">Loading…</div>}
      {!loading && error && <div className="countries-z-status error">Data unavailable</div>}

      {!loading && !error && !selectedCountryName && (
        <div className="countries-z-status">Select a country preset to view measured Z</div>
      )}

      {!loading && !error && selectedCountryName && (
        <>
          {!country || country.series.length === 0 ? (
            <div className="countries-z-status">No measured Z rows for {selectedCountryName}</div>
          ) : (
            <div className="countries-z-table" role="table" aria-label="Country measured Z by year">
              <div className="countries-z-context">
                <div className="countries-z-context-name" title={country.countryName}>
                  {country.countryName}{country.iso3 ? ` (${country.iso3})` : ''}
                </div>
                <div className="countries-z-context-meta">
                  {country.series[0].year}–{country.series[country.series.length - 1].year} • n={country.series.length}
                </div>
              </div>

              <div className="countries-z-table-head" role="row">
                <div className="countries-z-col year" role="columnheader">
                  Year
                </div>
                <div className="countries-z-col z" role="columnheader">Measured Z (band {structuralBandLabel})</div>
                <div className="countries-z-col z" role="columnheader">Predicted Z (panel inputs; training params)</div>
              </div>

              <div className="countries-z-list" role="rowgroup">
                {country.series.map((p) => (
                  <div key={p.year} className="countries-z-row" role="row">
                    <div className="countries-z-year" role="cell">{p.year}</div>
                    <div className="countries-z-value" role="cell">{formatNumeric(p.measuredZ, 3)}</div>
                    <div className="countries-z-value" role="cell">{formatNumeric(p.predictedZ, 3)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CountriesZValuesPanel;
