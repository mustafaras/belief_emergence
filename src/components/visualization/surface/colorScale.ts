export type ColorScaleName = 'Cividis' | 'Viridis' | 'Magma' | 'YlGnBu' | 'RdBu' | 'Custom'
export type EffectiveColorScale = ColorScaleName | Array<[number, string]>

export function isColorScaleName(value: unknown): value is ColorScaleName {
  return (
    value === 'Cividis' ||
    value === 'Viridis' ||
    value === 'Magma' ||
    value === 'YlGnBu' ||
    value === 'RdBu' ||
    value === 'Custom'
  )
}

export function readColorHex(varName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
    // <input type="color"> expects #RRGGBB; tokens in this repo are hex.
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw
  } catch {
    // ignore
  }
  return fallback
}

export function buildEffectiveColorScale(
  colorScale: ColorScaleName,
  customLow: string,
  customMid: string,
  customHigh: string,
): EffectiveColorScale {
  if (colorScale !== 'Custom') return colorScale
  return [
    [0, customLow],
    [0.5, customMid],
    [1, customHigh],
  ]
}
