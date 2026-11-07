export const BIAS_DEFINITION_SENTENCE = 'Bias = mean(observed - predicted)';
export const BIAS_DEFINITION_PHRASE = 'mean(observed - predicted)';

export const METRIC_DEFINITIONS = {
  r2: 'r2 = 1 - (sum((obs - pred)^2) / sum((obs - mean(obs))^2)) using clamped Z',
  corr: 'corr = Pearson correlation(obs, pred) using clamped Z',
  mae: 'mae = mean(|obs - pred|)',
  rmse: 'rmse = sqrt(mean((obs - pred)^2))',
  bias: 'bias = mean(obs - pred)',
} as const;

export function computeBias(observed: number[], predicted: number[]): number {
  const n = Math.min(observed.length, predicted.length);
  let sum = 0;
  let count = 0;

  for (let i = 0; i < n; i += 1) {
    const obs = observed[i];
    const pred = predicted[i];
    if (!Number.isFinite(obs) || !Number.isFinite(pred)) continue;
    sum += obs - pred;
    count += 1;
  }

  return count ? sum / count : NaN;
}

export function computeMAE(observed: number[], predicted: number[]): number {
  const n = Math.min(observed.length, predicted.length);
  let sum = 0;
  let count = 0;

  for (let i = 0; i < n; i += 1) {
    const obs = observed[i];
    const pred = predicted[i];
    if (!Number.isFinite(obs) || !Number.isFinite(pred)) continue;
    sum += Math.abs(obs - pred);
    count += 1;
  }

  return count ? sum / count : NaN;
}

export function computeRMSE(observed: number[], predicted: number[]): number {
  const n = Math.min(observed.length, predicted.length);
  let sumSq = 0;
  let count = 0;

  for (let i = 0; i < n; i += 1) {
    const obs = observed[i];
    const pred = predicted[i];
    if (!Number.isFinite(obs) || !Number.isFinite(pred)) continue;
    const diff = obs - pred;
    sumSq += diff * diff;
    count += 1;
  }

  return count ? Math.sqrt(sumSq / count) : NaN;
}

export function computeR2(observed: number[], predicted: number[]): number {
  const n = Math.min(observed.length, predicted.length);
  const paired: Array<{ obs: number; pred: number }> = [];
  for (let i = 0; i < n; i += 1) {
    const obs = observed[i];
    const pred = predicted[i];
    if (!Number.isFinite(obs) || !Number.isFinite(pred)) continue;
    paired.push({ obs, pred });
  }
  // R2 is not meaningful for fewer than three pairs. With one observation the
  // total sum of squares is exactly zero and the ratio is a division artefact;
  // with two observations the residual degrees of freedom are zero, so the
  // value is dominated by whichever point happens to sit closer to the mean and
  // can reach -3135 (observed on the country_out:CZE fold). Reporting NaN keeps
  // the aggregate median honest instead of letting four degenerate folds define
  // it.
  if (paired.length < 3) return NaN;
  const meanObs = paired.reduce((acc, v) => acc + v.obs, 0) / paired.length;
  let ssTot = 0;
  let ssRes = 0;
  for (const { obs, pred } of paired) {
    const diff = obs - pred;
    ssRes += diff * diff;
    const tot = obs - meanObs;
    ssTot += tot * tot;
  }
  return ssTot === 0 ? NaN : 1 - ssRes / ssTot;
}

export function computePearsonCorr(observed: number[], predicted: number[]): number {
  const n = Math.min(observed.length, predicted.length);
  const paired: Array<{ obs: number; pred: number }> = [];
  for (let i = 0; i < n; i += 1) {
    const obs = observed[i];
    const pred = predicted[i];
    if (!Number.isFinite(obs) || !Number.isFinite(pred)) continue;
    paired.push({ obs, pred });
  }
  const m = paired.length;
  if (m === 0) return NaN;
  const meanObs = paired.reduce((acc, v) => acc + v.obs, 0) / m;
  const meanPred = paired.reduce((acc, v) => acc + v.pred, 0) / m;
  let num = 0;
  let denomObs = 0;
  let denomPred = 0;
  for (const { obs, pred } of paired) {
    const dObs = obs - meanObs;
    const dPred = pred - meanPred;
    num += dObs * dPred;
    denomObs += dObs * dObs;
    denomPred += dPred * dPred;
  }
  const denom = Math.sqrt(denomObs * denomPred);
  return denom === 0 ? NaN : num / denom;
}
