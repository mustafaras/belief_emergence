import { describe, expect, it } from 'vitest';

import { calculateModel } from '../src/utils/calculateModel';
import { OPTIMIZED_STRUCTURAL_PARAMS, OPTIMIZED_SIGMOID_COEFFICIENTS } from '../src/data/feCoefficients';
import type { BeliefParameters } from '../src/types';

/**
 * B-02 – Bootstrap Uncertainty Bands on 3D Surface
 *
 * These tests verify the CI-band logic at the model level:
 *   1. Coefficient overrides actually shift Z output.
 *   2. Wider (upper-bound) coefficients produce Z_upper ≥ Z_main.
 *   3. Narrower (lower-bound) coefficients produce Z_lower ≤ Z_main.
 *   4. When no coefficient override is given, the baseline Z is produced.
 */

const baseParams: BeliefParameters = {
  X: 0.5,
  Y: 0.5,
  alpha: OPTIMIZED_STRUCTURAL_PARAMS.alpha,
  beta: OPTIMIZED_STRUCTURAL_PARAMS.beta,
  k: OPTIMIZED_STRUCTURAL_PARAMS.k,
  C: 0,
  M: 0,
  T: 0,
  D: 0,
  G: 0,
  E: 0,
  S: 0,
  R: 0,
};

describe('CI band model-level invariants (B-02)', () => {
  it('baseline Z is produced when no coefficient override is supplied', () => {
    const r = calculateModel(baseParams, { modifiersAreStandardized: true });
    expect(r).toBeDefined();
    expect(Number.isFinite(r.Z)).toBe(true);
  });

  it('coefficient overrides change the Z output', () => {
    const baseline = calculateModel(baseParams, { modifiersAreStandardized: true });

    // Perturb phi0 upward → should increase Z
    const overrides = { phi0: OPTIMIZED_STRUCTURAL_PARAMS.phi0 + 0.5 };
    const perturbed = calculateModel(baseParams, { modifiersAreStandardized: true, coefficients: overrides });

    expect(perturbed.Z).not.toBeCloseTo(baseline.Z, 4);
    expect(perturbed.Z).toBeGreaterThan(baseline.Z);
  });

  it('CI lower coefficients yield Z_lower ≤ Z_main for a grid sweep', () => {
    // Simulate lower-bound coefficients: reduce phi0
    const lowerCoeffs = { phi0: OPTIMIZED_STRUCTURAL_PARAMS.phi0 - 0.3 };

    const xVals = [0.2, 0.5, 0.8];
    const yVals = [0.2, 0.5, 0.8];

    for (const x of xVals) {
      for (const y of yVals) {
        const p = { ...baseParams, X: x, Y: y };
        const main = calculateModel(p, { modifiersAreStandardized: true });
        const lower = calculateModel(p, { modifiersAreStandardized: true, coefficients: lowerCoeffs });
        expect(lower.Z).toBeLessThanOrEqual(main.Z + 1e-12);
      }
    }
  });

  it('CI upper coefficients yield Z_upper ≥ Z_main for a grid sweep', () => {
    // Simulate upper-bound coefficients: increase phi0
    const upperCoeffs = { phi0: OPTIMIZED_STRUCTURAL_PARAMS.phi0 + 0.3 };

    const xVals = [0.2, 0.5, 0.8];
    const yVals = [0.2, 0.5, 0.8];

    for (const x of xVals) {
      for (const y of yVals) {
        const p = { ...baseParams, X: x, Y: y };
        const main = calculateModel(p, { modifiersAreStandardized: true });
        const upper = calculateModel(p, { modifiersAreStandardized: true, coefficients: upperCoeffs });
        expect(upper.Z).toBeGreaterThanOrEqual(main.Z - 1e-12);
      }
    }
  });

  it('upper and lower bounds bracket the main surface across coefficients', () => {
    // Use multiple coefficient perturbations mimicking a realistic CI
    const keys = ['c1', 'c2', 'c3', 'phi0'] as const;
    const lowerCoeffs: Record<string, number> = {};
    const upperCoeffs: Record<string, number> = {};

    for (const k of keys) {
      const base = k === 'phi0'
        ? OPTIMIZED_STRUCTURAL_PARAMS.phi0
        : (OPTIMIZED_SIGMOID_COEFFICIENTS as Record<string, number>)[k] ?? 0;
      lowerCoeffs[k] = base - 0.15;
      upperCoeffs[k] = base + 0.15;
    }

    const testPoints = [
      { X: 0.3, Y: 0.3 },
      { X: 0.5, Y: 0.5 },
      { X: 0.7, Y: 0.7 },
    ];

    for (const pt of testPoints) {
      const p = { ...baseParams, ...pt };
      const main = calculateModel(p, { modifiersAreStandardized: true });
      const lo = calculateModel(p, { modifiersAreStandardized: true, coefficients: lowerCoeffs });
      const hi = calculateModel(p, { modifiersAreStandardized: true, coefficients: upperCoeffs });

      // The wider coefficients should inflate Z, narrower should deflate
      // We check that lower <= main <= upper with tolerance
      expect(lo.Z).toBeLessThanOrEqual(main.Z + 1e-10);
      expect(hi.Z).toBeGreaterThanOrEqual(main.Z - 1e-10);
      // And the band has non-zero width
      expect(hi.Z - lo.Z).toBeGreaterThan(0);
    }
  });
});
