import React, { useCallback, useEffect, useRef, useState } from 'react';
import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';

import CountriesZValuesPanel from '../visualization/CountriesZValuesPanel';
import type { BeliefParameters, Coefficients } from '../../types';
import type { ModelCalculationResult } from '../../utils/calculateModel';
import { formatNumeric } from '../../utils/formatNumeric';
import { logParams } from '../../utils/paramLogger';
import { exportBehavioralDynamicsReport } from '../../utils/pdf/exportBehavioralDynamicsReport';
import { computeTopBarAnalytics } from '../../utils/topBarAnalytics';
import {
  normalizePanelXToStructural,
  normalizePanelYToStructural,
  STRUCTURAL_MAX,
  STRUCTURAL_MIN,
} from '../../utils/modelContract';
import {
  PRESET_VERDICT_THRESHOLDS,
  type PresetVerdictClass,
} from '../../utils/validation/presetCountryAlignment';
import './FormulaDisplay.css';

interface FormulaDisplayProps {
  params: BeliefParameters;
  coefficients: Coefficients;
  alpha: number;
  beta: number;
  k: number;
  modelResult: ModelCalculationResult;
  structuralBase: number;
  presetName?: string;
}

const FormulaDisplay: React.FC<FormulaDisplayProps> = ({ 
  params,
  coefficients,
  alpha, 
  beta,
  k,
  modelResult,
  structuralBase,
  presetName,
}) => {
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [panelSummary, setPanelSummary] = useState<{
    countryName: string;
    iso3: string | null;
    measuredZ: number | null;
    panelMae: number | null;
    panelSuccessPct: number | null;
    panelVerdictClass: PresetVerdictClass | null;
  } | null>(null);

  const handlePanelSummary = useCallback(
    (
      next:
        | {
            countryName: string;
            iso3: string | null;
            measuredZ: number | null;
            panelMae: number | null;
            panelSuccessPct: number | null;
            panelVerdictClass: PresetVerdictClass | null;
          }
        | null,
    ) => {
      setPanelSummary((prev) => {
        if (prev === next) return prev;
        if (prev === null || next === null) return next;
        if (prev.countryName !== next.countryName) return next;
        if (prev.iso3 !== next.iso3) return next;
        if (prev.measuredZ !== next.measuredZ) return next;
        if (prev.panelMae !== next.panelMae) return next;
        if (prev.panelSuccessPct !== next.panelSuccessPct) return next;
        if (prev.panelVerdictClass !== next.panelVerdictClass) return next;
        return prev;
      });
    },
    [],
  );

  const panelVerdictLabel = (() => {
    const cls = panelSummary?.panelVerdictClass;
    if (!cls) return null;
    if (cls === 'good') return `Good (≤${PRESET_VERDICT_THRESHOLDS.goodMaeMax.toFixed(2)})`;
    if (cls === 'acceptable') return `Acceptable (≤${PRESET_VERDICT_THRESHOLDS.acceptableMaeMax.toFixed(2)})`;
    return 'Poor';
  })();

  const structuralBandLabel = `[${STRUCTURAL_MIN.toFixed(4)}, ${STRUCTURAL_MAX.toFixed(4)}]`;
  const xSafe = normalizePanelXToStructural(params.X);
  const ySafe = normalizePanelYToStructural(params.Y);
  // Parameter tracing harness: log the full parameter vector used for model evaluation
  logParams('FormulaDisplay', { ...params, alpha, beta, k });

  const zValue = modelResult.Z;
  const phiValue = modelResult.phi;

  // Calculate additional dynamic metrics
  const baseline = modelResult.phiComponents.baseline;
  const mainEffects = modelResult.phiComponents.mainEffects;
  const interactions = modelResult.phiComponents.interactions;
  const quadratic = modelResult.phiComponents.quadratic;

  const amplifyingEffects =
    (mainEffects > 0 ? mainEffects : 0) +
    (interactions > 0 ? interactions : 0) +
    (quadratic > 0 ? quadratic : 0);

  const suppressingEffects =
    (mainEffects < 0 ? Math.abs(mainEffects) : 0) +
    (interactions < 0 ? Math.abs(interactions) : 0) +
    (quadratic < 0 ? Math.abs(quadratic) : 0);

  const netField = amplifyingEffects - suppressingEffects;
  const dominanceRatio = amplifyingEffects / (suppressingEffects + 0.001);
  const systemVolatility = Math.abs(netField) / (amplifyingEffects + suppressingEffects + 0.001);
  const emergenceThreshold = 0.5;
  const distanceToThreshold = Math.abs(zValue - emergenceThreshold);
  const criticalityIndex = 1 - distanceToThreshold / emergenceThreshold;

  const dynamicMetrics = {
    baseline,
    mainEffects,
    interactions,
    quadratic,
    amplifyingEffects,
    suppressingEffects,
    netField,
    dominanceRatio,
    systemVolatility,
    criticalityIndex,
    fieldGradient: Math.abs(modelResult.phi) * 10,
    stabilityMargin: Math.max(0, 1 - Math.abs(modelResult.phi)),
  };
  
  // Refs for animations
  const zValueRef = useRef<HTMLDivElement>(null);
  const prevZValue = useRef<number>(zValue);

  // Removed unused interaction demo toggle state

  // Animation when Z changes
  useEffect(() => {
    if (prevZValue.current !== zValue && zValueRef.current) {
      zValueRef.current.classList.add('value-pulse');
      setTimeout(() => {
        if (zValueRef.current) {
          zValueRef.current.classList.remove('value-pulse');
        }
      }, 800);
      prevZValue.current = zValue;
    }
  }, [zValue]);

  // Transitional state helpers removed - not used in current UI

  // Get stability class for dynamic coloring
  const getStabilityClass = (z: number): string => {
    if (z < 0.3) return 'stable';
    else if (z < 0.6) return 'low';
    else if (z < 0.8) return 'moderate';
    else return 'high';
  };

  // Get stability title
  const getStabilityTitle = (z: number): string => {
    if (z < 0.3) return 'STABLE EQUILIBRIUM';
    else if (z < 0.6) return 'EMERGENCE POTENTIAL';
    else if (z < 0.8) return 'TRANSITION ZONE';
    else return 'CRITICAL THRESHOLD';
  };

  // Get stability description
  const getStabilityDescription = (z: number): string => {
    if (z < 0.3) return 'SUPPRESSOR MECHANISMS DOMINANT • SYSTEM CONTAINED';
    else if (z < 0.6) return 'AMPLIFIER-SUPPRESSOR BALANCE • MONITOR FLUCTUATIONS';
    else if (z < 0.8) return 'AMPLIFIERS GAINING STRENGTH • INTERVENTION WINDOW';
    else return 'NON-LINEAR REGIME ACTIVATED • IMMEDIATE RESPONSE REQUIRED';
  };

  // Calculate exponential factor from canonical phi
  // Mirror the production calculator: clamp Φ before exp to avoid overflow and keep visuals consistent.
  const PHI_EXP_CLAMP = 50;
  const phiForExp = Math.max(-PHI_EXP_CLAMP, Math.min(PHI_EXP_CLAMP, phiValue));
  const phiInExpIsClamped = phiValue <= -PHI_EXP_CLAMP || phiValue >= PHI_EXP_CLAMP;
  const exponentialFactor = Math.exp(phiForExp);

  const formatCompactNumber = (value: number, decimals: number) => {
    if (!Number.isFinite(value)) return '—';
    const abs = Math.abs(value);
    if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) return value.toExponential(2);
    return formatNumeric(value, decimals);
  };

  const ampShare =
    dynamicMetrics.amplifyingEffects /
    (dynamicMetrics.amplifyingEffects + dynamicMetrics.suppressingEffects + 1e-6);
  const supShare =
    dynamicMetrics.suppressingEffects /
    (dynamicMetrics.amplifyingEffects + dynamicMetrics.suppressingEffects + 1e-6);

  const phaseState = zValue > 0.7 ? 'Critical Transition' : zValue > 0.4 ? 'Active Emergence' : 'Stable Equilibrium';
  const regime = zValue > 0.6 ? 'Non-Linear Amplification' : 'Linear Suppression';
  const riskLevel =
    dynamicMetrics.criticalityIndex > 0.8 ? 'HIGH' : dynamicMetrics.criticalityIndex > 0.5 ? 'MEDIUM' : 'LOW';

  const interpretation = (() => {
    if (zValue < 0.2) {
      return { label: 'Low Emergence', message: 'Minimal belief emergence conditions' };
    }
    if (zValue < 0.5) {
      return { label: 'Moderate Emergence', message: 'Developing belief formation' };
    }
    if (zValue < 0.8) {
      return { label: 'High Emergence', message: 'Strong belief emergence environment' };
    }
    return { label: 'Critical Emergence', message: 'Maximum belief formation potential' };
  })();

  const toLatexVar = (name: string): string => {
    // Standardized modifiers
    const stdMatch = name.match(/^([A-Z])_std$/);
    if (stdMatch) return `${stdMatch[1]}_{\\mathrm{std}}`;

    // Clipped structural terms
    if (name === 'X_safe') return 'X_{\\mathrm{safe}}';
    if (name === 'Y_safe') return 'Y_{\\mathrm{safe}}';

    // Fallback: emit raw, but escape underscores
    return name.replaceAll('_', '\\_');
  };

  const signedSumChunkLatex = (
    terms: Array<{ coef: number; expr: string }>,
    includeLeadingPlus: boolean
  ): string => {
    if (!terms.length) return '0';
    return terms
      .map((t, idx) => {
        const absCoef = Math.abs(t.coef);
        const coefLatex = `\\left(${formatNumeric(absCoef, 3)}\\right)`;
        const piece = `${coefLatex}\\,${t.expr}`;
        if (idx === 0) {
          if (t.coef < 0) return `- ${piece}`;
          return includeLeadingPlus ? `+ ${piece}` : piece;
        }
        return t.coef < 0 ? ` - ${piece}` : ` + ${piece}`;
      })
      .join('');
  };

  const labeledAlignedSumLatex = (
    labelLatex: string,
    terms: Array<{ coef: number; expr: string }>,
    perLine: number
  ): string => {
    if (!terms.length) return `${labelLatex} = 0`;
    const chunks: Array<Array<{ coef: number; expr: string }>> = [];
    for (let i = 0; i < terms.length; i += perLine) {
      chunks.push(terms.slice(i, i + perLine));
    }
    const lines = chunks.map((chunk, idx) => {
      const expr = signedSumChunkLatex(chunk, idx > 0);
      if (idx === 0) return `${labelLatex} &= ${expr}`;
      return `&= ${expr}`;
    });
    return `\\begin{aligned} ${lines.join(' \\\\ ')} \\end{aligned}`;
  };

  const phiMainFormula = (() => {
    const terms = (modelResult.mainEffectTerms ?? []).map(t => ({
      coef: t.coef,
      expr: `${t.variable}_{\\mathrm{std}}`,
    }));
    return labeledAlignedSumLatex('\\Phi_{main}', terms, 4);
  })();

  const phiInteractionsFormula = (() => {
    const terms = (modelResult.interactionTerms ?? []).map(t => ({
      coef: t.coef,
      expr: `${toLatexVar(t.factor1.name)}\\cdot ${toLatexVar(t.factor2.name)}`,
    }));
    return labeledAlignedSumLatex('\\Phi_{interactions}', terms, 3);
  })();

  const phiQuadraticFormula = (() => {
    const terms = (modelResult.quadraticTerms ?? []).map(t => ({
      coef: t.coef,
      expr: `${toLatexVar(t.factor.name)}^{2}`,
    }));
    return labeledAlignedSumLatex('\\Phi_{quadratic}', terms, 2);
  })();

  // Calculate E×S interaction contribution for demo panel
  const eInteractionTerm = (modelResult.interactionTerms ?? []).find((t: { factor1: { name: string }; factor2: { name: string } }) => 
    (t.factor1.name === 'E' && t.factor2.name === 'S') || 
    (t.factor1.name === 'S' && t.factor2.name === 'E')
  );
  
  // Estimate E main effect (c6 * E_std, where E_std is E - mean / std)
  // For demonstration, use simplified estimate: coef * value
  const eMainEffectEstimate = coefficients.c6 * (params.E || 0) * 0.1;  // Scale factor for visualization
  const eInteractionEstimate = eInteractionTerm ? eInteractionTerm.coef * (params.E || 0) * (params.S || 0) * 0.01 : 0;

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const toPct = (value: number, min: number, max: number) => {
    if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max === min) return 0.5;
    return clamp01((value - min) / (max - min));
  };

  type BeliefRow = {
    key: string;
    label: string;
    symbol: string;
    value: number;
    decimals: number;
    min?: number;
    max?: number;
    tone: 'amp' | 'sup' | 'neutral';
  };

  // The belief bar UI is driven by CSS variable `--pct` (see FormulaDisplay.css).

  const amplifierRows: BeliefRow[] = [
    { key: 'C', label: 'Cultural Intensity', symbol: 'C', value: params.C, decimals: 2, min: -2.0, max: 2.0, tone: 'amp' },
    { key: 'T', label: 'Trauma / Shock', symbol: 'T', value: params.T, decimals: 2, min: -1.5, max: 1.8, tone: 'amp' },
    { key: 'G', label: 'Redistribution Capacity', symbol: 'G', value: params.G, decimals: 2, min: -4.0, max: 2.0, tone: 'amp' },
    { key: 'R', label: 'Welfare Capacity', symbol: 'R', value: params.R, decimals: 2, min: -0.5, max: 1.2, tone: 'amp' },
  ];

  const suppressorRows: BeliefRow[] = [
    { key: 'M', label: 'Media Environment', symbol: 'M', value: params.M, decimals: 2, min: -1.0, max: 1.5, tone: 'sup' },
    { key: 'D', label: 'Social Atomization', symbol: 'D', value: params.D, decimals: 2, min: -1.7, max: 1.6, tone: 'sup' },
    { key: 'S', label: 'Social Support', symbol: 'S', value: params.S, decimals: 2, min: -1.6, max: 1.7, tone: 'sup' },
    { key: 'E', label: 'Education Capacity', symbol: 'E', value: params.E, decimals: 2, min: -0.5, max: 1.5, tone: 'sup' },
  ];

  const structuralRows: BeliefRow[] = [
    { key: 'X', label: 'Settlement', symbol: 'X', value: params.X, decimals: 2, tone: 'neutral' },
    { key: 'Y', label: 'Inequality', symbol: 'Y', value: params.Y, decimals: 2, tone: 'neutral' },
    { key: 'alpha', label: 'Settlement Exp', symbol: 'α', value: alpha, decimals: 2, tone: 'neutral' },
    { key: 'beta', label: 'Inequality Exp', symbol: 'β', value: beta, decimals: 2, tone: 'neutral' },
    { key: 'Phi', label: 'Field Potential', symbol: 'Φ', value: phiValue, decimals: 3, tone: 'neutral' },
  ];

  const constantsRows: BeliefRow[] = [
    { key: 'k', label: 'Saturation', symbol: 'k', value: k, decimals: 3, tone: 'neutral' },
    { key: 'phi0', label: 'Baseline', symbol: 'φ₀', value: baseline, decimals: 3, tone: 'neutral' },
    { key: 'c1', label: 'Culture Coeff', symbol: 'c₁', value: coefficients.c1, decimals: 3, tone: 'neutral' },
    { key: 'c2', label: 'Media Coeff', symbol: 'c₂', value: coefficients.c2, decimals: 3, tone: 'neutral' },
    { key: 'c3', label: 'Trauma Coeff', symbol: 'c₃', value: coefficients.c3, decimals: 3, tone: 'neutral' },
    { key: 'c4', label: 'Atomization Coeff', symbol: 'c₄', value: coefficients.c4, decimals: 3, tone: 'neutral' },
    { key: 'c5', label: 'Redistribution Coeff', symbol: 'c₅', value: coefficients.c5, decimals: 3, tone: 'neutral' },
    { key: 'c6', label: 'Education Coeff', symbol: 'c₆', value: coefficients.c6, decimals: 3, tone: 'neutral' },
    { key: 'c7', label: 'Support Coeff', symbol: 'c₇', value: coefficients.c7, decimals: 3, tone: 'neutral' },
    { key: 'c8', label: 'Welfare Coeff', symbol: 'c₈', value: coefficients.c8, decimals: 3, tone: 'neutral' },
  ];

  const renderBeliefRow = (row: BeliefRow) => {
    const hasTrack = typeof row.min === 'number' && typeof row.max === 'number';
    const pct = hasTrack ? toPct(row.value, row.min as number, row.max as number) : 0.5;
    const trackStyle = { '--pct': pct } as React.CSSProperties;
    return (
      <div className="belief-row" key={row.key}>
        <div className="belief-row-top">
          <div className="belief-row-label" title={`${row.label} (${row.symbol})`}>
            {row.label} <span className="belief-row-symbol">({row.symbol})</span>
          </div>
          <div className="belief-row-value" aria-label={`${row.symbol} value ${formatNumeric(row.value, row.decimals)}`}>
            {formatNumeric(row.value, row.decimals)}
          </div>
        </div>
        {hasTrack ? (
          <div className={`belief-row-track tone-${row.tone}`} style={trackStyle} aria-hidden="true">
            <div className="belief-row-track-fill" />
            <div className="belief-row-thumb" />
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="formula-display-layout">
      {/* LEFT SECTION - Formula and Explanations */}
      <div className="left-section">
        {/* Main Formula */}
        <div className="main-formula-container">
          <BlockMath 
            math={"Z = \\frac{X^{\\alpha} Y^{\\beta} e^{\\Phi}}{X^{\\alpha} Y^{\\beta} e^{\\Phi} + k}"}
            renderError={() => <span className="formula-error">Formula Error</span>}
          />
          <div className="phi-formula-small">
            <BlockMath
              math={
                "\\Phi = \\varphi_0 + \\underbrace{\\sum_{i=1}^{8} c_i\\,M_{i,\\mathrm{std}}}_{\\text{main}} + \\underbrace{\\sum_{j=1}^{7} I_j}_{\\text{interactions}} + \\underbrace{\\sum_{k=1}^{4} Q_k}_{\\text{quadratic}}"
              }
              renderError={() => <span className="formula-error">Phi Formula Error</span>}
            />
            <BlockMath
              math={phiMainFormula}
              renderError={() => <span className="formula-error">Phi Main Terms Error</span>}
            />
            <BlockMath
              math={phiInteractionsFormula}
              renderError={() => <span className="formula-error">Phi Interaction Terms Error</span>}
            />
            <BlockMath
              math={phiQuadraticFormula}
              renderError={() => <span className="formula-error">Phi Quadratic Terms Error</span>}
            />
            <BlockMath
              math={`\\varphi_0=${formatNumeric(baseline, 3)}\\; ,\\; \\Phi_{main}=${formatNumeric(mainEffects, 3)}\\; ,\\; \\Phi_{interactions}=${formatNumeric(interactions, 3)}\\; ,\\; \\Phi_{quadratic}=${formatNumeric(quadratic, 3)}`}
              renderError={() => <span className="formula-error">Phi Components Error</span>}
            />
            <BlockMath
              math={`\\Phi = ${formatNumeric(baseline, 3)} + ${formatNumeric(mainEffects, 3)} + (${formatNumeric(interactions, 3)}) + ${formatNumeric(quadratic, 3)} = ${formatNumeric(phiValue, 3)}`}
              renderError={() => <span className="formula-error">Phi Sum Error</span>}
            />
          </div>
        </div>

        {/* Structural Foundations */}
        <div className="explanation-section">
          <div className="explanation-header">STRUCTURAL FOUNDATIONS</div>
          <ul className="explanation-list">
            <li><strong>Urban Settlement Dynamics:</strong> Population density, infrastructure development, and spatial organization patterns</li>
            <li><strong>Socioeconomic Inequality:</strong> Stratification levels, resource distribution asymmetries, and perceived injustice indices</li>
            <li><strong>Exponential Sensitivity Framework:</strong> Non-linear amplification mechanisms for structural parameter interactions</li>
          </ul>
        </div>

        {/* Symbolic Amplifiers */}
        <div className="explanation-section">
          <div className="explanation-header amplifiers">SYMBOLIC AMPLIFIERS</div>
          <ul className="explanation-list">
            <li><strong>Cultural Tradition Intensity:</strong> Historical narrative preservation and collective memory strength</li>
            <li><strong>Media & Religious Influence:</strong> Information ecosystem control and ideological reinforcement mechanisms</li>
            <li><strong>Historical Trauma Legacy:</strong> Collective psychological scarring and intergenerational transmission effects</li>
            <li><strong>Social Atomization Depth:</strong> Community fragmentation and interpersonal trust erosion levels</li>
            <li><strong>Gini Index:</strong> Economic inequality measurement and wealth distribution asymmetry</li>
          </ul>
        </div>

        {/* Systematic Suppressors */}
        <div className="explanation-section">
          <div className="explanation-header suppressors">SYSTEMATIC SUPPRESSORS</div>
          <ul className="explanation-list">
            <li><strong>Education Quality:</strong> Critical thinking development and analytical reasoning capacity enhancement</li>
            <li><strong>Social Cohesion:</strong> Community bonds strength and collective solidarity mechanisms</li>
            <li><strong>Welfare Systems:</strong> Social safety nets and economic security provision effectiveness</li>
          </ul>
        </div>

        {/* Mathematical Parameters */}
        <div className="explanation-section">
          <div className="explanation-header constants">MATHEMATICAL PARAMETERS</div>
          <ul className="explanation-list">
            <li><strong>Alpha (α):</strong> Settlement dynamics sensitivity exponent controlling urban structure influence</li>
            <li><strong>Beta (β):</strong> Inequality sensitivity exponent governing socioeconomic stratification impact</li>
            <li><strong>K Constant:</strong> Saturation threshold preventing infinite growth and maintaining bounded output</li>
          </ul>
        </div>
      </div>

      {/* CENTER SECTION - Current Values Display */}
      <div className="center-section">
        {/* Preset Indicator */}
        {presetName && (
          <div className="state-banner" aria-label="Preset configuration">
            <div className="state-banner-label">PRESET</div>
            <div className="state-banner-name">{presetName}</div>
            <div className="state-banner-status">Active Profile</div>
          </div>
        )}
        
        <div className="center-state-grid" aria-label="Current state and analysis">
        <section className="state-section" aria-label="Current state calculation">
          <header className="state-card-header">
            <div className="state-card-title">CURRENT STATE CALCULATION</div>
            <div className="state-card-subtitle">Sigmoidal cooperative binding</div>
          </header>

          <div className="state-card-body">
            <div className="state-math" aria-label="Model formula">
              <BlockMath
                math={
                  'Z = \\frac{S\\,e^{\\Phi_c}}{S\\,e^{\\Phi_c} + k}'
                }
              />
              <div className="state-math-sub">
                <BlockMath math={'S = X_{\\mathrm{safe}}^{\\alpha}\\,Y_{\\mathrm{safe}}^{\\beta}'} />
              </div>
            </div>

            <div className="state-hero" aria-label="Key outputs">
              <div className="hero-primary">
                <div className="hero-k">Z</div>
                <div className="hero-v" ref={zValueRef}>{formatNumeric(zValue, 4)}</div>
                <div className="hero-caption">Output probability (clipped to {structuralBandLabel})</div>
              </div>

              <div className="state-summary" aria-label="Core components">
                <div className="summary-row">
                  <div className="summary-k">Φ</div>
                  <div className="summary-v">{formatNumeric(phiValue, 4)}</div>
                </div>
                <div className="summary-row">
                  <div className="summary-k">S</div>
                  <div className="summary-v">{formatNumeric(structuralBase, 4)}</div>
                </div>
                <div className="summary-row">
                  <div className="summary-k">e^Φ</div>
                  <div className="summary-v">{formatCompactNumber(exponentialFactor, 4)}</div>
                </div>
                <div className="summary-row">
                  <div className="summary-k">k</div>
                  <div className="summary-v">{formatNumeric(k, 2)}</div>
                </div>
                {phiInExpIsClamped && (
                  <div className="summary-flag" aria-label="Phi clamped for exponential">
                    Φ clamp active → Φ_c = {formatNumeric(phiForExp, 3)}
                  </div>
                )}
              </div>
            </div>
            <div className="state-foot" aria-label="Derived inputs">
              X_safe={formatNumeric(xSafe, 4)} · Y_safe={formatNumeric(ySafe, 4)} · band={structuralBandLabel}
            </div>
          </div>
        </section>

        <section className="state-section" aria-label="Dynamic system analysis">
          <header className="state-card-header">
            <div className="state-card-title">DYNAMIC SYSTEM ANALYSIS</div>
            <div className="state-card-subtitle">Field decomposition • regime readout</div>
          </header>

          <div className="state-card-body">
            <div className="state-textlines" aria-label="System status">
              <div className="textline" data-tone={getStabilityClass(zValue)}>{getStabilityTitle(zValue)}</div>
              <div className="textline">{phaseState}</div>
              <div className="textline">{regime}</div>
              <div className="textline" data-tone={`risk-${riskLevel.toLowerCase()}`}>RISK: {riskLevel}</div>
            </div>

            <div className="state-textgrid" aria-label="Core metrics">
              <div className="textrow">
                <span>Amplifier dominance</span>
                <strong>{formatNumeric(ampShare * 100, 1)}%</strong>
              </div>
              <div className="textrow">
                <span>Suppressor effectiveness</span>
                <strong>{formatNumeric(supShare * 100, 1)}%</strong>
              </div>
              <div className="textrow">
                <span>Net field (amp − sup)</span>
                <strong>{formatNumeric(dynamicMetrics.netField, 4)}</strong>
              </div>
              <div className="textrow">
                <span>Dominance ratio (amp/sup)</span>
                <strong>{formatNumeric(dynamicMetrics.dominanceRatio, 2)}:1</strong>
              </div>
              <div className="textrow">
                <span>Criticality</span>
                <strong>{formatNumeric(dynamicMetrics.criticalityIndex * 100, 1)}%</strong>
              </div>
              <div className="textrow">
                <span>Volatility</span>
                <strong>{formatNumeric(dynamicMetrics.systemVolatility * 100, 1)}%</strong>
              </div>
            </div>

            <div className="state-note">{getStabilityDescription(zValue)}</div>
          </div>
        </section>
        </div>
      </div>

      {/* RIGHT SECTION - Scientific Parameters Vertical Columns */}
      <div className="right-section">
        <div className="belief-panels">
          <section className="belief-panel tone-amp" aria-label="Belief amplifiers">
            <header className="belief-panel-header">
              <div className="belief-panel-title">BELIEF AMPLIFIERS</div>
              <div className="belief-panel-subtitle">Positive coefficients that strengthen belief</div>
            </header>
            <div className="belief-panel-body">{amplifierRows.map(renderBeliefRow)}</div>
          </section>

          <section className="belief-panel tone-sup" aria-label="Belief suppressors">
            <header className="belief-panel-header">
              <div className="belief-panel-title">BELIEF SUPPRESSORS</div>
              <div className="belief-panel-subtitle">Negative coefficients that weaken belief</div>
            </header>
            <div className="belief-panel-body">{suppressorRows.map(renderBeliefRow)}</div>
          </section>

          <section className="belief-panel tone-neutral" aria-label="Structural parameters">
            <header className="belief-panel-header">
              <div className="belief-panel-title">STRUCTURAL</div>
            </header>
            <div className="belief-panel-body">{structuralRows.map(renderBeliefRow)}</div>
          </section>

          <section className="belief-panel tone-neutral" aria-label="Model constants and coefficients">
            <header className="belief-panel-header">
              <div className="belief-panel-title">CONSTANTS</div>
            </header>
            <div className="belief-panel-body">{constantsRows.map(renderBeliefRow)}</div>
          </section>
        </div>
      </div>

      {/* FAR RIGHT - Panel Comparison Display (cardless, clean) */}
      <div className="result-section" aria-label="Panel comparison and stability">
        <div className="formula-pdf-export-container">
          <button
            className="pdf-export-button"
            type="button"
            disabled={isExportingPdf}
            title="Export Formula Display to PDF"
            onClick={async () => {
              if (isExportingPdf) return;
              setIsExportingPdf(true);
              try {
                const analytics = computeTopBarAnalytics({
                  zValue,
                  phiValue,
                  params: {
                    X: params.X,
                    Y: params.Y,
                    C: params.C,
                    M: params.M,
                    T: params.T,
                    D: params.D,
                    G: params.G,
                    E: params.E,
                    S: params.S,
                    R: params.R,
                  },
                  structuralBase,
                  phiComponents: modelResult.phiComponents,
                  alpha,
                  beta,
                  k,
                });

                await exportBehavioralDynamicsReport({
                  fileStem: 'FormulaDisplay-Export',
                  documentSubtitle: 'FORMULA DISPLAY PDF EXPORT',
                  reportTitle: 'MATHEMATICAL CORE OF BELIEF EMERGENCE',
                  reportSubtitle: 'Canonical Z Formula, Φ Decomposition, and Sensitivity Diagnostics',
                  zValue,
                  phiValue,
                  interpretation,
                  presetName,
                  params: {
                    X: params.X,
                    Y: params.Y,
                    C: params.C,
                    M: params.M,
                    T: params.T,
                    D: params.D,
                    G: params.G,
                    E: params.E,
                    S: params.S,
                    R: params.R,
                  },
                  structuralBase,
                  phiComponents: modelResult.phiComponents,
                  alpha,
                  beta,
                  k,
                  analytics,
                  shareUrl: (() => {
                    try {
                      return window.location.href;
                    } catch {
                      return undefined;
                    }
                  })(),
                  disableFigureCapture: true,
                  style: { showRules: false },
                  extraSections: [
                    {
                      heading: 'Formula Display — Equations',
                      equations: [
                        {
                          label: 'Model score',
                          latex: 'Z = \\frac{X^{\\alpha} Y^{\\beta} e^{\\Phi}}{X^{\\alpha} Y^{\\beta} e^{\\Phi} + k}',
                        },
                        {
                          label: 'Structural base',
                          latex: 'S = X_{\\mathrm{safe}}^{\\alpha}\\,Y_{\\mathrm{safe}}^{\\beta}',
                        },
                        {
                          label: 'Canonical form (UI)',
                          latex: 'Z = \\frac{S\\,e^{\\Phi_c}}{S\\,e^{\\Phi_c} + k}',
                        },
                        { label: 'Φ (template)', latex: '\\Phi = \\varphi_0 + \\sum_{i=1}^{8} c_i\\,M_{i,\\mathrm{std}} + \\sum_{j=1}^{7} I_j + \\sum_{k=1}^{4} Q_k' },
                        { label: 'Φ main terms (expanded)', latex: phiMainFormula },
                        { label: 'Φ interactions (expanded)', latex: phiInteractionsFormula },
                        { label: 'Φ quadratic (expanded)', latex: phiQuadraticFormula },
                      ],
                      tables: [
                        {
                          title: 'Derived safety-mapped structural inputs',
                          rows: [
                            { k: 'X_safe (mapped)', v: formatNumeric(xSafe, 6) },
                            { k: 'Y_safe (mapped)', v: formatNumeric(ySafe, 6) },
                            { k: 'Structural band', v: structuralBandLabel },
                          ],
                        },
                      ],
                    },
                    {
                      heading: 'Formula Display — Explanatory Notes',
                      bullets: [
                        'Urban Settlement Dynamics: Population density, infrastructure development, and spatial organization patterns',
                        'Socioeconomic Inequality: Stratification levels, resource distribution asymmetries, and perceived injustice indices',
                        'Exponential Sensitivity Framework: Non-linear amplification mechanisms for structural parameter interactions',
                        'Cultural Tradition Intensity: Historical narrative preservation and collective memory strength',
                        'Media & Religious Influence: Information ecosystem control and ideological reinforcement mechanisms',
                        'Historical Trauma Legacy: Collective psychological scarring and intergenerational transmission effects',
                        'Social Atomization Depth: Community fragmentation and interpersonal trust erosion levels',
                        'Gini Index: Economic inequality measurement and wealth distribution asymmetry',
                        'Education Quality: Critical thinking development and analytical reasoning capacity enhancement',
                        'Social Cohesion: Community bonds strength and collective solidarity mechanisms',
                        'Welfare Systems: Social safety nets and economic security provision effectiveness',
                        'Alpha (α): Settlement dynamics sensitivity exponent controlling urban structure influence',
                        'Beta (β): Inequality sensitivity exponent governing socioeconomic stratification impact',
                        'K Constant: Saturation threshold preventing infinite growth and maintaining bounded output',
                      ],
                      notes: [
                        'Equations are exported as LaTeX strings (monospace) for reproducibility and layout stability; this mirrors the TopBar PDF strategy (text-first).',
                      ],
                    },
                    {
                      heading: 'Formula Display — Current Values (UI Panels)',
                      tables: [
                        {
                          title: 'Belief amplifiers (inputs)',
                          rows: amplifierRows.map((r) => ({
                            k: `${r.label} (${r.symbol}) [min=${r.min ?? '—'}, max=${r.max ?? '—'}]`,
                            v: formatNumeric(r.value, 6),
                          })),
                        },
                        {
                          title: 'Belief suppressors (inputs)',
                          rows: suppressorRows.map((r) => ({
                            k: `${r.label} (${r.symbol}) [min=${r.min ?? '—'}, max=${r.max ?? '—'}]`,
                            v: formatNumeric(r.value, 6),
                          })),
                        },
                        {
                          title: 'Structural parameters (derived)',
                          rows: structuralRows.map((r) => ({ k: `${r.label} (${r.symbol})`, v: formatNumeric(r.value, 6) })),
                        },
                        {
                          title: 'Constants & coefficients',
                          rows: constantsRows.map((r) => ({ k: `${r.label} (${r.symbol})`, v: formatNumeric(r.value, 6) })),
                        },
                      ],
                    },
                    {
                      heading: 'Formula Display — Derived Diagnostics',
                      tables: [
                        {
                          rows: [
                            { k: 'Amplifying effects (Φ⁺)', v: formatNumeric(dynamicMetrics.amplifyingEffects, 6) },
                            { k: 'Suppressing effects (Φ⁻)', v: formatNumeric(dynamicMetrics.suppressingEffects, 6) },
                            { k: 'Net field', v: formatNumeric(dynamicMetrics.netField, 6) },
                            { k: 'Dominance ratio', v: formatNumeric(dynamicMetrics.dominanceRatio, 6) },
                            { k: 'System volatility', v: formatNumeric(dynamicMetrics.systemVolatility, 6) },
                            { k: 'Criticality index', v: formatNumeric(dynamicMetrics.criticalityIndex, 6) },
                            { k: 'Phase state', v: String(phaseState) },
                            { k: 'Regime', v: String(regime) },
                            { k: 'Risk level', v: String(riskLevel) },
                            { k: 'Φ exp clamp active', v: phiInExpIsClamped ? 'yes' : 'no' },
                            { k: 'exp(Φ_clamped)', v: formatNumeric(exponentialFactor, 6) },
                          ],
                        },
                      ],
                      paragraphs: [
                        `Preset panel summary included below is computed by the in-app canonical panel pipeline when a preset is active.`,
                      ],
                    },
                    {
                      heading: 'Formula Display — Panel Summary (Preset)',
                      tables: [
                        {
                          rows: [
                            { k: 'Preset active', v: presetName ? 'yes' : 'no' },
                            { k: 'Country', v: panelSummary?.countryName ?? (presetName ?? '—') },
                            { k: 'ISO3', v: panelSummary?.iso3 ?? '—' },
                            { k: 'Measured Z (panel; normalized)', v: panelSummary?.measuredZ == null ? '—' : formatNumeric(panelSummary.measuredZ, 6) },
                            { k: 'MAE', v: panelSummary?.panelMae == null ? '—' : formatNumeric(panelSummary.panelMae, 6) },
                            { k: 'Success (%)', v: panelSummary?.panelSuccessPct == null ? '—' : `${formatNumeric(panelSummary.panelSuccessPct, 1)}%` },
                            { k: 'Verdict class', v: panelSummary?.panelVerdictClass ?? '—' },
                          ],
                        },
                      ],
                    },
                  ],
                });
              } catch (error) {
                console.error('FormulaDisplay PDF export failed:', error);
                const message = error instanceof Error ? error.message : String(error);
                alert(`PDF export failed. ${message}`);
              } finally {
                setIsExportingPdf(false);
              }
            }}
          >
            <span className="pdf-export-icon">📄</span>
            <span className="pdf-export-text">{isExportingPdf ? 'EXPORTING…' : 'EXPORT PDF'}</span>
          </button>
        </div>
        <div className="result-stack">
          <div className="result-sticky-head">
            <div className="result-block result-block--model">
              <div className="result-title">MODEL Z (CURRENT INPUTS)</div>
              <div className="result-value" aria-label="Current model Z">
                {formatNumeric(zValue, 4)}
              </div>
              <div className="result-caption">Z_model = S · e^Φ_c / (S · e^Φ_c + k)</div>
              <div className="result-meta">Probability {formatNumeric(zValue * 100, 1)}%</div>
            </div>

            <div className="result-block result-block--panel">
              <div className="result-title">PANEL Z (PRESET)</div>
              {presetName && panelVerdictLabel && (
                <div className="result-verdict" aria-label="Panel fit verdict">
                  <span className="result-verdict-label">Verdict</span>
                  <span
                    className={`result-verdict-badge result-verdict-badge--${panelSummary?.panelVerdictClass ?? 'unknown'}`}
                  >
                    {panelVerdictLabel}
                  </span>
                  {panelSummary?.panelSuccessPct != null && (
                    <span className="result-verdict-badge result-verdict-badge--success" aria-label="Model success percentage">
                      Success {formatNumeric(panelSummary.panelSuccessPct, 1)}%
                    </span>
                  )}
                </div>
              )}
              <div
                className={`result-value ${presetName && panelSummary?.measuredZ != null ? '' : 'result-value--muted'}`}
                aria-label="Panel measured Z reference"
              >
                {!presetName
                  ? 'Select preset'
                  : panelSummary?.measuredZ == null
                    ? 'Loading…'
                    : formatNumeric(panelSummary.measuredZ, 4)}
              </div>
              <div className="result-caption">
                {presetName
                  ? `Measured Z for ${panelSummary?.countryName ?? presetName}${panelSummary?.iso3 ? ` (${panelSummary.iso3})` : ''}`
                  : 'Measured Z from selected preset panel'}
              </div>
              <div className="result-meta">{presetName ? 'From canonical panel (normalized to band)' : 'Choose a preset to align model vs panel'}</div>
            </div>
          </div>

          <div className="result-panel" aria-label="Model vs data chart">
            <div className="result-title">MODEL–DATA CHART</div>
            <CountriesZValuesPanel
              selectedCountryName={presetName}
              currentParams={{
                X: params.X,
                Y: params.Y,
                C: params.C,
                M: params.M,
                T: params.T,
                D: params.D,
                G: params.G,
                E: params.E,
                S: params.S,
                R: params.R,
                alpha: alpha,
                beta: beta,
                k: k,
              }}
              currentModelZ={zValue}
              onCountrySummary={handlePanelSummary}
            />
          </div>

          <div className="result-block">
            <div className="result-title">STABILITY</div>
            <div className="result-line" data-tone={getStabilityClass(zValue)}>
              {getStabilityTitle(zValue)}
            </div>
            <div className="result-note">{getStabilityDescription(zValue)}</div>
          </div>

          <div className="result-block">
            <div className="result-title">INTERACTIONS (E×S)</div>
            <div className="result-grid">
              <div className="result-grid-row">
                <span>E main ΔΦ</span>
                <strong className={eMainEffectEstimate < 0 ? 'tone-sup' : 'tone-amp'}>
                  {eMainEffectEstimate < 0 ? '↓' : '↑'} {formatNumeric(Math.abs(eMainEffectEstimate), 4)}
                </strong>
              </div>
              <div className="result-grid-row">
                <span>E×S ΔΦ</span>
                <strong className={eInteractionEstimate > 0 ? 'tone-amp' : 'tone-sup'}>
                  {eInteractionEstimate > 0 ? '↑' : '↓'} {formatNumeric(Math.abs(eInteractionEstimate), 4)}
                </strong>
              </div>
              <div className="result-grid-row">
                <span>Net E effect</span>
                <strong className={eMainEffectEstimate + eInteractionEstimate < 0 ? 'tone-sup' : 'tone-amp'}>
                  {eMainEffectEstimate + eInteractionEstimate < 0 ? '↓' : '↑'} {formatNumeric(Math.abs(eMainEffectEstimate + eInteractionEstimate), 4)}
                </strong>
              </div>
            </div>
            <div className="result-note">S mitigates E suppression when interaction is positive.</div>
          </div>

          <div className="result-grid result-grid--metrics" aria-label="Key metrics">
            <div className="result-grid-row">
              <span>Structural base (S)</span>
              <strong>{formatNumeric(structuralBase, 4)}</strong>
            </div>
            <div className="result-grid-row">
              <span>Boltzmann factor (e^Φ_c)</span>
              <strong>{formatNumeric(exponentialFactor, 4)}</strong>
            </div>
            <div className="result-grid-row">
              <span>Net field</span>
              <strong>{formatNumeric(dynamicMetrics.netField, 4)}</strong>
            </div>
            <div className="result-grid-row">
              <span>Dominance ratio</span>
              <strong>{formatNumeric(dynamicMetrics.dominanceRatio, 2)}</strong>
            </div>
            <div className="result-grid-row">
              <span>Criticality</span>
              <strong>{formatNumeric(dynamicMetrics.criticalityIndex, 3)}</strong>
            </div>
            <div className="result-grid-row">
              <span>Saturation index</span>
              <strong>{formatNumeric(zValue / (1 - zValue + 0.001), 3)}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FormulaDisplay;
