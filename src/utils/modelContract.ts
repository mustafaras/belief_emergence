// Shared normalization and safety contract used across UI sections and model evaluation.
//
// Key idea:
// - Panel X and Y may be outside the safe domain for fractional powers.
// - We map panel-space X/Y into an interior open interval [STRUCTURAL_MIN, STRUCTURAL_MAX]
//   so expressions like X^α and Y^β are always well-defined and numerically stable.
// - Observed Z is also mapped into the same interior band for apples-to-apples comparisons.

export const STRUCTURAL_MIN = 1e-4;
export const STRUCTURAL_MAX = 1 - STRUCTURAL_MIN;

// Panel-space bounds used by the training pipeline.
// Keep these aligned with any runtime warnings/UX ranges.
export const PANEL_X_MIN = 0.3304;
export const PANEL_X_MAX = 0.9544;
export const PANEL_Y_MIN = -1.6078;
export const PANEL_Y_MAX = 3.4280;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function clampToStructuralBand(value: number): number {
  if (!Number.isFinite(value)) return STRUCTURAL_MIN;
  if (value < STRUCTURAL_MIN) return STRUCTURAL_MIN;
  if (value > STRUCTURAL_MAX) return STRUCTURAL_MAX;
  return value;
}

export function mapToStructuralDomain(raw: number, rawMin: number, rawMax: number): number {
  if (!Number.isFinite(raw)) return STRUCTURAL_MIN;
  if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax) || rawMax === rawMin) {
    return STRUCTURAL_MIN;
  }

  const t = clamp01((raw - rawMin) / (rawMax - rawMin));
  return STRUCTURAL_MIN + t * (STRUCTURAL_MAX - STRUCTURAL_MIN);
}

export function normalizePanelXToStructural(X_raw: number): number {
  return mapToStructuralDomain(X_raw, PANEL_X_MIN, PANEL_X_MAX);
}

export function normalizePanelYToStructural(Y_raw: number): number {
  return mapToStructuralDomain(Y_raw, PANEL_Y_MIN, PANEL_Y_MAX);
}

// Generic mapping to the structural band for observed/target variables.
// Useful for mapping panel Z using its empirical min/max.
export function normalizeToStructuralBand(value: number, valueMin: number, valueMax: number): number {
  return mapToStructuralDomain(value, valueMin, valueMax);
}

// Observed/target mapping used for evaluation/metrics.
// Unlike structural inputs, evaluation should NOT silently coerce invalid values;
// returning NaN allows callers to skip bad rows explicitly.
export function normalizeObservedToStructuralBand(value: number, valueMin: number, valueMax: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(valueMin) || !Number.isFinite(valueMax) || valueMax === valueMin) {
    return NaN;
  }
  return mapToStructuralDomain(value, valueMin, valueMax);
}
