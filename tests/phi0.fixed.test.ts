import { describe, expect, it, expectTypeOf } from 'vitest';

import { calculateModel } from '../src/utils/calculateModel';
import { OPTIMIZED_STRUCTURAL_PARAMS } from '../src/data/feCoefficients';
import type { BeliefParameters } from '../src/types';

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

describe('phi0 baseline is fixed', () => {
  it('excludes phi0 from the public parameter shape', () => {
    type HasPhi0 = 'phi0' extends keyof BeliefParameters ? true : false;
    const hasPhi0: HasPhi0 = false as HasPhi0;
    expect(hasPhi0).toBe(false);
    expectTypeOf<BeliefParameters>().not.toMatchTypeOf<{ phi0: number }>();
  });

  it('ignores any attempted phi0 override and uses the fixed baseline', () => {
    const result = calculateModel(baseParams, { modifiersAreStandardized: true });
    const spoofed = calculateModel(
      {
        ...(baseParams as unknown as Record<string, unknown>),
        phi0: OPTIMIZED_STRUCTURAL_PARAMS.phi0 + 10,
      } as BeliefParameters,
      {
        modifiersAreStandardized: true,
      },
    );

    expect(result.phiComponents.baseline).toBeCloseTo(OPTIMIZED_STRUCTURAL_PARAMS.phi0, 10);
    expect(spoofed.phiComponents.baseline).toBeCloseTo(OPTIMIZED_STRUCTURAL_PARAMS.phi0, 10);
    expect(spoofed.Z).toBeCloseTo(result.Z, 10);
  });
});
