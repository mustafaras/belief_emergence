import React, { useEffect, useMemo, useRef } from 'react';
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

const presets: PresetData[] = [
  {
    name: "Australia",
    flag: "🇦🇺",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.85,
      C: -0.94,
      M: 1.21,
      T: -1.57,
      D: 1.22,
      G: 0.21,
      Gini: 0.21,
      E: 3.59,
      S: -1.22,
      R: 1.27,
    }
  },
  {
    name: "Brazil",
    flag: "🇧🇷",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.86,
      C: 1.20,
      M: 0.16,
      T: 0.62,
      D: -1.61,
      G: 3.43,
      Gini: 3.43,
      E: 0.16,
      S: 1.61,
      R: -1.88,
    }
  },
  {
    name: "Bulgaria",
    flag: "🇧🇬",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.72,
      C: 1.40,
      M: -0.59,
      T: 0.44,
      D: -1.31,
      G: 1.13,
      Gini: 1.13,
      E: -1.48,
      S: 1.31,
      R: -0.39,
    }
  },
  {
    name: "Canada",
    flag: "🇨🇦",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.82,
      C: -0.50,
      M: 0.60,
      T: -1.30,
      D: 1.13,
      G: 0.15,
      Gini: 0.15,
      E: 0.38,
      S: -1.13,
      R: 0.88,
    }
  },
  {
    name: "Chile",
    flag: "🇨🇱",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.88,
      C: 0.20,
      M: -0.04,
      T: 0.06,
      D: -0.92,
      G: 2.67,
      Gini: 2.67,
      E: -0.15,
      S: 0.92,
      R: 0.16,
    }
  },
  {
    name: "Czechia",
    flag: "🇨🇿",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.74,
      C: -0.70,
      M: -0.10,
      T: -0.46,
      D: 0.07,
      G: -0.27,
      Gini: -0.27,
      E: 0.06,
      S: -0.07,
      R: 0.53,
    }
  },
  {
    name: "Estonia",
    flag: "🇪🇪",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.70,
      C: -0.71,
      M: -0.51,
      T: -0.37,
      D: -0.03,
      G: 0.95,
      Gini: 0.95,
      E: 0.19,
      S: 0.03,
      R: 0.39,
    }
  },
  {
    name: "Finland",
    flag: "🇫🇮",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.84,
      C: -1.03,
      M: 0.17,
      T: -1.41,
      D: 1.44,
      G: -0.50,
      Gini: -0.50,
      E: 0.33,
      S: -1.44,
      R: 1.33,
    }
  },
  {
    name: "Germany",
    flag: "🇩🇪",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.76,
      C: -0.65,
      M: 0.30,
      T: -0.09,
      D: 0.94,
      G: -0.06,
      Gini: -0.06,
      E: 0.98,
      S: -0.94,
      R: 1.01,
    }
  },
  {
    name: "Greece",
    flag: "🇬🇷",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.62,
      C: 0.30,
      M: -0.43,
      T: 0.23,
      D: -0.42,
      G: 0.90,
      Gini: 0.90,
      E: -0.35,
      S: 0.42,
      R: 0.13,
    }
  },
  {
    name: "Korea",
    flag: "🇰🇷",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.82,
      C: 0.38,
      M: 0.93,
      T: 1.20,
      D: -0.57,
      G: 0.69,
      Gini: 0.69,
      E: 1.22,
      S: 0.57,
      R: -0.18,
    }
  },
  {
    name: "Mexico",
    flag: "🇲🇽",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.79,
      C: 0.64,
      M: -0.38,
      T: 1.22,
      D: -1.83,
      G: 2.82,
      Gini: 2.82,
      E: -1.01,
      S: 1.83,
      R: -1.44,
    }
  },
  {
    name: "Netherlands",
    flag: "🇳🇱",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.90,
      C: -1.05,
      M: 0.78,
      T: -1.43,
      D: 1.31,
      G: -0.55,
      Gini: -0.55,
      E: 0.18,
      S: -1.31,
      R: 1.33,
    }
  },
  {
    name: "Poland",
    flag: "🇵🇱",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.61,
      C: 0.35,
      M: -0.26,
      T: 0.04,
      D: -0.36,
      G: 0.64,
      Gini: 0.64,
      E: -0.06,
      S: 0.36,
      R: 0.21,
    }
  },
  {
    name: "Romania",
    flag: "🇷🇴",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.55,
      C: 0.41,
      M: -0.82,
      T: 0.27,
      D: -1.13,
      G: 1.13,
      Gini: 1.13,
      E: -0.90,
      S: 1.13,
      R: -0.32,
    }
  },
  {
    name: "Russia",
    flag: "🇷🇺",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.74,
      C: -0.18,
      M: -0.20,
      T: 1.01,
      D: -0.92,
      G: -1.46,
      Gini: -1.46,
      E: -0.18,
      S: 0.02,
      R: 0.37,
    }
  },
  {
    name: "Slovak Republic",
    flag: "🇸🇰",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.56,
      C: -0.43,
      M: -0.43,
      T: -0.32,
      D: 0.03,
      G: -0.50,
      Gini: -0.50,
      E: -0.04,
      S: -0.03,
      R: 0.47,
    }
  },
  {
    name: "Slovenia",
    flag: "🇸🇮",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.52,
      C: -0.68,
      M: -0.22,
      T: -1.49,
      D: 0.27,
      G: -1.38,
      Gini: -1.38,
      E: 0.06,
      S: -0.27,
      R: 0.39,
    }
  },
  {
    name: "Spain",
    flag: "🇪🇸",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.78,
      C: -0.85,
      M: 0.23,
      T: 0.35,
      D: 0.99,
      G: 0.31,
      Gini: 0.31,
      E: 0.94,
      S: -0.99,
      R: 0.36,
    }
  },
  {
    name: "Switzerland",
    flag: "🇨🇭",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.74,
      C: -0.59,
      M: 0.73,
      T: -1.16,
      D: 1.13,
      G: 0.21,
      Gini: 0.21,
      E: -0.07,
      S: -1.13,
      R: 0.76,
    }
  },
  {
    name: "Turkiye",
    flag: "🇹🇷",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.71,
      C: 0.54,
      M: -0.16,
      T: 1.44,
      D: -1.61,
      G: 1.23,
      Gini: 1.23,
      E: -0.16,
      S: 1.61,
      R: -0.32,
    }
  },
  {
    name: "United Kingdom",
    flag: "🇬🇧",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.83,
      C: -0.65,
      M: 0.50,
      T: -0.23,
      D: 0.36,
      G: 0.41,
      Gini: 0.41,
      E: 0.33,
      S: -0.36,
      R: 0.59,
    }
  },
  {
    name: "United States",
    flag: "🇺🇸",
    type: "Panel Data Average",
    description: "Panel data average (1990-2023): 167 observations",
    values: {
      X: 0.81,
      C: 0.17,
      M: 1.06,
      T: 1.34,
      D: 0.75,
      G: 1.38,
      Gini: 1.38,
      E: -0.51,
      S: -0.75,
      R: 1.01,
    }
  },
];

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
