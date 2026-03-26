import type { BeliefParameters } from '../types';
import { OPTIMIZED_STRUCTURAL_PARAMS } from '../data/feCoefficients';

/**
 * AUTHORITATIVE STANDARDIZATION CONTRACT (UI ↔ model, panel ↔ model)
 *
 * Vocabulary
 * - “standardized”: z-score (mean 0, std 1) using MODIFIER_STANDARDIZATION.
 * - “normalized”: min-max mapping into the structural ε-band [STRUCTURAL_MIN, STRUCTURAL_MAX].
 * - “clamped”: hard-bounded to that ε-band for numerical safety.
 *
 * Pipeline 1 — UI sliders / presets (interactive exploration)
 * - X, Y (sliders): provided in UI ranges; calculateModel maps/clamps them to the structural band
 *   when `inputsAreStandardized` is falsy (current behavior). Callers do not pre-normalize.
 * - Modifiers C..R (sliders): treated as panel-scale raw values by default. calculateModel
 *   z-scores them when `modifiersAreStandardized` is falsy. When a preset is active,
 *   modifiers come pre-standardized from the preset generator; callers pass
 *   `{ modifiersAreStandardized: true }` so calculateModel uses them as-is (no re-z-scoring).
 * - Coefficients are fixed (no refit). φ₀/α/β/k default to OPTIMIZED_STRUCTURAL_PARAMS unless overridden.
 *
 * Pipeline 2 — Panel dataset evaluation (canonical panelPredict path)
 * - X, Y: raw panel values; calculateModel maps/clamps to the structural band with
 *   `inputsAreStandardized: false`.
 * - Modifiers: panel CSV already standardized except C; panelPredict z-scores C only, then calls
 *   calculateModel with `{ inputsAreStandardized: false, modifiersAreStandardized: true }`.
 * - Observed Z: normalized to the structural band using Z_NORMALIZATION then clamped to the ε-band
 *   before comparison; coefficients fixed (no refit).
 *
 * Role of this utility
 * - Central mapping from UI state → calculateModel parameter object (no scaling performed here).
 * - Keeps all UI consumers (App, SurfacePlot3D, FormulaDisplay, etc.) aligned to this contract.
 */

export interface UiParams {
  // Structural sliders (UI space)
  X: number; // Settlement slider value
  Y: number; // Inequality slider value
  alpha?: number;
  beta?: number;
  k?: number;

  // Modifier sliders (UI space, raw/panel-like units)
  C: number;
  M: number;
  T: number;
  D: number;
  G: number;
  E: number;
  S: number;
  R: number;
}

// Model-space parameters used by calculateModel
export type ModelParams = BeliefParameters;

export function uiToModelParams(ui: UiParams): ModelParams {
  const alpha = ui.alpha ?? OPTIMIZED_STRUCTURAL_PARAMS.alpha;
  const beta = ui.beta ?? OPTIMIZED_STRUCTURAL_PARAMS.beta;
  const k = ui.k ?? OPTIMIZED_STRUCTURAL_PARAMS.k;

  return {
    // Raw structural inputs; downstream normalization to [0.0001, 0.9999]
    // is performed inside calculateModel.
    X: ui.X,
    Y: ui.Y,
    alpha,
    beta,
    k,

    // Modifiers: pass-through of slider/preset values. calculateModel decides whether to
    // z-score based on the caller-supplied flags (see contract above).
    C: ui.C,
    M: ui.M,
    T: ui.T,
    D: ui.D,
    G: ui.G,
    E: ui.E,
    S: ui.S,
    R: ui.R,
  };
}
