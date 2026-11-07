export interface BeliefParameters {
  X: number; // Settlement
  Y: number; // Inequality
  alpha: number; // Exponent for Settlement (X)
  beta: number; // Exponent for Inequality (Y)
  k: number; // Normalization constant (φ0 baseline is fixed elsewhere)
  // C, D, S and G are structurally unavailable in the v2 panel
  // (docs/KNOWN_ISSUES.md KI-09..KI-11). The interactive model needs concrete
  // numbers, so the boundary conversion in
  // src/utils/validation/panelPredict.ts neutralizes them to 0 — the mean of a
  // standardized channel — and says so explicitly. PanelRowCanonical keeps
  // them as `number | null` so the missingness is not lost upstream.
  C: number;
  M: number;
  T: number;
  D: number;
  G: number;
  E: number;
  S: number;
  R: number;
}

export interface Coefficients {
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  c5: number;
  c6: number;
  c7: number;
  c8: number;
}
