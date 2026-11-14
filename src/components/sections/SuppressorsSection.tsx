import React, { useMemo } from 'react';
import { BlockMath } from 'react-katex';
import SectionTemplate from './SectionTemplate.tsx';
import {
  INTERACTION_TERMS,
  OPTIMIZED_SIGMOID_COEFFICIENTS,
  QUADRATIC_TERMS,
} from '../../data/feCoefficients';
import { getProductionDatasetMetadata, getProductionHeadlineMetrics } from '../../data/modelMetrics';
import {
  normalizePanelYToStructural,
  STRUCTURAL_MAX,
  STRUCTURAL_MIN,
} from '../../utils/modelContract';
import { useDataContext } from '../../contexts/DataContext';
import { BIAS_DEFINITION_PHRASE, computeBias } from '../../utils/metrics';
import { predictFromPanelRow } from '../../utils/validation/panelPredict';

type QuantileSummary = {
  n: number;
  min: number;
  q25: number;
  median: number;
  q75: number;
  max: number;
};

// Canonical numeric-safety interior band used throughout the UI.
// (Z values are saturated into [0.0001, 0.9999] during preprocessing/training.)
const TRAIN_Z_MIN = STRUCTURAL_MIN;
const TRAIN_Z_MAX = STRUCTURAL_MAX;
const TRAIN_Z_SPAN = TRAIN_Z_MAX - TRAIN_Z_MIN;

const axisT = (z: number): number => {
  const v = Math.min(Math.max(z, TRAIN_Z_MIN), TRAIN_Z_MAX);
  return (v - TRAIN_Z_MIN) / TRAIN_Z_SPAN;
};

const axisLabel = (t: number): string => {
  if (t === 0) return TRAIN_Z_MIN.toFixed(4);
  if (t === 1) return TRAIN_Z_MAX.toFixed(4);
  return t.toFixed(1);
};

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

const quantile = (sorted: number[], q: number): number => {
  if (sorted.length === 0) return NaN;
  const t = clamp01(q);
  const pos = (sorted.length - 1) * t;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const w = pos - lo;
  if (lo === hi) return sorted[lo];
  return (1 - w) * sorted[lo] + w * sorted[hi];
};

const summarize = (values: number[]): QuantileSummary => {
  const xs = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!xs.length) {
    return { n: 0, min: NaN, q25: NaN, median: NaN, q75: NaN, max: NaN };
  }
  return {
    n: xs.length,
    min: xs[0],
    q25: quantile(xs, 0.25),
    median: quantile(xs, 0.5),
    q75: quantile(xs, 0.75),
    max: xs[xs.length - 1],
  };
};

const SuppressorsSection: React.FC = () => {
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  const fmt = (value: number, digits = 3) => (Number.isFinite(value) ? value.toFixed(digits) : '—');
  const fmtSigned = (value: number, digits = 3) =>
    Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(digits)}` : '—';

  // Production headline metrics (canonical panel-fit; see scripts/generate_headline_metrics.ts via npm run generate:headline-metrics)
  const headline = getProductionHeadlineMetrics();
  const dataset = useMemo(() => getProductionDatasetMetadata(), []);
  const PRODUCTION = {
    r2: headline.r2,
    r: headline.correlation,
    mae: headline.mae,
    rmse: headline.rmse,
    bias: headline.bias,
  } as const;

  const { panelData, loading, error } = useDataContext();

  // =========================
  // Runtime marginal effects
  // =========================
  const marginal = useMemo(() => {
    if (!panelData || !panelData.length) {
      return {
        n: 0,
        dZdE: [] as number[],
        dZdS: [] as number[],
        dZdR: [] as number[],
        zhat: [] as number[],
        summary: {
          E: summarize([]),
          S: summarize([]),
          R: summarize([]),
        },
      };
    }

    const dZdE: number[] = [];
    const dZdS: number[] = [];
    const dZdR: number[] = [];
    const zhat: number[] = [];

    for (const r of panelData) {
      const result = predictFromPanelRow(r);
      const z = result.zPred;
      if (!Number.isFinite(z)) continue;
      zhat.push(z);

      // dZ/dΦ = Z(1−Z)
      const dZdPhi = z * (1 - z);

      // dΦ/dE = c6 + c_es*S + 2*c_e2*E
      const dPhi_dE = OPTIMIZED_SIGMOID_COEFFICIENTS.c6 + INTERACTION_TERMS.c_es * (r.S ?? 0) + 2 * QUADRATIC_TERMS.c_e2 * r.E;
      // dΦ/dS = c7 + c_es*E
      const dPhi_dS = OPTIMIZED_SIGMOID_COEFFICIENTS.c7 + INTERACTION_TERMS.c_es * r.E;
      // dΦ/dR = c8 + c_yr*Y_safe + c_tr*T + c_gr*G
      // NOTE: This is the exact interaction structure in src/utils/calculateModel.ts.
      const dPhi_dR =
        OPTIMIZED_SIGMOID_COEFFICIENTS.c8 +
        INTERACTION_TERMS.c_yr * normalizePanelYToStructural(r.Y) +
        INTERACTION_TERMS.c_tr * r.T +
        INTERACTION_TERMS.c_gr * (r.G ?? 0);

      dZdE.push(dZdPhi * dPhi_dE);
      dZdS.push(dZdPhi * dPhi_dS);
      dZdR.push(dZdPhi * dPhi_dR);
    }

    return {
      n: zhat.length,
      dZdE,
      dZdS,
      dZdR,
      zhat,
      summary: {
        E: summarize(dZdE),
        S: summarize(dZdS),
        R: summarize(dZdR),
      },
    };
  }, [panelData]);

  // =========================
  // Empirical validation (Section 1 pattern)
  // =========================
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
        bins: [] as Array<{
          binStart: number;
          binEnd: number;
          meanPred: number;
          meanObs: number;
          q25Obs: number;
          q75Obs: number;
          meanRes: number;
          q25Res: number;
          q75Res: number;
        }>,
        countryR2: [] as Array<{ iso3: string; country: string; n: number; r2: number; mae: number; rmse: number }>,
        n: 0,
        totalRows: 0,
        droppedRows: 0,
      };
    }

    const totalRows = panelData.length;

    // NOTE: Pattern-copied from Section 1 to guarantee identical evaluation pipeline and “correct R² graphics”.
    const pts: Array<{ x: number; y: number; e: number; iso3: string }> = [];
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

      // Residual definition aligned to labels: observed − predicted
      const e = zobs - zhat;
      pts.push({ x: zhat, y: zobs, e, iso3: r.iso3 });
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
        bins: [] as Array<{
          binStart: number;
          binEnd: number;
          meanPred: number;
          meanObs: number;
          q25Obs: number;
          q75Obs: number;
          meanRes: number;
          q25Res: number;
          q75Res: number;
        }>,
        countryR2: [] as Array<{ iso3: string; country: string; n: number; r2: number; mae: number; rmse: number }>,
        n: 0,
        totalRows,
        droppedRows: totalRows,
      };
    }

    const meanY = sumY / n;
    const SST_EPS = 1e-10;
    const sst = pts.reduce((acc, p) => acc + (p.y - meanY) * (p.y - meanY), 0);
    const r2 = sst > SST_EPS ? 1 - sse / sst : NaN;
    const cov = sumXY / n - (sumX / n) * (sumY / n);
    const sx = Math.sqrt(sumX2 / n - (sumX / n) * (sumX / n));
    const sy = Math.sqrt(sumY2 / n - (sumY / n) * (sumY / n));
    const corr = sx > 0 && sy > 0 ? cov / (sx * sy) : NaN;
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
    const bins: Array<{
      binStart: number;
      binEnd: number;
      meanPred: number;
      meanObs: number;
      q25Obs: number;
      q75Obs: number;
      meanRes: number;
      q25Res: number;
      q75Res: number;
    }> = [];
    const binsCount = 10;
    for (let i = 0; i < binsCount; i++) {
      const start = Math.floor((i * sorted.length) / binsCount);
      const end = Math.floor(((i + 1) * sorted.length) / binsCount);
      const slice = sorted.slice(start, end);
      if (!slice.length) continue;
      const mp = slice.reduce((a, p) => a + p.x, 0) / slice.length;
      const mo = slice.reduce((a, p) => a + p.y, 0) / slice.length;
      const obsSorted = slice
        .map((p) => p.y)
        .filter(Number.isFinite)
        .slice()
        .sort((a, b) => a - b);
      const resSorted = slice
        .map((p) => p.e)
        .filter(Number.isFinite)
        .slice()
        .sort((a, b) => a - b);
      const meanRes = slice.reduce((a, p) => a + p.e, 0) / slice.length;
      bins.push({
        binStart: slice[0].x,
        binEnd: slice[slice.length - 1].x,
        meanPred: mp,
        meanObs: mo,
        q25Obs: quantile(obsSorted, 0.25),
        q75Obs: quantile(obsSorted, 0.75),
        meanRes,
        q25Res: quantile(resSorted, 0.25),
        q75Res: quantile(resSorted, 0.75),
      });
    }

    const countryR2 = Array.from(byCountry.entries())
      .map(([iso3, v]) => {
        const meanYc = v.sumY / v.n;
        const sstc = v.sumY2 - v.n * meanYc * meanYc;
        // A per-country R2 is only meaningful when that country's outcome actually
        // varies. `sstc > SST_EPS` (1e-10) let through near-degenerate slices where a
        // rounding-level variance divided into a real SSE, producing values like -2220
        // and a chart mean of -113. Requiring the slice's variance to be a non-trivial
        // fraction of its scale keeps the statistic interpretable, and NaN is the honest
        // answer for a country whose Z barely moves: an R2 is undefined there.
        const degenerate = sstc <= Math.max(SST_EPS, Math.abs(v.sumY2) * 1e-6);
        const r2c = v.n >= 3 && !degenerate ? 1 - v.sse / sstc : NaN;
        const maec = v.mae / v.n;
        const rmsec = Math.sqrt(v.sse / v.n);
        return { iso3, country: v.country, n: v.n, r2: r2c, mae: maec, rmse: rmsec };
      })
      .sort((a, b) => a.iso3.localeCompare(b.iso3));

    const droppedRows = Math.max(0, totalRows - n);
    return { points: pts, residuals: resid, r2, corr, mae, rmse, bias, residMean, residSD, bins, countryR2, n, totalRows, droppedRows };
  }, [panelData]);

  const runtimeDiffMaterial =
    Number.isFinite(validation.r2) &&
    Number.isFinite(validation.mae) &&
    (Math.abs(validation.r2 - PRODUCTION.r2) > 0.05 || Math.abs(validation.mae - PRODUCTION.mae) > 0.05);

  const content = (
    <div className="belief-equation-content suppressors-content suppressors-section">
      {/* Free-flow 2-column packing (two independent stacks; no row coupling). */}
      <div className="suppressors-two-stack">
        <div className="suppressors-col">
          {/* 4.1 Definition + canonical Φ terms */}
          <div className="coefficients-visualization-card">
          <h4 className="viz-title">4.1 Suppressors: Definition &amp; Canonical Φ Terms</h4>
          <p className="viz-subtitle">Education, social support, and welfare capacity act as negative field contributors that reduce Φ</p>

          <div className="methodology-note">
            <p>
              Suppressors are not “special-cased” in code: they are standard signed terms in Φ. When a suppressor coefficient is negative, increasing the standardized
              suppressor variable lowers Φ, which lowers $Z$ through the nonlinear link.
            </p>
            <p>
              This section mirrors Sections 1–3: same preprocessing (only $C$ z-scored; other modifiers treated as standardized) and the same observed-outcome
              normalization to $[0.0001,0.9999]$ for evaluation.
            </p>
          </div>

          <div className="equation-showcase">
            <BlockMath
              math={`\\begin{aligned}
Z &= \\frac{B\\,e^{\\Phi}}{B\\,e^{\\Phi}+k}\\\\
B &= X_{\\mathrm{safe}}^{\\alpha}\\,Y_{\\mathrm{safe}}^{\\beta}
\\end{aligned}`}
              renderError={() => <span className="formula">Z = (B·e^Φ)/(B·e^Φ + k); B = X_safe^α · Y_safe^β</span>}
            />
          </div>

          <div className="equation-showcase">
            <BlockMath
              math={`\\begin{aligned}
\\Phi &= \\phi_0
 + c_6 E_{\\mathrm{std}} + c_7 S_{\\mathrm{std}} + c_8 R_{\\mathrm{std}} \\\\
&\\quad + c_{es}\\,E_{\\mathrm{std}}S_{\\mathrm{std}}
 + c_{yr}\\,Y_{\\mathrm{safe}}R_{\\mathrm{std}} + c_{tr}\\,T_{\\mathrm{std}}R_{\\mathrm{std}} + c_{gr}\\,G_{\\mathrm{std}}R_{\\mathrm{std}} \\\\
&\\quad + c_{e2}\\,E_{\\mathrm{std}}^{2} + \\cdots
\\end{aligned}`}
              renderError={() => <span className="formula">Φ = φ₀ + c₆E + c₇S + c₈R + c_es(E·S) + c_yr(Y·R) + c_tr(T·R) + c_gr(G·R) + c_e2E² + …</span>}
            />
          </div>

          <div className="methodology-note">
            <strong>Suppressor coefficients (signed):</strong> c₆ = {fmt(OPTIMIZED_SIGMOID_COEFFICIENTS.c6)} · c₇ = {fmt(OPTIMIZED_SIGMOID_COEFFICIENTS.c7)} · c₈ ={' '}
            {fmtSigned(OPTIMIZED_SIGMOID_COEFFICIENTS.c8)}. Interaction/quadratic terms are pulled directly from the production tables (no refits): c_es ={' '}
            {fmtSigned(INTERACTION_TERMS.c_es)}, c_yr = {fmtSigned(INTERACTION_TERMS.c_yr)}, c_tr = {fmtSigned(INTERACTION_TERMS.c_tr)}, c_gr ={' '}
            {fmtSigned(INTERACTION_TERMS.c_gr)}, c_e2 = {fmtSigned(QUADRATIC_TERMS.c_e2)}.
          </div>
          </div>

          {/* C) Calibration with uncertainty (deciles) — moved to left column */}
          <div className="coefficients-visualization-card">
            <h4 className="viz-title">Calibration Curve</h4>
            <p className="viz-subtitle">Decile bins: mean observed with IQR interval (ideal lies on diagonal)</p>

            <div className="equation-showcase">
              <BlockMath
                math={`\\begin{aligned}
\\textbf{Step 1 (binning):} &\\;\\text{Sort by predicted }\\hat z_i\\text{ and split into 10 equal-count bins }D_j.\\\\
\\textbf{Step 2 (means):} &\\;\\bar{\\hat z}_j = \\mathrm{mean}_{i\\in D_j}(\\hat z_i),\\qquad
\\bar z_j = \\mathrm{mean}_{i\\in D_j}(z_i).\\\\
\\textbf{Step 3 (uncertainty band):} &\\;\\mathrm{IQR}_j = [Q_{0.25}(z_i),\\;Q_{0.75}(z_i)]_{i\\in D_j}.\\\\
\\textbf{Plot:} &\\;(\\bar{\\hat z}_j,\\bar z_j)\\text{ with vertical band }\\mathrm{IQR}_j;\\;\\text{ideal line }y=x.
\\end{aligned}`}
                renderError={() => (
                  <span className="formula">
                    Sort by predicted ẑ; split into 10 equal-count bins. Plot (mean ẑ, mean z) with observed IQR band; ideal is y=x.
                  </span>
                )}
              />
            </div>

            <div className="methodology-note">
              <p>
                Notation: $\\hat z_i$ is the model prediction for row $i$, and $z_i$ is the observed (normalized) outcome.
                Each bin $D_j$ contains the same number of rows, so the curve tests calibration across the prediction range.
              </p>
              <p>
                How to read: points above the diagonal mean the model under-predicts on average in that regime ($\\bar z_j$ exceeds $\\bar \\hat z_j$).
                Points below indicate over-prediction ($\\bar z_j$ falls below $\\bar \\hat z_j$). Wider IQR bands indicate higher outcome dispersion within that regime.
              </p>
            </div>

            <svg viewBox="0 0 520 340" className="validation-chart" role="img" aria-label="Suppressor validation chart" focusable="false">
              <line x1="60" y1="260" x2="460" y2="260" stroke="#334155" strokeWidth="2" />
              <line x1="60" y1="40" x2="60" y2="260" stroke="#334155" strokeWidth="2" />
              <line x1="60" y1="260" x2="460" y2="60" stroke="#f59e0b" strokeDasharray="4,4" />

              {[0.2, 0.4, 0.6, 0.8].map((val) => (
                <g key={val}>
                  <line x1="60" y1={260 - val * 200} x2="460" y2={260 - val * 200} stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2,2" />
                  <line x1={60 + val * 400} y1="40" x2={60 + val * 400} y2="260" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2,2" />
                </g>
              ))}

              {validation.bins.map((b, i) => {
                const x = 60 + axisT(b.meanPred) * 400;
                const y = 260 - axisT(b.meanObs) * 200;
                const yLo = 260 - axisT(b.q25Obs) * 200;
                const yHi = 260 - axisT(b.q75Obs) * 200;
                return (
                  <g key={i}>
                    <line x1={x} y1={yHi} x2={x} y2={yLo} stroke="#10b981" strokeWidth={6} strokeLinecap="round" opacity={0.4} />
                    <circle cx={x} cy={y} r={3.2} fill="#10b981" fillOpacity="0.9" />
                  </g>
                );
              })}

              {[0.0, 0.2, 0.4, 0.6, 0.8, 1.0].map((val) => (
                <g key={val}>
                  <line x1="55" y1={260 - val * 200} x2="60" y2={260 - val * 200} stroke="#64748b" strokeWidth="1" />
                  <text x="50" y={260 - val * 200 + 4} textAnchor="end" fill="#94a3b8" fontSize="9">
                    {axisLabel(val)}
                  </text>
                  <line x1={60 + val * 400} y1="260" x2={60 + val * 400} y2="265" stroke="#64748b" strokeWidth="1" />
                  <text x={60 + val * 400} y="280" textAnchor="middle" fill="#94a3b8" fontSize="9">
                    {axisLabel(val)}
                  </text>
                </g>
              ))}

              <text x="260" y="320" textAnchor="middle" fill="#94a3b8" fontSize="10">
                Mean predicted Z
              </text>
              <text x="20" y="175" textAnchor="middle" fill="#94a3b8" fontSize="10" transform="rotate(-90 20 175)">
                Mean observed Z
              </text>
            </svg>

            <div className="methodology-note">
              Predicted values are sorted and split into 10 equal-count bins. Each marker plots (mean predicted, mean observed) and the vertical band is the observed IQR.
              Deviations above/below the diagonal indicate systematic under/over-prediction.
            </div>
          </div>

          {/* 4.5 Interpretation (kept directly under Calibration Curve, now left column) */}
          <div className="coefficients-visualization-card">
            <h4 className="viz-title">4.5 Scientific Interpretation (Conservative Narrative)</h4>
            <p className="viz-subtitle">Suppressors reshape probability mass by lowering Φ; mid-range Z is mechanically most responsive</p>

            <div className="equation-showcase">
              <BlockMath
                math={`\\begin{aligned}
\\Delta Z &\\approx \\frac{dZ}{d\\Phi}\\,\\Delta\\Phi = Z(1-Z)\\,\\Delta\\Phi\\\\
\\Delta\\Phi_{\\text{supp}} &= c_6\\,\\Delta E_{\\text{std}} + c_7\\,\\Delta S_{\\text{std}} + c_8\\,\\Delta R_{\\text{std}} + c_{es}\\,\\Delta(E_{\\text{std}}S_{\\text{std}}) + \\cdots
\\end{aligned}`}
                renderError={() => <span className="formula">ΔZ ≈ Z(1−Z)ΔΦ; ΔΦ_supp = c₆ΔE + c₇ΔS + c₈ΔR + c_esΔ(E·S) + …</span>}
              />
            </div>

            <div className="methodology-note">
              <p>
                This section’s claims are anchored to the signed coefficients used in production: c₆ (Education) = {fmtSigned(OPTIMIZED_SIGMOID_COEFFICIENTS.c6)}, c₇ (Social support) ={' '}
                {fmtSigned(OPTIMIZED_SIGMOID_COEFFICIENTS.c7)}, c₈ (Redistribution/Welfare) = {fmtSigned(OPTIMIZED_SIGMOID_COEFFICIENTS.c8)}. Under the fitted model, their signs govern whether increasing the
                standardized variable raises or lowers Φ.
              </p>
              <p>
                Mechanistically, suppressor impact on the probability scale is controlled by $Z(1-Z)$: the same Φ shift produces the largest movement in $Z$ near the mid-range ($Z\approx0.5$)
                and fades at extremes.
              </p>
            </div>
          </div>

          {/* 4.3b Runtime Marginal Effects (placed to pack under 4.1) */}
          <div className="coefficients-visualization-card">
            <h4 className="viz-title">4.3b Runtime Marginal Effects (Panel Summary)</h4>
            <p className="viz-subtitle">Interval plot shows median + IQR of $dZ/dE$, $dZ/dS$, $dZ/dR$ across the canonical panel</p>

            {!marginal.n ? (
              <div className="validation-status">{loading ? 'Loading panel data…' : 'Data unavailable for runtime derivative summary.'}</div>
            ) : (
              <>
                <svg viewBox="0 0 560 240" className="sensitivity-chart" role="img" aria-label="Suppressor sensitivity chart" focusable="false">
                  {(() => {
                    const rows = [
                      { key: 'E', label: 'dZ/dE', s: marginal.summary.E, color: '#ef4444' },
                      { key: 'S', label: 'dZ/dS', s: marginal.summary.S, color: '#f97316' },
                      { key: 'R', label: 'dZ/dR', s: marginal.summary.R, color: '#10b981' },
                    ];

                    const finite = rows
                      .flatMap((r) => [r.s.q25, r.s.q75, r.s.median])
                      .filter(Number.isFinite);
                    const absMax = Math.max(...finite.map((v) => Math.abs(v)), 1e-6);
                    const xMin = -absMax;
                    const xMax = absMax;

                    const padL = 90;
                    const x0 = padL;
                    // Reserve a right-side gutter for text labels so they never collide with bars.
                    const plotX1 = 420;
                    const labelX = 556;
                    const scaleX = (v: number) => x0 + ((v - xMin) / (xMax - xMin)) * (plotX1 - x0);
                    const yTop = 45;
                    const rowH = 52;

                    const xZero = scaleX(0);

                    return (
                      <>
                        <line x1={xZero} y1={30} x2={xZero} y2={210} stroke="#94a3b8" strokeDasharray="4,4" opacity={0.9} />
                        <line x1={x0} y1={210} x2={plotX1} y2={210} stroke="#334155" strokeWidth={2} />

                        {rows.map((r, i) => {
                          const y = yTop + i * rowH;
                          const xQ1 = scaleX(r.s.q25);
                          const xQ3 = scaleX(r.s.q75);
                          const xMed = scaleX(r.s.median);
                          return (
                            <g key={r.key}>
                              <text x={padL - 12} y={y + 5} textAnchor="end" fill="#e2e8f0" fontSize={12} fontWeight={700}>
                                {r.label}
                              </text>
                              <line x1={xQ1} y1={y} x2={xQ3} y2={y} stroke={r.color} strokeWidth={6} strokeLinecap="round" opacity={0.85} />
                              <line x1={xMed} y1={y - 10} x2={xMed} y2={y + 10} stroke="#ffffff" strokeWidth={2} opacity={0.9} />
                              <text x={labelX} y={y + 5} textAnchor="end" fill="#94a3b8" fontSize={9}>
                                med {fmt(r.s.median, 4)} · IQR [{fmt(r.s.q25, 4)}, {fmt(r.s.q75, 4)}]
                              </text>
                            </g>
                          );
                        })}

                        <text x={(x0 + plotX1) / 2} y={230} textAnchor="middle" fill="#cbd5e1" fontSize={11} fontWeight={600}>
                          Marginal effect on probability scale (signed)
                        </text>
                        <text x={(x0 + plotX1) / 2} y={20} textAnchor="middle" fill="#f1f5f9" fontSize={12} fontWeight={600}>
                          Runtime panel summary (N = {marginal.n})
                        </text>
                      </>
                    );
                  })()}
                </svg>

                <div className="methodology-note">
                  Runtime computation uses calculateModel() predictions and the canonical interaction/quadratic structure.
                  <strong>Interpretation:</strong> negative values imply a marginal decrease in belief emergence ($Z$) as the standardized suppressor increases.
                  The interval width (IQR) shows how context (interactions with $S$, $E$, and $Y,T,G$ for $R$) modulates suppressor strength.
                </div>
              </>
            )}
          </div>

          {/* B) Country-level fit summary */}
          <div className="coefficients-visualization-card">
            <h4 className="viz-title">Country-Level Fit Summary</h4>
            <p className="viz-subtitle">Within-country R² is reported only when within-country variance is non-degenerate</p>

            <svg viewBox="0 0 600 320" className="country-slice-chart" role="img" aria-label="Country-level suppressor response slices chart" focusable="false">
              <line x1="60" y1="50" x2="60" y2="260" stroke="#334155" strokeWidth="2" />
              <line x1="60" y1="260" x2="560" y2="260" stroke="#334155" strokeWidth="2" />

              {(() => {
                const all = validation.countryR2 || [];
                const series = all.filter((d) => Number.isFinite(d.r2)).slice().sort((a, b) => (b.r2 as number) - (a.r2 as number));
                if (!series.length) return null;

                const xMin = -0.2;
                const xMax = 1.0;
                const x0 = 60;
                const x1 = 560;
                const yTop = 70;
                const yBot = 245;
                const rowH = (yBot - yTop) / Math.max(1, series.length - 1);
                const scaleX = (v: number) => x0 + ((clamp(v, xMin, xMax) - xMin) / (xMax - xMin)) * (x1 - x0);

                const mean = series.reduce((a, d) => a + (d.r2 as number), 0) / series.length;
                const xMean = scaleX(mean);

                return (
                  <>
                    {/* reference lines */}
                    <line x1={scaleX(0)} y1="50" x2={scaleX(0)} y2="260" stroke="#64748b" strokeDasharray="2,3" opacity={0.8} />
                    <line x1={xMean} y1="50" x2={xMean} y2="260" stroke="#ef4444" strokeDasharray="4,4" opacity={0.9} />

                    {series.map((d, i) => {
                      const y = yTop + i * rowH;
                      const x = scaleX(d.r2);
                      return (
                        <g key={d.iso3}>
                          <line x1={scaleX(0)} y1={y} x2={x} y2={y} stroke="#10b981" strokeWidth={3} opacity={0.55} strokeLinecap="round" />
                          <circle cx={x} cy={y} r={3.5} fill="#10b981" opacity={0.9} />
                        </g>
                      );
                    })}

                    <text x="300" y="28" textAnchor="middle" fill="#f1f5f9" fontSize="12" fontWeight="600">
                      Within-country R² (sorted) · mean {fmt(mean)} · undefined {all.length - series.length}
                    </text>
                  </>
                );
              })()}

              {[-0.2, 0, 0.2, 0.4, 0.6, 0.8, 1.0].map((val) => (
                <g key={val}>
                  <line
                    x1={60 + ((val - -0.2) / (1.0 - -0.2)) * 500}
                    y1={260}
                    x2={60 + ((val - -0.2) / (1.0 - -0.2)) * 500}
                    y2={265}
                    stroke="#64748b"
                    strokeWidth="1"
                  />
                  <text x={60 + ((val - -0.2) / (1.0 - -0.2)) * 500} y={285} textAnchor="middle" fill="#94a3b8" fontSize="9">
                    {val.toFixed(1)}
                  </text>
                </g>
              ))}

              <text x="310" y="310" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="600">
                R² scale (undefined when within-country variance is ~0)
              </text>
            </svg>

            <div className="methodology-note">
              We compute within-country $R^2 = 1 - SSE/SST$ only when the within-country outcome variance is non-degenerate (and $n\ge3$); otherwise $R^2$ is
              undefined rather than allowed to explode numerically.
            </div>
          </div>

          {/* 4.5b Context Dependence & Boundary */}
          <div className="coefficients-visualization-card">
            <h4 className="viz-title">4.5b Context Dependence &amp; Boundary</h4>
            <p className="viz-subtitle">Interactions turn suppressors into regime-dependent forces; interpretation is predictive (not causal)</p>
            <div className="methodology-note">
              <p>
                Interactions make suppression context-dependent rather than constant: c_es links education and social support (synergy/antagonism depending on sign), while c_yr, c_tr, c_gr
                make welfare capacity conditional on structural/trauma context ($Y$, $T$, $G$). This is why we report an interval (IQR), not a single number.
              </p>
              <p>
                Methodological boundary: these are predictive associations in a calibrated field model, not causal treatment effects. The evaluation diagnostics assess fit quality (calibration, stability
                across countries) under the same preprocessing as Sections 1–3.
              </p>
            </div>
          </div>
        </div>

        <div className="suppressors-col">
          {/* 4.2 Coefficient anatomy */}
          <div className="coefficients-visualization-card">
            <h4 className="viz-title">4.2 Coefficient Anatomy (Suppressor-Related Terms)</h4>
            <p className="viz-subtitle">Signed main effects + suppressor-relevant interactions/quadratic (Ridge L2, α=1.0)</p>

            <svg viewBox="0 0 720 320" className="coeff-chart" role="img" aria-label="Suppressor coefficient contributions chart" focusable="false">
          <defs>
            <linearGradient id="suppNeg" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.65" />
            </linearGradient>
            <linearGradient id="suppPos" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.55" />
            </linearGradient>
          </defs>

          {(() => {
            const items = [
              { label: 'c6  (E)', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c6 },
              { label: 'c7  (S)', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c7 },
              { label: 'c8  (R)', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c8 },
              { label: 'c_es (E×S)', value: INTERACTION_TERMS.c_es },
              { label: 'c_yr (Y×R)', value: INTERACTION_TERMS.c_yr },
              { label: 'c_tr (T×R)', value: INTERACTION_TERMS.c_tr },
              { label: 'c_gr (G×R)', value: INTERACTION_TERMS.c_gr },
              { label: 'c_e2 (E²)', value: QUADRATIC_TERMS.c_e2 },
            ];

            const maxAbs = Math.max(...items.map((d) => Math.abs(d.value)), 1e-6);
            const x0 = 320;
            const xMax = 680;
            const barMax = xMax - x0 - 10;
            const scale = barMax / maxAbs;

            return (
              <>
                {/* Axes */}
                <line x1={x0} y1={40} x2={x0} y2={280} stroke="#334155" strokeWidth={2} />
                <line x1={60} y1={280} x2={xMax} y2={280} stroke="#334155" strokeWidth={2} />
                <line x1={x0} y1={40} x2={x0} y2={280} stroke="#94a3b8" strokeDasharray="5,5" strokeWidth={1.3} />

                {items.map((d, i) => {
                  const y = 60 + i * 26;
                  const w = Math.abs(d.value) * scale;
                  const isPos = d.value >= 0;
                  const x = isPos ? x0 : x0 - w;
                  const fill = isPos ? 'url(#suppPos)' : 'url(#suppNeg)';
                  const valueX = isPos ? x0 + w + 8 : x0 - w - 8;
                  const anchor = isPos ? 'start' : 'end';
                  const valueColor = isPos ? '#10b981' : '#ef4444';
                  return (
                    <g key={d.label}>
                      <rect x={x} y={y - 10} width={w} height={18} fill={fill} />
                      <text x={x0 - 12} y={y + 3} textAnchor="end" fill="#e2e8f0" fontSize={11} fontWeight={600}>
                        {d.label}
                      </text>
                      <text x={valueX} y={y + 3} textAnchor={anchor} fill={valueColor} fontSize={11} fontWeight={700}>
                        {fmtSigned(d.value)}
                      </text>
                    </g>
                  );
                })}

                <text x={370} y={20} textAnchor="middle" fill="#f1f5f9" fontSize={13} fontWeight={600}>
                  Signed coefficients (no re-derivation)
                </text>
                <text x={370} y={300} textAnchor="middle" fill="#94a3b8" fontSize={10}>
                  Bar length ∝ |coefficient|; red = negative, green = positive
                </text>
              </>
            );
          })()}
            </svg>
            <div className="methodology-note">
              Bars encode the signed contribution of each term to Φ. Negative terms (red) are direct suppressors; positive terms (green) are conditional
              counter-forces (e.g., redistribution interacting with Y, T, G).
            </div>

            <div className="equation-showcase">
              <BlockMath
                math={`\\begin{aligned}
\\Phi_{\\text{supp}} &= c_6E_{\\text{std}} + c_7S_{\\text{std}} + c_8R_{\\text{std}} \\\\
&\\quad + c_{es}E_{\\text{std}}S_{\\text{std}} + c_{e2}E_{\\text{std}}^2 \\\\
&\\quad + c_{yr}Y_{\\text{safe}}R_{\\text{std}} + c_{tr}T_{\\text{std}}R_{\\text{std}} + c_{gr}G_{\\text{std}}R_{\\text{std}}
\\end{aligned}`}
                renderError={() => (
                  <span className="formula">
                    Φ_supp = c₆E + c₇S + c₈R + c_es(E·S) + c_e2E² + c_yr(Y·R) + c_tr(T·R) + c_gr(G·R)
                  </span>
                )}
              />
            </div>

            <div className="methodology-note">
              <p>
                <strong>Interpretation:</strong> each bar is a coefficient, not a realized effect. The realized contribution at a row is
                $\Delta\Phi_j = c_j\,f_j(\,row\,)$. Because $Z$ is nonlinear in Φ, the same $\Delta\Phi$ moves $Z$ more when $Z\approx 0.5$ than when $Z$ is near 0 or 1.
              </p>
              <p>
                <strong>Suppressor signature:</strong> when c6 and c7 are negative, higher E_std or S_std decreases Φ (and hence decreases Z), holding other modifiers fixed.
                Interactions can attenuate or amplify this depending on context (e.g., c_es changes the local slope of E as S varies).
              </p>
            </div>
          </div>

          {/* 4.3 Marginal Suppression Mechanics (Derivatives) */}
          <div className="coefficients-visualization-card">
          <h4 className="viz-title">4.3 Marginal Suppression Mechanics (Derivatives)</h4>
          <p className="viz-subtitle">Chain rule links Φ-terms to probability-scale effects; sensitivity peaks near mid-range Z</p>

          <div className="viz-math">
            <BlockMath
              math={`\\begin{aligned}
\\frac{dZ}{d\\Phi} &= Z(1-Z) \\\\
\\frac{d\\Phi}{dE_{\\text{std}}} &= c_6 + c_{es}S_{\\text{std}} + 2c_{e2}E_{\\text{std}} \\\\
\\frac{d\\Phi}{dS_{\\text{std}}} &= c_7 + c_{es}E_{\\text{std}} \\\\
\\frac{d\\Phi}{dR_{\\text{std}}} &= c_8 + c_{yr}Y_{\\text{safe}} + c_{tr}T_{\\text{std}} + c_{gr}G_{\\text{std}} \\\\
\\Rightarrow\\;\\frac{dZ}{dE_{\\text{std}}} &= \\frac{dZ}{d\\Phi}\\frac{d\\Phi}{dE_{\\text{std}}},\\;\\frac{dZ}{dS_{\\text{std}}} = \\frac{dZ}{d\\Phi}\\frac{d\\Phi}{dS_{\\text{std}}},\\;\\frac{dZ}{dR_{\\text{std}}} = \\frac{dZ}{d\\Phi}\\frac{d\\Phi}{dR_{\\text{std}}}
\\end{aligned}`}
              renderError={() => (
                <span className="formula">
                  dZ/dΦ = Z(1−Z); dΦ/dE = c₆ + c_es·S + 2c_e2·E; dΦ/dS = c₇ + c_es·E; dΦ/dR = c₈ + c_yr·Y + c_tr·T + c_gr·G; dZ/d· =
                  (dZ/dΦ)(dΦ/d·)
                </span>
              )}
            />
          </div>

          <div className="methodology-note">
            <strong>Nonlinearity:</strong> $Z(1-Z)$ is maximized at $Z=0.5$ and collapses as $Z\to 0$ or $Z\to 1$. So even a constant change in Φ produces the
            largest probability-scale movement in the mid-range regime.
          </div>
          </div>

          {/* 4.4 Empirical Validation — Residual Structure */}
          <div className="coefficients-visualization-card">
          <h4 className="viz-title">4.4 Empirical Validation — Residual Structure</h4>
          <p className="viz-subtitle">Decile residual bands summarize calibration without duplicating other sections’ scatter plots</p>

          <div className="validation-summary-card">
            <div className="validation-summary-top">
              <ul className="validation-metrics-list">
                <li>
                  Panel: {dataset.countries} countries (rows used: {validation.n || '—'} / {validation.totalRows || '—'}). Predictions computed via calculateModel().
                </li>
                <li>Outcome scaling: Z_belief_outcome normalized to [0.0001, 0.9999] using Z_NORMALIZATION (canonical training preprocessing).</li>
                <li>
                  <strong>Production headline (canonical panel-fit):</strong> R² = {PRODUCTION.r2} · r = {PRODUCTION.r} · MAE = {PRODUCTION.mae} · RMSE = {PRODUCTION.rmse} · Bias ({BIAS_DEFINITION_PHRASE}) ≈ {PRODUCTION.bias}
                </li>
                <li>
                  Runtime validation check: R² {Number.isFinite(validation.r2) ? fmt(validation.r2) : '—'} · r {Number.isFinite(validation.corr) ? fmt(validation.corr) : '—'} ·{' '}
                  MAE {Number.isFinite(validation.mae) ? fmt(validation.mae) : '—'} · RMSE {Number.isFinite(validation.rmse) ? fmt(validation.rmse) : '—'} (N = {validation.n || 0})
                </li>
                {runtimeDiffMaterial && (
                  <li>
                    <strong>Note:</strong> Runtime metrics differ materially from the production headline values; confirm the loaded CSV is the canonical panel and that runtime
                    preprocessing matches training.
                  </li>
                )}
              </ul>
              {(loading || error) && <div className="validation-status">{loading ? 'Loading panel data…' : `Panel load error: ${error}`}</div>}
            </div>
          </div>

          <svg viewBox="0 0 520 340" className="validation-chart" role="img" aria-label="Suppressor model validation chart" focusable="false">
            <line x1="60" y1="260" x2="460" y2="260" stroke="#334155" strokeWidth="2" />
            <line x1="60" y1="40" x2="60" y2="260" stroke="#334155" strokeWidth="2" />

            {(() => {
              const bs = validation.bins || [];
              if (!bs.length) return null;
              const vals = bs.flatMap((b) => [b.q25Res, b.q75Res, b.meanRes]).filter(Number.isFinite);
              const absMax = Math.max(...vals.map((v) => Math.abs(v)), 1e-3);
              const range = clamp(absMax * 1.25, 0.05, 0.35);
              const y0 = 260;
              const y1 = 60;
              const x0 = 60;
              const x1 = 460;
              // Predicted Z values are shown on the canonical interior-band axis ($[0.0001,0.9999]$),
              // even though they are plotted in 0–1 SVG space.
              const scaleXT = (t: number) => x0 + clamp(t, 0, 1) * (x1 - x0);
              const scaleX = (z: number) => x0 + axisT(z) * (x1 - x0);
              const scaleY = (v: number) => y0 - ((clamp(v, -range, range) + range) / (2 * range)) * (y0 - y1);
              const yZero = scaleY(0);

              return (
                <>
                  {/* grid */}
                  {[-0.5, -0.25, 0, 0.25, 0.5].map((t) => {
                    const v = t * range * 2;
                    const y = scaleY(v);
                    return <line key={t} x1={x0} y1={y} x2={x1} y2={y} stroke="#1e293b" strokeWidth="0.6" strokeDasharray="2,2" />;
                  })}

                  {/* zero line */}
                  <line x1={x0} y1={yZero} x2={x1} y2={yZero} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4,4" opacity={0.9} />

                  {/* decile residual bands */}
                  {bs.map((b, i) => {
                    const x = scaleX(b.meanPred);
                    const yLo = scaleY(b.q25Res);
                    const yHi = scaleY(b.q75Res);
                    const yMean = scaleY(b.meanRes);
                    return (
                      <g key={i}>
                        <line x1={x} y1={yHi} x2={x} y2={yLo} stroke="#10b981" strokeWidth={6} strokeLinecap="round" opacity={0.5} />
                        <circle cx={x} cy={yMean} r={3.2} fill="#10b981" opacity={0.9} />
                      </g>
                    );
                  })}

                  {/* ticks */}
                  {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((val) => (
                    <g key={val}>
                      <line x1={scaleXT(val)} y1={260} x2={scaleXT(val)} y2={265} stroke="#64748b" strokeWidth="1" />
                      <text x={scaleXT(val)} y={280} textAnchor="middle" fill="#94a3b8" fontSize="9">
                        {axisLabel(val)}
                      </text>
                    </g>
                  ))}

                  {[-range, -range / 2, 0, range / 2, range].map((val) => (
                    <g key={val}>
                      <line x1={55} y1={scaleY(val)} x2={60} y2={scaleY(val)} stroke="#64748b" strokeWidth="1" />
                      <text x={50} y={scaleY(val) + 4} textAnchor="end" fill="#94a3b8" fontSize="9">
                        {fmt(val, 3)}
                      </text>
                    </g>
                  ))}

                  <text x="260" y="320" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="600">
                    Predicted Z (deciles)
                  </text>
                  <text x="22" y="155" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="600" transform="rotate(-90 22 155)">
                    Residual (obs − pred)
                  </text>

                  <text x="260" y="28" textAnchor="middle" fill="#f1f5f9" fontSize="12" fontWeight="600">
                    Production: R² = {PRODUCTION.r2} · r = {PRODUCTION.r} · MAE = {PRODUCTION.mae} (N = {validation.n || 0})
                  </text>
                  <text x="260" y="44" textAnchor="middle" fill="#94a3b8" fontSize="10">
                    Runtime check: bias {Number.isFinite(validation.bias) ? fmt(validation.bias, 4) : '—'} · SD {Number.isFinite(validation.residSD) ? fmt(validation.residSD, 4) : '—'}
                  </text>
                </>
              );
            })()}
          </svg>

          <div className="methodology-note">
            Each vertical band is the residual IQR within a predicted-decile bin; the dot is the mean residual. This directly tests whether suppressor-linked
            predictions systematically under/over-shoot in specific probability regimes.
          </div>
          </div>

          {/* Residual Diagnostics */}
          <div className="coefficients-visualization-card">
          <h4 className="viz-title">Residual Diagnostics</h4>
          <p className="viz-subtitle">Distribution of residuals (observed − predicted): bias and dispersion</p>

          <svg viewBox="0 0 520 340" className="validation-chart" role="img" aria-label="Suppressor sensitivity validation chart" focusable="false">
            <line x1="60" y1="260" x2="460" y2="260" stroke="#334155" strokeWidth="2" />
            <line x1="60" y1="40" x2="60" y2="260" stroke="#334155" strokeWidth="2" />

            {(() => {
              const r = (validation.residuals || []).filter(Number.isFinite);
              if (!r.length) return null;

              const mean = validation.residMean;
              const sd = validation.residSD;
              const absMax = Math.max(...r.map((v) => Math.abs(v)), 1e-3);
              const range = clamp(absMax * 1.1, 0.05, 0.6);
              const minX = -range;
              const maxX = range;
              const bins = 24;
              const counts = new Array<number>(bins).fill(0);
              for (const v of r) {
                const t = (clamp(v, minX, maxX) - minX) / (maxX - minX);
                const idx = Math.min(bins - 1, Math.max(0, Math.floor(t * bins)));
                counts[idx] += 1;
              }
              const maxC = Math.max(...counts, 1);
              const x0 = 60;
              const x1 = 460;
              const y0 = 260;
              const y1 = 60;
              const binW = (x1 - x0) / bins;
              const scaleX = (v: number) => x0 + ((v - minX) / (maxX - minX)) * (x1 - x0);

              return (
                <>
                  {/* zero line */}
                  <line x1={scaleX(0)} y1={40} x2={scaleX(0)} y2={260} stroke="#f59e0b" strokeDasharray="4,4" strokeWidth="1.5" opacity={0.85} />

                  {counts.map((c, i) => {
                    const h = (c / maxC) * (y0 - y1);
                    return (
                      <rect
                        key={i}
                        x={x0 + i * binW + 1}
                        y={y0 - h}
                        width={Math.max(1, binW - 2)}
                        height={h}
                        fill="#10b981"
                        opacity={0.55}
                      />
                    );
                  })}

                  {/* ticks */}
                  {[-range, -range / 2, 0, range / 2, range].map((v) => (
                    <g key={v}>
                      <line x1={scaleX(v)} y1={260} x2={scaleX(v)} y2={265} stroke="#64748b" strokeWidth="1" />
                      <text x={scaleX(v)} y={280} textAnchor="middle" fill="#94a3b8" fontSize="9">
                        {fmt(v, 3)}
                      </text>
                    </g>
                  ))}

                  <text x="260" y="320" textAnchor="middle" fill="#94a3b8" fontSize="10">
                    Residual = observed − predicted
                  </text>
                  <text x="20" y="170" textAnchor="middle" fill="#94a3b8" fontSize="10" transform="rotate(-90 20 170)">
                    Count (relative)
                  </text>

                  <text x="260" y="40" textAnchor="middle" fill="#f1f5f9" fontSize="12" fontWeight="600">
                    Bias = {Number.isFinite(mean) ? fmt(mean, 4) : '—'} · SD = {Number.isFinite(sd) ? fmt(sd, 4) : '—'} (N = {r.length})
                  </text>
                </>
              );
            })()}
          </svg>

          <div className="methodology-note">
            Bias near 0 supports calibration “on average”; SD summarizes typical error magnitude on the probability scale.
            This is a runtime diagnostic only; production headline metrics remain the primary reported performance.
          </div>

          <div className="equation-showcase">
            <BlockMath
              math={`\\begin{aligned}
  e_i &= y_i - \u005chat{y}_i \\\\
  \\bar e &= \\frac{1}{n}\\sum_{i=1}^n e_i,\\qquad
  s_e^2 = \\frac{1}{n}\\sum_{i=1}^n (e_i-\\bar e)^2 \\\\
  \\text{RMSE}^2 &= \\frac{1}{n}\\sum_{i=1}^n e_i^2 = s_e^2 + \\bar e^2
  \\end{aligned}`}
              renderError={() => <span className="formula">eᵢ = yᵢ − ŷᵢ; mean(e)=b; RMSE² = Var(e)+b²</span>}
            />
          </div>

          <div className="methodology-note">
            <p>
              <strong>What “good” looks like:</strong> $\bar e\approx 0$ (no global bias), histogram roughly symmetric around 0, and most mass within a narrow interval.
              Large $s_e$ with small $\bar e$ implies dispersion/noise rather than systematic miscalibration.
            </p>
            <p>
              <strong>Connection to the decile residual bands:</strong> the stronger condition is that mean residual is near 0 within each predicted regime (each decile bin).
              That is exactly what the decile IQR/mean plot tests.
            </p>
          </div>
          </div>

        </div>
      </div>

      <div className="section-end-indicator">
        <div className="end-line"></div>
        <div className="end-badge">
          <span className="end-text">End of Section 4</span>
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
      title="Suppressors of Belief Emergence"
      sectionIndex="Section 4"
      subtitle="Entropic regulators and institutional dampening mechanisms"
      description="Signed negative-field contributors (E, S) and context-dependent welfare interactions (R) that reshape belief emergence probability"
    >
      {content}
    </SectionTemplate>
  );
};

export default SuppressorsSection;
