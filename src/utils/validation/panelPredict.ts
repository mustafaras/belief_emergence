/**
 * CANONICAL PANEL PREDICTION PIPELINE
 * ════════════════════════════════════════════════════════════════════════════
 * 
 * Single source of truth for converting panel rows → model predictions.
 * 
 * PURPOSE:
 * - Consolidates the exact preprocessing semantics used in panel evaluation
 * - Ensures consistent C z-scoring, observed Z normalization, and calculateModel flags
 * - Eliminates drift between evaluation paths (computePanelFitSummary, UI sections, etc.)
 * 
 * KEY DESIGN:
 * - Pure functions (no global state, no side effects)
 * - Reuses existing constants (MODIFIER_STANDARDIZATION, Z_NORMALIZATION, etc.)
 * - Mirrors the preprocessing in computePanelFitSummary.ts exactly
 * 
 * PREPROCESSING SEMANTICS (CANONICAL):
 * 1. C z-scoring:
 *    C_std = (C - 2.613602) / 0.542138
 *    (M, T, D, G, E, S, R are already standardized in the panel CSV → use as-is)
 * 
 * 2. Observed Z normalization:
 *    Z_obs_normalized = (Z_raw - Z_min) / (Z_max - Z_min), clamped to [ε, 1-ε]
 *    Uses Z_NORMALIZATION.min/max and structural band [STRUCTURAL_MIN, STRUCTURAL_MAX]
 * 
 * 3. calculateModel flags:
 *    - inputsAreStandardized: false (panel X/Y are raw; let calculateModel map them)
 *    - modifiersAreStandardized: true (after C z-scoring, all modifiers are standardized)
 * 
 * USAGE (future, after P1.2 refactor):
 *   const result = predictFromPanelRow(panelRow);
 *   // result.zPred: model-predicted Z (structural band)
 *   // result.zObs: observed Z (normalized to structural band)
 *   // result.phi: Φ value (if available from calculateModel)
 *   // result.inputs: exact inputs passed to calculateModel (provenance)
 * 
 * @module panelPredict
 */

import type { PanelRowCanonical } from '../../types/panel';
import { calculateModel } from '../calculateModel';
import { normalizeObservedToStructuralBand } from '../modelContract';
import {
  MODIFIER_STANDARDIZATION,
  OPTIMIZED_STRUCTURAL_PARAMS,
  Z_NORMALIZATION,
} from '../../data/feCoefficients';

/**
 * Result of panel row prediction.
 * 
 * @property zPred - Model-predicted Z (structural band: [1e-4, 0.9999])
 * @property zObs - Observed Z (normalized to structural band; NaN if raw Z is invalid)
 * @property phi - Symbolic field value Φ (if returned by calculateModel; undefined otherwise)
 * @property inputs - Exact model inputs passed to calculateModel (for provenance/debugging)
 * @property diagnostics - Optional: intermediate values (e.g., C_std)
 */
export interface PanelPredictResult {
  zPred: number;
  zObs: number;
  phi?: number;
  inputs: {
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
    alpha: number;
    beta: number;
    k: number;
  };
  diagnostics?: {
    /** null when C is structurally unavailable in the panel. */
    C_raw: number | null;
    C_std: number;
    Z_raw: number;
  };
}

/**
 * Standardizes C (Cultural Intensity) using canonical z-score parameters.
 * 
 * CRITICAL: Only C requires z-scoring in the panel path.
 * All other modifiers (M, T, D, G, E, S, R) are already standardized in the CSV.
 * 
 * Formula:
 *   C_std = (C_raw - mean) / std
 * 
 * Constants:
 *   mean = 2.613602
 *   std = 0.542138
 * 
 * @param cRaw - Raw C value from panel CSV
 * @returns Standardized C (z-score)
 */
export function standardizeCulturalIntensity(cRaw: number): number {
  return (cRaw - MODIFIER_STANDARDIZATION.C_cultural_intensity.mean) /
         MODIFIER_STANDARDIZATION.C_cultural_intensity.std;
}

/**
 * Normalizes observed Z to the structural band [STRUCTURAL_MIN, STRUCTURAL_MAX].
 * 
 * Uses the canonical Z_NORMALIZATION bounds (from preprocessing.py):
 *   Z_min = 0.0033089
 *   Z_max = 0.9967154
 * 
 * Formula:
 *   t = (Z_raw - Z_min) / (Z_max - Z_min)
 *   Z_normalized = STRUCTURAL_MIN + t * (STRUCTURAL_MAX - STRUCTURAL_MIN)
 * 
 * Returns NaN if Z_raw is non-finite or normalization bounds are invalid.
 * 
 * @param zRaw - Raw Z value from panel CSV
 * @returns Normalized Z (structural band), or NaN if invalid
 */
export function normalizeObservedZ(zRaw: number): number {
  return normalizeObservedToStructuralBand(zRaw, Z_NORMALIZATION.min, Z_NORMALIZATION.max);
}

/**
 * Converts a panel row into the exact input object expected by calculateModel.
 * 
 * Applies canonical preprocessing:
 * - C z-scoring: C_std = (C - mean) / std
 * - M, T, D, G, E, S, R: used as-is (already standardized)
 * - X, Y: passed raw (calculateModel will map them to structural domain)
 * - α, β, k: structural parameters (fixed)
 * 
 * @param row - Canonical panel row
 * @returns Model input object (ready for calculateModel)
 */
/**
 * Convert a canonical row into model inputs.
 *
 * C, D, S and G are structurally unavailable in the v2 panel (see
 * docs/KNOWN_ISSUES.md KI-09..KI-11 and the panel audit). They are returned as
 * `null` rather than substituted with 0 or with a mean, so callers must decide
 * explicitly how to treat a construct that does not exist in the data.
 */
export function panelRowToModelInputs(row: PanelRowCanonical): {
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
  alpha: number;
  beta: number;
  k: number;
} {
  // C, D, S and G are unavailable in the v2 panel. The interactive model
  // requires concrete numbers, so they are neutralized to 0 here — the mean of
  // a standardized channel, which contributes nothing to Φ. This is a
  // deliberate boundary decision, taken once and documented, rather than a
  // silent default scattered through the UI.
  const cStd = row.C === null ? 0 : standardizeCulturalIntensity(row.C);

  return {
    X: row.X,
    Y: row.Y,
    C: cStd,
    M: row.M,
    T: row.T,
    D: row.D ?? 0,
    G: row.G ?? 0,
    E: row.E,
    S: row.S ?? 0,
    R: row.R,
    alpha: OPTIMIZED_STRUCTURAL_PARAMS.alpha,
    beta: OPTIMIZED_STRUCTURAL_PARAMS.beta,
    k: OPTIMIZED_STRUCTURAL_PARAMS.k,
  };
}

/**
 * Predicts Z from a panel row using the canonical preprocessing pipeline.
 * 
 * Steps:
 * 1. Convert panel row → model inputs (C z-scoring, structural params)
 * 2. Call calculateModel with panel evaluation flags:
 *    - inputsAreStandardized: false (X/Y are raw panel values)
 *    - modifiersAreStandardized: true (after C z-scoring, all modifiers are standardized)
 *    - ablation: optional mode control (default: "full" for backward compatibility)
 *    - coefficients: optional override (P4.3)
 * 3. Normalize observed Z to structural band
 * 4. Return prediction result with provenance
 * 
 * @param row - Canonical panel row
 * @param options - Optional prediction configuration
 * @param options.ablation - Model ablation mode: "main" | "main+int" | "full" (default: "full")
 * @param options.coefficients - Optional coefficient overrides (P4.3 for estimated coefficients)
 * @returns Prediction result (zPred, zObs, phi, inputs, diagnostics)
 */
export function predictFromPanelRow(
  row: PanelRowCanonical,
  options?: { 
    ablation?: 'main' | 'main+int' | 'full';
    coefficients?: Record<string, number>;
  }
): PanelPredictResult {
  const inputs = panelRowToModelInputs(row);

  const result = calculateModel(inputs, {
    inputsAreStandardized: false,      // Panel X/Y are raw; let calculateModel map them
    modifiersAreStandardized: true,    // After C z-scoring, all modifiers are standardized
    ablation: options?.ablation,       // Forward ablation mode (default: "full")
    coefficients: options?.coefficients, // Pass through coefficient overrides (P4.3)
  });

  const zPred = result.Z;
  const zObs = normalizeObservedZ(row.Z);

  return {
    zPred,
    zObs,
    phi: result.phi,
    inputs,
    diagnostics: {
      C_raw: row.C,
      C_std: inputs.C,
      Z_raw: row.Z,
    },
  };
}

/**
 * Predicts Z for multiple panel rows.
 * 
 * Simple map wrapper; forwards all options including coefficient overrides.
 * 
 * @param rows - Array of canonical panel rows
 * @param options - Optional prediction configuration
 * @returns Array of prediction results
 */
export function predictManyFromPanelRows(
  rows: PanelRowCanonical[],
  options?: { 
    ablation?: 'main' | 'main+int' | 'full';
    coefficients?: Record<string, number>;
  }
): PanelPredictResult[] {
  return rows.map((row) => predictFromPanelRow(row, options));
}

/**
 * Internal sanity check for panel row validity.
 * 
 * Returns array of warnings for:
 * - Missing/non-finite required fields
 * - Observed Z outside expected range
 * 
 * NOTE: This is a pure function for debugging/testing; not called in production paths.
 * 
 * @param row - Panel row to validate
 * @returns Array of warning strings (empty if no issues)
 * @internal
 */
export function _panelPredictSanityCheck(row: PanelRowCanonical): string[] {
  const warnings: string[] = [];

  // Check required numeric fields
  const requiredFields: (keyof PanelRowCanonical)[] = ['X', 'Y', 'Z', 'C', 'M', 'T', 'D', 'G', 'E', 'S', 'R'];
  for (const field of requiredFields) {
    const value = row[field];
    if (typeof value === 'number' && !Number.isFinite(value)) {
      warnings.push(`${field} is non-finite: ${value}`);
    }
  }

  // Check observed Z range (should be within [0, 1] before normalization)
  if (Number.isFinite(row.Z) && (row.Z < 0 || row.Z > 1)) {
    warnings.push(`Z outside expected [0, 1] range: ${row.Z}`);
  }

  return warnings;
}
