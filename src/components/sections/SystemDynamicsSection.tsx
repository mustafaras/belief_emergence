/**
 * What changed (Section 6):
 * - Replaced illustrative/extra plots with computed regime heatmaps + empirical evaluation visuals.
 * - Added phase-portrait style panel (Z(Φ) and dZ/dΦ) and calibration + residual diagnostics.
 * - Kept model logic untouched (calculateModel remains the single source of truth).
 */

import React, { useCallback, useMemo, useState } from 'react';
import 'katex/dist/katex.min.css';
import { BlockMath, InlineMath } from 'react-katex';
import SectionTemplate from './SectionTemplate.tsx';
import {
  INTERACTION_TERMS,
    MODIFIER_STANDARDIZATION,
  OPTIMIZED_SIGMOID_COEFFICIENTS,
  OPTIMIZED_STRUCTURAL_PARAMS,
  QUADRATIC_TERMS,
} from '../../data/feCoefficients';
import { getProductionDatasetMetadata, getProductionHeadlineMetrics } from '../../data/modelMetrics';
import { useDataContext } from '../../contexts/DataContext';
import { calculateModel, computeStructuralBase } from '../../utils/calculateModel';
import { STRUCTURAL_MAX, STRUCTURAL_MIN } from '../../utils/modelContract';
import { predictFromPanelRow, standardizeCulturalIntensity } from '../../utils/validation/panelPredict';
import { BIAS_DEFINITION_PHRASE, computeBias } from '../../utils/metrics';

// Canonical numeric-safety interior band used throughout the UI.
// Values are sourced from the global contract (ε=1e-4).
const Z_BAND_MIN = STRUCTURAL_MIN;
const Z_BAND_MAX = STRUCTURAL_MAX;
const Z_BAND_SPAN = Math.max(1e-12, Z_BAND_MAX - Z_BAND_MIN);

// Back-compat aliases used throughout this section's existing charts.
// NOTE: Values are sourced from the canonical contract.
const TRAIN_MIN = Z_BAND_MIN;
const TRAIN_MAX = Z_BAND_MAX;
const TRAIN_SPAN = Z_BAND_SPAN;

const SystemDynamicsSection: React.FC = () => {
  const fmt = (value: number, digits = 3) => (Number.isFinite(value) ? value.toFixed(digits) : '—');
  const clamp = useCallback((value: number, min: number, max: number) => Math.min(Math.max(value, min), max), []);
  const lerp = useCallback((a: number, b: number, t: number) => a + (b - a) * t, []);

  // Map a banded Z value in [TRAIN_MIN, TRAIN_MAX] to a normalized axis coordinate in [0,1].
  // This keeps every chart consistent with the canonical ε=1e-4 contract.
  const axisT = useCallback((z: number) => clamp((z - Z_BAND_MIN) / Z_BAND_SPAN, 0, 1), [clamp]);
  const fmtBandTick = useCallback((z: number, midDigits = 2) => {
    if (!Number.isFinite(z)) return '—';
    if (Math.abs(z - Z_BAND_MIN) < 1e-12 || Math.abs(z - Z_BAND_MAX) < 1e-12) return z.toFixed(4);
    return z.toFixed(midDigits);
  }, []);

  const pickIndex = useCallback((n: number, p: number) => {
    if (n <= 1) return 0;
    return Math.max(0, Math.min(n - 1, Math.round(clamp(p, 0, 1) * (n - 1))));
  }, [clamp]);

  const quantile = useCallback((values: number[], p: number) => {
    const clean = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!clean.length) return NaN;
    const pp = clamp(p, 0, 1);
    const idx = pp * (clean.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return clean[lo];
    return lerp(clean[lo], clean[hi], idx - lo);
  }, [clamp, lerp]);

  // Production headline metrics (canonical panel-fit; see scripts/generate_headline_metrics.ts via npm run generate:headline-metrics)
  const headline = getProductionHeadlineMetrics();
  const PRODUCTION = {
    r2: headline.r2,
    r: headline.correlation,
    mae: headline.mae,
    rmse: headline.rmse,
    bias: headline.bias,
  } as const;

  const { panelData, loading, error } = useDataContext();

  // =========================
  // Empirical validation (reuse the same pipeline used in Sections 1–3)
  // =========================
  const validation = useMemo(() => {
    if (!panelData || panelData.length === 0) {
      return {
        points: [] as Array<{ pred: number; obs: number; resid: number; iso3: string; country: string; year: number }>,
        bins: [] as Array<{ predMean: number; obsMean: number; obsQ25: number; obsQ75: number; n: number }>,
        n: 0,
        totalRows: 0,
        droppedRows: 0,
        residMean: NaN,
        residStd: NaN,
      };
    }

    const totalRows = panelData.length;

    const points: Array<{ pred: number; obs: number; resid: number; iso3: string; country: string; year: number }> = [];
    let n = 0;

    for (const row of panelData) {
      // Use canonical panel prediction pipeline
      const result = predictFromPanelRow(row);
      const zhat = result.zPred;
      const zobs = result.zObs;

      if (!Number.isFinite(zhat) || !Number.isFinite(zobs)) continue;
      const resid = zobs - zhat;
      points.push({ pred: zhat, obs: zobs, resid, iso3: row.iso3, country: row.country_name, year: row.year });
      n += 1;
    }

    // Calibration bins (deciles)
    const sorted = points.slice().sort((a, b) => a.pred - b.pred);
    const bins: Array<{ predMean: number; obsMean: number; obsQ25: number; obsQ75: number; n: number }> = [];
    const binsCount = 10;
    for (let i = 0; i < binsCount; i++) {
      const start = Math.floor((i * sorted.length) / binsCount);
      const end = Math.floor(((i + 1) * sorted.length) / binsCount);
      const slice = sorted.slice(start, end);
      if (!slice.length) continue;
      const predMean = slice.reduce((a, p) => a + p.pred, 0) / slice.length;
      const obsMean = slice.reduce((a, p) => a + p.obs, 0) / slice.length;
      const obsVals = slice.map((p) => p.obs);
      const obsQ25 = quantile(obsVals, 0.25);
      const obsQ75 = quantile(obsVals, 0.75);
      bins.push({ predMean, obsMean, obsQ25, obsQ75, n: slice.length });
    }

    const residVals = points.map((p) => p.resid).filter(Number.isFinite);
    const residMean = residVals.length ? residVals.reduce((a, v) => a + v, 0) / residVals.length : NaN;
    const residStd =
      residVals.length > 1
        ? Math.sqrt(residVals.reduce((a, v) => a + (v - residMean) * (v - residMean), 0) / (residVals.length - 1))
        : NaN;

    const droppedRows = Math.max(0, totalRows - n);
    return { points, bins, n, totalRows, droppedRows, residMean, residStd };
  }, [panelData, quantile]);

  const scenarioBaselineInputs = useMemo(() => {
    return {
      X: 0.65,
      Y: 1.0,
      C: 2.613602, // Raw C mean (will be standardized in calcZ)
      M: 0,
      T: 0,
      D: 0,
      G: 0,
      E: 0,
      S: 0,
      R: 0,
    };
  }, []);

  const calcZ = useCallback((p: {
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
  }) => {
    const computed = calculateModel(
      {
        X: p.X,
        Y: p.Y,
        alpha: OPTIMIZED_STRUCTURAL_PARAMS.alpha,
        beta: OPTIMIZED_STRUCTURAL_PARAMS.beta,
        k: OPTIMIZED_STRUCTURAL_PARAMS.k,
        C: standardizeCulturalIntensity(p.C),
        M: p.M,
        T: p.T,
        D: p.D,
        G: p.G,
        E: p.E,
        S: p.S,
        R: p.R,
      },
      {
        // X/Y here are in panel-like units (same as presets), so we want calculateModel
        // to apply the structural mapping into [0.0001, 0.9999].
        inputsAreStandardized: false,
        modifiersAreStandardized: true,
      },
    );
    return computed.Z;
  }, []);

  const baseB = useMemo(() => {
    return computeStructuralBase(
      scenarioBaselineInputs.X,
      scenarioBaselineInputs.Y,
      OPTIMIZED_STRUCTURAL_PARAMS.alpha,
      OPTIMIZED_STRUCTURAL_PARAMS.beta,
    );
  }, [scenarioBaselineInputs.X, scenarioBaselineInputs.Y]);

  // =========================
  // Sensitivity curve Z(Φ) for fixed structural base
  // =========================
  const phiSweep = useMemo(() => {
    const xs: number[] = [];
    const zs: number[] = [];
    const dzdphi: number[] = [];
    const start = -6;
    const end = 6;
    const n = 241;

    const clampPhiForExp = (phi: number) => Math.max(-50, Math.min(50, phi));
    const zFromPhi = (phi: number, base: number, k: number) => {
      const expTerm = Math.exp(clampPhiForExp(phi));
      const numerator = base * expTerm;
      const denom = numerator + k;
      if (denom === 0) return Z_BAND_MIN;
      const z = numerator / denom;
      // Keep visualizations in the canonical open interval: avoid exact endpoints.
      return Math.max(Z_BAND_MIN, Math.min(Z_BAND_MAX, z));
    };

    for (let i = 0; i < n; i++) {
      const phi = start + (i * (end - start)) / (n - 1);
      const z = zFromPhi(phi, baseB, OPTIMIZED_STRUCTURAL_PARAMS.k);
      xs.push(phi);
      zs.push(z);
      dzdphi.push(z * (1 - z));
    }

    return { xs, zs, dzdphi };
  }, [baseB]);

  // =========================
  // Main function surface: Z(Φ, ln(B/k)) where ln(B/k) summarizes structural base
  // =========================
  const mainFunctionSurface = useMemo(() => {
    const phiMin = -6;
    const phiMax = 6;
    const sMin = -3;
    const sMax = 3;
    const nPhi = 61;
    const nS = 31;

    const clampExpArg = (x: number) => Math.max(-50, Math.min(50, x));
    const logistic = (x: number) => {
      const z = 1 / (1 + Math.exp(-clampExpArg(x)));
      // Floating point can round 1 + tiny → 1, which yields z===1.
      return Math.max(Z_BAND_MIN, Math.min(Z_BAND_MAX, z));
    };
    const zFromPhiShift = (phi: number, shift: number) => logistic(phi + shift);

    const k = OPTIMIZED_STRUCTURAL_PARAMS.k;
    const baseShift = baseB > 0 && k > 0 ? Math.log(baseB / k) : 0;

    const phis = Array.from({ length: nPhi }, (_, i) => phiMin + (i * (phiMax - phiMin)) / (nPhi - 1));
    const shifts = Array.from({ length: nS }, (_, j) => sMin + (j * (sMax - sMin)) / (nS - 1));

    const grid: number[] = [];
    for (let j = 0; j < nS; j++) {
      for (let i = 0; i < nPhi; i++) {
        grid.push(zFromPhiShift(phis[i]!, shifts[j]!));
      }
    }

    return { phiMin, phiMax, sMin, sMax, nPhi, nS, phis, shifts, grid, baseShift };
  }, [baseB]);

  // =========================
  // 3D surface bounds (used for the real WebGL surface in 6.1c)
  // =========================
  const mainFunctionSurface3D = useMemo(() => {
    const phiMin = -6;
    const phiMax = 6;
    const sMin = -3;
    const sMax = 3;
    // Higher resolution than the old WebGL mesh: improves readability in SVG isometric rendering.
    const nPhi = 61;
    const nS = 31;

    const clampExpArg = (x: number) => Math.max(-50, Math.min(50, x));
    const logistic = (x: number) => {
      const z = 1 / (1 + Math.exp(-clampExpArg(x)));
      return Math.max(Z_BAND_MIN, Math.min(Z_BAND_MAX, z));
    };

    const k = OPTIMIZED_STRUCTURAL_PARAMS.k;
    const baseShift = baseB > 0 && k > 0 ? Math.log(baseB / k) : 0;

    const phis = Array.from({ length: nPhi }, (_, i) => phiMin + (i * (phiMax - phiMin)) / (nPhi - 1));
    const shifts = Array.from({ length: nS }, (_, j) => sMin + (j * (sMax - sMin)) / (nS - 1));

    const grid: number[] = [];
    for (let j = 0; j < nS; j++) {
      for (let i = 0; i < nPhi; i++) {
        const phi = phis[i]!;
        const s = shifts[j]!;
        grid.push(logistic(phi + s));
      }
    }

    return { phiMin, phiMax, sMin, sMax, nPhi, nS, phis, shifts, grid, baseShift };
  }, [baseB]);

  // =========================
  // Model-implied sensitivity slices: Z over E for selected S levels under fixed stress  // =========================
  const scenarioSlices = useMemo(() => {
    const n = 41;
    const eMin = -0.5;
    const eMax = 1.5;
    const sLevels = [-0.5, 0.5, 1.5];
    const es = Array.from({ length: n }, (_, i) => eMin + (i * (eMax - eMin)) / (n - 1));

    const curves = sLevels.map((s) => {
      const zs: number[] = [];
      for (const e of es) {
        const z = calcZ({
          ...scenarioBaselineInputs,
          // fixed stress load
          T: 1.2,
          M: 0.8,
          D: 0.6,
          // levers
          E: e,
          S: s,
        });
        zs.push(z);
      }
      return { s, zs };
    });

    return { eMin, eMax, es, curves };
  }, [calcZ, scenarioBaselineInputs]);

  // =========================
  // Regime maps (no heatmaps): structural slices + ΔZ slices
  // =========================
  const regimeAxis = useMemo(() => {
    const size = 21;
    const probs = Array.from({ length: size }, (_, i) => 0.05 + (0.9 * i) / (size - 1));

    const xSamples = (panelData || []).map((r) => clamp(r.X, 0.02, 0.98)).filter(Number.isFinite);
    const ySamples = (panelData || []).map((r) => clamp(r.Y, 0.02, 0.98)).filter(Number.isFinite);

    const xs = xSamples.length ? probs.map((p) => quantile(xSamples, p)) : probs;
    const ys = ySamples.length ? probs.map((p) => quantile(ySamples, p)) : probs;

    return { size, xs, ys };
  }, [panelData, clamp, quantile]);

  const regimeSlices = useMemo(() => {
    const { xs, ys } = regimeAxis;
    const xMin = xs[0] ?? 0;
    const xMax = xs[xs.length - 1] ?? 1;

    const yPs = [0.1, 0.3, 0.5, 0.7, 0.9];
    const dashes = ['0', '6,3', '2,3', '1,3', '8,4'];
    const yLevels = yPs
      .map((p, i) => ({
        p,
        i,
        y: ys[pickIndex(ys.length, p)] ?? p,
        dash: dashes[i] ?? '0',
      }))
      .filter((v) => Number.isFinite(v.y));

    const baseline = yLevels.map((lvl) => {
      const zs = xs.map((x) => calcZ({ ...scenarioBaselineInputs, X: x, Y: lvl.y }));
      return { ...lvl, zs };
    });

    const shockInputs = {
      ...scenarioBaselineInputs,
      T: 1.2,
      M: 0.8,
      C: MODIFIER_STANDARDIZATION.C_cultural_intensity.mean + 0.75 * MODIFIER_STANDARDIZATION.C_cultural_intensity.std,
    };

    const bufferInputs = {
      ...scenarioBaselineInputs,
      E: 1.2,
      S: 0.9,
      R: 0.6,
    };

    const shockDelta = yLevels.map((lvl) => {
      const ds = xs.map((x) => calcZ({ ...shockInputs, X: x, Y: lvl.y }) - calcZ({ ...scenarioBaselineInputs, X: x, Y: lvl.y }));
      return { ...lvl, ds };
    });

    const bufferDelta = yLevels.map((lvl) => {
      const ds = xs.map((x) => calcZ({ ...bufferInputs, X: x, Y: lvl.y }) - calcZ({ ...scenarioBaselineInputs, X: x, Y: lvl.y }));
      return { ...lvl, ds };
    });

    const allD = [...shockDelta.flatMap((c) => c.ds), ...bufferDelta.flatMap((c) => c.ds)].filter(Number.isFinite);
    const maxAbs = allD.length ? Math.max(...allD.map((v) => Math.abs(v))) : 0;

    return { xs, xMin, xMax, baseline, shockDelta, bufferDelta, maxAbs };
  }, [calcZ, pickIndex, regimeAxis, scenarioBaselineInputs]);

  const hasEmpirical = validation.points.length > 0 && !error;

  const empiricalFit = useMemo(() => {
    const pts = validation.points;
    if (!pts.length) return null;

    const pairs = pts
      .map((p) => ({ obs: p.obs, pred: p.pred }))
      .filter((p) => Number.isFinite(p.obs) && Number.isFinite(p.pred));

    const n = pairs.length;
    if (!n) return null;

    const meanObs = pairs.reduce((a, p) => a + p.obs, 0) / n;
    const meanPred = pairs.reduce((a, p) => a + p.pred, 0) / n;

    const obsValues: number[] = [];
    const predValues: number[] = [];
    let sse = 0;
    let sst = 0;
    let absSum = 0;
    let cov = 0;
    let varObs = 0;
    let varPred = 0;

    for (const p of pairs) {
      obsValues.push(p.obs);
      predValues.push(p.pred);
      // Keep sign convention consistent with the rest of the UI/sections:
      // residual/error = observed − predicted
      const e = p.obs - p.pred;
      sse += e * e;
      absSum += Math.abs(e);

      const dobs = p.obs - meanObs;
      const dpred = p.pred - meanPred;
      cov += dobs * dpred;
      varObs += dobs * dobs;
      varPred += dpred * dpred;
      sst += dobs * dobs;
    }

    const mae = absSum / n;
    const rmse = Math.sqrt(sse / n);
    const bias = computeBias(obsValues, predValues);
    const r2 = sst === 0 ? NaN : 1 - sse / sst;
    const corr = varObs > 0 && varPred > 0 ? cov / Math.sqrt(varObs * varPred) : NaN;

    return { n, mae, rmse, bias, r2, corr };
  }, [validation.points]);

  const [zTableIso3, setZTableIso3] = useState<string>('ALL');
  const [zTableSort, setZTableSort] = useState<'abs' | 'year' | 'pred' | 'obs'>('abs');
  const [zTableLimit, setZTableLimit] = useState<number>(200);

  const zTableCountries = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of validation.points) {
      if (!p.iso3) continue;
      if (!seen.has(p.iso3)) seen.set(p.iso3, p.country || p.iso3);
    }
    return Array.from(seen.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([iso3, country]) => ({ iso3, country }));
  }, [validation.points]);

  const zTableRows = useMemo(() => {
    const filtered = (zTableIso3 === 'ALL')
      ? validation.points
      : validation.points.filter((p) => p.iso3 === zTableIso3);

    const rows = filtered.slice();
    rows.sort((a, b) => {
      switch (zTableSort) {
        case 'year':
          return (a.year - b.year) || a.iso3.localeCompare(b.iso3);
        case 'pred':
          return b.pred - a.pred;
        case 'obs':
          return b.obs - a.obs;
        case 'abs':
        default:
          return Math.abs(b.resid) - Math.abs(a.resid);
      }
    });

    const safeLimit = Math.max(20, Math.min(2000, Math.floor(zTableLimit || 200)));
    return rows.slice(0, safeLimit);
  }, [validation.points, zTableIso3, zTableLimit, zTableSort]);

  // =========================
  // Canonical production formulation (display-only; logic stays in calculateModel)
  // =========================
  const productionFormulation = useMemo(() => {
    // Symbolic-only (no numeric coefficients) for clarity.
    const Z =
      '\\displaystyle Z = \\frac{X_{\\mathrm{safe}}^{\\alpha}\\,Y_{\\mathrm{safe}}^{\\beta}\\,e^{\\Phi}}{X_{\\mathrm{safe}}^{\\alpha}\\,Y_{\\mathrm{safe}}^{\\beta}\\,e^{\\Phi} + k}';

    const B = '\\displaystyle B := X_{\\mathrm{safe}}^{\\alpha}\\,Y_{\\mathrm{safe}}^{\\beta}';

    const phiDecomp =
      '\\displaystyle \\Phi = \\phi_0 + \\Phi_{\\mathrm{main}} + \\Phi_{\\mathrm{interactions}} + \\Phi_{\\mathrm{quadratic}}';

    const phiMain =
      '\\displaystyle \\begin{aligned}'
      + ' \\Phi_{\\mathrm{main}} = &\\; c_C\\,C_{\\mathrm{std}} + c_M\\,M_{\\mathrm{std}} + c_T\\,T_{\\mathrm{std}} + c_D\\,D_{\\mathrm{std}}'
      + ' \\\\ & + c_G\\,G_{\\mathrm{std}} + c_E\\,E_{\\mathrm{std}} + c_S\\,S_{\\mathrm{std}} + c_R\\,R_{\\mathrm{std}}'
      + ' \\end{aligned}';

    const phiInteractions =
      '\\displaystyle \\begin{aligned}'
      + ' \\Phi_{\\mathrm{interactions}} = &\\; c_{YR}\\,\\big(Y_{\\mathrm{safe}}\\cdot R_{\\mathrm{std}}\\big) + c_{TR}\\,\\big(T_{\\mathrm{std}}\\cdot R_{\\mathrm{std}}\\big) + c_{XY}\\,\\big(X_{\\mathrm{safe}}\\cdot Y_{\\mathrm{safe}}\\big)'
      + ' \\\\ & + c_{CM}\\,\\big(C_{\\mathrm{std}}\\cdot M_{\\mathrm{std}}\\big) + c_{ES}\\,\\big(E_{\\mathrm{std}}\\cdot S_{\\mathrm{std}}\\big) + c_{DT}\\,\\big(D_{\\mathrm{std}}\\cdot T_{\\mathrm{std}}\\big)'
      + ' \\\\ & + c_{GR}\\,\\big(G_{\\mathrm{std}}\\cdot R_{\\mathrm{std}}\\big)'
      + ' \\end{aligned}';

    const phiQuadratic =
      '\\displaystyle \\begin{aligned}'
      + ' \\Phi_{\\mathrm{quadratic}} = &\\; c_{C^2}\\,C_{\\mathrm{std}}^{2} + c_{M^2}\\,M_{\\mathrm{std}}^{2} + c_{T^2}\\,T_{\\mathrm{std}}^{2} + c_{E^2}\\,E_{\\mathrm{std}}^{2}'
      + ' \\end{aligned}';

    return { Z, B, phiDecomp, phiMain, phiInteractions, phiQuadratic };
  }, []);

  const productionCoefficients = useMemo(() => {
    const structural = [
      { symbol: '\\alpha', value: OPTIMIZED_STRUCTURAL_PARAMS.alpha },
      { symbol: '\\beta', value: OPTIMIZED_STRUCTURAL_PARAMS.beta },
      { symbol: 'k', value: OPTIMIZED_STRUCTURAL_PARAMS.k },
      { symbol: '\\phi_0', value: OPTIMIZED_STRUCTURAL_PARAMS.phi0 },
    ];

    const main = [
      { symbol: 'c_C', term: 'C_std', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c1 },
      { symbol: 'c_M', term: 'M_std', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c2 },
      { symbol: 'c_T', term: 'T_std', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c3 },
      { symbol: 'c_D', term: 'D_std', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c4 },
      { symbol: 'c_G', term: 'G_std', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c5 },
      { symbol: 'c_E', term: 'E_std', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c6 },
      { symbol: 'c_S', term: 'S_std', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c7 },
      { symbol: 'c_R', term: 'R_std', value: OPTIMIZED_SIGMOID_COEFFICIENTS.c8 },
    ];

    const interactions = [
      { symbol: 'c_{YR}', term: 'Y_safe·R_std', value: INTERACTION_TERMS.c_yr },
      { symbol: 'c_{TR}', term: 'T_std·R_std', value: INTERACTION_TERMS.c_tr },
      { symbol: 'c_{XY}', term: 'X_safe·Y_safe', value: INTERACTION_TERMS.c_xy },
      { symbol: 'c_{CM}', term: 'C_std·M_std', value: INTERACTION_TERMS.c_cm },
      { symbol: 'c_{ES}', term: 'E_std·S_std', value: INTERACTION_TERMS.c_es },
      { symbol: 'c_{DT}', term: 'D_std·T_std', value: INTERACTION_TERMS.c_dt },
      { symbol: 'c_{GR}', term: 'G_std·R_std', value: INTERACTION_TERMS.c_gr },
    ];

    const quadratic = [
      { symbol: 'c_{C^2}', term: 'C_std²', value: QUADRATIC_TERMS.c_c2 },
      { symbol: 'c_{M^2}', term: 'M_std²', value: QUADRATIC_TERMS.c_m2 },
      { symbol: 'c_{T^2}', term: 'T_std²', value: QUADRATIC_TERMS.c_t2 },
      { symbol: 'c_{E^2}', term: 'E_std²', value: QUADRATIC_TERMS.c_e2 },
    ];

    return { structural, main, interactions, quadratic };
  }, []);

  const content = (
    <div className="belief-equation-content system-dynamics-content sd-mono">
      <div className="system-dynamics-two-stack">
        {/* LEFT COLUMN: Theory → Phase/Sensitivity → Synthesis */}
        <div className="system-dynamics-col">
          <div className="coefficients-visualization-card">
            <h4 className="viz-title">6.0 Canonical Production Formulation (Z, Φ, and Decomposition)</h4>
            <p className="viz-subtitle">Symbolic (letters only). Numeric coefficients are shown in the next card.</p>

            <div className="sd-formula-poster">
              <div className="sd-formula-line sd-formula-line--accent">
                <BlockMath
                  math={productionFormulation.Z}
                  renderError={() => <span className="formula">Z = (X^α Y^β e^Φ)/(X^α Y^β e^Φ + k)</span>}
                />
              </div>
              <div className="sd-formula-line sd-formula-line--accent">
                <BlockMath
                  math={productionFormulation.B}
                  renderError={() => <span className="formula">B := X_safe^α · Y_safe^β</span>}
                />
              </div>
              <div className="sd-formula-line sd-formula-line--accent">
                <BlockMath
                  math={productionFormulation.phiDecomp}
                  renderError={() => <span className="formula">Φ = φ0 + Σ main + Σ interactions + Σ quadratic</span>}
                />
              </div>
              <div className="sd-formula-line sd-formula-line--muted">
                <BlockMath
                  math={productionFormulation.phiMain}
                  renderError={() => <span className="formula">Φ_main = …</span>}
                />
              </div>
              <div className="sd-formula-line sd-formula-line--muted">
                <BlockMath
                  math={productionFormulation.phiInteractions}
                  renderError={() => <span className="formula">Φ_interactions = …</span>}
                />
              </div>
              <div className="sd-formula-line sd-formula-line--muted">
                <BlockMath
                  math={productionFormulation.phiQuadratic}
                  renderError={() => <span className="formula">Φ_quadratic = …</span>}
                />
              </div>
            </div>

            <div className="methodology-note">
              <strong>Important:</strong> the UI/panel structural inputs are mapped into a safe domain (X_safe, Y_safe ∈ [0.0001, 0.9999]) before applying sublinear powers.
              This preserves numerical validity for fractional exponents and matches the training/validator pipeline.
            </div>
          </div>

          <div className="coefficients-visualization-card">
            <h4 className="viz-title">6.0a Production Coefficients (Table)</h4>
            <p className="viz-subtitle">Numeric values used by the app (kept separate to remove clutter from the formulation)</p>

            <div className="sd-coef-grid">
              <div className="sd-coef-block">
                <div className="sd-coef-block-title">Structural</div>
                <table className="sd-coef-table">
                  <thead>
                    <tr>
                      <th>symbol</th>
                      <th>value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productionCoefficients.structural.map((row) => (
                      <tr key={row.symbol}>
                        <td className="sd-coef-mono">{row.symbol}</td>
                        <td className="sd-coef-num">{fmt(row.value, 3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="sd-coef-block">
                <div className="sd-coef-block-title">Main (Φ_main)</div>
                <table className="sd-coef-table">
                  <thead>
                    <tr>
                      <th>symbol</th>
                      <th>term</th>
                      <th>value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productionCoefficients.main.map((row) => (
                      <tr key={row.symbol}>
                        <td className="sd-coef-mono">{row.symbol}</td>
                        <td className="sd-coef-mono">{row.term}</td>
                        <td className="sd-coef-num">{fmt(row.value, 3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="sd-coef-block">
                <div className="sd-coef-block-title">Interactions (Φ_interactions)</div>
                <table className="sd-coef-table">
                  <thead>
                    <tr>
                      <th>symbol</th>
                      <th>term</th>
                      <th>value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productionCoefficients.interactions.map((row) => (
                      <tr key={row.symbol}>
                        <td className="sd-coef-mono">{row.symbol}</td>
                        <td className="sd-coef-mono">{row.term}</td>
                        <td className="sd-coef-num">{fmt(row.value, 3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="sd-coef-block">
                <div className="sd-coef-block-title">Quadratic (Φ_quadratic)</div>
                <table className="sd-coef-table">
                  <thead>
                    <tr>
                      <th>symbol</th>
                      <th>term</th>
                      <th>value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productionCoefficients.quadratic.map((row) => (
                      <tr key={row.symbol}>
                        <td className="sd-coef-mono">{row.symbol}</td>
                        <td className="sd-coef-mono">{row.term}</td>
                        <td className="sd-coef-num">{fmt(row.value, 3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="coefficients-visualization-card">
            <h4 className="viz-title">6.1 System Dynamics Definition (Field Φ → Probability Z)</h4>
            <p className="viz-subtitle">Nonlinearity matters because it concentrates responsiveness into a narrow regime</p>

            <div className="equation-showcase">
              <BlockMath
                math={'\\displaystyle Z = \\frac{B e^{\\Phi}}{B e^{\\Phi} + k}'}
                renderError={() => <span className="formula">Z = (B·e^Φ)/(B·e^Φ + k)</span>}
              />
            </div>

            <div className="equation-showcase">
              <BlockMath
                math={'\\displaystyle \\frac{\\partial Z}{\\partial \\Phi} = Z(1-Z)'}
                renderError={() => <span className="formula">∂Z/∂Φ = Z(1−Z)</span>}
              />
            </div>

            <div className="methodology-note">
              <strong>Notation:</strong> Φ is dimensionless; Z is constrained to the canonical normalization band [0.0001, 0.9999] (ε=1e-4).
              Timescale labels are written as τ_slow/τ_mid/τ_fast to avoid collisions with model variables like $S$ (support) and $M$ (media).
            </div>
          </div>

          <div className="coefficients-visualization-card">
            <h4 className="viz-title">6.1b Main Function Surface (Explicit Heatmap + Curves)</h4>
            <p className="viz-subtitle">Heatmap: Z over Φ (x-axis) and ln(B/k) (y-axis). Right panel: Z(Φ) curves for weak/typical/strong structural base.</p>

            <svg viewBox="0 0 720 300" className="validation-chart sd-svg sd-svg--h290">
              {(() => {
                const {
                  phiMin,
                  phiMax,
                  sMin,
                  sMax,
                  nPhi,
                  nS,
                  grid,
                  baseShift,
                } = mainFunctionSurface;

                const x0 = 70;
                const y0 = 42;
                const w = 380;
                const h = 220;
                const cellW = w / (nPhi - 1);
                const cellH = h / (nS - 1);

                const paletteHex = ['#0f172a', '#1e293b', '#334155', '#475569', '#94a3b8', '#e2e8f0', '#f4d03f'];
                const hexToRgb = (hex: string) => {
                  const clean = hex.replace('#', '');
                  const r = parseInt(clean.slice(0, 2), 16);
                  const g = parseInt(clean.slice(2, 4), 16);
                  const b = parseInt(clean.slice(4, 6), 16);
                  return { r, g, b };
                };
                const palette = paletteHex.map(hexToRgb);
                const colorForZ = (z: number) => {
                  const t = axisT(z);
                  const scaled = t * (palette.length - 1);
                  const idx = Math.min(palette.length - 2, Math.max(0, Math.floor(scaled)));
                  const u = scaled - idx;
                  const a = palette[idx]!;
                  const b = palette[idx + 1]!;
                  const r = Math.round(lerp(a.r, b.r, u));
                  const g = Math.round(lerp(a.g, b.g, u));
                  const bb = Math.round(lerp(a.b, b.b, u));
                  return `rgb(${r},${g},${bb})`;
                };

                const xFromPhi = (phi: number) => x0 + ((phi - phiMin) / (phiMax - phiMin)) * w;
                const yFromShift = (s: number) => y0 + (1 - (s - sMin) / (sMax - sMin)) * h;

                const logit = (p: number) => Math.log(p / (1 - p));
                const clippedLineEndpoints = (a: number) => {
                  // Lines of constant Z in the (phi, s) plane are: s = a - phi where a = logit(Z)
                  // Compute intersections with bounding box and return up to 2 endpoints.
                  const pts: Array<{ phi: number; s: number }> = [];
                  const pushIfIn = (phi: number, s: number) => {
                    if (phi >= phiMin - 1e-9 && phi <= phiMax + 1e-9 && s >= sMin - 1e-9 && s <= sMax + 1e-9) {
                      pts.push({ phi, s });
                    }
                  };
                  // phi boundaries
                  pushIfIn(phiMin, a - phiMin);
                  pushIfIn(phiMax, a - phiMax);
                  // s boundaries
                  pushIfIn(a - sMin, sMin);
                  pushIfIn(a - sMax, sMax);

                  // Deduplicate approximately
                  const uniq: Array<{ phi: number; s: number }> = [];
                  for (const p of pts) {
                    if (!uniq.some((q) => Math.abs(q.phi - p.phi) < 1e-6 && Math.abs(q.s - p.s) < 1e-6)) uniq.push(p);
                  }
                  if (uniq.length < 2) return null;
                  return [uniq[0]!, uniq[1]!];
                };

                const legendX = x0 + w + 14;
                const legendY = y0;
                const legendW = 16;
                const legendH = h;

                const miniX0 = 500;
                const miniY0 = 70;
                const miniW = 190;
                const miniH = 170;
                const yMini = (z: number) => miniY0 + (1 - axisT(z)) * miniH;

                const clampExpArg = (x: number) => Math.max(-50, Math.min(50, x));
                const logistic = (x: number) => 1 / (1 + Math.exp(-clampExpArg(x)));

                const curveShifts = [baseShift - 1.0, baseShift, baseShift + 1.0];
                const curveColors = ['#94a3b8', '#10b981', '#f4d03f'];
                const curveLabels = ['weak base', 'baseline', 'strong base'];

                return (
                  <>
                    <text x="360" y="20" textAnchor="middle" fill="#f1f5f9" fontSize="12" fontWeight={700}>
                      Main function (analytic): Z = (B·e^Φ) / (B·e^Φ + k)
                    </text>

                    {/* Heatmap frame */}
                    <rect x={x0} y={y0} width={w} height={h} fill="#0b1220" stroke="#334155" strokeWidth="2" />

                    {/* Heatmap cells */}
                    {Array.from({ length: nS - 1 }, (_, jj) =>
                      Array.from({ length: nPhi - 1 }, (_, ii) => {
                        // grid is indexed by [j * nPhi + i]
                        const z = grid[(jj + 1) * nPhi + (ii + 1)] ?? 0;
                        const x = x0 + ii * cellW;
                        const y = y0 + (nS - 2 - jj) * cellH;
                        return <rect key={`${jj}-${ii}`} x={x} y={y} width={cellW + 0.2} height={cellH + 0.2} fill={colorForZ(z)} />;
                      }),
                    )}

                    {/* Contours (straight lines because Z depends on Φ + ln(B/k)) */}
                    {[0.1, 0.5, 0.9].map((lvl) => {
                      const a = logit(lvl);
                      const seg = clippedLineEndpoints(a);
                      if (!seg) return null;
                      const [p1, p2] = seg;
                      const x1 = xFromPhi(p1.phi);
                      const y1 = yFromShift(p1.s);
                      const x2 = xFromPhi(p2.phi);
                      const y2 = yFromShift(p2.s);
                      return (
                        <g key={lvl}>
                          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e2e8f0" strokeWidth="1.25" opacity="0.65" strokeDasharray="4,3" />
                          <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle" fill="#e2e8f0" fontSize="10" opacity="0.85">
                            Z={lvl.toFixed(1)}
                          </text>
                        </g>
                      );
                    })}

                    {/* Baseline structural base marker */}
                    {Number.isFinite(baseShift) && baseShift >= sMin && baseShift <= sMax ? (
                      <g>
                        <line x1={x0} y1={yFromShift(baseShift)} x2={x0 + w} y2={yFromShift(baseShift)} stroke="#10b981" strokeWidth="2" opacity="0.9" />
                        <text x={x0 + 8} y={yFromShift(baseShift) - 6} fill="#10b981" fontSize="10" fontWeight={700}>
                          baseline ln(B/k)
                        </text>
                      </g>
                    ) : null}

                    {/* Axes ticks/labels (Φ) */}
                    {[-6, -3, 0, 3, 6].map((val) => {
                      const x = xFromPhi(val);
                      return (
                        <g key={val}>
                          <line x1={x} y1={y0 + h} x2={x} y2={y0 + h + 6} stroke="#64748b" strokeWidth="1" />
                          <text x={x} y={y0 + h + 20} textAnchor="middle" fill="#cbd5e1" fontSize="10">
                            {val}
                          </text>
                        </g>
                      );
                    })}
                    <text x={x0 + w / 2} y={y0 + h + 36} textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight={700}>
                      Φ
                    </text>

                    {/* Axes ticks/labels (ln(B/k)) */}
                    {[-3, -1.5, 0, 1.5, 3].map((val) => {
                      const y = yFromShift(val);
                      return (
                        <g key={val}>
                          <line x1={x0 - 6} y1={y} x2={x0} y2={y} stroke="#64748b" strokeWidth="1" />
                          <text x={x0 - 10} y={y + 3} textAnchor="end" fill="#cbd5e1" fontSize="10">
                            {val}
                          </text>
                        </g>
                      );
                    })}
                    <text x={22} y={y0 + h / 2} textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight={700} transform={`rotate(-90 22 ${y0 + h / 2})`}>
                      ln(B/k)
                    </text>

                    {/* Legend */}
                    <rect x={legendX} y={legendY} width={legendW} height={legendH} fill="#0b1220" stroke="#334155" strokeWidth="1.5" />
                    {Array.from({ length: 40 }, (_, i) => {
                      const t = i / 39;
                      const z = TRAIN_MIN + (1 - t) * TRAIN_SPAN;
                      const yy = legendY + t * legendH;
                      return <rect key={i} x={legendX + 1} y={yy} width={legendW - 2} height={legendH / 40 + 0.5} fill={colorForZ(z)} />;
                    })}
                    {[TRAIN_MIN, 0.5, TRAIN_MAX].map((val) => {
                      const yy = legendY + (1 - axisT(val)) * legendH;
                      return (
                        <g key={val}>
                          <line x1={legendX + legendW} y1={yy} x2={legendX + legendW + 6} y2={yy} stroke="#94a3b8" />
                          <text x={legendX + legendW + 10} y={yy + 3} fill="#cbd5e1" fontSize="10">
                            {fmtBandTick(val, 1)}
                          </text>
                        </g>
                      );
                    })}
                    <text x={legendX + legendW / 2} y={legendY - 10} textAnchor="middle" fill="#cbd5e1" fontSize="10" fontWeight={700}>
                      Z
                    </text>

                    {/* Mini plot: explicit main function curves */}
                    <text x={miniX0 + miniW / 2} y={52} textAnchor="middle" fill="#f1f5f9" fontSize="11" fontWeight={700}>
                      Z(Φ) at different ln(B/k)
                    </text>
                    <rect x={miniX0} y={miniY0} width={miniW} height={miniH} fill="#0b1220" stroke="#334155" strokeWidth="2" />
                    {/* Mini axes */}
                    <line x1={miniX0} y1={miniY0 + miniH} x2={miniX0 + miniW} y2={miniY0 + miniH} stroke="#334155" strokeWidth="1.5" />
                    <line x1={miniX0} y1={miniY0} x2={miniX0} y2={miniY0 + miniH} stroke="#334155" strokeWidth="1.5" />
                    {[TRAIN_MIN, 0.5, TRAIN_MAX].map((val) => {
                      const yy = yMini(val);
                      return (
                        <g key={val}>
                          <line x1={miniX0 - 6} y1={yy} x2={miniX0} y2={yy} stroke="#64748b" />
                          <text x={miniX0 - 10} y={yy + 3} textAnchor="end" fill="#cbd5e1" fontSize="10">
                            {fmtBandTick(val, 1)}
                          </text>
                        </g>
                      );
                    })}

                    {[-6, -3, 0, 3, 6].map((val) => {
                      const x = miniX0 + ((val - phiMin) / (phiMax - phiMin)) * miniW;
                      return (
                        <g key={val}>
                          <line x1={x} y1={miniY0 + miniH} x2={x} y2={miniY0 + miniH + 6} stroke="#64748b" />
                          <text x={x} y={miniY0 + miniH + 20} textAnchor="middle" fill="#cbd5e1" fontSize="10">
                            {val}
                          </text>
                        </g>
                      );
                    })}
                    <text x={miniX0 + miniW / 2} y={miniY0 + miniH + 34} textAnchor="middle" fill="#cbd5e1" fontSize="10" fontWeight={700}>
                      Φ
                    </text>

                    {curveShifts.map((s, idx) => {
                      const pts: string[] = [];
                      const steps = 120;
                      for (let i = 0; i <= steps; i++) {
                        const phi = phiMin + (i * (phiMax - phiMin)) / steps;
                        const z = logistic(phi + s);
                        const x = miniX0 + ((phi - phiMin) / (phiMax - phiMin)) * miniW;
                        const y = yMini(z);
                        pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
                      }
                      return <path key={s} d={pts.join(' ')} stroke={curveColors[idx] ?? '#94a3b8'} strokeWidth="2.5" fill="none" opacity="0.95" />;
                    })}

                    {/* Legend for curves */}
                    {curveLabels.map((label, idx) => (
                      <g key={label}>
                        <line x1={miniX0 + 6} y1={miniY0 + 10 + idx * 14} x2={miniX0 + 26} y2={miniY0 + 10 + idx * 14} stroke={curveColors[idx] ?? '#94a3b8'} strokeWidth="3" />
                        <text x={miniX0 + 32} y={miniY0 + 13 + idx * 14} fill="#cbd5e1" fontSize="10">
                          {label}
                        </text>
                      </g>
                    ))}
                  </>
                );
              })()}
            </svg>

            <div className="methodology-note">
              <strong>Why this is readable:</strong> contours are straight lines because the mapping depends on the sum Φ + ln(B/k).
              The central diagonal band (away from Z→0 and Z→1 saturation) is the “responsive regime”; near the endpoints the system saturates.
            </div>
          </div>

          <div className="coefficients-visualization-card">
            <h4 className="viz-title">6.1c Main Function (Isometric Surface; SVG)</h4>
            <p className="viz-subtitle">Same rendering method as other charts: computed surface + isometric projection + ridge/baseline overlays</p>

            <svg viewBox="0 0 720 440" className="validation-chart sd-svg sd-svg--h460">
              {(() => {
                const { phiMin, phiMax, sMin, sMax, nPhi, nS, phis, shifts, grid, baseShift } = mainFunctionSurface3D;

                const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
                const clampExpArg = (x: number) => Math.max(-50, Math.min(50, x));
                const logistic = (x: number) => 1 / (1 + Math.exp(-clampExpArg(x)));

                // Theme-consistent palette (matches 6.1b heatmap)
                const paletteHex = ['#0f172a', '#1e293b', '#334155', '#475569', '#94a3b8', '#e2e8f0', '#f4d03f'];
                const hexToRgb = (hex: string) => {
                  const clean = hex.replace('#', '');
                  const r = parseInt(clean.slice(0, 2), 16);
                  const g = parseInt(clean.slice(2, 4), 16);
                  const b = parseInt(clean.slice(4, 6), 16);
                  return { r, g, b };
                };
                const palette = paletteHex.map(hexToRgb);
                const colorForZ = (z: number) => {
                  const t = axisT(z);
                  const scaled = t * (palette.length - 1);
                  const idx = Math.min(palette.length - 2, Math.max(0, Math.floor(scaled)));
                  const u = scaled - idx;
                  const a = palette[idx]!;
                  const b = palette[idx + 1]!;
                  const r = Math.round(lerp(a.r, b.r, u));
                  const g = Math.round(lerp(a.g, b.g, u));
                  const bb = Math.round(lerp(a.b, b.b, u));
                  return `rgb(${r},${g},${bb})`;
                };

                // Panel layout (slightly larger, centered fit)
                const x0 = 34;
                const y0 = 32;
                const w = 640;
                const h = 380;
                const pad = 14;

                // Colorbar layout (consistent with 6.1b)
                const cbarX = x0 + w + 12;
                const cbarY = y0 + 10;
                const cbarW = 14;
                const cbarH = h - 20;

                const legendY = y0 + h + 12;

                // Isometric projection in a normalized cube
                // xN: Φ axis, yN: ln(B/k) axis, zN: height Z
                const project = (xN: number, yN: number, zN: number) => {
                  const u = xN - yN;
                  const v = (xN + yN) * 0.55 - zN * 1.00;
                  return { u, v };
                };

                const phiToXN = (phi: number) => ((phi - (phiMin + phiMax) / 2) / (phiMax - phiMin)) * 2;
                const sToYN = (s: number) => ((s - (sMin + sMax) / 2) / (sMax - sMin)) * 2;
                const zToZN = (z: number) => (axisT(z) - 0.5) * 2;

                // Compute projected bounds from all vertices to auto-fit
                let uMin = Infinity;
                let uMax = -Infinity;
                let vMin = Infinity;
                let vMax = -Infinity;
                for (let j = 0; j < nS; j++) {
                  for (let i = 0; i < nPhi; i++) {
                    const phi = phis[i]!;
                    const s = shifts[j]!;
                    const z = grid[j * nPhi + i] ?? 0;
                    const { u, v } = project(phiToXN(phi), sToYN(s), zToZN(z));
                    uMin = Math.min(uMin, u);
                    uMax = Math.max(uMax, u);
                    vMin = Math.min(vMin, v);
                    vMax = Math.max(vMax, v);
                  }
                }
                const uSpan = Math.max(1e-6, uMax - uMin);
                const vSpan = Math.max(1e-6, vMax - vMin);
                const scale = Math.min((w - 2 * pad) / uSpan, (h - 2 * pad) / vSpan);
                const innerW = w - 2 * pad;
                const innerH = h - 2 * pad;

                const extraX = innerW - uSpan * scale;
                const extraY = innerH - vSpan * scale;

                // Center alignment (0=left/top, 0.5=center, 1=right/bottom)
                const xAlign = 0.5;
                const yAlign = 0.5;

                const offsetX = x0 + pad + extraX * xAlign;
                const offsetY = y0 + pad + extraY * yAlign;
                const X = (u: number) => offsetX + (u - uMin) * scale;
                const Y = (v: number) => offsetY + (v - vMin) * scale;

                // Simple Lambert shading (keeps the same palette, improves 3D depth perception)
                const shadeRgb = (rgb: { r: number; g: number; b: number }, intensity01: number) => {
                  const t = clamp01(intensity01);
                  const k = 0.70 + 0.35 * t;
                  const r = Math.max(0, Math.min(255, Math.round(rgb.r * k)));
                  const g = Math.max(0, Math.min(255, Math.round(rgb.g * k)));
                  const b = Math.max(0, Math.min(255, Math.round(rgb.b * k)));
                  return `rgb(${r},${g},${b})`;
                };
                const normalize3 = (x: number, y: number, z: number) => {
                  const m = Math.sqrt(x * x + y * y + z * z) || 1;
                  return { x: x / m, y: y / m, z: z / m };
                };
                const dot3 = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => a.x * b.x + a.y * b.y + a.z * b.z;
                const cross3 = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => ({
                  x: a.y * b.z - a.z * b.y,
                  y: a.z * b.x - a.x * b.z,
                  z: a.x * b.y - a.y * b.x,
                });
                const light = normalize3(0.35, 0.85, 0.40);

                // Painter's algorithm order for quads
                const cells: Array<{ key: string; depth: number; pts: string; fill: string }> = [];
                for (let j = 0; j < nS - 1; j++) {
                  for (let i = 0; i < nPhi - 1; i++) {
                    const phiA = phis[i]!;
                    const phiB = phis[i + 1]!;
                    const sA = shifts[j]!;
                    const sB = shifts[j + 1]!;

                    const z00 = grid[j * nPhi + i] ?? 0;
                    const z10 = grid[j * nPhi + (i + 1)] ?? 0;
                    const z01 = grid[(j + 1) * nPhi + i] ?? 0;
                    const z11 = grid[(j + 1) * nPhi + (i + 1)] ?? 0;

                    // 3D points in normalized model-space for shading only
                    const p00m = { x: phiToXN(phiA), y: sToYN(sA), z: zToZN(z00) };
                    const p10m = { x: phiToXN(phiB), y: sToYN(sA), z: zToZN(z10) };
                    const p01m = { x: phiToXN(phiA), y: sToYN(sB), z: zToZN(z01) };
                    const e1 = { x: p10m.x - p00m.x, y: p10m.y - p00m.y, z: p10m.z - p00m.z };
                    const e2 = { x: p01m.x - p00m.x, y: p01m.y - p00m.y, z: p01m.z - p00m.z };
                    const nRaw = cross3(e1, e2);
                    const nrm = normalize3(nRaw.x, nRaw.y, nRaw.z);
                    const lambert = clamp01(0.15 + 0.85 * dot3(nrm, light));

                    const p00 = project(phiToXN(phiA), sToYN(sA), zToZN(z00));
                    const p10 = project(phiToXN(phiB), sToYN(sA), zToZN(z10));
                    const p11 = project(phiToXN(phiB), sToYN(sB), zToZN(z11));
                    const p01 = project(phiToXN(phiA), sToYN(sB), zToZN(z01));

                    const pts = `${X(p00.u).toFixed(1)},${Y(p00.v).toFixed(1)} ${X(p10.u).toFixed(1)},${Y(p10.v).toFixed(1)} ${X(p11.u).toFixed(1)},${Y(p11.v).toFixed(1)} ${X(p01.u).toFixed(1)},${Y(p01.v).toFixed(1)}`;
                    const zAvg = (z00 + z10 + z01 + z11) / 4;
                    const depth = (i + j) + zAvg * 0.25;
                    // Shade the palette color (keeps the same “language” as the 2D heatmap but reads 3D)
                    const baseRgb = (() => {
                      const t = axisT(zAvg);
                      const scaled = t * (palette.length - 1);
                      const idx = Math.min(palette.length - 2, Math.max(0, Math.floor(scaled)));
                      const u = scaled - idx;
                      const a = palette[idx]!;
                      const b = palette[idx + 1]!;
                      return {
                        r: Math.round(lerp(a.r, b.r, u)),
                        g: Math.round(lerp(a.g, b.g, u)),
                        b: Math.round(lerp(a.b, b.b, u)),
                      };
                    })();
                    cells.push({ key: `${j}-${i}`, depth, pts, fill: shadeRgb(baseRgb, lambert) });
                  }
                }
                cells.sort((a, b) => a.depth - b.depth);

                // Wire grid (sparser + subtle) for readability
                const gridLines: Array<{ d: string; key: string }> = [];
                const stepPhi = 6;
                const stepS = 3;
                for (let j = 0; j < nS; j += stepS) {
                  const parts: string[] = [];
                  for (let i = 0; i < nPhi; i++) {
                    const phi = phis[i]!;
                    const s = shifts[j]!;
                    const z = grid[j * nPhi + i] ?? 0;
                    const p = project(phiToXN(phi), sToYN(s), zToZN(z));
                    parts.push(`${i === 0 ? 'M' : 'L'} ${X(p.u).toFixed(1)} ${Y(p.v).toFixed(1)}`);
                  }
                  gridLines.push({ key: `s-${j}`, d: parts.join(' ') });
                }
                for (let i = 0; i < nPhi; i += stepPhi) {
                  const parts: string[] = [];
                  for (let j = 0; j < nS; j++) {
                    const phi = phis[i]!;
                    const s = shifts[j]!;
                    const z = grid[j * nPhi + i] ?? 0;
                    const p = project(phiToXN(phi), sToYN(s), zToZN(z));
                    parts.push(`${j === 0 ? 'M' : 'L'} ${X(p.u).toFixed(1)} ${Y(p.v).toFixed(1)}`);
                  }
                  gridLines.push({ key: `phi-${i}`, d: parts.join(' ') });
                }

                // Ridge line: Z=0.5 => Φ + s = 0
                const ridgePath = (() => {
                  const pts: string[] = [];
                  const steps = 220;
                  for (let t = 0; t <= steps; t++) {
                    const phi = phiMin + (t * (phiMax - phiMin)) / steps;
                    const s = -phi;
                    if (s < sMin || s > sMax) continue;
                    const p = project(phiToXN(phi), sToYN(s), zToZN(0.5));
                    pts.push(`${pts.length === 0 ? 'M' : 'L'} ${X(p.u).toFixed(1)} ${Y(p.v).toFixed(1)}`);
                  }
                  return pts.join(' ');
                })();

                // Baseline slice at ln(B/k)=baseShift
                const baselineS = Math.max(sMin, Math.min(sMax, baseShift));
                const baselinePath = (() => {
                  const pts: string[] = [];
                  const steps = 220;
                  for (let t = 0; t <= steps; t++) {
                    const phi = phiMin + (t * (phiMax - phiMin)) / steps;
                    const z = logistic(phi + baselineS);
                    const p = project(phiToXN(phi), sToYN(baselineS), zToZN(z));
                    pts.push(`${pts.length === 0 ? 'M' : 'L'} ${X(p.u).toFixed(1)} ${Y(p.v).toFixed(1)}`);
                  }
                  return pts.join(' ');
                })();

                // Axis label anchors (project cube corners)
                const corner = (phi: number, s: number, z: number) => {
                  const p = project(phiToXN(phi), sToYN(s), zToZN(z));
                  return { x: X(p.u), y: Y(p.v) };
                };
                const origin = corner(phiMin, sMin, 0);
                const phiEnd = corner(phiMax, sMin, 0);
                const sEnd = corner(phiMin, sMax, 0);
                const zEnd = corner(phiMin, sMin, 1);

                const baseA = corner(phiMin, sMin, 0);
                const baseB = corner(phiMax, sMin, 0);
                const baseC = corner(phiMax, sMax, 0);
                const baseD = corner(phiMin, sMax, 0);

                const tickPhi = [-6, -3, 0, 3, 6];
                const tickS = [-3, -1.5, 0, 1.5, 3];

                return (
                  <>
                    <text x="360" y="20" textAnchor="middle" fill="#f1f5f9" fontSize="12" fontWeight={700}>
                      Main function surface (isometric): Z = σ(Φ + ln(B/k))
                    </text>

                    <rect x={x0} y={y0} width={w} height={h} fill="#0b1220" stroke="#334155" strokeWidth="2" />

                    {/* Base plane outline (z=0) */}
                    <path
                      d={`M ${baseA.x.toFixed(1)} ${baseA.y.toFixed(1)} L ${baseB.x.toFixed(1)} ${baseB.y.toFixed(1)} L ${baseC.x.toFixed(1)} ${baseC.y.toFixed(1)} L ${baseD.x.toFixed(1)} ${baseD.y.toFixed(1)} Z`}
                      fill="none"
                      stroke="#334155"
                      strokeWidth="1.5"
                      opacity="0.85"
                    />

                    {/* Surface fill */}
                    <g opacity="0.98">
                      {cells.map((c) => (
                        <polygon key={c.key} points={c.pts} fill={c.fill} stroke="none" />
                      ))}
                    </g>

                    {/* Subtle wire grid */}
                    <g opacity="0.55">
                      {gridLines.map((gl) => (
                        <path key={gl.key} d={gl.d} stroke="#1e293b" strokeWidth="1" fill="none" />
                      ))}
                    </g>

                    {/* Ridge + baseline overlays */}
                    <path d={ridgePath} stroke="#f4d03f" strokeWidth="2.5" fill="none" opacity="0.95" />
                    <path d={baselinePath} stroke="#10b981" strokeWidth="2.5" fill="none" opacity="0.95" />

                    {/* Minimal axes */}
                    <line x1={origin.x} y1={origin.y} x2={phiEnd.x} y2={phiEnd.y} stroke="#94a3b8" strokeWidth="1.5" opacity="0.8" />
                    <line x1={origin.x} y1={origin.y} x2={sEnd.x} y2={sEnd.y} stroke="#94a3b8" strokeWidth="1.5" opacity="0.8" />
                    <line x1={origin.x} y1={origin.y} x2={zEnd.x} y2={zEnd.y} stroke="#94a3b8" strokeWidth="1.5" opacity="0.8" />

                    {/* Φ ticks */}
                    {tickPhi.map((val) => {
                      const t = (val - phiMin) / (phiMax - phiMin);
                      const p0 = corner(phiMin + t * (phiMax - phiMin), sMin, 0);
                      const p1 = { x: p0.x, y: p0.y + 5 };
                      return (
                        <g key={`tphi-${val}`}>
                          <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#64748b" strokeWidth="1" />
                          <text x={p1.x} y={p1.y + 12} textAnchor="middle" fill="#cbd5e1" fontSize="10">
                            {val}
                          </text>
                        </g>
                      );
                    })}

                    {/* ln(B/k) ticks */}
                    {tickS.map((val) => {
                      const t = (val - sMin) / (sMax - sMin);
                      const p0 = corner(phiMin, sMin + t * (sMax - sMin), 0);
                      const p1 = { x: p0.x - 5, y: p0.y };
                      return (
                        <g key={`ts-${val}`}>
                          <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#64748b" strokeWidth="1" />
                          <text x={p1.x - 3} y={p1.y + 3} textAnchor="end" fill="#cbd5e1" fontSize="10">
                            {val}
                          </text>
                        </g>
                      );
                    })}

                    <text x={phiEnd.x + 10} y={phiEnd.y + 4} fill="#cbd5e1" fontSize="11" fontWeight={700}>
                      Φ
                    </text>
                    <text x={sEnd.x - 6} y={sEnd.y - 8} fill="#cbd5e1" fontSize="11" fontWeight={700}>
                      ln(B/k)
                    </text>
                    <text x={zEnd.x - 10} y={zEnd.y - 10} fill="#cbd5e1" fontSize="11" fontWeight={700}>
                      Z
                    </text>

                    {/* Z colorbar */}
                    <rect x={cbarX} y={cbarY} width={cbarW} height={cbarH} fill="#0b1220" stroke="#334155" strokeWidth="1.5" />
                    {Array.from({ length: 40 }, (_, i) => {
                      const t = i / 39;
                      const z = TRAIN_MIN + (1 - t) * TRAIN_SPAN;
                      const yy = cbarY + t * cbarH;
                      return <rect key={i} x={cbarX + 1} y={yy} width={cbarW - 2} height={cbarH / 40 + 0.6} fill={colorForZ(z)} />;
                    })}
                    {[TRAIN_MIN, 0.5, TRAIN_MAX].map((val) => {
                      const yy = cbarY + (1 - axisT(val)) * cbarH;
                      return (
                        <g key={`cbar-${val}`}>
                          <line x1={cbarX + cbarW} y1={yy} x2={cbarX + cbarW + 6} y2={yy} stroke="#94a3b8" strokeWidth="1" />
                          <text x={cbarX + cbarW + 9} y={yy + 3} fill="#cbd5e1" fontSize="10">
                            {fmtBandTick(val, 1)}
                          </text>
                        </g>
                      );
                    })}
                    <text x={cbarX + cbarW / 2} y={cbarY - 8} textAnchor="middle" fill="#cbd5e1" fontSize="10" fontWeight={700}>
                      Z
                    </text>

                    <g transform={`translate(${(x0 + 18).toFixed(1)}, ${legendY.toFixed(1)})`}>
                      <rect x="0" y="0" width="12" height="12" fill="#f4d03f" opacity="0.95" />
                      <text x="18" y="10" fill="#cbd5e1" fontSize="10">
                        ridge Z=0.5
                      </text>
                      <rect x="110" y="0" width="12" height="12" fill="#10b981" opacity="0.95" />
                      <text x="128" y="10" fill="#cbd5e1" fontSize="10">
                        baseline ln(B/k)
                      </text>
                    </g>
                  </>
                );
              })()}
            </svg>

            <div className="methodology-note">
              <strong>Interpretation:</strong> gold ridge is the responsive band (Z=0.5). The green curve is the current baseline slice ln(B/k)=ln(B₀/k).
              Moving along Φ pushes the system into saturation.
            </div>
          </div>

          <div className="coefficients-visualization-card">
            <h4 className="viz-title">6.2 Phase & Sensitivity (Scientifically Interpretable)</h4>
            <p className="viz-subtitle">
              Top: the logistic response Z(Φ) for a fixed, representative structural baseline (i.e., holding the “base” terms constant).
              Bottom: the local sensitivity dZ/dΦ, which shows where changes in Φ have the most leverage on Z.
            </p>

            <svg viewBox="0 0 720 360" className="validation-chart sd-svg sd-svg--h320">
              <text x="360" y="18" textAnchor="middle" fill="#f1f5f9" fontSize="12" fontWeight={700}>
                Phase portrait (dimensionless): Z(Φ) and dZ/dΦ
              </text>

              {/* Z panel axes */}
              <line x1="70" y1="150" x2="680" y2="150" stroke="#334155" strokeWidth="2" />
              <line x1="70" y1="40" x2="70" y2="150" stroke="#334155" strokeWidth="2" />
              <text x="18" y="95" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight={700} transform="rotate(-90 18 95)">
                Z
              </text>

              {/* Sensitivity panel axes */}
              <line x1="70" y1="310" x2="680" y2="310" stroke="#334155" strokeWidth="2" />
              <line x1="70" y1="200" x2="70" y2="310" stroke="#334155" strokeWidth="2" />
              <text x="18" y="255" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight={700} transform="rotate(-90 18 255)">
                dZ/dΦ
              </text>

              {/* Shared X-axis ticks */}
              {[-6, -3, 0, 3, 6].map((val) => {
                const x = 70 + ((val + 6) / 12) * 610;
                return (
                  <g key={val}>
                    <line x1={x} y1={310} x2={x} y2={316} stroke="#64748b" strokeWidth="1" />
                    <text x={x} y={332} textAnchor="middle" fill="#94a3b8" fontSize="10">
                      {val}
                    </text>
                  </g>
                );
              })}
              <text x="375" y="352" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight={700}>
                Φ (symbolic field strength)
              </text>

              {/* Z curve */}
              <path
                d={(() => {
                  const pts: string[] = [];
                  for (let i = 0; i < phiSweep.xs.length; i++) {
                    const phi = phiSweep.xs[i];
                    const z = phiSweep.zs[i];
                    const x = 70 + ((phi + 6) / 12) * 610;
                    const y = 150 - axisT(z) * 100;
                    pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
                  }
                  return pts.join(' ');
                })()}
                stroke="#10b981"
                strokeWidth="3"
                fill="none"
                opacity="0.95"
              />

              {/* Sensitivity curve */}
              <path
                d={(() => {
                  const pts: string[] = [];
                  for (let i = 0; i < phiSweep.xs.length; i++) {
                    const phi = phiSweep.xs[i];
                    const sens = phiSweep.dzdphi[i];
                    const x = 70 + ((phi + 6) / 12) * 610;
                    const y = 310 - clamp(sens, 0, 0.25) * 400;
                    pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
                  }
                  return pts.join(' ');
                })()}
                stroke="#f59e0b"
                strokeWidth="3"
                fill="none"
                opacity="0.95"
              />

              {/* Legend */}
              <g transform="translate(520, 36)">
                <rect x="0" y="0" width="12" height="12" fill="#10b981" opacity="0.9" />
                <text x="18" y="10" fill="#cbd5e1" fontSize="10">
                  Z(Φ)
                </text>
                <rect x="90" y="0" width="12" height="12" fill="#f59e0b" opacity="0.9" />
                <text x="108" y="10" fill="#cbd5e1" fontSize="10">
                  dZ/dΦ
                </text>
              </g>
            </svg>

            <div className="methodology-note">
              <strong>Interpretation:</strong> Read the top curve as a phase-style “response function”: as Φ increases, Z moves from a low state
              toward a high state, with the steep middle segment indicating the transition band.
              The bottom curve is the derivative (gain): it is largest where the top curve is steepest—typically near the critical ridge around
              $Z\approx 0.5$—and it collapses toward zero in the saturated tails (Z→0 or Z→1).
              Practically, this means Φ-shocks or interventions have the biggest effect when the system is in the mid-regime; once near saturation,
              even large shifts in Φ mostly slide along the plateau and produce only small changes in Z.
            </div>
          </div>

          <div className="coefficients-visualization-card">
            <h4 className="viz-title">Synthesis Note — Scientific Takeaway (Closing)</h4>
            <p className="viz-subtitle">
              A compact scientific reading of “structure + field → regime”, expressed as one principle and two equations.
            </p>

            <div className="methodology-note">
              <strong>Principle:</strong> Measure, contextualize, stabilize — under the fitted model, regimes are shaped by the additive balance of structure and field, not by
              a single factor.
            </div>

            <div>
              <div className="sd-formula-line sd-formula-line--accent">
                <BlockMath
                  math={'Z = \\sigma\\!\\left(\\Phi + \\ln\\!\\frac{B}{k}\\right)'}
                  renderError={() => <span className="formula">Z = σ(Φ + ln(B/k))</span>}
                />
              </div>
              <div className="sd-formula-line sd-formula-line--muted">
                <BlockMath
                  math={'\\Delta Z \\approx Z(1-Z)\\,\\Delta\\!\\left(\\Phi + \\ln\\!\\frac{B}{k}\\right)'}
                  renderError={() => <span className="formula">ΔZ ≈ Z(1−Z) · Δ(Φ + ln(B/k))</span>}
                />
              </div>
            </div>

            <div className="methodology-note">
              <strong>How to read this:</strong>
              <ul className="model-features">
                <li>
                  <InlineMath math={'\\ln(B/k)'} /> is the structural baseline (slow-moving). It translates the entire response relative to the
                  threshold.
                </li>
                <li>
                  <InlineMath math={'\\Phi'} /> is the contextual field (fast-moving). It moves the system along a fixed structural slice.
                </li>
                <li>
                  The gain term <InlineMath math={'Z(1-Z)'} /> peaks near the mid-regime, so interventions (buffers vs. shocks) have maximal leverage
                  there and minimal leverage in saturated tails.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Regime Maps → Empirical Grounding → Policy Surface */}
        <div className="system-dynamics-col">
          <div className="coefficients-visualization-card">
            <h4 className="viz-title">6.3 Regime Maps (Readable Slices)</h4>
            <p className="viz-subtitle">Structural regime as Z(X_safe) slices at Y_safe quantiles, plus ΔZ slices (shock/buffer)</p>

            {/* Structural slices */}
            <svg viewBox="0 0 720 320" className="validation-chart sd-svg sd-svg--h290">
              <text x="360" y="18" textAnchor="middle" fill="#f1f5f9" fontSize="12" fontWeight={700}>
                Structural regime slices: Z vs X_safe at Y_safe quantiles
              </text>

              <line x1="70" y1="260" x2="680" y2="260" stroke="#334155" strokeWidth="2" />
              <line x1="70" y1="50" x2="70" y2="260" stroke="#334155" strokeWidth="2" />

              {/* Y ticks */}
              {[TRAIN_MIN, 0.25, 0.5, 0.75, TRAIN_MAX].map((val) => (
                <g key={val}>
                  <line x1="64" y1={260 - axisT(val) * 200} x2="70" y2={260 - axisT(val) * 200} stroke="#64748b" strokeWidth="1" />
                  <text x="58" y={260 - axisT(val) * 200 + 4} textAnchor="end" fill="#94a3b8" fontSize="9">
                    {fmtBandTick(val, 2)}
                  </text>
                  <line x1="70" y1={260 - axisT(val) * 200} x2="680" y2={260 - axisT(val) * 200} stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2,2" />
                </g>
              ))}

              {(() => {
                const { xs, xMin, xMax, baseline } = regimeSlices;
                const w = 610;
                const mapX = (x: number) => 70 + ((x - xMin) / Math.max(1e-9, xMax - xMin)) * w;
                const mapY = (z: number) => 260 - axisT(z) * 200;

                return (
                  <>
                    {/* Curves */}
                    {baseline.map((c, idx) => {
                      const d = c.zs
                        .map((z, i) => {
                          const x = mapX(xs[i]);
                          const y = mapY(z);
                          return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                        })
                        .join(' ');
                      const labelY = mapY(c.zs[c.zs.length - 1] ?? 0);
                      return (
                        <g key={c.p}>
                          <path d={d} stroke="#3b82f6" strokeWidth={2.4} fill="none" opacity={0.9 - idx * 0.12} strokeDasharray={c.dash} />
                          <text x="686" y={labelY + 4} fill="#94a3b8" fontSize="9" textAnchor="start">
                            Y≈{fmt(c.y, 2)}
                          </text>
                        </g>
                      );
                    })}

                    {/* X ticks based on sampled axis */}
                    {[0, 0.25, 0.5, 0.75, 1].map((p) => {
                      const i = pickIndex(xs.length, p);
                      const xVal = xs[i];
                      const x = mapX(xVal);
                      return (
                        <g key={p}>
                          <line x1={x} y1={260} x2={x} y2={266} stroke="#64748b" strokeWidth="1" />
                          <text x={x} y={284} textAnchor="middle" fill="#94a3b8" fontSize="9">
                            {fmt(xVal, 2)}
                          </text>
                        </g>
                      );
                    })}
                  </>
                );
              })()}

              <text x="375" y="308" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight={700}>
                X_safe
              </text>
              <text x="18" y="155" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight={700} transform="rotate(-90 18 155)">
                Z
              </text>
            </svg>

            {/* ΔZ slices */}
            <svg viewBox="0 0 720 320" className="validation-chart sd-svg sd-svg--h290">
              <text x="360" y="18" textAnchor="middle" fill="#f1f5f9" fontSize="12" fontWeight={700}>
                ΔZ slices (scenario − baseline) across X_safe at Y_safe quantiles
              </text>

              {(() => {
                const { xs, xMin, xMax, shockDelta, bufferDelta, maxAbs } = regimeSlices;
                const padT = 50;
                const w = 230;
                const mapX = (x: number) => 70 + ((x - xMin) / Math.max(1e-9, xMax - xMin)) * w;
                const mapY = (d: number) => 260 - (clamp(d, -maxAbs, maxAbs) / Math.max(1e-9, maxAbs)) * 90;

                const drawPanel = (curves: typeof shockDelta, title: string, stroke: string, ox: number) => (
                  <g transform={`translate(${ox}, 0)`}>
                    <text x="220" y="44" textAnchor="middle" fill="#cbd5e1" fontSize="10" fontWeight={700}>
                      {title}
                    </text>
                    <line x1="70" y1="260" x2={70 + w} y2="260" stroke="#334155" strokeWidth="2" />
                    <line x1="70" y1={padT} x2="70" y2="260" stroke="#334155" strokeWidth="2" />
                    <line x1="70" y1="155" x2={70 + w} y2="155" stroke="#f59e0b" strokeWidth="1.3" strokeDasharray="4,4" opacity={0.8} />

                    {curves.map((c, idx) => {
                      const d = c.ds
                        .map((vv, i) => `${i === 0 ? 'M' : 'L'} ${mapX(xs[i]).toFixed(1)} ${mapY(vv).toFixed(1)}`)
                        .join(' ');
                      return <path key={c.p} d={d} stroke={stroke} strokeWidth={2.2} fill="none" opacity={0.9 - idx * 0.12} strokeDasharray={c.dash} />;
                    })}

                    {/* x ticks */}
                    {[0, 0.5, 1].map((p) => {
                      const i = pickIndex(xs.length, p);
                      const xVal = xs[i];
                      const x = mapX(xVal);
                      return (
                        <g key={p}>
                          <line x1={x} y1={260} x2={x} y2={266} stroke="#64748b" strokeWidth="1" />
                          <text x={x} y={284} textAnchor="middle" fill="#94a3b8" fontSize="9">
                            {fmt(xVal, 2)}
                          </text>
                        </g>
                      );
                    })}

                    {/* y ticks */}
                    {[-maxAbs, 0, maxAbs].map((v) => {
                      const y = mapY(v);
                      return (
                        <g key={v}>
                          <line x1="64" y1={y} x2="70" y2={y} stroke="#64748b" strokeWidth="1" />
                          <text x="58" y={y + 4} textAnchor="end" fill="#94a3b8" fontSize="9">
                            {fmt(v, 2)}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );

                return (
                  <>
                    {drawPanel(shockDelta, 'Shock (↑T, ↑M, ↑C)', '#ef4444', 0)}
                    {drawPanel(bufferDelta, 'Buffer (↑E, ↑S, ↑R)', '#3b82f6', 340)}
                    <text x="18" y="165" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight={700} transform="rotate(-90 18 165)">
                      ΔZ
                    </text>
                    <text x="360" y="308" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight={700}>
                      X_safe
                    </text>
                  </>
                );
              })()}
            </svg>

            <div className="methodology-note">
              These regime maps are computed directly from calculateModel() (no refit). Using slices makes the regime shifts readable:
              each line is a fixed Y_safe quantile, showing how X_safe moves the system along the response curve.
            </div>
          </div>

          <div className="coefficients-visualization-card">
            <h4 className="viz-title">6.4 Empirical Evaluation on Panel (Fixed Coefficients)</h4>
            <p className="viz-subtitle">Observed vs predicted, calibration (IQR), and residual diagnostics (runtime pipeline)</p>

            <div className="methodology-note">
              <ul className="model-features">
                <li>
                  <strong>Production headline:</strong> R² = {PRODUCTION.r2} · r = {PRODUCTION.r} · MAE = {PRODUCTION.mae} · RMSE = {PRODUCTION.rmse} · Bias ({BIAS_DEFINITION_PHRASE}) ≈ {PRODUCTION.bias}
                </li>
                {empiricalFit && (
                  <li>
                    <strong>Runtime score (this build):</strong> N = {empiricalFit.n} · R² = {fmt(empiricalFit.r2, 3)} · r = {fmt(empiricalFit.corr, 3)} · MAE = {fmt(empiricalFit.mae, 3)} · RMSE = {fmt(empiricalFit.rmse, 3)} · Bias ({BIAS_DEFINITION_PHRASE}) = {fmt(empiricalFit.bias, 3)}
                  </li>
                )}
                <li>
                  Panel: {getProductionDatasetMetadata().countries} countries (rows used: {validation.n || 0} / {validation.totalRows || 0}). Preprocessing matches the documentation (only C is z-scored).
                </li>
              </ul>
              {(loading || error) && <div className="validation-status">{loading ? 'Loading panel data…' : `Panel load error: ${error}`}</div>}
              {!hasEmpirical && !loading && !error && <div className="validation-status">Panel data unavailable at runtime; empirical charts are suppressed (no fabrication).</div>}
            </div>

            {hasEmpirical && (
              <>
                {/* (A) Observed vs Predicted scatter */}
                <svg viewBox="0 0 500 260" className="validation-chart sd-svg sd-svg--h240">
                  <line x1="70" y1="280" x2="470" y2="280" stroke="#334155" strokeWidth="2" />
                  <line x1="70" y1="60" x2="70" y2="280" stroke="#334155" strokeWidth="2" />

                  {[0.2, 0.4, 0.6, 0.8].map((val) => (
                    <g key={val}>
                      <line
                        x1="70"
                        y1={280 - clamp((val - TRAIN_MIN) / Math.max(1e-12, TRAIN_MAX - TRAIN_MIN), 0, 1) * 220}
                        x2="470"
                        y2={280 - clamp((val - TRAIN_MIN) / Math.max(1e-12, TRAIN_MAX - TRAIN_MIN), 0, 1) * 220}
                        stroke="#1e293b"
                        strokeWidth="0.5"
                        strokeDasharray="2,2"
                      />
                      <line
                        x1={70 + clamp((val - TRAIN_MIN) / Math.max(1e-12, TRAIN_MAX - TRAIN_MIN), 0, 1) * 400}
                        y1="60"
                        x2={70 + clamp((val - TRAIN_MIN) / Math.max(1e-12, TRAIN_MAX - TRAIN_MIN), 0, 1) * 400}
                        y2="280"
                        stroke="#1e293b"
                        strokeWidth="0.5"
                        strokeDasharray="2,2"
                      />
                    </g>
                  ))}

                  <line x1="70" y1="280" x2="470" y2="60" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4,4" />

                  {validation.points.map((p, i) => {
                    const x = 70 + clamp((p.pred - TRAIN_MIN) / Math.max(1e-12, TRAIN_MAX - TRAIN_MIN), 0, 1) * 400;
                    const y = 280 - clamp((p.obs - TRAIN_MIN) / Math.max(1e-12, TRAIN_MAX - TRAIN_MIN), 0, 1) * 220;
                    return <circle key={i} cx={x} cy={y} r={2.5} fill="#10b981" fillOpacity="0.7" stroke="#10b981" strokeWidth="0.5" />;
                  })}

                  {[TRAIN_MIN, 0.2, 0.4, 0.6, 0.8, TRAIN_MAX].map((val) => (
                    <g key={val}>
                      <line
                        x1="65"
                        y1={280 - clamp((val - TRAIN_MIN) / Math.max(1e-12, TRAIN_MAX - TRAIN_MIN), 0, 1) * 220}
                        x2="70"
                        y2={280 - clamp((val - TRAIN_MIN) / Math.max(1e-12, TRAIN_MAX - TRAIN_MIN), 0, 1) * 220}
                        stroke="#64748b"
                        strokeWidth="1"
                      />
                      <text x="60" y={280 - clamp((val - TRAIN_MIN) / Math.max(1e-12, TRAIN_MAX - TRAIN_MIN), 0, 1) * 220 + 4} textAnchor="end" fill="#94a3b8" fontSize="9">
                        {Math.abs(val - TRAIN_MIN) < 1e-12 ? TRAIN_MIN.toFixed(4) : Math.abs(val - TRAIN_MAX) < 1e-12 ? TRAIN_MAX.toFixed(4) : val.toFixed(1)}
                      </text>
                      <line x1={70 + clamp((val - TRAIN_MIN) / Math.max(1e-12, TRAIN_MAX - TRAIN_MIN), 0, 1) * 400} y1="280" x2={70 + clamp((val - TRAIN_MIN) / Math.max(1e-12, TRAIN_MAX - TRAIN_MIN), 0, 1) * 400} y2="285" stroke="#64748b" strokeWidth="1" />
                      <text x={70 + clamp((val - TRAIN_MIN) / Math.max(1e-12, TRAIN_MAX - TRAIN_MIN), 0, 1) * 400} y="295" textAnchor="middle" fill="#94a3b8" fontSize="9">
                        {Math.abs(val - TRAIN_MIN) < 1e-12 ? TRAIN_MIN.toFixed(4) : Math.abs(val - TRAIN_MAX) < 1e-12 ? TRAIN_MAX.toFixed(4) : val.toFixed(1)}
                      </text>
                    </g>
                  ))}

                  <text x="270" y="320" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="700">
                    Predicted Z (calculateModel)
                  </text>
                  <text x="30" y="170" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="700" transform="rotate(-90 30 170)">
                    Observed Z (Panel)
                  </text>

                  <text x="270" y="40" textAnchor="middle" fill="#f1f5f9" fontSize="13" fontWeight="700">
                    Observed vs Predicted (N = {validation.points.length})
                  </text>
                  <text x="270" y="55" textAnchor="middle" fill="#94a3b8" fontSize="10">
                    Runtime: R² = {empiricalFit ? fmt(empiricalFit.r2, 3) : '—'}, r = {empiricalFit ? fmt(empiricalFit.corr, 3) : '—'} | MAE = {empiricalFit ? fmt(empiricalFit.mae, 3) : '—'}, RMSE = {empiricalFit ? fmt(empiricalFit.rmse, 3) : '—'}
                    {' '}| Production: R² = {fmt(PRODUCTION.r2, 3)}, r = {fmt(PRODUCTION.r, 3)}
                  </text>
                </svg>

                {/* (B) Calibration curve with IQR */}
                <svg viewBox="0 0 500 280" className="validation-chart sd-svg sd-svg--h240">
                  <line x1="70" y1="260" x2="470" y2="260" stroke="#334155" strokeWidth="2" />
                  <line x1="70" y1="60" x2="70" y2="260" stroke="#334155" strokeWidth="2" />

                  <line x1="70" y1="260" x2="470" y2="60" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4,4" />

                  {validation.bins.map((b, i) => {
                    const x = 70 + clamp((b.predMean - TRAIN_MIN) / Math.max(1e-12, TRAIN_MAX - TRAIN_MIN), 0, 1) * 400;
                    const yMean = 260 - clamp((b.obsMean - TRAIN_MIN) / Math.max(1e-12, TRAIN_MAX - TRAIN_MIN), 0, 1) * 200;
                    const y25 = 260 - clamp((b.obsQ25 - TRAIN_MIN) / Math.max(1e-12, TRAIN_MAX - TRAIN_MIN), 0, 1) * 200;
                    const y75 = 260 - clamp((b.obsQ75 - TRAIN_MIN) / Math.max(1e-12, TRAIN_MAX - TRAIN_MIN), 0, 1) * 200;
                    return (
                      <g key={i}>
                        <line x1={x} y1={y25} x2={x} y2={y75} stroke="#94a3b8" strokeWidth="1" opacity={0.8} />
                        <circle cx={x} cy={yMean} r={3.2} fill="#10b981" fillOpacity="0.9" />
                      </g>
                    );
                  })}

                  <text x="270" y="32" textAnchor="middle" fill="#f1f5f9" fontSize="13" fontWeight="700">
                    Calibration (deciles): mean observed vs mean predicted
                  </text>
                  <text x="270" y="48" textAnchor="middle" fill="#94a3b8" fontSize="10">
                    Vertical bars: observed IQR within each predicted bin
                  </text>

                  <text x="270" y="276" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="700">
                    Mean predicted Z (bin)
                  </text>
                  <text x="30" y="160" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="700" transform="rotate(-90 30 160)">
                    Mean observed Z (bin)
                  </text>
                </svg>

                {/* (C) Residual diagnostic: residual vs predicted */}
                <svg viewBox="0 0 500 260" className="validation-chart sd-svg sd-svg--h240">
                  <line x1="70" y1="200" x2="470" y2="200" stroke="#334155" strokeWidth="2" />
                  <line x1="70" y1="60" x2="70" y2="240" stroke="#334155" strokeWidth="2" />
                  <line x1="70" y1="150" x2="470" y2="150" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4,4" opacity={0.8} />

                  {validation.points.map((p, i) => {
                    const x = 70 + clamp((p.pred - TRAIN_MIN) / Math.max(1e-12, TRAIN_MAX - TRAIN_MIN), 0, 1) * 400;
                    const r = clamp(p.resid, -0.5, 0.5);
                    const y = 150 - (r / 0.5) * 90;
                    return <circle key={i} cx={x} cy={y} r={2.3} fill="#3b82f6" fillOpacity="0.55" stroke="#3b82f6" strokeWidth="0.4" />;
                  })}

                  <text x="270" y="32" textAnchor="middle" fill="#f1f5f9" fontSize="13" fontWeight="700">
                    Residuals: e = Z_obs − Z_hat
                  </text>
                  <text x="270" y="48" textAnchor="middle" fill="#94a3b8" fontSize="10">
                    mean(e) = {fmt(validation.residMean, 3)}, sd(e) = {fmt(validation.residStd, 3)}
                  </text>

                  <text x="270" y="256" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="700">
                    Predicted Z
                  </text>
                  <text x="30" y="150" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="700" transform="rotate(-90 30 150)">
                    Residual
                  </text>
                </svg>

                <div className="methodology-note">
                  <strong>How to read:</strong> The calibration plot tests whether predicted probabilities are well-calibrated.
                  Systematic deviation from the diagonal indicates bias; wide IQR bars indicate heterogeneity not captured by the covariates.
                </div>

                <div className="sd-ztable-card">
                  <div className="sd-ztable-head">
                    <div>
                      <div className="sd-ztable-title">Predicted Z vs Observed Z — Table</div>
                      <div className="sd-ztable-subtitle">
                        Observed Z is the panel outcome mapped into the training band ({TRAIN_MIN}…{TRAIN_MAX}); Predicted Z is calculateModel output.
                      </div>
                    </div>
                    <div className="sd-ztable-meta">Rows shown: {zTableRows.length} / {validation.points.length}</div>
                  </div>

                  <div className="sd-ztable-controls">
                    <label className="sd-ztable-control">
                      <span>Country</span>
                      <select value={zTableIso3} onChange={(e) => setZTableIso3(e.target.value)}>
                        <option value="ALL">All</option>
                        {zTableCountries.map((c) => (
                          <option key={c.iso3} value={c.iso3}>
                            {c.country} ({c.iso3})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="sd-ztable-control">
                      <span>Sort</span>
                      <select value={zTableSort} onChange={(e) => setZTableSort(e.target.value as typeof zTableSort)}>
                        <option value="abs">Largest |error|</option>
                        <option value="year">Year (asc)</option>
                        <option value="pred">Predicted Z (desc)</option>
                        <option value="obs">Observed Z (desc)</option>
                      </select>
                    </label>

                    <label className="sd-ztable-control">
                      <span>Limit</span>
                      <select value={String(zTableLimit)} onChange={(e) => setZTableLimit(Number(e.target.value))}>
                        <option value="100">100</option>
                        <option value="200">200</option>
                        <option value="500">500</option>
                        <option value="1000">1000</option>
                        <option value="2000">2000</option>
                      </select>
                    </label>
                  </div>

                  <div className="sd-ztable-scroll" role="region" aria-label="Predicted vs observed Z table">
                    <table className="sd-ztable">
                      <thead>
                        <tr>
                          <th>Country</th>
                          <th>ISO3</th>
                          <th>Year</th>
                          <th className="sd-ztable-num">Z_obs</th>
                          <th className="sd-ztable-num">Z_hat</th>
                          <th className="sd-ztable-num">Error (obs−hat)</th>
                          <th className="sd-ztable-num">|Error|</th>
                        </tr>
                      </thead>
                      <tbody>
                        {zTableRows.map((r, idx) => (
                          <tr key={`${r.iso3}-${r.year}-${idx}`}>
                            <td>{r.country}</td>
                            <td>{r.iso3}</td>
                            <td>{r.year}</td>
                            <td className="sd-ztable-num">{fmt(r.obs, 4)}</td>
                            <td className="sd-ztable-num">{fmt(r.pred, 4)}</td>
                            <td className={`sd-ztable-num ${r.resid >= 0 ? 'sd-ztable-pos' : 'sd-ztable-neg'}`}>{fmt(r.resid, 4)}</td>
                            <td className="sd-ztable-num">{fmt(Math.abs(r.resid), 4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="coefficients-visualization-card">
            <h4 className="viz-title">6.5 Model-Implied Sensitivity Scenarios</h4>
            <p className="viz-subtitle">Illustrative model-implied behavior: Z vs E_std for selected S_std levels (exploratory scenario)</p>

            <svg viewBox="0 0 720 320" className="validation-chart sd-svg sd-svg--h290">
              <text x="360" y="18" textAnchor="middle" fill="#f1f5f9" fontSize="12" fontWeight={700}>
                Model-implied scenario: Z sensitivity to E_std at varying S_std levels (illustrative)
              </text>

              <line x1="70" y1="260" x2="680" y2="260" stroke="#334155" strokeWidth="2" />
              <line x1="70" y1="50" x2="70" y2="260" stroke="#334155" strokeWidth="2" />

              {[TRAIN_MIN, 0.25, 0.5, 0.75, TRAIN_MAX].map((val) => (
                <g key={val}>
                  <line x1="64" y1={260 - axisT(val) * 200} x2="70" y2={260 - axisT(val) * 200} stroke="#64748b" strokeWidth="1" />
                  <text x="58" y={260 - axisT(val) * 200 + 4} textAnchor="end" fill="#94a3b8" fontSize="9">
                    {fmtBandTick(val, 2)}
                  </text>
                  <line x1="70" y1={260 - axisT(val) * 200} x2="680" y2={260 - axisT(val) * 200} stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2,2" />
                </g>
              ))}

              {(() => {
                const { es, eMin, eMax, curves } = scenarioSlices;
                const w = 610;
                const mapX = (e: number) => 70 + ((e - eMin) / Math.max(1e-9, eMax - eMin)) * w;
                const mapY = (z: number) => 260 - axisT(z) * 200;
                const dashes = ['0', '6,3', '2,3'];

                return (
                  <>
                    {curves.map((c, idx) => {
                      const d = c.zs
                        .map((z, i) => `${i === 0 ? 'M' : 'L'} ${mapX(es[i]).toFixed(1)} ${mapY(z).toFixed(1)}`)
                        .join(' ');
                      const labelY = mapY(c.zs[c.zs.length - 1] ?? 0);
                      return (
                        <g key={c.s}>
                          <path d={d} stroke="#10b981" strokeWidth={2.6} fill="none" opacity={0.9 - idx * 0.18} strokeDasharray={dashes[idx] ?? '0'} />
                          <text x="686" y={labelY + 4} fill="#94a3b8" fontSize="9" textAnchor="start">
                            S={fmt(c.s, 1)}
                          </text>
                        </g>
                      );
                    })}

                    {[eMin, 0.5, eMax].map((e) => {
                      const x = mapX(e);
                      return (
                        <g key={e}>
                          <line x1={x} y1={260} x2={x} y2={266} stroke="#64748b" strokeWidth="1" />
                          <text x={x} y={284} textAnchor="middle" fill="#94a3b8" fontSize="9">
                            {fmt(e, 1)}
                          </text>
                        </g>
                      );
                    })}
                  </>
                );
              })()}

              <text x="375" y="308" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight={700}>
                E_std
              </text>
              <text x="18" y="155" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight={700} transform="rotate(-90 18 155)">
                Z
              </text>
            </svg>

            <div className="methodology-note">
              <strong>Caption:</strong> Higher E/S shifts Φ downward. The implied reduction in Z is largest when the operating point is near mid-range sensitivity (Z≈0.5).
            </div>
          </div>

          <div className="coefficients-visualization-card">
            <h4 className="viz-title">6.6 Synthesis & Conclusions</h4>
            <p className="viz-subtitle">System dynamics as regimes + implications (no new charts)</p>

            <div className="methodology-note">
              <p>
                The documentation evaluates a fixed production mapping (no refit in the UI). Section 6 adds the dynamical interpretation:
                where the model-implied mapping is most responsive, where it saturates, and how parameter shifts alter estimated regimes.
              </p>
            </div>

            <div className="methodology-note">
              <strong>Scientific takeaways</strong>
              <ul className="model-features">
                <li>Sensitivity concentrates near $Z\approx 0.5$; “tipping” narratives are formally about operating near this mid-range.</li>
                <li>
                  Amplifiers shift $\Phi$ upward; their marginal impact on $Z$ is largest in the critical regime and smallest in saturated regimes.
                </li>
                <li>Suppressors (E,S,R) reshape regimes by lowering $\Phi$ (and thus $Z$), effectively flattening the response curve.</li>
                <li>
                  Structural base (X_safe, Y_safe) sets the baseline operating point; the model implies that modifiers (E,S,R,T,M) shape whether the system is positioned near the
                  critical regime (mid-range sensitivity) under the fitted surface.
                </li>
              </ul>
            </div>

            <div className="methodology-note">
              <strong>Model-Implied Scenario Interpretation</strong>
              <ul className="model-features">
                <li>Targeting buffers (E,S,R) is most efficient when a society is near the critical regime (mid-range Z), not deep in saturation.</li>
                <li>
                  The model suggests that under conditions where baseline structure places the system near mid-range sensitivity, parameter adjustments to T or M would have larger estimated effects. This is model-implied behavior under the fitted surface, not empirical evidence of what interventions would work in practice.
                </li>
                <li>Monitoring should focus on early regime shifts (movement toward Z≈0.5), not only on extreme outcomes.</li>
              </ul>
            </div>
          </div>

          <div className="coefficients-visualization-card">
            <h4 className="viz-title">6.6b Summary View (Isometric Surface; Reverse Angle)</h4>
            <p className="viz-subtitle">Same surface as 6.1c, rendered from the opposite side for readability</p>

            <svg viewBox="0 0 720 440" className="validation-chart sd-svg sd-svg--h460">
              {(() => {
                const { phiMin, phiMax, sMin, sMax, nPhi, nS, phis, shifts, grid, baseShift } = mainFunctionSurface3D;

                const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
                const clampExpArg = (x: number) => Math.max(-50, Math.min(50, x));
                const logistic = (x: number) => 1 / (1 + Math.exp(-clampExpArg(x)));

                // Theme-consistent palette (matches 6.1b heatmap)
                const paletteHex = ['#0f172a', '#1e293b', '#334155', '#475569', '#94a3b8', '#e2e8f0', '#f4d03f'];
                const hexToRgb = (hex: string) => {
                  const clean = hex.replace('#', '');
                  const r = parseInt(clean.slice(0, 2), 16);
                  const g = parseInt(clean.slice(2, 4), 16);
                  const b = parseInt(clean.slice(4, 6), 16);
                  return { r, g, b };
                };
                const palette = paletteHex.map(hexToRgb);
                const colorForZ = (z: number) => {
                  const t = axisT(z);
                  const scaled = t * (palette.length - 1);
                  const idx = Math.min(palette.length - 2, Math.max(0, Math.floor(scaled)));
                  const u = scaled - idx;
                  const a = palette[idx]!;
                  const b = palette[idx + 1]!;
                  const r = Math.round(lerp(a.r, b.r, u));
                  const g = Math.round(lerp(a.g, b.g, u));
                  const bb = Math.round(lerp(a.b, b.b, u));
                  return `rgb(${r},${g},${bb})`;
                };

                // Panel layout (slightly larger to make the surface read better)
                const x0 = 34;
                const y0 = 32;
                const w = 640;
                const h = 380;
                const pad = 14;

                // Colorbar layout (consistent with 6.1b)
                const cbarX = x0 + w + 12;
                const cbarY = y0 + 10;
                const cbarW = 14;
                const cbarH = h - 20;

                const legendY = y0 + h + 12;

                // Isometric projection in a normalized cube (reverse angle)
                // xN: Φ axis, yN: ln(B/k) axis, zN: height Z
                const project = (xN: number, yN: number, zN: number) => {
                  // True opposite isometric viewpoint (rotate 180° in the x–y plane):
                  // keep the same aspect/scale, but flip the (x+y) term so the surface is seen from the other side.
                  const u = -(xN - yN);
                  const v = -(xN + yN) * 0.55 - zN * 1.0;
                  return { u, v };
                };

                const phiToXN = (phi: number) => ((phi - (phiMin + phiMax) / 2) / (phiMax - phiMin)) * 2;
                const sToYN = (s: number) => ((s - (sMin + sMax) / 2) / (sMax - sMin)) * 2;
                const zToZN = (z: number) => (axisT(z) - 0.5) * 2;

                // Compute projected bounds from all vertices to auto-fit
                let uMin = Infinity;
                let uMax = -Infinity;
                let vMin = Infinity;
                let vMax = -Infinity;
                for (let j = 0; j < nS; j++) {
                  for (let i = 0; i < nPhi; i++) {
                    const phi = phis[i]!;
                    const s = shifts[j]!;
                    const z = grid[j * nPhi + i] ?? 0;
                    const { u, v } = project(phiToXN(phi), sToYN(s), zToZN(z));
                    uMin = Math.min(uMin, u);
                    uMax = Math.max(uMax, u);
                    vMin = Math.min(vMin, v);
                    vMax = Math.max(vMax, v);
                  }
                }
                const uSpan = Math.max(1e-6, uMax - uMin);
                const vSpan = Math.max(1e-6, vMax - vMin);
                const scale = Math.min((w - 2 * pad) / uSpan, (h - 2 * pad) / vSpan);

                // Center the fitted projection inside the panel (do NOT change the math; layout only)
                const innerW = w - 2 * pad;
                const innerH = h - 2 * pad;
                const extraX = innerW - uSpan * scale;
                const extraY = innerH - vSpan * scale;

                // 0 = left/top, 0.5 = centered, 1 = right/bottom
                const xAlign = 0.5;
                const yAlign = 0.5;

                const offsetX = x0 + pad + extraX * xAlign;
                const offsetY = y0 + pad + extraY * yAlign;

                const X = (u: number) => offsetX + (u - uMin) * scale;
                const Y = (v: number) => offsetY + (v - vMin) * scale;

                // Simple Lambert shading (keeps the same palette, improves 3D depth perception)
                const shadeRgb = (rgb: { r: number; g: number; b: number }, intensity01: number) => {
                  const t = clamp01(intensity01);
                  const k = 0.70 + 0.35 * t;
                  const r = Math.max(0, Math.min(255, Math.round(rgb.r * k)));
                  const g = Math.max(0, Math.min(255, Math.round(rgb.g * k)));
                  const b = Math.max(0, Math.min(255, Math.round(rgb.b * k)));
                  return `rgb(${r},${g},${b})`;
                };
                const normalize3 = (x: number, y: number, z: number) => {
                  const m = Math.sqrt(x * x + y * y + z * z) || 1;
                  return { x: x / m, y: y / m, z: z / m };
                };
                const dot3 = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => a.x * b.x + a.y * b.y + a.z * b.z;
                const cross3 = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => ({
                  x: a.y * b.z - a.z * b.y,
                  y: a.z * b.x - a.x * b.z,
                  z: a.x * b.y - a.y * b.x,
                });
                const light = normalize3(0.35, 0.85, 0.40);

                // Painter's algorithm order for quads
                const cells: Array<{ key: string; depth: number; pts: string; fill: string }> = [];
                for (let j = 0; j < nS - 1; j++) {
                  for (let i = 0; i < nPhi - 1; i++) {
                    const phiA = phis[i]!;
                    const phiB = phis[i + 1]!;
                    const sA = shifts[j]!;
                    const sB = shifts[j + 1]!;

                    const z00 = grid[j * nPhi + i] ?? 0;
                    const z10 = grid[j * nPhi + (i + 1)] ?? 0;
                    const z01 = grid[(j + 1) * nPhi + i] ?? 0;
                    const z11 = grid[(j + 1) * nPhi + (i + 1)] ?? 0;

                    // 3D points in normalized model-space for shading only
                    const p00m = { x: phiToXN(phiA), y: sToYN(sA), z: zToZN(z00) };
                    const p10m = { x: phiToXN(phiB), y: sToYN(sA), z: zToZN(z10) };
                    const p01m = { x: phiToXN(phiA), y: sToYN(sB), z: zToZN(z01) };
                    const e1 = { x: p10m.x - p00m.x, y: p10m.y - p00m.y, z: p10m.z - p00m.z };
                    const e2 = { x: p01m.x - p00m.x, y: p01m.y - p00m.y, z: p01m.z - p00m.z };
                    const nRaw = cross3(e1, e2);
                    const nrm = normalize3(nRaw.x, nRaw.y, nRaw.z);
                    const lambert = clamp01(0.15 + 0.85 * dot3(nrm, light));

                    const p00 = project(phiToXN(phiA), sToYN(sA), zToZN(z00));
                    const p10 = project(phiToXN(phiB), sToYN(sA), zToZN(z10));
                    const p11 = project(phiToXN(phiB), sToYN(sB), zToZN(z11));
                    const p01 = project(phiToXN(phiA), sToYN(sB), zToZN(z01));

                    const pts = `${X(p00.u).toFixed(1)},${Y(p00.v).toFixed(1)} ${X(p10.u).toFixed(1)},${Y(p10.v).toFixed(1)} ${X(p11.u).toFixed(1)},${Y(p11.v).toFixed(1)} ${X(p01.u).toFixed(1)},${Y(p01.v).toFixed(1)}`;
                    const zAvg = (z00 + z10 + z01 + z11) / 4;
                    // Reverse painter ordering to match the opposite viewpoint
                    const depth = -((i + j) + zAvg * 0.25);
                    // Shade the palette color (keeps the same “language” as the 2D heatmap but reads 3D)
                    const baseRgb = (() => {
                      const t = axisT(zAvg);
                      const scaled = t * (palette.length - 1);
                      const idx = Math.min(palette.length - 2, Math.max(0, Math.floor(scaled)));
                      const u = scaled - idx;
                      const a = palette[idx]!;
                      const b = palette[idx + 1]!;
                      return {
                        r: Math.round(lerp(a.r, b.r, u)),
                        g: Math.round(lerp(a.g, b.g, u)),
                        b: Math.round(lerp(a.b, b.b, u)),
                      };
                    })();
                    cells.push({ key: `${j}-${i}`, depth, pts, fill: shadeRgb(baseRgb, lambert) });
                  }
                }
                cells.sort((a, b) => a.depth - b.depth);

                // Wire grid (sparser + subtle) for readability
                const gridLines: Array<{ d: string; key: string }> = [];
                const stepPhi = 6;
                const stepS = 3;
                for (let j = 0; j < nS; j += stepS) {
                  const parts: string[] = [];
                  for (let i = 0; i < nPhi; i++) {
                    const phi = phis[i]!;
                    const s = shifts[j]!;
                    const z = grid[j * nPhi + i] ?? 0;
                    const p = project(phiToXN(phi), sToYN(s), zToZN(z));
                    parts.push(`${i === 0 ? 'M' : 'L'} ${X(p.u).toFixed(1)} ${Y(p.v).toFixed(1)}`);
                  }
                  gridLines.push({ key: `s-${j}`, d: parts.join(' ') });
                }
                for (let i = 0; i < nPhi; i += stepPhi) {
                  const parts: string[] = [];
                  for (let j = 0; j < nS; j++) {
                    const phi = phis[i]!;
                    const s = shifts[j]!;
                    const z = grid[j * nPhi + i] ?? 0;
                    const p = project(phiToXN(phi), sToYN(s), zToZN(z));
                    parts.push(`${j === 0 ? 'M' : 'L'} ${X(p.u).toFixed(1)} ${Y(p.v).toFixed(1)}`);
                  }
                  gridLines.push({ key: `phi-${i}`, d: parts.join(' ') });
                }

                // Ridge line: Z=0.5 => Φ + s = 0
                const ridgePath = (() => {
                  const pts: string[] = [];
                  const steps = 220;
                  for (let t = 0; t <= steps; t++) {
                    const phi = phiMin + (t * (phiMax - phiMin)) / steps;
                    const s = -phi;
                    if (s < sMin || s > sMax) continue;
                    const p = project(phiToXN(phi), sToYN(s), zToZN(0.5));
                    pts.push(`${pts.length === 0 ? 'M' : 'L'} ${X(p.u).toFixed(1)} ${Y(p.v).toFixed(1)}`);
                  }
                  return pts.join(' ');
                })();

                // Baseline slice at ln(B/k)=baseShift
                const baselineS = Math.max(sMin, Math.min(sMax, baseShift));
                const baselinePath = (() => {
                  const pts: string[] = [];
                  const steps = 220;
                  for (let t = 0; t <= steps; t++) {
                    const phi = phiMin + (t * (phiMax - phiMin)) / steps;
                    const z = logistic(phi + baselineS);
                    const p = project(phiToXN(phi), sToYN(baselineS), zToZN(z));
                    pts.push(`${pts.length === 0 ? 'M' : 'L'} ${X(p.u).toFixed(1)} ${Y(p.v).toFixed(1)}`);
                  }
                  return pts.join(' ');
                })();

                // Axis label anchors (project cube corners)
                const corner = (phi: number, s: number, z: number) => {
                  const p = project(phiToXN(phi), sToYN(s), zToZN(z));
                  return { x: X(p.u), y: Y(p.v) };
                };
                const origin = corner(phiMin, sMin, 0);
                const phiEnd = corner(phiMax, sMin, 0);
                const sEnd = corner(phiMin, sMax, 0);
                const zEnd = corner(phiMin, sMin, 1);

                const baseA = corner(phiMin, sMin, 0);
                const baseB = corner(phiMax, sMin, 0);
                const baseC = corner(phiMax, sMax, 0);
                const baseD = corner(phiMin, sMax, 0);

                const tickPhi = [-6, -3, 0, 3, 6];
                const tickS = [-3, -1.5, 0, 1.5, 3];

                return (
                  <>
                    <text x="360" y="20" textAnchor="middle" fill="#f1f5f9" fontSize="12" fontWeight={700}>
                      Reverse view (isometric): Z = σ(Φ + ln(B/k))
                    </text>

                    <rect x={x0} y={y0} width={w} height={h} fill="#0b1220" stroke="#334155" strokeWidth="2" />

                    {/* Base plane outline (z=0) */}
                    <path
                      d={`M ${baseA.x.toFixed(1)} ${baseA.y.toFixed(1)} L ${baseB.x.toFixed(1)} ${baseB.y.toFixed(1)} L ${baseC.x.toFixed(1)} ${baseC.y.toFixed(1)} L ${baseD.x.toFixed(1)} ${baseD.y.toFixed(1)} Z`}
                      fill="none"
                      stroke="#334155"
                      strokeWidth="1.5"
                      opacity="0.85"
                    />

                    {/* Surface fill */}
                    <g opacity="0.98">
                      {cells.map((c) => (
                        <polygon key={c.key} points={c.pts} fill={c.fill} stroke="none" />
                      ))}
                    </g>

                    {/* Subtle wire grid */}
                    <g opacity="0.55">
                      {gridLines.map((gl) => (
                        <path key={gl.key} d={gl.d} stroke="#1e293b" strokeWidth="1" fill="none" />
                      ))}
                    </g>

                    {/* Ridge + baseline overlays */}
                    <path d={ridgePath} stroke="#f4d03f" strokeWidth="2.5" fill="none" opacity="0.95" />
                    <path d={baselinePath} stroke="#10b981" strokeWidth="2.5" fill="none" opacity="0.95" />

                    {/* Minimal axes */}
                    <line x1={origin.x} y1={origin.y} x2={phiEnd.x} y2={phiEnd.y} stroke="#94a3b8" strokeWidth="1.5" opacity="0.8" />
                    <line x1={origin.x} y1={origin.y} x2={sEnd.x} y2={sEnd.y} stroke="#94a3b8" strokeWidth="1.5" opacity="0.8" />
                    <line x1={origin.x} y1={origin.y} x2={zEnd.x} y2={zEnd.y} stroke="#94a3b8" strokeWidth="1.5" opacity="0.8" />

                    {/* Φ ticks */}
                    {tickPhi.map((val) => {
                      const t = (val - phiMin) / (phiMax - phiMin);
                      const p0 = corner(phiMin + t * (phiMax - phiMin), sMin, 0);
                      const p1 = { x: p0.x, y: p0.y + 5 };
                      return (
                        <g key={`tphi-r-${val}`}>
                          <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#64748b" strokeWidth="1" />
                          <text x={p1.x} y={p1.y + 12} textAnchor="middle" fill="#cbd5e1" fontSize="10">
                            {val}
                          </text>
                        </g>
                      );
                    })}

                    {/* ln(B/k) ticks */}
                    {tickS.map((val) => {
                      const t = (val - sMin) / (sMax - sMin);
                      const p0 = corner(phiMin, sMin + t * (sMax - sMin), 0);
                      const p1 = { x: p0.x - 5, y: p0.y };
                      return (
                        <g key={`ts-r-${val}`}>
                          <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#64748b" strokeWidth="1" />
                          <text x={p1.x - 3} y={p1.y + 3} textAnchor="end" fill="#cbd5e1" fontSize="10">
                            {val}
                          </text>
                        </g>
                      );
                    })}

                    <text x={phiEnd.x + 10} y={phiEnd.y + 4} fill="#cbd5e1" fontSize="11" fontWeight={700}>
                      Φ
                    </text>
                    <text x={sEnd.x - 6} y={sEnd.y - 8} fill="#cbd5e1" fontSize="11" fontWeight={700}>
                      ln(B/k)
                    </text>
                    <text x={zEnd.x - 10} y={zEnd.y - 10} fill="#cbd5e1" fontSize="11" fontWeight={700}>
                      Z
                    </text>

                    {/* Z colorbar */}
                    <rect x={cbarX} y={cbarY} width={cbarW} height={cbarH} fill="#0b1220" stroke="#334155" strokeWidth="1.5" />
                    {Array.from({ length: 40 }, (_, i) => {
                      const t = i / 39;
                      const z = TRAIN_MIN + (1 - t) * TRAIN_SPAN;
                      const yy = cbarY + t * cbarH;
                      return <rect key={i} x={cbarX + 1} y={yy} width={cbarW - 2} height={cbarH / 40 + 0.6} fill={colorForZ(z)} />;
                    })}
                    {[TRAIN_MIN, 0.5, TRAIN_MAX].map((val) => {
                      const yy = cbarY + (1 - axisT(val)) * cbarH;
                      return (
                        <g key={`cbar-r-${val}`}>
                          <line x1={cbarX + cbarW} y1={yy} x2={cbarX + cbarW + 6} y2={yy} stroke="#94a3b8" strokeWidth="1" />
                          <text x={cbarX + cbarW + 9} y={yy + 3} fill="#cbd5e1" fontSize="10">
                            {fmtBandTick(val, 1)}
                          </text>
                        </g>
                      );
                    })}
                    <text x={cbarX + cbarW / 2} y={cbarY - 8} textAnchor="middle" fill="#cbd5e1" fontSize="10" fontWeight={700}>
                      Z
                    </text>

                    {/* Keep legend aligned to the panel rather than a hard-coded x */}
                    <g transform={`translate(${(x0 + 18).toFixed(1)}, ${legendY.toFixed(1)})`}>
                      <rect x="0" y="0" width="12" height="12" fill="#f4d03f" opacity="0.95" />
                      <text x="18" y="10" fill="#cbd5e1" fontSize="10">
                        ridge Z=0.5
                      </text>
                      <rect x="110" y="0" width="12" height="12" fill="#10b981" opacity="0.95" />
                      <text x="128" y="10" fill="#cbd5e1" fontSize="10">
                        baseline ln(B/k)
                      </text>
                    </g>
                  </>
                );
              })()}
            </svg>

            <div className="methodology-note">
              <strong>Scientific interpretation (same mapping; different viewpoint):</strong>
              <ul className="model-features">
                <li>
                  The surface is exactly <InlineMath math={'Z = \\sigma(\\Phi + s)'} /> where <InlineMath math={'s := \\ln(B/k)'} /> and{' '}
                  <InlineMath math={'B = X_{safe}^{\\alpha} Y_{safe}^{\\beta}'} />. The reverse angle changes only the projection, not the function.
                </li>
                <li>
                  The gold ridge is the analytic threshold <InlineMath math={'Z = 0.5 \\iff \\Phi + s = 0'} />. Crossing it corresponds to moving between
                  low- and high-belief regimes.
                </li>
                <li>
                  Sensitivity is maximal at mid-range: <InlineMath math={'\\frac{\\partial Z}{\\partial \\Phi} = \\frac{\\partial Z}{\\partial s} = Z(1-Z)'} />,
                  peaking at <InlineMath math={'Z = 0.5'} /> and collapsing toward 0 as <InlineMath math={'Z \\to 0'} /> or{' '}
                  <InlineMath math={'Z \\to 1'} /> (saturation).
                </li>
                <li>
                  The green curve fixes <InlineMath math={'s = \\ln(B_0/k)'} /> (current structural baseline) and shows how changing{' '}
                  <InlineMath math={'\\Phi'} /> alone moves the system across regimes; changing structure shifts <InlineMath math={'s'} /> and translates the
                  whole slice relative to the ridge.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="section-end-indicator">
        <div className="end-line"></div>
        <div className="end-badge">
          <span className="end-text">End of Section 6</span>
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
      title="System Dynamics of Belief Emergence"
      sectionIndex="Section 6"
      subtitle="Temporal behavior and phase transitions in collective belief systems"
      description="Regime maps, validation diagnostics, and a compact dynamical synthesis"
    >
      {content}
    </SectionTemplate>
  );
};

// 🔒 COMPONENT PROTECTION ENFORCEMENT
// Freeze the component to prevent runtime modifications
Object.freeze(SystemDynamicsSection);
Object.freeze(SystemDynamicsSection.prototype);

// Export protection validation
if (typeof SystemDynamicsSection !== 'function') {
  throw new Error('PROTECTION VIOLATION: SystemDynamicsSection component integrity compromised');
}

export default SystemDynamicsSection;
