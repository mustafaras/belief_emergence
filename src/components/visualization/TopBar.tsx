import React, { useLayoutEffect, useRef, useState } from 'react';
import { formatNumeric } from '../../utils/formatNumeric';
import { computeTopBarAnalytics } from '../../utils/topBarAnalytics';
import { STRUCTURAL_MAX, STRUCTURAL_MIN } from '../../utils/modelContract';
import type { BeliefParameters } from '../../types';
import type { PanelRowCanonical } from '../../types/panel';
import { buildAppUrl } from '../../utils/urlState';
import { LANDING_ROUTE, isAnalysisRoute, shouldHidePanel, type AppRoute } from '../../router/routes';
import { exportBehavioralDynamicsReport } from '../../utils/pdf/exportBehavioralDynamicsReport';
import { useAccessibility } from '../../contexts/AccessibilityContext';
import { downloadCsv } from '../../utils/csv/exportCsv';
import './TopBar.css';

type PanelRange = [number, number];
type PanelRanges = Partial<
  Record<'X' | 'Y' | 'Z' | 'C' | 'M' | 'T' | 'D' | 'G' | 'E' | 'S' | 'R', PanelRange>
>;

type TopBarPanelStats = {
  totalRows: number;
  zDistribution: { mean: number; std: number; min: number; max: number };
  zSorted: number[];
  ranges: PanelRanges;
};

function upperBound(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface TopBarProps {
  zValue: number;
  phiValue: number;
  interpretation: { label: string; message: string };
  presetName?: string;
  params: {
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
  };
  structuralBase: number;
  phiComponents: {
    baseline: number;
    mainEffects: number;
    interactions: number;
    quadratic: number;
  };
  alpha: number;
  beta: number;
  k: number;
  onApplyScenario?: (next: { params: BeliefParameters; presetName?: string }) => void;
  panelStats?: TopBarPanelStats;
  panelData?: PanelRowCanonical[] | null;

  surface3dEnabled?: boolean;
  onToggleSurface3d?: () => void;

  /**
   * The active analysis route, or `landing` when the reader has not chosen a panel.
   *
   * On `landing` every panel stays visible, exactly as before routing existed. On a
   * specific route the other five are hidden but *still mounted* — the PDF export
   * captures `.belief-emergence-top-bar` as its figure, so unmounting them would
   * silently shrink the exported report.
   */
  route?: AppRoute;
}

type ScenarioSnapshot = {
  capturedAt: number;
  params: BeliefParameters;
  presetName?: string;
  zValue: number;
  phiValue: number;
};

const TopBar: React.FC<TopBarProps> = ({ 
  zValue, 
  phiValue, 
  interpretation, 
  presetName,
  params,
  structuralBase,
  phiComponents,
  alpha,
  beta,
  k,
  onApplyScenario,
  panelStats,
  panelData,
  surface3dEnabled = true,
  onToggleSurface3d,
  route = LANDING_ROUTE,
}) => {
  const { rovingTabindex, toggleRovingTabindex } = useAccessibility();
  const structuralBandLabel = `[${STRUCTURAL_MIN.toFixed(4)}, ${STRUCTURAL_MAX.toFixed(4)}]`;

  /**
   * Hide a panel without unmounting it.
   *
   * Only an *analysis* route isolates a single panel; see `shouldHidePanel`.
   * `display: none` removes the panel from the accessibility tree and hit-testing
   * while leaving the DOM intact for the PDF figure capture.
   */
  const panelClass = (panelRoute: AppRoute, baseClass: string) =>
    shouldHidePanel(route, panelRoute) ? `${baseClass} is-route-hidden` : baseClass;
  const [opacity, setOpacity] = useState(1); // Opacity state for transparency toggle
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const topBarContentRef = useRef<HTMLDivElement | null>(null);

  const [scenarioA, setScenarioA] = useState<ScenarioSnapshot | null>(null);
  const [scenarioB, setScenarioB] = useState<ScenarioSnapshot | null>(null);
  const [showScenarioDetails, setShowScenarioDetails] = useState(false);

  const surfaceToggleAria = {
    'aria-pressed': surface3dEnabled ? 'true' : 'false',
  } as const;

  const buildFullParams = (): BeliefParameters => ({
    X: params.X,
    Y: params.Y,
    alpha,
    beta,
    k,
    C: params.C,
    M: params.M,
    T: params.T,
    D: params.D,
    G: params.G,
    E: params.E,
    S: params.S,
    R: params.R,
  });

  const captureScenario = (which: 'A' | 'B') => {
    const snapshot: ScenarioSnapshot = {
      capturedAt: Date.now(),
      params: buildFullParams(),
      presetName,
      zValue,
      phiValue,
    };
    if (which === 'A') setScenarioA(snapshot);
    else setScenarioB(snapshot);
  };

  const applyScenario = (snapshot: ScenarioSnapshot | null) => {
    if (!snapshot) return;
    onApplyScenario?.({ params: snapshot.params, presetName: snapshot.presetName });
  };

  const clearScenarios = () => {
    setScenarioA(null);
    setScenarioB(null);
  };

  const copyShareLink = async () => {
    try {
      const href = window.location.href;
      await navigator.clipboard.writeText(href);
    } catch (error) {
      // Fallback: prompt-based copy
      window.prompt('Copy this link:', window.location.href);
      if (import.meta.env.DEV) {
        console.warn('[TopBar] Clipboard copy failed; used prompt fallback.', error);
      }
    }
  };

  const copyScenarioLink = async (which: 'A' | 'B') => {
    const snap = which === 'A' ? scenarioA : scenarioB;
    if (!snap) return;

    const url = buildAppUrl({
      params: snap.params,
      presetName: snap.presetName,
      showDocumentation: false,
    });

    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this link:', url);
    }
  };

  const currentParams = buildFullParams();
  
  // Determine comparison mode:
  // If both A and B exist, compare them
  // If only one exists, compare it with current
  const comparisonMode = (() => {
    if (scenarioA && scenarioB) return 'A-vs-B';
    if (scenarioA) return 'A-vs-Current';
    if (scenarioB) return 'B-vs-Current';
    return null;
  })();

  const scenarioDelta = (() => {
    if (comparisonMode === 'A-vs-B' && scenarioA && scenarioB) {
      return {
        dZ: scenarioB.zValue - scenarioA.zValue,
        dPhi: scenarioB.phiValue - scenarioA.phiValue,
      };
    }
    if (comparisonMode === 'A-vs-Current' && scenarioA) {
      return {
        dZ: zValue - scenarioA.zValue,
        dPhi: phiValue - scenarioA.phiValue,
      };
    }
    if (comparisonMode === 'B-vs-Current' && scenarioB) {
      return {
        dZ: zValue - scenarioB.zValue,
        dPhi: phiValue - scenarioB.phiValue,
      };
    }
    return null;
  })();

  const scenarioParamRows = (() => {
    const keys: Array<keyof BeliefParameters> = [
      'X','Y','alpha','beta','k','C','M','T','D','G','E','S','R'
    ];
    
    if (comparisonMode === 'A-vs-B' && scenarioA && scenarioB) {
      return keys.map((key) => {
        const a = scenarioA.params[key];
        const b = scenarioB.params[key];
        return { key, a, b, d: b - a };
      }).filter((r) => Number.isFinite(r.a) && Number.isFinite(r.b));
    }
    
    if (comparisonMode === 'A-vs-Current' && scenarioA) {
      return keys.map((key) => {
        const a = scenarioA.params[key];
        const b = currentParams[key];
        return { key, a, b, d: b - a };
      }).filter((r) => Number.isFinite(r.a) && Number.isFinite(r.b));
    }
    
    if (comparisonMode === 'B-vs-Current' && scenarioB) {
      return keys.map((key) => {
        const a = scenarioB.params[key];
        const b = currentParams[key];
        return { key, a, b, d: b - a };
      }).filter((r) => Number.isFinite(r.a) && Number.isFinite(r.b));
    }
    
    return [] as Array<{ key: keyof BeliefParameters; a: number; b: number; d: number }>;
  })();

  const progressFromRange = (key: keyof TopBarPanelStats['ranges'], value: number): number => {
    const range = panelStats?.ranges?.[key];
    if (range && Number.isFinite(value)) {
      const [min, max] = range;
      if (Number.isFinite(min) && Number.isFinite(max) && max !== min) {
        return clamp((value - min) / (max - min), 0, 1);
      }
    }

    // Conservative fallbacks when panel ranges are not available.
    if (key === 'X') return clamp(value, 0, 1);
    if (key === 'Y') return clamp((value - (-2)) / (4 - (-2)), 0, 1);
    // For mixed-scale modifiers, fall back to a bounded magnitude mapping.
    return clamp(Math.abs(value) / (Math.abs(value) + 1), 0, 1);
  };

  const analytics = computeTopBarAnalytics({
    zValue,
    phiValue,
    params,
    structuralBase,
    phiComponents,
    alpha,
    beta,
    k
  });

  const panelPercentile = (() => {
    if (!panelStats) return null;
    if (!Number.isFinite(zValue) || !Array.isArray(panelStats.zSorted) || panelStats.zSorted.length === 0) {
      return null;
    }
    const n = panelStats.zSorted.length;
    const countLE = upperBound(panelStats.zSorted, zValue);
    return (countLE / n) * 100;
  })();

  const panelMeanCI95 = (() => {
    if (!panelStats) return null;
    const { mean, std, min, max } = panelStats.zDistribution;
    const n = panelStats.totalRows;
    if (!Number.isFinite(mean) || !Number.isFinite(std) || !Number.isFinite(min) || !Number.isFinite(max)) {
      return null;
    }
    if (!Number.isFinite(n) || n < 2 || std <= 0) return null;
    const se = std / Math.sqrt(n);
    const z = 1.96;
    const lo = clamp(mean - z * se, min, max);
    const hi = clamp(mean + z * se, min, max);
    return [lo, hi] as const;
  })();

  const extrapolationWarnings = (() => {
    if (!panelStats) return [] as string[];
    const ranges = panelStats.ranges;
    const warnings: string[] = [];

    const keys: Array<keyof typeof params> = ['X', 'Y', 'C', 'M', 'T', 'D', 'G', 'E', 'S', 'R'];
    for (const key of keys) {
      const range = ranges[key];
      const value = params[key];
      if (!range || !Number.isFinite(value)) continue;
      const [min, max] = range;
      if (!Number.isFinite(min) || !Number.isFinite(max)) continue;
      if (value < min) warnings.push(`${key}=${formatNumeric(value, 3)} below panel min (${formatNumeric(min, 3)})`);
      if (value > max) warnings.push(`${key}=${formatNumeric(value, 3)} above panel max (${formatNumeric(max, 3)})`);
    }
    return warnings;
  })();

  if (import.meta.env.DEV) {
    // Production model clamps Z away from exact endpoints.
    // Z should live in the open interval (0,1), typically within [0.0001, 0.9999].
    if (!Number.isFinite(zValue) || zValue <= 0 || zValue >= 1) {
      console.warn('[TopBar] zValue expected in (0, 1) (epsilon-clamped).', { zValue });
    }
    if (!Number.isFinite(params.X) || params.X < 0 || params.X > 1) {
      console.warn('[TopBar] params.X expected in [0, 1].', { X: params.X });
    }
    if (!Number.isFinite(alpha) || Number.isNaN(alpha)) {
      console.warn('[TopBar] alpha is not a valid number.', { alpha });
    }
    if (!Number.isFinite(beta) || Number.isNaN(beta)) {
      console.warn('[TopBar] beta is not a valid number.', { beta });
    }
    if (!Number.isFinite(k) || Number.isNaN(k)) {
      console.warn('[TopBar] k is not a valid number.', { k });
    }
  }

  // PDF Export Function - Captures and exports all dashboard data
  const exportToPDF = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);

    // When a single analysis route is open the other five panels are `display: none`.
    // The report embeds a figure captured from this element, so revealing them for the
    // duration of the capture keeps the export identical to the landing view.
    const rootRef = topBarContentRef.current?.closest('.belief-emergence-top-bar');
    const revealedForExport = route !== LANDING_ROUTE;
    if (revealedForExport && rootRef instanceof HTMLElement) {
      rootRef.classList.add('is-exporting');
    }

    try {
      // Export is text-first and embeds Unicode-capable fonts inside jsPDF (no UI changes).
      await exportBehavioralDynamicsReport({
        fileStem: 'TopBar-Export',
        documentSubtitle: 'TOPBAR PDF EXPORT',
        reportSubtitle: 'Exported from TopBar',
        zValue,
        phiValue,
        interpretation,
        presetName,
        params,
        structuralBase,
        phiComponents,
        alpha,
        beta,
        k,
        analytics,
        panelStats,
        panelData,
        scenarioA,
        scenarioB,
        shareUrl: (() => {
          try {
            return window.location.href;
          } catch {
            return undefined;
          }
        })(),
        captureSelector: '.belief-emergence-top-bar',
        style: { showRules: false },
      });

    } catch (error) {
      console.error('PDF export failed:', error);
      const message = error instanceof Error ? error.message : String(error);
      alert(`PDF export failed. ${message}`);
    } finally {
      if (revealedForExport && rootRef instanceof HTMLElement) {
        rootRef.classList.remove('is-exporting');
      }
      setIsExportingPdf(false);
    }
  };

  const TOPBAR_APP_TITLE = 'INTERACTIVE VISUAL DIAGNOSTICS';
  const FORMULA_DISPLAY_TITLE_LINE_1 = 'MATHEMATICAL CORE OF BELIEF EMERGENCE';
  const FORMULA_DISPLAY_TITLE_LINE_2 = 'Canonical Z Formula, Φ Decomposition, and Sensitivity Diagnostics';

  // All values derived from canonical props - no model recomputation
  const {
    exponentialFactor,
    effects: { amplifyingEffects, suppressingEffects, netEffect },
    sensitivities: {
      structuralX,
      structuralY,
      phiInExpIsClamped,
      dZ_dPhi,
      dZ_dX,
      dZ_dY,
      sensitivityNorm,
      structuralSensitivity,
      modifierSensitivity,
      mostSensitiveTo,
      progress: sensitivityProgress
    },
    information: {
      localEntropyHz,
      localComplexity01,
      phiStrength01,
      netEffectStrength01,
      emergenceIndex,
      progress: infoProgress
    },
    componentStats: { structuralMean, amplifierMean, suppressorMean }
  } = analytics;

  const diagnosticsStatus: 'good' | 'warning' | 'poor' = (() => {
    if (phiInExpIsClamped) return 'poor';
    if (panelStats && extrapolationWarnings.length > 0) return 'warning';
    return 'good';
  })();

  // This project forbids JSX inline styles. We still need dynamic bar fills (CSS custom properties),
  // so we set CSS variables imperatively based on data-* attributes after each render.
  useLayoutEffect(() => {
    const root = topBarContentRef.current;
    if (!root) return;

    const safeNumber = (raw: string | undefined, fallback: number): number => {
      const n = raw == null ? NaN : Number(raw);
      return Number.isFinite(n) ? n : fallback;
    };

    // Opacity
    root.style.setProperty('--content-opacity', String(safeNumber(String(opacity), 1)));

    // Progress mini bars
    root.querySelectorAll<HTMLElement>('.progress-mini[data-value]').forEach((el) => {
      el.style.setProperty('--value', String(safeNumber(el.dataset.value, 0)));
    });

    // Metric bars
    root.querySelectorAll<HTMLElement>('.metric-bar[data-progress]').forEach((el) => {
      el.style.setProperty('--progress', String(safeNumber(el.dataset.progress, 0)));
    });

    // Gradient fills expect percent values (0..100)
    root.querySelectorAll<HTMLElement>('.gradient-fill[data-progress]').forEach((el) => {
      el.style.setProperty('--progress', String(safeNumber(el.dataset.progress, 0)));
    });

    // Card indicators
    root.querySelectorAll<HTMLElement>('.card-indicator[data-level]').forEach((el) => {
      el.style.setProperty('--level', String(safeNumber(el.dataset.level, 0)));
    });
  });

  return (
    <>
      {/* BOTTOM LEFT TITLE - OUTSIDE OF TOPBAR CONTAINER */}
      <div className="topbar-bottom-title">
        <div className="topbar-bottom-title-text">
          <span className="line-1">{FORMULA_DISPLAY_TITLE_LINE_1}</span>
          <span className="line-2">{FORMULA_DISPLAY_TITLE_LINE_2}</span>
        </div>
      </div>

      <div className="belief-emergence-top-bar">
        {/* TOPBAR TITLE - LEFT ALIGNED ABOVE RAINBOW */}
        <div className="topbar-title">
          <div className="topbar-title-text">{TOPBAR_APP_TITLE}</div>

          {onToggleSurface3d && (
            <button
              className={`topbar-surface3d-toggle ${surface3dEnabled ? 'is-on' : 'is-off'}`}
              type="button"
              onClick={onToggleSurface3d}
              {...surfaceToggleAria}
              aria-label="Toggle 3D response surface"
              title="Toggle 3D response surface"
            >
              <span className="topbar-surface3d-toggle-label">3D SURFACE</span>
              <span className="topbar-surface3d-toggle-state">{surface3dEnabled ? 'ON' : 'OFF'}</span>
            </button>
          )}
        </div>

      {/* PDF EXPORT BUTTON - SEPARATE CONTAINER */}
      <div className="pdf-export-container">
        <button 
          className="pdf-export-button"
          type="button"
          onClick={exportToPDF}
          disabled={isExportingPdf}
          title="Export dashboard data to PDF"
        >
          <span className="pdf-export-icon">📄</span>
          <span className="pdf-export-text">{isExportingPdf ? 'EXPORTING…' : 'EXPORT PDF'}</span>
        </button>
        <button
          className="pdf-export-button"
          type="button"
          onClick={() => {
            if (!panelData || panelData.length === 0) return;
            const headers = ['iso3','year','X','Y','Z','C','M','T','D','G','E','S','R'];
            const rows = panelData.map(r => [
              r.iso3, r.year, r.X, r.Y, r.Z, r.C, r.M, r.T, r.D, r.G, r.E, r.S, r.R,
            ] as (string | number)[]);
            downloadCsv('belief_emergence_panel_data.csv', headers, rows);
          }}
          disabled={!panelData || panelData.length === 0}
          title="Download panel data as CSV"
          style={{ marginLeft: 6 }}
        >
          <span className="pdf-export-icon">⬇</span>
          <span className="pdf-export-text">CSV</span>
        </button>
        <button
          className="pdf-export-button"
          type="button"
          onClick={toggleRovingTabindex}
          title={`Keyboard navigation (roving tabindex): ${rovingTabindex ? 'ON' : 'OFF'}`}
          aria-pressed={rovingTabindex}
          style={{ marginLeft: 6, minWidth: 'auto', paddingLeft: 8, paddingRight: 8 }}
        >
          <span style={{ fontSize: '1.05em' }}>⌨</span>
        </button>
      </div>

      {/* SHARE + SCENARIO COMPARE (A/B) */}
      <div className="scenario-compare-container" aria-label="Scenario compare controls">
        <button className="scenario-btn" onClick={copyShareLink} title="Copy shareable link to clipboard">
          <span>🔗</span> LINK
        </button>

        <div className="scenario-divider" aria-hidden="true" />

        <button className="scenario-btn" onClick={() => captureScenario('A')} title="Capture current state as Scenario A">
          <span>📸</span> CAPTURE A
        </button>
        <button className="scenario-btn" onClick={() => captureScenario('B')} title="Capture current state as Scenario B">
          <span>📸</span> CAPTURE B
        </button>

        <button className="scenario-btn subtle" onClick={() => copyScenarioLink('A')} disabled={!scenarioA} title="Copy Scenario A link to clipboard">
          <span>📋</span> COPY A
        </button>
        <button className="scenario-btn subtle" onClick={() => copyScenarioLink('B')} disabled={!scenarioB} title="Copy Scenario B link to clipboard">
          <span>📋</span> COPY B
        </button>

        <button className="scenario-btn subtle" onClick={() => applyScenario(scenarioA)} disabled={!scenarioA} title="Apply Scenario A parameters">
          <span>✓</span> APPLY A
        </button>
        <button className="scenario-btn subtle" onClick={() => applyScenario(scenarioB)} disabled={!scenarioB} title="Apply Scenario B parameters">
          <span>✓</span> APPLY B
        </button>

        <button className="scenario-btn subtle" onClick={clearScenarios} disabled={!scenarioA && !scenarioB} title="Clear all captured scenarios">
          <span>🗑️</span> CLEAR
        </button>

        <button
          className="scenario-btn subtle"
          onClick={() => setShowScenarioDetails((v) => !v)}
          disabled={!scenarioA && !scenarioB}
          title="View detailed comparison"
          aria-haspopup="dialog"
        >
          <span>📊</span> COMPARE
        </button>

        <div className="scenario-metrics" aria-label="Scenario deltas">
          <div className="scenario-metric">
            <span className="scenario-metric-label">ΔZ</span>
            <span className="scenario-metric-value">
              {scenarioDelta ? formatNumeric(scenarioDelta.dZ, 3) : '—'}
            </span>
          </div>
          <div className="scenario-metric">
            <span className="scenario-metric-label">ΔΦ</span>
            <span className="scenario-metric-value">
              {scenarioDelta ? formatNumeric(scenarioDelta.dPhi, 4) : '—'}
            </span>
          </div>
        </div>
      </div>

      {showScenarioDetails && comparisonMode && (
        <div className="scenario-details-panel" role="dialog" aria-label="Scenario compare details">
          <div className="scenario-details-header">
            <div className="scenario-details-title">
              {comparisonMode === 'A-vs-B' && 'Scenario A vs B'}
              {comparisonMode === 'A-vs-Current' && 'Scenario A vs Current'}
              {comparisonMode === 'B-vs-Current' && 'Scenario B vs Current'}
              {' — Parameter Comparison'}
            </div>
            <button className="scenario-details-close" onClick={() => setShowScenarioDetails(false)} title="Close details">
              ✕
            </button>
          </div>

          <div className="scenario-details-subtitle">
            {comparisonMode === 'A-vs-B' && (
              <>
                A: <span className="scenario-details-tag">{scenarioA?.presetName ?? 'Manual'}</span>
                <span className="scenario-details-spacer" />
                B: <span className="scenario-details-tag">{scenarioB?.presetName ?? 'Manual'}</span>
              </>
            )}
            {comparisonMode === 'A-vs-Current' && (
              <>
                A: <span className="scenario-details-tag">{scenarioA?.presetName ?? 'Manual'}</span>
                <span className="scenario-details-spacer" />
                Current: <span className="scenario-details-tag scenario-details-tag-live">🔄 Live</span>
              </>
            )}
            {comparisonMode === 'B-vs-Current' && (
              <>
                B: <span className="scenario-details-tag">{scenarioB?.presetName ?? 'Manual'}</span>
                <span className="scenario-details-spacer" />
                Current: <span className="scenario-details-tag scenario-details-tag-live">🔄 Live</span>
              </>
            )}
          </div>

          <div className="scenario-details-info">
            <span className="scenario-details-info-icon">💡</span> 
            {comparisonMode === 'A-vs-B' && 'Comparing two captured scenarios.'}
            {(comparisonMode === 'A-vs-Current' || comparisonMode === 'B-vs-Current') && 'Live comparison — values update as you adjust parameters.'}
            {' ΔZ and ΔΦ represent the change in belief emergence metrics.'}
          </div>

          <div className="scenario-details-metrics">
            <div className="scenario-details-metric">
              <span>ΔZ (Belief Change)</span>
              <strong>{formatNumeric(scenarioDelta?.dZ ?? NaN, 3)}</strong>
            </div>
            <div className="scenario-details-metric">
              <span>ΔΦ (Latent Change)</span>
              <strong>{formatNumeric(scenarioDelta?.dPhi ?? NaN, 4)}</strong>
            </div>
          </div>

          <div className="scenario-details-table" role="table" aria-label="Parameter delta table">
            <div className="scenario-details-row header" role="row">
              <div role="columnheader">Param</div>
              <div role="columnheader">
                {comparisonMode === 'A-vs-B' && 'A'}
                {comparisonMode === 'A-vs-Current' && 'A'}
                {comparisonMode === 'B-vs-Current' && 'B'}
              </div>
              <div role="columnheader">
                {comparisonMode === 'A-vs-B' && 'B'}
                {comparisonMode === 'A-vs-Current' && 'Current'}
                {comparisonMode === 'B-vs-Current' && 'Current'}
              </div>
              <div role="columnheader">Δ</div>
            </div>

            {scenarioParamRows.map((r) => (
              <div className="scenario-details-row" role="row" key={String(r.key)}>
                <div role="cell" className="scenario-details-key">{String(r.key)}</div>
                <div role="cell">{formatNumeric(r.a, 4)}</div>
                <div role="cell">{formatNumeric(r.b, 4)}</div>
                <div role="cell" className={r.d >= 0 ? 'scenario-details-delta pos' : 'scenario-details-delta neg'}>
                  {formatNumeric(r.d, 4)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* OPACITY TOGGLE - MINIMAL RIGHT ALIGNED */}
      <div className="opacity-toggle-container">
        <div className="opacity-toggle-track">
          <div className="opacity-value">{Math.round(opacity * 100)}%</div>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.1"
            value={opacity}
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
            className="opacity-slider"
            aria-label="TopBar opacity control"
          />
          <div className="opacity-label">OPACITY</div>
        </div>
      </div>

      <div
        className={`top-bar-content${isAnalysisRoute(route) ? ' is-routed' : ''}`}
        ref={topBarContentRef}
        data-route={route}
      >
        
        {/* SECTION 1: COMPONENT ANALYSIS */}
        <div className={panelClass('component-analysis', 'component-analysis-panel')}>
          <div className="panel-header">
            <h3>COMPONENT ANALYSIS</h3>
            <div className="model-fit-indicator">
              <span>
                {panelStats
                  ? `Panel N = ${panelStats.totalRows}`
                  : `Z = ${formatNumeric(zValue, 3)}`}
              </span>
            </div>
          </div>
          
          <div className="component-breakdown">
            <div className="component-group structural">
              <div className="group-header">
                <span>STRUCTURAL FOUNDATIONS</span>
                <span className="group-mean">{formatNumeric(structuralMean, 3)}</span>
              </div>
              <div className="component-items">
                <div className="component-item">
                  <span>X → Settlement (urban, infrastructure)</span>
                  <span>{formatNumeric(params.X, 3)}</span>
                  <div className="progress-mini" data-value={progressFromRange('X', params.X)}></div>
                </div>
                <div className="component-item">
                  <span>Y → Inequality (stratification, barriers)</span>
                  <span>{formatNumeric(params.Y, 3)}</span>
                  <div className="progress-mini" data-value={progressFromRange('Y', params.Y)}></div>
                </div>
                <div className="component-item">
                  <span>α,β → Sensitivity parameters</span>
                  <span>{formatNumeric(alpha, 3)}, {formatNumeric(beta, 3)}</span>
                  <div className="progress-mini" data-value={(alpha + beta) / 2}></div>
                </div>
              </div>
            </div>
            
            <div className="component-group amplifier">
              <div className="group-header">
                <span>SYMBOLIC AMPLIFIERS</span>
                <span className="group-mean">{formatNumeric(amplifierMean, 3)}</span>
              </div>
              <div className="component-items">
                <div className="component-item">
                  <span>C → Cultural intensity</span>
                  <span>{formatNumeric(params.C, 3)}</span>
                  <div className="progress-mini" data-value={progressFromRange('C', params.C)}></div>
                </div>
                <div className="component-item">
                  <span>M → Media/religious influence</span>
                  <span>{formatNumeric(params.M, 3)}</span>
                  <div className="progress-mini" data-value={progressFromRange('M', params.M)}></div>
                </div>
                <div className="component-item">
                  <span>T → Historical trauma</span>
                  <span>{formatNumeric(params.T, 3)}</span>
                  <div className="progress-mini" data-value={progressFromRange('T', params.T)}></div>
                </div>
                <div className="component-item">
                  <span>D → Social atomization</span>
                  <span>{formatNumeric(params.D, 3)}</span>
                  <div className="progress-mini" data-value={progressFromRange('D', params.D)}></div>
                </div>
                <div className="component-item">
                  <span>G → Redistribution capacity</span>
                  <span>{formatNumeric(params.G, 3)}</span>
                  <div className="progress-mini" data-value={progressFromRange('G', params.G)}></div>
                </div>
              </div>
            </div>
            
            <div className="component-group suppressor">
              <div className="group-header">
                <span>SYSTEMIC SUPPRESSORS</span>
                <span className="group-mean">{formatNumeric(suppressorMean, 3)}</span>
              </div>
              <div className="component-items">
                <div className="component-item">
                  <span>E → Education level</span>
                  <span>{formatNumeric(params.E, 3)}</span>
                  <div className="progress-mini" data-value={progressFromRange('E', params.E)}></div>
                </div>
                <div className="component-item">
                  <span>S → Social support</span>
                  <span>{formatNumeric(params.S, 3)}</span>
                  <div className="progress-mini" data-value={progressFromRange('S', params.S)}></div>
                </div>
                <div className="component-item">
                  <span>R → Economic welfare</span>
                  <span>{formatNumeric(params.R, 3)}</span>
                  <div className="progress-mini" data-value={progressFromRange('R', params.R)}></div>
                </div>
              </div>
            </div>
            
            <div className="component-group mathematical">
              <div className="group-header">
                <span>MATHEMATICAL CORE</span>
                <span className="group-mean">{formatNumeric(zValue, 3)}</span>
              </div>
              <div className="component-items">
                <div className="component-item">
                  <span>Base (X^α · Y^β)</span>
                  <span>{formatNumeric(structuralBase, 3)}</span>
                  <div className="progress-mini" data-value={structuralBase}></div>
                </div>
                <div className="component-item">
                  <span>Net effect (Φ⁺ − Φ⁻)</span>
                  <span>{formatNumeric(netEffect, 3)}</span>
                  <div className="progress-mini" data-value={Math.abs(netEffect) / 10}></div>
                </div>
                <div className="component-item">
                  <span>Exp e^(Φ)</span>
                  <span>{formatNumeric(exponentialFactor, 3)}</span>
                  <div className="progress-mini" data-value={Math.min(exponentialFactor / 10, 1)}></div>
                </div>
                <div className="component-item">
                  <span>Z (model score; (0,1) clipped)</span>
                  <span>{formatNumeric(zValue, 3)}</span>
                  <div className="progress-mini" data-value={zValue}></div>
                </div>
              </div>
            </div>
            
            <div className="component-group validation">
              <div className="group-header">
                <span>DIAGNOSTICS</span>
                <span className="group-mean">{panelPercentile == null ? '—' : `P${formatNumeric(panelPercentile, 0)}`}</span>
              </div>
              <div className="component-items">
                <div className="component-item">
                  <span>Φ exp clamp</span>
                  <span>{phiInExpIsClamped ? 'CLAMPED' : 'OK'}</span>
                  <div className="progress-mini" data-value={phiInExpIsClamped ? 1 : 0}></div>
                </div>
                <div className="component-item">
                  <span>Panel percentile</span>
                  <span>{panelPercentile == null ? '—' : `P${formatNumeric(panelPercentile, 1)}`}</span>
                  <div className="progress-mini" data-value={panelPercentile == null ? 0 : clamp(panelPercentile / 100, 0, 1)}></div>
                </div>
                <div className="component-item">
                  <span>Extrapolation</span>
                  <span>{panelStats ? (extrapolationWarnings.length === 0 ? 'Within ranges' : `Outside (${extrapolationWarnings.length})`) : '—'}</span>
                  <div className="progress-mini" data-value={panelStats ? clamp(extrapolationWarnings.length / (extrapolationWarnings.length + 1), 0, 1) : 0}></div>
                </div>
                <div className="component-item">
                  <span>Sensitivity norm</span>
                  <span>{formatNumeric(sensitivityNorm, 4)}</span>
                  <div className="progress-mini" data-value={clamp(sensitivityNorm / (sensitivityNorm + 1), 0, 1)}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: FIELD DYNAMICS ANALYSIS */}
        <div className={panelClass('field-dynamics', 'field-dynamics-panel')}>
          <div className="panel-header">
            <h3>Φ FIELD DYNAMICS</h3>
            <div className="field-vector-display">
              <div className="vector-magnitude">{formatNumeric(phiValue, 3)}</div>
              <div className="vector-angle">net effect {formatNumeric(netEffect, 3)}</div>
            </div>
          </div>
          
          <div className="field-metrics-grid">
            <div className="metric-card">
              <div className="metric-label">Baseline</div>
              <div className="metric-value">{formatNumeric(phiComponents.baseline, 3)}</div>
              <div className="metric-bar" data-progress={Math.min(1, Math.abs(phiComponents.baseline))}></div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Main Effects</div>
              <div className="metric-value">{formatNumeric(phiComponents.mainEffects, 3)}</div>
              <div className="metric-bar" data-progress={Math.min(1, Math.abs(phiComponents.mainEffects))}></div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Interactions</div>
              <div className="metric-value">{formatNumeric(phiComponents.interactions, 3)}</div>
              <div className="metric-bar" data-progress={Math.min(1, Math.abs(phiComponents.interactions))}></div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Quadratic</div>
              <div className="metric-value">{formatNumeric(phiComponents.quadratic, 3)}</div>
              <div className="metric-bar" data-progress={Math.min(1, Math.abs(phiComponents.quadratic))}></div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Amplifying</div>
              <div className="metric-value">{formatNumeric(amplifyingEffects, 3)}</div>
              <div className="metric-bar" data-progress={Math.min(1, Math.abs(amplifyingEffects))}></div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Suppressing</div>
              <div className="metric-value">{formatNumeric(suppressingEffects, 3)}</div>
              <div className="metric-bar" data-progress={Math.min(1, Math.abs(suppressingEffects))}></div>
            </div>
          </div>
        </div>

        {/* SECTION 3: STATISTICAL ANALYSIS TABLE */}
        <div className={panelClass('statistical-analysis', 'statistical-analysis-panel')}>
          <div className="panel-header">
            <h3>STATISTICAL ANALYSIS</h3>
            <div className="z-value-indicator">{formatNumeric(zValue, 4)}</div>
          </div>
          
          <div className="analysis-table-container">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Value</th>
                  <th>CI 95%</th>
                  <th>Inference</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Z (model score)</td>
                  <td className="value-primary">{formatNumeric(zValue, 4)}</td>
                  <td>—</td>
                  <td>{panelStats ? 'Panel-grounded (see below)' : 'Requires panel distribution'}</td>
                </tr>

                <tr>
                  <td>Panel percentile (Z)</td>
                  <td>{panelPercentile == null ? '—' : `P${formatNumeric(panelPercentile, 1)}`}</td>
                  <td>—</td>
                  <td>{panelPercentile == null ? 'Requires panel distribution' : 'Rank within panel Z values'}</td>
                </tr>

                <tr>
                  <td>Panel mean (μ)</td>
                  <td>{panelStats ? formatNumeric(panelStats.zDistribution.mean, 4) : '—'}</td>
                  <td>
                    {panelMeanCI95 == null
                      ? '—'
                      : `[${formatNumeric(panelMeanCI95[0], 4)}, ${formatNumeric(panelMeanCI95[1], 4)}]`}
                  </td>
                  <td>{panelMeanCI95 == null ? 'Requires panel std + N' : 'Approx. 95% CI for panel mean'}</td>
                </tr>

                <tr>
                  <td>Extrapolation</td>
                  <td>{panelStats ? (extrapolationWarnings.length === 0 ? 'Within panel ranges' : `Outside panel ranges (${extrapolationWarnings.length})`) : '—'}</td>
                  <td>—</td>
                  <td>
                    {panelStats
                      ? (extrapolationWarnings.length === 0
                        ? 'No range violations detected'
                        : `${extrapolationWarnings.slice(0, 2).join('; ')}${extrapolationWarnings.length > 2 ? ` (+${extrapolationWarnings.length - 2} more)` : ''}`)
                      : 'Requires panel ranges'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 4: SENSITIVITY ANALYSIS */}
        <div className={panelClass('sensitivity-analysis', 'surface-analysis-panel')}>
          <div className="panel-header">
            <h3>SENSITIVITY ANALYSIS</h3>
            <div className="gradient-display">
              <span>Sensitivity norm = {formatNumeric(sensitivityNorm, 4)}</span>
            </div>
          </div>
          
          <div className="surface-metrics-grid">
            <div className="metric-card">
              <div className="metric-label">∂Z/∂X (struct)</div>
              <div className="metric-value">{formatNumeric(dZ_dX, 6)}</div>
              <div className="metric-bar" data-progress={sensitivityProgress.dZ_dX}></div>
            </div>
            <div className="metric-card">
              <div className="metric-label">∂Z/∂Y (struct)</div>
              <div className="metric-value">{formatNumeric(dZ_dY, 6)}</div>
              <div className="metric-bar" data-progress={sensitivityProgress.dZ_dY}></div>
            </div>
            <div className="metric-card">
              <div className="metric-label">∂Z/∂Φ</div>
              <div className="metric-value">{formatNumeric(dZ_dPhi, 6)}</div>
              <div className="metric-bar" data-progress={sensitivityProgress.dZ_dPhi}></div>
            </div>
            <div className="metric-card">
              <div className="metric-label">X (struct)</div>
              <div className="metric-value">{formatNumeric(structuralX, 4)}</div>
              <div className="metric-bar" data-progress={sensitivityProgress.structuralX}></div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Y (struct)</div>
              <div className="metric-value">{formatNumeric(structuralY, 4)}</div>
              <div className="metric-bar" data-progress={sensitivityProgress.structuralY}></div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Most sensitive</div>
              <div className="metric-value">{mostSensitiveTo}</div>
              <div className="metric-bar" data-progress={1}></div>
            </div>
          </div>
          
          <div className="gradient-summary">
            <h4>SENSITIVITY SUMMARY</h4>
            <div className="gradient-item">
              <span className="gradient-label">Structural (max)</span>
              <div className="gradient-bar">
                <div className="gradient-fill" data-progress={sensitivityProgress.structuralSensitivity * 100}></div>
                <span className="gradient-value">{formatNumeric(structuralSensitivity, 6)}</span>
              </div>
            </div>
            <div className="gradient-item">
              <span className="gradient-label">Modifiers (Φ)</span>
              <div className="gradient-bar">
                <div className="gradient-fill" data-progress={sensitivityProgress.modifierSensitivity * 100}></div>
                <span className="gradient-value">{formatNumeric(modifierSensitivity, 6)}</span>
              </div>
            </div>
            <div className="gradient-item">
              <span className="gradient-label">Φ clamp</span>
              <div className="gradient-bar">
                <div className="gradient-fill" data-progress={sensitivityProgress.phiClamp * 100}></div>
                <span className="gradient-value">{phiInExpIsClamped ? 'CLAMPED' : 'OK'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 5: EMERGENCE & INFORMATION THEORY */}
        <div className={panelClass('emergence-analysis', 'emergence-panel')}>
          <div className="panel-header">
            <h3>EMERGENCE ANALYSIS</h3>
            <div className="emergence-index">EI = {formatNumeric(emergenceIndex, 3)}</div>
          </div>

          <div className="gradient-display">
            <span>Z-based terms use ε-clamp: Z ∈ {structuralBandLabel}</span>
          </div>
          
          <div className="information-metrics-grid">
            <div className="metric-card">
              <div className="metric-label">Local Entropy H(Z)</div>
              <div className="metric-value">{formatNumeric(localEntropyHz, 4)}</div>
              <div className="metric-bar" data-progress={infoProgress.localEntropy}></div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Local Complexity</div>
              <div className="metric-value">{formatNumeric(localComplexity01, 4)}</div>
              <div className="metric-bar" data-progress={infoProgress.localComplexity}></div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Φ Strength</div>
              <div className="metric-value">{formatNumeric(phiStrength01, 4)}</div>
              <div className="metric-bar" data-progress={infoProgress.phiStrength}></div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Net Effect</div>
              <div className="metric-value">{formatNumeric(netEffectStrength01, 4)}</div>
              <div className="metric-bar" data-progress={infoProgress.netEffectStrength}></div>
            </div>
          </div>
          
          <div className="gradient-summary">
            <h4>EMERGENCE COMPONENTS</h4>
            <div className="gradient-item">
              <span className="gradient-label">Local Entropy</span>
              <div className="gradient-bar">
                <div className="gradient-fill" data-progress={infoProgress.localEntropy * 100}></div>
                <span className="gradient-value">{formatNumeric(infoProgress.localEntropy * 100, 1)}%</span>
              </div>
            </div>
            <div className="gradient-item">
              <span className="gradient-label">Local Complexity</span>
              <div className="gradient-bar">
                <div className="gradient-fill" data-progress={infoProgress.localComplexity * 100}></div>
                <span className="gradient-value">{formatNumeric(infoProgress.localComplexity * 100, 1)}%</span>
              </div>
            </div>
            <div className="gradient-item">
              <span className="gradient-label">Φ Strength</span>
              <div className="gradient-bar">
                <div className="gradient-fill" data-progress={infoProgress.phiStrength * 100}></div>
                <span className="gradient-value">{formatNumeric(infoProgress.phiStrength * 100, 1)}%</span>
              </div>
            </div>
            <div className="gradient-item">
              <span className="gradient-label">Net Effect</span>
              <div className="gradient-bar">
                <div className="gradient-fill" data-progress={infoProgress.netEffectStrength * 100}></div>
                <span className="gradient-value">{formatNumeric(infoProgress.netEffectStrength * 100, 1)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 6: MODEL PERFORMANCE & DIAGNOSTICS */}
        <div className={panelClass('model-diagnostics', 'model-performance-panel')}>
          <div className="panel-header">
            <h3>MODEL DIAGNOSTICS</h3>
            <div className="performance-status">
              <span className={diagnosticsStatus === 'good' ? 'status-good' : diagnosticsStatus === 'warning' ? 'status-warning' : 'status-poor'}>
                {diagnosticsStatus === 'good' ? 'IN-RANGE' : diagnosticsStatus === 'warning' ? 'EXTRAPOLATING' : 'UNSTABLE'}
              </span>
            </div>
          </div>
          
          <div className="diagnostic-grid">
            <div className="diagnostic-card">
              <div className="card-header">Panel percentile (Z)</div>
              <div className="card-value">{panelPercentile == null ? '—' : `P${formatNumeric(panelPercentile, 0)}`}</div>
              <div className="card-indicator" data-level={panelPercentile == null ? 0 : clamp(panelPercentile / 100, 0, 1)}>
                <div className="indicator-fill"></div>
              </div>
            </div>
            
            <div className="diagnostic-card">
              <div className="card-header">Extrapolation count</div>
              <div className="card-value">{panelStats ? `${extrapolationWarnings.length}` : '—'}</div>
              <div className="card-indicator" data-level={panelStats ? clamp(extrapolationWarnings.length / (extrapolationWarnings.length + 1), 0, 1) : 0}>
                <div className="indicator-fill"></div>
              </div>
            </div>
            
            <div className="diagnostic-card">
              <div className="card-header">Stability</div>
              <div className="card-value">{phiInExpIsClamped ? 'CLAMP' : 'OK'}</div>
              <div className="card-indicator" data-level={phiInExpIsClamped ? 1 : 0}>
                <div className="indicator-fill"></div>
              </div>
            </div>
            
            <div className="diagnostic-card">
              <div className="card-header">Sensitivity norm</div>
              <div className="card-value">{formatNumeric(sensitivityNorm, 3)}</div>
              <div className="card-indicator" data-level={clamp(sensitivityNorm / (sensitivityNorm + 1), 0, 1)}>
                <div className="indicator-fill"></div>
              </div>
            </div>
          </div>
          
          <div className="snapshot-display">
            <div className="parameter-snapshot">
              <div className="snapshot-label">Parameter Snapshot</div>
              <div className="snapshot-values">
                <span>α = {formatNumeric(alpha, 3)}</span>
                <span>β = {formatNumeric(beta, 3)}</span>
              </div>
            </div>
            
            <div className="interpretation-display">
              <div className="interpretation-label">{interpretation.label}</div>
              <div className="interpretation-message">{interpretation.message}</div>
            </div>
          </div>
        </div>

      </div>
    </div>
    </>
  );
};

export default TopBar;
