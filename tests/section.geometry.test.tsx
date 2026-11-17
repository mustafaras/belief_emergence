// @vitest-environment jsdom
import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PANEL_MEANS,
  applyCountryMeans,
  toBeliefParameters,
  WITHDRAWN_CHANNELS,
} from '../src/sections/geometry/useGeometryParams'
import { calculateModel } from '../src/utils/calculateModel'

/** The section itself pulls in Plotly through a lazy import; the pure parts are tested here. */
vi.mock('../src/sections/geometry/Surface3D', () => ({
  default: () => <div data-testid="surface-stand-in" />,
}))

describe('Geometry lab parameter contract', () => {
  afterEach(() => cleanup())

  it('sends every withdrawn channel to the model as zero', () => {
    // The prompt's requirement: C, D, G and S must reach `calculateModel` as 0, never as a
    // slider default. A slider for them would imply they are estimable.
    const params = toBeliefParameters(PANEL_MEANS)
    expect(params.C).toBe(0)
    expect(params.D).toBe(0)
    expect(params.G).toBe(0)
    expect(params.S).toBe(0)
    // And the four retained channels do carry the state.
    expect(params.X).toBe(PANEL_MEANS.X)
    expect(params.R).toBe(PANEL_MEANS.R)
  })

  it('holds exactly the four withdrawn channels with a reason each', () => {
    expect(WITHDRAWN_CHANNELS.map((channel) => channel.code)).toEqual(['C', 'D', 'G', 'S'])
    for (const channel of WITHDRAWN_CHANNELS) expect(channel.reason.length).toBeGreaterThan(10)
  })

  it('responds to a retained channel and is provably inert to every withdrawn one', () => {
    const base = calculateModel(toBeliefParameters(PANEL_MEANS) as never)

    const moved = calculateModel({ ...toBeliefParameters(PANEL_MEANS), E: PANEL_MEANS.E + 1 } as never)
    expect(moved.Z).not.toBeCloseTo(base.Z, 6)

    // Stronger than pinning the inputs at 0: their coefficients are 0, so feeding a non-zero
    // value through must leave the output bit-identical. That is what "structurally
    // unavailable" means, and it is the property a slider for those channels would violate.
    for (const [code, value] of [['C', 2.61], ['D', 1.5], ['G', 1], ['S', 1]] as const) {
      const injected = calculateModel({ ...toBeliefParameters(PANEL_MEANS), [code]: value } as never)
      expect(Math.abs(injected.Z - base.Z), `${code} must not reach the model`).toBeLessThan(1e-12)
    }
  })

  it('fills the controls from a country mean row', () => {
    const rows = [
      { iso3: 'EST', X: 0.7, Y: 2, M: 0.5, T: 0.1, E: 0.9, R: 0.4 },
      { iso3: 'EST', X: 0.9, Y: 4, M: 0.7, T: 0.3, E: 1.1, R: 0.6 },
      { iso3: 'ALB', X: 0.1, Y: -1, M: -0.5, T: 0, E: 0, R: 0 },
    ]
    const filled = applyCountryMeans('EST', rows as never)
    expect(filled).not.toBeNull()
    // The mean of the country's own rows, not the panel mean and not the first row.
    expect(filled?.X).toBeCloseTo(0.8, 6)
    expect(filled?.Y).toBeCloseTo(3, 6)
    expect(filled?.E).toBeCloseTo(1.0, 6)
  })

  it('returns null for a country with no rows rather than inventing values', () => {
    expect(applyCountryMeans('ZZZ', [{ iso3: 'ALB', X: 1 }] as never)).toBeNull()
  })
})
