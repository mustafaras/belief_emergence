import type { BeliefParameters } from '../types';
import {
  INTERACTION_TERMS,
  MODIFIER_STANDARDIZATION,
  OPTIMIZED_SIGMOID_COEFFICIENTS,
  OPTIMIZED_STRUCTURAL_PARAMS,
  QUADRATIC_TERMS,
} from '../data/feCoefficients';
import { 
  PANEL_X_MIN,
  PANEL_X_MAX,
  PANEL_Y_MIN,
  PANEL_Y_MAX,
  STRUCTURAL_MIN,
  STRUCTURAL_MAX,
} from './modelContract';

/**
 * Comprehensive debug payload for troubleshooting model discrepancies.
 * Provides full transparency into standardization, term-by-term contributions,
 * and intermediate sigmoid computation values.
 */
export interface PanelDatasetStats {
  meanX: number;
  stdX: number;
  meanY: number;
  stdY: number;
  n: number;
  source: string;
  method: 'sample' | 'population';
}

export interface DebugPayload {
  rawInputs: {
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
  
  standardizedInputs: {
    X_std: number;
    Y_std: number;
    C_std: number;
    M_std: number;
    T_std: number;
    D_std: number;
    G_std: number;
    E_std: number;
    S_std: number;
    R_std: number;
  };
  
  standardizationStats?: {
    means: Record<string, number>;
    stds: Record<string, number>;
    dataset?: PanelDatasetStats;
  };
  
  mainEffectTerms: Array<{
    name: string;
    coef: number;
    stdValue: number;
    contribution: number;
  }>;
  
  mainEffectsSum: number;
  
  interactionTerms: Array<{
    name: string;
    formula: string;
    value: number;
  }>;
  
  interactionsSum: number;
  
  quadraticTerms: Array<{
    name: string;
    formula: string;
    value: number;
  }>;
  
  quadraticsSum: number;
  
  phiBreakdown: {
    baseline: number;
    mainEffects: number;
    interactions: number;
    quadratic: number;
    phi: number;  // Sum of above 4
  };
  
  zComputation: {
    numerator: number;      // X^α * Y^β * e^phi
    denominator: number;    // numerator + k
    Z: number;              // numerator / denominator
  };
}

export interface ModelCalculationResult {
  phi: number;
  Z: number;
  phiComponents: {
    baseline: number; // Fixed φ₀ baseline from OPTIMIZED_STRUCTURAL_PARAMS
    mainEffects: number;
    interactions: number;
    quadratic: number;
  };
  mainEffectTerms?: Array<{
    index: number;              // 1-8
    name: string;               // e.g., 'c1_Culture'
    label: string;              // Human-readable label
    coef: number;               // Signed coefficient
    stdValue: number;           // Z-scored modifier value
    contribution: number;       // coef * stdValue
    variable: string;           // Single letter: C, M, T, D, G, E, S, R
    isAmplifier: boolean;       // true if coef > 0, false if coef < 0
  }>;
  interactionTerms?: Array<{
    index: number;              // 1-7
    name: string;               // e.g., 'Y_x_R'
    formula: string;            // e.g., 'Y_std * R_std'
    coef: number;               // Signed interaction coefficient
    factor1: { name: string; stdValue: number };
    factor2: { name: string; stdValue: number };
    value: number;              // coef * factor1.stdValue * factor2.stdValue
  }>;
  quadraticTerms?: Array<{
    index: number;              // 1-4
    name: string;               // e.g., 'C_squared'
    formula: string;            // e.g., 'C_std^2'
    coef: number;               // Signed quadratic coefficient
    factor: { name: string; stdValue: number };
    value: number;              // coef * (factor.stdValue ** 2)
  }>;
  derivedMetrics?: {
    phiMagnitude: number;      // |phi|
    netEffect: number;         // mainEffects + interactions + quadratic
    fieldStrength: number;     // sqrt(phi^2 + Z^2)
  };
  debug?: DebugPayload;
}

type StandardizedModifiers = {
  C_std: number;
  M_std: number;
  T_std: number;
  D_std: number;
  G_std: number;
  E_std: number;
  S_std: number;
  R_std: number;
};

// --- Structural normalization helpers (X, Y) ---
//
// NORMALIZATION STRATEGY: Clipping to [0.0001, 0.9999]
// ===============================================
//
// Rationale: The model computes fractional powers X^α and Y^β (α=β=0.3 PRODUCTION).
// To avoid undefined behavior (e.g., negative bases with fractional exponents),
// we enforce numerical bounds: map into and clip to an interior open-interval-safe band.
//
// Domain mapping:
//   - Panel X range: [0.4, 0.9] (urbanization; directly from data)
//   - Panel Y range: [-1.5, 3.5] (inequality/Gini residuals; from panel data)
//   - UI slider X range: [0, 1] (intuitive 0-100% urbanization)
//   - UI slider Y range: [-2, 4] (extended for exploration; presets may load values here)
//   - Clipping bounds: [0.0001, 0.9999] (ensures X^α, Y^β well-defined and stable, never exactly 0)
//
// Validation:
// The TypeScript implementation ensures consistent results with training pipeline.
// Run `npm run test:run` to verify calculateModel() behavior against test suite.
//
// Warnings & Extrapolation:
// App.tsx monitors slider values against panel bounds and logs warnings when
// parameters fall outside [PANEL_MIN, PANEL_MAX]. Clipping then ensures stability.
// See src/App.tsx ~line 105 for runtime validation logic.

// NOTE: Structural normalization helpers (panel X/Y -> interior safe band) live in src/utils/modelContract.ts.

function standardizeValue(value: number, modifierKey: string): number {
  const stats = MODIFIER_STANDARDIZATION[modifierKey];
  if (!stats) return value;
  return (value - stats.mean) / stats.std;
}

function standardizeModifiers(
  params: BeliefParameters,
  modifiersAreStandardized: boolean | undefined
): StandardizedModifiers {
  if (modifiersAreStandardized) {
    return {
      C_std: params.C,
      M_std: params.M,
      T_std: params.T,
      D_std: params.D,
      G_std: params.G,
      E_std: params.E,
      S_std: params.S,
      R_std: params.R,
    };
  }

  return {
    C_std: standardizeValue(params.C, 'C_cultural_intensity'),
    M_std: standardizeValue(params.M, 'M_media_environment'),
    T_std: standardizeValue(params.T, 'T_trauma_shock'),
    D_std: standardizeValue(params.D, 'D_social_atomization'),
    G_std: standardizeValue(params.G, 'G_redistribution_capacity'),
    E_std: standardizeValue(params.E, 'E_education_capacity'),
    S_std: standardizeValue(params.S, 'S_social_support'),
    R_std: standardizeValue(params.R, 'R_welfare_capacity'),
  };
}

function buildMainEffectTerms(
  modifiers: StandardizedModifiers,
  coefficeintOverrides?: {
    c1?: number;
    c2?: number;
    c3?: number;
    c4?: number;
    c5?: number;
    c6?: number;
    c7?: number;
    c8?: number;
  }
) {
  const labelMap: Record<string, string> = {
    c1_Culture: 'Culture (Worldview Diversity)',
    c2_Media: 'Media (Environment)',
    c3_Trauma: 'Trauma (Shock Events)',
    c4_Atomization: 'Atomization (Social Fragmentation)',
    c5_Redistribution: 'Redistribution (Capacity)',
    c6_Education: 'Education (Capacity)',
    c7_SocialSupport: 'Social Support (Infrastructure)',
    c8_Welfare: 'Welfare (Capacity)',
  };

  const terms = [
    // Amplifier: positive coef → positive std lifts φ; negative std reduces φ magnitude
    { name: 'c1_Culture', variable: 'C', coef: coefficeintOverrides?.c1 ?? OPTIMIZED_SIGMOID_COEFFICIENTS.c1, stdValue: modifiers.C_std },
    // Suppressor: negative coef → positive std pushes φ down; negative std creates double-negative relief
    { name: 'c2_Media', variable: 'M', coef: coefficeintOverrides?.c2 ?? OPTIMIZED_SIGMOID_COEFFICIENTS.c2, stdValue: modifiers.M_std },
    // Amplifier
    { name: 'c3_Trauma', variable: 'T', coef: coefficeintOverrides?.c3 ?? OPTIMIZED_SIGMOID_COEFFICIENTS.c3, stdValue: modifiers.T_std },
    // Suppressor
    { name: 'c4_Atomization', variable: 'D', coef: coefficeintOverrides?.c4 ?? OPTIMIZED_SIGMOID_COEFFICIENTS.c4, stdValue: modifiers.D_std },
    // Amplifier
    { name: 'c5_Redistribution', variable: 'G', coef: coefficeintOverrides?.c5 ?? OPTIMIZED_SIGMOID_COEFFICIENTS.c5, stdValue: modifiers.G_std },
    // Suppressor (double-negative when std < 0 raises φ)
    { name: 'c6_Education', variable: 'E', coef: coefficeintOverrides?.c6 ?? OPTIMIZED_SIGMOID_COEFFICIENTS.c6, stdValue: modifiers.E_std },
    // Suppressor
    { name: 'c7_SocialSupport', variable: 'S', coef: coefficeintOverrides?.c7 ?? OPTIMIZED_SIGMOID_COEFFICIENTS.c7, stdValue: modifiers.S_std },
    // Amplifier
    { name: 'c8_Welfare', variable: 'R', coef: coefficeintOverrides?.c8 ?? OPTIMIZED_SIGMOID_COEFFICIENTS.c8, stdValue: modifiers.R_std },
  ];

  return terms.map((term, idx) => ({
    ...term,
    index: idx + 1,
    label: labelMap[term.name],
    isAmplifier: term.coef > 0,
    contribution: term.coef * term.stdValue,
  }));
}

function sumContributions(terms: Array<{ contribution: number }>): number {
  return terms.reduce((sum, term) => sum + term.contribution, 0);
}

function sumInteractions(terms: Array<{ value: number }>): number {
  return terms.reduce((sum, term) => sum + term.value, 0);
}

function sumQuadratics(terms: Array<{ value: number }>): number {
  return terms.reduce((sum, term) => sum + term.value, 0);
}

// Local helpers for structural normalization (preserve original behavior)
function normalizePanelXToStructural(X_raw: number): number {
  if (!Number.isFinite(X_raw)) return STRUCTURAL_MIN;
  const clamp01Local = (v: number) => Math.min(Math.max(v, 0), 1);
  const t = clamp01Local((X_raw - PANEL_X_MIN) / (PANEL_X_MAX - PANEL_X_MIN));
  return STRUCTURAL_MIN + t * (STRUCTURAL_MAX - STRUCTURAL_MIN);
}

function normalizePanelYToStructural(Y_raw: number): number {
  if (!Number.isFinite(Y_raw)) return STRUCTURAL_MIN;
  const clamp01Local = (v: number) => Math.min(Math.max(v, 0), 1);
  const t = clamp01Local((Y_raw - PANEL_Y_MIN) / (PANEL_Y_MAX - PANEL_Y_MIN));
  return STRUCTURAL_MIN + t * (STRUCTURAL_MAX - STRUCTURAL_MIN);
}

// Shared structural base calculator used by all components.
//
// X and Y are treated as raw panel‑like inputs and first mapped into
  // the compact structural domain [0.0001, 0.9999] (see normalizePanelXToStructural/normalizePanelYToStructural),
// then used in the sublinear power term X_safe^α · Y_safe^β.
// This mirrors the Python validator and training code, which normalize
// to an interior band and then clip to that range for numerical stability.
export function computeStructuralBase(
  X: number,
  Y: number,
  alpha: number,
  beta: number,
): number {
  const safeX = normalizePanelXToStructural(X);
  const safeY = normalizePanelYToStructural(Y);
  return Math.pow(safeX, alpha) * Math.pow(safeY, beta);
}

function buildInteractionTerms(
  modifiers: StandardizedModifiers,
  X_safe: number,
  Y_safe: number,
  coefficeintOverrides?: {
    c_yr?: number;
    c_tr?: number;
    c_xy?: number;
    c_cm?: number;
    c_es?: number;
    c_dt?: number;
    c_gr?: number;
  }
) {
  return [
    {
      index: 1,
      name: 'Y_x_R',
      formula: 'Y_safe * R_std',
      coef: coefficeintOverrides?.c_yr ?? INTERACTION_TERMS.c_yr,
      factor1: { name: 'Y_safe', stdValue: Y_safe },
      factor2: { name: 'R_std', stdValue: modifiers.R_std },
      value: (coefficeintOverrides?.c_yr ?? INTERACTION_TERMS.c_yr) * Y_safe * modifiers.R_std,
    },
    {
      index: 2,
      name: 'T_x_R',
      formula: 'T_std * R_std',
      coef: coefficeintOverrides?.c_tr ?? INTERACTION_TERMS.c_tr,
      factor1: { name: 'T_std', stdValue: modifiers.T_std },
      factor2: { name: 'R_std', stdValue: modifiers.R_std },
      value: (coefficeintOverrides?.c_tr ?? INTERACTION_TERMS.c_tr) * modifiers.T_std * modifiers.R_std,
    },
    {
      index: 3,
      name: 'X_x_Y',
      formula: 'X_safe * Y_safe',
      coef: coefficeintOverrides?.c_xy ?? INTERACTION_TERMS.c_xy,
      factor1: { name: 'X_safe', stdValue: X_safe },
      factor2: { name: 'Y_safe', stdValue: Y_safe },
      value: (coefficeintOverrides?.c_xy ?? INTERACTION_TERMS.c_xy) * X_safe * Y_safe,
    },
    {
      index: 4,
      name: 'C_x_M',
      formula: 'C_std * M_std',
      coef: coefficeintOverrides?.c_cm ?? INTERACTION_TERMS.c_cm,
      factor1: { name: 'C_std', stdValue: modifiers.C_std },
      factor2: { name: 'M_std', stdValue: modifiers.M_std },
      value: (coefficeintOverrides?.c_cm ?? INTERACTION_TERMS.c_cm) * modifiers.C_std * modifiers.M_std,
    },
    {
      index: 5,
      name: 'E_x_S',
      formula: 'E_std * S_std',
      coef: coefficeintOverrides?.c_es ?? INTERACTION_TERMS.c_es,
      factor1: { name: 'E_std', stdValue: modifiers.E_std },
      factor2: { name: 'S_std', stdValue: modifiers.S_std },
      value: (coefficeintOverrides?.c_es ?? INTERACTION_TERMS.c_es) * modifiers.E_std * modifiers.S_std,
    },
    {
      index: 6,
      name: 'D_x_T',
      formula: 'D_std * T_std',
      coef: coefficeintOverrides?.c_dt ?? INTERACTION_TERMS.c_dt,
      factor1: { name: 'D_std', stdValue: modifiers.D_std },
      factor2: { name: 'T_std', stdValue: modifiers.T_std },
      value: (coefficeintOverrides?.c_dt ?? INTERACTION_TERMS.c_dt) * modifiers.D_std * modifiers.T_std,
    },
    {
      index: 7,
      name: 'G_x_R',
      formula: 'G_std * R_std',
      coef: coefficeintOverrides?.c_gr ?? INTERACTION_TERMS.c_gr,
      factor1: { name: 'G_std', stdValue: modifiers.G_std },
      factor2: { name: 'R_std', stdValue: modifiers.R_std },
      value: (coefficeintOverrides?.c_gr ?? INTERACTION_TERMS.c_gr) * modifiers.G_std * modifiers.R_std,
    },
  ];
}

function buildQuadraticTerms(
  modifiers: StandardizedModifiers,
  coefficeintOverrides?: {
    c_c2?: number;
    c_m2?: number;
    c_t2?: number;
    c_e2?: number;
  }
) {
  return [
    {
      index: 1,
      name: 'C_squared',
      formula: 'C_std^2',
      coef: coefficeintOverrides?.c_c2 ?? QUADRATIC_TERMS.c_c2,
      factor: { name: 'C_std', stdValue: modifiers.C_std },
      value: (coefficeintOverrides?.c_c2 ?? QUADRATIC_TERMS.c_c2) * Math.pow(modifiers.C_std, 2),
    },
    {
      index: 2,
      name: 'M_squared',
      formula: 'M_std^2',
      coef: coefficeintOverrides?.c_m2 ?? QUADRATIC_TERMS.c_m2,
      factor: { name: 'M_std', stdValue: modifiers.M_std },
      value: (coefficeintOverrides?.c_m2 ?? QUADRATIC_TERMS.c_m2) * Math.pow(modifiers.M_std, 2),
    },
    {
      index: 3,
      name: 'T_squared',
      formula: 'T_std^2',
      coef: coefficeintOverrides?.c_t2 ?? QUADRATIC_TERMS.c_t2,
      factor: { name: 'T_std', stdValue: modifiers.T_std },
      value: (coefficeintOverrides?.c_t2 ?? QUADRATIC_TERMS.c_t2) * Math.pow(modifiers.T_std, 2),
    },
    {
      index: 4,
      name: 'E_squared',
      formula: 'E_std^2',
      coef: coefficeintOverrides?.c_e2 ?? QUADRATIC_TERMS.c_e2,
      factor: { name: 'E_std', stdValue: modifiers.E_std },
      value: (coefficeintOverrides?.c_e2 ?? QUADRATIC_TERMS.c_e2) * Math.pow(modifiers.E_std, 2),
    },
  ];
}

/**
 * Canonical belief emergence calculator. All phi/Z math is centralized here.
 * 
 * Ablation controls inclusion of interaction/quadratic terms in Φ; default is "full"
 * to preserve legacy behavior and maintain numeric backward compatibility.
 * 
 * Robustness overrides (optional; for sensitivity analysis only):
 * - structuralMin: ε band minimum (default: STRUCTURAL_MIN = 1e-4)
 * - phiClampAbs: Φ clamp magnitude (default: 50)
 * - panelXMin/Max, panelYMin/Max: panel bounds for structural mapping (defaults from modelContract)
 */
export function calculateModel(
  params: BeliefParameters,
  options?: {
    inputsAreStandardized?: boolean;
    modifiersAreStandardized?: boolean;
    debug?: boolean;
    panelStats?: PanelDatasetStats;
    ablation?: 'main' | 'main+int' | 'full';
    // Robustness/sensitivity overrides (optional; defaults preserve current behavior)
    structuralMin?: number;
    phiClampAbs?: number;
    panelXMin?: number;
    panelXMax?: number;
    panelYMin?: number;
    panelYMax?: number;
    // Coefficient override for estimated coefficients (P4.3)
    coefficients?: {
      c1?: number;
      c2?: number;
      c3?: number;
      c4?: number;
      c5?: number;
      c6?: number;
      c7?: number;
      c8?: number;
      c_yr?: number;
      c_tr?: number;
      c_xy?: number;
      c_cm?: number;
      c_es?: number;
      c_dt?: number;
      c_gr?: number;
      c_c2?: number;
      c_m2?: number;
      c_t2?: number;
      c_e2?: number;
      alpha?: number;
      beta?: number;
      k?: number;
      phi0?: number;
    };
  }
): ModelCalculationResult {
  const alpha = params.alpha ?? options?.coefficients?.alpha ?? OPTIMIZED_STRUCTURAL_PARAMS.alpha;
  const beta = params.beta ?? options?.coefficients?.beta ?? OPTIMIZED_STRUCTURAL_PARAMS.beta;
  const k = options?.coefficients?.k ?? OPTIMIZED_STRUCTURAL_PARAMS.k;
  const { X, Y } = params;
  // Flag semantics (no behavior change; see uiToModelTransform contract):
  // - inputsAreStandardized: when true, X/Y are already in structural-band units; skip normalization.
  // - modifiersAreStandardized: when true, modifier inputs are already z-scored; skip standardization.
  //   If omitted, defaults to inputsAreStandardized for backward compatibility.
  const inputsAreStandardized = options?.inputsAreStandardized;
  const modifiersAreStandardized =
    options?.modifiersAreStandardized ?? options?.inputsAreStandardized;

  const standardized = standardizeModifiers(params, modifiersAreStandardized);

  // Respect standardized X/Y directly when caller indicates they are already standardized.
  // Otherwise map raw X/Y into the structural domain used by the training pipeline.
  // Apply optional panel bounds overrides for robustness analysis (defaults preserve current behavior)
  let structuralX: number;
  let structuralY: number;
  
  if (inputsAreStandardized) {
    structuralX = X;
    structuralY = Y;
  } else {
    // Use overrides if provided, otherwise use defaults from modelContract
    const xMin = options?.panelXMin ?? PANEL_X_MIN;
    const xMax = options?.panelXMax ?? PANEL_X_MAX;
    const yMin = options?.panelYMin ?? PANEL_Y_MIN;
    const yMax = options?.panelYMax ?? PANEL_Y_MAX;
    
    // Apply same mapping logic as normalizePanelXToStructural/Y but with override bounds
    const clamp01Local = (v: number) => Math.min(Math.max(v, 0), 1);
    const mapLocal = (raw: number, rawMin: number, rawMax: number) => {
      if (!Number.isFinite(raw) || rawMax === rawMin) return STRUCTURAL_MIN;
      const t = clamp01Local((raw - rawMin) / (rawMax - rawMin));
      return STRUCTURAL_MIN + t * (STRUCTURAL_MAX - STRUCTURAL_MIN);
    };
    
    structuralX = mapLocal(X, xMin, xMax);
    structuralY = mapLocal(Y, yMin, yMax);
  }

  const baseTerm = Math.pow(structuralX, alpha) * Math.pow(structuralY, beta);

  const ablation = options?.ablation ?? 'full';

  const mainEffectTerms = buildMainEffectTerms(standardized, options?.coefficients);
  const mainEffects = sumContributions(mainEffectTerms);

  // Ablation mode controls inclusion of interaction and quadratic terms.
  // Default "full" preserves exact legacy computation order for backward compatibility.
  const interactionTerms = buildInteractionTerms(standardized, structuralX, structuralY, options?.coefficients);
  const interactions = ablation !== 'main' ? sumInteractions(interactionTerms) : 0;

  const quadraticTerms = buildQuadraticTerms(standardized, options?.coefficients);
  const quadratic = ablation === 'full' ? sumQuadratics(quadraticTerms) : 0;

  const baseline = options?.coefficients?.phi0 ?? OPTIMIZED_STRUCTURAL_PARAMS.phi0;
  const phi = baseline + mainEffects + interactions + quadratic;

  // Apply Φ clamp with optional override (default: 50)
  const phiClampAbs = options?.phiClampAbs ?? 50;
  const clampedPhi = Math.max(-phiClampAbs, Math.min(phiClampAbs, phi));
  const expTerm = Math.exp(clampedPhi);
  const numerator = baseTerm * expTerm;
  const denominator = numerator + k;
  // Z_raw is a sigmoid-like ratio and (when denominator>0) lives in (0,1).
  // We then clip into the canonical interior band [0.0001, 0.9999] to avoid
  // exact endpoints for log/entropy and fractional-power stability.
  const Z_raw = denominator === 0 ? 0 : numerator / denominator;
  // Clamp Z away from exact 0 and 1 to preserve mathematical behavior
  // and avoid degenerate probabilities (canonical ε band).
  // Apply optional structuralMin override (default: STRUCTURAL_MIN = 1e-4)
  const structuralMin = options?.structuralMin ?? STRUCTURAL_MIN;
  const structuralMax = 1 - structuralMin;
  const Z = !Number.isFinite(Z_raw) ? structuralMin 
    : Z_raw < structuralMin ? structuralMin
    : Z_raw > structuralMax ? structuralMax
    : Z_raw;

  // Compute derived metrics
  const phiMagnitude = Math.abs(phi);
  const netEffect = mainEffects + interactions + quadratic;
  const fieldStrength = Math.sqrt(phi * phi + Z * Z);

  const result: ModelCalculationResult = {
    phi,
    Z,
    phiComponents: {
      baseline,
      mainEffects,
      interactions,
      quadratic,
    },
    mainEffectTerms,
    interactionTerms,
    quadraticTerms,
    derivedMetrics: {
      phiMagnitude,
      netEffect,
      fieldStrength,
    },
  };

  // Build comprehensive debug payload if requested (Prompt 9)
  if (options?.debug) {
    // Extract standardization statistics
    const means: Record<string, number> = {};
    const stds: Record<string, number> = {};
    
    const modifierKeys = [
      { key: 'C_cultural_intensity', shortName: 'C' },
      { key: 'M_media_environment', shortName: 'M' },
      { key: 'T_trauma_shock', shortName: 'T' },
      { key: 'D_social_atomization', shortName: 'D' },
      { key: 'G_redistribution_capacity', shortName: 'G' },
      { key: 'E_education_capacity', shortName: 'E' },
      { key: 'S_social_support', shortName: 'S' },
      { key: 'R_welfare_capacity', shortName: 'R' },
    ];
    
    for (const { key, shortName } of modifierKeys) {
      const stats = MODIFIER_STANDARDIZATION[key];
      if (stats) {
        means[shortName] = stats.mean;
        stds[shortName] = stats.std;
      }
    }
    
    // Primary variables (X, Y) - only include real dataset stats if provided
    if (options?.panelStats) {
      means['X'] = options.panelStats.meanX;
      stds['X'] = options.panelStats.stdX;
      means['Y'] = options.panelStats.meanY;
      stds['Y'] = options.panelStats.stdY;
    }
    
    result.debug = {
      rawInputs: {
        X,
        Y,
        C: params.C,
        M: params.M,
        T: params.T,
        D: params.D,
        G: params.G,
        E: params.E,
        S: params.S,
        R: params.R,
      },
      standardizedInputs: {
        X_std: X,  // X and Y are not standardized in our model
        Y_std: Y,
        C_std: standardized.C_std,
        M_std: standardized.M_std,
        T_std: standardized.T_std,
        D_std: standardized.D_std,
        G_std: standardized.G_std,
        E_std: standardized.E_std,
        S_std: standardized.S_std,
        R_std: standardized.R_std,
      },
      standardizationStats: options?.panelStats
        ? {
            means,
            stds,
            dataset: options.panelStats,
          }
        : Object.keys(means).length || Object.keys(stds).length
            ? { means, stds }
            : undefined,
      mainEffectTerms: mainEffectTerms.map(t => ({
        name: t.name,
        coef: t.coef,
        stdValue: t.stdValue,
        contribution: t.contribution,
      })),
      mainEffectsSum: mainEffects,
      interactionTerms: interactionTerms.map(t => ({
        name: t.name,
        formula: t.formula,
        value: t.value,
      })),
      interactionsSum: interactions,
      quadraticTerms: quadraticTerms.map(t => ({
        name: t.name,
        formula: t.formula,
        value: t.value,
      })),
      quadraticsSum: quadratic,
      phiBreakdown: {
        baseline,
        mainEffects,
        interactions,
        quadratic,
        phi,  // Sum of above 4 components
      },
      zComputation: {
        numerator,      // X^α * Y^β * e^phi
        denominator,    // numerator + k
        Z,              // numerator / denominator
      },
    };
  }

  return result;
}
