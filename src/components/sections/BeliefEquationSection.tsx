
import React, { useMemo } from 'react';
import SectionTemplate from './SectionTemplate.tsx';
import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';
import {
  OPTIMIZED_SIGMOID_COEFFICIENTS,
  OPTIMIZED_STRUCTURAL_PARAMS,
} from '../../data/feCoefficients';
import {
  getProductionDatasetMetadata,
  getProductionHeadlineMetrics,
  getProductionTrainingMetadata,
} from '../../data/modelMetrics';
import { useDataContext } from '../../contexts/DataContext';
import { STRUCTURAL_MAX, STRUCTURAL_MIN } from '../../utils/modelContract';
import { predictFromPanelRow } from '../../utils/validation/panelPredict';
import { computeBias } from '../../utils/metrics';

const BeliefEquationSection: React.FC = () => {
  const fmt = (value: number) => value.toFixed(3);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const headline = useMemo(() => getProductionHeadlineMetrics(), []);
  const training = useMemo(() => getProductionTrainingMetadata(), []);
  const dataset = useMemo(() => getProductionDatasetMetadata(), []);

  // Canonical interior band used throughout the app for probability-like quantities.
  // (Avoids exact 0/1 which can destabilize logs/fractional powers downstream.)
  const STRUCTURAL_SPAN = Math.max(1e-12, STRUCTURAL_MAX - STRUCTURAL_MIN);

  // Aliases used in some chart annotations (kept for readability).
  const TRAIN_MIN = STRUCTURAL_MIN;
  const TRAIN_MAX = STRUCTURAL_MAX;

  const axisT = (z: number) => clamp((z - STRUCTURAL_MIN) / STRUCTURAL_SPAN, 0, 1);
  const axisLabel = (z: number) => {
    if (Math.abs(z - STRUCTURAL_MIN) < 1e-12) return STRUCTURAL_MIN.toFixed(4);
    if (Math.abs(z - STRUCTURAL_MAX) < 1e-12) return STRUCTURAL_MAX.toFixed(4);
    return z.toFixed(1);
  };

  // Individual model icons
  const LinearIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 18L21 6" />
    </svg>
  );

  const SaturationIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 18C9 12 15 12 21 6" />
    </svg>
  );

  const ThresholdIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 18L9 18L12 6L15 18L21 6" />
    </svg>
  );

  const DualIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 18L9 12L15 6L21 12" />
      <path d="M3 12L9 6L15 12L21 18" />
    </svg>
  );

  const ExtendedIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
      <path d="M12 8v8" />
    </svg>
  );

  const renderVisualizationGrid = (runtime: { r2: number; corr: number; mae: number; rmse: number; n: number } | null) => (
    <div className="viz-grid viz-grid-wide">
      {/* Coefficient Visualization */}
      <div className="coefficients-visualization-card">
        <h3 className="card-title">1.4.1 Coefficient Magnitude &amp; Direction</h3>
        <svg viewBox="0 0 600 300" className="coeff-chart" role="img" aria-label="Belief equation coefficient contributions chart" focusable="false">
          <defs>
            <linearGradient id="ampGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
            </linearGradient>
            <linearGradient id="suppGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.8" />
            </linearGradient>
          </defs>

          <text x="300" y="20" textAnchor="middle" className="chart-title" fill="#e2e8f0" fontSize="14" fontWeight="600">
            Modifier Coefficients: Amplifiers (+) vs Suppressors (−)
          </text>

          <line x1="300" y1="40" x2="300" y2="280" stroke="#475569" strokeWidth="2" />

          <text x="450" y="55" textAnchor="middle" fill="#10b981" fontSize="12" fontWeight="600">
            Amplifiers
          </text>
          <rect x="300" y="70" width={Math.abs(OPTIMIZED_SIGMOID_COEFFICIENTS.c1) * 120} height="20" fill="url(#ampGrad)" />
          <text x="310" y="85" fill="#e2e8f0" fontSize="11">
            C: {fmt(OPTIMIZED_SIGMOID_COEFFICIENTS.c1)}
          </text>

          <rect x="300" y="100" width={Math.abs(OPTIMIZED_SIGMOID_COEFFICIENTS.c3) * 120} height="20" fill="url(#ampGrad)" />
          <text x="310" y="115" fill="#e2e8f0" fontSize="11">
            T: {fmt(OPTIMIZED_SIGMOID_COEFFICIENTS.c3)}
          </text>

          <rect x="300" y="130" width={Math.abs(OPTIMIZED_SIGMOID_COEFFICIENTS.c5) * 120} height="20" fill="url(#ampGrad)" />
          <text x="310" y="145" fill="#e2e8f0" fontSize="11">
            G: {fmt(OPTIMIZED_SIGMOID_COEFFICIENTS.c5)}
          </text>

          <rect x="300" y="160" width={Math.abs(OPTIMIZED_SIGMOID_COEFFICIENTS.c8) * 120} height="20" fill="url(#ampGrad)" />
          <text x="310" y="175" fill="#e2e8f0" fontSize="11">
            R: {fmt(OPTIMIZED_SIGMOID_COEFFICIENTS.c8)}
          </text>

          <text x="150" y="55" textAnchor="middle" fill="#ef4444" fontSize="12" fontWeight="600">
            Suppressors
          </text>
          <rect
            x={300 - Math.abs(OPTIMIZED_SIGMOID_COEFFICIENTS.c2) * 120}
            y="70"
            width={Math.abs(OPTIMIZED_SIGMOID_COEFFICIENTS.c2) * 120}
            height="20"
            fill="url(#suppGrad)"
          />
          <text x="290" y="85" textAnchor="end" fill="#e2e8f0" fontSize="11">
            M: {fmt(OPTIMIZED_SIGMOID_COEFFICIENTS.c2)}
          </text>

          <rect
            x={300 - Math.abs(OPTIMIZED_SIGMOID_COEFFICIENTS.c4) * 120}
            y="100"
            width={Math.abs(OPTIMIZED_SIGMOID_COEFFICIENTS.c4) * 120}
            height="20"
            fill="url(#suppGrad)"
          />
          <text x="290" y="115" textAnchor="end" fill="#e2e8f0" fontSize="11">
            D: {fmt(OPTIMIZED_SIGMOID_COEFFICIENTS.c4)}
          </text>

          <rect
            x={300 - Math.abs(OPTIMIZED_SIGMOID_COEFFICIENTS.c6) * 120}
            y="130"
            width={Math.abs(OPTIMIZED_SIGMOID_COEFFICIENTS.c6) * 120}
            height="20"
            fill="url(#suppGrad)"
          />
          <text x="290" y="145" textAnchor="end" fill="#e2e8f0" fontSize="11">
            E: {fmt(OPTIMIZED_SIGMOID_COEFFICIENTS.c6)}
          </text>

          <rect
            x={300 - Math.abs(OPTIMIZED_SIGMOID_COEFFICIENTS.c7) * 120}
            y="160"
            width={Math.abs(OPTIMIZED_SIGMOID_COEFFICIENTS.c7) * 120}
            height="20"
            fill="url(#suppGrad)"
          />
          <text x="290" y="175" textAnchor="end" fill="#e2e8f0" fontSize="11">
            S: {fmt(OPTIMIZED_SIGMOID_COEFFICIENTS.c7)}
          </text>

          <text x="300" y="200" textAnchor="middle" fill="#64748b" fontSize="10">
            0.0
          </text>
          <text x="420" y="200" textAnchor="middle" fill="#64748b" fontSize="10">
            1.0
          </text>
          <text x="300" y="235" textAnchor="middle" fill="#94a3b8" fontSize="9">
            Bar length ∝ |coefficient magnitude|; Direction indicates effect sign
          </text>
          <text x="300" y="250" textAnchor="middle" fill="#94a3b8" fontSize="9">
            Amplifiers (green, +): Strengthen belief emergence | Suppressors (red, −): Weaken belief emergence
          </text>
          <text x="300" y="270" textAnchor="middle" fill="#94a3b8" fontSize="9">
            Ridge L2 penalty (α=1.0) ensures stable, generalizable estimates across 83 countries
          </text>
        </svg>
      </div>

      {/* Model Evolution Chart */}
      <div className="coefficients-visualization-card">
        <h4 className="viz-title">1.4.2 Model Fit: Production vs Runtime</h4>
        <p className="viz-subtitle">Production headline (canonical panel-fit) compared to metrics computed in-browser on the loaded canonical panel</p>
        <svg viewBox="0 0 600 280" className="evolution-chart" role="img" aria-label="Belief emergence over time chart" focusable="false">
          <defs>
            <linearGradient id="evGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
            </linearGradient>
          </defs>

          <line x1="80" y1="50" x2="80" y2="200" stroke="#334155" strokeWidth="2" />
          <line x1="80" y1="200" x2="560" y2="200" stroke="#334155" strokeWidth="2" />
          {[0.0, 0.2, 0.4, 0.6, 0.8, 1.0].map((val, i) => (
            <g key={i}>
              <line x1="75" y1={200 - val * 150} x2="80" y2={200 - val * 150} stroke="#64748b" strokeWidth="1" />
              <text x="70" y={200 - val * 150 + 4} textAnchor="end" fill="#94a3b8" fontSize="9">
                {val.toFixed(1)}
              </text>
              <line x1="80" y1={200 - val * 150} x2="560" y2={200 - val * 150} stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2,2" />
            </g>
          ))}

          {(() => {
            const prodR2 = headline.r2;
            const rtR2 = runtime && Number.isFinite(runtime.r2) ? runtime.r2 : NaN;
            const bars = [
              { label: 'Production (headline)', value: prodR2, color: '#10b981', note: `r=${fmt(headline.correlation)}` },
              { label: 'Runtime (this build)', value: rtR2, color: '#3b82f6', note: runtime && Number.isFinite(runtime.corr) ? `r=${fmt(runtime.corr)} · N=${runtime.n}` : '—' },
            ];
            const barW = 160;
            const gap = 70;
            const x0 = 170;
            return bars.map((b, idx) => {
              const v = Number.isFinite(b.value) ? clamp(b.value, 0, 1) : 0;
              const h = v * 150;
              const x = x0 + idx * (barW + gap);
              const y = 200 - h;
              return (
                <g key={b.label}>
                  <rect x={x} y={y} width={barW} height={h} fill={b.color} opacity="0.85" rx="10" />
                  <text x={x + barW / 2} y={220} textAnchor="middle" fill="#e2e8f0" fontSize="10">
                    {b.label}
                  </text>
                  <text x={x + barW / 2} y={y - 8} textAnchor="middle" fill="#fff" fontSize="12" fontWeight="600">
                    {Number.isFinite(b.value) ? fmt(b.value) : '—'}
                  </text>
                  <text x={x + barW / 2} y={236} textAnchor="middle" fill="#94a3b8" fontSize="9">
                    {b.note}
                  </text>
                </g>
              );
            });
          })()}

          <text x="30" y="125" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="600" transform="rotate(-90 30 125)">
            R² (Coefficient of Determination)
          </text>

          <text x="320" y="25" textAnchor="middle" fill="#f1f5f9" fontSize="13" fontWeight="600">
            Fit Summary (Canonical Panel)
          </text>

          <text x="320" y="252" textAnchor="middle" fill="#94a3b8" fontSize="9">
            Production metrics come from the canonical panel-fit headline; runtime metrics are recomputed from the CSV loaded in the browser.
          </text>
        </svg>
      </div>

      {/* Sigmoid Curve Visualization */}
      <div className="coefficients-visualization-card">
        <h4 className="viz-title">1.4.3 Saturation Dynamics (Z vs Φ)</h4>
        <p className="viz-subtitle">Canonical mapping used by calculateModel(): Z = (B·e^Φ)/(B·e^Φ + k), clipped to [0.0001, 0.9999]</p>
        <svg viewBox="0 0 600 300" className="sigmoid-chart" role="img" aria-label="Sigmoid response curve chart" focusable="false">
          <defs>
            <linearGradient id="sigmoidGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#ec4899" stopOpacity="0.7" />
            </linearGradient>
          </defs>

          <line x1="60" y1="50" x2="60" y2="240" stroke="#334155" strokeWidth="2" />
          <line x1="60" y1="240" x2="560" y2="240" stroke="#334155" strokeWidth="2" />

          <line x1="60" y1={240 - axisT(TRAIN_MAX) * 170} x2="560" y2={240 - axisT(TRAIN_MAX) * 170} stroke="#10b981" strokeWidth="1.5" strokeDasharray="4,4" opacity="0.7" />
          <text x="565" y={244 - axisT(TRAIN_MAX) * 170} fill="#10b981" fontSize="10" fontWeight="600">
            Upper band edge ({TRAIN_MAX.toFixed(4)})
          </text>

          <line x1="60" y1={240 - axisT(TRAIN_MIN) * 170} x2="560" y2={240 - axisT(TRAIN_MIN) * 170} stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4,4" opacity="0.7" />
          <text x="565" y={236 - axisT(TRAIN_MIN) * 170} fill="#ef4444" fontSize="10" fontWeight="600">
            Lower band edge ({TRAIN_MIN.toFixed(4)})
          </text>

          <path
            d={(() => {
              const points: string[] = [];
              for (let i = 0; i <= 100; i++) {
                const x = 60 + (i / 100) * 500;
                const phi = -4 + (i / 100) * 8;
                const k = OPTIMIZED_STRUCTURAL_PARAMS.k;
                const B = 1; // illustrative baseline (structural base factored out)
                const raw = (B * Math.exp(phi)) / (B * Math.exp(phi) + k);
                const z = clamp(raw, TRAIN_MIN, TRAIN_MAX);
                const y = 240 - axisT(z) * 170;
                points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
              }
              return points.join(' ');
            })()}
            stroke="url(#sigmoidGrad)"
            strokeWidth="3"
            fill="none"
          />

          <circle cx="310" cy={240 - axisT(clamp(1 / (1 + OPTIMIZED_STRUCTURAL_PARAMS.k), TRAIN_MIN, TRAIN_MAX)) * 170} r="5" fill="#f59e0b" stroke="#fff" strokeWidth="2" />
          <text x="320" y={244 - axisT(clamp(1 / (1 + OPTIMIZED_STRUCTURAL_PARAMS.k), TRAIN_MIN, TRAIN_MAX)) * 170} fill="#f59e0b" fontSize="11" fontWeight="600">
            Φ = 0 (baseline; B=1)
          </text>

          <text x="310" y="270" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="600">
            Φ (Field Strength) = Σ c_i·X_i
          </text>
          <text x="30" y="145" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="600" transform="rotate(-90 30 145)">
            Z (Belief Emergence)
          </text>

          <text x="60" y="260" textAnchor="middle" fill="#64748b" fontSize="9">
            −4
          </text>
          <text x="310" y="260" textAnchor="middle" fill="#64748b" fontSize="9">
            0
          </text>
          <text x="560" y="260" textAnchor="middle" fill="#64748b" fontSize="9">
            +4
          </text>

          {[TRAIN_MIN, 0.2, 0.4, 0.6, 0.8, TRAIN_MAX].map((val) => (
            <text key={val} x="55" y={240 - axisT(val) * 170 + 4} textAnchor="end" fill="#64748b" fontSize="9">
              {axisLabel(val)}
            </text>
          ))}

          <text x="310" y="30" textAnchor="middle" fill="#f1f5f9" fontSize="12" fontWeight="600">
            Z = β + (α−β)/(1 + e^(−k·Φ))
          </text>
        </svg>
        <div className="viz-math">
          <BlockMath
            math={'Z = \\beta + \\frac{\\alpha-\\beta}{1 + e^{-k\\,\\Phi}}'}
            renderError={() => <span className="formula">Z = β + (α−β)/(1 + e^(−k·Φ))</span>}
          />
        </div>
        <div className="methodology-note">
          <strong>Parameters:</strong> the sigmoid's ceiling and floor are fixed at 1 and 0, and its
          steepness is <span className="formula">k = {OPTIMIZED_STRUCTURAL_PARAMS.k.toFixed(2)}</span>.
          The structural exponents are <span className="formula">α = {OPTIMIZED_STRUCTURAL_PARAMS.alpha.toFixed(3)}</span> and{' '}
          <span className="formula">β = {OPTIMIZED_STRUCTURAL_PARAMS.beta.toFixed(3)}</span>, both at the lower
          estimation bound — the panel does not identify them (see &ldquo;What this model cannot show&rdquo;).
          Z is clipped to the canonical interior band [0.0001, 0.9999] so it is never exactly 0 or 1.
        </div>
      </div>

      {/* Phi Field Decomposition */}
      <div className="coefficients-visualization-card">
        <h4 className="viz-title">1.4.4 Φ Field Term Composition</h4>
        <p className="viz-subtitle">Relative contribution of linear, interaction, and quadratic components</p>
        <svg viewBox="0 0 600 280" className="phi-composition-chart" role="img" aria-label="Phi component composition chart" focusable="false">
          <defs>
            <filter id="shadow">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3" />
            </filter>
          </defs>

          {(() => {
            const cx = 180;
            const cy = 140;
            const r = 90;
            const linearPct = 0.62;
            const interactionPct = 0.29;
            const quadraticPct = 0.09;
            let startAngle = -90;

            const createArc = (pct: number, color: string, label: string) => {
              const angle = pct * 360;
              const endAngle = startAngle + angle;
              const largeArc = angle > 180 ? 1 : 0;

              const x1 = cx + r * Math.cos((startAngle * Math.PI) / 180);
              const y1 = cy + r * Math.sin((startAngle * Math.PI) / 180);
              const x2 = cx + r * Math.cos((endAngle * Math.PI) / 180);
              const y2 = cy + r * Math.sin((endAngle * Math.PI) / 180);

              const midAngle = (startAngle + endAngle) / 2;
              const labelX = cx + (r + 30) * Math.cos((midAngle * Math.PI) / 180);
              const labelY = cy + (r + 30) * Math.sin((midAngle * Math.PI) / 180);

              startAngle = endAngle;

              return (
                <g key={label}>
                  <path
                    d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
                    fill={color}
                    opacity="0.85"
                    filter="url(#shadow)"
                  />
                  <text x={labelX} y={labelY} textAnchor="middle" fill={color} fontSize="11" fontWeight="600">
                    {label}
                  </text>
                  <text x={labelX} y={labelY + 14} textAnchor="middle" fill="#cbd5e1" fontSize="10">
                    {(pct * 100).toFixed(0)}%
                  </text>
                </g>
              );
            };

            return (
              <>
                {createArc(linearPct, '#3b82f6', 'Linear (8)')}
                {createArc(interactionPct, '#8b5cf6', 'Interaction (4)')}
                {createArc(quadraticPct, '#ec4899', 'Quadratic (2)')}
              </>
            );
          })()}

          <g transform="translate(380, 60)">
            <text x="0" y="0" fill="#f1f5f9" fontSize="12" fontWeight="600">
              Term Breakdown
            </text>

            <rect x="0" y="15" width="15" height="15" fill="#3b82f6" opacity="0.85" />
            <text x="20" y="27" fill="#e2e8f0" fontSize="10">
              Linear: C, M, T, D, G, E, S, R
            </text>

            <rect x="0" y="40" width="15" height="15" fill="#8b5cf6" opacity="0.85" />
            <text x="20" y="52" fill="#e2e8f0" fontSize="10">
              Interaction: C×Y, C×T, C×M, C×G
            </text>

            <rect x="0" y="65" width="15" height="15" fill="#ec4899" opacity="0.85" />
            <text x="20" y="77" fill="#e2e8f0" fontSize="10">
              Quadratic: Y², C²
            </text>

            <text x="0" y="105" fill="#94a3b8" fontSize="9" fontStyle="italic">
              Total: 14 engineered features
            </text>
            <text x="0" y="120" fill="#94a3b8" fontSize="9">
              Φ = Σ(c_i·X_i) + Σ(c_ij·X_i·X_j) + Σ(c_ii·X_i²)
            </text>
          </g>

          <text x="300" y="260" textAnchor="middle" fill="#cbd5e1" fontSize="10">
            Interaction terms capture synergistic effects (e.g., cognitive sophistication × inequality)
          </text>
        </svg>
        <div className="viz-math">
          <BlockMath
            math={'\\Phi = \\sum_i c_i X_i + \\sum_{i<j} c_{ij} X_i X_j + \\sum_i c_{ii} X_i^2'}
            renderError={() => <span className="formula">Φ = Σ(cᵢ·Xᵢ) + Σ(cᵢⱼ·Xᵢ·Xⱼ) + Σ(cᵢᵢ·Xᵢ²)</span>}
          />
        </div>
      </div>

      {/* Per-country in-sample fit (fixed coefficients; no refit) */}
      <div className="coefficients-visualization-card">
        <h4 className="viz-title">1.4.5 Country-Level Evaluation (Fixed Coefficients, In-Sample)</h4>
        <p className="viz-subtitle">Per-country R² computed from canonical panel data using calculateModel() predictions (fixed coefficients; no refit)</p>
        <svg viewBox="0 0 600 280" className="country-slice-chart" role="img" aria-label="Country-level predicted response slices chart" focusable="false">
          <line x1="60" y1="50" x2="60" y2="230" stroke="#334155" strokeWidth="2" />
          <line x1="60" y1="230" x2="560" y2="230" stroke="#334155" strokeWidth="2" />

          {(() => {
            const series = (validation.countryR2 || []).filter((d) => Number.isFinite(d.r2));
            if (!series.length) return null;
            const mean = series.reduce((a, d) => a + d.r2, 0) / series.length;
            const barWidth = 20;
            const spacing = 22;
            return series.map((d, i) => {
              const x = 70 + i * spacing;
              const height = clamp(d.r2, 0, 1) * 180;
              const y = 230 - height;
              const color = d.r2 >= mean ? '#10b981' : '#f59e0b';
              return <rect key={d.iso3} x={x} y={y} width={barWidth} height={height} fill={color} opacity="0.7" />;
            });
          })()}

          {(() => {
            const series = (validation.countryR2 || []).filter((d) => Number.isFinite(d.r2));
            if (!series.length) return null;
            // Median, not mean: the same outliers that break the mean also make it a
            // meaningless reference line, and the bars already clamp at zero.
            const sorted = series.map((d) => d.r2).sort((a, b) => a - b);
            const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
            const y = 230 - clamp(median, 0, 1) * 180;
            return (
              <>
                <line x1="60" y1={y} x2="560" y2={y} stroke="#ef4444" strokeWidth="2" strokeDasharray="4,4" />
                <text x="480" y={y - 5} fill="#ef4444" fontSize="11" fontWeight="600">
                  Median: {fmt(median)}
                </text>
              </>
            );
          })()}

          <text x="30" y="140" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="600" transform="rotate(-90 30 140)">
            R² (Within-Country)
          </text>

          {[0.6, 0.7, 0.8, 0.9].map((val) => (
            <g key={val}>
              <line x1="55" y1={230 - val * 180} x2="60" y2={230 - val * 180} stroke="#64748b" strokeWidth="1" />
              <text x="50" y={230 - val * 180 + 4} textAnchor="end" fill="#94a3b8" fontSize="9">
                {val.toFixed(2)}
              </text>
            </g>
          ))}

          <text x="300" y="25" textAnchor="middle" fill="#f1f5f9" fontSize="12" fontWeight="600">
            Country-Level Fit Stability (Fixed Coefficients)
          </text>
          {(() => {
            const series = (validation.countryR2 || []).filter((d) => Number.isFinite(d.r2));
            if (!series.length) return null;
            // The bars are drawn with clamp(r2, 0, 1), so a raw mean is not the mean of
            // what the reader sees: a handful of slices with near-degenerate variance
            // produced R2 values near -2000 and dragged the reported mean to -113 while
            // every bar sat at zero height. Report the median of the plotted series and
            // say how many slices are below zero, which is the honest description of a
            // chart whose bars bottom out.
            const vals = series.map((d) => d.r2).sort((a, b) => a - b);
            const median = vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
            const negatives = vals.filter((v) => v < 0).length;
            return (
              <text x="300" y="245" textAnchor="middle" fill="#94a3b8" fontSize="9">
                N = {series.length} countries | median R2: {fmt(median)} | below zero: {negatives}
              </text>
            );
          })()}
        </svg>
        <div className="methodology-note">
          <strong>Reproducibility note:</strong> Bars are computed directly from the canonical panel by country. Predictions come only from
          calculateModel(); we report within-country goodness-of-fit (R²) using fixed coefficients (no leave-one-country-out refit).
          <br />
          <strong>Scope &amp; limitations:</strong> This section evaluates a fixed, pre-estimated model on the canonical panel. It is not an out-of-sample refit or per-country/slice re-estimation (which would require re-estimating coefficients per country/split), and it does not establish causal effects.
        </div>
      </div>

      <div className="coefficients-visualization-card">
        <h4 className="viz-title">Scientific Interpretation (Stability & Consistency Checks)</h4>
        <p className="viz-subtitle">Why country-level stability matters for descriptive fit quality</p>
        <div className="methodology-note">
          <p>
            A strong model should not rely on a single region or cultural cluster. We therefore summarize performance at the country level and
            look for (i) consistently high R², (ii) low dispersion across countries, and (iii) error symmetry around zero (see Section 1.6).
          </p>
          <p>
            In a cautious empirical narrative, this supports <em>descriptive consistency</em>: the same theoretical mechanism (structural rootedness ×
            perceived injustice, amplified by sociocultural modifiers) is compatible with consistent fit across heterogeneous contexts (within the evaluated panel).
          </p>
        </div>
        <div className="viz-math">
          <BlockMath
            math={
              'R^2_c = 1 - \\frac{\\sum_{i\\in c}(z_i-\\hat z_i)^2}{\\sum_{i\\in c}(z_i-\\bar z_c)^2},\\qquad e_i=z_i-\\hat z_i'
            }
            renderError={() => <span className="formula">R²_c = 1 − Σ(z−ẑ)² / Σ(z−z̄_c)² ; eᵢ = zᵢ − ẑᵢ</span>}
          />
        </div>
        <div className="methodology-note">
          <p>
            Interpretation guide: large gaps between countries can indicate unmodeled institutional/cultural confounding, measurement drift, or
            missing moderators. Narrow dispersion supports a stable mechanism consistent with the theory.
          </p>
        </div>
      </div>
    </div>
  );

  // Data-driven validation metrics from panel
  const { panelData, loading, error } = useDataContext();

  const validation = useMemo(() => {
    if (!panelData || !panelData.length) {
      return {
        points: [] as Array<{ x: number; y: number; iso3: string }>,
        residuals: [] as number[],
        r2: NaN,
        corr: NaN,
        mae: NaN,
        rmse: NaN,
        bias: NaN,
        residMean: NaN,
        residSD: NaN,
        bins: [] as Array<{ binStart: number; binEnd: number; meanPred: number; meanObs: number }>,
        countryR2: [] as Array<{ iso3: string; country: string; n: number; r2: number; mae: number; rmse: number }>,
        n: 0,
        totalRows: 0,
        droppedRows: 0,
      };
    }

    const totalRows = panelData.length;

    const pts: Array<{ x: number; y: number; iso3: string }> = [];
    const resid: number[] = [];
    let sumX = 0,
      sumY = 0,
      sumX2 = 0,
      sumY2 = 0,
      sumXY = 0,
      sse = 0,
      maeAcc = 0,
      n = 0;

    const byCountry = new Map<
      string,
      {
        country: string;
        n: number;
        sumY: number;
        sumY2: number;
        sse: number;
        mae: number;
      }
    >();
    for (const r of panelData) {
      const result = predictFromPanelRow(r);
      const zhat = result.zPred;
      const zobs = result.zObs;
      if (!Number.isFinite(zhat) || !Number.isFinite(zobs)) continue;
      pts.push({ x: zhat, y: zobs, iso3: r.iso3 });
      // Residual definition aligned to formulas/labels: observed − predicted
      const e = zobs - zhat;
      resid.push(e);
      sumX += zhat;
      sumY += zobs;
      sumX2 += zhat * zhat;
      sumY2 += zobs * zobs;
      sumXY += zhat * zobs;
      maeAcc += Math.abs(e);
      sse += e * e;
      n += 1;

      const key = r.iso3;
      const existing = byCountry.get(key);
      if (existing) {
        existing.n += 1;
        existing.sumY += zobs;
        existing.sumY2 += zobs * zobs;
        existing.sse += e * e;
        existing.mae += Math.abs(e);
      } else {
        byCountry.set(key, {
          country: r.country_name,
          n: 1,
          sumY: zobs,
          sumY2: zobs * zobs,
          sse: e * e,
          mae: Math.abs(e),
        });
      }
    }

    if (n === 0) {
      return {
        points: [] as Array<{ x: number; y: number; iso3: string }>,
        residuals: [] as number[],
        r2: NaN,
        corr: NaN,
        mae: NaN,
        rmse: NaN,
        bias: NaN,
        residMean: NaN,
        residSD: NaN,
        bins: [] as Array<{ binStart: number; binEnd: number; meanPred: number; meanObs: number }>,
        countryR2: [] as Array<{ iso3: string; country: string; n: number; r2: number; mae: number; rmse: number }>,
        n: 0,
        totalRows,
        droppedRows: totalRows,
      };
    }

    const meanY = sumY / n;
    const sst = pts.reduce((acc, p) => acc + (p.y - meanY) * (p.y - meanY), 0);
    const r2 = 1 - (sse / sst);
    const cov = sumXY / n - (sumX / n) * (sumY / n);
    const sx = Math.sqrt(sumX2 / n - (sumX / n) * (sumX / n));
    const sy = Math.sqrt(sumY2 / n - (sumY / n) * (sumY / n));
    const corr = cov / (sx * sy);
    const mae = maeAcc / n;
    const rmse = Math.sqrt(sse / n);
    const bias = computeBias(
      pts.map((p) => p.y),
      pts.map((p) => p.x),
    );
    const residMean = bias;
    const residSD = Math.sqrt(resid.reduce((a, e) => a + (e - residMean) * (e - residMean), 0) / n);

    // Calibration bins by predicted quantiles (10 bins)
    const sorted = pts.slice().sort((a, b) => a.x - b.x);
    const bins: Array<{ binStart: number; binEnd: number; meanPred: number; meanObs: number }> = [];
    const binsCount = 10;
    for (let i = 0; i < binsCount; i++) {
      const start = Math.floor((i * sorted.length) / binsCount);
      const end = Math.floor(((i + 1) * sorted.length) / binsCount);
      const slice = sorted.slice(start, end);
      if (!slice.length) continue;
      const mp = slice.reduce((a, p) => a + p.x, 0) / slice.length;
      const mo = slice.reduce((a, p) => a + p.y, 0) / slice.length;
      bins.push({ binStart: slice[0].x, binEnd: slice[slice.length - 1].x, meanPred: mp, meanObs: mo });
    }

    const countryR2 = Array.from(byCountry.entries())
      .map(([iso3, v]) => {
        const meanYc = v.sumY / v.n;
        const sstc = v.sumY2 - v.n * meanYc * meanYc;
        // `sstc > 0` is not a usable guard. A country whose Z barely varies has a
        // variance at rounding level, and dividing it into a real SSE produces R2 values
        // like -2220; averaging those gave the chart a mean of -113.7 and an SD of 373.9.
        // An R2 is undefined for a slice with no meaningful variation, so require the
        // variance to be non-trivial relative to the slice's own scale.
        const degenerate = sstc <= Math.max(1e-10, Math.abs(v.sumY2) * 1e-6);
        const r2c = v.n >= 3 && !degenerate ? 1 - v.sse / sstc : NaN;
        const maec = v.mae / v.n;
        const rmsec = Math.sqrt(v.sse / v.n);
        return { iso3, country: v.country, n: v.n, r2: r2c, mae: maec, rmse: rmsec };
      })
      .sort((a, b) => a.iso3.localeCompare(b.iso3));

    const droppedRows = Math.max(0, totalRows - n);
    return { points: pts, residuals: resid, r2, corr, mae, rmse, bias, residMean, residSD, bins, countryR2, n, totalRows, droppedRows };
  }, [panelData]);

  const content = (
    <div className="belief-equation-section">
      <div className="coefficients-card">
        <h3 className="card-title">1.4 Model Parameters &amp; Calibration</h3>
        <div className="coefficients-grid">
          <div className="coeff-group">
            <h4>Structural Exponents</h4>
            <div className="coeff-item">
              <span className="coeff-symbol">α</span>
              <span className="coeff-value">{fmt(OPTIMIZED_STRUCTURAL_PARAMS.alpha)}</span>
              <span className="coeff-desc">Settlement Power (Empirically Derived)</span>
            </div>
            <div className="coeff-item">
              <span className="coeff-symbol">β</span>
              <span className="coeff-value">{fmt(OPTIMIZED_STRUCTURAL_PARAMS.beta)}</span>
              <span className="coeff-desc">Inequality Power (Cross-Cultural)</span>
            </div>
            <div className="coeff-item">
              <span className="coeff-symbol">k</span>
              <span className="coeff-value">{fmt(OPTIMIZED_STRUCTURAL_PARAMS.k)}</span>
              <span className="coeff-desc">Normalization Constant</span>
            </div>
          </div>
          <div className="coeff-group">
            <h4>Modifier Coefficients (Ridge Regression α=1.0)</h4>
            <div className="coeff-mini-grid">
              <div className="coeff-mini">c₁ = {fmt(OPTIMIZED_SIGMOID_COEFFICIENTS.c1)}</div>
              <div className="coeff-mini">c₂ = {fmt(OPTIMIZED_SIGMOID_COEFFICIENTS.c2)}</div>
              <div className="coeff-mini">c₃ = {fmt(OPTIMIZED_SIGMOID_COEFFICIENTS.c3)}</div>
              <div className="coeff-mini">c₄ = {fmt(OPTIMIZED_SIGMOID_COEFFICIENTS.c4)}</div>
              <div className="coeff-mini">c₅ = {fmt(OPTIMIZED_SIGMOID_COEFFICIENTS.c5)}</div>
              <div className="coeff-mini">c₆ = {fmt(OPTIMIZED_SIGMOID_COEFFICIENTS.c6)}</div>
              <div className="coeff-mini">c₇ = {fmt(OPTIMIZED_SIGMOID_COEFFICIENTS.c7)}</div>
              <div className="coeff-mini">c₈ = {fmt(OPTIMIZED_SIGMOID_COEFFICIENTS.c8)}</div>
            </div>
            <div className="methodology-note">
              <strong>Estimation Method:</strong> Ridge regression with L2 regularization (α=1.0) applied to logit-transformed belief outcomes.
              Regularization penalty prevents overfitting while preserving interpretability. Coefficient signs are empirically derived: positive
              coefficients (c₁,c₃,c₅,c₈) indicate amplification; negative coefficients (c₂,c₄,c₆,c₇) indicate suppression. Validated via
              canonical diagnostics (country-level fit + residual and calibration checks).
            </div>
          </div>
        </div>
      </div>

      <div className="models-header-card">
        <h3 className="card-title">1.5 Mathematical Model Evolution</h3>
        <p className="models-subtitle">Progressive refinement from linear assumptions to nonlinear dynamics with exponential amplification</p>
      </div>

      <div className="belief-models-grid">
        <div className="model-card linear">
          <div className="model-header">
            <LinearIcon />
            <div className="model-info">
              <h4>Linear Model</h4>
              <span className="model-type">Baseline Formulation</span>
            </div>
          </div>
          <div className="equation-showcase">
            <BlockMath math={'Z = a\\cdot Y'} renderError={() => <span className="formula">Z = a·Y</span>} />
          </div>
          <p className="model-description">Classical view: belief intensifies with perceived injustice. Overpredicts religiosity in secular but unequal societies.</p>
        </div>

        <div className="model-card saturation">
          <div className="model-header">
            <SaturationIcon />
            <div className="model-info">
              <h4>Saturation Model</h4>
              <span className="model-type">Michaelis–Menten Inspired</span>
            </div>
          </div>
          <div className="equation-showcase">
            <BlockMath math={'Z = \\frac{Y}{k+Y}'} renderError={() => <span className="formula">Z = Y/(k+Y)</span>} />
          </div>
          <p className="model-description">Introduces bounded growth. Belief intensity plateaus despite rising inequality, particularly in welfare-rich societies.</p>
        </div>

        <div className="model-card threshold">
          <div className="model-header">
            <ThresholdIcon />
            <div className="model-info">
              <h4>Threshold Model</h4>
              <span className="model-type">Hill Function</span>
            </div>
          </div>
          <div className="equation-showcase">
            <BlockMath
              math={'Z = \\frac{Y^{n}}{k^{n} + Y^{n}}'}
              renderError={() => <span className="formula">Z = Y^n/(k^n + Y^n)</span>}
            />
          </div>
          <p className="model-description">
            Sigmoidal transitions mimicking tipping points. Belief remains dormant under moderate inequality but surges beyond critical thresholds.
          </p>
        </div>

        <div className="model-card dual">
          <div className="model-header">
            <DualIcon />
            <div className="model-info">
              <h4>Dual Structural Model</h4>
              <span className="model-type">Settlement &amp; Inequality</span>
            </div>
          </div>
          <div className="equation-showcase">
            <BlockMath
              math={'Z = \\frac{X^{\\alpha}\\,Y^{\\beta}}{k + X^{\\alpha}\\,Y^{\\beta}}'}
              renderError={() => <span className="formula">Z = (X^α · Y^β)/(k + X^α · Y^β)</span>}
            />
          </div>
          <p className="model-description">Integrates structural rootedness and perceived injustice. Unlikely in mobile, egalitarian societies; likely in sedentary, stratified civilizations.</p>
        </div>

        <div className="model-card extended final">
          <div className="model-header">
            <ExtendedIcon />
            <div className="model-info">
              <h4>Extended Nonlinear Model</h4>
              <span className="model-type">Statistical Mechanics Framework</span>
            </div>
          </div>
          <div className="equation-showcase final-equation">
            <BlockMath
              math={'Z = \\frac{X^{\\alpha}\\,Y^{\\beta}\\,e^{\\Phi}}{X^{\\alpha}\\,Y^{\\beta}\\,e^{\\Phi} + k}'}
              renderError={() => <span className="formula main-formula">Z = (X^α · Y^β · e^Φ)/(X^α · Y^β · e^Φ + k)</span>}
            />
          </div>
          <div className="phi-showcase">
            <span className="phi-label">Exponential Amplification Term:</span>
            <div className="phi-formula">
              <BlockMath
                math={'\\Phi = \\varphi_0 + c_1 C + c_2 M + c_3 T + c_4 D + c_5 G + c_6 E + c_7 S + c_8 R + \\text{interactions} + \\text{quadratics}'}
                renderError={() => <span>Φ = φ₀ + c₁C + c₂M + c₃T + c₄D + c₅G + c₆E + c₇S + c₈R + interactions + quadratics</span>}
              />
            </div>
          </div>
          <div className="model-description">
            <p><strong>Mathematical Interpretation:</strong></p>
            <p>
              This formulation integrates principles from statistical mechanics, where the exponential term simulates <em>symbolic energy</em> dynamics. The model exhibits:
            </p>
            <ul className="model-features">
              <li><strong>Phase Transitions:</strong> Abrupt belief shifts at critical thresholds</li>
              <li><strong>Hysteresis Effects:</strong> Path-dependent belief persistence</li>
              <li><strong>Collective Behavior:</strong> Emergent population-level patterns</li>
              <li><strong>Feedback Amplification:</strong> Self-reinforcing belief cascades</li>
            </ul>
            <p>
              <strong>Sign convention:</strong> Coefficients are signed; suppressive effects are encoded by negative coefficients. Do not manually negate suppressor terms.
            </p>
            <p>
              <strong>Real-World Applications:</strong> Predicts religious revivals, secular transitions, and fundamentalist movements across diverse cultural contexts (headline panel-fit: r = {fmt(headline.correlation)}, R² = {fmt(headline.r2)}; see Sections 1.4.5–1.6 for country-level stability, residual diagnostics, and calibration).
            </p>
            <p>
              <strong>Reported headline performance:</strong> canonical panel-fit r = {fmt(headline.correlation)}, R² = {fmt(headline.r2)} (see scripts/generate_headline_metrics.ts via npm run generate:headline-metrics; runtime recomputation below should match within small tolerance).
            </p>
          </div>
        </div>
      </div>

      {renderVisualizationGrid(
        Number.isFinite(validation.r2)
          ? {
              r2: validation.r2,
              corr: validation.corr,
              mae: validation.mae,
              rmse: validation.rmse,
              n: validation.n,
            }
          : null
      )}

      <div className="belief-validation-section">
        <div className="coefficients-visualization-card">
          <h4 className="viz-title">1.6 Analytical Framework &amp; Empirical Validation</h4>
          <p className="viz-subtitle">Empirical diagnostics and calibration computed from canonical panel data</p>

          <div className="validation-summary-top">
            <ul className="validation-metrics-list">
              <li>
                Panel: {dataset.countries} countries (rows used: {validation.n || '—'} / {validation.totalRows || '—'}). Predictions computed via calculateModel().
              </li>
              <li>Outcome scaling: Z_belief_outcome normalized to [0.0001, 0.9999] using Z_NORMALIZATION (canonical training preprocessing).</li>
              <li>
                <strong>Production headline (canonical panel-fit):</strong> R² = {fmt(headline.r2)} · r = {fmt(headline.correlation)} · MAE = {fmt(headline.mae)}
              </li>
              <li className="ma-small-muted">
                Training metadata (coeff JSON, {training.date}): R² = {fmt(training.metrics.r2)} · r = {fmt(training.metrics.correlation)} · MAE = {fmt(training.metrics.mae)}
              </li>
              <li>
                Runtime Validation: R² {Number.isFinite(validation.r2) ? fmt(validation.r2) : '—'} · r {Number.isFinite(validation.corr) ? fmt(validation.corr) : '—'} · MAE{' '}
                {Number.isFinite(validation.mae) ? fmt(validation.mae) : '—'} (browser computation on {validation.n || 0} obs)
              </li>
              <li>
                Residuals: mean {Number.isFinite(validation.residMean) ? fmt(validation.residMean) : '—'} · SD{' '}
                {Number.isFinite(validation.residSD) ? fmt(validation.residSD) : '—'}
              </li>
            </ul>

            {(loading || error) && (
              <div className="validation-status">{loading ? 'Loading panel data…' : `Panel load error: ${error}`}</div>
            )}
          </div>

          <div className="viz-math">
            <BlockMath
              math={'\\hat{z}_i = f_\\theta(x_i)\\;\\text{(via calculateModel)},\\qquad z_i \\in [0.0001,0.9999]\\;\\text{(canonical normalization band)}'}
              renderError={() => <span className="formula">ẑᵢ = fθ(xᵢ) (calculateModel), zᵢ ∈ [0.0001,0.9999] (canonical normalization band)</span>}
            />
          </div>
        </div>

        <div className="viz-grid belief-validation-charts">
          <div className="coefficients-visualization-card">
            <h4 className="viz-title">Observed vs Predicted</h4>
            <p className="viz-subtitle">
              Scatter with y=x reference (Z normalized into [0.0001, 0.9999]) — Production headline (canonical panel-fit): R² = {fmt(headline.r2)}
            </p>
            <svg viewBox="0 0 520 340" className="validation-chart" role="img" aria-label="Belief model validation chart" focusable="false">
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
              
              {/* y=x perfect prediction line */}
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
              
              {/* Fit summary */}
              <text x="270" y="40" textAnchor="middle" fill="#f1f5f9" fontSize="13" fontWeight="600">
                Production headline (canonical panel-fit): R² = {fmt(headline.r2)}, r = {fmt(headline.correlation)}
              </text>
              <text x="270" y="55" textAnchor="middle" fill="#94a3b8" fontSize="10">
                Production MAE = {fmt(headline.mae)} · Runtime: R²{' '}
                {Number.isFinite(validation.r2) ? fmt(validation.r2) : '—'} · r {Number.isFinite(validation.corr) ? fmt(validation.corr) : '—'} · MAE{' '}
                {Number.isFinite(validation.mae) ? fmt(validation.mae) : '—'} · RMSE {Number.isFinite(validation.rmse) ? fmt(validation.rmse) : '—'} (N = {validation.points.length})
              </text>
            </svg>
            <div className="methodology-note">
              This scatter summarizes predictive adequacy: concentration around the $y=x$ line indicates good calibration. The displayed metrics
              quantify fit and error magnitude on the canonical panel.
            </div>
            <div className="viz-math">
              <BlockMath
                math={'e_i = z_i - \\hat{z}_i,\\quad \\mathrm{MAE}=\\frac{1}{n}\\sum_i |e_i|,\\quad \\mathrm{RMSE}=\\sqrt{\\frac{1}{n}\\sum_i e_i^2}'}
                renderError={() => <span className="formula">eᵢ = zᵢ − ẑᵢ; MAE = (1/n)Σ|eᵢ|; RMSE = √((1/n)Σeᵢ²)</span>}
              />
            </div>
          </div>

          <div className="coefficients-visualization-card">
            <h4 className="viz-title">Residual Distribution</h4>
            <p className="viz-subtitle">Histogram of residuals (observed − predicted)</p>
            <svg viewBox="0 0 520 340" className="validation-chart" role="img" aria-label="Belief model calibration chart" focusable="false">
              <line x1="60" y1="260" x2="460" y2="260" stroke="#334155" strokeWidth="2" />
              <line x1="60" y1="40" x2="60" y2="260" stroke="#334155" strokeWidth="2" />
              {(() => {
                if (!validation.residuals.length) return null;
                const bins = 24;
                const min = Math.min(...validation.residuals);
                const max = Math.max(...validation.residuals);
                const width = max - min || 1;
                const counts = new Array(bins).fill(0);
                for (const e of validation.residuals) {
                  const idx = Math.min(bins - 1, Math.max(0, Math.floor(((e - min) / width) * bins)));
                  counts[idx] += 1;
                }
                const maxCount = Math.max(...counts, 1);
                return counts.map((c, i) => {
                  const x = 60 + (i / bins) * 400;
                  const barW = 400 / bins - 2;
                  const h = (c / maxCount) * 200;
                  const y = 260 - h;
                  return <rect key={i} x={x} y={y} width={barW} height={h} fill="#f59e0b" fillOpacity="0.6" />;
                });
              })()}
              <line
                x1="60"
                y1={Number.isFinite(validation.residMean) ? 260 - ((validation.residMean + 0.5) / 1.0) * 200 : 260}
                x2="460"
                y2={Number.isFinite(validation.residMean) ? 260 - ((validation.residMean + 0.5) / 1.0) * 200 : 260}
                stroke="#64748b"
                strokeDasharray="3,3"
                opacity="0"
              />
              <text x="70" y="50" fill="#cbd5e1" fontSize="10">
                mean {Number.isFinite(validation.residMean) ? fmt(validation.residMean) : '—'}
              </text>
              <text x="160" y="50" fill="#cbd5e1" fontSize="10">
                SD {Number.isFinite(validation.residSD) ? fmt(validation.residSD) : '—'}
              </text>
            </svg>
            <div className="methodology-note">
              Residual symmetry around 0 supports unbiased predictions; heavy tails or skewness would indicate unmodeled heterogeneity or
              scale mismatch.
            </div>
          </div>

          <div className="coefficients-visualization-card">
            <h4 className="viz-title">Residuals vs Predicted</h4>
            <p className="viz-subtitle">Checks systematic bias and heteroskedasticity</p>
            <svg viewBox="0 0 520 340" className="validation-chart" role="img" aria-label="Belief model residual distribution chart" focusable="false">
              {(() => {
                const e = validation.residuals;
                const pts = validation.points;
                if (!e.length || !pts.length) return null;
                const minE = Math.min(...e);
                const maxE = Math.max(...e);
                const pad = 0.02;
                const lo = Math.min(-0.15, minE - pad);
                const hi = Math.max(0.15, maxE + pad);
                const scaleY = (val: number) => 280 - ((val - lo) / (hi - lo || 1)) * 200;
                const y0 = scaleY(0);
                return (
                  <>
                    <line x1="70" y1="280" x2="470" y2="280" stroke="#334155" strokeWidth="2" />
                    <line x1="70" y1="60" x2="70" y2="280" stroke="#334155" strokeWidth="2" />
                    <line x1="70" y1={y0} x2="470" y2={y0} stroke="#64748b" strokeDasharray="4,4" />
                    {pts.map((p, i) => {
                      const x = 70 + axisT(p.x) * 400;
                      const y = scaleY(e[i] ?? 0);
                      return <circle key={i} cx={x} cy={y} r={2} fill="#60a5fa" fillOpacity="0.55" />;
                    })}
                    <text x="270" y="325" textAnchor="middle" fill="#94a3b8" fontSize="10">
                      Predicted Z
                    </text>
                    <text x="20" y="175" textAnchor="middle" fill="#94a3b8" fontSize="10" transform="rotate(-90 20 175)">
                      Residual (z − ẑ)
                    </text>
                  </>
                );
              })()}
            </svg>
            <div className="methodology-note">
              Ideally, residuals form a horizontal band around 0 with no trend. A slope indicates systematic over/under-prediction; a widening
              band indicates variance increasing with predicted intensity.
            </div>
          </div>

          <div className="coefficients-visualization-card">
            <h4 className="viz-title">Calibration Curve</h4>
            <p className="viz-subtitle">Binned mean observed vs mean predicted</p>
            <svg viewBox="0 0 520 340" className="validation-chart" role="img" aria-label="Belief model observed and predicted values chart" focusable="false">
              <line x1="60" y1="260" x2="460" y2="260" stroke="#334155" strokeWidth="2" />
              <line x1="60" y1="40" x2="60" y2="260" stroke="#334155" strokeWidth="2" />
              <line x1="60" y1="260" x2="460" y2="60" stroke="#64748b" strokeDasharray="4,4" />
              {validation.bins.map((b, i) => {
                const x = 60 + axisT(b.meanPred) * 400;
                const y = 260 - axisT(b.meanObs) * 200;
                return <circle key={i} cx={x} cy={y} r={3} fill="#10b981" fillOpacity="0.8" />;
              })}
            </svg>
            <div className="methodology-note">
              This plot tests probabilistic calibration: if the model is well-calibrated, binned mean observed vs mean predicted points lie
              near the diagonal.
            </div>
            <div className="viz-math">
              <BlockMath
                math={'\\text{Calibration bins: } (\\bar{\\hat{z}}_b,\\bar{z}_b),\\; b=1,\\dots,B;\\quad \\bar{z}_b \\approx \\bar{\\hat{z}}_b'}
                renderError={() => <span className="formula">Bins: (mean ẑ, mean z); good calibration ⇒ mean z ≈ mean ẑ</span>}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="section-end-indicator">
        <div className="end-line"></div>
        <div className="end-badge">
          <span className="end-text">End of Section 1</span>
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
      title="Belief Equation &amp; Model Evolution"
      sectionIndex="Section 1"
      subtitle="From structural exponents to nonlinear amplification"
      description="Parameters, coefficients, and performance of the belief emergence model with two-column visualization layout"
    >
      {content}
    </SectionTemplate>
  );
};

export default BeliefEquationSection;
