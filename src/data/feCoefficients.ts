/**
 * PRODUCTION MODEL COEFFICIENTS & CANONICAL PREPROCESSING
 * ═════════════════════════════════════════════════════════════
 *
 * SOURCE: Hardcoded in this file (see OPTIMIZED_SIGMOID_COEFFICIENTS below)
 * Canonical headline metrics: src/data/metrics/headline_metrics_authoritative.json
 * Generation command: npm run generate:headline-metrics
 * Dataset: 630 observations, 23 countries, years 2000-2022
 * Training Date: 2025-12-07
 * Training/optimizer metadata metrics: R²=0.9481, Correlation=0.9794, MAE=0.1341, RMSE=0.2206, Bias=-0.0023 (obs - pred)
 * Method: Logit-space optimization (Differential Evolution + L-BFGS-B)
 *
 * IMPORTANT (METRICS):
 *   The numbers above are the optimizer/training summary embedded in the coefficients JSON.
 *   The app/paper "headline" metrics are the canonical panel-fit computed on the 630-row panel
 *   using CANONICAL_PREPROCESSING + structural=fixed_map:
 *     scripts/generate_headline_metrics.ts (run via: npm run generate:headline-metrics)
 *     Data: public/data/panel_canonical_23_countries_v1.csv
 *     Output: src/data/metrics/headline_metrics_authoritative.json
 *   Those canonical headline metrics are stored below as PRODUCTION_MODEL_METADATA.headline.
 *
 * CANONICAL Φ (must match Python reference exactly):
 *   Φ = φ₀_fixed + Σ_{i=1..8}(c_i · M_{i,std}) + Σ_{j=1..7}(I_j) + Σ_{k=1..4}(Q_k)
 *   Z = (X^α · Y^β · e^Φ) / (X^α · Y^β · e^Φ + k)
 *   φ₀ is a fixed baseline offset (not user-configurable) from OPTIMIZED_STRUCTURAL_PARAMS.
 *
 * SIGN CONVENTION (CRITICAL): coefficients already encode direction.
 * Amplifiers (increase Φ when their std value is positive):
 *   c1 = +1.003  (Culture Intensity)
 *   c3 = +0.068  (Trauma Shock)
 *   c5 = +0.023  (Redistribution Capacity)
 *   c8 = +0.02   (Welfare Capacity)
 * Suppressors (decrease Φ when their std value is positive):
 *   c2 = -0.219  (Media Environment)
 *   c4 = -0.635  (Social Atomization)
 *   c6 = -0.382  (Education Capacity)
 *   c7 = -0.393  (Social Support)
 *
 * SIGN EXAMPLES (never negate coefficients in code):
 *   Amplifier: c1=+1.003, C_std=+0.5 → contrib = (+1.003)*(+0.5) = +0.5015 (Φ rises)
 *   Suppressor relief: c6=-0.382, E_std=-0.5 → contrib = (-0.382)*(-0.5) = +0.191 (Φ rises)
 *   Suppressor pressure: c6=-0.382, E_std=+0.5 → contrib = (-0.382)*(+0.5) = -0.191 (Φ falls)
 *   ✓ CORRECT:   Φ = ... + c6*E_std + c7*S_std  (use signed coefficients as-is)
 *   ✗ WRONG:     Φ = ... - c6*E_std - c7*S_std  (double negation introduces ~2*c6*E_std error)
 *
 * CANONICAL PREPROCESSING (CRITICAL - discovered via reverse engineering):
 *   The production CSV has MIXED-scale modifier columns:
 *     - C_cultural_intensity: RAW scale (mean≈2.6136, std≈0.5421) → MUST z-score
 *     - M, T, D, G, E, S, R: Already standardized (mean≈0, std≈1) → Use as-is
 *
 *   Z-score transformation (only for C):
 *     C_std = (C - 2.613602) / 0.542138
 *
 *   IMPORTANT: The old standardization parameters below (C mean=0.052, etc.) were
 *   incorrect artifacts. Use the canonical preprocessing parameters embedded below.
/**
 * CANONICAL PREPROCESSING PARAMETERS
 *     1. Load public/data/panel_canonical_23_countries_v1.csv
 *     2. Z-score only C: C_std = (C_cultural_intensity - mean_C) / std_C
 *     3. Use M, T, D, G, E, S, R directly (no transformation)
 *     4. Pass to calculateModel() with modifiersAreStandardized=true
 *
 *   Structural params X, Y are used raw (not standardized).
 *
 * UNIFIED CALCULATOR:
 *   All Φ/Z calculations must flow through src/utils/calculateModel.ts (single source of truth).
 *   Components must not reimplement math or negate coefficients.
 *
 * MODEL PERFORMANCE (SCIENTIFIC PRODUCTION):
 *   Trained on 23 countries, 630 observations (2000–2022)
 *   Method: Logit-space optimization (Differential Evolution + L-BFGS-B)
 *   Feature standardization: z-score
 *   Training metadata (from canonical JSON): Corr 0.9794, R² 0.9481, MAE 0.1341, Bias -0.0023 (obs - pred)
 *
 *   Headline (paper/app): use PRODUCTION_MODEL_METADATA.headline (canonical panel-fit)
 */

import headlineMetrics from './metrics/headline_metrics_authoritative.json';

export interface BeliefCoefficients {
  // Structural coefficients
  c1: number; // Cultural Intensity (C)
  c2: number; // Media Environment (M)
  c3: number; // Trauma/Shock (T)
  c4: number; // Social Atomization (D)
  c5: number; // Redistribution Capacity (G)
  c6: number; // Education Capacity (E)
  c7: number; // Social Support (S)
  c8: number; // Welfare Capacity (R)
}

export interface StructuralParameters {
  alpha: number;  // Settlement exponent
  beta: number;   // Inequality exponent
  k: number;      // Saturation constant
  phi0: number;   // Baseline offset
}

export interface ModifierStandardization {
  mean: number;
  std: number;
}

export interface OptimizedSigmoidConfig {
  structural_parameters: StructuralParameters;
  coefficients: BeliefCoefficients;
  modifier_standardization: Record<string, ModifierStandardization>;
  z_normalization: { min: number; max: number };
}

export const PRODUCTION_MODEL_METADATA = {
  dataset: {
    observations: 630,
    countries: 23,
    yearStart: 2000,
    yearEnd: 2022,
  },
  headline: {
    // Canonical global performance used as the repo-wide "headline" (paper/app).
    // Source of truth: scripts/generate_headline_metrics.ts (run via: npm run generate:headline-metrics)
    // Dataset: public/data/panel_canonical_23_countries_v1.csv
    // Output: src/data/metrics/headline_metrics_authoritative.json
    // Mode: CANONICAL_PREPROCESSING + structural=fixed_map
    metrics: {
      r2: headlineMetrics.values.r2,
      correlation: headlineMetrics.values.corr,
      mae: headlineMetrics.values.mae,
      rmse: headlineMetrics.values.rmse,
      // Bias is mean(obs - pred) with obs/pred in the canonical interior band.
      bias: headlineMetrics.values.bias,
    },
    provenance: headlineMetrics,
  },
  training: {
    date: '2025-12-07',
    metrics: {
      // NOTE: These values are the training-phase summary metrics from optimizer.
      // For production headline metrics, use headline.metrics (sourced from generate_headline_metrics.ts).
      r2: 0.9480535935831287,
      correlation: 0.9794331266943296,
      mae: 0.1340587023865254,
      rmse: 0.22060345343596452,
      bias: -0.002304291744825522,
    },
  },
} as const;

/**
 * SCIENTIFIC PRODUCTION COEFFICIENTS (23 Countries, 630 observations)
 * Source: data_final/sigmoid_coefficients_PRODUCTION.json
 * Date: 2025-12-07
 *
 * Training Method: Logit-space optimization (Differential Evolution + L-BFGS-B)
 * Feature Standardization: z-score
 * Loss Function: (1-R²) + (1-Corr) + MAE + 0.1|Bias| + ridge
 *
 * Structural Parameters (SUBLINEAR, φ₀ fixed baseline):
 * - α (alpha) = 0.300 (settlement power - SUBLINEAR)
 * - β (beta) = 0.300 (inequality power - SUBLINEAR)
 * - k = 1.307 (saturation - moderate)
 * - φ₀ (phi0) = 0.921 (baseline offset - POSITIVE, fixed and not user-configurable)
 *
 * Training summary (canonical production, 2025-12-07):
 * - R²: 0.9481
 * - Correlation: 0.9794
 * - MAE: 0.1341
 * - RMSE: 0.2206
 * - Bias: -0.0023
 */
export const OPTIMIZED_SIGMOID_COEFFICIENTS: BeliefCoefficients = {
  c1: 1.003361700614782,     // Cultural Intensity (strongest positive effect)
  c2: -0.21941652490345562,  // Media Environment (negative effect)
  c3: 0.06794054331495528,   // Trauma/Shock
  c4: -0.635347944105626,    // Social Atomization (strong negative)
  c5: 0.022667990063449064,  // Redistribution Capacity
  c6: -0.38195507231941395,  // Education Capacity (negative effect)
  c7: -0.393087347639909,    // Social Support (negative effect)
  c8: 0.02,                  // Welfare Capacity (constrained minimum)
};

export const OPTIMIZED_STRUCTURAL_PARAMS: StructuralParameters = {
  alpha: 0.3,
  beta: 0.3,
  k: 1.3067922403554164,
  phi0: 0.9211981898850654,
};

/**
 * INTERACTION TERMS (added in v2)
 * These represent non-linear cross-factor effects
 */
export interface InteractionTerms {
  c_yr: number;   // Y×R: Inequality × Welfare Capacity
  c_tr: number;   // T×R: Trauma × Welfare Capacity
  c_xy: number;   // X×Y: Urbanization × Inequality
  c_cm: number;   // C×M: Culture × Media
  c_es: number;   // E×S: Education × Social Support
  c_dt: number;   // D×T: Atomization × Trauma
  c_gr: number;   // G×R: Redistribution × Welfare
}

export const INTERACTION_TERMS: InteractionTerms = {
  c_yr: 0.429521653986687,       // Y×R: Inequality × Welfare Capacity
  c_tr: -0.18972004503264955,    // T×R: Trauma × Welfare Capacity
  c_xy: -0.07407841500627856,    // X×Y: Urbanization × Inequality
  c_cm: 0.4224870328989847,      // C×M: Culture × Media
  c_es: 0.3597710473523405,      // E×S: Education × Social Support
  c_dt: -0.28164864210127627,    // D×T: Atomization × Trauma
  c_gr: -0.020916923961295752,   // G×R: Redistribution × Welfare
};

/**
 * QUADRATIC MODIFIER EFFECTS (added in v2)
 * These represent non-linear intensities (saturation/diminishing returns)
 */
export interface QuadraticTerms {
  c_c2: number;   // C²: Cultural intensity curvature
  c_m2: number;   // M²: Media saturation
  c_t2: number;   // T²: Trauma accumulation
  c_e2: number;   // E²: Education diminishing returns
}

export const QUADRATIC_TERMS: QuadraticTerms = {
  c_c2: 0.704239710511195,        // C²: Cultural intensity curvature
  c_m2: -0.021112867097885724,    // M²: Media saturation
  c_t2: -0.09630475486001498,     // T²: Trauma accumulation
  c_e2: 0.20044395262262213,      // E²: Education diminishing returns
};

/**
 * CANONICAL PREPROCESSING PARAMETERS (from preprocessing.py)
 * 
 * CRITICAL: The production panel CSV has MIXED-scale modifiers:
 * - C_cultural_intensity: RAW scale (mean≈2.614, std≈0.542) → MUST z-score
 * - M, T, D, G, E, S, R: Already standardized (mean≈0, std≈1) → Use as-is
 * 
 * For panel predictions, z-score ONLY C before passing to calculateModel().
 * All other modifiers should be used directly from the CSV.
 */
export const MODIFIER_STANDARDIZATION: Record<string, ModifierStandardization> = {
  // C requires z-scoring (from dataset statistics)
  C_cultural_intensity: { mean: 2.613602, std: 0.542138 },
  
  // All other modifiers are already standardized in the CSV - these values 
  // are kept for reference but should NOT be used for re-standardization
  M_media_environment: { mean: 0.0, std: 1.0 },
  T_trauma_shock: { mean: 0.0, std: 1.0 },
  D_social_atomization: { mean: 0.0, std: 1.0 },
  G_redistribution_capacity: { mean: 0.0, std: 1.0 },
  E_education_capacity: { mean: 0.0, std: 1.0 },
  S_social_support: { mean: 0.0, std: 1.0 },
  R_welfare_capacity: { mean: 0.0, std: 1.0 },
};

/**
 * Z_NORMALIZATION bounds (from preprocessing.py and model_coefficients.json)
 * Used to normalize Z_belief_outcome to [0.0001, 0.9999] for logit-space training
 */
export const Z_NORMALIZATION = {
  // v2 panel bounds (public/data/panel_canonical_v2.csv, 49 complete cases).
  // The previous bounds belonged to the superseded v1 panel, whose outcome was
  // an exact rescaling of a predictor; clamping the new outcome to the old
  // range would silently censor 6 of 49 observations.
  min: -1.6094638811769215,
  max: 1.5846349235822439,
};

// Legacy FE coefficients (deprecated - use OPTIMIZED_SIGMOID_COEFFICIENTS)
export const FE_COEFFICIENTS: BeliefCoefficients = {
  c1: 0.1280,   // Cultural Tradition (C) - from beta_C in FE model
  c2: 0.0563,   // Media Environment (M) - from beta_M in FE model
  c3: -0.0041,  // Trauma/Shock (T) - from beta_T in FE model
  c4: 0.3107,   // Social Atomization (D) - from gamma_D in FE model
  c5: 0.0240,   // Gini/Redistribution (G) - from beta_G in FE model
  c6: -0.0014,  // Education (E) - from beta_E in FE model (NOTE: negative coefficient)
  c7: -0.0625,  // Social Support (S) - from beta_S in FE model (NOTE: negative coefficient)
  c8: 0.0624,   // Welfare/Resilience (R) - from beta_R in FE model
};

/**
 * LEGACY COEFFICIENTS (original hardcoded values)
 * Kept for reference and potential fallback
 */
export const LEGACY_COEFFICIENTS: BeliefCoefficients = {
  c1: 0.48,
  c2: 0.42,
  c3: 0.37,
  c4: 0.31,
  c5: 0.56,
  c6: 0.51,
  c7: 0.44,
  c8: 0.39,
};

/**
 * FIXED_COEFFICIENTS is the primary export used by App.tsx
 * Uses optimized sigmoid calibration with validated panel-fit performance.
 */
export const FIXED_COEFFICIENTS = OPTIMIZED_SIGMOID_COEFFICIENTS;

/**
 * Standardize a single modifier value for Φ calculation.
 *
 * CRITICAL: This MUST be called for all modifiers
 * before they enter calculateModel() / Φ.
 *
 * The PRODUCTION model was trained with z-score standardized
 * features. Failure to standardize causes ~2–3x prediction errors.
 *
 * @param value - Raw modifier value (e.g., from UI slider in [0, 1])
 * @param modifierKey - Key from MODIFIER_STANDARDIZATION
 *   (e.g., 'C_cultural_intensity')
 * @returns z-score standardized value
 *
 * @example
 * const C_raw = 0.5;  // From slider [0, 1]
 * const C_std = standardizeModifier(C_raw, 'C_cultural_intensity');
 * // C_std ≈ 0.448 (transformed to z-score)
 * // Correct usage in Φ:
 * //   phi = phi0 + c1 * C_std + ...
 */
export function standardizeModifier(value: number, modifierKey: string): number {
  const stats = MODIFIER_STANDARDIZATION[modifierKey];
  if (!stats) return value; // If no standardization available, return raw
  return (value - stats.mean) / stats.std;
}
