import { describe, expect, it } from 'vitest'
import { buildEffectiveColorScale, isColorScaleName } from '../src/sections/geometry/engine/colorScale'

describe('surface color scale', () => {
  it('accepts only palettes supported by Plotly controls', () => {
    expect(isColorScaleName('Cividis')).toBe(true)
    expect(isColorScaleName('Custom')).toBe(true)
    expect(isColorScaleName('Rainbow')).toBe(false)
    expect(isColorScaleName(undefined)).toBe(false)
  })

  it('uses the selected named palette or preserves the custom three-stop scale', () => {
    expect(buildEffectiveColorScale('Viridis', '#111111', '#222222', '#333333')).toBe('Viridis')
    expect(buildEffectiveColorScale('Custom', '#111111', '#222222', '#333333')).toEqual([
      [0, '#111111'],
      [0.5, '#222222'],
      [1, '#333333'],
    ])
  })
})
