export function computeMean(values: number[]): number {
  if (!values.length) return 0;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

/** Sample standard deviation (n-1 in denominator). Returns 0 when n < 2. */
export function computeSampleStd(values: number[], mean?: number): number {
  const n = values.length;
  if (n < 2) return 0;
  const mu = mean ?? computeMean(values);
  const variance = values.reduce((acc, v) => acc + Math.pow(v - mu, 2), 0) / (n - 1);
  return Math.sqrt(variance);
}

export function computeMeanAndSampleStd(values: number[]): { mean: number; std: number; n: number } {
  const mean = computeMean(values);
  const std = computeSampleStd(values, mean);
  return { mean, std, n: values.length };
}
