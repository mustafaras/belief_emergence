import React, { useCallback, useMemo } from 'react';
import { BlockMath } from 'react-katex';
import SectionTemplate from './SectionTemplate.tsx';
import './AmplifiersSection.css';
import {
  INTERACTION_TERMS,
  OPTIMIZED_SIGMOID_COEFFICIENTS,
  OPTIMIZED_STRUCTURAL_PARAMS,
} from '../../data/feCoefficients';
import {
  getProductionDatasetMetadata,
  getProductionHeadlineMetrics,
  getProductionTrainingMetadata,
} from '../../data/modelMetrics';
import { computeStructuralBase } from '../../utils/calculateModel';
import { STRUCTURAL_MAX, STRUCTURAL_MIN } from '../../utils/modelContract';
import { predictFromPanelRow } from '../../utils/validation/panelPredict';
import { useDataContext } from '../../contexts/DataContext';

// Canonical interior band for numerical stability (matches training): [STRUCTURAL_MIN, STRUCTURAL_MAX]
const STRUCTURAL_SPAN = STRUCTURAL_MAX - STRUCTURAL_MIN;

// Back-compat aliases used throughout this section's narrative/plots.
// NOTE: Values are sourced from the canonical contract (no hard-coded epsilon here).
const TRAIN_MIN = STRUCTURAL_MIN;
const TRAIN_MAX = STRUCTURAL_MAX;

const labelZSample = (z: number): string => {
  if (!Number.isFinite(z)) return '—';
  if (Math.abs(z - STRUCTURAL_MIN) < 1e-12) return STRUCTURAL_MIN.toFixed(4);
  if (Math.abs(z - STRUCTURAL_MAX) < 1e-12) return STRUCTURAL_MAX.toFixed(4);
  return z.toFixed(2);
};

const AmplifiersSection: React.FC = () => {
  const fmtSigned = (value: number) => (Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(3)}` : '—');
  const fmt = (value: number, digits = 3) => (Number.isFinite(value) ? value.toFixed(digits) : '—');
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  const headline = useMemo(() => getProductionHeadlineMetrics(), []);
  const training = useMemo(() => getProductionTrainingMetadata(), []);
  const dataset = useMemo(() => getProductionDatasetMetadata(), []);

  // Map Z in [STRUCTURAL_MIN, STRUCTURAL_MAX] -> chart t in [0,1]
  const axisT = (z: number) => {
    const zz = clamp(z, STRUCTURAL_MIN, STRUCTURAL_MAX);
    return clamp((zz - STRUCTURAL_MIN) / STRUCTURAL_SPAN, 0, 1);
  };

  const axisLabel = (z: number) => {
    if (!Number.isFinite(z)) return '—';
    if (Math.abs(z - STRUCTURAL_MIN) < 1e-6) return STRUCTURAL_MIN.toFixed(4);
    if (Math.abs(z - STRUCTURAL_MAX) < 1e-6) return STRUCTURAL_MAX.toFixed(4);
    return z.toFixed(1);
  };

  const { panelData, loading, error } = useDataContext();
  const scenarioBaseline = useMemo(() => {
    return {
      X: 0.65,
      Y: 1.0,
      alpha: OPTIMIZED_STRUCTURAL_PARAMS.alpha,
      beta: OPTIMIZED_STRUCTURAL_PARAMS.beta,
      k: OPTIMIZED_STRUCTURAL_PARAMS.k,
      C: 2.613602,
      M: 0,
      T: 0,
      D: 0,
      G: 0,
      E: 0,
      S: 0,
      R: 0,
    };
  }, []);

  const structuralBase = useMemo(() => {
    return computeStructuralBase(
      scenarioBaseline.X,
      scenarioBaseline.Y,
      scenarioBaseline.alpha,
      scenarioBaseline.beta,
    );
  }, [scenarioBaseline]);

  const clampPhiForExp = useCallback((phi: number) => Math.max(-50, Math.min(50, phi)), []);
  const zFromPhi = useCallback((phi: number, base: number, k: number) => {
    const expTerm = Math.exp(clampPhiForExp(phi));
    const numerator = base * expTerm;
    const denom = numerator + k;
    if (denom === 0) return 0;
    return numerator / denom;
  }, [clampPhiForExp]);

  const phiSweep = useMemo(() => {
    const xs: number[] = [];
    const zs: number[] = [];
    const dzdphi: number[] = [];
    const start = -6;
    const end = 6;
    const n = 241;
    for (let i = 0; i < n; i++) {
      const phi = start + (i * (end - start)) / (n - 1);
      const z = clamp(zFromPhi(phi, structuralBase, scenarioBaseline.k), TRAIN_MIN, TRAIN_MAX);
      xs.push(phi);
      zs.push(z);
      dzdphi.push(z * (1 - z));
    }
    return { xs, zs, dzdphi };
  }, [scenarioBaseline.k, structuralBase, zFromPhi]);

  // Empirical validation: Observed vs Predicted
  const validation = useMemo(() => {
    if (!panelData || panelData.length === 0) {
      return { 
        points: [] as Array<{ x: number; y: number; iso3: string }>,
        residuals: [] as number[],
        r2: NaN,
        corr: NaN,
        mae: NaN,
        rmse: NaN,
        bins: [] as Array<{ predMean: number; obsMean: number }>
      };
    }

    const points: Array<{ x: number; y: number; iso3: string }> = [];
    const residuals: number[] = [];
    let sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0, sumXY = 0, sse = 0, maeAcc = 0, n = 0;
    for (const row of panelData) {
      const result = predictFromPanelRow(row);
      const zhat = result.zPred;
      const zobs = result.zObs;
      if (!Number.isFinite(zhat) || !Number.isFinite(zobs)) continue;

      points.push({ x: zhat, y: zobs, iso3: row.iso3 });
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

    if (n === 0) {
      return { 
        points: [] as Array<{ x: number; y: number; iso3: string }>,
        residuals: [] as number[],
        r2: NaN,
        corr: NaN,
        mae: NaN,
        rmse: NaN,
        bins: [] as Array<{ predMean: number; obsMean: number }>
      };
    }

    const meanY = sumY / n;
    const sst = points.reduce((acc, p) => acc + (p.y - meanY) * (p.y - meanY), 0);
    const r2 = 1 - (sse / sst);
    const cov = sumXY / n - (sumX / n) * (sumY / n);
    const sx = Math.sqrt(sumX2 / n - (sumX / n) * (sumX / n));
    const sy = Math.sqrt(sumY2 / n - (sumY / n) * (sumY / n));
    const corr = cov / (sx * sy);
    const mae = maeAcc / n;
    const rmse = Math.sqrt(sse / n);

    // Calibration bins
    const sorted = points.slice().sort((a, b) => a.x - b.x);
    const bins: Array<{ predMean: number; obsMean: number }> = [];
    const binsCount = 10;
    for (let i = 0; i < binsCount; i++) {
      const start = Math.floor((i * sorted.length) / binsCount);
      const end = Math.floor(((i + 1) * sorted.length) / binsCount);
      const slice = sorted.slice(start, end);
      if (!slice.length) continue;
      const predMean = slice.reduce((a, p) => a + p.x, 0) / slice.length;
      const obsMean = slice.reduce((a, p) => a + p.y, 0) / slice.length;
      bins.push({ predMean, obsMean });
    }

    return { points, residuals, r2, corr, mae, rmse, bins };
  }, [panelData]);

  const content = (
    <div className="belief-equation-content amplifiers-content">
      {/* Header Card matching BeliefEquation style */}
      <div className="coefficients-visualization-card">
        <h4 className="viz-title">3.1 Amplifiers &amp; Suppressors in the Symbolic Field</h4>
        <p className="viz-subtitle">Ridge-calibrated socio-cultural modifiers that modulate belief emergence via exponential field Φ</p>
        
        <div className="methodology-note">
          <p>
            The structural base term <strong>B = X<sub>safe</sub><sup>α</sup> · Y<sub>safe</sub><sup>β</sup></strong> is modulated 
            by an exponential symbolic field <strong>Φ</strong> constructed from standardized socio-cultural modifiers. 
            Coefficients are signed via Ridge regression (L2 penalty, α=1.0):
          </p>
          <ul>
            <li><strong>Amplifiers:</strong> Positive coefficients (c &gt; 0) increase Φ when the modifier value is positive</li>
            <li><strong>Suppressors:</strong> Negative coefficients (c &lt; 0) decrease Φ when the modifier value is positive</li>
          </ul>
          <p>
            This section presents the canonical mathematical framework, sign taxonomy, and nonlinear sensitivities.
          </p>
        </div>

        <div className="viz-math amp-viz-math-lg">
          <BlockMath
            math={'\\displaystyle Z = \\frac{B\\,e^{\\Phi}}{B\\,e^{\\Phi}+k},\\qquad \\Phi = \\phi_0 + \\sum_{i=1}^{8} c_i\\,m_{i,\\text{std}} + \\text{interactions} + \\text{quadratics}'}
            renderError={() => <span className="formula">Z = (B·e^Φ)/(B·e^Φ + k), Φ = φ₀ + Σcᵢmᵢ + interactions + quadratics</span>}
          />
        </div>
      </div>

      {/* Two-column layout for theory and visualizations */}
      <div className="viz-grid">
      {/* Coefficient Bars - matching BeliefEquation visualization style */}
      <div className="coefficients-visualization-card">
        <h4 className="viz-title">3.2 Main-Effect Coefficients (Ridge L2, α=1.0)</h4>
        <p className="viz-subtitle">Signed amplification/suppression magnitudes from canonical panel fit</p>
        
          <svg viewBox="0 0 700 450" className="coefficients-chart amp-svg-maxh-420">
          <defs>
            <linearGradient id="ampGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.9" />
            </linearGradient>
            <linearGradient id="suppGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.7" />
            </linearGradient>
          </defs>

          {/* Axes */}
          <line x1="220" y1="40" x2="220" y2="340" stroke="#334155" strokeWidth="2.5" />
          <line x1="30" y1="340" x2="650" y2="340" stroke="#334155" strokeWidth="2.5" />

          {/* Zero line */}
          <line x1="220" y1="40" x2="220" y2="340" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5,5" />

          {(() => {
            const coeffs = [
              { label: 'C (Culture)', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c1, y: 60 },
              { label: 'M (Media)', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c2, y: 110 },
              { label: 'T (Trauma)', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c3, y: 160 },
              { label: 'D (Atomization)', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c4, y: 210 },
              { label: 'G (Governance)', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c5, y: 260 },
              { label: 'E (Education)', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c6, y: 310 },
              { label: 'S (Social Capital)', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c7, y: 360 },
            ];

            const maxAbs = Math.max(...coeffs.map(c => Math.abs(c.value)));
            const scale = 420 / maxAbs;

            return coeffs.map((coeff, i) => {
              const barWidth = Math.abs(coeff.value) * scale;
              const x = coeff.value > 0 ? 220 : 220 - barWidth;
              const color = coeff.value > 0 ? 'url(#ampGrad)' : 'url(#suppGrad)';
              const textColor = coeff.value > 0 ? '#10b981' : '#ef4444';

              return (
                <g key={i}>
                  <rect x={x} y={coeff.y - 12} width={barWidth} height={24} fill={color} />
                  <text x="215" y={coeff.y + 5} textAnchor="end" fill="#e2e8f0" fontSize="13" fontWeight="600">
                    {coeff.label}
                  </text>
                  <text x={coeff.value > 0 ? x + barWidth + 8 : x - 8} y={coeff.y + 5} textAnchor={coeff.value > 0 ? 'start' : 'end'} fill={textColor} fontSize="12" fontWeight="700">
                    {fmtSigned(coeff.value)}
                  </text>
                </g>
              );
            });
          })()}

          {/* Axis labels */}
          <text x="30" y="365" textAnchor="start" fill="#94a3b8" fontSize="12" fontWeight="600">
            −0.7
          </text>
          <text x="220" y="365" textAnchor="middle" fill="#94a3b8" fontSize="12" fontWeight="600">
            0.0
          </text>
          <text x="650" y="365" textAnchor="end" fill="#94a3b8" fontSize="12" fontWeight="600">
            +1.0
          </text>

          <text x="340" y="410" textAnchor="middle" fill="#cbd5e1" fontSize="12" fontWeight="600">
            Coefficient Value (Ridge-Regularized Estimate)
          </text>
          <text x="10" y="190" textAnchor="middle" fill="#cbd5e1" fontSize="12" fontWeight="600" transform="rotate(-90 10 190)">
            Socio-Cultural Modifier
          </text>
        </svg>

        <div className="methodology-note">
          <h5 className="amp-subhead">📊 Coefficient Interpretation & Sign Taxonomy</h5>
          <p>
            <strong>Amplifiers (Green Bars, c &gt; 0):</strong> Positive coefficients indicate that increasing the standardized modifier value increases the symbolic field strength Φ, thereby amplifying belief emergence probability. For example, C (Cultural Intensity) with c₁ = {fmt(OPTIMIZED_SIGMOID_COEFFICIENTS.c1)} acts as a strong amplifier.
          </p>
          <p>
            <strong>Suppressors (Red Bars, c &lt; 0):</strong> Negative coefficients indicate antagonistic effects—increasing the modifier suppresses Φ. For instance, D (Atomization/Fragmentation) with c₄ = {fmt(OPTIMIZED_SIGMOID_COEFFICIENTS.c4)} is a suppressor.
          </p>
          <p>
            <strong>Ridge L2 Regularization (α=1.0):</strong> The L2 penalty term ∥c∥² in the loss function shrinks large coefficients toward zero, preventing overfitting and ensuring generalization across {dataset.countries} countries and temporal panels. This is critical in the presence of multicollinearity among socio-cultural variables (e.g., Education and Social Capital are inherently correlated). Ridge solutions are unique and stable, unlike unregularized OLS which may be unstable when design matrices are ill-conditioned.
          </p>
          <p>
            <strong>Critical Sign Convention:</strong> Never manually negate suppressor coefficients. The negative sign is already encoded in the fitted parameter. The effect direction is c_i · m_i, so suppression occurs naturally when c_i &lt; 0 and m_i &gt; 0 (both positive in their own sign domains).
          </p>
          <p className="amp-note-italic">
            <strong>Reproducibility note:</strong> The production <em>headline</em> fit metrics shown in this app are the canonical panel-fit values
            (source of truth: <span className="formula">scripts/generate_headline_metrics.ts</span> via <span className="formula">npm run generate:headline-metrics</span>; data: <span className="formula">public/data/panel_canonical_23_countries_v1.csv</span>; output: <span className="formula">src/data/metrics/headline_metrics_authoritative.json</span>).
            The coefficient JSON also contains an optimizer/training summary ({training.date}), which we treat as metadata (not the headline).
            The runtime charts in Sections 3.5–3.6 recompute fit on the canonical country-year panel loaded in the browser; small differences can occur due to
            filtering, numeric rounding, and strict banding.
          </p>
        </div>
      </div>

      {/* Phi Sensitivity Curve */}
      <div className="coefficients-visualization-card">
        <h4 className="viz-title">3.3 Nonlinear Sensitivity: ∂Z/∂Φ = Z(1−Z)</h4>
        <p className="viz-subtitle">Responsiveness of belief emergence to symbolic field changes</p>
        
        <svg viewBox="0 0 750 420" className="sensitivity-chart amp-svg-maxh-400">
          <defs>
            <linearGradient id="sensitivityGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#ec4899" stopOpacity="0.8" />
            </linearGradient>
          </defs>

          {/* Axes */}
          <line x1="80" y1="40" x2="80" y2="320" stroke="#334155" strokeWidth="2.5" />
          <line x1="80" y1="320" x2="700" y2="320" stroke="#334155" strokeWidth="2.5" />

          {/* Grid lines */}
          {[0, 0.05, 0.1, 0.15, 0.2, 0.25].map((val, i) => (
            <g key={i}>
              <line x1="75" y1={320 - val * 840} x2="80" y2={320 - val * 840} stroke="#64748b" strokeWidth="1.5" />
              <text x="70" y={320 - val * 840 + 4} textAnchor="end" fill="#94a3b8" fontSize="11" fontWeight="600">
                {val.toFixed(2)}
              </text>
              <line x1="80" y1={320 - val * 840} x2="700" y2={320 - val * 840} stroke="#1e293b" strokeWidth="0.5" strokeDasharray="3,3" />
            </g>
          ))}

          {/* Sensitivity curve */}
          <path
            d={(() => {
              const points: string[] = [];
              for (let i = 0; i < phiSweep.xs.length; i++) {
                const phi = phiSweep.xs[i];
                const sens = phiSweep.dzdphi[i];
                const x = 80 + ((phi + 6) / 12) * 620;
                const y = 320 - clamp(sens, 0, 0.25) * 840;
                points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
              }
              return points.join(' ');
            })()}
            stroke="url(#sensitivityGrad)"
            strokeWidth="3.5"
            fill="none"
          />

          {/* Max sensitivity marker */}
          <circle cx="390" cy={320 - 0.25 * 840} r="6" fill="#f59e0b" stroke="#fff" strokeWidth="2.5" />
          <text x="405" y={320 - 0.25 * 840 + 5} fill="#f59e0b" fontSize="12" fontWeight="700">
            Max: 0.25 (Φ≈0, Z≈0.5)
          </text>

          {/* Axis labels */}
          <text x="80" y="345" textAnchor="middle" fill="#94a3b8" fontSize="12" fontWeight="600">
            −6
          </text>
          <text x="390" y="345" textAnchor="middle" fill="#94a3b8" fontSize="12" fontWeight="600">
            0
          </text>
          <text x="700" y="345" textAnchor="middle" fill="#94a3b8" fontSize="12" fontWeight="600">
            +6
          </text>

          <text x="390" y="375" textAnchor="middle" fill="#cbd5e1" fontSize="13" fontWeight="600">
            Φ (Symbolic Field Strength)
          </text>
          <text x="25" y="180" textAnchor="middle" fill="#cbd5e1" fontSize="13" fontWeight="600" transform="rotate(-90 25 180)">
            Sensitivity: ∂Z/∂Φ
          </text>
        </svg>

        <div className="viz-math amp-viz-math-lg">
          <BlockMath
            math={'\\displaystyle \\frac{\\partial Z}{\\partial \\Phi} = Z(1-Z),\\qquad \\frac{\\partial Z}{\\partial m_i} = c_i \\cdot Z(1-Z)'}
            renderError={() => <span className="formula">∂Z/∂Φ = Z(1−Z), ∂Z/∂mᵢ = cᵢ·Z(1−Z)</span>}
          />
        </div>

        <div className="methodology-note">
          <h5 className="amp-subhead">� Sensitivity & Phase Dynamics</h5>
          <p>
            <strong>Peak Responsiveness at Z ≈ 0.5:</strong> ∂Z/∂Φ = Z(1−Z) reaches maximum (0.25) at the critical threshold, where societies are most malleable to symbolic load. This is why social movements concentrate efforts during uncertainty—populations are maximally responsive.
          </p>
          <p>
            <strong>Saturation at Extremes:</strong> Locked-in societies (Z → 0 or Z → 1) resist perturbation (∂Z/∂Φ → 0). A secular society lacks the network density for belief propagation; a religious society has maxed out social feedback.
          </p>
          <p>
            <strong>Path Dependence:</strong> Modifier effects scale with Z(1−Z): the same coefficient produces a large marginal response near the mid-range (around Z≈0.5) and a much smaller response near saturation (Z close to 0 or 1).
          </p>
          <p className="amp-note-italic">
            <strong>Tipping Points:</strong> Systems near Z ≈ 0.5 are unstable; small shocks trigger nonlinear amplification. Both secularization and de-secularization follow identical phase mechanics.
          </p>
        </div>
      </div>

      {/* Logit-Linearization */}
      <div className="coefficients-visualization-card">
        <h4 className="viz-title">3.4 Logit-Linearization (High-Value Insight)</h4>
        <p className="viz-subtitle">Additive structure in log-odds space justifies linear Φ term</p>
        
        <div className="methodology-note">
          <p>
            Taking the logit of Z reveals an additive structure that underpins the exponential modulation:
          </p>
        </div>

        <div className="viz-math amp-viz-math-lg">
          <BlockMath
            math={'\\displaystyle \\frac{Z}{1-Z} = \\frac{B\\,e^{\\Phi}}{k} \\quad\\Rightarrow\\quad \\mathrm{logit}(Z) = \\ln\\left(\\frac{B}{k}\\right) + \\Phi'}
            renderError={() => <span className="formula">Z/(1−Z) = (B·e^Φ)/k ⇒ logit(Z) = ln(B/k) + Φ</span>}
          />
        </div>

        <div className="methodology-note">
          <p>
            <strong>Scientific interpretation:</strong> In log-odds space, amplifier and suppressor contributions are additive. 
            Small changes in Φ produce proportional (not exponential) changes in log-odds. The interaction and quadratic terms encode 
            deviations from additivity, capturing synergy, antagonism, and saturation dynamics.
          </p>
          <p>
            This formulation aligns with logistic regression in epidemiology and econometrics, where log-odds ratios represent 
            multiplicative effects on belief emergence probability.
          </p>
        </div>
      </div>
      <div className="coefficients-visualization-card">
        <h4 className="viz-title">3.4.b Energy-Field Interpretation</h4>
        <p className="viz-subtitle">Linking symbolic load to log-odds and curvature</p>
        <div className="methodology-note">
          <p>
            In logit space, Φ behaves like an additive energy field: amplifiers raise log-odds linearly, suppressors lower it, and
            quadratic/interaction terms bend the field. Local curvature controls acceleration toward belief tipping points.
          </p>
        </div>
        <div className="viz-math amp-viz-math-lg">
          <BlockMath
            math={'\\displaystyle \\mathrm{logit}(Z)=\\Phi+\\ln\\frac{B}{k},\\qquad \\frac{d^2Z}{d\\Phi^2}= (1-2Z)\\,Z(1-Z)'}
            renderError={() => <span className="formula">logit(Z)=Φ+ln(B/k), d²Z/dΦ²=(1−2Z)·Z(1−Z)</span>}
          />
        </div>
        <div className="methodology-note">
          <strong>Implications:</strong> (i) Small Φ changes map to proportional odds shifts; (ii) curvature peaks near Z≈0.5, signalling
          highest instability; (iii) negative curvature at Z&gt;0.5 enforces saturation, preventing runaway growth. This mirrors energy
          landscapes in statistical mechanics where Φ tilts the potential surface.
        </div>
      </div>
      </div>

      {/* Second column: Empirical Validation */}
      <div className="viz-grid">
      {/* Empirical Validation */}
      <div className="coefficients-visualization-card">
        <h4 className="viz-title">3.5 Empirical Validation: Observed vs Predicted</h4>
        <p className="viz-subtitle">Scatter plot with canonical panel data ({validation.points.length} observations, {dataset.countries} countries)</p>
        
        <svg viewBox="0 0 500 260" className="validation-chart amp-svg-maxh-240">
          {/* Axes */}
          <line x1="70" y1="280" x2="470" y2="280" stroke="#334155" strokeWidth="2" />
          <line x1="70" y1="60" x2="70" y2="280" stroke="#334155" strokeWidth="2" />
          
          {/* Grid lines */}
          {[0.2, 0.4, 0.6, 0.8].map((val) => (
            <g key={val}>
              <line x1="70" y1={280 - val * 220} x2="470" y2={280 - val * 220} stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2,2" />
              <line x1={70 + val * 400} y1="60" x2={70 + val * 400} y2="280" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2,2" />
            </g>
          ))}
          
          {/* y=x reference */}
          <line x1="70" y1="280" x2="470" y2="60" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4,4" />
          
          {/* Points */}
          {validation.points.map((p, i) => {
            const x = 70 + axisT(p.x) * 400;
            const y = 280 - axisT(p.y) * 220;
            return <circle key={i} cx={x} cy={y} r={2.5} fill="#10b981" fillOpacity="0.7" stroke="#10b981" strokeWidth="0.5" />;
          })}
          
          {/* Axis ticks */}
          {[TRAIN_MIN, 0.2, 0.4, 0.6, 0.8, TRAIN_MAX].map((val) => (
            <g key={val}>
              <line x1="65" y1={280 - axisT(val) * 220} x2="70" y2={280 - axisT(val) * 220} stroke="#64748b" strokeWidth="1" />
              <text x="60" y={280 - axisT(val) * 220 + 4} textAnchor="end" fill="#94a3b8" fontSize="9">
                {axisLabel(val)}
              </text>
              <line x1={70 + axisT(val) * 400} y1="280" x2={70 + axisT(val) * 400} y2="285" stroke="#64748b" strokeWidth="1" />
              <text x={70 + axisT(val) * 400} y="295" textAnchor="middle" fill="#94a3b8" fontSize="9">
                {axisLabel(val)}
              </text>
            </g>
          ))}
          
          {/* Labels */}
          <text x="270" y="320" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="600">
            Predicted Z (calculateModel)
          </text>
          <text x="30" y="170" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="600" transform="rotate(-90 30 170)">
            Observed Z (Panel)
          </text>

          {/* Metrics - Using actual production model performance */}
          <text x="270" y="40" textAnchor="middle" fill="#f1f5f9" fontSize="13" fontWeight="600">
            Runtime Fit: R² = {fmt(validation.r2)}, r = {fmt(validation.corr)} (N = {validation.points.length})
          </text>
          <text x="270" y="55" textAnchor="middle" fill="#94a3b8" fontSize="10">
            Runtime: MAE = {fmt(validation.mae)}, RMSE = {fmt(validation.rmse)} · Production headline: R² = {fmt(headline.r2)}, r = {fmt(headline.correlation)}
          </text>
        </svg>

        <div className="methodology-note">
          <strong>Production headline (canonical panel-fit):</strong> R² = {fmt(headline.r2)}, Correlation = {fmt(headline.correlation)}, MAE = {fmt(headline.mae)}.
          <span className="ma-small-muted"> Training metadata (coeff JSON, {training.date}): R² = {fmt(training.metrics.r2)}, r = {fmt(training.metrics.correlation)}, MAE = {fmt(training.metrics.mae)}.</span>
          All predictions computed via calculateModel() (unified calculator, readonly). Points cluster near diagonal, indicating close descriptive correspondence.
          {(loading || error) && <div className="validation-status">{loading ? ' Loading panel data…' : ` Panel load error: ${error}`}</div>}
        </div>
      </div>

      {/* Calibration Curve */}
      <div className="coefficients-visualization-card">
        <h4 className="viz-title">3.6 Calibration Curve: Decile Bins</h4>
        <p className="viz-subtitle">Binned mean observed vs mean predicted—ideal calibration lies on diagonal</p>
        
        <svg viewBox="0 0 500 260" className="validation-chart amp-svg-maxh-240">
          {/* Axes */}
          <line x1="70" y1="280" x2="470" y2="280" stroke="#334155" strokeWidth="2" />
          <line x1="70" y1="60" x2="70" y2="280" stroke="#334155" strokeWidth="2" />
          
          {/* Grid lines */}
          {[0.2, 0.4, 0.6, 0.8].map((val) => (
            <g key={val}>
              <line x1="70" y1={280 - axisT(val) * 220} x2="470" y2={280 - axisT(val) * 220} stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2,2" />
              <line x1={70 + axisT(val) * 400} y1="60" x2={70 + axisT(val) * 400} y2="280" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2,2" />
            </g>
          ))}
          
          {/* Perfect calibration line (y=x) */}
          <line x1="70" y1="280" x2="470" y2="60" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4,4" />
          
          {/* Calibration points */}
          {validation.bins.map((b, i) => {
            const x = 70 + axisT(b.predMean) * 400;
            const y = 280 - axisT(b.obsMean) * 220;
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={5} fill="#10b981" fillOpacity="0.9" stroke="#fff" strokeWidth="1.5" />
                <text x={x} y={y - 10} textAnchor="middle" fill="#10b981" fontSize="8" fontWeight="600">
                  {i + 1}
                </text>
              </g>
            );
          })}
          
          {/* Axis ticks */}
          {[TRAIN_MIN, 0.2, 0.4, 0.6, 0.8, TRAIN_MAX].map((val) => (
            <g key={val}>
              <line x1="65" y1={280 - axisT(val) * 220} x2="70" y2={280 - axisT(val) * 220} stroke="#64748b" strokeWidth="1" />
              <text x="60" y={280 - axisT(val) * 220 + 4} textAnchor="end" fill="#94a3b8" fontSize="9">
                {axisLabel(val)}
              </text>
              <line x1={70 + axisT(val) * 400} y1="280" x2={70 + axisT(val) * 400} y2="285" stroke="#64748b" strokeWidth="1" />
              <text x={70 + axisT(val) * 400} y="295" textAnchor="middle" fill="#94a3b8" fontSize="9">
                {axisLabel(val)}
              </text>
            </g>
          ))}

          <text x="270" y="320" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="600">
            Mean Predicted Z (Decile Bin)
          </text>
          <text x="30" y="170" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="600" transform="rotate(-90 30 170)">
            Mean Observed Z
          </text>
          <text x="270" y="40" textAnchor="middle" fill="#f1f5f9" fontSize="13" fontWeight="600">
            Probabilistic Calibration ({validation.bins.length} bins)
          </text>
        </svg>

        <div className="viz-math amp-viz-math-md">
          <BlockMath
            math={'\\displaystyle \\text{Calibration bins: } (\\bar{\\hat{z}}_b,\\bar{z}_b),\\; b=1,\\dots,10;\\quad \\bar{z}_b \\approx \\bar{\\hat{z}}_b \\text{ if well-calibrated}'}
            renderError={() => <span className="formula">Bins: (mean ẑ, mean z); good calibration ⇒ mean z ≈ mean ẑ</span>}
          />
        </div>

        <div className="methodology-note">
          <strong>Perfect Calibration:</strong> Points lie on diagonal (orange dashed line) when predicted probabilities match empirical frequencies. 
          Bins above diagonal = model under-predicts; below = over-predicts. Current calibration shows excellent alignment across all deciles.
        </div>
      </div>
      </div>

      {/* Comprehensive Amplifier Analysis - Two Column Layout */}
      <div className="viz-grid">
      <div className="coefficients-visualization-card">
        <h4 className="viz-title">3.7a Main-Effect Coefficient Magnitudes</h4>
        <p className="viz-subtitle">Signed amplification/suppression with domain classification</p>
        
        <svg viewBox="0 0 500 480" className="comprehensive-amplifier-chart">
          <defs>
            <linearGradient id="ampGradComp" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.9" />
            </linearGradient>
            <linearGradient id="suppGradComp" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.7" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {/* Main coefficient bars */}
          <g transform="translate(40, 30)">
            {/* Axes */}
            <line x1="200" y1="10" x2="200" y2="400" stroke="#334155" strokeWidth="2" />
            <line x1="0" y1="400" x2="400" y2="400" stroke="#334155" strokeWidth="2" />
            <line x1="200" y1="10" x2="200" y2="400" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4,4" />

            {(() => {
              const modifiers = [
                { label: 'C', name: 'Cultural Intensity', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c1, domain: 'Symbolic' },
                { label: 'M', name: 'Media Environment', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c2, domain: 'Information' },
                { label: 'T', name: 'Trauma/Shock', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c3, domain: 'Affective' },
                { label: 'D', name: 'Social Atomization', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c4, domain: 'Cohesion' },
                { label: 'G', name: 'Governance Capacity', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c5, domain: 'Institutional' },
                { label: 'E', name: 'Education Capacity', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c6, domain: 'Human Capital' },
                { label: 'S', name: 'Social Support', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c7, domain: 'Networks' },
                { label: 'R', name: 'Welfare Capacity', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c8, domain: 'Redistribution' },
              ];

              const maxAbs = Math.max(...modifiers.map(m => Math.abs(m.value)));
              const scale = 180 / maxAbs;
              const barHeight = 40;
              const spacing = 50;

              return modifiers.map((mod, i) => {
                const y = 20 + i * spacing;
                const barWidth = Math.abs(mod.value) * scale;
                const x = mod.value > 0 ? 200 : 200 - barWidth;
                const color = mod.value > 0 ? 'url(#ampGradComp)' : 'url(#suppGradComp)';
                const textColor = mod.value > 0 ? '#10b981' : '#ef4444';

                return (
                  <g key={i}>
                    <rect x={x} y={y} width={barWidth} height={barHeight} fill={color} filter="url(#glow)" />
                    <text x="195" y={y + 22} textAnchor="end" fill="#e2e8f0" fontSize="11" fontWeight="600">
                      {mod.label}
                    </text>
                    <text x={mod.value > 0 ? x + barWidth + 8 : x - 8} y={y + 22} textAnchor={mod.value > 0 ? 'start' : 'end'} fill={textColor} fontSize="12" fontWeight="700">
                      {fmtSigned(mod.value)}
                    </text>
                  </g>
                );
              });
            })()}

            {/* Axis labels */}
            <text x="0" y="420" textAnchor="start" fill="#64748b" fontSize="10">
              −0.7
            </text>
            <text x="200" y="420" textAnchor="middle" fill="#64748b" fontSize="10">
              0.0
            </text>
            <text x="400" y="420" textAnchor="end" fill="#64748b" fontSize="10">
              +1.0
            </text>
          </g>
        </svg>

        <div className="methodology-note">
          <p className="amp-note">
            <strong>8-Factor Taxonomy:</strong> C (culture) amplifies; M (media) amplifies; T (trauma) amplifies; D (atomization) suppresses; G (governance) amplifies; E (education) amplifies; S (social capital) amplifies; R (redistribution) amplifies. Combined effect is additive in log-odds space, with nonlinear modulation through ∂Z/∂Φ = Z(1−Z).
          </p>
        </div>
      </div>

      {/* Sensitivity Matrix - Second Column */}
      <div className="coefficients-visualization-card">
        <h4 className="viz-title">3.7b Marginal Effect Sensitivity Matrix</h4>
        <p className="viz-subtitle">∂Z/∂mᵢ = cᵢ · Z(1−Z) across belief states</p>
        
        <svg viewBox="0 0 620 480" className="sensitivity-matrix-chart">
          <defs>
            <linearGradient id="ampGradComp" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.9" />
            </linearGradient>
            <linearGradient id="suppGradComp" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.7" />
            </linearGradient>
          </defs>

          {/* Sensitivity matrix */}
          <g transform="translate(40, 30)">
            {(() => {
              const modifiers = ['C', 'M', 'T', 'D', 'G', 'E', 'S', 'R'];
              const coeffs = [
                OPTIMIZED_SIGMOID_COEFFICIENTS.c1,
                OPTIMIZED_SIGMOID_COEFFICIENTS.c2,
                OPTIMIZED_SIGMOID_COEFFICIENTS.c3,
                OPTIMIZED_SIGMOID_COEFFICIENTS.c4,
                OPTIMIZED_SIGMOID_COEFFICIENTS.c5,
                OPTIMIZED_SIGMOID_COEFFICIENTS.c6,
                OPTIMIZED_SIGMOID_COEFFICIENTS.c7,
                OPTIMIZED_SIGMOID_COEFFICIENTS.c8,
              ];
              // Illustrative belief regimes spanning the full canonical interior band.
              const zValues = [TRAIN_MIN, 0.25, 0.5, 0.75, TRAIN_MAX];
              const cellWidth = 90;
              const cellHeight = 45;
              const startX = 100;
              const startY = 20;

              // Column headers (Z values)
              return (
                <>
                  <text x="50" y={startY + 25} fill="#94a3b8" fontSize="11" fontWeight="600">
                    Mod
                  </text>
                  {zValues.map((z, i) => (
                    <text key={i} x={startX + i * cellWidth + cellWidth / 2} y={startY + 15} textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="600">
                      Z={labelZSample(z)}
                    </text>
                  ))}

                  {/* Rows */}
                  {modifiers.map((mod, row) => {
                    const c = coeffs[row];
                    const y = startY + 35 + row * cellHeight;
                    
                    return (
                      <g key={row}>
                        <text x="50" y={y + 26} fill="#e2e8f0" fontSize="11" fontWeight="600">
                          {mod}
                        </text>
                        {zValues.map((z, col) => {
                          const marginal = c * z * (1 - z);
                          const maxMarginal = Math.max(...coeffs.map(ci => Math.abs(ci) * 0.25));
                          const intensity = Math.abs(marginal) / maxMarginal;
                          const color = marginal > 0 ? `rgba(16, 185, 129, ${intensity * 0.8})` : `rgba(239, 68, 68, ${intensity * 0.8})`;
                          const x = startX + col * cellWidth;
                          
                          return (
                            <g key={col}>
                              <rect x={x} y={y} width={cellWidth - 2} height={cellHeight - 2} fill={color} stroke="#1e293b" strokeWidth="0.5" />
                              <text x={x + cellWidth / 2} y={y + cellHeight / 2 + 5} textAnchor="middle" fill="#f1f5f9" fontSize="10" fontWeight="600">
                                {marginal.toFixed(3)}
                              </text>
                            </g>
                          );
                        })}
                      </g>
                    );
                  })}

                  {/* Legend */}
                  <text x="290" y={startY + 410} textAnchor="middle" fill="#94a3b8" fontSize="9" fontStyle="italic">
                    Color intensity ∝ |marginal effect|; Max at Z ≈ 0.5
                  </text>
                </>
              );
            })()}
          </g>
        </svg>

        <div className="viz-math amp-viz-math-lg-tight">
          <BlockMath
            math={'\\displaystyle \\frac{\\partial Z}{\\partial m_i} = c_i \\cdot Z(1-Z),\\qquad \\text{max at } Z=0.5'}
            renderError={() => <span className="formula">∂Z/∂mᵢ = cᵢ·Z(1−Z), max at Z=0.5</span>}
          />
        </div>
      </div>
      </div>

      {/* Second viz-grid for 3.7c and 3.7d */}
      <div className="viz-grid">
      <div className="coefficients-visualization-card">
        <h4 className="viz-title">3.7c Key Interaction Terms</h4>
        <p className="viz-subtitle">Non-additive cross-factor effects</p>
        
        <svg viewBox="0 0 560 280" className="interaction-chart">
          <g transform="translate(20, 20)">
            {(() => {
              const interactions = [
                { term: 'C × M', value: INTERACTION_TERMS.c_cm, desc: 'Culture mitigates media' },
                { term: 'D × T', value: INTERACTION_TERMS.c_dt, desc: 'Atomization dampens trauma' },
                { term: 'E × S', value: INTERACTION_TERMS.c_es, desc: 'Education + social synergy' },
                { term: 'Y × R', value: INTERACTION_TERMS.c_yr, desc: 'Inequality × welfare' },
                { term: 'X × Y', value: INTERACTION_TERMS.c_xy, desc: 'Settlement × inequality' },
                { term: 'T × R', value: INTERACTION_TERMS.c_tr, desc: 'Trauma × welfare buffer' },
                { term: 'G × R', value: INTERACTION_TERMS.c_gr, desc: 'Governance × redistribution' },
              ];

              const cols = 2;
              const cellWidth = 250;
              const cellHeight = 70;
              
              return interactions.map((int, i) => {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const x = col * (cellWidth + 10);
                const y = row * cellHeight;
                const color = int.value > 0 ? '#10b981' : '#ef4444';
                return (
                  <g key={i}>
                    <rect x={x} y={y} width={cellWidth - 10} height={55} fill="rgba(30, 41, 59, 0.5)" stroke={color} strokeWidth="1.5" rx="4" />
                    <text x={x + cellWidth / 2 - 5} y={y + 23} textAnchor="middle" fill="#f1f5f9" fontSize="11" fontWeight="700">
                      {int.term}: {fmtSigned(int.value)}
                    </text>
                    <text x={x + cellWidth / 2 - 5} y={y + 40} textAnchor="middle" fill="#94a3b8" fontSize="9">
                      {int.desc}
                    </text>
                  </g>
                );
              });
            })()}
          </g>
        </svg>
        
        <div className="methodology-note">
          <strong>Interaction Interpretation:</strong> C × M indicates cultural resilience against secularization. 
          D × T shows atomization weakens trauma-belief coupling. E × S reveals education-social capital complementarity.
        </div>
      </div>

      <div className="coefficients-visualization-card">
        <h4 className="viz-title">3.7d Complete Mathematical Framework</h4>
        <p className="viz-subtitle">Unified field equation with interaction and quadratic terms</p>
        
        <div className="viz-math amp-viz-math-lg-125">
          <BlockMath
            math={'\\displaystyle \\begin{aligned}\n\\Phi &= \\phi_0 + \\sum_{i=1}^{8} c_i m_{i,\\text{std}} + \\sum_{j=1}^{7} I_j + \\sum_{k=1}^{4} Q_k\\\\[0.3em]\n\\frac{\\partial Z}{\\partial m_i} &= c_i \\cdot Z(1-Z) \\cdot \\left(1 + \\frac{\\partial}{\\partial m_i}\\sum I_j + \\frac{\\partial}{\\partial m_i}\\sum Q_k\\right)\\\\[0.3em]\n\\text{where } I_j &= c_{ij} \\cdot m_i \\cdot m_j \\text{ (interactions)}, \\quad Q_k = c_{kk} \\cdot m_k^2 \\text{ (quadratics)}\n\\end{aligned}'}
            renderError={() => <span className="formula">Φ = φ₀ + Σcᵢmᵢ + ΣIⱼ + ΣQₖ; ∂Z/∂mᵢ = cᵢ·Z(1−Z)·[1 + interaction + quadratic terms]</span>}
          />
        </div>

        <div className="methodology-note">
          <p>
            <strong>Methodological rigor:</strong> Ridge-regularized coefficients (L2 penalty, α=1.0) with 7 interaction terms and 4 quadratic terms. 
            Main effects (3.7a) show sign taxonomy; sensitivity matrix (3.7b) reveals ∂Z/∂mᵢ = cᵢ·Z(1−Z) maximizes at Z ≈ 0.5.
          </p>
          <p>
            <strong>Non-additive Effects:</strong> Interactions (3.7c) capture context-dependent modulation. ∂²Z/∂C∂M = c_cm·Z(1−Z) enables 
            cultural resilience predictions. Quadratics encode saturation (C², M², T², E²).
          </p>
          <p>
            <strong>Empirical Validation (headline, canonical panel-fit):</strong> R² = {fmt(
              headline.r2,
            )}, Correlation = {fmt(headline.correlation)} across {dataset.countries} countries.
            MAE = {fmt(headline.mae)} and Bias ≈ {fmt(headline.bias)}.
            <span className="ma-small-muted"> Training metadata (coeff JSON): R² = {fmt(training.metrics.r2)}, r = {fmt(training.metrics.correlation)}, MAE = {fmt(training.metrics.mae)}.</span>
          </p>
        </div>
      </div>
      </div>

      {/* Third viz-grid for 3.8 and 3.9 */}
      <div className="viz-grid">
      <div className="coefficients-visualization-card">
        <h4 className="viz-title">3.8 Synergistic Phase Transitions</h4>
        <p className="viz-subtitle">Threshold effects and tipping points</p>
        
        <svg viewBox="0 0 520 280" className="phase-chart">
          <defs>
            <linearGradient id="phaseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#ec4899" stopOpacity="0.9" />
            </linearGradient>
          </defs>

          <line x1="60" y1="220" x2="480" y2="220" stroke="#334155" strokeWidth="2" />
          <line x1="60" y1="50" x2="60" y2="220" stroke="#334155" strokeWidth="2" />

          {/* Z curve from phiSweep */}
          <path
            d={(() => {
              const points: string[] = [];
              for (let i = 0; i < phiSweep.xs.length; i++) {
                const phi = phiSweep.xs[i];
                const z = phiSweep.zs[i];
                const x = 60 + ((phi + 6) / 12) * 420;
                const y = 220 - axisT(z) * 170;
                points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
              }
              return points.join(' ');
            })()}
            stroke="url(#phaseGrad)"
            strokeWidth="3"
            fill="none"
          />

          {/* Critical threshold markers */}
          <line x1="270" y1="50" x2="270" y2="220" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4,4" />
          <text x="275" y="65" fill="#f59e0b" fontSize="11" fontWeight="600">
            Critical Φ≈0
          </text>

          <text x="270" y="250" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="600">
            Φ (Combined Symbolic Load)
          </text>
          <text x="30" y="135" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="600" transform="rotate(-90 30 135)">
            Z (Belief State)
          </text>

          <text x="120" y="210" fill="#3b82f6" fontSize="10">
            Low-Z (Secular)
          </text>
          <text x="350" y="70" fill="#ec4899" fontSize="10">
            High-Z (Religious)
          </text>
        </svg>

        <div className="viz-math amp-viz-math-lg">
          <BlockMath
            math={'\\displaystyle \\Phi_{\\text{crit}} \\approx 0 \\Rightarrow Z \\approx 0.5,\\qquad \\frac{d^2 Z}{d\\Phi^2} = Z(1-Z)(1-2Z)'}
            renderError={() => <span className="formula">Φ_crit ≈ 0 ⇒ Z ≈ 0.5, d²Z/dΦ² = Z(1−Z)(1−2Z)</span>}
          />
        </div>
        
        <div className="methodology-note">
          <p>
            <strong>Phase Shift:</strong> Combined amplifier load (C, T, G, R) exceeding critical values triggers transitions from low-Z to high-Z states. 
            System is non-linear: small Φ perturbations near inflection points cascade into large-scale belief reorganization.
          </p>
        </div>
      </div>

      <div className="coefficients-visualization-card">
        <h4 className="viz-title">3.9 Synthesis: Amplifiers as Energy Fields</h4>
        <p className="viz-subtitle">Unifying interpretation of exponential modulation</p>
        
        <svg viewBox="0 0 700 350" className="energy-field-chart amp-svg-maxh-330">
          <defs>
            <linearGradient id="potentialGrad" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.3" />
              <stop offset="50%" stopColor="#7c3aed" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#ec4899" stopOpacity="0.7" />
            </linearGradient>
          </defs>

          {/* Axes */}
          <line x1="80" y1="280" x2="650" y2="280" stroke="#334155" strokeWidth="2.5" />
          <line x1="80" y1="50" x2="80" y2="280" stroke="#334155" strokeWidth="2.5" />

          {/* Grid */}
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={i} x1={80 + i * 142.5} y1="275" x2={80 + i * 142.5} y2="285" stroke="#64748b" strokeWidth="1" />
          ))}

          {/* Potential energy curves for different Phi levels */}
          {/* Low Phi (secular state) */}
          <path
            d="M 120 250 Q 200 200 280 250 T 440 250"
            stroke="#3b82f6"
            strokeWidth="2.5"
            fill="none"
            opacity="0.6"
          />
          <text x="130" y="235" fill="#3b82f6" fontSize="11" fontWeight="600">Φ &lt; 0 (Secular)</text>

          {/* Critical Phi (bifurcation) */}
          <path
            d="M 120 240 Q 200 120 280 240"
            stroke="#f59e0b"
            strokeWidth="3"
            fill="none"
          />
          <path
            d="M 280 240 Q 360 120 440 240"
            stroke="#f59e0b"
            strokeWidth="3"
            fill="none"
          />
          <circle cx="280" cy="240" r="4" fill="#f59e0b" />
          <text x="260" y="215" fill="#f59e0b" fontSize="11" fontWeight="600">Φ ≈ 0 (Critical)</text>

          {/* High Phi (religious state) */}
          <path
            d="M 120 250 Q 200 100 280 50 T 440 50"
            stroke="#ec4899"
            strokeWidth="2.5"
            fill="none"
            opacity="0.6"
          />
          <text x="340" y="75" fill="#ec4899" fontSize="11" fontWeight="600">Φ &gt; 0 (Religious)</text>

          {/* Low-Z and High-Z minima markers */}
          <circle cx="150" cy="250" r="3" fill="#3b82f6" />
          <text x="132" y="265" fill="#3b82f6" fontSize="10">Z ≈ 0.0001</text>

          <circle cx="410" cy="50" r="3" fill="#ec4899" />
          <text x="392" y="35" fill="#ec4899" fontSize="10">Z ≈ 0.9999</text>

          {/* Arrow showing transition */}
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <polygon points="0 0, 10 3, 0 6" fill="#fbbf24" />
            </marker>
          </defs>
          <path d="M 320 220 Q 350 140 380 80" stroke="#fbbf24" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)" strokeDasharray="5,5" />
          <text x="330" y="145" fill="#fbbf24" fontSize="10" fontWeight="600">Tipping</text>
          <text x="330" y="160" fill="#fbbf24" fontSize="10" fontWeight="600">Point</text>

          {/* Axis labels */}
          <text x="80" y="300" textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="600">
            −Φ
          </text>
          <text x="365" y="300" textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="600">
            +Φ
          </text>
          <text x="365" y="315" textAnchor="middle" fill="#cbd5e1" fontSize="12" fontWeight="600">
            Symbolic Field Strength
          </text>
          <text x="50" y="165" textAnchor="middle" fill="#cbd5e1" fontSize="12" fontWeight="600" transform="rotate(-90 50 165)">
            Free Energy (Potential)
          </text>
        </svg>

        <div className="methodology-note">
          <p>
            Amplifiers act as an external "energy" field in collective belief systems. Combined symbolic load exceeding critical thresholds 
            triggers transitions from low-Z (dispersed) to high-Z (coordinated) states. Nonlinear phase behavior emerges from exponential 
            modulation of structural base by Φ, amplified by interactions and quadratics encoding synergy, antagonism, and saturation.
          </p>
          <p>
            <strong>Scientific Validation:</strong> All Φ and Z computed via calculateModel.ts. Panel data: {validation.points.length} obs, 
            {dataset.countries} countries. <strong>Production headline (canonical panel-fit):</strong> R² = {fmt(headline.r2)}, Correlation = {fmt(headline.correlation)}, MAE = {fmt(headline.mae)}.
            <span className="ma-small-muted"> Training metadata (coeff JSON): R² = {fmt(training.metrics.r2)}, r = {fmt(training.metrics.correlation)}, MAE = {fmt(training.metrics.mae)}.</span>
          </p>
        </div>
      </div>
      </div>

      <div className="section-end-indicator">
        <div className="end-line"></div>
        <div className="end-badge">
          <span className="end-text">End of Section 3</span>
          <div className="end-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
        <div className="end-line"></div>
      </div>
    </div>
  );

  return (
    <SectionTemplate
      title="Amplifiers of Belief Emergence"
      sectionIndex="Section 3"
      subtitle="Signed socio-cultural intensifiers and symbolic field dynamics"
      description="Main effects, interactions, quadratics, and nonlinear sensitivities in Φ"
    >
      {content}
    </SectionTemplate>
  );
};

export default AmplifiersSection;
