import React, { useEffect, useMemo, useRef } from 'react';
import { GENERATED_PRESETS } from '../../data/presets.generated'

/**
 * The preset table, generated from the canonical panel.
 *
 * It used to be hand-maintained, and an audit found 113 of 115 checkable values did not
 * reproduce from the shipped panel: the scales were mixed and several values matched
 * neither the raw mean nor its z-score. `npm run generate:presets` now derives the table
 * with the convention this file's header states, and `check:presets` fails on drift.
 *
 * `description` is kept on the type because the modal declares it, but nothing renders it;
 * the provenance that matters is in the generated module.
 */
const presets: PresetData[] = GENERATED_PRESETS.map((preset) => ({
  name: preset.name,
  flag: preset.flag,
  type: 'Panel Data Average',
  description: `Panel mean over ${preset.observations} observation${preset.observations === 1 ? '' : 's'}`,
  values: {
    X: preset.values.X ?? 0,
    C: preset.values.C ?? 0,
    M: preset.values.M ?? 0,
    T: preset.values.T ?? 0,
    D: preset.values.D ?? 0,
    G: preset.values.G ?? 0,
    Gini: preset.values.Gini ?? 0,
    E: preset.values.E ?? 0,
    S: preset.values.S ?? 0,
    R: preset.values.R ?? 0,
  },
}))
import './PresetModal.css';
import { formatNumeric } from '../../utils/formatNumeric';
import { useDataContext } from '../../contexts/DataContext';
import type { PresetCountryAlignmentRow } from '../../utils/validation/presetCountryAlignment';
import {
  computePresetCountryAlignment,
  PRESET_VERDICT_THRESHOLDS,
} from '../../utils/validation/presetCountryAlignment';

/**
 * PRESET SCALE CONVENTION (CRITICAL):
 * ════════════════════════════════════════════════════════════════════════════
 * All preset values are Z-SCORED (standardized using training distribution).
 * This applies to ALL modifiers: C, M, T, D, G, E, S, R.
 *
 * - C (Cultural Intensity): z-scored using mean=2.613602, std=0.542138
 *   → Range in presets: typically [-1.5, 1.5] (standardized)
 *   → NOT raw panel scale (which would be ~1.5–3.5)
 *
 * - M, T, D, G, E, S, R: Already standardized in production CSV
 *   → Range: typically [-2, 2]
 *
 * USAGE IN UI:
 * When a preset is selected, ALL preset values are z-scored.
 * In App.tsx, set modifiersAreStandardized=true when currentPresetName is set.
 * In calculateModel(), do NOT re-z-score C—pass it directly.
 *
 * VALIDATION:
 * Presets match the output of generate_presets_from_panel.py, which applies
 * StandardScaler.fit_transform() to all features before computing country means.
 */

export interface PresetData {
  name: string;
  flag: string;
  type: string;
  /**
   * NOT RENDERED. Declared and populated for all 23 presets, but no component reads it, so
   * no text here reaches a reader. It is kept because removing it would touch every entry
   * for no user-visible gain — but it must not be relied on to state provenance. The
   * provenance caveat lives in `src/data/presets.ts`, where the check scripts can also see
   * it.
   */
  description: string;
  values: {
    X: number;
    C: number;  // Z-scored (standardized) — NOT raw panel scale
    M: number;  // Z-scored (already standardized in production CSV)
    T: number;  // Z-scored (already standardized in production CSV)
    D: number;  // Z-scored (already standardized in production CSV)
    G: number;  // Z-scored (already standardized in production CSV)
    Gini: number;  // Alias for G (mapped to Y in sliders)
    E: number;  // Z-scored (already standardized in production CSV)
    S: number;  // Z-scored (already standardized in production CSV)
    R: number;  // Z-scored (already standardized in production CSV)
  };
}

interface PresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (preset: PresetData) => void;
}

;

const getValueColor = (value: number): string => {
  if (value > 0.1) return 'positive';
  if (value < -0.1) return 'negative';
  return 'neutral';
};

const formatValue = (value: number): string => {
  const formatted = formatNumeric(value, 2);
  return value >= 0 ? `+${formatted}` : formatted;
};

const normalizeCountryKey = (value: string): string => {
  // Normalize to improve matching between preset labels and panel country names.
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const PresetModal: React.FC<PresetModalProps> = ({ isOpen, onClose, onSelectPreset }) => {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  const { panelData, loading: panelLoading, error: panelError } = useDataContext();

  const alignmentRows = useMemo(() => {
    if (!panelData) return null;
    return computePresetCountryAlignment(panelData);
  }, [panelData]);

  const alignmentByNameKey = useMemo(() => {
    const map = new Map<string, PresetCountryAlignmentRow>();
    if (!alignmentRows) return map;
    for (const r of alignmentRows) {
      map.set(normalizeCountryKey(r.countryName), r);
    }
    return map;
  }, [alignmentRows]);

  const getFocusableElements = (): HTMLElement[] => {
    const root = modalRef.current;
    if (!root) return [];
    const nodes = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
      )
    );
    return nodes.filter((el) => {
      if (el.hasAttribute('disabled')) return false;
      if (el.getAttribute('aria-hidden') === 'true') return false;
      // Skip elements that are not actually visible/interactive.
      if ((el as HTMLElement).offsetParent === null && el !== document.activeElement) return false;
      return true;
    });
  };

  const handleDialogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key !== 'Tab') return;

    const root = modalRef.current;
    if (!root) return;

    const focusables = getFocusableElements();
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;

    // If focus has escaped, pull it back in.
    if (!active || !root.contains(active)) {
      e.preventDefault();
      first.focus();
      return;
    }

    if (e.shiftKey) {
      if (active === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    // Focus a predictable control on open.
    closeButtonRef.current?.focus();
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handlePresetSelect = (preset: PresetData) => {
    onSelectPreset(preset);
    onClose();
  };

  return (
    <div className="preset-modal-overlay" onClick={handleOverlayClick}>
      <div
        ref={modalRef}
        className="preset-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preset-modal-title"
        aria-describedby="preset-modal-subtitle"
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
      >
        <div className="preset-modal-header">
          <h2 id="preset-modal-title" className="preset-modal-title">Country Presets</h2>
          <p id="preset-modal-subtitle" className="preset-modal-subtitle">
            Select a country to load its average parameter values from panel data (1990-2023).
            The table also shows paper-aligned observed/predicted $Z$ summary metrics computed from the canonical panel.
          </p>
          <button
            ref={closeButtonRef}
            type="button"
            className="preset-modal-close"
            onClick={onClose}
            aria-label="Close presets"
          >
            ×
          </button>
        </div>

        <div className="preset-table-wrap" aria-live="polite">
          {panelLoading && (
            <div className="preset-table-note">Loading canonical panel data…</div>
          )}
          {panelError && (
            <div className="preset-table-note preset-table-note--error">
              Unable to load panel data: {String(panelError)}
            </div>
          )}
          {!panelLoading && !panelError && (
            <div className="preset-table-note">
              Success(%) = 100 · (1 − MAE). Verdict thresholds: Good ≤ {PRESET_VERDICT_THRESHOLDS.goodMaeMax.toFixed(2)},
              Acceptable ≤ {PRESET_VERDICT_THRESHOLDS.acceptableMaeMax.toFixed(2)}, otherwise Poor.
            </div>
          )}

          <table className="preset-table">
            <thead>
              <tr>
                <th scope="col">Country</th>
                <th scope="col">C</th>
                <th scope="col">M</th>
                <th scope="col">E</th>
                <th scope="col">R</th>
                <th scope="col">Z̄</th>
                <th scope="col">Ẑ̄</th>
                <th scope="col">MAE</th>
                <th scope="col">Success(%)</th>
                <th scope="col">Bias</th>
                <th scope="col">Good</th>
                <th scope="col">Accept.</th>
                <th scope="col">Poor</th>
              </tr>
            </thead>
            <tbody>
              {presets.map((preset, index) => {
                const metrics = alignmentByNameKey.get(normalizeCountryKey(preset.name));
                const verdict = metrics?.verdictClass;

                const format3 = (v: number | undefined) =>
                  v == null || !Number.isFinite(v) ? '—' : formatNumeric(v, 3);
                const format2 = (v: number | undefined) =>
                  v == null || !Number.isFinite(v) ? '—' : formatNumeric(v, 2);
                const formatPct1 = (v: number | undefined) =>
                  v == null || !Number.isFinite(v) ? '—' : `${formatNumeric(v, 1)}`;

                return (
                  <tr key={index} className="preset-table-row">
                    <th scope="row" className="preset-table-country">
                      <button
                        type="button"
                        className="preset-select-button"
                        onClick={() => handlePresetSelect(preset)}
                      >
                        <span className="preset-flag" aria-hidden="true">{preset.flag}</span>
                        <span className="preset-name">{preset.name}</span>
                      </button>
                    </th>

                    <td className={getValueColor(preset.values.C)}>{formatValue(preset.values.C)}</td>
                    <td className={getValueColor(preset.values.M)}>{formatValue(preset.values.M)}</td>
                    <td className={getValueColor(preset.values.E)}>{formatValue(preset.values.E)}</td>
                    <td className={getValueColor(preset.values.R)}>{formatValue(preset.values.R)}</td>

                    <td>{format3(metrics?.meanObservedZ)}</td>
                    <td>{format3(metrics?.meanPredictedZ)}</td>
                    <td>{format3(metrics?.mae)}</td>
                    <td>{formatPct1(metrics?.successPct)}</td>
                    <td>{format2(metrics?.bias)}</td>

                    <td className={verdict === 'good' ? 'verdict verdict-good' : 'verdict'}>
                      {verdict === 'good' ? '✓' : ''}
                    </td>
                    <td className={verdict === 'acceptable' ? 'verdict verdict-acceptable' : 'verdict'}>
                      {verdict === 'acceptable' ? '≈' : ''}
                    </td>
                    <td className={verdict === 'poor' ? 'verdict verdict-poor' : 'verdict'}>
                      {verdict === 'poor' ? '×' : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PresetModal;
