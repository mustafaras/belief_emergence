export interface BeliefParameters {
  X: number; // Settlement
  Y: number; // Inequality
  alpha: number; // Exponent for Settlement (X)
  beta: number; // Exponent for Inequality (Y)
  k: number; // Normalization constant (φ0 baseline is fixed elsewhere)
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
