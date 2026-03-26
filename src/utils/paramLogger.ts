import type { BeliefParameters } from '../types';

// Parameter tracing is DEV-only to avoid noisy production consoles.
const DEBUG_PARAMS = import.meta.env.DEV;

export function logParams(source: string, params: BeliefParameters): void {
  if (!DEBUG_PARAMS || typeof console === 'undefined') {
    return;
  }

  const payload = {
    source,
    X: params.X,
    Y: params.Y,
    C: params.C,
    M: params.M,
    T: params.T,
    D: params.D,
    G: params.G,
    E: params.E,
    S: params.S,
    R: params.R,
    alpha: params.alpha,
    beta: params.beta,
    k: params.k,
  };

  console.log('[ParamTrace]', JSON.stringify(payload));
}
