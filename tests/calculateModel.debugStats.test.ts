import { describe, expect, it } from 'vitest';

import { calculateModel, type PanelDatasetStats } from '../src/utils/calculateModel';
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

describe('calculateModel debug standardization stats', () => {
  it('omits X/Y stats when panelStats is not provided', () => {
    const result = calculateModel(baseParams, { modifiersAreStandardized: true, debug: true });
    const stats = result.debug?.standardizationStats;
    expect(stats?.dataset).toBeUndefined();
    expect(stats?.means?.X).toBeUndefined();
    expect(stats?.means?.Y).toBeUndefined();
  });

  it('includes provided dataset stats when panelStats is supplied', () => {
    const panelStats: PanelDatasetStats = {
      meanX: 0.42,
      stdX: 0.07,
      meanY: -0.1,
      stdY: 0.12,
      n: 3,
      source: 'test-dataset',
      method: 'sample',
    };

    const result = calculateModel(baseParams, {
      modifiersAreStandardized: true,
      debug: true,
      panelStats,
    });

    const stats = result.debug?.standardizationStats;
    expect(stats?.dataset).toEqual(panelStats);
    expect(stats?.means?.X).toBeCloseTo(panelStats.meanX, 10);
    expect(stats?.stds?.X).toBeCloseTo(panelStats.stdX, 10);
    expect(stats?.means?.Y).toBeCloseTo(panelStats.meanY, 10);
    expect(stats?.stds?.Y).toBeCloseTo(panelStats.stdY, 10);
  });
});
