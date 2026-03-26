import React from 'react';
import SectionTemplate from './SectionTemplate.tsx';
import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';
import { useDataContext } from '../../contexts/DataContext';
import { Z_NORMALIZATION } from '../../data/feCoefficients';
import { PANEL_X_MAX, PANEL_X_MIN, PANEL_Y_MAX, PANEL_Y_MIN, STRUCTURAL_MAX, STRUCTURAL_MIN } from '../../utils/modelContract';
import constructValidityInvarianceArtifact from '../../data/analysis/construct_validity_invariance.json';
import type { ConstructValidityInvarianceSummary } from '../../utils/validation/computeConstructValidityInvarianceSummary';
import './CoreVariablesSection.css';

const CONSTRUCT_VALIDITY_ARTIFACT =
  constructValidityInvarianceArtifact as unknown as ConstructValidityInvarianceSummary;

const CoreVariablesSection: React.FC = () => {
  const { panelData, loading, error, statistics } = useDataContext();

  // Canonical fixed bounds used by the preprocessing/model pipeline.
  // (Mirrors src/data/canonical/preprocessing.py and src/utils/calculateModel.ts)
  const STRUCTURAL_SPAN = STRUCTURAL_MAX - STRUCTURAL_MIN;

  const fmt = (v: number, digits = 3) => (Number.isFinite(v) ? v.toFixed(digits) : '—');
  const fmtNullable = (v: number | null | undefined, digits = 3) =>
    v !== null && Number.isFinite(v) ? (v as number).toFixed(digits) : '—';
  const fmtPctNullable = (v: number | null | undefined, digits = 1) =>
    v !== null && Number.isFinite(v) ? `${((v as number) * 100).toFixed(digits)}%` : '—';

  const safeMeanStd = React.useCallback((values: number[]) => {
    if (values.length === 0) return { n: 0, mean: NaN, std: NaN, min: NaN, max: NaN };
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let sum = 0;
    let sum2 = 0;
    for (const v of values) {
      min = Math.min(min, v);
      max = Math.max(max, v);
      sum += v;
      sum2 += v * v;
    }
    const n = values.length;
    const mean = sum / n;
    const varPop = Math.max(0, sum2 / n - mean * mean);
    return { n, mean, std: Math.sqrt(varPop), min, max };
  }, []);

  const pearsonR = (xs: number[], ys: number[]) => {
    const n = Math.min(xs.length, ys.length);
    if (n < 2) return { n, r: NaN };
    let sumX = 0;
    let sumY = 0;
    let sumXX = 0;
    let sumYY = 0;
    let sumXY = 0;
    for (let i = 0; i < n; i++) {
      const x = xs[i];
      const y = ys[i];
      sumX += x;
      sumY += y;
      sumXX += x * x;
      sumYY += y * y;
      sumXY += x * y;
    }
    const num = n * sumXY - sumX * sumY;
    const den = Math.sqrt(Math.max(0, (n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY)));
    return { n, r: den > 0 ? num / den : NaN };
  };

  const olsLine = (xs: number[], ys: number[]) => {
    const n = Math.min(xs.length, ys.length);
    if (n < 2) return { n, intercept: NaN, slope: NaN };
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < n; i++) {
      sumX += xs[i];
      sumY += ys[i];
    }
    const meanX = sumX / n;
    const meanY = sumY / n;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - meanX;
      sxx += dx * dx;
      sxy += dx * (ys[i] - meanY);
    }
    const slope = sxx > 0 ? sxy / sxx : NaN;
    const intercept = Number.isFinite(slope) ? meanY - slope * meanX : NaN;
    return { n, intercept, slope };
  };

  const histogram = React.useCallback((values: number[], bins: number) => {
    const s = safeMeanStd(values);
    if (s.n === 0 || !Number.isFinite(s.min) || !Number.isFinite(s.max) || s.min === s.max) {
      return { counts: Array.from({ length: bins }, () => 0), min: s.min, max: s.max, maxCount: 0 };
    }
    const counts = Array.from({ length: bins }, () => 0);
    const span = s.max - s.min;
    for (const v of values) {
      const t = (v - s.min) / span;
      const idx = Math.min(bins - 1, Math.max(0, Math.floor(t * bins)));
      counts[idx] += 1;
    }
    const maxCount = counts.reduce((m, c) => Math.max(m, c), 0);
    return { counts, min: s.min, max: s.max, maxCount };
  }, [safeMeanStd]);

  const descriptives = React.useMemo(() => {
    const rows = panelData ?? [];
    const xs = rows.map((r) => r.X).filter(Number.isFinite);
    const ys = rows.map((r) => r.Y).filter(Number.isFinite);
    const zs = rows.map((r) => r.Z).filter(Number.isFinite);

    const xzRows = rows.filter((r) => Number.isFinite(r.X) && Number.isFinite(r.Z));
    const xzX = xzRows.map((r) => r.X);
    const xzZ = xzRows.map((r) => r.Z);

    const yzRows = rows.filter((r) => Number.isFinite(r.Y) && Number.isFinite(r.Z));
    const yzY = yzRows.map((r) => r.Y);
    const yzZ = yzRows.map((r) => r.Z);

    const xyRows = rows.filter((r) => Number.isFinite(r.X) && Number.isFinite(r.Y));
    const xyX = xyRows.map((r) => r.X);
    const xyY = xyRows.map((r) => r.Y);

    const scale01 = (v: number, min: number, max: number) => (v - min) / (max - min);
    let xLower = 0;
    let xUpper = 0;
    let yLower = 0;
    let yUpper = 0;
    for (const r of xyRows) {
      const tx = scale01(r.X, PANEL_X_MIN, PANEL_X_MAX);
      const ty = scale01(r.Y, PANEL_Y_MIN, PANEL_Y_MAX);
      if (tx <= 0) xLower += 1;
      if (tx >= 1) xUpper += 1;
      if (ty <= 0) yLower += 1;
      if (ty >= 1) yUpper += 1;
    }
    const clipping = {
      n: xyRows.length,
      xLower,
      xUpper,
      xAny: xLower + xUpper,
      yLower,
      yUpper,
      yAny: yLower + yUpper,
    };

    const rXY = pearsonR(xyX, xyY);
    const rXZ = pearsonR(xzX, xzZ);
    const rYZ = pearsonR(yzY, yzZ);

    const lineXY = olsLine(xyX, xyY);
    const lineXZ = olsLine(xzX, xzZ);
    const lineYZ = olsLine(yzY, yzZ);

    const xStats = safeMeanStd(xs);
    const yStats = safeMeanStd(ys);
    const zStats = safeMeanStd(zs);

    return {
      totalRows: rows.length,
      yearRange: statistics?.yearRange ?? null,
      x: { ...xStats, hist: histogram(xs, 12) },
      y: { ...yStats, hist: histogram(ys, 12) },
      z: { ...zStats, hist: histogram(zs, 12) },
      pairs: {
        xy: {
          n: xyRows.length,
          r: rXY,
          line: lineXY,
          x: xyX,
          y: xyY,
          xRange: { min: safeMeanStd(xyX).min, max: safeMeanStd(xyX).max },
          yRange: { min: safeMeanStd(xyY).min, max: safeMeanStd(xyY).max },
        },
        xz: {
          n: xzRows.length,
          r: rXZ,
          line: lineXZ,
          x: xzX,
          y: xzZ,
          xRange: { min: safeMeanStd(xzX).min, max: safeMeanStd(xzX).max },
          yRange: { min: safeMeanStd(xzZ).min, max: safeMeanStd(xzZ).max },
        },
        yz: {
          n: yzRows.length,
          r: rYZ,
          line: lineYZ,
          x: yzY,
          y: yzZ,
          xRange: { min: safeMeanStd(yzY).min, max: safeMeanStd(yzY).max },
          yRange: { min: safeMeanStd(yzZ).min, max: safeMeanStd(yzZ).max },
        },
      },
      clipping,
    };
  }, [panelData, statistics, histogram, safeMeanStd]);

  const sampleSummary = React.useMemo(() => {
    const rows = panelData ?? [];
    const inferredCountries = new Set(rows.map((r) => r.iso3)).size;
    const countries = statistics?.countryCounts?.size ?? inferredCountries;
    const totalRows = statistics?.totalRows ?? rows.length;
    const years = statistics?.yearRange ?? null;
    return { countries, totalRows, years };
  }, [panelData, statistics]);

  const constructDiagnostics = React.useMemo(() => {
    const constructs = [...CONSTRUCT_VALIDITY_ARTIFACT.constructs];
    const severityRank: Record<'low' | 'moderate' | 'high', number> = {
      low: 1,
      moderate: 2,
      high: 3,
    };

    constructs.sort((left, right) => {
      const severityDelta = severityRank[right.fragility.severity] - severityRank[left.fragility.severity];
      if (severityDelta !== 0) return severityDelta;
      return left.construct.localeCompare(right.construct);
    });

    const worstCountrySlices = constructs.flatMap((construct) =>
      construct.invariance.byCountry.worstSlices.map((slice) => ({
        construct: construct.construct,
        ...slice,
      }))
    )
      .sort((left, right) => left.corr - right.corr)
      .slice(0, 3);

    const worstYearSlices = constructs.flatMap((construct) =>
      construct.invariance.byYear.worstSlices.map((slice) => ({
        construct: construct.construct,
        ...slice,
      }))
    )
      .sort((left, right) => left.corr - right.corr)
      .slice(0, 3);

    const lowVarianceExclusions = constructs.reduce((sum, construct) => {
      return sum + construct.invariance.byCountry.nLowVarianceExcluded + construct.invariance.byYear.nLowVarianceExcluded;
    }, 0);

    return {
      artifact: CONSTRUCT_VALIDITY_ARTIFACT,
      constructs,
      worstCountrySlices,
      worstYearSlices,
      lowVarianceExclusions,
    };
  }, []);

  const renderHistogram = (
    label: string,
    hist: { counts: number[]; min: number; max: number; maxCount: number },
    color: string,
  ) => {
    const w = 360;
    const h = 140;
    const pad = 22;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;
    const bins = hist.counts.length;
    const barW = innerW / bins;
    const maxCount = Math.max(1, hist.maxCount);

    return (
      <div className="corevars-chart" key={label}>
        <div className="corevars-chart-title">{label} distribution</div>
        <svg className="corevars-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label} histogram`}>
          <rect x="0" y="0" width={w} height={h} fill="var(--corevars-plot-bg)" stroke="var(--corevars-plot-axis)" strokeWidth="1" rx="10" />
          <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="var(--corevars-plot-axis)" strokeWidth="1" />
          {hist.counts.map((c, i) => {
            const bh = (c / maxCount) * innerH;
            const x = pad + i * barW + 1;
            const y = h - pad - bh;
            return <rect key={i} x={x} y={y} width={Math.max(1, barW - 2)} height={bh} fill={color} opacity={0.8} />;
          })}
          <text x={pad} y={h - 6} fill="var(--corevars-plot-label)" fontSize="10">
            {fmt(hist.min)}
          </text>
          <text x={w - pad} y={h - 6} textAnchor="end" fill="var(--corevars-plot-label)" fontSize="10">
            {fmt(hist.max)}
          </text>
        </svg>
      </div>
    );
  };

  const renderScatter = (
    label: string,
    xs: number[],
    ys: number[],
    xRange: { min: number; max: number },
    yRange: { min: number; max: number },
    fit: { intercept: number; slope: number },
    color: string,
  ) => {
    const w = 360;
    const h = 220;
    const padL = 34;
    const padR = 18;
    const padT = 24;
    const padB = 26;

    const xMin = xRange.min;
    const xMax = xRange.max;
    const yMin = yRange.min;
    const yMax = yRange.max;

    const innerW = w - padL - padR;
    const innerH = h - padT - padB;

    const xToPx = (x: number) => padL + ((x - xMin) / (xMax - xMin || 1)) * innerW;
    const yToPy = (y: number) => padT + (1 - (y - yMin) / (yMax - yMin || 1)) * innerH;

    const n = Math.min(xs.length, ys.length);
    const maxPoints = 900;
    const step = n > maxPoints ? Math.ceil(n / maxPoints) : 1;

    const x0 = xMin;
    const x1 = xMax;
    const y0 = fit.intercept + fit.slope * x0;
    const y1 = fit.intercept + fit.slope * x1;
    const hasLine = Number.isFinite(y0) && Number.isFinite(y1);

    return (
      <div className="corevars-chart" key={label}>
        <div className="corevars-chart-title">{label}</div>
        <svg className="corevars-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label} scatterplot`}>
          <rect x="0" y="0" width={w} height={h} fill="var(--corevars-plot-bg)" stroke="var(--corevars-plot-axis)" strokeWidth="1" rx="10" />

          <line
            x1={padL}
            y1={h - padB}
            x2={w - padR}
            y2={h - padB}
            stroke="var(--corevars-plot-axis)"
            strokeWidth="1"
          />
          <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="var(--corevars-plot-axis)" strokeWidth="1" />

          {hasLine ? (
            <line
              x1={xToPx(x0)}
              y1={yToPy(y0)}
              x2={xToPx(x1)}
              y2={yToPy(y1)}
              stroke="rgba(244,208,63,0.85)"
              strokeWidth="2"
              opacity={0.9}
            />
          ) : null}

          {Array.from({ length: n }, (_, i) => i)
            .filter((i) => i % step === 0)
            .map((i) => {
              const x = xs[i];
              const y = ys[i];
              if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
              return (
                <circle
                  key={i}
                  cx={xToPx(x)}
                  cy={yToPy(y)}
                  r={1.6}
                  fill={color}
                  opacity={0.35}
                />
              );
            })}

          <text x={padL} y={h - 6} fill="var(--corevars-plot-label)" fontSize="10">
            {fmt(xMin)}
          </text>
          <text x={w - padR} y={h - 6} textAnchor="end" fill="var(--corevars-plot-label)" fontSize="10">
            {fmt(xMax)}
          </text>
          <text x={padL} y={padT - 6} fill="var(--corevars-plot-label)" fontSize="10">
            {fmt(yMax)}
          </text>
          <text x={padL} y={h - padB + 14} fill="var(--corevars-plot-label)" fontSize="10">
            {fmt(yMin)}
          </text>
        </svg>
      </div>
    );
  };

  return (
    <SectionTemplate
      title="Core Variables"
      sectionIndex="Section 2"
      subtitle="Primary structural components"
      description="Canonical definitions for X (X_urbanization), Y (Y_gini), and Z (Z_belief_outcome)"
    >
      <div className="core-variables-content">

        <div className="academic-layout">
          <div className="theory-column">
            <div className="definition-card corevars-card corevars-card--2-1">
              <h3 className="card-title">2.1 Dependent Variable: Z — Belief Emergence</h3>
              <div className="variable-definition-academic">
                <div className="variable-symbol-large">Z</div>
                <div className="variable-details">
                  <p className="variable-definition-text">
                    <strong>Canonical panel variable:</strong> <span className="formula">Z_belief_outcome</span> (country-year belief outcome index).
                  </p>
                  <div className="operationalization">
                    <h4>Measurement (Canonical)</h4>
                    <ul>
                      <li>
                        <strong>Source:</strong> World Values Survey (waves 3–7).
                      </li>
                      <li>
                        <strong>Mapping spec:</strong> <span className="formula">config/wvs_items.yaml</span> (versioned, machine-readable).
                      </li>
                      <li>
                        <strong>Representative items:</strong> A006 (importance of religion), F028 (attendance), F050 (belief in God), F051 (life after
                        death), harmonized across waves where required.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="interpretation-academic">
                <h4>Scaling &amp; Domain</h4>
                <p>
                  The model treats Z as bounded. The canonical pipeline maps <span className="formula">Z_belief_outcome</span> into a fixed training band
                  for numerical stability using fixed empirical bounds.
                </p>
                <div className="formula-container">
                  <BlockMath
                    math={`z = ${STRUCTURAL_MIN} + (${STRUCTURAL_MAX - STRUCTURAL_MIN})\\,\\frac{Z - Z_{\\min}}{Z_{\\max}-Z_{\\min}},\\\\\\quad Z_{\\min}=${Z_NORMALIZATION.min.toFixed(
                      3,
                    )},\\; Z_{\\max}=${Z_NORMALIZATION.max.toFixed(3)}`}
                    renderError={() => <span className="formula">Z_belief_outcome → z ∈ [0.0001, 0.9999]</span>}
                  />
                </div>
                <p>
                  <strong>Scope note:</strong> This section documents measurement and scaling used by the project; it does not establish causal effects.
                </p>
              </div>
            </div>

            <div className="definition-card corevars-card corevars-card--2-3">
              <h3 className="card-title">2.3 Independent Variable: Y — Inequality</h3>
              <div className="variable-definition-academic">
                <div className="variable-symbol-large">Y</div>
                <div className="variable-details">
                  <p className="variable-definition-text">
                    <strong>Canonical panel variable:</strong> <span className="formula">Y_gini</span> (country-year).
                  </p>
                  <p className="variable-definition-text">
                    <strong>Interpretation:</strong> A structural inequality proxy. In the canonical panel, Y is a transformed inequality feature (often
                    closer to a standardized/residualized representation than a raw Gini value).
                  </p>
                  <div className="operationalization">
                    <h4>Scaling to the Model Domain</h4>
                    <div className="formula-container">
                      <BlockMath
                        math={`y = ${STRUCTURAL_MIN} + ${(STRUCTURAL_MAX - STRUCTURAL_MIN).toFixed(
                          4,
                        )}\\,\\mathrm{clip}\\!\\left(\\frac{Y-(${PANEL_Y_MIN})}{${(PANEL_Y_MAX - PANEL_Y_MIN).toFixed(1)}},\\,0,1\\right)`}
                        renderError={() => <span className="formula">y = 0.0001 + 0.9998 · clip((Y−Ymin)/(Ymax−Ymin),0,1)</span>}
                      />
                    </div>
                    <p className="variable-definition-text">
                      Canonical bounds: <span className="formula">Y ∈ [{PANEL_Y_MIN}, {PANEL_Y_MAX}]</span> before clipping; output domain{' '}
                      <span className="formula">y ∈ [{STRUCTURAL_MIN}, {STRUCTURAL_MAX}]</span>.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="detail-card corevars-card corevars-card--2-5">
              <h3 className="card-title">2.5 Data Source &amp; Sample (Loaded Canonical Panel)</h3>

              <p>
                The application loads the canonical country-year CSV at runtime from{' '}
                <span className="formula">/data/panel_canonical_23_countries_v1.csv</span>.
              </p>

              <div className="operationalization">
                <h4>Inclusion / validation rules (as implemented)</h4>
                <ul>
                  <li>
                    <strong>Schema checks:</strong> requires <span className="formula">iso3</span> (3 letters),{' '}
                    <span className="formula">country_name</span>, and a finite <span className="formula">year</span>.
                  </li>
                  <li>
                    <strong>Column mapping:</strong> supports short names (<span className="formula">X,Y,Z</span>) and canonical long names (
                    <span className="formula">X_urbanization</span>, <span className="formula">Y_gini</span>, <span className="formula">Z_belief_outcome</span>).
                  </li>
                  <li>
                    <strong>Critical-field filter:</strong> drops rows where any of <span className="formula">X</span>, <span className="formula">Y</span>,{' '}
                    <span className="formula">Z</span> is non-finite.
                  </li>
                  <li>
                    <strong>Comments:</strong> ignores lines starting with <span className="formula">#</span>.
                  </li>
                </ul>
              </div>

              {error ? <p className="corevars-note corevars-note--error">Data error: {error}</p> : null}
              {loading ? <p className="corevars-note">Loading canonical panel…</p> : null}

              {!loading && !error ? (
                <div className="corevars-stats-grid">
                  <div className="corevars-stat">
                    <div className="corevars-stat-k">Rows used (after filtering)</div>
                    <div className="corevars-stat-v">{sampleSummary.totalRows}</div>
                  </div>
                  <div className="corevars-stat">
                    <div className="corevars-stat-k">Countries (iso3)</div>
                    <div className="corevars-stat-v">{sampleSummary.countries}</div>
                  </div>
                  <div className="corevars-stat">
                    <div className="corevars-stat-k">Year span</div>
                    <div className="corevars-stat-v">
                      {sampleSummary.years ? `${sampleSummary.years[0]}–${sampleSummary.years[1]}` : '—'}
                    </div>
                  </div>
                </div>
              ) : null}

              <p className="corevars-note">
                This is a provenance statement: it documents what the UI loads and how it filters rows; it is not a claim about causal
                identification or out-of-sample generalization.
              </p>
            </div>

            <div className="detail-card corevars-card corevars-card--2-7">
              <h3 className="card-title">2.7 Descriptives vs. Diagnostics (What We Can Claim Here)</h3>

              <p>
                This section intentionally separates <strong>descriptive evidence</strong> (what the panel looks like) from <strong>model diagnostics</strong>{' '}
                (how well a specific, fixed model maps inputs to outputs).
              </p>

              <div className="operationalization">
                <h4>Descriptive (this section)</h4>
                <ul>
                  <li>
                    Summaries and histograms below describe the <em>loaded canonical panel</em> (coverage, ranges, and distributional shape).
                  </li>
                  <li>
                    They do <strong>not</strong> establish causality, nor do they constitute out-of-sample validation.
                  </li>
                </ul>
              </div>

              <div className="operationalization">
                <h4>Diagnostics / validation (elsewhere in the paper)</h4>
                <ul>
                  <li>
                    Model-fit visuals (e.g., observed vs predicted, $R^2$) are meaningful only when predictions are generated from the fixed model
                    function (here: <span className="formula">calculateModel()</span>) using the same canonical inputs.
                  </li>
                  <li>
                    If any out-of-sample or refit claims are desired, they require explicit refitting with a held-out protocol (not assumed by
                    default).
                  </li>
                </ul>
              </div>

              <p className="corevars-note">
                Practical rule: charts are labeled “descriptive” unless they are directly tied to a clearly specified predictive protocol.
              </p>
            </div>

            <div className="detail-card corevars-card corevars-card--2-10">
              <h3 className="card-title">2.10 Replication Steps (End-to-End)</h3>

              <p>
                “Same data → same result” is implemented by a single, explicit, deterministic pathway: canonical panel → loader (schema + filtering)
                → fixed model function → figures.
              </p>

              <div className="operationalization">
                <h4>Workflow (no commands implied)</h4>
                <ul>
                  <li>
                    <strong>Data:</strong> <span className="formula">public/data/panel_canonical_23_countries_v1.csv</span> (canonical 23-country panel).
                  </li>
                  <li>
                    <strong>Loader:</strong> <span className="formula">src/contexts/DataContext.tsx</span> + <span className="formula">src/data/panelDataLoader.ts</span>{' '}
                    (column mapping + finite-value filtering; no stochastic steps).
                  </li>
                  <li>
                    <strong>Model:</strong> <span className="formula">src/utils/calculateModel.ts</span> (fixed prediction pathway; no refit assumed).
                  </li>
                  <li>
                    <strong>Figures:</strong> descriptive summaries are computed in-browser from <span className="formula">panelData</span>; diagnostic
                    visuals use the same fixed model pathway.
                  </li>
                  <li>
                    <strong>Reproducibility:</strong> run <span className="formula">npm run verify:all</span> to reproduce all analysis artifacts and verify metrics.
                  </li>
                </ul>
              </div>

              <p className="corevars-note">
                Cautious wording: these steps reproduce the project’s stated pipeline. They do not, by themselves, constitute out-of-sample evaluation or
                external generalization unless those protocols are explicitly implemented and reported.
              </p>
            </div>

            <div className="detail-card corevars-card corevars-card--2-11">
              <h3 className="card-title">2.11 Standards Note (Transparency &amp; Defensibility)</h3>

              <p>
                The purpose of this section is definitional and documentary: it states exactly what variables are used (X, Y, Z), how they are
                measured/constructed in the canonical panel, and how they are transformed before entering the model. This framing is deliberate
                for scientific defensibility because it prevents accidental overclaims.
              </p>

              <div className="operationalization">
                <h4>What is established here</h4>
                <ul>
                  <li>
                    <strong>Provenance:</strong> the UI loads the canonical country-year CSV and applies explicit schema/mapping/finite-value rules.
                  </li>
                  <li>
                    <strong>Construct validity boundaries:</strong> X and Y are named for their target constructs but treated as model-ready structural
                    proxies; interpretation is defined on the bounded internal domain.
                  </li>
                  <li>
                    <strong>Reproducibility:</strong> the pipeline is deterministic (same CSV + same loader rules + same model function ⇒ same computed
                    summaries/figures).
                  </li>
                  <li>
                    <strong>Descriptive evidence:</strong> distributions, pairwise scatter/OLS overlays, and clipping rates summarize the loaded panel and
                    preprocessing behavior.
                  </li>
                </ul>
              </div>

              <div className="operationalization">
                <h4>What is not claimed here</h4>
                <ul>
                  <li>No causal identification (these are observational aggregates).</li>
                  <li>No out-of-sample validation unless an explicit held-out/refit protocol is implemented and reported.</li>
                  <li>No raw-unit interpretation unless the CSV fields are documented to be raw and unstandardized end-to-end.</li>
                </ul>
              </div>

              <p className="corevars-note">
                In short: this section satisfies transparency standards by making measurement, scaling, and claim boundaries explicit, and by
                ensuring the displayed graphics are mechanically tied to what the application actually loads.
              </p>
            </div>

            <div className="summary-card corevars-card corevars-card--2-12">
              <h3 className="card-title">2.12 Summary (Canonical Names)</h3>
              <div className="summary-table-academic">
                <table>
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Canonical field</th>
                      <th>Type</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <span className="table-symbol">X</span>
                      </td>
                      <td>
                        <span className="formula">X_urbanization</span>
                      </td>
                      <td>Input (country-year)</td>
                      <td>Scaled to x ∈ [0.0001,0.9999] via canonical min–max scaling + saturation (clamp)</td>
                    </tr>
                    <tr>
                      <td>
                        <span className="table-symbol">Y</span>
                      </td>
                      <td>
                        <span className="formula">Y_gini</span>
                      </td>
                      <td>Input (country-year)</td>
                      <td>Scaled to y ∈ [0.0001,0.9999] via canonical min–max scaling + saturation (clamp)</td>
                    </tr>
                    <tr>
                      <td>
                        <span className="table-symbol">Z</span>
                      </td>
                      <td>
                        <span className="formula">Z_belief_outcome</span>
                      </td>
                      <td>Outcome (country-year)</td>
                      <td>WVS-based composite; normalized into z ∈ [0.0001,0.9999] training band</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="models-column">
            <div className="definition-card corevars-card corevars-card--2-2">
              <h3 className="card-title">2.2 Independent Variable: X — Settlement / Urbanization</h3>
              <div className="variable-definition-academic">
                <div className="variable-symbol-large">X</div>
                <div className="variable-details">
                  <p className="variable-definition-text">
                    <strong>Canonical panel variable:</strong> <span className="formula">X_urbanization</span> (country-year).
                  </p>
                  <p className="variable-definition-text">
                    <strong>Interpretation:</strong> A structural proxy for settlement intensity. In the canonical panel, X is a transformed feature used
                    for modeling (not a claim that a raw “% urban” measure is displayed here).
                  </p>
                  <div className="operationalization">
                    <h4>Scaling to the Model Domain</h4>
                    <div className="formula-container">
                      <BlockMath
                        math={`x = ${STRUCTURAL_MIN} + ${(STRUCTURAL_MAX - STRUCTURAL_MIN).toFixed(
                          4,
                        )}\\,\\mathrm{clip}\\!\\left(\\frac{X-${PANEL_X_MIN}}{${(PANEL_X_MAX - PANEL_X_MIN).toFixed(1)}},\\,0,1\\right)`}
                        renderError={() => <span className="formula">x = 0.0001 + 0.9998 · clip((X−Xmin)/(Xmax−Xmin),0,1)</span>}
                      />
                    </div>
                    <p className="variable-definition-text">
                      Canonical bounds: <span className="formula">X ∈ [{PANEL_X_MIN}, {PANEL_X_MAX}]</span> before clipping; output domain{' '}
                      <span className="formula">x ∈ [{STRUCTURAL_MIN}, {STRUCTURAL_MAX}]</span>.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="detail-card corevars-card corevars-card--2-4">
              <h3 className="card-title">2.4 Canonical Preprocessing (Reproducibility)</h3>
              <p>
                The canonical preprocessing defines fixed scaling rules so model inputs and targets remain comparable across countries and years.
                For X and Y, min–max scaling with saturation (clamp) maps into the bounded internal domain. For Z, the belief outcome index is normalized to
                the same training band.
              </p>
              <div className="formula-container">
                <BlockMath math={'x,y,z \\in [0.0001,0.9999]'} renderError={() => <span className="formula">x, y, z ∈ [0.0001, 0.9999]</span>} />
              </div>
              <p className="variable-definition-text">
                <strong>Important:</strong> the canonical preprocessing also z-scores only <span className="formula">C_cultural_intensity</span> using
                dataset statistics; other modifiers are already standardized in the CSV.
              </p>
            </div>

            <div className="detail-card corevars-card corevars-card--2-6">
              <h3 className="card-title">2.6 Construct Validity &amp; Interpretation (What X and Y Mean)</h3>

              <p>
                For clarity, we distinguish between (i) the <em>named constructs</em> (urbanization, inequality) and (ii) the{' '}
                <em>model features</em> actually used in the pipeline (<span className="formula">X_urbanization</span>, <span className="formula">Y_gini</span>).
                The pipeline treats these as <strong>structural proxies</strong>: monotone inputs that summarize broad social structure, not literal
                claims about a single raw statistic.
              </p>

              <div className="operationalization">
                <h4>Key interpretation rules</h4>
                <ul>
                  <li>
                    <strong>Do not read X as a displayed “% urban”.</strong> X is a country-year feature named for the construct it targets. Depending
                    on the data preparation, it may be rescaled/standardized/trimmed for stability.
                  </li>
                  <li>
                    <strong>Do not read Y as a displayed raw Gini.</strong> Y is an inequality feature aligned to the construct “inequality” but used as
                    an input to a bounded model; it may not preserve the original unit scale.
                  </li>
                  <li>
                    <strong>Interpretation happens on the internal domain.</strong> The model’s dynamics are defined over{' '}
                    <span className="formula">x,y \in [0.0001,0.9999]</span>. Changes are meaningful as relative movements within this normalized band.
                  </li>
                  <li>
                    <strong>Monotonic mapping.</strong> The shown min–max + saturation (clamp) transform is monotone in X and Y, so higher X (in the panel) always
                    maps to higher x, and higher Y maps to higher y. This preserves ranking while limiting leverage of extreme values.
                  </li>
                </ul>
              </div>

              <div className="interpretation-academic">
                <h4>Why this matters (validity and defensibility)</h4>
                <p>
                  This separation prevents over-interpretation: the UI documents exactly how the project uses the canonical panel in the model,
                  without claiming that the plotted values are raw, directly comparable units across all countries and years.
                </p>
                <p className="corevars-note">
                  If you want a strict “raw-units” interpretation (e.g., percentage points of urban population or Gini points), we would need an
                  explicit, documented mapping from the CSV fields to the raw sources and units, plus confirmation that no standardization was
                  applied before loading.
                </p>
              </div>

              <div className="corevars-validity-grid">
                <div className="corevars-validity-card">
                  <div className="corevars-validity-header">
                    <h4>2.6a Construct Validity Snapshot</h4>
                    <span className="corevars-validity-meta">
                      {constructDiagnostics.artifact.schemaVersion} | {constructDiagnostics.artifact.generatedAtIso.slice(0, 10)}
                    </span>
                  </div>
                  <div className="summary-table-academic corevars-validity-table">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Construct</th>
                          <th scope="col">Full coverage</th>
                          <th scope="col">Alpha proxy</th>
                          <th scope="col">Alt-mean corr</th>
                          <th scope="col">Fragility</th>
                        </tr>
                      </thead>
                      <tbody>
                        {constructDiagnostics.constructs.map((construct) => (
                          <tr key={`construct-validity-${construct.construct}`}>
                            <th scope="row">{construct.construct}</th>
                            <td>{fmtPctNullable(construct.coverage.fullCoverageRate, 1)}</td>
                            <td>{fmtNullable(construct.internalConsistencyProxy.cronbachAlpha, 3)}</td>
                            <td>{fmtNullable(construct.alternativeAggregation.canonicalVsAltMean.corr, 3)}</td>
                            <td>
                              <span className={`corevars-severity-chip corevars-severity-chip--${construct.fragility.severity}`}>
                                {construct.fragility.severity.toUpperCase()}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="corevars-note">
                    Single-indicator constructs naturally report no Cronbach alpha; interpretation is then tied to slice stability and overlap diagnostics.
                  </p>
                </div>

                <div className="corevars-validity-card">
                  <div className="corevars-validity-header">
                    <h4>2.6b Measurement Invariance &amp; Fragility Regions</h4>
                    <span className="corevars-validity-meta">
                      minRowsPerSlice={constructDiagnostics.artifact.thresholds.minRowsPerSlice}, lowCorr&lt;{constructDiagnostics.artifact.thresholds.lowCorrThreshold}
                    </span>
                  </div>

                  <div className="corevars-stats-grid corevars-stats-grid--compact">
                    <div className="corevars-stat">
                      <div className="corevars-stat-k">Flagged constructs</div>
                      <div className="corevars-stat-v">
                        {constructDiagnostics.artifact.instabilityRegions.flaggedConstructs.length > 0
                          ? constructDiagnostics.artifact.instabilityRegions.flaggedConstructs.join(', ')
                          : 'None'}
                      </div>
                    </div>
                    <div className="corevars-stat">
                      <div className="corevars-stat-k">Low-variance slices excluded</div>
                      <div className="corevars-stat-v">{constructDiagnostics.lowVarianceExclusions}</div>
                    </div>
                    <div className="corevars-stat">
                      <div className="corevars-stat-k">Country-year scope</div>
                      <div className="corevars-stat-v">
                        {constructDiagnostics.artifact.source.nCountries} countries, {constructDiagnostics.artifact.source.nRows} rows
                      </div>
                    </div>
                  </div>

                  <div className="corevars-validity-two-col">
                    <div>
                      <h5>Worst country slices (corr)</h5>
                      <ul className="corevars-flag-list">
                        {constructDiagnostics.worstCountrySlices.length === 0 && <li>No eligible country slices.</li>}
                        {constructDiagnostics.worstCountrySlices.map((slice) => (
                          <li key={`country-slice-${slice.construct}-${slice.sliceId}`}>
                            {slice.construct}:{slice.sliceId} corr={fmt(slice.corr, 3)}, n={slice.n}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h5>Worst year slices (corr)</h5>
                      <ul className="corevars-flag-list">
                        {constructDiagnostics.worstYearSlices.length === 0 && <li>No eligible year slices.</li>}
                        {constructDiagnostics.worstYearSlices.map((slice) => (
                          <li key={`year-slice-${slice.construct}-${slice.sliceId}`}>
                            {slice.construct}:{slice.sliceId} corr={fmt(slice.corr, 3)}, n={slice.n}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <p className="corevars-note">
                    Limitation anchor: diagnostics are aggregate-level proxies; invariance interpretation remains support-conditioned by reported n thresholds.
                  </p>
                </div>
              </div>
            </div>

            <div className="detail-card corevars-card corevars-card--2-8">
              <h3 className="card-title">2.8 Numerical Stability Notes (Saturation &amp; Normalization)</h3>

              <p>
                The model operates on a bounded internal domain. This design is deliberate: it improves numerical stability and limits the
                influence of extreme observations. However, it also changes how coefficients and visual scales should be interpreted.
              </p>

              <div className="operationalization">
                <h4>What saturation (clamp) buys us</h4>
                <ul>
                  <li>
                    <strong>Bounded leverage:</strong> the transform clamps extreme X/Y values so they cannot dominate the dynamics through arbitrarily
                    large magnitudes.
                  </li>
                  <li>
                    <strong>Rank preservation (within range):</strong> the mapping is monotone; higher X (or Y) in the panel maps to higher x (or y).
                  </li>
                  <li>
                    <strong>Transparent failure mode:</strong> if many observations are clipped, that is visible as mass near the boundary
                    (approximately 0.0001 or 0.9999), prompting a data-spec review.
                  </li>
                </ul>
              </div>

              {!loading && !error && descriptives.clipping.n > 0 ? (
                <div className="corevars-stats-grid corevars-stats-grid--compact">
                  <div className="corevars-stat">
                    <div className="corevars-stat-k">Rows (X,Y finite)</div>
                    <div className="corevars-stat-v">{descriptives.clipping.n}</div>
                  </div>
                  <div className="corevars-stat">
                    <div className="corevars-stat-k">X saturated (≤min or ≥max)</div>
                    <div className="corevars-stat-v">
                      {descriptives.clipping.xAny} ({fmt((descriptives.clipping.xAny / descriptives.clipping.n) * 100, 1)}%)
                    </div>
                  </div>
                  <div className="corevars-stat">
                    <div className="corevars-stat-k">Y saturated (≤min or ≥max)</div>
                    <div className="corevars-stat-v">
                      {descriptives.clipping.yAny} ({fmt((descriptives.clipping.yAny / descriptives.clipping.n) * 100, 1)}%)
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="formula-container">
                <BlockMath
                  math={`x = ${STRUCTURAL_MIN} + ${STRUCTURAL_SPAN.toFixed(4)}\\,\\mathrm{clip}\\!\\left(\\frac{X-X_{\\min}}{X_{\\max}-X_{\\min}},0,1\\right),\\quad y = ${STRUCTURAL_MIN} + ${STRUCTURAL_SPAN.toFixed(4)}\\,\\mathrm{clip}\\!\\left(\\frac{Y-Y_{\\min}}{Y_{\\max}-Y_{\\min}},0,1\\right)`}
                  renderError={() => <span className="formula">x,y computed via min–max scaling + saturation (clamp) into [0.0001,0.9999]</span>}
                />
              </div>

              <div className="operationalization">
                <h4>Normalization of Z and interpretability</h4>
                <ul>
                  <li>
                    <strong>Scale dependence:</strong> Z is linearly normalized using fixed bounds (
                    <span className="formula">Z_min</span>, <span className="formula">Z_max</span>). This makes the model’s
                    internal target comparable across runs, but it means effect sizes should be interpreted in normalized units unless the inverse
                    map is applied.
                  </li>
                  <li>
                    <strong>Boundary effects:</strong> observations near the extremes map close to 0.0001/0.9999, where small raw changes may compress.
                    Interpret changes as relative movements within the bounded band.
                  </li>
                </ul>
              </div>

              <p className="corevars-note">
                Cautious wording: this transformation is a numerical stability device (clamps + bounded influence), not a substitute for refitting-based
                sensitivity analysis. Where needed, formal robustness checks should complement this with explicit alternative bounds/standardizations reported as
                a specification check.
              </p>
            </div>

            <div className="detail-card corevars-card corevars-card--2-9">
              <h3 className="card-title">2.9 Empirical Descriptives (Loaded Canonical Panel)</h3>

              {error ? <p className="corevars-note corevars-note--error">Data error: {error}</p> : null}
              {loading ? <p className="corevars-note">Loading canonical panel…</p> : null}

              {!loading && !error ? (
                <>
                  <div className="corevars-stats-grid">
                    <div className="corevars-stat">
                      <div className="corevars-stat-k">Rows</div>
                      <div className="corevars-stat-v">{descriptives.totalRows}</div>
                    </div>
                    <div className="corevars-stat">
                      <div className="corevars-stat-k">Years</div>
                      <div className="corevars-stat-v">
                        {descriptives.yearRange ? `${descriptives.yearRange[0]}–${descriptives.yearRange[1]}` : '—'}
                      </div>
                    </div>
                    <div className="corevars-stat">
                      <div className="corevars-stat-k">Z range</div>
                      <div className="corevars-stat-v">
                        {fmt(descriptives.z.min)}…{fmt(descriptives.z.max)}
                      </div>
                    </div>
                    <div className="corevars-stat">
                      <div className="corevars-stat-k">Z mean ± sd</div>
                      <div className="corevars-stat-v">
                        {fmt(descriptives.z.mean)} ± {fmt(descriptives.z.std)}
                      </div>
                    </div>
                    <div className="corevars-stat">
                      <div className="corevars-stat-k">X range</div>
                      <div className="corevars-stat-v">
                        {fmt(descriptives.x.min)}…{fmt(descriptives.x.max)}
                      </div>
                    </div>
                    <div className="corevars-stat">
                      <div className="corevars-stat-k">X mean ± sd</div>
                      <div className="corevars-stat-v">
                        {fmt(descriptives.x.mean)} ± {fmt(descriptives.x.std)}
                      </div>
                    </div>
                    <div className="corevars-stat">
                      <div className="corevars-stat-k">Y range</div>
                      <div className="corevars-stat-v">
                        {fmt(descriptives.y.min)}…{fmt(descriptives.y.max)}
                      </div>
                    </div>
                    <div className="corevars-stat">
                      <div className="corevars-stat-k">Y mean ± sd</div>
                      <div className="corevars-stat-v">
                        {fmt(descriptives.y.mean)} ± {fmt(descriptives.y.std)}
                      </div>
                    </div>
                  </div>

                  <div className="corevars-charts">
                    {renderHistogram('Z (belief outcome)', descriptives.z.hist, 'rgba(244,208,63,0.9)')}
                    {renderHistogram('X (urbanization proxy)', descriptives.x.hist, 'rgba(244,208,63,0.75)')}
                    {renderHistogram('Y (inequality proxy)', descriptives.y.hist, 'rgba(244,208,63,0.6)')}
                  </div>

                  <div className="operationalization">
                    <h4>Pairwise relationships (descriptive)</h4>
                    <p className="variable-definition-text">
                      The following plots summarize associations in the loaded canonical panel. They are descriptive (no causal interpretation and no
                      out-of-sample claims).
                    </p>
                  </div>

                  <div className="corevars-pairs-grid">
                    {renderScatter(
                      'Z vs X (with OLS line)',
                      descriptives.pairs.xz.x,
                      descriptives.pairs.xz.y,
                      descriptives.pairs.xz.xRange,
                      descriptives.pairs.xz.yRange,
                      descriptives.pairs.xz.line,
                      'rgba(244,208,63,0.9)',
                    )}
                    {renderScatter(
                      'Z vs Y (with OLS line)',
                      descriptives.pairs.yz.x,
                      descriptives.pairs.yz.y,
                      descriptives.pairs.yz.xRange,
                      descriptives.pairs.yz.yRange,
                      descriptives.pairs.yz.line,
                      'rgba(244,208,63,0.75)',
                    )}
                    {renderScatter(
                      'Y vs X (with OLS line)',
                      descriptives.pairs.xy.x,
                      descriptives.pairs.xy.y,
                      descriptives.pairs.xy.xRange,
                      descriptives.pairs.xy.yRange,
                      descriptives.pairs.xy.line,
                      'rgba(244,208,63,0.6)',
                    )}
                  </div>

                  <div className="corevars-stats-grid">
                    <div className="corevars-stat">
                      <div className="corevars-stat-k">N (Z vs X)</div>
                      <div className="corevars-stat-v">{descriptives.pairs.xz.n}</div>
                    </div>
                    <div className="corevars-stat">
                      <div className="corevars-stat-k">corr(X,Z)</div>
                      <div className="corevars-stat-v">{fmt(descriptives.pairs.xz.r.r, 3)}</div>
                    </div>
                    <div className="corevars-stat">
                      <div className="corevars-stat-k">N (Z vs Y)</div>
                      <div className="corevars-stat-v">{descriptives.pairs.yz.n}</div>
                    </div>
                    <div className="corevars-stat">
                      <div className="corevars-stat-k">corr(Y,Z)</div>
                      <div className="corevars-stat-v">{fmt(descriptives.pairs.yz.r.r, 3)}</div>
                    </div>
                    <div className="corevars-stat">
                      <div className="corevars-stat-k">N (Y vs X)</div>
                      <div className="corevars-stat-v">{descriptives.pairs.xy.n}</div>
                    </div>
                    <div className="corevars-stat">
                      <div className="corevars-stat-k">corr(X,Y)</div>
                      <div className="corevars-stat-v">{fmt(descriptives.pairs.xy.r.r, 3)}</div>
                    </div>
                  </div>

                  <p className="corevars-note">
                    These plots are descriptive summaries computed in-browser from the loaded canonical CSV (no refitting and no external data
                    calls).
                  </p>
                </>
              ) : null}
            </div>

          </div>
        </div>

        <div className="section-end-indicator">
          <div className="end-line"></div>
          <div className="end-badge">
            <span className="end-text">End of Section 2</span>
            <div className="end-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
          <div className="end-line"></div>
        </div>
      </div>
    </SectionTemplate>
  );
};

export default CoreVariablesSection;
