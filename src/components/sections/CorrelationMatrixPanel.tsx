import React, { useMemo, useState } from 'react';
import type { PanelRowCanonical as PanelRow } from '../../types/panel';

type CorrMode = 'raw' | 'within';

type VarKey = keyof Pick<PanelRow, 'X' | 'Y' | 'Z' | 'C' | 'M' | 'T' | 'D' | 'G' | 'E' | 'S' | 'R'>;

type VarDef = {
  key: VarKey;
  symbol: string;
  label: string;
};

const ALL_VARS: VarDef[] = [
  { key: 'X', symbol: 'X', label: 'Urbanization' },
  { key: 'Y', symbol: 'Y', label: 'Inequality (Gini)' },
  { key: 'Z', symbol: 'Z', label: 'Belief outcome' },
  { key: 'C', symbol: 'C', label: 'Cultural intensity' },
  { key: 'M', symbol: 'M', label: 'Media environment' },
  { key: 'T', symbol: 'T', label: 'Trauma shock' },
  { key: 'D', symbol: 'D', label: 'Social atomization' },
  { key: 'G', symbol: 'G', label: 'Redistribution capacity' },
  { key: 'E', symbol: 'E', label: 'Education capacity' },
  { key: 'S', symbol: 'S', label: 'Social support' },
  { key: 'R', symbol: 'R', label: 'Welfare capacity' },
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const fmtCorr = (r: number) => (Number.isFinite(r) ? r.toFixed(2) : '—');

type Rgb = { r: number; g: number; b: number };
type CorrelationCell = { value: number; n: number };

const hexToRgb = (hex: string): Rgb => {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : h;
  const n = Number.parseInt(full, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => ({
  r: Math.round(lerp(a.r, b.r, t)),
  g: Math.round(lerp(a.g, b.g, t)),
  b: Math.round(lerp(a.b, b.b, t)),
});

const rgbToCss = (c: Rgb) => `rgb(${c.r}, ${c.g}, ${c.b})`;

const luminance = (c: Rgb) => {
  // WCAG-ish relative luminance (rough, good enough for choosing text color)
  const srgb = [c.r, c.g, c.b].map((v) => v / 255);
  const lin = srgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};

// Modern diverging palette (tailwind-ish): blue-600 → slate-700 → red-500.
const NEG = hexToRgb('#2563eb');
const MID = hexToRgb('#334155');
const POS = hexToRgb('#ef4444');

const correlationFill = (r: number): { fill: string; text: string; textFill: string } => {
  if (!Number.isFinite(r)) {
    return { fill: 'rgba(148, 163, 184, 0.14)', text: '—', textFill: 'rgba(203, 213, 225, 0.9)' };
  }

  const abs = Math.abs(r);
  const strength = clamp01((abs - 0.05) / 0.95); // de-emphasize tiny correlations

  // Build base color by sign.
  const base = r < 0 ? mixRgb(MID, NEG, strength) : mixRgb(MID, POS, strength);

  // Slightly lift very strong cells to keep them readable on dark UI.
  const lifted = mixRgb(base, { r: 255, g: 255, b: 255 }, 0.06 + 0.08 * strength);
  const fill = rgbToCss(lifted);

  // Choose text color for value overlay.
  const L = luminance(lifted);
  const textFill = L < 0.28 ? 'rgba(241, 245, 249, 0.92)' : 'rgba(15, 23, 42, 0.92)';

  return {
    fill,
    text: fmtCorr(r),
    textFill,
  };
};

const buildWithinMeans = (rows: PanelRow[], vars: VarDef[]) => {
  const sums = new Map<string, { sum: number[]; count: number[] }>();

  for (const row of rows) {
    const iso3 = row.iso3;
    const cur = sums.get(iso3);
    if (!cur) {
      const init = {
        sum: new Array(vars.length).fill(0),
        count: new Array(vars.length).fill(0),
      };
      sums.set(iso3, init);
    }
    const bucket = sums.get(iso3)!;
    for (let i = 0; i < vars.length; i += 1) {
      const v = row[vars[i].key];
      if (v === null || !Number.isFinite(v)) continue;
      bucket.sum[i] += v;
      bucket.count[i] += 1;
    }
  }

  const means = new Map<string, number[]>();
  for (const [iso3, acc] of sums.entries()) {
    const mu = new Array(vars.length).fill(0);
    for (let i = 0; i < vars.length; i += 1) {
      mu[i] = acc.count[i] > 0 ? acc.sum[i] / acc.count[i] : 0;
    }
    means.set(iso3, mu);
  }

  return means;
};

const computeCorr = (
  rows: PanelRow[],
  a: VarKey,
  b: VarKey,
  withinMeans: Map<string, number[]> | null,
  idxA: number,
  idxB: number,
): CorrelationCell => {
  const n = rows.length;
  if (n < 2) return { value: NaN, n: 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;
  let used = 0;

  for (const row of rows) {
    let x = row[a];
    let y = row[b];
    if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) continue;

    if (withinMeans) {
      const mu = withinMeans.get(row.iso3);
      if (!mu) continue;
      x -= mu[idxA] ?? 0;
      y -= mu[idxB] ?? 0;
    }

    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumYY += y * y;
    sumXY += x * y;
    used += 1;
  }

  if (used < 2) return { value: NaN, n: used };

  const cov = sumXY - (sumX * sumY) / used;
  const varX = sumXX - (sumX * sumX) / used;
  const varY = sumYY - (sumY * sumY) / used;

  if (varX <= 0 || varY <= 0) return { value: NaN, n: used };

  return { value: cov / Math.sqrt(varX * varY), n: used };
};

export interface CorrelationMatrixPanelProps {
  panelData: PanelRow[] | null;
  loading?: boolean;
  error?: string | null;
}

const CorrelationMatrixPanel: React.FC<CorrelationMatrixPanelProps> = ({ panelData, loading, error }) => {
  const [mode, setMode] = useState<CorrMode>('raw');
  const [showValues, setShowValues] = useState<boolean>(false);
  const [includeOutcome, setIncludeOutcome] = useState<boolean>(true);

  const vars = useMemo(() => {
    if (includeOutcome) return ALL_VARS;
    return ALL_VARS.filter((v) => v.key !== 'Z');
  }, [includeOutcome]);

  const computed = useMemo(() => {
    if (!panelData || panelData.length === 0) {
      return {
        nTotal: 0,
        matrix: [] as CorrelationCell[][],
      };
    }

    // Use pairwise complete observations. Several constructs are intentionally null in
    // the canonical panel; a missing value in one variable must not discard every row.
    const rows = panelData;
    const withinMeans = mode === 'within' ? buildWithinMeans(rows, vars) : null;

    const size = vars.length;
    const matrix: CorrelationCell[][] = new Array(size);
    for (let i = 0; i < size; i += 1) {
      matrix[i] = new Array(size).fill(null).map(() => ({ value: NaN, n: 0 }));
    }

    for (let i = 0; i < size; i += 1) {
      for (let j = 0; j < size; j += 1) {
        if (i === j) {
          matrix[i][j] = {
            value: 1,
            n: rows.filter((row) => Number.isFinite(row[vars[i].key])).length,
          };
          continue;
        }
        matrix[i][j] = computeCorr(rows, vars[i].key, vars[j].key, withinMeans, i, j);
      }
    }

    return {
      nTotal: panelData.length,
      matrix,
    };
  }, [panelData, vars, mode]);

  const size = vars.length;

  const renderHeatmap = () => {
    if (computed.matrix.length === 0) return null;

    // Compact sizing: this lives in the left documentation column, so keep it readable but not huge.
    const cell = 22;
    const gap = 2;
    const pad = 78;
    const topPad = 54;
    const w = pad + cell * size + 16;
    const h = topPad + cell * size + 20;

    return (
      <div className="ma-corr-scroll">
        <svg
          className="ma-corr-svg"
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          aria-label="Correlation matrix heatmap"
        >
          <g className="ma-svg-font">
            <rect
              x={pad - 8}
              y={topPad - 10}
              width={cell * size + 16}
              height={cell * size + 16}
              rx={12}
              fill="rgba(2, 6, 23, 0.25)"
              stroke="rgba(148, 163, 184, 0.18)"
            />

            {/* Column labels */}
            {vars.map((v, j) => (
              <g key={`col-${v.key}`} transform={`translate(${pad + j * cell + cell / 2} ${topPad - 16})`}>
                <text className="ma-corr-axis" textAnchor="middle">
                  {v.symbol}
                </text>
                <title>{`${v.symbol}: ${v.label}`}</title>
              </g>
            ))}

            {/* Row labels */}
            {vars.map((v, i) => (
              <g key={`row-${v.key}`} transform={`translate(${pad - 12} ${topPad + i * cell + cell / 2 + 4})`}>
                <text className="ma-corr-axis" textAnchor="end">
                  {v.symbol}
                </text>
                <title>{`${v.symbol}: ${v.label}`}</title>
              </g>
            ))}

            {/* Cells */}
            {vars.map((rowVar, i) =>
              vars.map((colVar, j) => {
                const cellValue = computed.matrix[i]?.[j] ?? { value: NaN, n: 0 };
                const x = pad + j * cell;
                const y = topPad + i * cell;
                const { fill, text, textFill } = correlationFill(cellValue.value);
                const label = text;
                const isDiag = i === j;

                return (
                  <g key={`cell-${rowVar.key}-${colVar.key}`}>
                    <rect
                      x={x + gap}
                      y={y + gap}
                      width={cell - 2 * gap}
                      height={cell - 2 * gap}
                      rx={6}
                      fill={fill}
                      opacity={isDiag ? 0.98 : 0.92}
                      stroke={isDiag ? 'rgba(241, 245, 249, 0.20)' : 'rgba(241, 245, 249, 0.08)'}
                      strokeWidth={1}
                    >
                      <title>
                        {`${rowVar.symbol} (${rowVar.label}) vs ${colVar.symbol} (${colVar.label})\n`}
                        {`r=${label} • ${mode === 'within' ? 'within-country (demeaned)' : 'raw'} • n=${cellValue.n}`}
                      </title>
                    </rect>
                    {showValues && (
                      <text
                        x={x + cell / 2}
                        y={y + cell / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="ma-corr-cell-text"
                        fill={textFill}
                      >
                        {label}
                      </text>
                    )}
                  </g>
                );
              }),
            )}

            {/* Legend */}
            <g transform={`translate(${pad} ${topPad + cell * size + 12})`}>
              <defs>
                <linearGradient id="maCorrLegend" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor={correlationFill(-1).fill} />
                  <stop offset="50%" stopColor={correlationFill(0).fill} />
                  <stop offset="100%" stopColor={correlationFill(1).fill} />
                </linearGradient>
              </defs>
              <rect x={0} y={0} width={cell * size} height={10} rx={6} fill="url(#maCorrLegend)" opacity={0.9} />
              <text x={0} y={26} className="ma-corr-legend" textAnchor="start">
                −1
              </text>
              <text x={(cell * size) / 2} y={26} className="ma-corr-legend" textAnchor="middle">
                0
              </text>
              <text x={cell * size} y={26} className="ma-corr-legend" textAnchor="end">
                +1
              </text>
              <text x={cell * size} y={26} className="ma-corr-legend" textAnchor="start" dx={12}>
                <tspan className="ma-corr-legend">Pearson r</tspan>
              </text>
            </g>
          </g>
        </svg>
      </div>
    );
  };

  return (
    <div className="ma-corr-panel">
      <div className="ma-corr-header">
        <div>
          <div className="ma-corr-title">Correlation matrix</div>
          <div className="ma-corr-subtitle">
            Pearson correlations for the canonical model block (toggle raw vs within-country demeaning).
          </div>
        </div>
      </div>

      <div className="ma-corr-controls" role="group" aria-label="Correlation matrix controls">
        <div className="ma-corr-control">
          <span className="ma-corr-control-label">Mode</span>
          <label className="ma-corr-radio">
            <input
              type="radio"
              name="ma-corr-mode"
              value="raw"
              checked={mode === 'raw'}
              onChange={() => setMode('raw')}
            />
            Raw
          </label>
          <label className="ma-corr-radio">
            <input
              type="radio"
              name="ma-corr-mode"
              value="within"
              checked={mode === 'within'}
              onChange={() => setMode('within')}
            />
            Within-country
          </label>
        </div>

        <label className="ma-corr-checkbox">
          <input
            type="checkbox"
            checked={includeOutcome}
            onChange={(e) => setIncludeOutcome(e.target.checked)}
          />
          Include outcome Z
        </label>

        <label className="ma-corr-checkbox">
          <input
            type="checkbox"
            checked={showValues}
            onChange={(e) => setShowValues(e.target.checked)}
          />
          Show values
        </label>
      </div>

      <p className="ma-small-muted ma-mt-05">
        Panel rows: {computed.nTotal}{loading ? ' (loading…)': ''}
        {error ? ` — ${error}` : ''}
      </p>

      {renderHeatmap()}

      <div className="ma-corr-var-legend" aria-label="Variable legend">
        {vars.map((v) => (
          <div key={v.key} className="ma-corr-var-item" title={v.label}>
            <span className="ma-corr-var-symbol">{v.symbol}</span>
            <span className="ma-corr-var-label">{v.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CorrelationMatrixPanel;
