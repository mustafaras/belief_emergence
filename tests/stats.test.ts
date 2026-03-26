import { describe, expect, it } from 'vitest';

import { computeMean, computeSampleStd, computeMeanAndSampleStd } from '../src/utils/stats';

describe('stats helpers', () => {
  it('computes mean and sample std for a simple vector', () => {
    const values = [1, 2, 3];
    expect(computeMean(values)).toBe(2);
    expect(computeSampleStd(values)).toBeCloseTo(1, 10);
    const { mean, std, n } = computeMeanAndSampleStd(values);
    expect(mean).toBe(2);
    expect(std).toBeCloseTo(1, 10);
    expect(n).toBe(3);
  });

  it('handles empty vectors gracefully', () => {
    expect(computeMean([])).toBe(0);
    expect(computeSampleStd([])).toBe(0);
  });
});
