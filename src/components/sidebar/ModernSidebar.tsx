import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { BookOpen, Sparkles, Globe } from 'lucide-react'
import ContributionPanel from '../contributions/ContributionPanel'
import { computePhiContributions } from '../../utils/contributions'
import type { BeliefParameters } from '../../types'
import { formatNumeric } from '../../utils/formatNumeric'
import { PANEL_X_MAX, PANEL_X_MIN, PANEL_Y_MAX, PANEL_Y_MIN, STRUCTURAL_MAX, STRUCTURAL_MIN } from '../../utils/modelContract'
import { useDataContext } from '../../contexts/DataContext'
import { standardizeCulturalIntensity } from '../../utils/validation/panelPredict'
import Tooltip from '../documentation/Tooltip'
import PresetModal, { type PresetData } from './PresetModal'
import { InlineMath } from 'react-katex'
import 'katex/dist/katex.min.css'
import './ModernSidebar.css'

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function countDecimalsFromStep(step: string): number {
  // Handles: "1", "0.01", "0.005", "2.0".
  const normalized = step.trim();
  const dot = normalized.indexOf('.');
  if (dot === -1) return 0;
  return normalized.length - dot - 1;
}

function roundToStep(value: number, step: number, decimals: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
  const snapped = Math.round(value / step) * step;
  // toFixed guards against 0.30000000000004 style drift.
  return Number(snapped.toFixed(decimals));
}

function normalizeCountryName(value: string): string {
  return value.trim().toLowerCase();
}

function computePresetMeansFromPanel(
  panelData: Array<{
    country_name: string;
    year: number;
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
  }>,
  presetCountryName: string,
): {
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
} | null {
  const target = normalizeCountryName(presetCountryName);
  const filtered = panelData.filter((r) => normalizeCountryName(r.country_name) === target);
  if (filtered.length === 0) return null;

  const byYear = new Map<number, { n: number; X: number; Y: number; C: number; M: number; T: number; D: number; G: number; E: number; S: number; R: number }>();

  for (const r of filtered) {
    if (!Number.isFinite(r.year)) continue;
    const cur = byYear.get(r.year) ?? { n: 0, X: 0, Y: 0, C: 0, M: 0, T: 0, D: 0, G: 0, E: 0, S: 0, R: 0 };
    cur.n += 1;
    cur.X += r.X;
    cur.Y += r.Y;
    cur.C += r.C;
    cur.M += r.M;
    cur.T += r.T;
    cur.D += r.D;
    cur.G += r.G;
    cur.E += r.E;
    cur.S += r.S;
    cur.R += r.R;
    byYear.set(r.year, cur);
  }

  const years = Array.from(byYear.values());
  if (years.length === 0) return null;

  let X = 0;
  let Y = 0;
  let C = 0;
  let M = 0;
  let T = 0;
  let D = 0;
  let G = 0;
  let E = 0;
  let S = 0;
  let R = 0;

  for (const y of years) {
    X += y.X / y.n;
    Y += y.Y / y.n;
    C += y.C / y.n;
    M += y.M / y.n;
    T += y.T / y.n;
    D += y.D / y.n;
    G += y.G / y.n;
    E += y.E / y.n;
    S += y.S / y.n;
    R += y.R / y.n;
  }

  const denom = years.length;

  return {
    X: X / denom,
    Y: Y / denom,
    C: standardizeCulturalIntensity(C / denom),
    M: M / denom,
    T: T / denom,
    D: D / denom,
    G: G / denom,
    E: E / denom,
    S: S / denom,
    R: R / denom,
  };
}

// SVG Icons Components
const StructuralIcon = () => (
  <svg className="section-icon" width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
    <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
    <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
    <circle cx="12" cy="7" r="1.5" fill="currentColor"/>
    <circle cx="6" cy="10" r="1" fill="currentColor" opacity="0.7"/>
    <circle cx="18" cy="10" r="1" fill="currentColor" opacity="0.7"/>
  </svg>
)

type MotionGate = {
  motionEnabled: boolean;
};

const AmplifierIcon = ({ motionEnabled }: MotionGate) => (
  <svg className="section-icon" width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="currentColor" fillOpacity="0.2"/>
    <circle cx="7" cy="8" r="1" fill="currentColor" opacity="0.8">
      {motionEnabled && <animate attributeName="r" values="1;1.5;1" dur="2s" repeatCount="indefinite"/>}
    </circle>
    <circle cx="17" cy="6" r="0.8" fill="currentColor" opacity="0.6">
      {motionEnabled && <animate attributeName="r" values="0.8;1.3;0.8" dur="2.5s" repeatCount="indefinite"/>}
    </circle>
    <circle cx="15" cy="18" r="0.6" fill="currentColor" opacity="0.5"/>
  </svg>
)

const SuppressorIcon = () => (
  <svg className="section-icon" width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.15"/>
    <path d="M6 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="8" cy="8" r="1" fill="currentColor" opacity="0.6"/>
    <circle cx="16" cy="16" r="1" fill="currentColor" opacity="0.6"/>
  </svg>
)

interface ModernSidebarProps {
  params: BeliefParameters;
  onParameterChange: (key: keyof BeliefParameters, value: number) => void;
  onShowDocumentation: () => void;
  onShowAiInterpreter: () => void;
  onPresetSelect?: (presetName: string) => void;
}

type ParamKey = keyof BeliefParameters;

interface ToggleButtonProps {
  type?: 'button' | 'submit' | 'reset';
  className: string;
  isExpanded: boolean;
  label: string;
  title?: string;
  onClick: () => void;
  ariaControls?: string;
  withAriaExpanded?: boolean;
}

function ToggleButton({
  type,
  className,
  isExpanded,
  label,
  title,
  onClick,
  ariaControls,
  withAriaExpanded = true,
}: ToggleButtonProps) {
  return (
    <button
      type={type}
      className={`${className} sb-toggle-button`}
      {...(withAriaExpanded ? { 'aria-expanded': isExpanded } : undefined)}
      {...(ariaControls ? { 'aria-controls': ariaControls } : undefined)}
      onClick={onClick}
      title={title}
    >
      <span data-sb-toggle-label>{label}</span>
      <span data-sb-toggle-chevron aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>
    </button>
  );
}

interface SliderRowProps {
  label: string;
  paramKey: ParamKey;
  value: number;
  min: string;
  max: string;
  step: string;
  sliderClassName: string;
  ariaLabel: string;
  tooltip?: string;
  decimals: number;
  paramNameClassName?: string;
  describedById?: string;
  onParameterChange: (key: ParamKey, value: number) => void;
}

function SliderRow({
  label,
  paramKey,
  value,
  min,
  max,
  step,
  sliderClassName,
  ariaLabel,
  tooltip,
  decimals,
  paramNameClassName = 'modern-param-name',
  describedById,
  onParameterChange,
}: SliderRowProps) {
  // Deterministic a11y ids: sb-param-X, sb-param-Y, sb-param-alpha, ...
  const sliderId = `sb-param-${String(paramKey)}`;
  const labelId = `sb-label-${String(paramKey)}`;
  const tooltipHelpId = tooltip ? `sb-help-${String(paramKey)}` : undefined;
  const ariaDescribedBy = [tooltipHelpId, describedById].filter(Boolean).join(' ') || undefined;
  const minNum = Number.parseFloat(min);
  const maxNum = Number.parseFloat(max);
  const stepNum = Number.parseFloat(step);
  const stepDecimals = countDecimalsFromStep(step);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isEditing) {
      // Focus/select for fast power-user edits.
      queueMicrotask(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isEditing]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const beginEdit = () => {
    const current = roundToStep(value, stepNum, stepDecimals);
    setDraft(Number.isFinite(current) ? current.toFixed(stepDecimals) : String(value));
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setDraft('');
  };

  const commitDraft = (raw: string) => {
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || !Number.isFinite(minNum) || !Number.isFinite(maxNum) || !Number.isFinite(stepNum)) {
      cancelEdit();
      return;
    }

    const clamped = clampNumber(parsed, minNum, maxNum);
    const snapped = roundToStep(clamped, stepNum, stepDecimals);

    const currentSnapped = roundToStep(clampNumber(value, minNum, maxNum), stepNum, stepDecimals);
    if (snapped !== currentSnapped) {
      onParameterChange(paramKey, snapped);
    }
    cancelEdit();
  };

  const tryCopyValue = async () => {
    const text = formatNumeric(value, decimals);
    try {
      if (!navigator?.clipboard?.writeText) return;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 800);
    } catch {
      // Silent by design.
    }
  };

  return (
    <div className="modern-slider-group">
      <label className="modern-slider-label" htmlFor={sliderId}>
        <span id={labelId} className={paramNameClassName}>{label}</span>
        {isEditing ? (
          <input
            ref={inputRef}
            className="sb-value-input"
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            value={draft}
            aria-label={`${label} value`}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commitDraft(draft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitDraft(draft);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
              }
            }}
          />
        ) : (
          <span
            className="modern-param-value"
            role="button"
            tabIndex={0}
            data-copied={copied ? 'true' : 'false'}
            title={copied ? 'Copied' : 'Click to copy • Double-click to edit'}
            onClick={() => {
              void tryCopyValue();
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              beginEdit();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                beginEdit();
              } else if (e.key === ' ') {
                e.preventDefault();
                void tryCopyValue();
              }
            }}
          >
            {formatNumeric(value, decimals)}
          </span>
        )}
        {tooltip && (
          <Tooltip content={tooltip}>
            <span
              className="modern-tooltip"
              role="button"
              tabIndex={0}
              aria-label={`${label} help`}
              {...(tooltipHelpId ? { 'aria-describedby': tooltipHelpId } : undefined)}
            >
              ⓘ
            </span>
          </Tooltip>
        )}
        {tooltipHelpId && (
          <span id={tooltipHelpId} className="sr-value-description">
            {tooltip}
          </span>
        )}
      </label>
      <div className="modern-slider-container">
        <input
          id={sliderId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          className={sliderClassName}
          aria-label={ariaLabel}
          aria-labelledby={labelId}
          {...(ariaDescribedBy ? { 'aria-describedby': ariaDescribedBy } : undefined)}
          onChange={(e) => onParameterChange(paramKey, parseFloat(e.target.value))}
        />
      </div>
    </div>
  );
}

interface SectionShellProps {
  headerClassName: string;
  icon: ReactNode;
  title: string;
  titleId: string;
  subtitle?: string;
  rightAction?: ReactNode;
  children: ReactNode;
}

function SectionShell({ headerClassName, icon, title, titleId, subtitle, rightAction, children }: SectionShellProps) {
  return (
    <div className="modern-parameter-section">
      <div className={headerClassName}>
        {icon}
        <span id={titleId} className="modern-section-title">{title}</span>
        {subtitle && <span className="section-subtitle">{subtitle}</span>}
        {rightAction}
      </div>
      <div className="sb-section-body" role="group" aria-labelledby={titleId}>
        {children}
      </div>
    </div>
  );
}

function ModernSidebar({ params, onParameterChange, onShowDocumentation, onShowAiInterpreter, onPresetSelect }: ModernSidebarProps) {
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [showAdvancedParameters, setShowAdvancedParameters] = useState(false);
  const [showContributions, setShowContributions] = useState(false);
  const [xyTrail, setXyTrail] = useState<Array<[number, number]>>([]);
  const [motionEnabled, setMotionEnabled] = useState(true);

  const { panelData } = useDataContext();

  const structuralBandLabel = `[${STRUCTURAL_MIN.toFixed(4)}, ${STRUCTURAL_MAX.toFixed(4)}]`;
  const panelXRangeLabel = `[${PANEL_X_MIN.toFixed(2)}, ${PANEL_X_MAX.toFixed(2)}]`;
  const panelYRangeLabel = `[${PANEL_Y_MIN.toFixed(2)}, ${PANEL_Y_MAX.toFixed(2)}]`;

  const presetButtonRef = useRef<HTMLButtonElement | null>(null);
  const openerFocusRef = useRef<HTMLElement | null>(null);

  const structuralAdvancedDrawerId = 'sb-struct-advanced-drawer';
  const clamp01 = useCallback((n: number) => Math.min(1, Math.max(0, n)), []);
  const toPct = useCallback((value: number, min: number, max: number) => {
    if (max === min) return 0;
    return clamp01((value - min) / (max - min)) * 100;
  }, [clamp01]);
  const phiContribDrawerId = 'sb-phi-contrib-drawer';

  const xPct = toPct(params.X, 0, 1);
  const yPct = toPct(params.Y, -2, 4);
  const xField = clamp01(xPct / 100) * 100;
  const yField = clamp01((100 - yPct) / 100) * 100;

  // Motion budget gate: disable continuous animations when user requests reduced motion
  // or the device indicates slow updates.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const reduceMql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const slowMql = window.matchMedia('(update: slow)');

    const update = () => {
      setMotionEnabled(!(reduceMql.matches || slowMql.matches));
    };

    update();

    const add = (mql: MediaQueryList, handler: () => void) => {
      // Safari < 14 fallback: addListener/removeListener.
      if ('addEventListener' in mql) {
        mql.addEventListener('change', handler);
        return () => mql.removeEventListener('change', handler);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mql as any).addListener(handler);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return () => (mql as any).removeListener(handler);
    };

    const removeReduce = add(reduceMql, update);
    const removeSlow = add(slowMql, update);

    return () => {
      removeReduce();
      removeSlow();
    };
  }, []);

  // Trajectory history (short trail) for the X–Y field.
  useEffect(() => {
    const x = Number.isFinite(xField) ? xField : 0;
    const y = Number.isFinite(yField) ? yField : 0;

    setXyTrail((prev) => {
      const last = prev[prev.length - 1];
      if (last && Math.abs(last[0] - x) < 0.01 && Math.abs(last[1] - y) < 0.01) {
        return prev;
      }
      const next = [...prev, [x, y] as [number, number]];
      return next.length > 18 ? next.slice(next.length - 18) : next;
    });
  }, [xField, yField]);

  const trailPoints = xyTrail.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

  // Structural contour lines (isoclines) derived from α/β on normalized X and Y.
  const contourPolylines = useCallback(() => {
    const xNorm = clamp01(params.X);
    const yNorm = clamp01((params.Y + 2) / 6);

    const alpha = Math.max(0.05, Math.abs(params.alpha));
    const beta = Math.max(0.05, Math.abs(params.beta));

    // Keep fractional-power safeguards aligned with the global interior-band epsilon.
    const POW_EPS = STRUCTURAL_MIN;

    const base = Math.pow(Math.max(POW_EPS, xNorm), alpha) * Math.pow(Math.max(POW_EPS, yNorm), beta);
    const levelsRaw = [base * 0.6, base * 0.9, base * 1.2, base * 1.5];
    const levels = levelsRaw.map((l) => clamp01(l));

    const samples = 26;
    const xMin = 0.06;
    const xMax = 0.94;
    const xStep = (xMax - xMin) / (samples - 1);

    return levels.map((level) => {
      const pts: string[] = [];
      for (let i = 0; i < samples; i++) {
        const x = xMin + i * xStep;
        const denom = Math.pow(Math.max(POW_EPS, x), alpha);
        const y = Math.pow(Math.max(POW_EPS, level) / denom, 1 / beta);
        const yClamped = clamp01(y);
        const xCoord = x * 100;
        const yCoord = (1 - yClamped) * 100;
        pts.push(`${xCoord.toFixed(2)},${yCoord.toFixed(2)}`);
      }
      return pts.join(' ');
    });
  }, [clamp01, params.X, params.Y, params.alpha, params.beta]);

  const handlePresetSelect = (preset: PresetData) => {
    // Paper-aligned presets: compute mean inputs from canonical panel data.
    // This collapses scenario replication by (iso3, year) averaging, then averages across years.
    // It also prevents the historical Gini/G alias bug (wrong Y) from affecting the model.
    const derived = panelData ? computePresetMeansFromPanel(panelData, preset.name) : null;

    if (derived) {
      onParameterChange('X', derived.X);
      onParameterChange('Y', derived.Y);
      onParameterChange('C', derived.C);
      onParameterChange('M', derived.M);
      onParameterChange('T', derived.T);
      onParameterChange('D', derived.D);
      onParameterChange('G', derived.G);
      onParameterChange('E', derived.E);
      onParameterChange('S', derived.S);
      onParameterChange('R', derived.R);
    } else {
      const v = preset.values;
      onParameterChange('X', v.X);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fallbackY = (v as any).Y ?? (v as any).Gini;
      if (typeof fallbackY === 'number' && Number.isFinite(fallbackY)) {
        onParameterChange('Y', fallbackY);
      }
      onParameterChange('C', v.C);
      onParameterChange('M', v.M);
      onParameterChange('T', v.T);
      onParameterChange('D', v.D);
      onParameterChange('G', v.G);
      onParameterChange('E', v.E);
      onParameterChange('S', v.S);
      onParameterChange('R', v.R);
    }

    // Notify parent to set currentPresetName, which signals that modifiersAreStandardized=true
    onPresetSelect?.(preset.name);
  };

  useEffect(() => {
    if (isPresetModalOpen) {
      openerFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
    } else {
      // Return focus to the preset opener for predictable keyboard UX.
      presetButtonRef.current?.focus();
    }
  }, [isPresetModalOpen]);

  return (
    <aside className="modern-sidebar">
      <div className="project-header">
        <div className="project-title-subtitle">
          Bounded Nonlinear Response Surfaces for Macro-Urban Belief Emergence:
          <br />
          A Support-Aware Visual Analytics Framework
        </div>

        <div className="cover-meta" aria-hidden="true">
          <span className="cover-kicker">Spatial Macro-Social Dynamics</span>
          <span className="cover-sep">•</span>
          <span className="cover-tag">Settlement × Inequality</span>
          <span className="cover-sep">•</span>
          <span className="cover-tag">Belief as an emergent signal</span>
        </div>

        <div className="xy-field" role="img" aria-label="Settlement and inequality position">
          <svg className="xy-svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <defs>
              <radialGradient id="xyDotGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(251, 191, 36, 0.95)" />
                <stop offset="65%" stopColor="rgba(251, 191, 36, 0.22)" />
                <stop offset="100%" stopColor="rgba(251, 191, 36, 0)" />
              </radialGradient>
            </defs>

            {/* grid */}
            <g className="xy-grid" aria-hidden="true">
              {Array.from({ length: 5 }).map((_, i) => {
                const t = (i + 1) * 16.6667;
                return (
                  <g key={i}>
                    <line x1={t} y1={0} x2={t} y2={100} />
                    <line x1={0} y1={t} x2={100} y2={t} />
                  </g>
                );
              })}
            </g>

            {/* structural contours */}
            <g className="xy-contours" aria-hidden="true">
              {contourPolylines().map((points, idx) => (
                <polyline key={idx} className={`xy-contour xy-contour-${idx}`} points={points} />
              ))}
            </g>

            {/* trajectory trail */}
            {trailPoints.length > 0 && (
              <polyline className="xy-trail" points={trailPoints} aria-hidden="true" />
            )}

            {/* point + glow */}
            <circle className="xy-dot-glow" cx={xField} cy={yField} r={10} fill="url(#xyDotGlow)" />
            <circle className="xy-dot" cx={xField} cy={yField} r={2.2} />
            <circle className="xy-dot-ring" cx={xField} cy={yField} r={5.5} />
          </svg>

          <div className="xy-labels" aria-hidden="true">
            <span className="xy-x">X: {params.X.toFixed(2)}</span>
            <span className="xy-y">Y: {params.Y.toFixed(2)}</span>
          </div>
        </div>

        <div className="cover-note" aria-hidden="true">
          Drag <span className="cover-note-em">X</span> and <span className="cover-note-em">Y</span> to move the point. Advanced parameters reshape curvature.
        </div>
        
        {/* Abstract Section */}
        <div className="project-abstract">
          <details className="abstract-details">
            <summary className="abstract-summary">
              <span className="abstract-title">Abstract</span>
              <span className="abstract-summary-hint">Expand</span>
            </summary>
            <div className="abstract-content" id="sb-abstract" lang="en">
              <strong>Background.</strong> Macro-urban decision support often depends on sparse country–year evidence,
              yet comparative pipelines rarely make support limits, uncertainty, and nonlinear response
              geometry visible within the same workflow. Belief emergence is operationalized as a
              country–year composite index (<span className="nowrap"><InlineMath math="Z \in [0,1]" /></span>) derived from World Values Survey items measuring
              religiosity-related belief intensity. A support-aware bounded nonlinear framework models this
              outcome under urbanization and inequality, paired with diagnostic visual analytics, refit
              out-of-sample validation, and deterministic evidence export. The analysis uses a canonical
              panel of 23 countries (630 scenario-replicated rows, 2000–2022) that collapses to 34 unique
              country–years of complete-case support. Effective exposure is defined as{' '}
              <span className="nowrap"><InlineMath math="S=X^{\\alpha}Y^{\\beta}\\exp(\\Phi)" /></span> and mapped to the bounded outcome through{' '}
              <span className="nowrap"><InlineMath math="Z=S/(S+k)" /></span>, making transition-ridge sensitivity and
              saturation explicit. Primary claims are anchored to Tier&nbsp;A/B refit out-of-sample evidence from
              leave-one-country-out cross-validation (23 folds), while rolling-origin temporal evaluation
              (9 folds) serves as a temporal scope diagnostic. The contribution is a reproducible workflow
              making model geometry, support boundaries, and validation status auditable end-to-end.
              Interpretation remains descriptive, non-causal, and limited to the observed support.
            </div>
          </details>
        </div>
      </div>
      
      <div className="modern-parameters-wrapper">
        
        {/* Structural Factors */}
        <SectionShell
          headerClassName="modern-section-header structural"
          icon={<StructuralIcon />}
          title="STRUCTURAL FACTORS"
          titleId="sb-section-struct-title"
          rightAction={
            // Advanced toggle lives in the Structural header
            <div className="advanced-toggle-container sb-struct-toggle">
              <ToggleButton
                type="button"
                className="advanced-toggle-button"
                isExpanded={showAdvancedParameters}
                label="Advanced Parameters"
                onClick={() => setShowAdvancedParameters(!showAdvancedParameters)}
                title="Toggle advanced structural parameters (α, β, k)"
                ariaControls={structuralAdvancedDrawerId}
                withAriaExpanded
              />
            </div>
          }
        >

          {/* Structural body (X/Y always visible) */}
          <div className="sb-struct-grid">
            <div className="sb-struct-core">
              <div className="modern-parameter-group">
                <SliderRow
                  label="Settlement Level (X)"
                  paramKey="X"
                  value={params.X}
                  min="0"
                  max="1"
                  step="0.005"
                  sliderClassName="modern-slider structural"
                  ariaLabel="Settlement Level parameter"
                  tooltip="Settlement Level (X): country presets set X to an approximate country-level settlement summary. 0 = Nomadic societies / 1 = Fully urbanized."
                  decimals={2}
                  describedById="sb-note-X"
                  onParameterChange={onParameterChange}
                />

                <SliderRow
                  label="Inequality (Gini-based Y)"
                  paramKey="Y"
                  value={params.Y}
                  min="-2"
                  max="4"
                  step="0.02"
                  sliderClassName="modern-slider structural"
                  ariaLabel="Perceived Inequality parameter"
                  tooltip="Inequality (Gini-based Y): presets map country Gini values to this Y slider. -2 = Low / 0 = Moderate / 4 = Maximum disparity."
                  decimals={2}
                  describedById="sb-note-Y"
                  onParameterChange={onParameterChange}
                />
              </div>

              {/* Use the empty space under sliders: Range Map (panel bounds + current position) */}
              <div className="structural-range-map" role="note" aria-label="Structural panel bounds range map">
                <div className="structural-range-map-header">
                  <div className="structural-range-map-title">Range Map</div>
                  <div className="structural-range-map-subtitle">Panel bounds before model clamp</div>
                </div>

                {(() => {
                  const xMin = 0;
                  const xMax = 1;
                  const xOkStart = 0.4;
                  const xOkEnd = 0.9;
                  const xOut = params.X < xOkStart || params.X > xOkEnd;

                  const yMin = -2;
                  const yMax = 4;
                  const yOkStart = -1.5;
                  const yOkEnd = 3.5;
                  const yOut = params.Y < yOkStart || params.Y > yOkEnd;

                  const xValue = toPct(params.X, xMin, xMax);
                  const xOkStartPct = toPct(xOkStart, xMin, xMax);
                  const xOkEndPct = toPct(xOkEnd, xMin, xMax);

                  const yValue = toPct(params.Y, yMin, yMax);
                  const yOkStartPct = toPct(yOkStart, yMin, yMax);
                  const yOkEndPct = toPct(yOkEnd, yMin, yMax);

                  const xOkWidth = Math.max(0, xOkEndPct - xOkStartPct);
                  const yOkWidth = Math.max(0, yOkEndPct - yOkStartPct);

                  return (
                    <>
                      <div className={`structural-range-row ${xOut ? 'is-out' : 'is-in'}`}>
                        <div className="structural-range-label">X</div>
                        <svg className="structural-range-svg" viewBox="0 0 100 12" aria-hidden="true" focusable="false">
                          <rect className="structural-range-track" x="0" y="5" width="100" height="2" rx="1" />
                          <rect
                            className="structural-range-ok"
                            x={xOkStartPct}
                            y="5"
                            width={xOkWidth}
                            height="2"
                            rx="1"
                          />
                          <line className="structural-range-marker" x1={xValue} y1="1.5" x2={xValue} y2="10.5" />
                          <circle className="structural-range-dot" cx={xValue} cy="6" r="2" />
                        </svg>
                        <div className="structural-range-value">{params.X.toFixed(2)}</div>
                      </div>

                      <div className={`structural-range-row ${yOut ? 'is-out' : 'is-in'}`}>
                        <div className="structural-range-label">Y</div>
                        <svg className="structural-range-svg" viewBox="0 0 100 12" aria-hidden="true" focusable="false">
                          <rect className="structural-range-track" x="0" y="5" width="100" height="2" rx="1" />
                          <rect
                            className="structural-range-ok"
                            x={yOkStartPct}
                            y="5"
                            width={yOkWidth}
                            height="2"
                            rx="1"
                          />
                          <line className="structural-range-marker" x1={yValue} y1="1.5" x2={yValue} y2="10.5" />
                          <circle className="structural-range-dot" cx={yValue} cy="6" r="2" />
                        </svg>
                        <div className="structural-range-value">{params.Y.toFixed(2)}</div>
                      </div>

                      <div className="structural-range-legend">
                        X in-range: {panelXRangeLabel} · Y in-range: {panelYRangeLabel}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="sb-struct-help">
              {/* Structural clipping transparency */}
              <div className={`structural-clipping-helper${(params.X < PANEL_X_MIN || params.X > PANEL_X_MAX) ? ' is-saturated' : ''}`}>
                <p id="sb-note-X" className="clipping-helper-text">
                  Model maps raw X (panel scale) into the training structural band X_safe ∈ {structuralBandLabel} after mapping from panel range X∈{panelXRangeLabel}. Inputs beyond the panel range saturate at the band edges.
                </p>
                {(params.X < PANEL_X_MIN || params.X > PANEL_X_MAX) && (
                  <span className="saturation-warning-badge" title="Value outside panel bounds — model output will saturate">
                    ⚠ SATURATION
                  </span>
                )}
              </div>

              {/* Structural clipping transparency */}
              <div className={`structural-clipping-helper${(params.Y < PANEL_Y_MIN || params.Y > PANEL_Y_MAX) ? ' is-saturated' : ''}`}>
                <p id="sb-note-Y" className="clipping-helper-text">
                  Model maps raw Y (panel scale) into the training structural band Y_safe ∈ {structuralBandLabel} after mapping from panel range Y∈{panelYRangeLabel}. Inputs beyond the panel range saturate at the band edges.
                </p>
                {(params.Y < PANEL_Y_MIN || params.Y > PANEL_Y_MAX) && (
                  <span className="saturation-warning-badge" title="Value outside panel bounds — model output will saturate">
                    ⚠ SATURATION
                  </span>
                )}
              </div>

              <p className="clipping-helper-text">
                Note: the {structuralBandLabel} band is a training-time normalization band for internal structural transforms (X_safe/Y_safe). The final predicted Z is additionally clipped to {structuralBandLabel} so it is never exactly 0 or 1.
              </p>
            </div>
          </div>

          {/* Structural Advanced Drawer (α/β/k only) */}
          {showAdvancedParameters && (
            <div
              id={structuralAdvancedDrawerId}
              className="sb-advanced-drawer"
              role="region"
              aria-label="Advanced structural parameters"
            >
              {/* Mathematical Warning */}
              <div className="mathematical-warning">
                ⚠️ Do not change α, β, k values unless you understand the mathematical background
              </div>

              <div className="modern-parameter-group">
                <SliderRow
                  label="Alpha (α) - Settlement Exponent"
                  paramKey="alpha"
                  value={params.alpha}
                  min="0"
                  max="2"
                  step="0.01"
                  sliderClassName="modern-slider structural"
                  ariaLabel="Alpha Settlement Exponent parameter"
                  tooltip="Alpha (α): Settlement power exponent in formula Z = (X^α * Y^β * e^(...)) / (X^α * Y^β * e^(...) + k)"
                  decimals={2}
                  paramNameClassName="modern-param-name mathematical"
                  onParameterChange={onParameterChange}
                />

                <SliderRow
                  label="Beta (β) - Inequality Exponent"
                  paramKey="beta"
                  value={params.beta}
                  min="0"
                  max="2"
                  step="0.01"
                  sliderClassName="modern-slider structural"
                  ariaLabel="Beta Inequality Exponent parameter"
                  tooltip="Beta (β): Inequality power exponent in formula Z = (X^α * Y^β * e^(...)) / (X^α * Y^β * e^(...) + k)"
                  decimals={2}
                  paramNameClassName="modern-param-name mathematical"
                  onParameterChange={onParameterChange}
                />

                <SliderRow
                  label="K - Normalization Constant"
                  paramKey="k"
                  value={params.k}
                  min="0.5"
                  max="2.0"
                  step="0.001"
                  sliderClassName="modern-slider structural"
                  ariaLabel="K Normalization Constant parameter"
                  tooltip="K: Normalization constant in denominator Z = (X^α * Y^β * e^(...)) / (X^α * Y^β * e^(...) + k)"
                  decimals={2}
                  paramNameClassName="modern-param-name mathematical"
                  onParameterChange={onParameterChange}
                />
              </div>
            </div>
          )}
        </SectionShell>

        {/* BELIEF AMPLIFIERS: Positive coefficients (c_i > 0) that INCREASE Φ when their values are positive */}
        <SectionShell
          headerClassName="modern-section-header amplifiers"
          icon={<AmplifierIcon motionEnabled={motionEnabled} />}
          title="BELIEF AMPLIFIERS"
          titleId="sb-section-amplifiers-title"
          subtitle="Positive coefficients that strengthen belief"
        >
          <div className="advanced-toggle-container">
            <ToggleButton
              type="button"
              className="advanced-toggle-button"
              isExpanded={showContributions}
              label="Φ Contributions"
              onClick={() => setShowContributions(!showContributions)}
              title="Toggle per-term Φ contributions"
              ariaControls={phiContribDrawerId}
              withAriaExpanded
            />
          </div>
          <div className="modern-parameter-group">
            {/* Tradition (Cultural Intensity) - Strongest amplifier: c1 = +1.003 */}
            <SliderRow
              label="Cultural Intensity (C)"
              paramKey="C"
              value={params.C}
              min="-2.0"
              max="2.0"
              step="0.02"
              sliderClassName="modern-slider amplifier"
              ariaLabel="Cultural Intensity parameter"
              tooltip="STRONGEST AMPLIFIER (c1 = +1.003). Standardized (z-score): 0 = panel mean cultural intensity, +1 = +1σ above mean, -1 = -1σ below. Presets use standardized C (not raw 1.8–3.6). When C increases → Φ increases → Z increases. Typical preset range ≈ [-1.5, 1.5]."
              decimals={2}
              onParameterChange={onParameterChange}
            />

            {/* Trauma/Shock - Weak amplifier: c3 = +0.068 */}
            <SliderRow
              label="Trauma / Shock (T)"
              paramKey="T"
              value={params.T}
              min="-1.5"
              max="1.8"
              step="0.02"
              sliderClassName="modern-slider amplifier"
              ariaLabel="Trauma parameter"
              tooltip="WEAK AMPLIFIER (c3 = +0.068). Standardized (z-score): -1.5 ≈ 1.5σ below panel mean, 0 = mean, +1.8 ≈ 1.8σ above. When T increases → Φ increases (slightly) → Z increases. Panel: [-1.49, 1.82]"
              decimals={2}
              onParameterChange={onParameterChange}
            />

            {/* Redistribution Capacity - Very weak amplifier: c5 = +0.0227 */}
            <SliderRow
              label="Redistribution Capacity (G)"
              paramKey="G"
              value={params.G}
              min="-4.0"
              max="2.0"
              step="0.05"
              sliderClassName="modern-slider amplifier"
              ariaLabel="Redistribution Capacity parameter"
              tooltip="VERY WEAK AMPLIFIER (c5 = +0.0227). Standardized (z-score): negative = below mean redistribution capacity, positive = above mean. When G increases → Φ increases (very slightly) → Z increases. Panel: [-3.98, 1.97]"
              decimals={2}
              onParameterChange={onParameterChange}
            />

            {/* Welfare Capacity - Weak amplifier: c8 = +0.02 */}
            <SliderRow
              label="Welfare Capacity (R)"
              paramKey="R"
              value={params.R}
              min="-0.5"
              max="1.2"
              step="0.01"
              sliderClassName="modern-slider amplifier"
              ariaLabel="Welfare Capacity parameter"
              tooltip="WEAK AMPLIFIER (c8 = +0.02). Standardized (z-score): negative = below mean welfare capacity, positive = above mean. When R increases → Φ increases (slightly) → Z increases. Panel: [-0.43, 0.95]"
              decimals={2}
              onParameterChange={onParameterChange}
            />
          </div>
          {showContributions && (
            <div id={phiContribDrawerId} role="region" aria-label="Φ contributions">
              {(() => {
                const { terms, totalPhi } = computePhiContributions(params);
                return <ContributionPanel terms={terms} totalPhi={totalPhi} />;
              })()}
            </div>
          )}
        </SectionShell>

        {/* BELIEF SUPPRESSORS: Negative coefficients (c_i < 0) that DECREASE Φ when their values are positive */}
        <SectionShell
          headerClassName="modern-section-header suppressors"
          icon={<SuppressorIcon />}
          title="BELIEF SUPPRESSORS"
          titleId="sb-section-suppressors-title"
          subtitle="Negative coefficients that weaken belief"
        >
          <div className="modern-parameter-group">
            {/* Media Environment - Moderate suppressor: c2 = -0.219 */}
            <SliderRow
              label="Media Environment (M)"
              paramKey="M"
              value={params.M}
              min="-1.0"
              max="1.5"
              step="0.01"
              sliderClassName="modern-slider suppressor"
              ariaLabel="Media Environment parameter"
              tooltip="MODERATE SUPPRESSOR (c2 = -0.219). Standardized (z-score): negative = below mean, positive = above mean. When M increases → Φ decreases → Z decreases. Panel: [-0.84, 1.32]"
              decimals={2}
              onParameterChange={onParameterChange}
            />

            {/* Social Atomization (Loneliness) - STRONGEST suppressor: c4 = -0.635 */}
            <SliderRow
              label="Social Atomization (D)"
              paramKey="D"
              value={params.D}
              min="-1.7"
              max="1.6"
              step="0.02"
              sliderClassName="modern-slider suppressor"
              ariaLabel="Social Atomization parameter"
              tooltip="STRONGEST SUPPRESSOR (c4 = -0.635). Standardized (z-score): negative ≈ lower atomization (stronger bonds) vs mean; positive ≈ higher atomization/loneliness vs mean. When D increases → Φ decreases strongly → Z decreases. Panel: [-1.65, 1.51]"
              decimals={2}
              onParameterChange={onParameterChange}
            />

            {/* Social Support - Moderate suppressor: c7 = -0.393 */}
            <SliderRow
              label="Social Support (S)"
              paramKey="S"
              value={params.S}
              min="-1.6"
              max="1.7"
              step="0.02"
              sliderClassName="modern-slider suppressor"
              ariaLabel="Social Support parameter"
              tooltip="MODERATE SUPPRESSOR (c7 = -0.393). Standardized (z-score): negative = below mean support, positive = above mean. When S increases → Φ decreases → Z decreases. Panel: [-1.51, 1.65]"
              decimals={2}
              onParameterChange={onParameterChange}
            />

            {/* Education Capacity - Moderate suppressor: c6 = -0.382 */}
            <SliderRow
              label="Education Capacity (E)"
              paramKey="E"
              value={params.E}
              min="-0.5"
              max="1.5"
              step="0.01"
              sliderClassName="modern-slider suppressor"
              ariaLabel="Education Capacity parameter"
              tooltip="MODERATE SUPPRESSOR (c6 = -0.382). Standardized (z-score): negative = below mean education capacity, positive = above mean. When E increases → Φ decreases → Z decreases. Panel: [-0.39, 1.48]. Note: E×S interaction can partially offset when both are high."
              decimals={2}
              onParameterChange={onParameterChange}
            />
          </div>
        </SectionShell>
      </div>
      
      {/* Footer with Documentation and Presets Buttons */}
      <div className="modern-sidebar-footer">
        <div className="footer-buttons">
          <button 
            className="modern-doc-button"
            onClick={onShowDocumentation}
            title="Open Interactive Documentation"
          >
            <BookOpen size={16} strokeWidth={2.2} />
            <span>Documentation</span>
          </button>
          <button
            className="modern-ai-button"
            onClick={onShowAiInterpreter}
            title="AI Interpreter: explain current panel state"
          >
            <Sparkles size={16} strokeWidth={2.2} />
            <span>AI Interpreter</span>
          </button>
          <button 
            className="modern-preset-button"
            ref={presetButtonRef}
            onClick={() => setIsPresetModalOpen(true)}
            title="Load country presets for settlement, inequality, and modifiers"
          >
            <Globe size={16} strokeWidth={2.2} />
            <span>Presets</span>
          </button>
        </div>
      </div>

      {/* Preset Modal */}
      <PresetModal
        isOpen={isPresetModalOpen}
        onClose={() => setIsPresetModalOpen(false)}
        onSelectPreset={handlePresetSelect}
      />
    </aside>
  );
}

export default ModernSidebar;
