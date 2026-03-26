export function formatNumeric(value: number, decimalPlaces: number): string {
  if (!Number.isFinite(value)) {
    return 'NaN';
  }
  const factor = 10 ** decimalPlaces;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return rounded.toFixed(decimalPlaces);
}

export const DEFAULT_TOLERANCES = {
  Z: { absolute: 0.01, relative: 0.015 },
  phi: { absolute: 0.001, relative: 0.001 },
  phiTotal: { absolute: 0.001, relative: 0.001 },
};
